"""Nexus Celery Application Configuration"""
import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'Nexus.settings')

app = Celery('Nexus')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
import Nexus.tasks  # noqa — registers project-level shared_tasks with the worker

# ── Scheduled Tasks ───────────────────────────────────────────────────────────
app.conf.beat_schedule = {
    'check-fm-heartbeat': {
        'task': 'Nexus.tasks.check_fm_heartbeat',
        'schedule': 300,
    },
    'check-subscription-expiry': {
        'task': 'Nexus.tasks.check_subscription_expiry',
        'schedule': crontab(hour=8, minute=0),
    },
    'check-overdue-tasks': {
        'task': 'Nexus.tasks.check_overdue_tasks',
        'schedule': crontab(minute=0),
    },
    'check-overdue-equipment': {
        'task': 'Nexus.tasks.check_overdue_equipment',
        'schedule': crontab(hour=7, minute=0),
    },
    'send-radio-reminders': {
        'task': 'Nexus.tasks.send_radio_reminders',
        'schedule': 1800,
    },
    'expire-file-transfers': {
        'task': 'Nexus.tasks.expire_file_transfers',
        'schedule': crontab(minute=5),
    },
    'send-digest-emails': {
        'task': 'Nexus.tasks.send_digest_emails',
        'schedule': crontab(minute=0),
    },
    'auto-enforce-attendance-daily': {
        'task': 'apps.attendance.tasks.auto_enforce_attendance',
        'schedule': crontab(hour=9, minute=0),
    },
}

app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='Africa/Nairobi',
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_routes={
        'Nexus.tasks.check_fm_heartbeat': {'queue': 'critical'},
        'Nexus.tasks.send_radio_reminders': {'queue': 'notifications'},
        'Nexus.tasks.send_digest_emails': {'queue': 'notifications'},
    },
)