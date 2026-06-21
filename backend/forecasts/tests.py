# pyrefly: ignore [missing-import]
from django.urls import reverse
# pyrefly: ignore [missing-import]
from django.contrib.auth.models import User
# pyrefly: ignore [missing-import]
from rest_framework import status
# pyrefly: ignore [missing-import]
from rest_framework.test import APITestCase
from unittest.mock import patch
from .models import ForecastSnapshot

class ForecastTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', email='test@example.com', password='password')
        self.client.force_authenticate(user=self.user)
        self.latest_url = reverse('latest_forecast')
        self.generate_url = reverse('generate_forecast')

    def test_get_latest_forecast_none_exists(self):
        response = self.client.get(self.latest_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_get_latest_forecast_success(self):
        # Create two snapshots
        ForecastSnapshot.objects.create(
            user=self.user,
            forecast_data={'predictions': [100.0, 105.0]}
        )
        snapshot2 = ForecastSnapshot.objects.create(
            user=self.user,
            forecast_data={'predictions': [200.0, 205.0]}
        )

        response = self.client.get(self.latest_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should return the most recent one (snapshot2)
        self.assertEqual(response.data['forecast_data']['predictions'], [200.0, 205.0])
        self.assertEqual(response.data['id'], snapshot2.id)

    def test_get_latest_forecast_unauthenticated(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.latest_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch('forecasts.views.run_anomaly_detection')
    @patch('forecasts.views.generate_forecast')
    def test_generate_forecast_success(self, mock_gen_forecast, mock_run_anomaly):
        """POST /api/forecasts/generate/ enqueues both tasks and returns 202."""
        response = self.client.post(self.generate_url)

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertIn('message', response.data)

        # Verify both Celery tasks were enqueued with the user's ID
        mock_run_anomaly.delay.assert_called_once_with(self.user.id)
        mock_gen_forecast.delay.assert_called_once_with(self.user.id)

    @patch('forecasts.views.run_anomaly_detection')
    @patch('forecasts.views.generate_forecast')
    def test_generate_forecast_unauthenticated(self, mock_gen_forecast, mock_run_anomaly):
        """POST /api/forecasts/generate/ without auth returns 401 and does not enqueue tasks."""
        self.client.force_authenticate(user=None)
        response = self.client.post(self.generate_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        mock_run_anomaly.delay.assert_not_called()
        mock_gen_forecast.delay.assert_not_called()

    @patch('forecasts.views.run_anomaly_detection')
    @patch('forecasts.views.generate_forecast')
    def test_generate_forecast_does_not_accept_get(self, mock_gen_forecast, mock_run_anomaly):
        """GET on /api/forecasts/generate/ returns 405 Method Not Allowed."""
        response = self.client.get(self.generate_url)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        mock_run_anomaly.delay.assert_not_called()
        mock_gen_forecast.delay.assert_not_called()

    @patch('forecasts.views.run_anomaly_detection')
    @patch('forecasts.views.generate_forecast')
    @patch.dict('os.environ', {'CELERY_TASK_ALWAYS_EAGER': 'True'})
    def test_generate_forecast_success_always_eager(self, mock_gen_forecast, mock_run_anomaly):
        """POST /api/forecasts/generate/ runs both tasks synchronously when CELERY_TASK_ALWAYS_EAGER is True."""
        response = self.client.post(self.generate_url)

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertIn('message', response.data)

        # Verify both tasks were called directly, not via delay
        mock_run_anomaly.assert_called_once_with(self.user.id)
        mock_gen_forecast.assert_called_once_with(self.user.id)
        mock_run_anomaly.delay.assert_not_called()
        mock_gen_forecast.delay.assert_not_called()
