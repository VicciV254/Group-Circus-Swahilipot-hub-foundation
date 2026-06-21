"""Nexus FM Report — URL Configuration"""
from django.urls import path

from .views import (
    AcknowledgeAlertView,
    AuditLogListView,
    EmergencyAlertView,
    FMOutageExportView,
    FMOutageHistoryView,
    FMPresetStreamsView,
    FMStationDetailView,
    FMStationListView,
    FMStreamStatusView,
    NotificationPreferenceView,
    NotificationTestSendView,
    OrgMemberRoleUpdateView,
    OrgMemberRoleView,
    ProgrammeSlotDetailView,
    ProgrammeSlotListView,
    ReportFMDownView,
    ReportFMRestoredView,
    TransmitterReadingListView,
    fm_heartbeat_check_all,
    fm_heartbeat_receive,
    fm_telemetry_receive,
)

app_name = 'fm_report'

urlpatterns = [
    # -- FM Stations ----------------------------------------------------
    path('stations/', FMStationListView.as_view(), name='fm-station-list'),
    path('stations/<uuid:pk>/', FMStationDetailView.as_view(), name='fm-station-detail'),
    path('stations/<uuid:station_id>/down/', ReportFMDownView.as_view(), name='fm-report-down'),
    path('stations/<uuid:station_id>/restored/', ReportFMRestoredView.as_view(), name='fm-report-restored'),
    path('stations/<uuid:station_id>/outages/', FMOutageHistoryView.as_view(), name='fm-outage-history'),

    # -- Heartbeat & telemetry (transmitter hardware, token-authenticated) --
    path('stations/<uuid:station_id>/heartbeat/', fm_heartbeat_receive, name='fm-heartbeat'),
    path('stations/<uuid:station_id>/telemetry/', fm_telemetry_receive, name='fm-telemetry-receive'),
    path('stations/<uuid:station_id>/telemetry/history/', TransmitterReadingListView.as_view(), name='fm-telemetry-history'),

    # -- Programme schedule ----------------------------------------------
    path('stations/<uuid:station_id>/schedule/', ProgrammeSlotListView.as_view(), name='fm-schedule-list'),
    path('schedule/<uuid:pk>/', ProgrammeSlotDetailView.as_view(), name='fm-schedule-detail'),

    # -- All outages -- history table -------------------------------------
    # Query params: start, end, severity, station
    path('outages/', FMOutageHistoryView.as_view(), name='fm-all-outages'),

    # -- Export ------------------------------------------------------------
    # GET /fm/outages/export/?format=csv&start=YYYY-MM-DD&end=YYYY-MM-DD
    path('outages/export/', FMOutageExportView.as_view(), name='fm-outages-export'),

    # -- Emergency alerts ---------------------------------------------------
    path('emergency-alert/', EmergencyAlertView.as_view(), name='emergency-alert'),
    path('emergency-alert/<uuid:alert_id>/acknowledge/', AcknowledgeAlertView.as_view(), name='acknowledge-alert'),

    # -- Live stream proxy health-check --------------------------------------
    path('stream-status/', FMStreamStatusView.as_view(), name='fm-stream-status'),

    # -- Preset / quick streams (env-configured, see backend/.env) -----------
    path('preset-streams/', FMPresetStreamsView.as_view(), name='fm-preset-streams'),

    # -- Periodic heartbeat watchdog (manual trigger; Celery beat normally
    #    calls tasks.check_fm_heartbeats directly instead of this HTTP route) --
    path('heartbeat-check/', fm_heartbeat_check_all, name='fm-heartbeat-check-all'),

    # -- Audit log ------------------------------------------------------
    path('audit-log/', AuditLogListView.as_view(), name='fm-audit-log'),

    # -- Notification preferences --------------------------------------------
    path('notification-preferences/', NotificationPreferenceView.as_view(), name='fm-notification-preferences'),
    path('notification-preferences/test-send/', NotificationTestSendView.as_view(), name='fm-notification-test-send'),

    # -- Role management ---------------------------------------------------
    path('members/', OrgMemberRoleView.as_view(), name='fm-members-list'),
    path('members/<uuid:user_id>/role/', OrgMemberRoleUpdateView.as_view(), name='fm-member-role-update'),
]
