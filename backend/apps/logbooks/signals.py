"""
apps/logbooks/signals.py

Django signals for the Logbooks module.
"""
from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver
from .models import LogbookEntry, EntryAttachment, Program, Cohort, DepartmentActivation


@receiver(post_save, sender=LogbookEntry)
def auto_compute_hours(sender, instance, created, **kwargs):
    """
    If reporting_time and closing_time are set but hours_worked is empty,
    compute it automatically.
    """
    if instance.reporting_time and instance.closing_time and not instance.hours_worked:
        from datetime import datetime, date
        start = datetime.combine(date.today(), instance.reporting_time)
        end = datetime.combine(date.today(), instance.closing_time)
        delta = end - start
        hours = round(delta.seconds / 3600, 1)
        # Use update to avoid recursive signal
        LogbookEntry.objects.filter(pk=instance.pk).update(hours_worked=hours)


@receiver(pre_delete, sender=EntryAttachment)
def delete_attachment_file(sender, instance, **kwargs):
    """Remove the actual file from storage when the DB record is deleted."""
    if instance.file:
        instance.file.delete(save=False)


@receiver(post_save, sender=Program)
def auto_create_cohorts(sender, instance, created, **kwargs):
    """
    On Program creation, auto-create exactly 3 Cohorts.

    - "auto" schedule mode: program's [start_date, end_date] is split
      into 3 equal, contiguous periods. Each cohort's activation_date
      equals its own start_date.
    - "manual" schedule mode: each cohort's start/end was supplied by
      the admin at creation time and stashed on the instance by the
      serializer as `_manual_cohort_dates` (a list of 3 dicts) before
      save() — see ProgramCreateSerializer.create().

    Cohort 1's activation_date is always the program's own start_date
    (or its manually-set start_date) so it can open immediately once
    that date is reached, since it has no predecessor to wait for.
    """
    if not created:
        return
    if instance.cohorts.exists():
        return  # safety: never duplicate on re-save

    manual_dates = getattr(instance, "_manual_cohort_dates", None)

    if instance.cohort_schedule_mode == Program.SCHEDULE_MANUAL and manual_dates:
        periods = [
            (d["start_date"], d["end_date"]) for d in manual_dates[:3]
        ]
    else:
        from datetime import timedelta
        total_days = (instance.end_date - instance.start_date).days + 1
        third = total_days // 3
        remainder = total_days - (third * 3)
        periods = []
        cursor = instance.start_date
        for i in range(3):
            length = third + (1 if i < remainder else 0)
            period_start = cursor
            period_end = cursor + timedelta(days=max(length - 1, 0))
            periods.append((period_start, period_end))
            cursor = period_end + timedelta(days=1)

    for i, (p_start, p_end) in enumerate(periods, start=1):
        Cohort.objects.create(
            program=instance,
            sequence=i,
            label=f"Cohort {i}",
            start_date=p_start,
            end_date=p_end,
            activation_date=p_start,
        )


@receiver(post_save, sender=Cohort)
def auto_create_department_activations(sender, instance, created, **kwargs):
    """
    The first time a Cohort transitions into OPEN, ensure every known
    Department in the system has a (inactive-by-default) row here for
    the admin to switch on. Safe to call repeatedly — unique_together
    on (cohort, department) plus get_or_create prevents duplicates.
    """
    if instance.status != Cohort.Status.OPEN:
        return
    if instance.department_activations.exists():
        return

    try:
        from apps.accounts.models import Department
    except ImportError:
        return

    for dept in Department.objects.all():
        DepartmentActivation.objects.get_or_create(cohort=instance, department=dept)
