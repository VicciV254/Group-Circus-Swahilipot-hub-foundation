"""
apps/logbooks/serializers.py

Comprehensive DRF serializers for the Logbooks module.
"""
from django.utils import timezone
from rest_framework import serializers
from .models import (
    Logbook,
    LogbookEntry,
    EntryAttachment,
    LogbookComment,
    LogbookAuditLog,
    Program,
    Cohort,
    DepartmentActivation,
)
from .permissions import SUPERVISOR_ROLES


# ──────────────────────────────────────────────────────────
# Minimal user representation
# ──────────────────────────────────────────────────────────

class UserMinimalSerializer(serializers.Serializer):
    """Read-only inline user object — adjust fields to your AUTH_USER_MODEL."""
    id = serializers.UUIDField()
    full_name = serializers.CharField(source="get_full_name")
    email = serializers.EmailField()
    role = serializers.CharField(default="")
    avatar = serializers.SerializerMethodField()

    def get_avatar(self, obj):
        request = self.context.get("request")
        if hasattr(obj, "profile") and obj.profile.avatar:
            url = obj.profile.avatar.url
            return request.build_absolute_uri(url) if request else url
        return None


# ──────────────────────────────────────────────────────────
# Attachments
# ──────────────────────────────────────────────────────────

class EntryAttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    is_image = serializers.BooleanField(read_only=True)

    class Meta:
        model = EntryAttachment
        fields = [
            "id", "original_name", "file_size", "content_type",
            "is_image", "url", "uploaded_at",
        ]

    def get_url(self, obj):
        request = self.context.get("request")
        return request.build_absolute_uri(obj.file.url) if request and obj.file else None


class EntryAttachmentUploadSerializer(serializers.ModelSerializer):
    """Used for POST /entries/{id}/attachments/"""
    class Meta:
        model = EntryAttachment
        fields = ["file"]

    def create(self, validated_data):
        file = validated_data["file"]
        entry = self.context["entry"]
        user = self.context["request"].user
        return EntryAttachment.objects.create(
            entry=entry,
            file=file,
            original_name=file.name,
            file_size=file.size,
            content_type=file.content_type,
            uploaded_by=user,
        )


# ──────────────────────────────────────────────────────────
# Comments
# ──────────────────────────────────────────────────────────

class LogbookCommentSerializer(serializers.ModelSerializer):
    author = UserMinimalSerializer(read_only=True)
    replies = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = LogbookComment
        fields = [
            "id", "body", "author", "parent", "replies",
            "created_at", "updated_at", "edited",
            "can_edit", "can_delete",
        ]
        read_only_fields = ["author", "edited"]

    def get_replies(self, obj):
        if obj.parent is None:
            qs = obj.replies.select_related("author")
            return LogbookCommentSerializer(qs, many=True, context=self.context).data
        return []

    def get_can_edit(self, obj):
        user = self.context["request"].user
        return obj.author_id == user.id

    def get_can_delete(self, obj):
        user = self.context["request"].user
        return obj.author_id == user.id or user.role in SUPERVISOR_ROLES

    def create(self, validated_data):
        validated_data["author"] = self.context["request"].user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        instance.body = validated_data.get("body", instance.body)
        instance.edited = True
        instance.save(update_fields=["body", "edited", "updated_at"])
        return instance


# ──────────────────────────────────────────────────────────
# Audit log
# ──────────────────────────────────────────────────────────

class LogbookAuditLogSerializer(serializers.ModelSerializer):
    actor = UserMinimalSerializer(read_only=True)

    class Meta:
        model = LogbookAuditLog
        fields = ["id", "action", "actor", "detail", "timestamp"]


# ──────────────────────────────────────────────────────────
# LogbookEntry
# ──────────────────────────────────────────────────────────

class LogbookEntryListSerializer(serializers.ModelSerializer):
    """Lightweight — used in the list view."""
    reviewed_by = UserMinimalSerializer(read_only=True)
    attachment_count = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()

    class Meta:
        model = LogbookEntry
        fields = [
            "id", "date", "status",
            "activities",
            "hours_worked", "mood_rating",
            "supervisor_comments", "supervisor_rating",
            "submitted_at", "reviewed_at", "reviewed_by",
            "intern_acknowledged",
            "attachment_count", "comment_count",
            "created_at", "updated_at",
        ]

    def get_attachment_count(self, obj):
        return obj.attachments.count()

    def get_comment_count(self, obj):
        return obj.comments.count()


class LogbookEntryDetailSerializer(serializers.ModelSerializer):
    """Full detail — used in retrieve, create, update."""
    reviewed_by = UserMinimalSerializer(read_only=True)
    attachments = EntryAttachmentSerializer(many=True, read_only=True)
    comments = serializers.SerializerMethodField()
    audit_logs = LogbookAuditLogSerializer(many=True, read_only=True)
    attachment_count = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    can_review = serializers.SerializerMethodField()

    class Meta:
        model = LogbookEntry
        fields = [
            "id", "logbook", "date",
            "activities", "skills_acquired", "challenges", "reflection",
            "location", "reporting_time", "closing_time", "hours_worked",
            "mood_rating",
            "status", "submitted_at", "reviewed_at", "reviewed_by",
            "supervisor_comments", "supervisor_rating",
            "intern_acknowledged", "intern_acknowledged_at",
            "locked", "locked_at", "auto_submitted",
            "attachments", "comments", "audit_logs",
            "attachment_count", "comment_count",
            "can_edit", "can_review",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "logbook",
            "status", "submitted_at", "reviewed_at", "reviewed_by",
            "intern_acknowledged_at", "locked", "locked_at", "auto_submitted",
        ]

    def get_comments(self, obj):
        qs = obj.comments.filter(parent=None).select_related("author").prefetch_related("replies__author")
        return LogbookCommentSerializer(qs, many=True, context=self.context).data

    def get_attachment_count(self, obj):
        return obj.attachments.count()

    def get_comment_count(self, obj):
        return obj.comments.count()

    def get_can_edit(self, obj):
        from datetime import date
        user = self.context["request"].user
        if obj.locked:
            return False
        is_own = obj.logbook.intern_id == user.id
        editable_statuses = [
            LogbookEntry.Status.DRAFT,
            LogbookEntry.Status.REJECTED,
            LogbookEntry.Status.REVISION_REQUESTED,
        ]
        return is_own and obj.status in editable_statuses and obj.date == date.today()

    def get_can_review(self, obj):
        user = self.context["request"].user
        return user.role in SUPERVISOR_ROLES and obj.status == LogbookEntry.Status.SUBMITTED

    def validate_date(self, value):
        # Ensure date is within logbook period
        logbook_id = self.context.get("logbook_id")
        if logbook_id:
            try:
                lb = Logbook.objects.get(pk=logbook_id)
                if not (lb.start_date <= value <= lb.end_date):
                    raise serializers.ValidationError(
                        "Date must fall within the logbook period "
                        f"({lb.start_date} – {lb.end_date})."
                    )
            except Logbook.DoesNotExist:
                pass
        return value

    def validate(self, attrs):
        # Prevent duplicate date
        logbook_id = self.context.get("logbook_id")
        date = attrs.get("date")
        if logbook_id and date:
            qs = LogbookEntry.objects.filter(logbook_id=logbook_id, date=date)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {"date": "An entry for this date already exists."}
                )
        return attrs


# ──────────────────────────────────────────────────────────
# Logbook
# ──────────────────────────────────────────────────────────

class LogbookListSerializer(serializers.ModelSerializer):
    intern = UserMinimalSerializer(read_only=True)
    supervisor = UserMinimalSerializer(read_only=True)
    total_entries = serializers.IntegerField(read_only=True)
    submitted_entries = serializers.IntegerField(read_only=True)
    approved_entries = serializers.IntegerField(read_only=True)
    completion_percentage = serializers.IntegerField(read_only=True)

    class Meta:
        model = Logbook
        fields = [
            "id", "title", "description",
            "intern", "supervisor",
            "start_date", "end_date",
            "final_submitted", "final_submitted_at",
            "final_approved", "final_approved_at",
            "overall_rating",
            "total_entries", "submitted_entries",
            "approved_entries", "completion_percentage",
            "created_at", "updated_at",
        ]


class LogbookDetailSerializer(serializers.ModelSerializer):
    intern = UserMinimalSerializer(read_only=True)
    supervisor = UserMinimalSerializer(read_only=True)
    final_approved_by = UserMinimalSerializer(read_only=True)
    total_entries = serializers.IntegerField(read_only=True)
    submitted_entries = serializers.IntegerField(read_only=True)
    approved_entries = serializers.IntegerField(read_only=True)
    completion_percentage = serializers.IntegerField(read_only=True)
    audit_logs = LogbookAuditLogSerializer(many=True, read_only=True)
    intern_signature_url = serializers.SerializerMethodField()
    supervisor_signature_url = serializers.SerializerMethodField()

    class Meta:
        model = Logbook
        fields = [
            "id", "title", "description",
            "intern", "supervisor", "department",
            "start_date", "end_date",
            "final_submitted", "final_submitted_at",
            "final_approved", "final_approved_at", "final_approved_by",
            "overall_rating", "overall_comments",
            "intern_signature_url", "intern_signed_at",
            "supervisor_signature_url", "supervisor_signed_at",
            "total_entries", "submitted_entries",
            "approved_entries", "completion_percentage",
            "audit_logs",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "final_submitted_at", "final_approved_at", "final_approved_by",
            "intern_signed_at", "supervisor_signed_at",
        ]

    def get_intern_signature_url(self, obj):
        request = self.context.get("request")
        if obj.intern_signature:
            return request.build_absolute_uri(obj.intern_signature.url) if request else obj.intern_signature.url
        return None

    def get_supervisor_signature_url(self, obj):
        request = self.context.get("request")
        if obj.supervisor_signature:
            return request.build_absolute_uri(obj.supervisor_signature.url) if request else obj.supervisor_signature.url
        return None


class LogbookCreateSerializer(serializers.ModelSerializer):
    """Used by supervisors/HR to create a logbook for an intern."""
    class Meta:
        model = Logbook
        fields = [
            "title", "description", "intern", "supervisor",
            "department", "start_date", "end_date",
        ]

    def validate(self, attrs):
        if attrs["start_date"] >= attrs["end_date"]:
            raise serializers.ValidationError("start_date must be before end_date.")
        return attrs


class SignatureSerializer(serializers.Serializer):
    """Accepts a base64-encoded PNG data-URL for digital signature."""
    signature = serializers.CharField()  # data:image/png;base64,...

    def validate_signature(self, value):
        if not value.startswith("data:image/"):
            raise serializers.ValidationError("Must be a valid base64 image data URL.")
        return value


# ──────────────────────────────────────────────────────────
# Departments (minimal inline representation)
# ──────────────────────────────────────────────────────────

class DepartmentMinimalSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()


# ──────────────────────────────────────────────────────────
# DepartmentActivation
# ──────────────────────────────────────────────────────────

class DepartmentActivationSerializer(serializers.ModelSerializer):
    department = DepartmentMinimalSerializer(read_only=True)
    supervisor = UserMinimalSerializer(read_only=True)
    attachee_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = DepartmentActivation
        fields = [
            "id", "department", "supervisor",
            "is_active", "activated_at", "deactivated_at",
            "attachee_count", "logbooks_created", "email_sent",
        ]


class DepartmentActivationActivateSerializer(serializers.Serializer):
    """Used for POST .../departments/{id}/activate/"""
    supervisor_id = serializers.UUIDField(required=False, allow_null=True)


# ──────────────────────────────────────────────────────────
# Cohort
# ──────────────────────────────────────────────────────────

class CohortSerializer(serializers.ModelSerializer):
    departments = DepartmentActivationSerializer(
        source="department_activations", many=True, read_only=True
    )
    can_activate = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = Cohort
        fields = [
            "id", "program", "label", "sequence",
            "start_date", "end_date", "activation_date",
            "status", "can_activate",
            "opened_at", "closed_at",
            "departments",
        ]

    def get_status(self, obj):
        # Live-evaluate so the badge reflects "today" even if the Celery
        # sweep hasn't run yet this minute.
        return obj.refresh_status()

    def get_can_activate(self, obj):
        return obj.can_activate


# ──────────────────────────────────────────────────────────
# Program
# ──────────────────────────────────────────────────────────

class ProgramListSerializer(serializers.ModelSerializer):
    cohort_count = serializers.SerializerMethodField()
    active_cohort_label = serializers.SerializerMethodField()
    total_attachees = serializers.IntegerField(read_only=True)

    class Meta:
        model = Program
        fields = [
            "id", "name", "description",
            "start_date", "end_date",
            "cohort_count", "active_cohort_label", "total_attachees",
            "created_at",
        ]

    def get_cohort_count(self, obj):
        return obj.cohorts.count()

    def get_active_cohort_label(self, obj):
        active = obj.active_cohort
        return active.label if active else None


class ProgramDetailSerializer(ProgramListSerializer):
    cohorts = CohortSerializer(many=True, read_only=True)

    class Meta(ProgramListSerializer.Meta):
        fields = ProgramListSerializer.Meta.fields + ["cohort_schedule_mode", "cohorts", "updated_at"]


class ProgramCreateSerializer(serializers.ModelSerializer):
    """
    Admin supplies only name + description, plus an overall date range.
    Optionally, cohort_schedule_mode='manual' with an explicit `cohorts`
    list of 3 {start_date, end_date} pairs to override auto-splitting.
    The 3 Cohort rows themselves are created by the post_save signal,
    not here — this serializer just stashes manual dates for it to read.
    """
    cohorts = serializers.ListField(
        child=serializers.DictField(), required=False, write_only=True
    )

    class Meta:
        model = Program
        fields = [
            "name", "description", "start_date", "end_date",
            "cohort_schedule_mode", "cohorts",
        ]

    def validate(self, attrs):
        if attrs["start_date"] >= attrs["end_date"]:
            raise serializers.ValidationError("start_date must be before end_date.")
        if attrs.get("cohort_schedule_mode") == Program.SCHEDULE_MANUAL:
            cohorts = attrs.get("cohorts") or []
            if len(cohorts) != 3:
                raise serializers.ValidationError(
                    {"cohorts": "Manual scheduling requires exactly 3 cohort date ranges."}
                )
            for i, c in enumerate(cohorts, start=1):
                if not c.get("start_date") or not c.get("end_date"):
                    raise serializers.ValidationError(
                        {"cohorts": f"Cohort {i} is missing a start_date or end_date."}
                    )
        return attrs

    def create(self, validated_data):
        manual_dates = validated_data.pop("cohorts", None)
        validated_data["created_by"] = self.context["request"].user
        program = Program(**validated_data)
        if manual_dates:
            # Read by the auto_create_cohorts signal handler before the
            # row is committed — post_save fires after save() returns,
            # by which point this attribute is already set on the
            # in-memory instance that gets passed to the receiver.
            program._manual_cohort_dates = manual_dates
        program.save()
        return program


# ──────────────────────────────────────────────────────────
# Department-scoped Logbook list (attachee progress view)
# ──────────────────────────────────────────────────────────

class DepartmentLogbookSerializer(serializers.ModelSerializer):
    attachee = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    completion_percentage = serializers.IntegerField(read_only=True)
    total_entries = serializers.IntegerField(read_only=True)
    approved_entries = serializers.IntegerField(read_only=True)
    locked_entries = serializers.SerializerMethodField()
    today_entry_status = serializers.SerializerMethodField()

    class Meta:
        model = Logbook
        fields = [
            "id", "attachee", "department",
            "start_date", "end_date",
            "completion_percentage", "total_entries", "approved_entries",
            "locked_entries", "today_entry_status",
        ]

    def get_attachee(self, obj):
        return UserMinimalSerializer(obj.intern, context=self.context).data

    def get_department(self, obj):
        return obj.department.name if obj.department else ""

    def get_locked_entries(self, obj):
        return obj.entries.filter(locked=True).count()

    def get_today_entry_status(self, obj):
        from django.utils import timezone as tz
        today = tz.now().date()
        entry = obj.entries.filter(date=today).first()
        return entry.status if entry else None