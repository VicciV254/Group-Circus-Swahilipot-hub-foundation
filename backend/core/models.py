"""Core base models for Nexus Enterprise System"""
import uuid
from django.db import models
from django.contrib.auth import get_user_model


class TimeStampedModel(models.Model):
    """Abstract base model with created/updated timestamps"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:  # type: ignore
        abstract = True


class SoftDeleteModel(TimeStampedModel):
    """Abstract base with soft delete capability"""
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:  # type: ignore# type: ignore[override]
        abstract = True

    def soft_delete(self):
        from django.utils import timezone
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=['is_deleted', 'deleted_at'])


class AuditedModel(SoftDeleteModel):
    """Abstract base with full audit trail"""
    created_by = models.ForeignKey(
        'accounts.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='%(class)s_created',
    )
    updated_by = models.ForeignKey(
        'accounts.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='%(class)s_updated',
    )

    class Meta:  # type: ignore# type: ignore[override]
        abstract = True


class AuditLog(TimeStampedModel):
    """Immutable audit log — records every significant action"""
    user = models.ForeignKey(
        'accounts.User', null=True, on_delete=models.SET_NULL, related_name='audit_logs'
    )
    action = models.CharField(max_length=100)
    resource_type = models.CharField(max_length=100)
    resource_id = models.CharField(max_length=100, blank=True)
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    session_id = models.CharField(max_length=100, blank=True)
    extra = models.JSONField(null=True, blank=True)

    class Meta:  # type: ignore# type: ignore[override]
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['resource_type', 'resource_id']),
            models.Index(fields=['action', 'created_at']),
        ]

    def __str__(self):
        return f"{self.user} — {self.action} on {self.resource_type} at {self.created_at}"
