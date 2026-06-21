from celery import shared_task
from datetime import date, timedelta
from django.contrib.auth import get_user_model
from .dept_views import _member_stats

User = get_user_model()

@shared_task
def auto_enforce_attendance():
    """Runs daily: warns and deactivates users based on attendance rules."""
    end   = date.today()
    start = end - timedelta(days=30)

    org_ids = User.objects.filter(
        is_active=True
    ).values_list('organisation_id', flat=True).distinct()

    warned      = []
    deactivated = []

    for org_id in org_ids:
        members = User.objects.filter(
            organisation_id=org_id,
            is_active=True
        )
        for member in members:
            stats = _member_stats(member, start, end)

            if (stats['needs_absent_deactivation'] or
                    stats['needs_late_deactivation']):
                member.is_active = False
                member.save(update_fields=['is_active'])
                deactivated.append(member.email)
                # send_deactivation_email.delay(member.id)  ← hook in later

            elif (stats['needs_absent_warning'] or
                      stats['needs_late_warning']):
                warned.append(member.email)
                # send_warning_email.delay(member.id)  ← hook in later

    return {
        'date': str(date.today()),
        'warned': warned,
        'deactivated': deactivated,
    }