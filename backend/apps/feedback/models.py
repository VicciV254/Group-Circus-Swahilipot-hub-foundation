import uuid
from django.db import models
from django.conf import settings


class FeedbackTicket(models.Model):
    STATUS_CHOICES = [
        ("open", "Open"),
        ("in_progress", "In Progress"),
        ("resolved", "Resolved"),
        ("closed", "Closed"),
    ]
    PRIORITY_CHOICES = [
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
        ("urgent", "Urgent"),
    ]
    CATEGORY_CHOICES = [
        ("Equipment", "Equipment"),
        ("Wi-Fi", "Wi-Fi"),
        ("Scheduling", "Scheduling"),
        ("Facilities", "Facilities"),
        ("Staff", "Staff"),
        ("Software", "Software"),
        ("Broadcast", "Broadcast"),
        ("Other", "Other"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket_number = models.CharField(max_length=20, unique=True, blank=True)
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="feedback_tickets",
    )
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES)
    title = models.CharField(max_length=255)
    description = models.TextField()
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default="medium")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="open")
    admin_response = models.TextField(blank=True, default="")
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_tickets",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:  # type: ignore
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.ticket_number:
            last = FeedbackTicket.objects.order_by("-created_at").first()
            next_num = 1
            if last and last.ticket_number:
                try:
                    next_num = int(last.ticket_number.replace("TKT-", "")) + 1
                except ValueError:
                    pass
            self.ticket_number = f"TKT-{next_num:04d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.ticket_number} — {self.title}"