# pyrefly: ignore [missing-import]
from django.apps import AppConfig


class TransactionsConfig(AppConfig):
    name = 'transactions'

    def ready(self):
        # Import signal handlers when the app is ready
        import transactions.signals  # noqa: F401
