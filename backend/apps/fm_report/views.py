"""Nexus FM Report — API Views"""
import csv
import logging

from django.http import HttpResponse
from django.utils import timezone
from django.utils.html import escape

from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import AuditLogEntry, EmergencyAlert, FMHeartbeat, FMOutage, FMStation, ProgrammeSlot, TransmitterReading
from apps.notifications.models import NotificationPreference
from .permissions import HasValidHeartbeatToken, IsBroadcastAdmin, IsBroadcastAdminOrReadOnly, IsOrgMember, IsOrgOwnerOrSystemAdmin
from .serializers import (
    AcknowledgeAlertSerializer,
    AuditLogEntrySerializer,
    EmergencyAlertSerializer,
    FMOutageSerializer,
    FMStationSerializer,
    NotificationPreferenceSerializer,
    NotificationTestSendSerializer,
    ProgrammeSlotSerializer,
    ReportFMDownSerializer,
    ReportFMRestoredSerializer,
    ReportTelemetrySerializer,
    TransmitterReadingSerializer,
)
from .services import dispatch_emergency_alert, get_outage_queryset, log_action, open_outage, record_telemetry, restore_outage

logger = logging.getLogger('fm_report')


class StandardPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


# ─── FM STATIONS ─────────────────────────────────────────────────────────────

class FMStationListView(generics.ListCreateAPIView):
    serializer_class = FMStationSerializer
    permission_classes = [IsAuthenticated, IsOrgMember, IsBroadcastAdminOrReadOnly]
    pagination_class = StandardPagination

    def get_queryset(self):
        return FMStation.objects.filter(
            organisation=self.request.user.organisation, is_active=True
        ).order_by('name')

    def perform_create(self, serializer):
        station = serializer.save(organisation=self.request.user.organisation)
        log_action(
            organisation=self.request.user.organisation,
            actor=self.request.user,
            action=AuditLogEntry.Action.STATION_CREATED,
            target=station,
        )


class FMStationDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FMStationSerializer
    permission_classes = [IsAuthenticated, IsOrgMember, IsBroadcastAdminOrReadOnly]

    def get_queryset(self):
        return FMStation.objects.filter(organisation=self.request.user.organisation)

    def perform_update(self, serializer):
        station = serializer.save()
        log_action(
            organisation=self.request.user.organisation,
            actor=self.request.user,
            action=AuditLogEntry.Action.STATION_UPDATED,
            target=station,
            metadata={'changed_fields': list(serializer.validated_data.keys())},
        )

    def perform_destroy(self, instance):
        # Soft delete: monitoring history (outages, heartbeats) must be preserved.
        instance.is_active = False
        instance.save(update_fields=['is_active'])
        log_action(
            organisation=self.request.user.organisation,
            actor=self.request.user,
            action=AuditLogEntry.Action.STATION_DELETED,
            target=instance,
        )


# ─── OUTAGE REPORTING ────────────────────────────────────────────────────────

class ReportFMDownView(APIView):
    """Manually mark a station off-air and open an outage record."""
    permission_classes = [IsAuthenticated, IsOrgMember, IsBroadcastAdmin]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'fm_report_writes'

    def post(self, request, station_id):
        try:
            station = FMStation.objects.get(id=station_id, organisation=request.user.organisation)
        except FMStation.DoesNotExist:
            return Response({'detail': 'Station not found.'}, status=status.HTTP_404_NOT_FOUND)

        body = ReportFMDownSerializer(data=request.data)
        body.is_valid(raise_exception=True)

        outage, created = open_outage(
            station,
            reported_by=request.user,
            description=body.validated_data['description'],
            severity=body.validated_data['severity'],
        )
        if not created:
            return Response(
                {'detail': 'Station already reported as down.', 'outage_id': str(outage.id)},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(FMOutageSerializer(outage).data, status=status.HTTP_201_CREATED)


class ReportFMRestoredView(APIView):
    """Mark a station back on-air and close its open outage."""
    permission_classes = [IsAuthenticated, IsOrgMember, IsBroadcastAdmin]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'fm_report_writes'

    def post(self, request, station_id):
        try:
            station = FMStation.objects.get(id=station_id, organisation=request.user.organisation)
        except FMStation.DoesNotExist:
            return Response({'detail': 'Station not found.'}, status=status.HTTP_404_NOT_FOUND)

        body = ReportFMRestoredSerializer(data=request.data)
        body.is_valid(raise_exception=True)

        outage = restore_outage(
            station, resolved_by=request.user,
            resolution_notes=body.validated_data['resolution_notes'],
        )
        if not outage:
            return Response({'detail': 'No active outage found for this station.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(FMOutageSerializer(outage).data)


class FMOutageHistoryView(generics.ListAPIView):
    """
    GET /fm/stations/<station_id>/outages/   — history for one station
    GET /fm/outages/?start=&end=&severity=&station=  — org-wide history
    """
    serializer_class = FMOutageSerializer
    permission_classes = [IsAuthenticated, IsOrgMember]
    pagination_class = StandardPagination

    def get_queryset(self):
        return get_outage_queryset(self.request, self.kwargs.get('station_id'))


# ─── EXPORT ──────────────────────────────────────────────────────────────────

class FMOutageExportView(APIView):
    """
    GET /fm/outages/export/?format=csv&start=YYYY-MM-DD&end=YYYY-MM-DD
    GET /fm/outages/export/?format=pdf
    Capped result set — exports are not paginated but must not be unbounded.
    """
    permission_classes = [IsAuthenticated, IsOrgMember]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'fm_report_export'

    MAX_EXPORT_ROWS = 5000

    def get(self, request):
        export_format = request.query_params.get('format', 'csv').lower()
        qs = get_outage_queryset(request)[: self.MAX_EXPORT_ROWS]

        if export_format == 'csv':
            return self._export_csv(qs)
        if export_format == 'pdf':
            return self._export_pdf_html(qs, request)
        return Response({'detail': 'Invalid format. Use "csv" or "pdf".'}, status=status.HTTP_400_BAD_REQUEST)

    def _export_csv(self, qs):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="fm-outage-report-{timezone.now().date()}.csv"'
        writer = csv.writer(response)
        writer.writerow([
            'Station', 'Frequency', 'Reported By', 'Down At', 'Restored At',
            'Duration (min)', 'Severity', 'Description', 'Resolution Notes',
            'Auto Detected', 'Alert Sent',
        ])
        for o in qs:
            writer.writerow([
                o.station.name,
                o.station.frequency,
                o.reported_by.get_full_name() if o.reported_by else 'Auto-detected',
                o.down_at.strftime('%Y-%m-%d %H:%M:%S') if o.down_at else '',
                o.restored_at.strftime('%Y-%m-%d %H:%M:%S') if o.restored_at else 'Ongoing',
                o.duration_minutes if o.duration_minutes is not None else '',
                o.severity,
                o.description or '',
                o.resolution_notes or '',
                'Yes' if o.auto_detected else 'No',
                'Yes' if o.alert_sent else 'No',
            ])
        return response

    def _export_pdf_html(self, qs, request):
        """
        Print-ready HTML the browser converts to PDF (window.print()).
        All user-controlled fields are HTML-escaped — outage descriptions and
        resolution notes are free text and were previously injected unescaped.
        """
        sev_class_map = {'critical': 'sev-critical', 'moderate': 'sev-moderate', 'minor': 'sev-minor'}
        rows_html = []
        total_down = 0
        critical_count = 0
        ongoing_count = 0

        for o in qs:
            total_down += o.duration_minutes or 0
            if o.severity == 'critical':
                critical_count += 1
            if o.restored_at is None:
                ongoing_count += 1

            restored_cell = (
                escape(o.restored_at.strftime('%Y-%m-%d %H:%M'))
                if o.restored_at else '<span class="ongoing">ONGOING</span>'
            )
            duration_cell = f'{o.duration_minutes}m' if o.duration_minutes is not None else '—'

            rows_html.append(f"""
            <tr>
                <td>{escape(o.station.name)}</td>
                <td>{escape(o.reported_by.get_full_name()) if o.reported_by else 'Auto'}</td>
                <td>{escape(o.down_at.strftime('%Y-%m-%d %H:%M')) if o.down_at else ''}</td>
                <td>{restored_cell}</td>
                <td>{duration_cell}</td>
                <td><span class="{sev_class_map.get(o.severity, '')}">{escape(o.severity.upper())}</span></td>
                <td>{escape(o.description) or '—'}</td>
                <td>{escape(o.resolution_notes) or '—'}</td>
            </tr>""")

        html = PDF_TEMPLATE.format(
            generated_at=timezone.now().strftime('%Y-%m-%d %H:%M:%S'),
            organisation=escape(request.user.organisation.name),
            total=qs.count(),
            critical=critical_count,
            ongoing=ongoing_count,
            total_down=total_down,
            rows=''.join(rows_html) or
                 '<tr><td colspan="8" style="text-align:center;padding:20px;color:#999">'
                 'No outages in this period</td></tr>',
        )

        response = HttpResponse(html, content_type='text/html')
        response['Content-Disposition'] = f'inline; filename="fm-outage-report-{timezone.now().date()}.html"'
        return response


PDF_TEMPLATE = """<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>FM Outage Report</title>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font-family:'Segoe UI',sans-serif;color:#1a1a2e;padding:40px;font-size:12px}}
  .header{{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #0f3460}}
  .logo{{font-size:22px;font-weight:800;color:#0f3460;letter-spacing:2px}}
  .logo span{{color:#e94560}}
  .meta{{text-align:right;color:#666;font-size:11px;line-height:1.8}}
  .stats{{display:flex;gap:20px;margin-bottom:28px}}
  .stat{{background:#f8f9fa;border:1px solid #e9ecef;border-radius:8px;padding:12px 18px;text-align:center;min-width:110px}}
  .stat-val{{font-size:22px;font-weight:800;color:#0f3460}}
  .stat-lbl{{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-top:2px}}
  table{{width:100%;border-collapse:collapse;margin-top:8px}}
  th{{background:#0f3460;color:white;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px}}
  td{{padding:7px 10px;border-bottom:1px solid #f0f0f0;vertical-align:top}}
  tr:nth-child(even) td{{background:#fafafa}}
  .ongoing{{color:#dc2626;font-weight:700;font-size:10px}}
  .sev-critical{{color:#dc2626;font-weight:700}}
  .sev-moderate{{color:#d97706;font-weight:700}}
  .sev-minor{{color:#2563eb;font-weight:600}}
  .footer{{margin-top:32px;padding-top:16px;border-top:1px solid #e0e0e0;color:#999;font-size:10px;text-align:center}}
  @media print{{body{{padding:20px}}}}
</style></head><body>
<div class="header">
  <div>
    <div class="logo">NEXUS <span>FM</span></div>
    <div style="font-size:13px;font-weight:600;color:#444;margin-top:4px">FM Station Outage Report</div>
  </div>
  <div class="meta">
    <div>Generated: {generated_at}</div>
    <div>Organisation: {organisation}</div>
    <div>Total incidents: {total}</div>
  </div>
</div>
<div class="stats">
  <div class="stat"><div class="stat-val">{total}</div><div class="stat-lbl">Total Outages</div></div>
  <div class="stat"><div class="stat-val">{critical}</div><div class="stat-lbl">Critical</div></div>
  <div class="stat"><div class="stat-val">{ongoing}</div><div class="stat-lbl">Ongoing</div></div>
  <div class="stat"><div class="stat-val">{total_down}m</div><div class="stat-lbl">Total Downtime</div></div>
</div>
<table>
  <thead>
    <tr>
      <th>Station</th><th>Reported By</th><th>Down At</th><th>Restored At</th>
      <th>Duration</th><th>Severity</th><th>Description</th><th>Resolution</th>
    </tr>
  </thead>
  <tbody>
    {rows}
  </tbody>
</table>
<div class="footer">Nexus FM Broadcast Monitoring System — Confidential</div>
</body></html>"""


# ─── EMERGENCY ALERTS ────────────────────────────────────────────────────────

class EmergencyAlertView(APIView):
    """List/trigger organisation-wide emergency alerts."""
    permission_classes = [IsAuthenticated, IsOrgMember]
    pagination_class = StandardPagination

    def get_permissions(self):
        # Anyone in the org can view alerts; only admins can trigger one.
        if self.request.method == 'POST':
            return [IsAuthenticated(), IsOrgMember(), IsBroadcastAdmin()]
        return super().get_permissions()

    def get(self, request):
        alerts = EmergencyAlert.objects.filter(
            organisation=request.user.organisation
        ).select_related('triggered_by', 'resolved_by').prefetch_related(
            'emergencyalertacknowledgement_set__user'
        ).order_by('-created_at')[:100]
        return Response(EmergencyAlertSerializer(alerts, many=True).data)

    def post(self, request):
        serializer = EmergencyAlertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        alert = serializer.save(
            organisation=request.user.organisation,
            triggered_by=request.user,
        )
        dispatch_emergency_alert(alert, request.user)
        alert.refresh_from_db()
        return Response(EmergencyAlertSerializer(alert).data, status=status.HTTP_201_CREATED)


class AcknowledgeAlertView(APIView):
    """
    Acknowledge an emergency alert. Acknowledgement is per-user and idempotent;
    resolving the alert for everyone is a separate, explicit flag so one admin
    clicking "Acknowledge" doesn't silently close it for the whole org.
    """
    permission_classes = [IsAuthenticated, IsOrgMember, IsBroadcastAdmin]

    def post(self, request, alert_id):
        try:
            alert = EmergencyAlert.objects.get(id=alert_id, organisation=request.user.organisation)
        except EmergencyAlert.DoesNotExist:
            return Response({'detail': 'Alert not found.'}, status=status.HTTP_404_NOT_FOUND)

        body = AcknowledgeAlertSerializer(data=request.data)
        body.is_valid(raise_exception=True)

        if not alert.acknowledged_by.filter(pk=request.user.pk).exists():
            alert.acknowledged_by.add(request.user)
            log_action(
                organisation=request.user.organisation,
                actor=request.user,
                action=AuditLogEntry.Action.ALERT_ACKNOWLEDGED,
                target=alert,
            )

        if body.validated_data['resolve'] and not alert.resolved:
            alert.resolve(request.user, notes=body.validated_data['resolution_notes'])
            log_action(
                organisation=request.user.organisation,
                actor=request.user,
                action=AuditLogEntry.Action.ALERT_RESOLVED,
                target=alert,
            )

        alert.refresh_from_db()
        return Response(EmergencyAlertSerializer(alert).data)


# ─── PRESET STREAMS ───────────────────────────────────────────────────────────

class FMPresetStreamsView(APIView):
    """
    GET /fm/preset-streams/

    Read-only list of "quick stream" entries the Live Player can offer even
    before any FMStation has a stream_url configured in the database (e.g. a
    demo/default station for a freshly-provisioned org). Sourced from the
    FM_PRESET_STREAMS_JSON environment variable — see backend/.env — rather
    than hardcoded in source, so these can be added or changed without a
    code deploy. Defaults to an empty list when unset.
    """
    permission_classes = [IsAuthenticated, IsOrgMember]

    def get(self, request):
        from django.conf import settings
        return Response(getattr(settings, 'FM_PRESET_STREAMS', []))


# ─── STREAM HEALTH CHECK ─────────────────────────────────────────────────────

class FMStreamStatusView(APIView):
    """
    Server-side health check for the public live-stream URL, so the browser
    avoids CORS issues. Pulled from the station record rather than hardcoded,
    and run with a short socket timeout off the request-handling thread pool
    limit via a hard ceiling — never block longer than CHECK_TIMEOUT seconds.
    """
    permission_classes = [IsAuthenticated, IsOrgMember]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'fm_stream_check'

    CHECK_TIMEOUT = 5  # seconds — keep short, this runs in the request thread

    def get(self, request):
        import time
        import requests as http_requests  # explicit timeout + connection pooling, unlike urllib

        station_id = request.query_params.get('station')
        station = None
        if station_id:
            station = FMStation.objects.filter(
                id=station_id, organisation=request.user.organisation
            ).first()
            stream_url = station.stream_url if station else None
        else:
            station = FMStation.objects.filter(
                organisation=request.user.organisation, is_active=True,
            ).exclude(stream_url='').first()
            stream_url = station.stream_url if station else None

        if not stream_url:
            return Response({'detail': 'No stream URL configured for this station.'}, status=status.HTTP_400_BAD_REQUEST)

        start = time.monotonic()
        live = False
        error = None
        try:
            resp = http_requests.head(stream_url, timeout=self.CHECK_TIMEOUT, allow_redirects=True)
            live = resp.status_code < 400
        except http_requests.RequestException as exc:
            error = str(exc)
            logger.warning('Stream check failed for %s: %s', stream_url, exc)

        return Response({
            'live': live,
            'checked_at': timezone.now().isoformat(),
            'response_ms': int((time.monotonic() - start) * 1000),
            'stream_url': stream_url,
            'station': station.name if station else None,
            'error': error,
        })


# ─── HEARTBEAT (called by transmitter hardware) ──────────────────────────────

@api_view(['POST'])
@permission_classes([HasValidHeartbeatToken])
@throttle_classes([ScopedRateThrottle])
def fm_heartbeat_receive(request, station_id):
    """
    Endpoint called by transmitter hardware. Authenticated by a per-station
    shared-secret token (X-Heartbeat-Token header) instead of AllowAny, which
    previously let anyone forge a heartbeat for any station UUID and silently
    auto-resolve a real outage.
    """
    fm_heartbeat_receive.throttle_scope = 'fm_heartbeat'

    try:
        station = FMStation.objects.get(id=station_id, is_active=True)
    except FMStation.DoesNotExist:
        return Response({'status': 'error', 'detail': 'Station not found.'}, status=status.HTTP_404_NOT_FOUND)

    token = request.headers.get('X-Heartbeat-Token', '')
    if str(station.heartbeat_token) != token:
        logger.warning('Rejected heartbeat for station=%s: invalid token from %s', station_id, request.META.get('REMOTE_ADDR'))
        return Response({'status': 'error', 'detail': 'Invalid heartbeat token.'}, status=status.HTTP_403_FORBIDDEN)

    now = timezone.now()
    FMHeartbeat.objects.create(
        station=station, success=True, status_code=200,
        source_ip=request.META.get('REMOTE_ADDR'),
    )
    station.last_heartbeat_at = now

    if station.current_status != FMStation.Status.ON_AIR:
        open_outage_record = station.active_outage
        if open_outage_record and open_outage_record.auto_detected:
            restore_outage(station, resolved_by=None, resolution_notes='Auto-restored: heartbeat resumed.')
        else:
            station.transition_status(FMStation.Status.ON_AIR)

    station.save(update_fields=['last_heartbeat_at'])
    return Response({'status': 'ok', 'received_at': now.isoformat()})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def fm_heartbeat_check_all(request):
    """
    Watchdog endpoint — intended to be called from Celery beat every few
    minutes, not directly from the frontend. Flags any on-air station whose
    heartbeat has gone silent past its configured timeout.
    POST /fm/heartbeat-check/
    """
    flagged = []
    stations = FMStation.objects.filter(is_active=True).exclude(heartbeat_url='')

    for station in stations:
        if station.current_status == FMStation.Status.ON_AIR and station.is_heartbeat_overdue():
            outage, created = open_outage(station, auto_detected=True, severity=FMOutage.Severity.CRITICAL)
            if created:
                flagged.append({
                    'station': station.name,
                    'outage_id': str(outage.id),
                    'down_at': outage.down_at.isoformat(),
                })

    return Response({'flagged': flagged, 'checked': stations.count()})


# ─── TRANSMITTER TELEMETRY ────────────────────────────────────────────────────

class TransmitterReadingListView(generics.ListAPIView):
    """GET /fm/stations/<station_id>/telemetry/?hours=24 — recent readings for charts."""
    serializer_class = TransmitterReadingSerializer
    permission_classes = [IsAuthenticated, IsOrgMember]
    pagination_class = StandardPagination

    def get_queryset(self):
        station = FMStation.objects.filter(
            id=self.kwargs['station_id'], organisation=self.request.user.organisation,
        ).first()
        if not station:
            return TransmitterReading.objects.none()

        qs = station.readings.all()
        hours = self.request.query_params.get('hours')
        if hours:
            try:
                since = timezone.now() - timezone.timedelta(hours=int(hours))
                qs = qs.filter(recorded_at__gte=since)
            except ValueError:
                pass
        return qs


@api_view(['POST'])
@permission_classes([HasValidHeartbeatToken])
@throttle_classes([ScopedRateThrottle])
def fm_telemetry_receive(request, station_id):
    """
    Endpoint called by transmitter hardware to report technical readings
    (forward/reflected power, VSWR, PA temperature, etc). Same token auth as
    the plain heartbeat endpoint. A critical VSWR or PA-temperature reading
    auto-opens an outage even if the station otherwise looks on-air.
    """
    fm_telemetry_receive.throttle_scope = 'fm_heartbeat'

    try:
        station = FMStation.objects.get(id=station_id, is_active=True)
    except FMStation.DoesNotExist:
        return Response({'detail': 'Station not found.'}, status=status.HTTP_404_NOT_FOUND)

    token = request.headers.get('X-Heartbeat-Token', '')
    if str(station.heartbeat_token) != token:
        logger.warning('Rejected telemetry for station=%s: invalid token', station_id)
        return Response({'detail': 'Invalid heartbeat token.'}, status=status.HTTP_403_FORBIDDEN)

    body = ReportTelemetrySerializer(data=request.data)
    body.is_valid(raise_exception=True)

    reading = record_telemetry(station, data=body.validated_data)
    return Response(TransmitterReadingSerializer(reading).data, status=status.HTTP_201_CREATED)


# ─── PROGRAMME SCHEDULE ──────────────────────────────────────────────────────

class ProgrammeSlotListView(generics.ListCreateAPIView):
    """
    GET  /fm/stations/<station_id>/schedule/  — weekly schedule for one station
    POST /fm/stations/<station_id>/schedule/  — add a slot (admin only)
    """
    serializer_class = ProgrammeSlotSerializer
    permission_classes = [IsAuthenticated, IsOrgMember, IsBroadcastAdminOrReadOnly]

    def get_queryset(self):
        return ProgrammeSlot.objects.filter(
            station_id=self.kwargs['station_id'],
            station__organisation=self.request.user.organisation,
        )

    def perform_create(self, serializer):
        station = FMStation.objects.get(
            id=self.kwargs['station_id'], organisation=self.request.user.organisation,
        )
        slot = serializer.save(station=station)
        log_action(
            organisation=self.request.user.organisation,
            actor=self.request.user,
            action=AuditLogEntry.Action.SCHEDULE_UPDATED,
            target=slot,
            metadata={'action': 'created'},
        )


class ProgrammeSlotDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ProgrammeSlotSerializer
    permission_classes = [IsAuthenticated, IsOrgMember, IsBroadcastAdminOrReadOnly]

    def get_queryset(self):
        return ProgrammeSlot.objects.filter(station__organisation=self.request.user.organisation)

    def perform_update(self, serializer):
        slot = serializer.save()
        log_action(
            organisation=self.request.user.organisation,
            actor=self.request.user,
            action=AuditLogEntry.Action.SCHEDULE_UPDATED,
            target=slot,
            metadata={'action': 'updated'},
        )

    def perform_destroy(self, instance):
        log_action(
            organisation=self.request.user.organisation,
            actor=self.request.user,
            action=AuditLogEntry.Action.SCHEDULE_UPDATED,
            target=instance,
            metadata={'action': 'deleted'},
        )
        instance.delete()


# ─── AUDIT LOG ───────────────────────────────────────────────────────────────

class AuditLogListView(generics.ListAPIView):
    """
    GET /fm/audit-log/?action=&start=&end=
    Read-only activity feed — who did what, when. Visible to any org member;
    writing entries only happens internally via services.log_action.
    """
    serializer_class = AuditLogEntrySerializer
    permission_classes = [IsAuthenticated, IsOrgMember]
    pagination_class = StandardPagination

    def get_queryset(self):
        qs = AuditLogEntry.objects.filter(
            organisation=self.request.user.organisation
        ).select_related('actor')

        params = self.request.query_params
        if action := params.get('action'):
            qs = qs.filter(action=action)
        if start := params.get('start'):
            qs = qs.filter(created_at__date__gte=start)
        if end := params.get('end'):
            qs = qs.filter(created_at__date__lte=end)
        return qs


# ─── NOTIFICATION PREFERENCES ────────────────────────────────────────────────

class NotificationPreferenceView(APIView):
    """GET/PATCH the current user's own FM notification preferences."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        prefs, _created = NotificationPreference.objects.get_or_create(user=request.user)
        return Response(NotificationPreferenceSerializer(prefs).data)

    def patch(self, request):
        prefs, _created = NotificationPreference.objects.get_or_create(user=request.user)
        serializer = NotificationPreferenceSerializer(prefs, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # phone_number is a SerializerMethodField (read-only) backed by
        # User.phone, not a real column on NotificationPreference — save it
        # separately when present in the request body.
        if 'phone_number' in request.data:
            request.user.phone = request.data['phone_number']
            request.user.save(update_fields=['phone'])

        log_action(
            organisation=getattr(request.user, 'organisation', None),
            actor=request.user,
            action=AuditLogEntry.Action.NOTIFICATION_PREFS_UPDATED,
            target=request.user,
        )
        # Re-serialize so the response reflects the just-saved phone number.
        return Response(NotificationPreferenceSerializer(prefs).data)


class NotificationTestSendView(APIView):
    """POST /fm/notification-preferences/test-send/ {"channel": "email"|"sms"}"""
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'fm_report_writes'

    def post(self, request):
        body = NotificationTestSendSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        channel = body.validated_data['channel']

        # Ensure a preference row exists (not strictly needed for the test
        # send itself, but keeps behavior consistent with the settings tab
        # which always expects one to exist by the time this is callable).
        NotificationPreference.objects.get_or_create(user=request.user)

        phone = getattr(request.user, 'phone', '')
        if channel == 'sms' and not phone:
            return Response(
                {'detail': 'Add a phone number in your profile before testing SMS.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # NotificationService has no dedicated "test message" method —
            # use the same primitives the rest of the app already calls
            # (send_email / send_sms) rather than inventing a new method.
            from apps.notifications.services import NotificationService
            if channel == 'email':
                sent = NotificationService.send_email(
                    request.user.email,
                    'Nexus FM — Test Notification',
                    'This is a test notification from your FM Ops notification settings. '
                    'If you received this, email alerts are working correctly.',
                )
            else:
                sent = NotificationService.send_sms(
                    phone,
                    'Nexus FM test SMS — your alert notifications are working correctly.',
                )
        except Exception:
            logger.exception('Test notification failed for user=%s channel=%s', request.user.id, channel)
            return Response({'detail': f'Failed to send test {channel}.'}, status=status.HTTP_502_BAD_GATEWAY)

        if not sent:
            return Response(
                {'detail': f'Test {channel} could not be sent — check {channel} configuration (e.g. SMS_API_KEY, EMAIL_HOST).'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({'detail': f'Test {channel} sent.'})


# ─── ROLE MANAGEMENT ─────────────────────────────────────────────────────────

ASSIGNABLE_ROLES = ['broadcast_admin', 'broadcast_staff', 'viewer']


class OrgMemberRoleView(APIView):
    """
    GET  /fm/members/           — list org members and their FM-relevant role
    PATCH /fm/members/<id>/role/ — change a member's role (owner/system_admin only)
    """
    permission_classes = [IsAuthenticated, IsOrgMember]

    def get(self, request):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        members = User.objects.filter(organisation=request.user.organisation).order_by('first_name')
        return Response([
            {
                'id': str(m.id),
                'name': m.get_full_name() or m.email,
                'email': m.email,
                'role': getattr(m, 'role', 'viewer'),
                'is_org_owner': getattr(m, 'is_org_owner', False),
            }
            for m in members
        ])


class OrgMemberRoleUpdateView(APIView):
    permission_classes = [IsAuthenticated, IsOrgMember, IsOrgOwnerOrSystemAdmin]

    def patch(self, request, user_id):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        new_role = request.data.get('role')
        if new_role not in ASSIGNABLE_ROLES:
            return Response(
                {'detail': f'Role must be one of: {", ".join(ASSIGNABLE_ROLES)}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            member = User.objects.get(id=user_id, organisation=request.user.organisation)
        except User.DoesNotExist:
            return Response({'detail': 'Member not found.'}, status=status.HTTP_404_NOT_FOUND)

        if member.id == request.user.id:
            return Response({'detail': 'You cannot change your own role.'}, status=status.HTTP_400_BAD_REQUEST)

        old_role = getattr(member, 'role', None)
        member.role = new_role
        member.save(update_fields=['role'])

        log_action(
            organisation=request.user.organisation,
            actor=request.user,
            action=AuditLogEntry.Action.ROLE_CHANGED,
            target=member,
            metadata={'old_role': old_role, 'new_role': new_role},
        )
        return Response({'id': str(member.id), 'role': member.role})
    