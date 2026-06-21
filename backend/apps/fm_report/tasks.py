"""Nexus FM Report — Celery periodic tasks"""
import logging

from celery import shared_task

from .models import FMOutage, FMStation
from .services import open_outage

logger = logging.getLogger('fm_report')


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def check_fm_heartbeats(self):
    """
    Runs every 2–5 minutes via Celery beat. Flags any on-air station whose
    heartbeat has gone silent past its configured timeout and opens an
    auto-detected outage (which triggers notifications).
    Mirrors the logic in views.fm_heartbeat_check_all so the HTTP endpoint
    and the scheduled task can never drift apart.
    """
    flagged = []
    try:
        stations = FMStation.objects.filter(is_active=True).exclude(heartbeat_url='')
        for station in stations:
            if station.current_status == FMStation.Status.ON_AIR and station.is_heartbeat_overdue():
                outage, created = open_outage(
                    station, auto_detected=True, severity=FMOutage.Severity.CRITICAL,
                )
                if created:
                    flagged.append(str(outage.id))
                    logger.warning('Auto-flagged station=%s off-air (heartbeat overdue)', station.id)
    except Exception as exc:
        logger.exception('check_fm_heartbeats task failed')
        raise self.retry(exc=exc)

    return {'flagged': flagged, 'count': len(flagged)}


@shared_task
def reset_daily_uptime_counters():
    """Runs at midnight via Celery beat — clears the legacy daily counter if still in use."""
    FMStation.objects.filter(is_active=True).update(total_uptime_today=0)
