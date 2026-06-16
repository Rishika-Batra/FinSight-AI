# pyrefly: ignore [missing-import]
from django.db import models
# pyrefly: ignore [missing-import]
from django.contrib.auth.models import User


class Transaction(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='transactions')
    date = models.DateField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    category = models.CharField(max_length=100, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    is_anomaly = models.BooleanField(blank=True, null=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # SHA-256 hash of (user_id, date, amount, description, category).
    # Used for duplicate detection during CSV imports.  Nullable so that
    # existing rows (created before this field existed) are unaffected.
    transaction_hash = models.CharField(
        max_length=64,
        db_index=True,
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ['-date', '-created_at']
        indexes = [
            # Fast user-scoped range queries (dashboard, forecast window)
            models.Index(fields=['user', 'date'], name='tx_user_date_idx'),
            # Fast category aggregation for stats / top-category
            models.Index(fields=['user', 'category'], name='tx_user_category_idx'),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.category} - {self.amount} on {self.date}"


class UserAnalytics(models.Model):
    """
    Lightweight analytics cache updated by the recompute_analytics Celery
    task after every CSV upload.  The stats endpoint reads from here when
    the cache is fresh (updated within the last 5 minutes), falling back to
    a live aggregation query otherwise.
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='analytics',
    )
    total_spent = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    top_category = models.CharField(max_length=100, default='N/A')
    transaction_count = models.IntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Analytics cache for {self.user.username} (updated {self.updated_at})"
