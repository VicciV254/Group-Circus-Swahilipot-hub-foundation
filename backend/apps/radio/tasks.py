"""
apps/radio/tasks.py
───────────────────
Celery task: send a server-side email reminder to each presenter whose radio
slot starts in 25–35 minutes (the beat fires every 5 min, so this window
ensures exactly one email per slot without duplicates).

Run the worker + beat:
    celery -A Nexus worker -l info -Q default
    celery -A Nexus beat   -l info \
           --scheduler django_celery_beat.schedulers:DatabaseScheduler
"""

from __future__ import annotations

import logging
from datetime import timedelta
from urllib.parse import urlencode

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helper: build a pre-filled Google Calendar URL
# ---------------------------------------------------------------------------
def _gcal_url(slot) -> str:
    def _fmt(dt):
        return dt.strftime("%Y%m%dT%H%M%SZ") if dt else ""

    params = {
        "action": "TEMPLATE",
        "text": slot.show_name,
        "dates": f"{_fmt(slot.start_datetime)}/{_fmt(slot.end_datetime)}",
        "details": getattr(slot, "notes", "") or "",
        "location": getattr(slot, "location", "") or "",
    }
    return f"https://calendar.google.com/calendar/render?{urlencode(params)}"


# ---------------------------------------------------------------------------
# Main task — registered with Celery beat every 5 minutes
# ---------------------------------------------------------------------------
@shared_task(name="apps.radio.tasks.send_slot_reminders", bind=True, max_retries=2)
def send_slot_reminders(self):
    """
    Query all scheduled slots whose start_datetime falls in [now+25, now+35].
    For each one, send the assigned presenter a 30-minute reminder email.

    Uses a `reminded_30min` boolean field on RadioSlot to prevent duplicate
    emails.  Add the field + migration if it doesn't exist:

        class RadioSlot(models.Model):
            ...
            reminded_30min = models.BooleanField(default=False)
    """
    try:
        from apps.radio.models import RadioSlot  # noqa: PLC0415
    except ImportError:
        logger.warning("apps.radio.models.RadioSlot not importable — skipping reminders.")
        return {"skipped": True}

    now = timezone.now()
    window_start = now + timedelta(minutes=25)
    window_end = now + timedelta(minutes=35)

    slots = RadioSlot.objects.filter(
        start_datetime__gte=window_start,
        start_datetime__lte=window_end,
        status="scheduled",
        reminded_30min=False,
    ).select_related("presenter")

    sent = 0
    failed = 0

    for slot in slots:
        presenter = slot.presenter
        if not presenter or not getattr(presenter, "email", None):
            logger.warning("Slot %s has no presenter email — skipping reminder.", slot.id)
            slot.reminded_30min = True
            slot.save(update_fields=["reminded_30min"])
            continue

        email = presenter.email
        show_name = slot.show_name
        start_local = slot.start_datetime.astimezone(
            timezone.get_current_timezone()
        )
        start_str = start_local.strftime("%d %b %Y at %H:%M")
        gcal = _gcal_url(slot)
        minutes_away = int((slot.start_datetime - now).total_seconds() / 60)

        subject = f"[Nexus Radio] ⏰ On air in ~{minutes_away} min — {show_name}"

        html_body = f"""
<html><body style="font-family:sans-serif;color:#1e293b;max-width:600px;margin:auto;">
  <div style="background:#1e2538;padding:24px 28px;border-radius:12px;">
    <h2 style="color:#f59e0b;margin:0 0 4px;">⏰ On Air in ~{minutes_away} Minutes</h2>
    <p style="color:#94a3b8;margin:0 0 20px;font-size:14px;">Nexus Radio — Broadcast Reminder</p>

    <div style="background:#0f172a;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr>
          <td style="color:#64748b;padding:4px 0;width:110px;">Show</td>
          <td style="color:#f1f5f9;font-weight:600;">{show_name}</td>
        </tr>
        <tr>
          <td style="color:#64748b;padding:4px 0;">Air time</td>
          <td style="color:#f1f5f9;">{start_str}</td>
        </tr>
        {'<tr><td style="color:#64748b;padding:4px 0;">Location</td>'
          f'<td style="color:#f1f5f9;">{slot.location}</td></tr>'
          if getattr(slot, "location", "") else ""}
        {'<tr><td style="color:#64748b;padding:4px 0;">Frequency</td>'
          f'<td style="color:#f1f5f9;">{slot.frequency_name}</td></tr>'
          if getattr(slot, "frequency_name", "") else ""}
      </table>
    </div>

    <div style="margin-bottom:16px;">
      <a href="{gcal}"
         style="display:inline-block;background:#3b63f5;color:#fff;
                padding:10px 22px;border-radius:8px;text-decoration:none;
                font-size:14px;font-weight:600;">
        📅 Add to Google Calendar
      </a>
    </div>

    <p style="color:#475569;font-size:12px;margin:0;">
      Please ensure you are at your broadcast station and ready to go live.
      This is an automated reminder from Nexus Broadcast Management.
    </p>
  </div>
</body></html>
"""

        plain_body = (
            f"REMINDER: {show_name} is on air in approximately {minutes_away} minutes.\n"
            f"Air time: {start_str}\n"
            + (f"Location: {slot.location}\n" if getattr(slot, "location", "") else "")
            + f"\nAdd to Google Calendar:\n{gcal}"
        )

        try:
            send_mail(
                subject=subject,
                message=plain_body,
                html_message=html_body,
                from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@nexus.local"),
                recipient_list=[email],
                fail_silently=False,
            )
            slot.reminded_30min = True
            slot.save(update_fields=["reminded_30min"])
            logger.info("30-min reminder sent to %s for slot %s (%s)", email, slot.id, show_name)
            sent += 1
        except Exception as exc:
            logger.exception("Failed to send reminder for slot %s: %s", slot.id, exc)
            failed += 1
            # Retry the whole task (Celery will retry up to max_retries times)
            try:
                raise self.retry(exc=exc, countdown=60)
            except self.MaxRetriesExceededError:
                pass

    return {"sent": sent, "failed": failed}