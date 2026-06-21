"""apps.news.tasks
Celery background tasks for the News CMS and Broadcast app.

Registered automatically by NewsConfig.ready() via django-celery-beat.
Can also be triggered manually:
    from apps.news.tasks import auto_publish_scheduled_stories
    auto_publish_scheduled_stories.delay()
"""
from __future__ import annotations

import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


# ─── News Stories ─────────────────────────────────────────────────────────────

@shared_task(name="apps.news.tasks.auto_publish_scheduled_stories", bind=True, max_retries=3)
def auto_publish_scheduled_stories(self):
    """
    Publish all approved stories whose scheduled_publish_at is in the past.
    Runs every 5 minutes via Celery Beat.
    """
    from .models import NewsStory

    now = timezone.now()
    stories = NewsStory.objects.filter(
        status="approved",
        scheduled_publish_at__lte=now,
    ).select_related("author")

    published = 0
    for story in stories:
        try:
            story.status = "published"
            story.published_at = now
            story.save(update_fields=["status", "published_at"])
            logger.info("Auto-published story %s (%s)", story.id, story.title)
            published += 1
        except Exception as exc:
            logger.exception("Failed to auto-publish story %s: %s", story.id, exc)

    logger.info("auto_publish_scheduled_stories: published %d stories", published)
    return {"published": published}


@shared_task(name="apps.news.tasks.auto_archive_expired_stories", bind=True, max_retries=3)
def auto_archive_expired_stories(self):
    """
    Archive stories whose expires_at is in the past.
    Runs once per day.
    """
    from .models import NewsStory

    now = timezone.now()
    qs = NewsStory.objects.filter(
        expires_at__lte=now,
        status__in=["published", "approved"],
    )
    count = qs.count()
    qs.update(status="archived")
    logger.info("auto_archive_expired_stories: archived %d stories", count)
    return {"archived": count}


# ─── Radio Reminders ──────────────────────────────────────────────────────────

@shared_task(name="apps.news.tasks.send_slot_reminders", bind=True, max_retries=3)
def send_slot_reminders(self):
    """
    Send 24-hour and 2-hour reminders to presenters for upcoming radio slots.
    Runs every 15 minutes.
    """
    from datetime import timedelta
    from .models import RadioSlot

    now = timezone.now()
    sent_24h = 0
    sent_2h  = 0

    # 24-hour window: slots starting between 23h55m and 24h05m from now
    window_24h_start = now + timedelta(hours=23, minutes=55)
    window_24h_end   = now + timedelta(hours=24, minutes=5)

    for slot in RadioSlot.objects.filter(
        status="scheduled",
        reminder_24h_sent=False,
        start_datetime__gte=window_24h_start,
        start_datetime__lte=window_24h_end,
    ).select_related("presenter", "co_presenter", "show", "frequency"):
        try:
            _send_slot_reminder(slot, hours=24)
            slot.reminder_24h_sent = True
            slot.save(update_fields=["reminder_24h_sent"])
            sent_24h += 1
        except Exception as exc:
            logger.exception("24h reminder failed for slot %s: %s", slot.id, exc)

    # 2-hour window: slots starting between 1h55m and 2h05m from now
    window_2h_start = now + timedelta(hours=1, minutes=55)
    window_2h_end   = now + timedelta(hours=2, minutes=5)

    for slot in RadioSlot.objects.filter(
        status="scheduled",
        reminder_2h_sent=False,
        start_datetime__gte=window_2h_start,
        start_datetime__lte=window_2h_end,
    ).select_related("presenter", "co_presenter", "show", "frequency"):
        try:
            _send_slot_reminder(slot, hours=2)
            slot.reminder_2h_sent = True
            slot.save(update_fields=["reminder_2h_sent"])
            sent_2h += 1
        except Exception as exc:
            logger.exception("2h reminder failed for slot %s: %s", slot.id, exc)

    logger.info("send_slot_reminders: sent %d×24h, %d×2h reminders", sent_24h, sent_2h)
    return {"sent_24h": sent_24h, "sent_2h": sent_2h}


def _send_slot_reminder(slot, hours: int):
    try:
        from apps.notifications.services import NotificationService

        label = f"{hours} hour{'s' if hours != 1 else ''}"
        message = (
            f"Reminder: you are presenting '{slot.show.name}' on "
            f"{slot.frequency.name} ({slot.frequency.frequency_mhz} MHz) "
            f"in {label} at {slot.start_datetime.strftime('%H:%M')}."
        )
        title = f"On air in {label} — {slot.show.name}"

        NotificationService.notify_user(slot.presenter, title, message, "slot_reminder")
        if slot.co_presenter:
            NotificationService.notify_user(slot.co_presenter, title, message, "slot_reminder")

        if not slot.show_plan_submitted_at and hours <= 2:
            NotificationService.notify_user(
                slot.presenter,
                title=f"Show plan not submitted — {slot.show.name}",
                message="You haven't submitted a show plan yet. Please do so before going on air.",
                notification_type="show_plan_missing",
            )
    except Exception:
        pass


# ─── Subscription Expiry ──────────────────────────────────────────────────────

@shared_task(name="apps.news.tasks.update_subscription_statuses", bind=True, max_retries=3)
def update_subscription_statuses(self):
    """
    Refresh SoftwareSubscription.status based on expiry_date,
    and send 30-day / 7-day expiry alert notifications to admins.
    Runs every hour.
    """
    from datetime import timedelta
    from .models import SoftwareSubscription
    from apps.accounts.models import User

    now_date  = timezone.now().date()
    updated   = 0
    alerts_30 = 0
    alerts_7  = 0

    for sub in SoftwareSubscription.objects.filter(status__in=["active", "expiring_soon"]):
        days = (sub.expiry_date - now_date).days

        # Update status field
        new_status = "expired" if days < 0 else ("expiring_soon" if days <= 30 else "active")
        if sub.status != new_status:
            sub.status = new_status
            sub.save(update_fields=["status"])
            updated += 1

        # 30-day alert
        if days <= 30 and not sub.alert_30_sent:
            _send_expiry_alert(sub, days, "alert_30_sent")
            sub.alert_30_sent = True
            sub.save(update_fields=["alert_30_sent"])
            alerts_30 += 1

        # 7-day alert
        if days <= 7 and not sub.alert_7_sent:
            _send_expiry_alert(sub, days, "alert_7_sent")
            sub.alert_7_sent = True
            sub.save(update_fields=["alert_7_sent"])
            alerts_7 += 1

    logger.info(
        "update_subscription_statuses: updated=%d, alerts_30=%d, alerts_7=%d",
        updated, alerts_30, alerts_7,
    )
    return {"updated": updated, "alerts_30": alerts_30, "alerts_7": alerts_7}


def _send_expiry_alert(sub, days_remaining: int, alert_field: str):
    try:
        from apps.accounts.models import User
        from apps.notifications.services import NotificationService

        admins = User.objects.filter(
            organisation=sub.organisation,
            role__in=["broadcast_admin", "ict", "system_admin"],
            is_active=True,
        )
        urgency = "URGENT: " if days_remaining <= 7 else ""
        title   = f"{urgency}Licence expiring in {days_remaining} day{'s' if days_remaining != 1 else ''} — {sub.software_name}"
        message = (
            f"The licence for {sub.software_name} (vendor: {sub.vendor or 'N/A'}) "
            f"expires on {sub.expiry_date.strftime('%d %b %Y')} "
            f"({days_remaining} day{'s' if days_remaining != 1 else ''} remaining). "
            f"Please arrange renewal."
        )
        for admin in admins:
            NotificationService.notify_user(admin, title, message, "licence_expiry")
    except Exception:
        pass
