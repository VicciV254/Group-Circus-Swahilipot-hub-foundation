"""
Enterprise Internship Management System
Projects App — Signal Handlers
Handles automatic notification dispatch and overdue task detection.
"""

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

from .models import Task, TaskStatus, Milestone, MilestoneStatus, Risk


@receiver(pre_save, sender=Task)
def auto_mark_overdue(sender, instance, **kwargs):
    """Automatically flag tasks as overdue if past due_date and not completed."""
    if instance.due_date and instance.status not in (
        TaskStatus.DONE, TaskStatus.APPROVED, TaskStatus.OVERDUE
    ):
        if timezone.now().date() > instance.due_date:
            instance.status = TaskStatus.OVERDUE


@receiver(pre_save, sender=Milestone)
def auto_mark_milestone_missed(sender, instance, **kwargs):
    """Automatically flag milestones as missed if past due_date and not completed."""
    if instance.status not in (MilestoneStatus.COMPLETED, MilestoneStatus.MISSED):
        if timezone.now().date() > instance.due_date:
            instance.status = MilestoneStatus.MISSED


@receiver(post_save, sender=Task)
def notify_on_task_assignment_or_due(sender, instance, created, **kwargs):
    """
    Hook point for the Advanced Notifications Center (see system spec §28).
    Dispatches notifications for: task assignment, due-soon reminders, overdue alerts.
    Actual delivery (email/SMS/push) is handled by the notifications app —
    this signal only enqueues the relevant notification events.
    """
    if created:
        # TODO: integrate with apps.notifications.services.dispatch_notification
        # dispatch_notification(event='task_assigned', task=instance, recipients=instance.assignees.all())
        pass


@receiver(post_save, sender=Risk)
def notify_on_critical_risk(sender, instance, created, **kwargs):
    """Escalate notification for newly logged critical/high severity risks."""
    if created and instance.severity in ('critical', 'high'):
        # TODO: integrate with apps.notifications.services.dispatch_notification
        # dispatch_notification(event='risk_escalated', risk=instance, recipients=[instance.project.owner])
        pass
