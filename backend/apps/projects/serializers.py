"""
Enterprise Internship Management System
Projects App — Serializers
Production-Grade | DRF
"""

from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import (
    Project, ProjectMember, KanbanBoard, KanbanColumn,
    Sprint, Milestone, Task, TaskAssignment, TaskDependency,
    TaskSubmission, TaskAttachment, TimeLog, TaskChecklist,
    ChecklistItem, Comment, Risk, ProjectDocument, ProjectExpense,
    ExpenseCategory, ProjectActivity, ProjectMeeting, ProjectNotificationPreference,
)

User = get_user_model()


# ─────────────────────────────────────────────────────────────────────────────
# INLINE USER
# ─────────────────────────────────────────────────────────────────────────────

class UserMinimalSerializer(serializers.ModelSerializer):
    full_name  = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = ('id', 'full_name', 'email', 'avatar_url')

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

    def get_avatar_url(self, obj):
        return getattr(obj, 'avatar_url', None)


# ─────────────────────────────────────────────────────────────────────────────
# PROJECT MEMBER
# ─────────────────────────────────────────────────────────────────────────────

class ProjectMemberSerializer(serializers.ModelSerializer):
    user = UserMinimalSerializer(read_only=True)
    user_id = serializers.UUIDField(write_only=True)

    class Meta:
        model  = ProjectMember
        fields = (
            'id', 'user', 'user_id', 'role', 'allocation_percent',
            'joined_at', 'left_at', 'is_active',
        )

    def create(self, validated_data):
        user_id = validated_data.pop('user_id')
        user    = User.objects.get(pk=user_id)
        return ProjectMember.objects.create(user=user, **validated_data)


# ─────────────────────────────────────────────────────────────────────────────
# KANBAN
# ─────────────────────────────────────────────────────────────────────────────

class KanbanColumnSerializer(serializers.ModelSerializer):
    task_count = serializers.SerializerMethodField()

    class Meta:
        model  = KanbanColumn
        fields = ('id', 'name', 'color', 'position', 'wip_limit', 'maps_to_status', 'task_count')

    def get_task_count(self, obj):
        return obj.tasks.filter(is_archived=False).count()


class KanbanBoardSerializer(serializers.ModelSerializer):
    columns = KanbanColumnSerializer(many=True, read_only=True)

    class Meta:
        model  = KanbanBoard
        fields = ('id', 'name', 'description', 'is_default', 'columns')


# ─────────────────────────────────────────────────────────────────────────────
# SPRINT
# ─────────────────────────────────────────────────────────────────────────────

class SprintSerializer(serializers.ModelSerializer):
    task_count   = serializers.SerializerMethodField()
    done_count   = serializers.SerializerMethodField()

    class Meta:
        model  = Sprint
        fields = (
            'id', 'name', 'goal', 'status', 'start_date', 'end_date',
            'velocity', 'task_count', 'done_count', 'created_at',
        )

    def get_task_count(self, obj):
        return obj.tasks.count()

    def get_done_count(self, obj):
        return obj.tasks.filter(status__in=('done', 'approved')).count()


# ─────────────────────────────────────────────────────────────────────────────
# MILESTONE
# ─────────────────────────────────────────────────────────────────────────────

class MilestoneSerializer(serializers.ModelSerializer):
    owner      = UserMinimalSerializer(read_only=True)
    owner_id   = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    is_overdue = serializers.ReadOnlyField()
    task_count = serializers.SerializerMethodField()

    class Meta:
        model  = Milestone
        fields = (
            'id', 'name', 'description', 'due_date', 'completed_date',
            'status', 'owner', 'owner_id', 'is_overdue', 'task_count',
        )

    def get_task_count(self, obj):
        return obj.tasks.count()


# ─────────────────────────────────────────────────────────────────────────────
# TASK ATTACHMENT
# ─────────────────────────────────────────────────────────────────────────────

class TaskAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by = UserMinimalSerializer(read_only=True)

    class Meta:
        model  = TaskAttachment
        fields = ('id', 'file_name', 'file_url', 'file_size', 'mime_type', 'uploaded_by', 'created_at')


# ─────────────────────────────────────────────────────────────────────────────
# TIME LOG
# ─────────────────────────────────────────────────────────────────────────────

class TimeLogSerializer(serializers.ModelSerializer):
    logged_by = UserMinimalSerializer(read_only=True)

    class Meta:
        model  = TimeLog
        fields = ('id', 'date', 'hours', 'description', 'is_billable', 'logged_by', 'created_at')

    def create(self, validated_data):
        validated_data['logged_by'] = self.context['request'].user
        return super().create(validated_data)


# ─────────────────────────────────────────────────────────────────────────────
# CHECKLIST
# ─────────────────────────────────────────────────────────────────────────────

class ChecklistItemSerializer(serializers.ModelSerializer):
    completed_by = UserMinimalSerializer(read_only=True)

    class Meta:
        model  = ChecklistItem
        fields = ('id', 'text', 'is_done', 'completed_by', 'completed_at', 'position')


class TaskChecklistSerializer(serializers.ModelSerializer):
    items = ChecklistItemSerializer(many=True, read_only=True)
    completion_percent = serializers.SerializerMethodField()

    class Meta:
        model  = TaskChecklist
        fields = ('id', 'title', 'position', 'items', 'completion_percent')

    def get_completion_percent(self, obj):
        items = obj.items.all()
        total = items.count()
        if not total:
            return 0
        done = items.filter(is_done=True).count()
        return round((done / total) * 100)


# ─────────────────────────────────────────────────────────────────────────────
# COMMENT
# ─────────────────────────────────────────────────────────────────────────────

class CommentSerializer(serializers.ModelSerializer):
    author  = UserMinimalSerializer(read_only=True)
    replies = serializers.SerializerMethodField()

    class Meta:
        model  = Comment
        fields = (
            'id', 'author', 'body', 'comment_type', 'parent',
            'is_edited', 'replies', 'created_at', 'updated_at',
        )

    def get_replies(self, obj):
        if obj.parent is None:
            return CommentSerializer(obj.replies.all(), many=True, context=self.context).data
        return []

    def create(self, validated_data):
        validated_data['author'] = self.context['request'].user
        return super().create(validated_data)


# ─────────────────────────────────────────────────────────────────────────────
# TASK SUBMISSION
# ─────────────────────────────────────────────────────────────────────────────

class TaskSubmissionSerializer(serializers.ModelSerializer):
    submitted_by = UserMinimalSerializer(read_only=True)
    reviewed_by  = UserMinimalSerializer(read_only=True)
    attachments  = TaskAttachmentSerializer(many=True, read_only=True)
    comments     = CommentSerializer(many=True, read_only=True)

    class Meta:
        model  = TaskSubmission
        fields = (
            'id', 'notes', 'status', 'submitted_by', 'reviewed_by',
            'reviewed_at', 'review_notes', 'attachments', 'comments', 'created_at',
        )
        read_only_fields = ('submitted_by', 'reviewed_by', 'reviewed_at', 'status')

    def create(self, validated_data):
        validated_data['submitted_by'] = self.context['request'].user
        return super().create(validated_data)


# ─────────────────────────────────────────────────────────────────────────────
# TASK DEPENDENCY
# ─────────────────────────────────────────────────────────────────────────────

class TaskDependencySerializer(serializers.ModelSerializer):
    class Meta:
        model  = TaskDependency
        fields = ('id', 'predecessor', 'successor', 'dependency_type', 'lag_days')


# ─────────────────────────────────────────────────────────────────────────────
# TASK — LIST (lightweight for Kanban cards / Gantt rows)
# ─────────────────────────────────────────────────────────────────────────────

class TaskListSerializer(serializers.ModelSerializer):
    assignees    = UserMinimalSerializer(many=True, read_only=True)
    reporter     = UserMinimalSerializer(read_only=True)
    is_overdue   = serializers.ReadOnlyField()
    subtask_count = serializers.SerializerMethodField()
    attachment_count = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()

    class Meta:
        model  = Task
        fields = (
            'id', 'reference', 'title', 'status', 'priority',
            'start_date', 'due_date', 'progress_percent', 'story_points',
            'estimated_hours', 'logged_hours', 'tags', 'labels',
            'kanban_position', 'kanban_column', 'project',
            'assignees', 'reporter', 'is_overdue',
            'subtask_count', 'attachment_count', 'comment_count',
            'milestone', 'sprint', 'parent',
        )

    def get_subtask_count(self, obj):
        return obj.subtasks.count()

    def get_attachment_count(self, obj):
        return obj.attachments.count()

    def get_comment_count(self, obj):
        return obj.comments.count()


# ─────────────────────────────────────────────────────────────────────────────
# TASK — DETAIL (full with nested data)
# ─────────────────────────────────────────────────────────────────────────────

class TaskDetailSerializer(serializers.ModelSerializer):
    assignees    = UserMinimalSerializer(many=True, read_only=True)
    reporter     = UserMinimalSerializer(read_only=True)
    checklists   = TaskChecklistSerializer(many=True, read_only=True)
    comments     = serializers.SerializerMethodField()
    attachments  = TaskAttachmentSerializer(many=True, read_only=True)
    submissions  = TaskSubmissionSerializer(many=True, read_only=True)
    time_logs    = TimeLogSerializer(many=True, read_only=True)
    subtasks     = TaskListSerializer(many=True, read_only=True)
    predecessors = TaskDependencySerializer(many=True, read_only=True)
    successors   = TaskDependencySerializer(many=True, read_only=True)
    is_overdue   = serializers.ReadOnlyField()

    class Meta:
        model  = Task
        fields = '__all__'

    def get_comments(self, obj):
        top_level = obj.comments.filter(parent=None)
        return CommentSerializer(top_level, many=True, context=self.context).data


class TaskCreateUpdateSerializer(serializers.ModelSerializer):
    assignee_ids = serializers.ListField(child=serializers.UUIDField(), write_only=True, required=False)

    class Meta:
        model  = Task
        exclude = ('assignees', 'reference', 'project', 'reporter')

    def create(self, validated_data):
        assignee_ids = validated_data.pop('assignee_ids', [])
        # project, reporter, and reference are injected via serializer.save(**kwargs)
        # from TaskViewSet.perform_create, since they're server-derived and not
        # client-supplied input fields.
        task = Task.objects.create(**validated_data)
        for uid in assignee_ids:
            try:
                user = User.objects.get(pk=uid)
                TaskAssignment.objects.create(task=task, user=user)
            except User.DoesNotExist:
                pass
        return task

    def update(self, instance, validated_data):
        assignee_ids = validated_data.pop('assignee_ids', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if assignee_ids is not None:
            TaskAssignment.objects.filter(task=instance).delete()
            for uid in assignee_ids:
                try:
                    user = User.objects.get(pk=uid)
                    TaskAssignment.objects.create(task=instance, user=user)
                except User.DoesNotExist:
                    pass
        return instance


# ─────────────────────────────────────────────────────────────────────────────
# RISK
# ─────────────────────────────────────────────────────────────────────────────

class RiskSerializer(serializers.ModelSerializer):
    owner      = UserMinimalSerializer(read_only=True)
    owner_id   = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    risk_score = serializers.ReadOnlyField()

    class Meta:
        model  = Risk
        fields = (
            'id', 'title', 'description', 'category', 'severity',
            'probability', 'impact_score', 'risk_score', 'status',
            'mitigation_plan', 'contingency_plan', 'owner', 'owner_id',
            'due_date', 'resolved_at', 'created_at',
        )


# ─────────────────────────────────────────────────────────────────────────────
# PROJECT EXPENSE (Budget Tracking)
# ─────────────────────────────────────────────────────────────────────────────

class ProjectExpenseSerializer(serializers.ModelSerializer):
    submitted_by = UserMinimalSerializer(read_only=True)
    reviewed_by  = UserMinimalSerializer(read_only=True)
    task_id      = serializers.UUIDField(write_only=True, required=False, allow_null=True)

    class Meta:
        model  = ProjectExpense
        fields = (
            'id', 'title', 'description', 'category', 'amount', 'currency',
            'incurred_on', 'status', 'submitted_by', 'reviewed_by',
            'reviewed_at', 'review_notes', 'receipt_url', 'task', 'task_id',
            'created_at',
        )
        read_only_fields = ('status', 'submitted_by', 'reviewed_by', 'reviewed_at', 'task')

    def create(self, validated_data):
        task_id = validated_data.pop('task_id', None)
        validated_data['submitted_by'] = self.context['request'].user
        if task_id:
            validated_data['task_id'] = task_id
        return super().create(validated_data)


# ─────────────────────────────────────────────────────────────────────────────
# PROJECT DOCUMENT
# ─────────────────────────────────────────────────────────────────────────────

class ProjectDocumentSerializer(serializers.ModelSerializer):
    uploaded_by = UserMinimalSerializer(read_only=True)

    class Meta:
        model  = ProjectDocument
        fields = (
            'id', 'title', 'doc_type', 'description', 'file_url',
            'file_name', 'file_size', 'mime_type', 'version',
            'is_latest', 'uploaded_by', 'created_at',
        )

    def create(self, validated_data):
        validated_data['uploaded_by'] = self.context['request'].user
        return super().create(validated_data)


# ─────────────────────────────────────────────────────────────────────────────
# ACTIVITY
# ─────────────────────────────────────────────────────────────────────────────

class ProjectActivitySerializer(serializers.ModelSerializer):
    actor = UserMinimalSerializer(read_only=True)

    class Meta:
        model  = ProjectActivity
        fields = ('id', 'actor', 'verb', 'description', 'task', 'meta', 'created_at')


# ─────────────────────────────────────────────────────────────────────────────
# MEETING
# ─────────────────────────────────────────────────────────────────────────────

class ProjectMeetingSerializer(serializers.ModelSerializer):
    organizer  = UserMinimalSerializer(read_only=True)
    attendees  = UserMinimalSerializer(many=True, read_only=True)
    attendee_ids = serializers.ListField(child=serializers.UUIDField(), write_only=True, required=False)

    class Meta:
        model  = ProjectMeeting
        fields = (
            'id', 'title', 'description', 'scheduled_at', 'duration_min',
            'location', 'organizer', 'attendees', 'attendee_ids',
            'minutes', 'is_completed', 'gcal_event_id', 'created_at',
        )

    def create(self, validated_data):
        attendee_ids = validated_data.pop('attendee_ids', [])
        validated_data['organizer'] = self.context['request'].user
        meeting = ProjectMeeting.objects.create(**validated_data)
        if attendee_ids:
            meeting.attendees.set(User.objects.filter(pk__in=attendee_ids))
        return meeting


# ─────────────────────────────────────────────────────────────────────────────
# PROJECT — LIST
# ─────────────────────────────────────────────────────────────────────────────

class ProjectListSerializer(serializers.ModelSerializer):
    owner        = UserMinimalSerializer(read_only=True)
    manager      = UserMinimalSerializer(read_only=True)
    member_count = serializers.SerializerMethodField()
    task_count   = serializers.SerializerMethodField()
    open_risks   = serializers.SerializerMethodField()
    is_overdue   = serializers.ReadOnlyField()
    budget_utilization = serializers.ReadOnlyField()

    class Meta:
        model  = Project
        fields = (
            'id', 'name', 'code', 'description', 'cover_color', 'cover_image',
            'status', 'priority', 'start_date', 'end_date', 'actual_end_date',
            'progress_percent', 'budget_allocated', 'budget_spent',
            'budget_utilization', 'is_overdue', 'is_confidential',
            'tags', 'owner', 'manager', 'member_count', 'task_count',
            'open_risks', 'created_at',
        )

    def get_member_count(self, obj):
        return obj.members.filter(is_active=True).count()

    def get_task_count(self, obj):
        return obj.tasks.count()

    def get_open_risks(self, obj):
        return obj.risks.exclude(status='resolved').count()


# ─────────────────────────────────────────────────────────────────────────────
# PROJECT — DETAIL
# ─────────────────────────────────────────────────────────────────────────────

class ProjectDetailSerializer(serializers.ModelSerializer):
    owner        = UserMinimalSerializer(read_only=True)
    manager      = UserMinimalSerializer(read_only=True)
    members      = ProjectMemberSerializer(many=True, read_only=True)
    kanban_boards = KanbanBoardSerializer(many=True, read_only=True)
    sprints      = SprintSerializer(many=True, read_only=True)
    milestones   = MilestoneSerializer(many=True, read_only=True)
    risks        = RiskSerializer(many=True, read_only=True)
    documents    = ProjectDocumentSerializer(many=True, read_only=True)
    meetings     = ProjectMeetingSerializer(many=True, read_only=True)
    expenses     = ProjectExpenseSerializer(many=True, read_only=True)
    is_overdue   = serializers.ReadOnlyField()
    budget_utilization = serializers.ReadOnlyField()

    # Computed analytics
    task_stats     = serializers.SerializerMethodField()
    activity_feed   = serializers.SerializerMethodField()
    budget_summary  = serializers.SerializerMethodField()

    class Meta:
        model  = Project
        fields = '__all__'

    def get_task_stats(self, obj):
        tasks = obj.tasks.all()
        total = tasks.count()
        by_status = {}
        for choice in ['backlog', 'pending', 'in_progress', 'in_review', 'done', 'approved', 'rejected', 'overdue']:
            by_status[choice] = tasks.filter(status=choice).count()
        return {
            'total': total,
            'completed': tasks.filter(status__in=['done', 'approved']).count(),
            'overdue': tasks.filter(status='overdue').count(),
            'by_status': by_status,
        }

    def get_activity_feed(self, obj):
        activities = obj.activities.select_related('actor').order_by('-created_at')[:20]
        return ProjectActivitySerializer(activities, many=True).data

    def get_budget_summary(self, obj):
        from django.db.models import Sum
        expenses = obj.expenses.all()
        approved = expenses.filter(status='approved')
        pending  = expenses.filter(status='pending')
        by_category = {}
        for choice, _ in ExpenseCategory.choices:
            cat_total = approved.filter(category=choice).aggregate(s=Sum('amount'))['s'] or 0
            if cat_total:
                by_category[choice] = float(cat_total)
        return {
            'total_logged': expenses.count(),
            'approved_total': float(approved.aggregate(s=Sum('amount'))['s'] or 0),
            'pending_total': float(pending.aggregate(s=Sum('amount'))['s'] or 0),
            'pending_count': pending.count(),
            'by_category': by_category,
        }


# ─────────────────────────────────────────────────────────────────────────────
# PROJECT CREATE / UPDATE
# ─────────────────────────────────────────────────────────────────────────────

class ProjectCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Project
        exclude = ('created_by', 'owner')

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        validated_data['owner'] = self.context['request'].user
        return super().create(validated_data)


# ─────────────────────────────────────────────────────────────────────────────
# KANBAN BULK MOVE (for drag-and-drop)
# ─────────────────────────────────────────────────────────────────────────────

class KanbanBulkMoveSerializer(serializers.Serializer):
    task_id        = serializers.UUIDField()
    target_column  = serializers.UUIDField()
    position       = serializers.IntegerField(min_value=0)


# ─────────────────────────────────────────────────────────────────────────────
# GANTT DATA (optimised flat representation)
# ─────────────────────────────────────────────────────────────────────────────

class GanttTaskSerializer(serializers.ModelSerializer):
    dependencies = serializers.SerializerMethodField()
    assignees    = UserMinimalSerializer(many=True, read_only=True)
    milestone_name = serializers.SerializerMethodField()

    class Meta:
        model  = Task
        fields = (
            'id', 'reference', 'title', 'status', 'priority',
            'start_date', 'due_date', 'progress_percent', 'parent',
            'assignees', 'dependencies', 'milestone_name',
        )

    def get_dependencies(self, obj):
        return [str(dep.predecessor_id) for dep in obj.predecessors.all()]

    def get_milestone_name(self, obj):
        return obj.milestone.name if obj.milestone else None


# ─────────────────────────────────────────────────────────────────────────────
# NOTIFICATION PREFERENCE
# ─────────────────────────────────────────────────────────────────────────────

class NotificationPrefSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ProjectNotificationPreference
        exclude = ('project', 'user', 'created_by')