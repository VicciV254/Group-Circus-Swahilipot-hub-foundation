from django.apps import AppConfig


class ChatConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.chat"          # matches LOCAL_APPS entry in settings.py
    verbose_name = "Nexus Chat"
