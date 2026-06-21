"""
apps/logbooks/tasks.py

Celery tasks for the Programs/Cohorts scheduling layer.

Wire these into your project's Celery Beat schedule (settings.py or a
beat_schedule.py, depending on how the rest of the project does it),
e.g.:

    CELERY_BEAT_SCHEDULE = {
        ...
        "logbooks-sweep-cohorts": {
            "task": "apps.logbooks.tasks.sweep_cohort_activations",
            "schedule": crontab(minute="*/15"),  # every 15 min is plenty
        },
        "logbooks-midnight-entry-lock": {
            "task": "apps.logbooks.tasks.midnight_auto_submit_and_lock",
            "schedule": crontab(hour=0, minute=1),  # just after midnight
        },
    }
"""
from celery import shared_task
from django.db import transaction
from django.utils import timezone


# ──────────────────────────────────────────────────────────
# Cohort sequencing sweep
# ──────────────────────────────────────────────────────────

@shared_task(name="apps.logbooks.tasks.sweep_cohort_activations")
def sweep_cohort_activations():
    """
    Re-evaluate every non-closed Cohort's status.

    This is what actually enforces "Cohort N can only activate once
    Cohort N-1 has closed" over time — e.g. Cohort 2's activation_date
    arrives while Cohort 1 is still open, so Cohort 2 sits at READY;
    once this sweep later notices Cohort 1 has passed its end_date and
    flips it to CLOSED, the very same sweep run (cohorts are processed
    in sequence order) then sees Cohort 2 is READY + predecessor CLOSED
    and flips it OPEN.

    Idempotent and safe to run as often as you like.
    """
    from .models import Cohort

    transitions = []
    # Process strictly in (program, sequence) order so a cohort closing
    # in this same pass can immediately unlock its successor in the
    # same pass, rather than waiting for the next tick.
    cohorts = Cohort.objects.exclude(status=Cohort.Status.CLOSED).select_related(
        "program"
    ).order_by("program_id", "sequence")

    for cohort in cohorts:
        before = cohort.status
        after = cohort.refresh_status()
        if before != after:
            transitions.append((str(cohort.id), cohort.label, before, after))

    return {"transitions": transitions, "checked_at": timezone.now().isoformat()}


# ──────────────────────────────────────────────────────────
# Midnight auto-submit + lock sweep
# ──────────────────────────────────────────────────────────

@shared_task(name="apps.logbooks.tasks.midnight_auto_submit_and_lock")
def midnight_auto_submit_and_lock():
    """
    Run just after 00:00. For every active Logbook (i.e. its
    department_activation is_active, or it has no department_activation
    at all — manually-created logbooks keep the same rule):

      - Find yesterday's entry. If it doesn't exist, create it empty.
        If it exists but is still in draft/rejected/revision_requested
        (i.e. the attachee never submitted it), auto-submit it empty
        (or with whatever partial content was saved).
      - This makes "today's entry" inaccessible to the attachee once
        the day has passed — they can no longer create/edit it, only
        a supervisor can act on it from here.

    Does NOT touch entries that are already submitted/approved/rejected/
    revision_requested by the intern's own action — those follow the
    normal review flow untouched.
    """
    from .models import Logbook, LogbookEntry
    from datetime import timedelta

    today = timezone.now().date()
    yesterday = today - timedelta(days=1)

    results = {"created_empty": 0, "auto_submitted": 0, "skipped": 0}

    active_logbooks = Logbook.objects.filter(
        start_date__lte=yesterday,
        end_date__gte=yesterday,
    ).exclude(
        department_activation__is_active=False,
    )

    for lb in active_logbooks.iterator():
        with transaction.atomic():
            entry, created = LogbookEntry.objects.get_or_create(
                logbook=lb,
                date=yesterday,
                defaults={"activities": ""},
            )
            if created:
                results["created_empty"] += 1

            if entry.status in (
                LogbookEntry.Status.DRAFT,
                LogbookEntry.Status.REJECTED,
                LogbookEntry.Status.REVISION_REQUESTED,
            ):
                entry.submit(auto=True)
                results["auto_submitted"] += 1
            else:
                results["skipped"] += 1

    return results
