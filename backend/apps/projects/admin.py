"""
Enterprise Internship Management System
Projects App — Django Admin Configuration
"""

from django.contrib import admin
from .models import (
    Project, ProjectMember, KanbanBoard, KanbanColumn,
    Sprint, Milestone, Task, TaskAssignment, TaskDependency,
    TaskSubmission, TaskAttachment, TimeLog, TaskChecklist,
    ChecklistItem, Comment, Risk, ProjectDocument, ProjectExpense,
    ProjectActivity, ProjectMeeting, ProjectNotificationPreference,
)


class ProjectMemberInline(admin.TabularInline):
    model = ProjectMember
    extra = 0
    fields = ('user', 'role', 'allocation_percent', 'is_active')


class MilestoneInline(admin.TabularInline):
    model = Milestone
    extra = 0
    fields = ('name', 'due_date', 'status')


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display  = ('code', 'name', 'status', 'priority', 'owner', 'progress_percent', 'is_overdue_display', 'created_at')
    list_filter   = ('status', 'priority', 'is_archived', 'is_confidential', 'department', 'branch')
    search_fields = ('name', 'code', 'description')
    readonly_fields = ('id', 'created_at', 'updated_at')
    inlines = [ProjectMemberInline, MilestoneInline]
    date_hierarchy = 'created_at'
    fieldsets = (
        ('Identity', {'fields': ('id', 'name', 'code', 'description', 'objectives', 'cover_color', 'cover_image')}),
        ('Organization', {'fields': ('department', 'branch', 'owner', 'manager')}),
        ('Lifecycle', {'fields': ('status', 'priority', 'start_date', 'end_date', 'actual_end_date', 'progress_percent')}),
        ('Budget', {'fields': ('budget_allocated', 'budget_spent')}),
        ('Flags', {'fields': ('is_confidential', 'is_archived', 'is_template', 'tags')}),
        ('Audit', {'fields': ('created_by', 'created_at', 'updated_at')}),
    )

    def is_overdue_display(self, obj):
        return obj.is_overdue
    is_overdue_display.boolean = True
    is_overdue_display.short_description = 'Overdue'


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display  = ('reference', 'title', 'project', 'status', 'priority', 'due_date', 'is_overdue_display')
    list_filter   = ('status', 'priority', 'project')
    search_fields = ('reference', 'title', 'description')
    readonly_fields = ('id', 'created_at', 'updated_at')
    date_hierarchy = 'due_date'

    def is_overdue_display(self, obj):
        return obj.is_overdue
    is_overdue_display.boolean = True
    is_overdue_display.short_description = 'Overdue'


@admin.register(Sprint)
class SprintAdmin(admin.ModelAdmin):
    list_display  = ('name', 'project', 'status', 'start_date', 'end_date', 'velocity')
    list_filter   = ('status', 'project')


@admin.register(Milestone)
class MilestoneAdmin(admin.ModelAdmin):
    list_display  = ('name', 'project', 'status', 'due_date', 'is_overdue_display')
    list_filter   = ('status', 'project')

    def is_overdue_display(self, obj):
        return obj.is_overdue
    is_overdue_display.boolean = True
    is_overdue_display.short_description = 'Overdue'


@admin.register(Risk)
class RiskAdmin(admin.ModelAdmin):
    list_display  = ('title', 'project', 'severity', 'probability', 'impact_score', 'risk_score_display', 'status')
    list_filter   = ('severity', 'status', 'project')

    def risk_score_display(self, obj):
        return obj.risk_score
    risk_score_display.short_description = 'Risk Score'


@admin.register(ProjectExpense)
class ProjectExpenseAdmin(admin.ModelAdmin):
    list_display  = ('title', 'project', 'category', 'amount', 'currency', 'status', 'incurred_on', 'submitted_by')
    list_filter   = ('category', 'status', 'project')
    search_fields = ('title', 'description')
    date_hierarchy = 'incurred_on'


@admin.register(ProjectMember)
class ProjectMemberAdmin(admin.ModelAdmin):
    list_display = ('project', 'user', 'role', 'allocation_percent', 'is_active')
    list_filter  = ('role', 'is_active')


@admin.register(KanbanBoard)
class KanbanBoardAdmin(admin.ModelAdmin):
    list_display = ('name', 'project', 'is_default')


@admin.register(KanbanColumn)
class KanbanColumnAdmin(admin.ModelAdmin):
    list_display = ('name', 'board', 'position', 'wip_limit')


@admin.register(TaskSubmission)
class TaskSubmissionAdmin(admin.ModelAdmin):
    list_display = ('task', 'submitted_by', 'status', 'reviewed_by', 'created_at')
    list_filter  = ('status',)


@admin.register(ProjectDocument)
class ProjectDocumentAdmin(admin.ModelAdmin):
    list_display = ('title', 'project', 'doc_type', 'version', 'is_latest', 'uploaded_by')
    list_filter  = ('doc_type', 'is_latest')


@admin.register(ProjectMeeting)
class ProjectMeetingAdmin(admin.ModelAdmin):
    list_display = ('title', 'project', 'scheduled_at', 'organizer', 'is_completed')
    list_filter  = ('is_completed',)
    date_hierarchy = 'scheduled_at'


@admin.register(ProjectActivity)
class ProjectActivityAdmin(admin.ModelAdmin):
    list_display  = ('project', 'actor', 'verb', 'created_at')
    list_filter   = ('verb',)
    readonly_fields = [f.name for f in ProjectActivity._meta.fields]  # immutable audit log

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


admin.site.register(TaskAssignment)
admin.site.register(TaskDependency)
admin.site.register(TaskAttachment)
admin.site.register(TimeLog)
admin.site.register(TaskChecklist)
admin.site.register(ChecklistItem)
admin.site.register(Comment)
admin.site.register(ProjectNotificationPreference)