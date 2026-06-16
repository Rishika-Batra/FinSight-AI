# pyrefly: ignore [missing-import]
from rest_framework import serializers
from .models import ForecastSnapshot

class ForecastSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = ForecastSnapshot
        fields = ['id', 'created_at', 'forecast_data']
        read_only_fields = ['id', 'created_at']
