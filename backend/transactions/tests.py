import io
# pyrefly: ignore [missing-import]
from django.urls import reverse
# pyrefly: ignore [missing-import]
from django.contrib.auth.models import User
# pyrefly: ignore [missing-import]
from rest_framework import status
# pyrefly: ignore [missing-import]
from rest_framework.test import APITestCase
from unittest.mock import patch, MagicMock
import requests

from .models import Transaction
from forecasts.models import ForecastSnapshot
from .tasks import classify_transaction, run_anomaly_detection, generate_forecast

class TransactionTests(APITestCase):
    def setUp(self):
        # Mock Celery delay to avoid hitting Redis or real ML service during API tests
        self.classify_patcher = patch('transactions.tasks.classify_transaction.delay')
        self.mock_classify_delay = self.classify_patcher.start()

        self.user = User.objects.create_user(username='testuser', email='test@example.com', password='password')
        self.client.force_authenticate(user=self.user)
        
        self.list_create_url = reverse('transaction_list_create')
        self.upload_url = reverse('transaction_csv_upload')
        
        # Pre-create some transactions for list/filter testing
        self.t1 = Transaction.objects.create(
            user=self.user,
            date='2026-06-01',
            amount='150.00',
            category='Food',
            description='Lunch'
        )
        self.t2 = Transaction.objects.create(
            user=self.user,
            date='2026-06-10',
            amount='2000.00',
            category='Rent',
            description='June Rent'
        )
        # Reset mock to isolate setUp creation calls from test-specific calls
        self.mock_classify_delay.reset_mock()

    def tearDown(self):
        self.classify_patcher.stop()

    def test_list_transactions_authenticated(self):
        response = self.client.get(self.list_create_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)
        self.assertEqual(len(response.data['results']), 2)

    def test_list_transactions_unauthenticated(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.list_create_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_filter_transactions_by_category(self):
        response = self.client.get(self.list_create_url, {'category': 'food'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['category'], 'Food')

    def test_filter_transactions_by_date_range(self):
        response = self.client.get(self.list_create_url, {'date_after': '2026-06-05'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], self.t2.id)

        response = self.client.get(self.list_create_url, {'date_before': '2026-06-05'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], self.t1.id)

    def test_create_transaction_success(self):
        data = {
            'date': '2026-06-11',
            'amount': '45.50',
            'category': 'Transport',
            'description': 'Taxi ride'
        }
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Transaction.objects.filter(user=self.user).count(), 3)
        self.assertEqual(response.data['category'], 'Transport')
        # Check signal fired exactly once for the new transaction
        self.mock_classify_delay.assert_called_once()

    def test_csv_upload_success(self):
        csv_content = (
            "date,amount,category,description\n"
            "2026-06-02,50.00,Food,Dinner\n"
            "2026-06-03,120.50,Utilities,Electricity\n"
        )
        csv_file = io.BytesIO(csv_content.encode('utf-8'))
        csv_file.name = 'transactions.csv'
        
        response = self.client.post(self.upload_url, {'file': csv_file}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('Successfully uploaded and created 2 transactions', response.data['message'])
        self.assertEqual(Transaction.objects.filter(user=self.user).count(), 4)
        # bulk_create does not fire signals, so call count remains 0 after reset in setUp
        self.assertEqual(self.mock_classify_delay.call_count, 0)

    def test_csv_upload_validation_errors(self):
        csv_content = (
            "date,amount,category,description\n"
            "invalid-date,50.00,Food,Dinner\n"
            "2026-06-03,not-a-decimal,Utilities,Electricity\n"
        )
        csv_file = io.BytesIO(csv_content.encode('utf-8'))
        csv_file.name = 'transactions.csv'
        
        response = self.client.post(self.upload_url, {'file': csv_file}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('errors', response.data)
        self.assertEqual(len(response.data['errors']), 2)


class CeleryTaskTests(APITestCase):
    def setUp(self):
        # Mock Celery delay to avoid hitting Redis or real ML service during API tests
        self.classify_patcher = patch('transactions.tasks.classify_transaction.delay')
        self.mock_classify_delay = self.classify_patcher.start()
        self.user = User.objects.create_user(username='taskuser', email='taskuser@example.com', password='password')

    def tearDown(self):
        self.classify_patcher.stop()

    @patch('requests.post')
    def test_classify_transaction_success(self, mock_post):
        # Create a transaction with no category
        transaction = Transaction.objects.create(
            user=self.user,
            date='2026-06-12',
            amount='75.50',
            category='',
            description='Target Store Purchase'
        )
        
        # Setup mock response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {
                "description": "Target Store Purchase",
                "predicted_category": "Shopping",
                "confidence": 0.92
            }
        ]
        mock_post.return_value = mock_response

        # Execute Celery task synchronously
        classify_transaction(transaction.id)

        # Verify DB update
        transaction.refresh_from_db()
        self.assertEqual(transaction.category, 'Shopping')

        # Verify request details
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        self.assertIn('/classify/', args[0])
        self.assertEqual(kwargs['json'], [{"description": "Target Store Purchase", "amount": 75.5}])

    @patch('requests.post')
    def test_run_anomaly_detection_success(self, mock_post):
        # Create a few transactions
        for i in range(5):
            Transaction.objects.create(
                user=self.user,
                date=f'2026-06-0{i+1}',
                amount=f'{10.00 * (i+1)}',
                category='Food',
                description=f'Dinner {i}'
            )

        # Mock anomaly service response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {"amount": 10.0, "date": "2026-06-01", "category": "Food", "is_anomaly": False, "anomaly_score": -0.1},
            {"amount": 20.0, "date": "2026-06-02", "category": "Food", "is_anomaly": False, "anomaly_score": -0.05},
            {"amount": 30.0, "date": "2026-06-03", "category": "Food", "is_anomaly": True, "anomaly_score": 0.15},
            {"amount": 40.0, "date": "2026-06-04", "category": "Food", "is_anomaly": False, "anomaly_score": -0.02},
            {"amount": 50.0, "date": "2026-06-05", "category": "Food", "is_anomaly": False, "anomaly_score": -0.01},
        ]
        mock_post.return_value = mock_response

        # Execute Celery task
        run_anomaly_detection(self.user.id)

        # Verify bulk updates on Transaction objects
        txs = Transaction.objects.filter(user=self.user).order_by('date')
        self.assertFalse(txs[0].is_anomaly)
        self.assertFalse(txs[1].is_anomaly)
        self.assertTrue(txs[2].is_anomaly)  # Third one marked as anomaly
        self.assertFalse(txs[3].is_anomaly)
        self.assertFalse(txs[4].is_anomaly)

    @patch('requests.post')
    def test_generate_forecast_insufficient_data(self, mock_post):
        # Create 10 transactions (less than 30 needed)
        for i in range(10):
            Transaction.objects.create(
                user=self.user,
                date=f'2026-06-01',
                amount='50.00',
                category='Food',
                description='Snack'
            )

        # Run task
        generate_forecast(self.user.id)

        # Should not make POST requests
        mock_post.assert_not_called()
        self.assertEqual(ForecastSnapshot.objects.filter(user=self.user).count(), 0)

    @patch('requests.post')
    def test_generate_forecast_success(self, mock_post):
        import datetime
        # Create 35 daily transactions (more than 30 needed) to form daily net balances
        start_date = datetime.date(2026, 5, 1)
        for i in range(35):
            date_str = str(start_date + datetime.timedelta(days=i))
            Transaction.objects.create(
                user=self.user,
                date=date_str,
                amount='100.00',
                category='Salary',
                description='Daily Earnings'
            )

        # Mock Prophet forecast response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "forecast": [
                {"date": "2026-06-05", "predicted_balance": 3500.0, "lower": 3400.0, "upper": 3600.0}
            ]
        }
        mock_post.return_value = mock_response

        # Execute Celery task
        generate_forecast(self.user.id)

        # Verify ForecastSnapshot is created
        snapshots = ForecastSnapshot.objects.filter(user=self.user)
        self.assertEqual(snapshots.count(), 1)
        self.assertEqual(snapshots[0].forecast_data['forecast'][0]['predicted_balance'], 3500.0)


class ScheduledWrapperTaskTests(APITestCase):
    """Unit tests for the Celery Beat wrapper tasks that fan out to per-user ML tasks."""

    def setUp(self):
        from datetime import date
        # Mock Celery delay to avoid hitting Redis during setup
        self.classify_patcher = patch('transactions.tasks.classify_transaction.delay')
        self.mock_classify_delay = self.classify_patcher.start()

        # Active user with transactions
        self.active_user = User.objects.create_user(
            username='active_user', email='active@example.com', password='password'
        )
        Transaction.objects.create(
            user=self.active_user,
            description='Grocery run',
            amount='50.00',
            date=date(2026, 6, 1),
            category='Food',
        )

        # Inactive user with transactions (should be skipped)
        self.inactive_user = User.objects.create_user(
            username='inactive_user', email='inactive@example.com', password='password',
            is_active=False,
        )
        Transaction.objects.create(
            user=self.inactive_user,
            description='Old charge',
            amount='10.00',
            date=date(2026, 6, 1),
            category='Other',
        )

        # User with no transactions (should be skipped)
        self.no_tx_user = User.objects.create_user(
            username='no_tx_user', email='notx@example.com', password='password'
        )

    def tearDown(self):
        self.classify_patcher.stop()

    @patch('transactions.tasks.run_anomaly_detection')
    def test_anomaly_wrapper_fans_out_only_to_active_users_with_transactions(
        self, mock_run_anomaly
    ):
        from transactions.tasks import run_anomaly_detection_for_all_users
        run_anomaly_detection_for_all_users()

        # Only the active_user has transactions; inactive_user skipped; no_tx_user has no transactions
        mock_run_anomaly.delay.assert_called_once_with(self.active_user.id)

    @patch('transactions.tasks.generate_forecast')
    def test_forecast_wrapper_fans_out_only_to_active_users_with_transactions(
        self, mock_gen_forecast
    ):
        from transactions.tasks import generate_forecast_for_all_users
        generate_forecast_for_all_users()

        mock_gen_forecast.delay.assert_called_once_with(self.active_user.id)

    @patch('transactions.tasks.run_anomaly_detection')
    def test_anomaly_wrapper_no_op_when_no_transactions_exist(self, mock_run_anomaly):
        """When no transactions exist at all, no per-user tasks should be enqueued."""
        from transactions.tasks import run_anomaly_detection_for_all_users
        Transaction.objects.all().delete()

        run_anomaly_detection_for_all_users()
        mock_run_anomaly.delay.assert_not_called()

    @patch('transactions.tasks.generate_forecast')
    def test_forecast_wrapper_no_op_when_no_transactions_exist(self, mock_gen_forecast):
        from transactions.tasks import generate_forecast_for_all_users
        Transaction.objects.all().delete()

        generate_forecast_for_all_users()
        mock_gen_forecast.delay.assert_not_called()

