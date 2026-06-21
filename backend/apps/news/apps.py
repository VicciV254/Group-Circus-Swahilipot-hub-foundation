"""apps.news — AppConfig
Wires up signals and scheduled-task registration on startup.
"""
from django.apps import AppConfig


class NewsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.news"
    verbose_name = "News & Broadcast"

    def ready(self):
        # Import signal handlers so they register with Django's signal dispatcher.
        # These are defined in apps/news/signals.py (see below).
        try:
            import apps.news.signals  # noqa: F401
        except ImportError:
            pass

        # Register periodic tasks with django-celery-beat (if installed).
        self._register_periodic_tasks()

    # ------------------------------------------------------------------
    # Periodic task registration
    # ------------------------------------------------------------------

    @staticmethod
    def _register_periodic_tasks():
        """
        Idempotently register Celery Beat periodic tasks.
        Runs inside ready() so migrations must already be applied;
        we guard with a try/except to avoid crashing during initial
        `migrate` runs before the celery_beat tables exist.
        """
        try:
            from django_celery_beat.models import PeriodicTask, IntervalSchedule
            import json

            # Every 5 minutes — auto-publish scheduled stories
            schedule_5m, _ = IntervalSchedule.objects.get_or_create(
                every=5, period=IntervalSchedule.MINUTES
            )
            PeriodicTask.objects.get_or_create(
                name="news.auto_publish_scheduled_stories",
                defaults={
                    "interval": schedule_5m,
                    "task": "apps.news.tasks.auto_publish_scheduled_stories",
                    "args": json.dumps([]),
                },
            )

            # Every hour — update subscription statuses + send expiry alerts
            schedule_1h, _ = IntervalSchedule.objects.get_or_create(
                every=1, period=IntervalSchedule.HOURS
            )
            PeriodicTask.objects.get_or_create(
                name="news.update_subscription_statuses",
                defaults={
                    "interval": schedule_1h,
                    "task": "apps.news.tasks.update_subscription_statuses",
                    "args": json.dumps([]),
                },
            )

            # Every 15 minutes — send radio slot reminders (24h and 2h)
            schedule_15m, _ = IntervalSchedule.objects.get_or_create(
                every=15, period=IntervalSchedule.MINUTES
            )
            PeriodicTask.objects.get_or_create(
                name="news.send_slot_reminders",
                defaults={
                    "interval": schedule_15m,
                    "task": "apps.news.tasks.send_slot_reminders",
                    "args": json.dumps([]),
                },
            )

            # Daily midnight — auto-archive expired stories
            schedule_24h, _ = IntervalSchedule.objects.get_or_create(
                every=24, period=IntervalSchedule.HOURS
            )
            PeriodicTask.objects.get_or_create(
                name="news.auto_archive_expired_stories",
                defaults={
                    "interval": schedule_24h,
                    "task": "apps.news.tasks.auto_archive_expired_stories",
                    "args": json.dumps([]),
                },
            )

        except Exception:
            # Silently skip — tables may not exist yet during first migrate
            pass
