import csv
import hashlib
import io
import logging
from datetime import date, timedelta
from decimal import Decimal
from datetime import datetime
# pyrefly: ignore [missing-import]
from rest_framework import status, generics
# pyrefly: ignore [missing-import]
from rest_framework.views import APIView
# pyrefly: ignore [missing-import]
from rest_framework.response import Response
# pyrefly: ignore [missing-import]
from rest_framework.permissions import IsAuthenticated
# pyrefly: ignore [missing-import]
from rest_framework.parsers import MultiPartParser
# pyrefly: ignore [missing-import]
from rest_framework.pagination import PageNumberPagination
# pyrefly: ignore [missing-import]
from rest_framework.exceptions import ValidationError
# pyrefly: ignore [missing-import]
from django.db.models import Sum, Count
# pyrefly: ignore [missing-import]
from django.utils import timezone

from .models import Transaction, UserAnalytics
from .serializers import TransactionSerializer

logger = logging.getLogger(__name__)

# Max age (in seconds) before the UserAnalytics cache is considered stale
ANALYTICS_CACHE_TTL_SECONDS = 300  # 5 minutes


def _make_transaction_hash(user_id: int, date_obj, amount: Decimal, description: str, category: str) -> str:
    """Return a deterministic SHA-256 hex digest for a transaction row."""
    raw = f"{user_id}|{date_obj}|{amount}|{(description or '').strip().lower()}|{(category or '').strip().lower()}"
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


class TransactionPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


class TransactionListCreateView(generics.ListCreateAPIView):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = TransactionPagination

    def get_queryset(self):
        queryset = Transaction.objects.filter(user=self.request.user)

        # Filter by category (case-insensitive query matches)
        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category__iexact=category.strip())

        # Filter by date range
        date_after = self.request.query_params.get('date_after')
        if date_after:
            try:
                parsed_date = datetime.strptime(date_after.strip(), '%Y-%m-%d').date()
                queryset = queryset.filter(date__gte=parsed_date)
            except ValueError:
                raise ValidationError({"date_after": "Invalid date format. Use YYYY-MM-DD."})

        date_before = self.request.query_params.get('date_before')
        if date_before:
            try:
                parsed_date = datetime.strptime(date_before.strip(), '%Y-%m-%d').date()
                queryset = queryset.filter(date__lte=parsed_date)
            except ValueError:
                raise ValidationError({"date_before": "Invalid date format. Use YYYY-MM-DD."})

        return queryset

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class TransactionCSVUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request, *args, **kwargs):
        file = request.FILES.get('file')
        if not file:
            logger.warning(f"[DEBUG LOG] CSV upload attempted with no file key by user={request.user.username}")
            return Response({'error': 'No file uploaded under key "file"'}, status=status.HTTP_400_BAD_REQUEST)

        # ── Import mode ────────────────────────────────────────────────────────
        # replace_existing=true  → delete all existing user transactions first
        # replace_existing=false → append only (default)
        replace_existing_raw = request.data.get('replace_existing', 'false')
        replace_existing = str(replace_existing_raw).strip().lower() == 'true'

        try:
            decoded_file = file.read().decode('utf-8-sig')
            io_string = io.StringIO(decoded_file)
            reader = csv.DictReader(io_string)
        except Exception as e:
            logger.error(f"[API ERROR] CSV parsing failed for user={request.user.username}: {str(e)}", exc_info=True)
            return Response({'error': f'Failed to parse CSV file: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

        # Ensure headers are present
        if not reader.fieldnames:
            logger.warning(f"[DEBUG LOG] CSV upload missing headers by user={request.user.username}")
            return Response({'error': 'CSV file is empty or missing headers.'}, status=status.HTTP_400_BAD_REQUEST)

        # Normalize field names to lowercase
        headers = [h.lower().strip() if h else '' for h in reader.fieldnames]
        if 'date' not in headers or 'amount' not in headers or 'category' not in headers:
            logger.warning(f"[DEBUG LOG] CSV upload missing required headers by user={request.user.username}. Headers found: {headers}")
            return Response(
                {'error': 'CSV must contain "date", "amount", and "category" headers.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # ── Parse rows ────────────────────────────────────────────────────────
        transactions_to_create = []
        errors = []

        for index, row in enumerate(reader):
            row_num = index + 1
            # Normalize row keys
            row = {k.lower().strip() if k else '': v for k, v in row.items()}

            date_str = row.get('date', '').strip()
            amount_str = row.get('amount', '').strip()
            category = row.get('category', '').strip()
            description = row.get('description', '').strip() if 'description' in row else ''

            if not date_str or not amount_str or not category:
                errors.append(f"Row {row_num}: Missing required columns ('date', 'amount', or 'category')")
                continue

            # Validate date format
            try:
                date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
            except ValueError:
                errors.append(f"Row {row_num}: Invalid date format '{date_str}'. Expected YYYY-MM-DD.")
                continue

            # Validate amount decimal
            try:
                amount_dec = Decimal(amount_str)
            except Exception:
                errors.append(f"Row {row_num}: Invalid decimal amount '{amount_str}'.")
                continue

            tx_hash = _make_transaction_hash(
                request.user.id, date_obj, amount_dec, description, category
            )

            transactions_to_create.append(Transaction(
                user=request.user,
                date=date_obj,
                amount=amount_dec,
                category=category,
                description=description,
                transaction_hash=tx_hash,
            ))

        if errors:
            logger.warning(f"[DEBUG LOG] CSV validation errors for user={request.user.username}: {errors}")
            return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

        if not transactions_to_create:
            logger.warning(f"[DEBUG LOG] CSV uploaded contains no transactions for user={request.user.username}")
            return Response({'error': 'No transactions found in CSV file to import.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # ── Replace mode: delete existing transactions first ───────────────
            deleted_count = 0
            if replace_existing:
                deleted_count, _ = Transaction.objects.filter(user=request.user).delete()
                logger.info(
                    f"[DEBUG LOG] Replace mode: deleted {deleted_count} existing transactions "
                    f"for user={request.user.username}"
                )

            # ── Duplicate detection (Append mode / partial replace) ───────────
            # Collect hashes of rows we're about to insert
            incoming_hashes = [t.transaction_hash for t in transactions_to_create if t.transaction_hash]

            if incoming_hashes:
                existing_hashes = set(
                    Transaction.objects.filter(
                        user=request.user,
                        transaction_hash__in=incoming_hashes,
                    ).values_list('transaction_hash', flat=True)
                )
            else:
                existing_hashes = set()

            # Filter out duplicates
            unique_transactions = [
                t for t in transactions_to_create
                if t.transaction_hash not in existing_hashes
            ]
            duplicate_count = len(transactions_to_create) - len(unique_transactions)

            # ── Bulk insert ───────────────────────────────────────────────────
            Transaction.objects.bulk_create(unique_transactions)

            # ── Enqueue analytics pipeline ────────────────────────────────────
            from transactions.tasks import recompute_analytics, run_anomaly_detection, generate_forecast
            recompute_analytics.delay(request.user.id)
            run_anomaly_detection.delay(request.user.id)
            generate_forecast.delay(request.user.id)

            logger.info(
                f"[DEBUG LOG] TransactionCSVUploadView: Imported {len(unique_transactions)} transactions "
                f"(skipped {duplicate_count} duplicates, deleted {deleted_count} old) "
                f"and enqueued analytics pipeline for user={request.user.username}"
            )
        except Exception as e:
            logger.error(f"[API ERROR] Database write or task enqueue failed for user={request.user.username}: {str(e)}", exc_info=True)
            return Response({'error': f'Database write failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        msg = f'Successfully imported {len(unique_transactions)} transactions'
        if duplicate_count:
            msg += f' ({duplicate_count} duplicates skipped)'
        if replace_existing:
            msg += f' — replaced {deleted_count} existing records'

        return Response({'message': msg}, status=status.HTTP_201_CREATED)


class TransactionStatsView(APIView):
    permission_classes = [IsAuthenticated]

    # Maps the ?period= param to a date range
    PERIOD_FILTERS = {
        'all': None,
        '30d': lambda: date.today() - timedelta(days=30),
        'this_month': lambda: date.today().replace(day=1),
        'this_year': lambda: date.today().replace(month=1, day=1),
    }

    def get(self, request, *args, **kwargs):
        period = request.query_params.get('period', 'all').lower().strip()
        if period not in self.PERIOD_FILTERS:
            period = 'all'

        try:
            base_qs = Transaction.objects.filter(user=request.user)

            # Apply date filter if not "all"
            date_cutoff_fn = self.PERIOD_FILTERS[period]
            if date_cutoff_fn is not None:
                base_qs = base_qs.filter(date__gte=date_cutoff_fn())

            # ── Try UserAnalytics cache for "all" period only ──────────────────
            # The cache is always all-time; don't use it for filtered periods.
            cache_hit = False
            if period == 'all':
                try:
                    cache = UserAnalytics.objects.get(user=request.user)
                    cache_age = (timezone.now() - cache.updated_at).total_seconds()
                    if cache_age <= ANALYTICS_CACHE_TTL_SECONDS:
                        logger.info(
                            f"[DEBUG LOG] TransactionStatsView: Cache HIT for user={request.user.username} "
                            f"(age={cache_age:.0f}s)"
                        )
                        return Response({
                            "total_spent": float(cache.total_spent),
                            "top_category": cache.top_category,
                            "anomalies_count": Transaction.objects.filter(
                                user=request.user, is_anomaly=True
                            ).count(),
                            "transaction_count": cache.transaction_count,
                            "period": period,
                            "cache_hit": True,
                        }, status=status.HTTP_200_OK)
                except UserAnalytics.DoesNotExist:
                    pass  # No cache yet — fall through to live query

            # ── Live aggregation ───────────────────────────────────────────────
            agg = base_qs.aggregate(total=Sum("amount"), count=Count("id"))
            total_spent = agg["total"] or 0
            transaction_count = agg["count"] or 0

            top_category_query = (
                base_qs
                .values("category")
                .annotate(total=Sum("amount"))
                .order_by("-total")
                .first()
            )
            top_category = top_category_query["category"] if top_category_query else "N/A"
            top_category = top_category or "N/A"

            anomalies_count = Transaction.objects.filter(
                user=request.user, is_anomaly=True
            ).count()

            logger.info(
                f"[DEBUG LOG] TransactionStatsView: LIVE query for user={request.user.username}, "
                f"period={period}, count={transaction_count}, total_spent={total_spent}, "
                f"top_category='{top_category}'"
            )

            return Response({
                "total_spent": float(total_spent),
                "top_category": top_category,
                "anomalies_count": anomalies_count,
                "transaction_count": transaction_count,
                "period": period,
                "cache_hit": False,
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"[API ERROR] TransactionStatsView failed: {str(e)}", exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
