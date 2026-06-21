import uuid
from django.db import models
from django.conf import settings


class ShootBooking(models.Model):
    STATUS_CHOICES = [
        ('pending',   'Pending'),
        ('approved',  'Approved'),
        ('declined',  'Declined'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title            = models.CharField(max_length=255)
    requested_by     = models.ForeignKey(
                           settings.AUTH_USER_MODEL,
                           on_delete=models.SET_NULL,
                           null=True, related_name='shoot_bookings'
                       )
    shoot_date       = models.DateField()
    duration_hours   = models.PositiveSmallIntegerField(null=True, blank=True)
    location         = models.CharField(max_length=255, blank=True)
    production_brief = models.TextField(blank=True)
    equipment_list   = models.ManyToManyField(
                           'equipment.EquipmentItem',   # correct model name
                           blank=True,
                           related_name='shoot_bookings'
                       )
    status           = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    admin_notes      = models.TextField(blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:  # type: ignore
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} — {self.shoot_date}"


class Footage(models.Model):
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking      = models.ForeignKey(
                       ShootBooking, on_delete=models.SET_NULL,
                       null=True, blank=True, related_name='footage_files'
                   )
    uploaded_by  = models.ForeignKey(
                       settings.AUTH_USER_MODEL,
                       on_delete=models.SET_NULL, null=True
                   )
    title        = models.CharField(max_length=255, blank=True)
    file         = models.FileField(upload_to='footage/')
    filename     = models.CharField(max_length=255, blank=True)
    file_size_mb = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:  # type: ignore
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if self.file and not self.filename:
            self.filename = self.file.name.split('/')[-1]
        if self.file and not self.file_size_mb:
            try:
                self.file_size_mb = round(self.file.size / (1024 * 1024), 2)
            except Exception:
                pass
        super().save(*args, **kwargs)

    def __str__(self):
        return self.filename or str(self.id)