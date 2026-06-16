import os
from celery import Celery
from celery.schedules import crontab

# Tell Celery which Django settings module to use
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

app = Celery('core')

# Use the CELERY_ namespace in settings.py for all Celery configuration keys
# (includes CELERY_BEAT_SCHEDULE for periodic tasks)
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks from all INSTALLED_APPS
app.autodiscover_tasks()

# ── Celery Beat – periodic tasks ─────────────────────────────────────────
# Both jobs run at 02:00 UTC every day.
# Each wrapper fans out the real work to individual per-user tasks via .delay()
# so the beat schedule stays lightweight and the heavy lifting is parallelised
# across the worker pool.
app.conf.beat_schedule = {
    # Run anomaly detection for every active user once every 24 h
    'run-anomaly-detection-all-users-daily': {
        'task': 'transactions.tasks.run_anomaly_detection_for_all_users',
        'schedule': crontab(hour=2, minute=0),
        'options': {'expires': 3600},  # drop the task if it hasn't started within 1 h
    },
    # Generate a new forecast snapshot for every active user once every 24 h
    'generate-forecast-all-users-daily': {
        'task': 'transactions.tasks.generate_forecast_for_all_users',
        'schedule': crontab(hour=2, minute=30),  # stagger 30 min after anomaly run
        'options': {'expires': 3600},
    },
}

# ── How to run locally ────────────────────────────────────────────────────
# Worker:    celery -A core worker --loglevel=info
# Beat:      celery -A core beat   --loglevel=info
# Combined:  celery -A core worker --beat --loglevel=info  (dev only)
