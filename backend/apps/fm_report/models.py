"""
Nexus FM Report — Critical Broadcast Monitoring Module
models.py

Domain model for FM transmitter monitoring, outage tracking, automated
heartbeat-based failure detection, and organisation-wide emergency alerting.
"""
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from core.models import TimeStampedModel


# ─── VALIDATORS ──────────────────────────────────────────────────────────────

phone_validator = RegexValidator(
    regex=r'^\+?[1-9]\d{6,14}$',
    message=_('Enter a valid phone number in E.164 format, e.g. +254712345678.'),
)


# ─── FM STATION ──────────────────────────────────────────────────────────────

class FMStation(TimeStampedModel):
    """A physical FM transmitter site monitored by this module."""

    class Status(models.TextChoices):
        ON_AIR = 'on_air', _('On Air')
        OFF_AIR = 'off_air', _('Off Air')
        DEGRADED = 'degraded', _('Degraded')
        UNKNOWN = 'unknown', _('Unknown')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    organisation = models.ForeignKey(
        'accounts.Organisation',
        on_delete=models.CASCADE,
        related_name='fm_stations',
    )
    name = models.CharField(max_length=200)
    frequency = models.CharField(
        max_length=20,
        help_text=_("Broadcast frequency, e.g. '88.3 FM'."),
    )
    location = models.CharField(max_length=255, blank=True)
    stream_url = models.URLField(
        blank=True,
        help_text=_('Public live-stream URL used for the server-side health check.'),
    )
    heartbeat_url = models.URLField(
        blank=True,
        help_text=_('Optional external URL this module pings to verify the transmitter is reachable.'),
    )
    is_active = models.BooleanField(
        default=True,
        help_text=_('Inactive stations are hidden from dashboards and excluded from heartbeat checks.'),
    )

    # Notification targets — normalised, not free-text CSV.
    alert_emails = models.JSONField(
        default=list, blank=True,
        help_text=_('List of email addresses notified on outage/restoration.'),
    )
    alert_phones = models.JSONField(
        default=list, blank=True,
        help_text=_('List of E.164 phone numbers notified via SMS.'),
    )

    current_status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.UNKNOWN, db_index=True,
    )
    last_status_change = models.DateTimeField(null=True, blank=True)

    # Heartbeat / auto-detection
    heartbeat_timeout_minutes = models.PositiveIntegerField(
        default=5,
        help_text=_('Minutes without a heartbeat before the station is auto-flagged off-air.'),
    )
    last_heartbeat_at = models.DateTimeField(null=True, blank=True, db_index=True)
    heartbeat_token = models.UUIDField(
        default=uuid.uuid4, editable=False,
        help_text=_('Shared secret transmitter hardware must present when posting a heartbeat.'),
    )

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['organisation', 'is_active']),
            models.Index(fields=['current_status']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['organisation', 'name'], name='uniq_station_name_per_org',
            ),
        ]

    def __str__(self):
        return f'{self.name} ({self.frequency})'

    def clean(self):
        super().clean()
        for email in self.alert_emails:
            if '@' not in str(email):
                raise ValidationError({'alert_emails': _('%(email)s is not a valid email.') % {'email': email}})
        for phone in self.alert_phones:
            phone_validator(str(phone))

    def is_heartbeat_overdue(self) -> bool:
        """True if heartbeat monitoring is enabled and the timeout has elapsed."""
        if not self.last_heartbeat_at or not self.heartbeat_url:
            return False
        threshold = timezone.now() - timezone.timedelta(minutes=self.heartbeat_timeout_minutes)
        return self.last_heartbeat_at < threshold

    def get_alert_emails(self) -> list:
        """
        Called by apps.notifications.services.NotificationService.send_fm_down_alert
        as a method, not a raw field access — keep this name/shape stable.
        """
        return [e for e in self.alert_emails if e]

    def get_alert_phones(self) -> list:
        """Companion to get_alert_emails(); see that method's note."""
        return [p for p in self.alert_phones if p]

    @property
    def active_outage(self):
        return self.outages.filter(restored_at__isnull=True).order_by('-down_at').first()

    def transition_status(self, new_status: str):
        """Centralised status transition so last_status_change is never forgotten."""
        if self.current_status != new_status:
            self.current_status = new_status
            self.last_status_change = timezone.now()
            self.save(update_fields=['current_status', 'last_status_change'])


# ─── OUTAGE ──────────────────────────────────────────────────────────────────

class FMOutage(TimeStampedModel):
    """A single recorded outage period for a station."""

    class Severity(models.TextChoices):
        MINOR = 'minor', _('Minor')
        MODERATE = 'moderate', _('Moderate')
        CRITICAL = 'critical', _('Critical')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    station = models.ForeignKey(FMStation, on_delete=models.CASCADE, related_name='outages')
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='fm_outages_reported',
    )
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='fm_outages_resolved',
    )

    down_at = models.DateTimeField(db_index=True)
    restored_at = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True, editable=False)

    description = models.TextField(blank=True)
    resolution_notes = models.TextField(blank=True)
    severity = models.CharField(max_length=20, choices=Severity.choices, default=Severity.MODERATE)

    auto_detected = models.BooleanField(default=False)
    alert_sent = models.BooleanField(default=False)

    class Meta:
        ordering = ['-down_at']
        indexes = [
            models.Index(fields=['station', 'restored_at']),
            models.Index(fields=['down_at']),
            models.Index(fields=['severity']),
        ]
        constraints = [
            # Postgres-only partial unique index: only one OPEN outage per station at a time.
            models.UniqueConstraint(
                fields=['station'],
                condition=models.Q(restored_at__isnull=True),
                name='uniq_open_outage_per_station',
            ),
            models.CheckConstraint(
                condition=models.Q(restored_at__isnull=True) | models.Q(restored_at__gte=models.F('down_at')),
                name='restored_at_after_down_at',
            ),
        ]

    def __str__(self):
        return f'{self.station.name} outage @ {self.down_at:%Y-%m-%d %H:%M}'

    def clean(self):
        super().clean()
        if self.restored_at and self.down_at and self.restored_at < self.down_at:
            raise ValidationError({'restored_at': _('Restoration time cannot precede the down time.')})

    def save(self, *args, **kwargs):
        if self.restored_at and self.down_at:
            delta = self.restored_at - self.down_at
            self.duration_minutes = max(int(delta.total_seconds() // 60), 0)
        self.full_clean(exclude=[f.name for f in self._meta.fields if f.name not in (
            'restored_at', 'down_at',
        )])
        super().save(*args, **kwargs)

    @property
    def is_ongoing(self) -> bool:
        return self.restored_at is None


# ─── HEARTBEAT LOG ───────────────────────────────────────────────────────────

class FMHeartbeat(TimeStampedModel):
    """Append-only log of heartbeat pings, used for monitoring + diagnostics."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    station = models.ForeignKey(FMStation, on_delete=models.CASCADE, related_name='heartbeats')
    received_at = models.DateTimeField(auto_now_add=True, db_index=True)
    status_code = models.IntegerField(null=True, blank=True)
    response_ms = models.IntegerField(null=True, blank=True)
    success = models.BooleanField(default=True)
    source_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ['-received_at']
        indexes = [models.Index(fields=['station', 'received_at'])]


# ─── EMERGENCY ALERT ─────────────────────────────────────────────────────────

class EmergencyAlert(TimeStampedModel):
    """Organisation-wide emergency broadcast triggered by an admin."""

    class AlertType(models.TextChoices):
        SYSTEM_DOWN = 'system_down', _('System Down')
        FM_OUTAGE = 'fm_outage', _('FM Station Outage')
        SECURITY_BREACH = 'security_breach', _('Security Breach')
        INFRASTRUCTURE = 'infrastructure', _('Infrastructure Failure')
        EMERGENCY = 'emergency', _('General Emergency')
        DATA_BREACH = 'data_breach', _('Data Breach')
        FIRE = 'fire', _('Fire / Evacuation')
        OTHER = 'other', _('Other')

    class Severity(models.TextChoices):
        LOW = 'low', _('Low')
        MEDIUM = 'medium', _('Medium')
        HIGH = 'high', _('High')
        CRITICAL = 'critical', _('Critical')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    organisation = models.ForeignKey(
        'accounts.Organisation', on_delete=models.CASCADE, related_name='emergency_alerts',
    )
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='triggered_alerts',
    )
    related_station = models.ForeignKey(
        FMStation, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='emergency_alerts',
    )

    alert_type = models.CharField(max_length=50, choices=AlertType.choices)
    title = models.CharField(max_length=200)
    description = models.TextField()
    severity = models.CharField(max_length=20, choices=Severity.choices, default=Severity.HIGH)
    affected_systems = models.JSONField(default=list, blank=True)

    notified_emails = models.JSONField(default=list, blank=True)
    notified_phones = models.JSONField(default=list, blank=True)
    notification_errors = models.JSONField(default=list, blank=True)

    acknowledged_by = models.ManyToManyField(
        settings.AUTH_USER_MODEL, through='EmergencyAlertAcknowledgement',
        blank=True, related_name='acknowledged_alerts',
    )

    resolved = models.BooleanField(default=False, db_index=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='resolved_alerts',
    )
    resolution_notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['organisation', 'resolved']),
            models.Index(fields=['severity']),
        ]

    def __str__(self):
        return f'[{self.get_severity_display()}] {self.title}'

    def resolve(self, user, notes: str = ''):
        self.resolved = True
        self.resolved_at = timezone.now()
        self.resolved_by = user
        self.resolution_notes = notes
        self.save(update_fields=['resolved', 'resolved_at', 'resolved_by', 'resolution_notes'])


class EmergencyAlertAcknowledgement(TimeStampedModel):
    """Through-model so we know WHEN each admin acknowledged, not just who."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    alert = models.ForeignKey(EmergencyAlert, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    acknowledged_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['alert', 'user'], name='uniq_ack_per_user_per_alert'),
        ]
        ordering = ['acknowledged_at']


# ─── TRANSMITTER TELEMETRY ──────────────────────────────────────────────────

class TransmitterReading(TimeStampedModel):
    """
    A single technical telemetry sample reported by transmitter hardware
    alongside (or instead of) a plain heartbeat. Append-only time series.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    station = models.ForeignKey(FMStation, on_delete=models.CASCADE, related_name='readings')
    recorded_at = models.DateTimeField(default=timezone.now, db_index=True)

    forward_power_watts = models.FloatField(null=True, blank=True)
    reflected_power_watts = models.FloatField(null=True, blank=True)
    vswr = models.FloatField(
        null=True, blank=True,
        help_text=_('Voltage Standing Wave Ratio — values above ~1.5 typically indicate an antenna/feedline fault.'),
    )
    pa_temperature_celsius = models.FloatField(null=True, blank=True)
    ambient_temperature_celsius = models.FloatField(null=True, blank=True)
    audio_level_db = models.FloatField(null=True, blank=True)
    signal_strength_dbm = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ['-recorded_at']
        indexes = [models.Index(fields=['station', 'recorded_at'])]

    def __str__(self):
        return f'{self.station.name} reading @ {self.recorded_at:%Y-%m-%d %H:%M}'

    @property
    def vswr_warning(self) -> bool:
        return self.vswr is not None and self.vswr > 1.5

    @property
    def vswr_critical(self) -> bool:
        return self.vswr is not None and self.vswr > 2.0

    @property
    def pa_temp_warning(self) -> bool:
        return self.pa_temperature_celsius is not None and self.pa_temperature_celsius > 70


# ─── PROGRAMME SCHEDULE ──────────────────────────────────────────────────────

class ProgrammeSlot(TimeStampedModel):
    """A recurring or one-off scheduled show on a station."""

    class Weekday(models.IntegerChoices):
        MONDAY = 0, _('Monday')
        TUESDAY = 1, _('Tuesday')
        WEDNESDAY = 2, _('Wednesday')
        THURSDAY = 3, _('Thursday')
        FRIDAY = 4, _('Friday')
        SATURDAY = 5, _('Saturday')
        SUNDAY = 6, _('Sunday')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    station = models.ForeignKey(FMStation, on_delete=models.CASCADE, related_name='programme_slots')

    title = models.CharField(max_length=200)
    host = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    weekday = models.IntegerField(choices=Weekday.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()
    is_active = models.BooleanField(default=True)
    color = models.CharField(
        max_length=7, default='#3b82f6',
        help_text=_('Hex color for the schedule grid, e.g. #3b82f6.'),
    )

    class Meta:
        ordering = ['weekday', 'start_time']
        indexes = [models.Index(fields=['station', 'weekday'])]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F('start_time')),
                name='programme_end_after_start',
            ),
        ]

    def __str__(self):
        return f'{self.title} ({self.get_weekday_display()} {self.start_time}-{self.end_time})'

    def clean(self):
        super().clean()
        if self.end_time <= self.start_time:
            raise ValidationError({'end_time': _('End time must be after start time.')})
        overlapping = ProgrammeSlot.objects.filter(
            station=self.station, weekday=self.weekday, is_active=True,
        ).exclude(pk=self.pk)
        for slot in overlapping:
            if self.start_time < slot.end_time and slot.start_time < self.end_time:
                raise ValidationError(
                    _('This slot overlaps with "%(title)s" (%(start)s–%(end)s).') % {
                        'title': slot.title, 'start': slot.start_time, 'end': slot.end_time,
                    }
                )


# ─── AUDIT LOG ───────────────────────────────────────────────────────────────

class AuditLogEntry(models.Model):
    """
    Immutable record of who did what, when, within the FM-report module.
    Written by services.py / signals — never edited after creation.
    """

    class Action(models.TextChoices):
        STATION_CREATED = 'station_created', _('Station Created')
        STATION_UPDATED = 'station_updated', _('Station Updated')
        STATION_DELETED = 'station_deleted', _('Station Deactivated')
        OUTAGE_REPORTED = 'outage_reported', _('Outage Reported')
        OUTAGE_RESTORED = 'outage_restored', _('Outage Restored')
        ALERT_TRIGGERED = 'alert_triggered', _('Emergency Alert Triggered')
        ALERT_ACKNOWLEDGED = 'alert_acknowledged', _('Alert Acknowledged')
        ALERT_RESOLVED = 'alert_resolved', _('Alert Resolved')
        SCHEDULE_UPDATED = 'schedule_updated', _('Schedule Updated')
        ROLE_CHANGED = 'role_changed', _('User Role Changed')
        NOTIFICATION_PREFS_UPDATED = 'notification_prefs_updated', _('Notification Preferences Updated')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        'accounts.Organisation', on_delete=models.CASCADE, related_name='fm_audit_log',
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='fm_audit_actions',
    )
    action = models.CharField(max_length=50, choices=Action.choices, db_index=True)
    target_repr = models.CharField(
        max_length=255, blank=True,
        help_text=_('Human-readable label for the affected object, e.g. station name.'),
    )
    target_id = models.CharField(max_length=64, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['organisation', 'created_at']),
            models.Index(fields=['action']),
        ]
        verbose_name_plural = 'Audit log entries'

    def __str__(self):
        return f'{self.get_action_display()} by {self.actor} @ {self.created_at:%Y-%m-%d %H:%M}'

# NOTE: FM-specific notification preferences (email/SMS toggles per event type)
# live as fields on apps.notifications.models.NotificationPreference, added via
# a migration on that app — see apps/notifications/migrations/00XX_fm_prefs.py.
# Deliberately NOT duplicated here; there is exactly one NotificationPreference
# model in the project, in apps.notifications.