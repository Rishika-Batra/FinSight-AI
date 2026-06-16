# pyrefly: ignore [missing-import]
from rest_framework import status
# pyrefly: ignore [missing-import]
from rest_framework.views import APIView
# pyrefly: ignore [missing-import]
from rest_framework.response import Response
# pyrefly: ignore [missing-import]
from rest_framework.permissions import IsAuthenticated

from .models import ForecastSnapshot
from .serializers import ForecastSnapshotSerializer
from transactions.tasks import run_anomaly_detection, generate_forecast


class LatestForecastView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        latest_forecast = (
            ForecastSnapshot.objects
            .filter(user=request.user)
            .order_by('-created_at')
            .first()
        )

        # Return 200 instead of 404 when no forecast exists
        if not latest_forecast:
            return Response(
                {
                    "exists": False,
                    "forecast": None,
                    "predicted_flow": None,
                },
                status=status.HTTP_200_OK
            )

        serializer = ForecastSnapshotSerializer(latest_forecast)

        return Response(
            {
                "exists": True,
                **serializer.data
            },
            status=status.HTTP_200_OK
        )


class GenerateForecastView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        run_anomaly_detection.delay(request.user.id)
        generate_forecast.delay(request.user.id)

        return Response(
            {
                'message': 'Anomaly detection and forecast generation tasks have been enqueued.'
            },
            status=status.HTTP_202_ACCEPTED
        )