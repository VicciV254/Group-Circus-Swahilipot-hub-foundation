"""Nexus FM Report — DRF Serializers"""
from django.utils import timezone
from rest_framework import serializers

from .models import (
    AuditLogEntry,
    EmergencyAlert,
    EmergencyAlertAcknowledgement,
    FMHeartbeat,
    FMOutage,
    FMStation,
    ProgrammeSlot,
    TransmitterReading,
)
# NotificationPreference lives in apps.notifications, not fm_report — see
# the migration note in fm_report/models.py for why.
from apps.notifications.models import NotificationPreference


class FMStationSerializer(serializers.ModelSerializer):
    uptime_percent_today = serializers.SerializerMethodField()
    active_outage = serializers.SerializerMethodField()
    time_since_change = serializers.SerializerMethodField()
    heartbeat_overdue = serializers.SerializerMethodField()

    class Meta:
        model = FMStation
        exclude = ['heartbeat_token']
        read_only_fields = ['id', 'organisation', 'current_status', 'last_status_change', 'last_heartbeat_at']

    def get_uptime_percent_today(self, obj):
        midnight = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        minutes_elapsed = max(int((timezone.now() - midnight).total_seconds() // 60), 1)
        down_today = obj.outages.filter(down_at__gte=midnight).aggregate(
            total=serializers.IntegerField()
        )
        # Sum any outage minutes that fall within today (ongoing outages count to "now").
        down_minutes = 0
        for o in obj.outages.filter(down_at__gte=midnight):
            end = o.restored_at or timezone.now()
            down_minutes += max(int((end - o.down_at).total_seconds() // 60), 0)
        uptime = max(minutes_elapsed - down_minutes, 0)
        return round((uptime / minutes_elapsed) * 100, 1)

    def get_active_outage(self, obj):
        outage = obj.active_outage
        if not outage:
            return None
        return {
            'id': str(outage.id),
            'down_at': outage.down_at,
            'description': outage.description,
            'severity': outage.severity,
        }

    def get_time_since_change(self, obj):
        if not obj.last_status_change:
            return None
        delta = timezone.now() - obj.last_status_change
        minutes = int(delta.total_seconds() // 60)
        hours, mins = divmod(minutes, 60)
        return f'{hours}h {mins}m' if hours else f'{mins}m'

    def get_heartbeat_overdue(self, obj):
        return obj.is_heartbeat_overdue()

    def validate_alert_emails(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Must be a list of email addresses.')
        for email in value:
            if '@' not in str(email):
                raise serializers.ValidationError(f'"{email}" is not a valid email address.')
        if len(value) > 50:
            raise serializers.ValidationError('Maximum 50 alert recipients.')
        return value

    def validate_heartbeat_timeout_minutes(self, value):
        if value < 1 or value > 1440:
            raise serializers.ValidationError('Must be between 1 and 1440 minutes.')
        return value


class FMOutageSerializer(serializers.ModelSerializer):
    reported_by_name = serializers.CharField(source='reported_by.get_full_name', read_only=True, default=None)
    resolved_by_name = serializers.CharField(source='resolved_by.get_full_name', read_only=True, default=None)
    station_name = serializers.CharField(source='station.name', read_only=True)
    station_frequency = serializers.CharField(source='station.frequency', read_only=True)
    is_ongoing = serializers.BooleanField(read_only=True)

    class Meta:
        model = FMOutage
        fields = '__all__'
        read_only_fields = [
            'id', 'duration_minutes', 'auto_detected', 'alert_sent',
            'reported_by', 'resolved_by', 'station',
        ]


class ReportFMDownSerializer(serializers.Serializer):
    """Validates the body of POST /stations/<id>/down/"""
    description = serializers.CharField(allow_blank=True, required=False, default='', max_length=2000)
    severity = serializers.ChoiceField(choices=FMOutage.Severity.choices, default=FMOutage.Severity.MODERATE)


class ReportFMRestoredSerializer(serializers.Serializer):
    """Validates the body of POST /stations/<id>/restored/"""
    resolution_notes = serializers.CharField(allow_blank=True, required=False, default='', max_length=2000)


class EmergencyAlertAcknowledgementSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)

    class Meta:
        model = EmergencyAlertAcknowledgement
        fields = ['user', 'user_name', 'acknowledged_at']
        read_only_fields = ['user', 'user_name', 'acknowledged_at']


class EmergencyAlertSerializer(serializers.ModelSerializer):
    triggered_by_name = serializers.CharField(source='triggered_by.get_full_name', read_only=True, default=None)
    resolved_by_name = serializers.CharField(source='resolved_by.get_full_name', read_only=True, default=None)
    acknowledged_count = serializers.SerializerMethodField()
    acknowledgements = EmergencyAlertAcknowledgementSerializer(
        source='emergencyalertacknowledgement_set', many=True, read_only=True,
    )

    class Meta:
        model = EmergencyAlert
        fields = '__all__'
        read_only_fields = [
            'id', 'organisation', 'triggered_by', 'notified_emails',
            'notified_phones', 'notification_errors', 'acknowledged_by',
            'resolved', 'resolved_at', 'resolved_by',
        ]

    def get_acknowledged_count(self, obj):
        return obj.acknowledged_by.count()

    def validate_title(self, value):
        value = value.strip()
        if len(value) < 5:
            raise serializers.ValidationError('Title must be at least 5 characters.')
        return value

    def validate_description(self, value):
        value = value.strip()
        if len(value) < 10:
            raise serializers.ValidationError('Description must be at least 10 characters.')
        return value

    def validate_affected_systems(self, value):
        if not isinstance(value, list) or not all(isinstance(s, str) for s in value):
            raise serializers.ValidationError('Must be a list of system names.')
        return value


class AcknowledgeAlertSerializer(serializers.Serializer):
    """Validates the (optional) body of POST /emergency-alert/<id>/acknowledge/"""
    resolve = serializers.BooleanField(default=True)
    resolution_notes = serializers.CharField(allow_blank=True, required=False, default='', max_length=2000)


class FMHeartbeatSerializer(serializers.ModelSerializer):
    class Meta:
        model = FMHeartbeat
        fields = '__all__'


class TransmitterReadingSerializer(serializers.ModelSerializer):
    station_name = serializers.CharField(source='station.name', read_only=True)
    vswr_warning = serializers.BooleanField(read_only=True)
    vswr_critical = serializers.BooleanField(read_only=True)
    pa_temp_warning = serializers.BooleanField(read_only=True)

    class Meta:
        model = TransmitterReading
        fields = '__all__'
        read_only_fields = ['id', 'station']

    def validate_vswr(self, value):
        if value is not None and (value < 1.0 or value > 50.0):
            raise serializers.ValidationError('VSWR must be between 1.0 and 50.0.')
        return value


class ReportTelemetrySerializer(serializers.Serializer):
    """Validates the body of POST /stations/<id>/telemetry/ from hardware."""
    forward_power_watts = serializers.FloatField(required=False, allow_null=True)
    reflected_power_watts = serializers.FloatField(required=False, allow_null=True)
    vswr = serializers.FloatField(required=False, allow_null=True, min_value=1.0, max_value=50.0)
    pa_temperature_celsius = serializers.FloatField(required=False, allow_null=True)
    ambient_temperature_celsius = serializers.FloatField(required=False, allow_null=True)
    audio_level_db = serializers.FloatField(required=False, allow_null=True)
    signal_strength_dbm = serializers.FloatField(required=False, allow_null=True)


class ProgrammeSlotSerializer(serializers.ModelSerializer):
    station_name = serializers.CharField(source='station.name', read_only=True)
    weekday_display = serializers.CharField(source='get_weekday_display', read_only=True)

    class Meta:
        model = ProgrammeSlot
        fields = '__all__'
        read_only_fields = ['id', 'station']

    def validate(self, attrs):
        start = attrs.get('start_time', getattr(self.instance, 'start_time', None))
        end = attrs.get('end_time', getattr(self.instance, 'end_time', None))
        if start and end and end <= start:
            raise serializers.ValidationError({'end_time': 'End time must be after start time.'})
        return attrs

    def validate_color(self, value):
        import re
        if not re.match(r'^#[0-9A-Fa-f]{6}$', value):
            raise serializers.ValidationError('Must be a hex color like #3b82f6.')
        return value


class AuditLogEntrySerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source='actor.get_full_name', read_only=True, default=None)
    action_display = serializers.CharField(source='get_action_display', read_only=True)

    class Meta:
        model = AuditLogEntry
        fields = '__all__'
        # `read_only_fields = fields` would capture '__all__' as a str — DRF TypeError.
        read_only_fields = [
            'id', 'organisation', 'actor', 'action',
            'target_repr', 'target_id', 'metadata', 'created_at',
        ]


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    """
    Exposes only the FM-broadcast-relevant fields on the shared
    apps.notifications.NotificationPreference model. Deliberately does NOT
    use fields = '__all__' — this model also holds unrelated settings
    (e.g. digest_email, digest_hour) that this endpoint must not touch.

    phone_number is NOT a field on NotificationPreference — it reads/writes
    apps.accounts.User.phone (the same field apps.notifications.services
    already uses in notify_user/send_sms), via a SerializerMethodField plus
    custom update(), instead of duplicating a second phone column.
    """
    phone_number = serializers.SerializerMethodField()

    class Meta:
        model = NotificationPreference
        fields = [
            'id', 'user',
            'email_on_outage', 'sms_on_outage',
            'email_on_restored', 'sms_on_restored',
            'email_on_emergency_alert', 'sms_on_emergency_alert',
            'fm_minimum_severity', 'phone_number',
        ]
        read_only_fields = ['id', 'user']

    def get_phone_number(self, obj):
        return getattr(obj.user, 'phone', '') or ''

    def validate(self, attrs):
        sms_fields = ['sms_on_outage', 'sms_on_emergency_alert', 'sms_on_restored']
        # Only block if the user is actively turning SMS ON in this request.
        # If SMS is already off (or being turned off), skip the phone check — SMS is optional.
        turning_sms_on = any(attrs.get(f) is True for f in sms_fields)
        if not turning_sms_on:
            return attrs

        incoming_phone = self.initial_data.get('phone_number') if hasattr(self, 'initial_data') else None
        existing_phone = getattr(getattr(self.instance, 'user', None), 'phone', '') if self.instance else ''
        phone = incoming_phone if incoming_phone is not None else existing_phone
        if not phone:
            raise serializers.ValidationError(
                {'phone_number': 'A phone number is required to enable SMS notifications.'}
            )
        return attrs


class NotificationTestSendSerializer(serializers.Serializer):
    """Validates POST /notification-preferences/test-send/"""
    channel = serializers.ChoiceField(choices=['email', 'sms'])
    