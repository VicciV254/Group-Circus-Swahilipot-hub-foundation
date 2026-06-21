"""
apps/logbooks/models.py

Full production model layer for the Logbooks module.
Covers: Logbook → LogbookEntry → EntryAttachment + signature/approval chain.
"""
import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


# ──────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────

import re
import uuid as _uuid
import os


def _safe_filename(filename: str) -> str:
    """
    Sanitize an uploaded filename before it's used in a storage path.

    Browsers/OSes occasionally hand Django filenames containing path
    separators (forward or back slashes), null bytes, or other characters
    that confuse FileSystemStorage's get_available_name() and raise
    SuspiciousFileOperation. This strips any directory component, replaces
    unsafe characters, and guarantees a non-empty, single-extension result.
    """
    # Keep only the base name — discard anything that looks like a directory
    # path, whether using "/" or Windows-style "\".
    base = filename.replace("\\", "/").split("/")[-1]

    # Split into stem + extension using the LAST dot only, so filenames with
    # multiple dots (e.g. "Image_6.42.36_PM.jpeg") don't get mis-split.
    stem, ext = os.path.splitext(base)
    ext = ext[:10]  # guard against absurdly long/garbage "extensions"

    # Replace anything that isn't alphanumeric, dash, or underscore.
    stem = re.sub(r"[^A-Za-z0-9_-]+", "_", stem).strip("_") or "file"

    # Prefix with a short random token to avoid collisions without relying
    # on Django's own get_available_name() suffixing logic (which is what
    # broke on the multi-dot filename in the first place).
    token = _uuid.uuid4().hex[:8]
    return f"{stem}_{token}{ext}"


def attachment_upload_path(instance, filename):
    safe_name = _safe_filename(filename)
    return f"logbooks/entries/{instance.entry.logbook.id}/{instance.entry.id}/{safe_name}"


def signature_upload_path(instance, filename):
    safe_name = _safe_filename(filename)
    return f"logbooks/signatures/{instance.logbook.id}/{safe_name}"


# ──────────────────────────────────────────────────────────
# Logbook (the container / period)
# ──────────────────────────────────────────────────────────

class Logbook(models.Model):
    """
    A Logbook is a bounded period (e.g. an internship or attachment period)
    assigned to an intern/trainee by a supervisor.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    intern = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="logbooks_as_intern",
        verbose_name=_("intern / trainee"),
    )
    supervisor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="supervised_logbooks",
        verbose_name=_("supervisor"),
    )
    department = models.ForeignKey(
        "accounts.Department",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="logbooks_for_department",
    )

    # Set when this Logbook was auto-created by a Program/Cohort department
    # activation, rather than created manually. Nullable so existing
    # manually-created Logbooks are unaffected.
    department_activation = models.ForeignKey(
        "DepartmentActivation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="logbooks",
    )

    start_date = models.DateField()
    end_date = models.DateField()

    # Final submission + approval
    final_submitted = models.BooleanField(default=False)
    final_submitted_at = models.DateTimeField(null=True, blank=True)

    final_approved = models.BooleanField(default=False)
    final_approved_at = models.DateTimeField(null=True, blank=True)
    final_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_logbooks",
    )

    # Digital signature (base64 PNG stored as file)
    intern_signature = models.ImageField(
        upload_to=signature_upload_path, null=True, blank=True
    )
    intern_signed_at = models.DateTimeField(null=True, blank=True)

    supervisor_signature = models.ImageField(
        upload_to=signature_upload_path, null=True, blank=True
    )
    supervisor_signed_at = models.DateTimeField(null=True, blank=True)

    # Overall supervisor rating (1–5)
    RATING_CHOICES = [(i, str(i)) for i in range(1, 6)]
    overall_rating = models.PositiveSmallIntegerField(
        null=True, blank=True, choices=RATING_CHOICES
    )
    overall_comments = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-start_date"]
        verbose_name = _("logbook")
        verbose_name_plural = _("logbooks")

    def __str__(self):
        return f"{self.title} — {self.intern}"

    @property
    def total_entries(self):
        return self.entries.count()

    @property
    def submitted_entries(self):
        return self.entries.filter(status=LogbookEntry.Status.SUBMITTED).count()

    @property
    def approved_entries(self):
        return self.entries.filter(status=LogbookEntry.Status.APPROVED).count()

    @property
    def completion_percentage(self):
        """% of working days that have a submitted/approved entry."""
        from django.db.models import Q
        total = self.entries.filter(
            status__in=[LogbookEntry.Status.SUBMITTED, LogbookEntry.Status.APPROVED]
        ).count()
        # rough expected days (Mon-Fri only)
        from datetime import timedelta
        day = self.start_date
        working = 0
        while day <= min(self.end_date, timezone.now().date()):
            if day.weekday() < 5:
                working += 1
            day += timedelta(days=1)
        return round((total / working * 100)) if working else 0


# ──────────────────────────────────────────────────────────
# LogbookEntry (one per day)
# ──────────────────────────────────────────────────────────

class LogbookEntry(models.Model):
    """
    A single daily logbook entry written by the intern.
    Has its own status flow: draft → submitted → approved / rejected.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", _("Draft")
        SUBMITTED = "submitted", _("Submitted")
        APPROVED = "approved", _("Approved")
        REJECTED = "rejected", _("Rejected")
        REVISION_REQUESTED = "revision_requested", _("Revision Requested")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    logbook = models.ForeignKey(
        Logbook, on_delete=models.CASCADE, related_name="entries"
    )
    date = models.DateField()

    # Core content
    activities = models.TextField(verbose_name=_("activities & tasks"))
    skills_acquired = models.TextField(blank=True)
    challenges = models.TextField(blank=True)
    reflection = models.TextField(blank=True)

    # Location / department context
    location = models.CharField(max_length=255, blank=True)
    reporting_time = models.TimeField(null=True, blank=True)
    closing_time = models.TimeField(null=True, blank=True)

    # Hours worked (computed or manually set)
    hours_worked = models.DecimalField(
        max_digits=4, decimal_places=1, null=True, blank=True
    )

    # Mood / self-assessment
    MOOD_CHOICES = [
        (1, "Very Poor"),
        (2, "Poor"),
        (3, "Neutral"),
        (4, "Good"),
        (5, "Excellent"),
    ]
    mood_rating = models.PositiveSmallIntegerField(
        null=True, blank=True, choices=MOOD_CHOICES
    )

    # Status & review
    status = models.CharField(
        max_length=25, choices=Status.choices, default=Status.DRAFT
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_entries",
    )

    # Supervisor feedback
    supervisor_comments = models.TextField(blank=True)
    supervisor_rating = models.PositiveSmallIntegerField(
        null=True, blank=True, choices=[(i, str(i)) for i in range(1, 6)]
    )

    # Intern acknowledgement of supervisor comments
    intern_acknowledged = models.BooleanField(default=False)
    intern_acknowledged_at = models.DateTimeField(null=True, blank=True)

    # Permanently locked once a supervisor has reviewed it (approve / reject
    # / request_revision). After this, nobody — including the supervisor —
    # can edit the entry's content fields again via the normal update path.
    locked = models.BooleanField(default=False)
    locked_at = models.DateTimeField(null=True, blank=True)

    # True if this entry was force-submitted empty by the midnight sweep
    # because the intern never touched it during the day it was open for.
    auto_submitted = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]
        unique_together = [("logbook", "date")]
        verbose_name = _("logbook entry")
        verbose_name_plural = _("logbook entries")

    def __str__(self):
        return f"{self.logbook} / {self.date} [{self.status}]"

    def submit(self, auto=False):
        self.status = self.Status.SUBMITTED
        self.submitted_at = timezone.now()
        if auto:
            self.auto_submitted = True
            self.save(update_fields=["status", "submitted_at", "auto_submitted", "updated_at"])
        else:
            self.save(update_fields=["status", "submitted_at", "updated_at"])

    def approve(self, reviewer):
        self.status = self.Status.APPROVED
        self.reviewed_at = timezone.now()
        self.reviewed_by = reviewer
        self.locked = True
        self.locked_at = timezone.now()
        self.save(update_fields=[
            "status", "reviewed_at", "reviewed_by", "locked", "locked_at", "updated_at",
        ])

    def reject(self, reviewer, comments=""):
        self.status = self.Status.REJECTED
        self.reviewed_at = timezone.now()
        self.reviewed_by = reviewer
        if comments:
            self.supervisor_comments = comments
        self.locked = True
        self.locked_at = timezone.now()
        self.save(
            update_fields=[
                "status", "reviewed_at", "reviewed_by",
                "supervisor_comments", "locked", "locked_at", "updated_at",
            ]
        )

    def request_revision(self, reviewer, comments=""):
        self.status = self.Status.REVISION_REQUESTED
        self.reviewed_at = timezone.now()
        self.reviewed_by = reviewer
        if comments:
            self.supervisor_comments = comments
        self.locked = True
        self.locked_at = timezone.now()
        self.save(
            update_fields=[
                "status", "reviewed_at", "reviewed_by",
                "supervisor_comments", "locked", "locked_at", "updated_at",
            ]
        )


# ──────────────────────────────────────────────────────────
# EntryAttachment (photos, files per entry)
# ──────────────────────────────────────────────────────────

class EntryAttachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entry = models.ForeignKey(
        LogbookEntry, on_delete=models.CASCADE, related_name="attachments"
    )
    file = models.FileField(upload_to=attachment_upload_path)
    original_name = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField(default=0)  # bytes
    content_type = models.CharField(max_length=100, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["uploaded_at"]

    def __str__(self):
        return self.original_name

    @property
    def is_image(self):
        return self.content_type.startswith("image/")


# ──────────────────────────────────────────────────────────
# LogbookComment (threaded discussion per entry)
# ──────────────────────────────────────────────────────────

class LogbookComment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entry = models.ForeignKey(
        LogbookEntry, on_delete=models.CASCADE, related_name="comments"
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="logbook_comments"
    )
    body = models.TextField()
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="replies"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    edited = models.BooleanField(default=False)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Comment by {self.author} on {self.entry}"


# ──────────────────────────────────────────────────────────
# LogbookAuditLog (immutable history trail)
# ──────────────────────────────────────────────────────────

class LogbookAuditLog(models.Model):
    class Action(models.TextChoices):
        CREATED = "created", _("Created")
        UPDATED = "updated", _("Updated")
        SUBMITTED = "submitted", _("Submitted")
        APPROVED = "approved", _("Approved")
        REJECTED = "rejected", _("Rejected")
        REVISION_REQUESTED = "revision_requested", _("Revision Requested")
        SIGNED = "signed", _("Signed")
        FINAL_SUBMITTED = "final_submitted", _("Final Submitted")
        FINAL_APPROVED = "final_approved", _("Final Approved")
        ATTACHMENT_ADDED = "attachment_added", _("Attachment Added")
        ATTACHMENT_REMOVED = "attachment_removed", _("Attachment Removed")
        COMMENT_ADDED = "comment_added", _("Comment Added")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    logbook = models.ForeignKey(
        Logbook, on_delete=models.CASCADE, related_name="audit_logs"
    )
    entry = models.ForeignKey(
        LogbookEntry, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="audit_logs"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    action = models.CharField(max_length=30, choices=Action.choices)
    detail = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]

    def __str__(self):
        return f"{self.action} by {self.actor} @ {self.timestamp:%Y-%m-%d %H:%M}"


# ──────────────────────────────────────────────────────────
# Program (admin creates: name + description, system does the rest)
# ──────────────────────────────────────────────────────────

class Program(models.Model):
    """
    A Program is the top-level attachment/internship intake the admin
    creates. Admin supplies only name + description (+ an overall date
    range used purely to schedule the 3 auto-created Cohorts). Saving a
    new Program auto-creates exactly 3 Cohorts (see signals.py).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    start_date = models.DateField()
    end_date = models.DateField()

    # "auto" — program period split into 3 equal cohort periods.
    # "manual" — admin supplied each cohort's own start/end on creation.
    SCHEDULE_AUTO = "auto"
    SCHEDULE_MANUAL = "manual"
    SCHEDULE_MODE_CHOICES = [(SCHEDULE_AUTO, "Auto-split"), (SCHEDULE_MANUAL, "Manual")]
    cohort_schedule_mode = models.CharField(
        max_length=10, choices=SCHEDULE_MODE_CHOICES, default=SCHEDULE_AUTO
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="programs_created",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-start_date"]
        verbose_name = _("program")
        verbose_name_plural = _("programs")

    def __str__(self):
        return self.name

    @property
    def active_cohort(self):
        return self.cohorts.filter(status=Cohort.Status.OPEN).first()

    @property
    def total_attachees(self):
        return Logbook.objects.filter(
            department_activation__cohort__program=self
        ).values("intern_id").distinct().count()


# ──────────────────────────────────────────────────────────
# Cohort (exactly 3 per Program, strictly sequential)
# ──────────────────────────────────────────────────────────

class Cohort(models.Model):
    """
    One of exactly 3 cohorts auto-created for a Program. Activation is
    strictly sequential — Cohort N can only ever open once Cohort N-1 has
    closed, regardless of scheduled dates. There is no manual override.

    Status lifecycle:
        pending → ready → open → closed

      pending: activation_date hasn't arrived yet (or a previous
               cohort hasn't closed and we're not yet at "ready").
      ready:   activation_date has arrived AND a previous cohort is
               still open — waiting for it to close before this one
               can open. (Cohort 1 skips straight to "open" once its
               activation date arrives, since there's no predecessor.)
      open:    currently active. Departments within it may be
               activated/deactivated by the admin.
      closed:  cohort's end_date has passed (or admin closed it) —
               permanently done, unlocking the next cohort in sequence.
    """

    class Status(models.TextChoices):
        PENDING = "pending", _("Pending")
        READY = "ready", _("Ready to activate")
        OPEN = "open", _("Open")
        CLOSED = "closed", _("Closed")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name="cohorts")
    sequence = models.PositiveSmallIntegerField()  # 1, 2, or 3
    label = models.CharField(max_length=50, blank=True)  # "Cohort 1" etc.

    start_date = models.DateField()
    end_date = models.DateField()

    # The date on which this cohort *should* open, subject to the
    # sequencing rule above.
    activation_date = models.DateField()

    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING
    )
    opened_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sequence"]
        unique_together = [("program", "sequence")]
        verbose_name = _("cohort")
        verbose_name_plural = _("cohorts")

    def __str__(self):
        return f"{self.label or f'Cohort {self.sequence}'} — {self.program}"

    def save(self, *args, **kwargs):
        if not self.label:
            self.label = f"Cohort {self.sequence}"
        super().save(*args, **kwargs)

    # ── Sequencing helpers ───────────────────────────────

    @property
    def previous_cohort(self):
        if self.sequence <= 1:
            return None
        return Cohort.objects.filter(program=self.program, sequence=self.sequence - 1).first()

    @property
    def can_activate(self):
        """True if this cohort is eligible to move to OPEN right now."""
        if self.status not in (Cohort.Status.PENDING, Cohort.Status.READY):
            return False
        prev = self.previous_cohort
        if prev and prev.status != Cohort.Status.CLOSED:
            return False
        return timezone.now().date() >= self.activation_date

    def refresh_status(self):
        """
        Re-evaluate this cohort's status against today's date and the
        previous cohort's state. Called by the Celery sweep, and also
        safe to call inline (e.g. from a serializer) for a live read.
        """
        today = timezone.now().date()

        if self.status == Cohort.Status.CLOSED:
            return self.status

        if self.status == Cohort.Status.OPEN:
            if today > self.end_date:
                self.status = Cohort.Status.CLOSED
                self.closed_at = timezone.now()
                self.save(update_fields=["status", "closed_at", "updated_at"])
            return self.status

        # PENDING or READY
        prev = self.previous_cohort
        prev_closed = (prev is None) or (prev.status == Cohort.Status.CLOSED)
        date_reached = today >= self.activation_date

        if date_reached and prev_closed:
            self.status = Cohort.Status.OPEN
            self.opened_at = timezone.now()
            self.save(update_fields=["status", "opened_at", "updated_at"])
        elif date_reached and not prev_closed:
            if self.status != Cohort.Status.READY:
                self.status = Cohort.Status.READY
                self.save(update_fields=["status", "updated_at"])
        # else: stays pending
        return self.status


# ──────────────────────────────────────────────────────────
# DepartmentActivation (per-cohort, per-department on/off switch)
# ──────────────────────────────────────────────────────────

class DepartmentActivation(models.Model):
    """
    Tracks whether a given Department is switched on within a Cohort.
    Activating it:
      - enrols every attachee whose profile department matches, by
        auto-creating a Logbook for each (idempotent — re-activating
        does not duplicate existing logbooks)
      - emails every enrolled attachee
      - assigns the chosen supervisor to each created Logbook

    One row is auto-created per known Department the first time a
    Cohort is opened (see signals.py), all starting inactive.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    cohort = models.ForeignKey(Cohort, on_delete=models.CASCADE, related_name="department_activations")
    department = models.ForeignKey(
        "accounts.Department", on_delete=models.CASCADE, related_name="cohort_activations"
    )
    supervisor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="supervised_department_activations",
    )

    is_active = models.BooleanField(default=False)
    activated_at = models.DateTimeField(null=True, blank=True)
    activated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="department_activations_performed",
    )
    deactivated_at = models.DateTimeField(null=True, blank=True)

    # Set once the auto-enrolment + email + logbook creation has run for
    # the *current* activation, so re-activation doesn't repeat it.
    logbooks_created = models.BooleanField(default=False)
    email_sent = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["department__name"]
        unique_together = [("cohort", "department")]
        verbose_name = _("department activation")
        verbose_name_plural = _("department activations")

    def __str__(self):
        state = "active" if self.is_active else "inactive"
        return f"{self.department} in {self.cohort} ({state})"

    @property
    def attachee_count(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        return User.objects.filter(department=self.department).count()
    