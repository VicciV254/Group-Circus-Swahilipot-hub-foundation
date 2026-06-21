import uuid
from django.db import models
from django.conf import settings


class WifiGrant(models.Model):
    STATUS_PENDING  = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_REVOKED  = 'revoked'
    STATUS_EXPIRED  = 'expired'

    STATUS_CHOICES = [
        (STATUS_PENDING,  'Pending'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_REVOKED,  'Revoked'),
        (STATUS_EXPIRED,  'Expired'),
    ]

    DEVICE_CHOICES = [
        ('laptop', 'Laptop'),
        ('phone',  'Phone'),
        ('tablet', 'Tablet'),
        ('other',  'Other'),
    ]

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='wifi_grants',
    )
    device_type  = models.CharField(max_length=20, choices=DEVICE_CHOICES, default='laptop')
    mac_address  = models.CharField(max_length=17, blank=True, default='')
    purpose      = models.TextField()
    status       = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)

    duration_days = models.PositiveIntegerField(default=30)
    expires_at    = models.DateTimeField(null=True, blank=True)

    reviewed_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='wifi_grants_reviewed',
    )
    reviewed_at  = models.DateTimeField(null=True, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'wifi'
        ordering  = ['-created_at']

    def __str__(self):
        return f"{self.requested_by} - {self.device_type} ({self.status})"
    