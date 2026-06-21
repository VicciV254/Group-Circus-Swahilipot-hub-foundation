"""
Nexus Equipment — manual/cron fallback for the overdue-checkout sweep.

The real logic lives in Nexus.tasks.check_overdue_equipment (it flips
CheckoutRequest.status 'active' -> 'overdue' and alerts the borrower +
approver). This command just calls that task directly so there's a single
source of truth — use it for local testing or as a cron fallback if Celery
beat is down.

Usage:
    python manage.py mark_overdue_checkouts
"""
from django.core.management.base import BaseCommand

from Nexus.tasks import check_overdue_equipment


class Command(BaseCommand):
    help = "Marks active equipment checkouts past their end_date as overdue and notifies the borrower."

    def handle(self, *args, **options):
        check_overdue_equipment()
        self.stdout.write(self.style.SUCCESS("Overdue equipment sweep complete."))
