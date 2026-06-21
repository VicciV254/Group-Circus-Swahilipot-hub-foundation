"""
apps/radio/models.py
────────────────────
Models for Nexus Radio:
  • Frequency  — broadcast frequencies (FM/AM/DAB etc.)
  • Show       — named shows that can be scheduled
  • RadioSlot  — a single scheduled broadcast slot on a frequency
"""

import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone


class Frequency(models.Model):
    """A broadcast frequency, e.g. "Swahilipot FM 89.5"."""

    BAND_CHOICES = [
        ("FM",  "FM"),
        ("AM",  "AM"),
        ("DAB", "DAB"),
        ("SW",  "Short Wave"),
        ("LW",  "Long Wave"),
        ("OL",  "Online / Stream"),
    ]

    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name           = models.CharField(max_length=120, unique=True, help_text="e.g. Swahilipot FM")
    frequency_mhz  = models.DecimalField(
        max_digits=8, decimal_places=3,
        help_text="Numeric value of the frequency (MHz / kHz). Use 0 for online streams.",
    )
    band           = models.CharField(max_length=4, choices=BAND_CHOICES, default="FM")
    stream_url     = models.URLField(blank=True, help_text="Live stream URL if applicable")
    description    = models.TextField(blank=True)
    is_active      = models.BooleanField(default=True)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering  = ["band", "frequency_mhz"]
        verbose_name          = "Frequency"
        verbose_name_plural   = "Frequencies"

    def __str__(self):
        return f"{self.name} ({self.frequency_mhz} {self.band})"


class Show(models.Model):
    """A named radio show that can be assigned to slots."""

    SHOW_TYPE_CHOICES = [
        ("news",      "News"),
        ("music",     "Music"),
        ("talk",      "Talk"),
        ("sport",     "Sport"),
        ("drama",     "Drama"),
        ("education", "Education"),
        ("other",     "Other"),
    ]

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name        = models.CharField(max_length=200, unique=True)
    show_type   = models.CharField(max_length=20, choices=SHOW_TYPE_CHOICES, default="other")
    description = models.TextField(blank=True)
    cover_image = models.ImageField(upload_to="radio/shows/", blank=True, null=True)
    is_active   = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name        = "Show"
        verbose_name_plural = "Shows"

    def __str__(self):
        return self.name


class RadioSlot(models.Model):
    """A single scheduled broadcast slot."""

    STATUS_CHOICES = [
        ("scheduled",  "Scheduled"),
        ("live",       "Live"),
        ("completed",  "Completed"),
        ("cancelled",  "Cancelled"),
    ]

    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Core references
    frequency      = models.ForeignKey(
        Frequency, on_delete=models.PROTECT,
        related_name="slots",
    )
    show           = models.ForeignKey(
        Show, on_delete=models.PROTECT,
        related_name="slots",
    )
    presenter      = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="broadcast_slots",
    )

    # Denormalised display fields (kept in sync by save())
    show_name      = models.CharField(max_length=200, editable=False)
    frequency_name = models.CharField(max_length=120, editable=False)
    presenter_name = models.CharField(max_length=200, blank=True, editable=False)
    show_type      = models.CharField(max_length=20, blank=True, editable=False)

    # Scheduling
    start_datetime = models.DateTimeField()
    end_datetime   = models.DateTimeField()
    status         = models.CharField(max_length=20, choices=STATUS_CHOICES, default="scheduled")
    location       = models.CharField(max_length=200, blank=True, help_text="e.g. Studio A")

    # Content
    notes          = models.TextField(blank=True)
    show_plan      = models.TextField(blank=True, help_text="Submitted by presenter before air-time")

    # Reminder flag (used by Celery beat task)
    reminded_30min = models.BooleanField(default=False)

    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start_datetime"]
        verbose_name        = "Radio Slot"
        verbose_name_plural = "Radio Slots"
        indexes = [
            models.Index(fields=["start_datetime", "end_datetime"]),
            models.Index(fields=["presenter", "start_datetime"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.show_name} @ {self.start_datetime:%d %b %Y %H:%M}"

    def save(self, *args, **kwargs):
        # Keep denormalised fields in sync
        self.show_name      = self.show.name        if self.show_id      else ""
        self.frequency_name = self.frequency.name   if self.frequency_id else ""
        self.show_type      = self.show.show_type   if self.show_id      else "other"
        if self.presenter_id and self.presenter:
            self.presenter_name = getattr(self.presenter, "get_full_name", lambda: "")() \
                                  or self.presenter.email
        super().save(*args, **kwargs)

    @property
    def duration_minutes(self):
        if self.start_datetime and self.end_datetime:
            return int((self.end_datetime - self.start_datetime).total_seconds() / 60)
        return 0