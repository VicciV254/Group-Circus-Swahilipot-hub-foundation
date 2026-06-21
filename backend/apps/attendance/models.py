"""Nexus Attendance — Models only"""
import math
from django.db import models
from django.utils import timezone
from core.models import TimeStampedModel


def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance in metres between two GPS coordinates."""
    R = 6371000
    phi1, phi2 = math.radians(float(lat1)), math.radians(float(lat2))
    dphi    = math.radians(float(lat2) - float(lat1))
    dlambda = math.radians(float(lon2) - float(lon1))
    a = (math.sin(dphi / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2)
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class AttendanceRecord(TimeStampedModel):
    STATUS_CHOICES = [
        ('present', 'Present'), ('absent', 'Absent'), ('late', 'Late'),
        ('half_day', 'Half Day'), ('leave', 'On Leave'), ('holiday', 'Public Holiday'),
    ]
    METHOD_CHOICES = [
        ('gps', 'GPS Check-in'), ('qr', 'QR Code'), ('facial', 'Facial Recognition'),
        ('manual', 'Manual Entry'), ('system', 'System Generated'),
    ]

    user                      = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='attendance_records')
    date                      = models.DateField()
    check_in_time             = models.DateTimeField(null=True, blank=True)
    check_out_time            = models.DateTimeField(null=True, blank=True)
    check_in_latitude         = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    check_in_longitude        = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    check_out_latitude        = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    check_out_longitude       = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    check_in_distance_metres  = models.FloatField(null=True, blank=True)
    check_out_distance_metres = models.FloatField(null=True, blank=True)
    status                    = models.CharField(max_length=20, choices=STATUS_CHOICES, default='present')
    method                    = models.CharField(max_length=20, choices=METHOD_CHOICES, default='gps')
    total_hours               = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    notes                     = models.TextField(blank=True)
    supervisor_approved       = models.BooleanField(null=True)
    approved_by               = models.ForeignKey('accounts.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='approved_attendance')
    qr_code_used              = models.CharField(max_length=100, blank=True)

    class Meta:  # type: ignore
        unique_together = [['user', 'date']]
        ordering = ['-date']
        indexes = [
            models.Index(fields=['user', 'date']),
            models.Index(fields=['date', 'status']),
        ]

    def calculate_hours(self):
        if self.check_in_time and self.check_out_time:
            delta = self.check_out_time - self.check_in_time
            return round(delta.total_seconds() / 3600, 2)
        return None

    def save(self, *args, **kwargs):
        if self.check_in_time and self.check_out_time:
            self.total_hours = self.calculate_hours()
        super().save(*args, **kwargs)


class GeofenceViolation(TimeStampedModel):
    attendance              = models.ForeignKey(AttendanceRecord, on_delete=models.CASCADE, related_name='violations')
    user                    = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='geofence_violations')
    timestamp               = models.DateTimeField(default=timezone.now)
    latitude                = models.DecimalField(max_digits=10, decimal_places=7)
    longitude               = models.DecimalField(max_digits=10, decimal_places=7)
    distance_from_workplace = models.FloatField()
    alert_sent              = models.BooleanField(default=False)
    acknowledged            = models.BooleanField(default=False)

    class Meta:  # type: ignore
        ordering = ['-timestamp']


class LeaveRequest(TimeStampedModel):
    LEAVE_TYPES = [
        ('annual', 'Annual Leave'),    ('sick', 'Sick Leave'),
        ('maternity', 'Maternity Leave'), ('paternity', 'Paternity Leave'),
        ('emergency', 'Emergency Leave'), ('study', 'Study Leave'),
        ('unpaid', 'Unpaid Leave'),    ('other', 'Other'),
    ]
    STATUS = [
        ('pending', 'Pending'),   ('approved', 'Approved'),
        ('rejected', 'Rejected'), ('cancelled', 'Cancelled'),
    ]

    user           = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='leave_requests')
    leave_type     = models.CharField(max_length=20, choices=LEAVE_TYPES)
    start_date     = models.DateField()
    end_date       = models.DateField()
    days_requested = models.IntegerField()
    reason         = models.TextField()
    status         = models.CharField(max_length=20, choices=STATUS, default='pending')
    reviewed_by    = models.ForeignKey('accounts.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='leave_reviews')
    review_notes   = models.TextField(blank=True)
    reviewed_at    = models.DateTimeField(null=True, blank=True)
    attachments    = models.FileField(upload_to='leave/attachments/', null=True, blank=True)

    class Meta:  # type: ignore
        ordering = ['-created_at']