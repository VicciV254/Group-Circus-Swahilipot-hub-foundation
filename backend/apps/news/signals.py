"""apps.news.signals
Post-save / pre-save signal handlers for the News CMS and Radio app.
All notification calls are fire-and-forget (try/except) so a notification
failure never breaks the primary write path.
"""
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone


# ─── NewsStory signals ────────────────────────────────────────────────────────

@receiver(pre_save, sender="news.NewsStory")
def news_story_pre_save(sender, instance, **kwargs):
    """
    Capture the old status before saving so post_save can compare.
    Attach it as a transient attribute — not persisted to DB.
    """
    if instance.pk:
        try:
            instance._old_status = sender.objects.get(pk=instance.pk).status
        except sender.DoesNotExist:
            instance._old_status = None
    else:
        instance._old_status = None


@receiver(post_save, sender="news.NewsStory")
def news_story_post_save(sender, instance, created, **kwargs):
    old = getattr(instance, "_old_status", None)
    new = instance.status

    if created:
        _notify_editors_new_draft(instance)
        return

    if old == new:
        return

    # Story submitted → notify editors
    if new == "submitted":
        _notify_editors_submitted(instance)

    # Changes requested → notify author
    elif new == "changes_requested":
        _notify_author(
            instance,
            title=f"Changes requested — {instance.title}",
            message=instance.changes_requested_note or "Your editor has requested changes to your story.",
            notification_type="changes_requested",
        )

    # Approved → notify author
    elif new == "approved":
        _notify_author(
            instance,
            title=f"Story approved — {instance.title}",
            message="Your story has been approved and is ready for publishing.",
            notification_type="story_approved",
        )

    # Published → notify author
    elif new == "published":
        _notify_author(
            instance,
            title=f"Story published — {instance.title}",
            message="Your story is now live.",
            notification_type="story_published",
        )

    # Rejected → notify author
    elif new == "rejected":
        _notify_author(
            instance,
            title=f"Story rejected — {instance.title}",
            message=instance.rejection_reason or "Your story has been rejected by the editorial team.",
            notification_type="story_rejected",
        )


def _notify_editors_new_draft(story):
    """Optionally ping editors when a draft is first created (configurable per org)."""
    pass  # Hook for future org-level notification settings


def _notify_editors_submitted(story):
    """Notify all editors/broadcast_admins in the same organisation."""
    try:
        from apps.accounts.models import User
        from apps.notifications.services import NotificationService

        editors = User.objects.filter(
            organisation=story.organisation,
            role__in=["editor", "broadcast_admin"],
            is_active=True,
        ).exclude(pk=story.author_id)

        for editor in editors:
            NotificationService.notify_user(
                editor,
                title=f"Story pending review — {story.title}",
                message=f"{story.author.full_name} submitted a story for review.",
                notification_type="story_submitted",
            )
    except Exception:
        pass


def _notify_author(story, title: str, message: str, notification_type: str):
    try:
        from apps.notifications.services import NotificationService
        NotificationService.notify_user(story.author, title, message, notification_type)
    except Exception:
        pass


# ─── RadioSlot signals ────────────────────────────────────────────────────────

@receiver(post_save, sender="news.RadioSlot")
def radio_slot_post_save(sender, instance, created, **kwargs):
    if not created:
        return
    try:
        from apps.notifications.services import NotificationService
        NotificationService.notify_user(
            instance.presenter,
            title=f"You've been scheduled — {instance.show.name}",
            message=(
                f"You are presenting {instance.show.name} on {instance.frequency.name} "
                f"({instance.frequency.frequency_mhz} MHz) starting "
                f"{instance.start_datetime.strftime('%d %b %Y at %H:%M')}."
            ),
            notification_type="slot_scheduled",
        )
        if instance.co_presenter:
            NotificationService.notify_user(
                instance.co_presenter,
                title=f"Co-presenting — {instance.show.name}",
                message=(
                    f"You are co-presenting {instance.show.name} on {instance.frequency.name} "
                    f"starting {instance.start_datetime.strftime('%d %b %Y at %H:%M')}."
                ),
                notification_type="slot_scheduled",
            )
    except Exception:
        pass


# ─── SeatRequest signals ──────────────────────────────────────────────────────

@receiver(post_save, sender="news.SeatRequest")
def seat_request_post_save(sender, instance, created, **kwargs):
    if not created:
        return
    try:
        from apps.accounts.models import User
        from apps.notifications.services import NotificationService

        admins = User.objects.filter(
            organisation=instance.subscription.organisation,
            role__in=["broadcast_admin", "ict", "system_admin"],
            is_active=True,
        )
        for admin in admins:
            NotificationService.notify_user(
                admin,
                title=f"Seat request — {instance.subscription.software_name}",
                message=(
                    f"{instance.requested_by.full_name} has requested a seat for "
                    f"{instance.subscription.software_name}."
                ),
                notification_type="seat_request",
            )
    except Exception:
        pass
