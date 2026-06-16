from django.urls import path
from .views import TransactionListCreateView, TransactionCSVUploadView, TransactionStatsView

urlpatterns = [
    path('', TransactionListCreateView.as_view(), name='transaction_list_create'),
    path('upload/', TransactionCSVUploadView.as_view(), name='transaction_csv_upload'),
    path('stats/', TransactionStatsView.as_view(), name='transaction_stats'),
]
