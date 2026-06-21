"""Nexus FM Report — Django Admin"""
from django.contrib import admin

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
# NOTE: NotificationPreference is NOT registered here — it lives in
# apps.notifications and is already registered in that app's admin.py.
# The FM-specific fields added via migration will appear there automatically.


class FMOutageInline(admin.TabularInline):
    model = FMOutage
    extra = 0
    readonly_fields = ['duration_minutes', 'auto_detected', 'alert_sent', 'created_at']
    fields = ['down_at', 'restored_at', 'severity', 'reported_by', 'resolved_by', 'duration_minutes', 'auto_detected']


@admin.register(FMStation)
class FMStationAdmin(admin.ModelAdmin):
    list_display = ['name', 'frequency', 'organisation', 'current_status', 'last_heartbeat_at', 'is_active']
    list_filter = ['current_status', 'is_active', 'organisation']
    search_fields = ['name', 'frequency']
    readonly_fields = ['heartbeat_token', 'last_status_change', 'last_heartbeat_at']
    inlines = [FMOutageInline]


@admin.register(FMOutage)
class FMOutageAdmin(admin.ModelAdmin):
    list_display = ['station', 'down_at', 'restored_at', 'severity', 'auto_detected', 'alert_sent']
    list_filter = ['severity', 'auto_detected', 'alert_sent']
    search_fields = ['station__name']
    date_hierarchy = 'down_at'
    readonly_fields = ['duration_minutes']


@admin.register(FMHeartbeat)
class FMHeartbeatAdmin(admin.ModelAdmin):
    list_display = ['station', 'received_at', 'success', 'status_code', 'response_ms', 'source_ip']
    list_filter = ['success', 'station']
    date_hierarchy = 'received_at'


class AcknowledgementInline(admin.TabularInline):
    model = EmergencyAlertAcknowledgement
    extra = 0
    readonly_fields = ['user', 'acknowledged_at']


@admin.register(EmergencyAlert)
class EmergencyAlertAdmin(admin.ModelAdmin):
    list_display = ['title', 'organisation', 'severity', 'alert_type', 'resolved', 'created_at']
    list_filter = ['severity', 'alert_type', 'resolved', 'organisation']
    search_fields = ['title', 'description']
    readonly_fields = ['notified_emails', 'notified_phones', 'notification_errors']
    inlines = [AcknowledgementInline]


@admin.register(TransmitterReading)
class TransmitterReadingAdmin(admin.ModelAdmin):
    list_display = ['station', 'recorded_at', 'vswr', 'pa_temperature_celsius', 'forward_power_watts']
    list_filter = ['station']
    date_hierarchy = 'recorded_at'

    def has_change_permission(self, request, obj=None):
        return False  # append-only time series, never edited


@admin.register(ProgrammeSlot)
class ProgrammeSlotAdmin(admin.ModelAdmin):
    list_display = ['title', 'station', 'weekday', 'start_time', 'end_time', 'host', 'is_active']
    list_filter = ['station', 'weekday', 'is_active']
    search_fields = ['title', 'host']


@admin.register(AuditLogEntry)
class AuditLogEntryAdmin(admin.ModelAdmin):
    list_display = ['action', 'actor', 'organisation', 'target_repr', 'created_at']
    list_filter = ['action', 'organisation']
    search_fields = ['target_repr', 'actor__email']
    date_hierarchy = 'created_at'

    def has_change_permission(self, request, obj=None):
        return False  # immutable log

    def has_delete_permission(self, request, obj=None):
        return False