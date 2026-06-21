import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import timedelta


def upload_to(instance, filename):
    # Flat structure avoids Windows path separator issues and keeps paths short
    ext = filename.rsplit(".", 1)[-1] if "." in filename else ""
    safe_name = f"{instance.token}.{ext}" if ext else str(instance.token)
    return f"file_transfers/{safe_name}"


def default_expires_at():
    return timezone.now() + timedelta(hours=24)


class FileTransfer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="file_transfers",
    )
    file = models.FileField(upload_to=upload_to, max_length=500)
    original_filename = models.CharField(max_length=500)
    file_size = models.BigIntegerField(default=0)
    content_type = models.CharField(max_length=200, blank=True)
    download_count = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(default=default_expires_at)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:  # type: ignore
        ordering = ["-created_at"]

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    def __str__(self):
        return f"{self.original_filename} ({self.token})"