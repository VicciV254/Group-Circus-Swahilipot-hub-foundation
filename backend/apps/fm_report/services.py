"""Nexus FM Report — Business logic separated from views."""
import logging

from django.db import transaction
from django.utils import timezone

from apps.notifications.services import NotificationService

from .models import AuditLogEntry, FMOutage, TransmitterReading

logger = logging.getLogger('fm_report')


def log_action(*, organisation, actor, action, target=None, metadata=None):
    """
    Writes one immutable audit-log row. Never raises — a logging failure
    must never block the actual operation it's recording.
    """
    try:
        AuditLogEntry.objects.create(
            organisation=organisation,
            actor=actor,
            action=action,
            target_repr=str(target) if target is not None else '',
            target_id=str(getattr(target, 'id', '')) if target is not None else '',
            metadata=metadata or {},
        )
    except Exception:
        logger.exception('Failed to write audit log entry action=%s', action)


def get_outage_queryset(request, station_id=None):
    """Shared, filtered queryset for outage list + export endpoints."""
    qs = FMOutage.objects.filter(
        station__organisation=request.user.organisation
    ).select_related('station', 'reported_by', 'resolved_by')

    if station_id:
        qs = qs.filter(station_id=station_id)

    params = request.query_params
    start, end = params.get('start'), params.get('end')
    severity, station_filter = params.get('severity'), params.get('station')

    if start:
        qs = qs.filter(down_at__date__gte=start)
    if end:
        qs = qs.filter(down_at__date__lte=end)
    if severity:
        qs = qs.filter(severity=severity)
    if station_filter:
        qs = qs.filter(station_id=station_filter)

    return qs


@transaction.atomic
def open_outage(station, *, reported_by=None, description='', severity=FMOutage.Severity.MODERATE,
                 auto_detected=False):
    """
    Creates an outage and flips the station to off_air.
    select_for_update prevents a race where two concurrent requests (e.g. a
    manual report and a heartbeat-watchdog tick) both try to open an outage
    for the same station at once.
    """
    station.__class__.objects.select_for_update().get(pk=station.pk)

    existing = station.outages.filter(restored_at__isnull=True).first()
    if existing:
        return existing, False

    outage = FMOutage.objects.create(
        station=station,
        reported_by=reported_by,
        down_at=timezone.now(),
        description=description or (f'Auto-detected: heartbeat timeout exceeded' if auto_detected else ''),
        severity=severity,
        auto_detected=auto_detected,
    )
    station.transition_status(station.Status.OFF_AIR)

    try:
        NotificationService.send_fm_down_alert(station, outage, reported_by)
        outage.alert_sent = True
        outage.save(update_fields=['alert_sent'])
    except Exception:
        logger.exception('Failed to send FM-down notification for station=%s outage=%s', station.id, outage.id)

    log_action(
        organisation=station.organisation,
        actor=reported_by,
        action=AuditLogEntry.Action.OUTAGE_REPORTED,
        target=station,
        metadata={'outage_id': str(outage.id), 'severity': severity, 'auto_detected': auto_detected},
    )

    return outage, True


@transaction.atomic
def restore_outage(station, *, resolved_by, resolution_notes=''):
    """Closes the open outage for a station and flips it back to on_air."""
    outage = station.outages.select_for_update().filter(restored_at__isnull=True).first()
    if not outage:
        return None

    outage.restored_at = timezone.now()
    outage.resolved_by = resolved_by
    outage.resolution_notes = resolution_notes
    outage.save()

    station.transition_status(station.Status.ON_AIR)

    try:
        NotificationService.send_fm_restored_alert(station, outage)
    except Exception:
        logger.exception('Failed to send FM-restored notification for station=%s outage=%s', station.id, outage.id)

    log_action(
        organisation=station.organisation,
        actor=resolved_by,
        action=AuditLogEntry.Action.OUTAGE_RESTORED,
        target=station,
        metadata={'outage_id': str(outage.id), 'duration_minutes': outage.duration_minutes},
    )

    return outage


def record_telemetry(station, *, data: dict) -> TransmitterReading:
    """
    Stores one telemetry sample and, if VSWR or PA temperature crosses a
    critical threshold, opens an auto-detected outage the same way a missed
    heartbeat does — a bad VSWR reading is itself an emergency even if the
    transmitter is technically still "on air".
    """
    reading = TransmitterReading.objects.create(station=station, **data)

    if reading.vswr_critical or reading.pa_temp_warning:
        reasons = []
        if reading.vswr_critical:
            reasons.append(f'VSWR critical ({reading.vswr})')
        if reading.pa_temp_warning:
            reasons.append(f'PA temperature high ({reading.pa_temperature_celsius}°C)')
        open_outage(
            station,
            auto_detected=True,
            severity=FMOutage.Severity.CRITICAL,
            description='Auto-detected: ' + '; '.join(reasons),
        )

    return reading


def dispatch_emergency_alert(alert, triggered_by):
    """Sends the alert and records delivery results/errors on the alert itself."""
    try:
        result = NotificationService.send_emergency_alert(alert, triggered_by)
        alert.notified_emails = result.get('emails', [])
        alert.notified_phones = result.get('phones', [])
        alert.notification_errors = result.get('errors', [])
    except Exception as exc:
        logger.exception('Failed to dispatch emergency alert id=%s', alert.id)
        alert.notification_errors = [str(exc)]
    finally:
        alert.save(update_fields=['notified_emails', 'notified_phones', 'notification_errors'])

    log_action(
        organisation=alert.organisation,
        actor=triggered_by,
        action=AuditLogEntry.Action.ALERT_TRIGGERED,
        target=alert,
        metadata={'severity': alert.severity, 'alert_type': alert.alert_type},
    )