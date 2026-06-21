"""
apps/logbooks/apps.py
"""
from django.apps import AppConfig


class LogbooksConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.logbooks"
    verbose_name = "Logbooks"

    def ready(self):
        import apps.logbooks.signals  # noqa — wire up signals
