"""Nexus Notifications — Model, Views, WebSocket Consumer"""
import uuid
from django.db import models
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from core.models import TimeStampedModel


class Notification(TimeStampedModel):
    TYPES = [
        ('task_assigned', 'Task Assigned'),
        ('task_reviewed', 'Task Reviewed'),
        ('task_overdue', 'Task Overdue'),
        ('logbook_reviewed', 'Logbook Reviewed'),
        ('evaluation_due', 'Evaluation Due'),
        ('certificate_issued', 'Certificate Issued'),
        ('attendance_violation', 'Attendance Violation'),
        ('geofence_violation', 'Geofence Violation'),
        ('leave_decision', 'Leave Decision'),
        ('checkout_update', 'Checkout Update'),
        ('maintenance_update', 'Maintenance Update'),
        ('fm_outage', 'FM Station Outage'),
        ('fm_restored', 'FM Station Restored'),
        ('emergency_alert', 'Emergency Alert'),
        ('story_review', 'Story Review'),
        ('seat_request', 'Seat Request'),
        ('subscription_expiry', 'Subscription Expiry'),
        ('wifi_decision', 'Wi-Fi Decision'),
        ('ticket_update', 'Ticket Update'),
        ('system', 'System'),
        ('announcement', 'Announcement'),
        ('reminder', 'Reminder'),
        ('general', 'General'),
    ]

    recipient    = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='notifications')
    title        = models.CharField(max_length=300)
    body         = models.TextField()
    notification_type = models.CharField(max_length=50, choices=TYPES, default='general')
    link         = models.CharField(max_length=500, blank=True)
    related_id   = models.CharField(max_length=100, blank=True)
    read         = models.BooleanField(default=False, db_index=True)
    read_at      = models.DateTimeField(null=True, blank=True)
    is_urgent    = models.BooleanField(default=False)
    push_sent    = models.BooleanField(default=False)
    email_sent   = models.BooleanField(default=False)

    class Meta:  # type: ignore
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', 'read']),
            models.Index(fields=['recipient', 'created_at']),
            models.Index(fields=['notification_type']),
        ]

    def __str__(self):
        return f"{self.recipient.email} — {self.title}"

    def mark_read(self):
        if not self.read:
            self.read = True
            self.read_at = timezone.now()
            self.save(update_fields=['read', 'read_at'])


class NotificationPreference(TimeStampedModel):
    user           = models.OneToOneField('accounts.User', on_delete=models.CASCADE, related_name='notification_preferences')
    email_enabled  = models.BooleanField(default=True)
    sms_enabled    = models.BooleanField(default=True)
    push_enabled   = models.BooleanField(default=True)
    digest_email   = models.BooleanField(default=False)
    digest_hour    = models.IntegerField(default=8)

    # Per-type overrides
    task_notifications       = models.BooleanField(default=True)
    attendance_notifications = models.BooleanField(default=True)
    evaluation_notifications = models.BooleanField(default=True)
    fm_notifications         = models.BooleanField(default=True)
    equipment_notifications  = models.BooleanField(default=True)
    system_notifications     = models.BooleanField(default=True)

    # FM Report — granular event-level toggles (columns added by migration
    # 0002 fm notification fields, restored by 0004_restore_fm_notification_fields).
    # Do NOT run makemigrations after adding these — the columns already exist.
    email_on_outage          = models.BooleanField(default=True)
    sms_on_outage            = models.BooleanField(default=False)
    email_on_restored        = models.BooleanField(default=True)
    sms_on_restored          = models.BooleanField(default=False)
    email_on_emergency_alert = models.BooleanField(default=True)
    sms_on_emergency_alert   = models.BooleanField(default=True)
    fm_minimum_severity      = models.CharField(
        max_length=20, default='low',
        choices=[('low', 'Low'), ('medium', 'Medium'), ('high', 'High'), ('critical', 'Critical')],
        help_text='Suppress FM-related notifications below this severity.',
    )


# ─── SERIALIZERS ─────────────────────────────────────────────────────────────

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:  # type: ignore
        model = Notification
        fields = '__all__'
        read_only_fields = ['recipient', 'created_at']


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:  # type: ignore
        model = NotificationPreference
        fields = '__all__'
        read_only_fields = ['user']


# ─── VIEWS ───────────────────────────────────────────────────────────────────

class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        qs = Notification.objects.filter(recipient=self.request.user)
        unread_only = self.request.query_params.get('unread')
        ntype = self.request.query_params.get('type')
        if unread_only == 'true':
            qs = qs.filter(read=False)
        if ntype:
            qs = qs.filter(notification_type=ntype)

        urgent_only = self.request.query_params.get('urgent')
        if urgent_only == 'true':
            qs = qs.filter(is_urgent=True)
        return qs


class NotificationDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user)

    def perform_update(self, serializer):
        instance = serializer.save()
        if instance.read and not instance.read_at:
            instance.read_at = timezone.now()
            instance.save(update_fields=['read_at'])


class MarkReadView(APIView):
    def post(self, request, pk):
        try:
            notification = Notification.objects.get(pk=pk, recipient=request.user)
            notification.mark_read()
            return Response({'status': 'ok'})
        except Notification.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        

class MarkAllReadView(APIView):
    def post(self, request):
        updated = Notification.objects.filter(recipient=request.user, read=False).update(
            read=True, read_at=timezone.now()
        )
        return Response({'marked_read': updated})


class UnreadCountView(APIView):
    def get(self, request):
        count = Notification.objects.filter(recipient=request.user, read=False).count()
        urgent = Notification.objects.filter(recipient=request.user, read=False, is_urgent=True).count()
        return Response({'count': count, 'urgent': urgent})


class NotificationPreferenceView(generics.RetrieveUpdateAPIView):
    serializer_class = NotificationPreferenceSerializer

    def get_object(self):
        prefs, _ = NotificationPreference.objects.get_or_create(user=self.request.user)
        return prefs
    