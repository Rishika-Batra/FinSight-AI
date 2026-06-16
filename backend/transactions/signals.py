import logging
# pyrefly: ignore [missing-import]
from django.db.models.signals import post_save
# pyrefly: ignore [missing-import]
from django.dispatch import receiver

logger = logging.getLogger(__name__)

# Import inside the handler to avoid circular imports at module load time
@receiver(post_save, sender='transactions.Transaction')
def on_transaction_saved(sender, instance, created, **kwargs):
    """
    Fire the classify_transaction Celery task asynchronously whenever
    a new Transaction record is created.
    """
    if created:
        from transactions.tasks import classify_transaction
        logger.debug(f"post_save signal: Firing classify_transaction for transaction id={instance.pk}")
        classify_transaction.delay(instance.pk)
