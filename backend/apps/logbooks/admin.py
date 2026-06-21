"""
apps/logbooks/admin.py

Rich Django admin for Logbooks — inline entries, audit log, filters.
"""
from django.contrib import admin
from django.utils.html import format_html
from .models import (
    Logbook, LogbookEntry, EntryAttachment, LogbookComment, LogbookAuditLog,
    Program, Cohort, DepartmentActivation,
)


class LogbookEntryInline(admin.TabularInline):
    model = LogbookEntry
    extra = 0
    fields = ["date", "status", "hours_worked", "mood_rating", "supervisor_rating"]
    readonly_fields = ["status", "submitted_at", "reviewed_at"]
    show_change_link = True
    ordering = ["-date"]


class AuditLogInline(admin.TabularInline):
    model = LogbookAuditLog
    extra = 0
    readonly_fields = ["action", "actor", "detail", "ip_address", "timestamp"]
    can_delete = False
    ordering = ["-timestamp"]

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Logbook)
class LogbookAdmin(admin.ModelAdmin):
    list_display = [
        "title", "intern", "supervisor", "start_date", "end_date",
        "final_submitted", "final_approved", "overall_rating", "completion_badge",
    ]
    list_filter = ["final_submitted", "final_approved", "overall_rating"]
    search_fields = ["title", "intern__email", "intern__first_name", "intern__last_name"]
    raw_id_fields = ["intern", "supervisor", "department", "final_approved_by"]
    inlines = [LogbookEntryInline, AuditLogInline]
    readonly_fields = [
        "final_submitted_at", "final_approved_at", "final_approved_by",
        "intern_signed_at", "supervisor_signed_at", "created_at", "updated_at",
    ]
    date_hierarchy = "start_date"

    @admin.display(description="Completion")
    def completion_badge(self, obj):
        pct = obj.completion_percentage
        color = "green" if pct >= 80 else "orange" if pct >= 50 else "red"
        return format_html('<b style="color:{}">{} %</b>', color, pct)


class AttachmentInline(admin.TabularInline):
    model = EntryAttachment
    extra = 0
    readonly_fields = ["original_name", "file_size", "content_type", "uploaded_by", "uploaded_at"]
    can_delete = True


class CommentInline(admin.TabularInline):
    model = LogbookComment
    extra = 0
    readonly_fields = ["author", "created_at"]
    fields = ["author", "body", "created_at"]


@admin.register(LogbookEntry)
class LogbookEntryAdmin(admin.ModelAdmin):
    list_display = [
        "logbook", "date", "status", "hours_worked",
        "mood_rating", "supervisor_rating", "reviewed_by",
    ]
    list_filter = ["status", "mood_rating", "supervisor_rating"]
    search_fields = ["logbook__title", "logbook__intern__email", "activities"]
    raw_id_fields = ["logbook", "reviewed_by"]
    readonly_fields = [
        "submitted_at", "reviewed_at", "reviewed_by",
        "intern_acknowledged_at", "created_at", "updated_at",
    ]
    inlines = [AttachmentInline, CommentInline]
    date_hierarchy = "date"
    ordering = ["-date"]


@admin.register(LogbookAuditLog)
class LogbookAuditLogAdmin(admin.ModelAdmin):
    list_display = ["action", "actor", "logbook", "entry", "ip_address", "timestamp"]
    list_filter = ["action"]
    search_fields = ["actor__email", "logbook__title"]
    readonly_fields = ["logbook", "entry", "actor", "action", "detail", "ip_address", "timestamp"]
    date_hierarchy = "timestamp"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


class DepartmentActivationInline(admin.TabularInline):
    model = DepartmentActivation
    extra = 0
    fields = ["department", "supervisor", "is_active", "activated_at", "logbooks_created", "email_sent"]
    readonly_fields = ["activated_at", "logbooks_created", "email_sent"]
    show_change_link = True


class CohortInline(admin.TabularInline):
    model = Cohort
    extra = 0
    fields = ["sequence", "label", "start_date", "end_date", "activation_date", "status"]
    readonly_fields = ["status", "opened_at", "closed_at"]
    show_change_link = True
    ordering = ["sequence"]

    def has_add_permission(self, request, obj=None):
        # Cohorts are auto-created by the Program post_save signal —
        # never add them manually from the admin.
        return False


@admin.register(Program)
class ProgramAdmin(admin.ModelAdmin):
    list_display = [
        "name", "start_date", "end_date", "cohort_schedule_mode",
        "active_cohort_badge", "total_attachees", "created_by", "created_at",
    ]
    list_filter = ["cohort_schedule_mode"]
    search_fields = ["name", "description"]
    inlines = [CohortInline]
    readonly_fields = ["created_at", "updated_at"]
    date_hierarchy = "start_date"

    @admin.display(description="Active cohort")
    def active_cohort_badge(self, obj):
        active = obj.active_cohort
        if not active:
            return format_html('<span style="color:#6b7280">None</span>')
        return format_html('<b style="color:#16a34a">{}</b>', active.label)

    @admin.display(description="Attachees")
    def total_attachees(self, obj):
        return obj.total_attachees


@admin.register(Cohort)
class CohortAdmin(admin.ModelAdmin):
    list_display = [
        "label", "program", "sequence", "start_date", "end_date",
        "activation_date", "status", "opened_at", "closed_at",
    ]
    list_filter = ["status"]
    search_fields = ["label", "program__name"]
    raw_id_fields = ["program"]
    inlines = [DepartmentActivationInline]
    readonly_fields = ["status", "opened_at", "closed_at", "created_at", "updated_at"]
    date_hierarchy = "start_date"
    ordering = ["program", "sequence"]

    def has_add_permission(self, request):
        # Cohorts are auto-created by the Program post_save signal.
        return False


@admin.register(DepartmentActivation)
class DepartmentActivationAdmin(admin.ModelAdmin):
    list_display = [
        "department", "cohort", "supervisor", "is_active",
        "activated_at", "logbooks_created", "email_sent",
    ]
    list_filter = ["is_active", "logbooks_created", "email_sent"]
    search_fields = ["department__name", "cohort__label", "cohort__program__name"]
    raw_id_fields = ["cohort", "department", "supervisor", "activated_by"]
    readonly_fields = [
        "activated_at", "deactivated_at", "logbooks_created", "email_sent",
        "created_at", "updated_at",
    ]
