# pyrefly: ignore [missing-import]
from django.db import models
# pyrefly: ignore [missing-import]
from django.contrib.auth.models import User

class ForecastSnapshot(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='forecast_snapshots')
    created_at = models.DateTimeField(auto_now_add=True)
    forecast_data = models.JSONField()

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Forecast for {self.user.username} created at {self.created_at}"
