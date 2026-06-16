# pyrefly: ignore [missing-import]
from django.urls import path
from .views import LatestForecastView, GenerateForecastView

urlpatterns = [
    path('latest/', LatestForecastView.as_view(), name='latest_forecast'),
    path('generate/', GenerateForecastView.as_view(), name='generate_forecast'),
]
