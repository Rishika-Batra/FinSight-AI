import logging
from datetime import timedelta
from decimal import Decimal

import requests
# pyrefly: ignore [missing-import]
from celery import shared_task
# pyrefly: ignore [missing-import]
from django.conf import settings
# pyrefly: ignore [missing-import]
from django.utils import timezone

logger = logging.getLogger(__name__)

ML_SERVICE_URL = settings.ML_SERVICE_URL


@shared_task(bind=True, max_retries=3, default_retry_delay=30, ignore_result=True)
def classify_transaction(self, transaction_id):
    """
    Fetches a Transaction, calls the ml_service /classify endpoint with its
    description and amount, then saves the returned category back to the model.
    """
    from transactions.models import Transaction

    try:
        transaction = Transaction.objects.get(pk=transaction_id)
    except Transaction.DoesNotExist:
        logger.error(f"classify_transaction: Transaction {transaction_id} not found.")
        return

    description = transaction.description or transaction.category or ""
    if not description.strip():
        logger.warning(f"classify_transaction: Transaction {transaction_id} has no description, skipping.")
        return

    payload = [{"description": description, "amount": float(transaction.amount)}]

    try:
        response = requests.post(
            f"{ML_SERVICE_URL}/classify/",
            json=payload,
            timeout=10
        )
        response.raise_for_status()
        results = response.json()
        if results:
            predicted_category = results[0].get("predicted_category", "Other")
            Transaction.objects.filter(pk=transaction_id).update(category=predicted_category)
            logger.info(f"classify_transaction: Transaction {transaction_id} classified as '{predicted_category}'.")
    except requests.RequestException as exc:
        logger.warning(f"classify_transaction: ML service unavailable — {exc}. Retrying...")
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60, ignore_result=True)
def run_anomaly_detection(self, user_id):
    """
    Fetches ALL transactions for a user, calls the ml_service /anomaly endpoint,
    and bulk-updates the is_anomaly field on each record.
    The IsolationForest model scores transactions in batch (O(n) after training),
    so there is no reason to cap the number of records processed.
    """
    from transactions.models import Transaction

    transactions = list(
        Transaction.objects.filter(user_id=user_id)
        .order_by('-date', '-created_at')
    )

    if not transactions:
        logger.info(f"run_anomaly_detection: No transactions found for user {user_id}.")
        return

    payload = [
        {
            "amount": float(t.amount),
            "date": str(t.date),
            "category": t.category or "Other",
        }
        for t in transactions
    ]

    try:
        response = requests.post(
            f"{ML_SERVICE_URL}/anomaly/",
            json=payload,
            timeout=30
        )
        response.raise_for_status()
        results = response.json()
    except requests.RequestException as exc:
        logger.warning(f"run_anomaly_detection: ML service unavailable — {exc}. Retrying...")
        raise self.retry(exc=exc)

    # Pair result with transaction objects and bulk update
    updates = []
    for t, result in zip(transactions, results):
        t.is_anomaly = result.get("is_anomaly", False)
        updates.append(t)

    if updates:
        Transaction.objects.bulk_update(updates, ['is_anomaly'])
        num_anomalies = sum(1 for t in updates if t.is_anomaly)
        logger.info(
            f"run_anomaly_detection: Processed {len(updates)} transactions for user {user_id}. "
            f"Anomalies found: {num_anomalies}."
        )


@shared_task(bind=True, max_retries=3, default_retry_delay=60, ignore_result=True)
def generate_forecast(self, user_id):
    """
    Aggregates the last 90 days of daily net balances for a user, calls the
    ml_service /forecast endpoint, and saves a new ForecastSnapshot.
    """
    from transactions.models import Transaction
    from forecasts.models import ForecastSnapshot
    # pyrefly: ignore [missing-import]
    from django.db.models import Sum
    # pyrefly: ignore [missing-import]
    from django.db.models.functions import TruncDate

    # 1. First check how many unique days of transaction data exist for the user regardless of date range
    unique_days = Transaction.objects.filter(user_id=user_id).values('date').distinct().count()
    if unique_days < 30:
        err_msg = f"Fewer than 30 unique days of transaction data exist total ({unique_days} found)."
        logger.error(f"generate_forecast: {err_msg}")
        raise ValueError(err_msg)

    # 2. Get the latest transaction date to define the historical 90-day window
    latest_tx = Transaction.objects.filter(user_id=user_id).order_by('-date').first()
    if not latest_tx:
        err_msg = f"No transactions found for user {user_id}."
        logger.error(f"generate_forecast: {err_msg}")
        raise ValueError(err_msg)

    latest_date = latest_tx.date
    cutoff_date = latest_date - timedelta(days=90)

    # Aggregate daily spending (total expenditure) within the 90-day window, excluding Salary
    daily_balances = (
        Transaction.objects
        .filter(user_id=user_id, date__gte=cutoff_date, date__lte=latest_date)
        .exclude(category__iexact='Salary')
        .values('date')
        .annotate(net=Sum('amount'))
        .order_by('date')
    )

    data_points = [
        {"ds": str(row['date']), "y": float(row['net'])}
        for row in daily_balances
        if row['net'] is not None and float(row['net']) > 0  # only positive spending days
    ]

    if len(data_points) < 30:
        logger.warning(
            f"generate_forecast: Only {len(data_points)} daily spending data points found in the last 90 days "
            f"for user {user_id} (need at least 30). Skipping forecast generation."
        )
        return

    try:
        response = requests.post(
            f"{ML_SERVICE_URL}/forecast/",
            json={"data": data_points},
            timeout=60  # Prophet fitting can take a few seconds
        )
        response.raise_for_status()
        forecast_data = response.json()
    except requests.RequestException as exc:
        logger.warning(f"generate_forecast: ML service unavailable — {exc}. Retrying...")
        raise self.retry(exc=exc)

    # Persist the forecast result as a new ForecastSnapshot
    ForecastSnapshot.objects.create(
        user_id=user_id,
        forecast_data=forecast_data
    )
    num_points = len(forecast_data.get("forecast", []))
    logger.info(
        f"generate_forecast: Saved ForecastSnapshot for user {user_id} "
        f"with {num_points} forecast data points."
    )


# ── Celery Beat scheduled wrappers ──────────────────────────────────────────

@shared_task
def run_anomaly_detection_for_all_users():
    """
    Celery Beat entry-point: fans out run_anomaly_detection for every active
    user who has at least one transaction.  Designed to run once every 24 h.
    """
    # pyrefly: ignore [missing-import]
    from django.contrib.auth.models import User
    from transactions.models import Transaction

    active_user_ids = (
        Transaction.objects
        .values_list('user_id', flat=True)
        .distinct()
    )

    count = 0
    for user_id in active_user_ids:
        if User.objects.filter(pk=user_id, is_active=True).exists():
            run_anomaly_detection.delay(user_id)
            count += 1

    logger.info(
        f"run_anomaly_detection_for_all_users: Enqueued anomaly detection "
        f"for {count} active user(s)."
    )


@shared_task
def generate_forecast_for_all_users():
    """
    Celery Beat entry-point: fans out generate_forecast for every active user
    who has at least one transaction.  Designed to run once every 24 h.
    """
    # pyrefly: ignore [missing-import]
    from django.contrib.auth.models import User
    from transactions.models import Transaction

    active_user_ids = (
        Transaction.objects
        .values_list('user_id', flat=True)
        .distinct()
    )

    count = 0
    for user_id in active_user_ids:
        if User.objects.filter(pk=user_id, is_active=True).exists():
            generate_forecast.delay(user_id)
            count += 1

    logger.info(
        f"generate_forecast_for_all_users: Enqueued forecast generation "
        f"for {count} active user(s)."
    )
