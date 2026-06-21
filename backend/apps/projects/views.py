"""
Enterprise Internship Management System
Projects App — Views
Production-Grade | DRF ViewSets + Custom Actions
"""

from django.db import transaction
from django.db.models import Q, Count, Sum, Avg, F
from django.utils import timezone
from django.shortcuts import get_object_or_404

from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from django_filters.rest_framework import DjangoFilterBackend

from .models import (
    Project, ProjectMember, KanbanBoard, KanbanColumn,
    Sprint, Milestone, Task, TaskAssignment, TaskDependency,
    TaskSubmission, TaskAttachment, TimeLog, TaskChecklist,
    ChecklistItem, Comment, Risk, ProjectDocument, ProjectExpense,
    ProjectActivity, ProjectMeeting, ProjectNotificationPreference,
    ProjectStatus, TaskStatus, ExpenseStatus, recalculate_project_budget,
)
from .serializers import (
    ProjectListSerializer, ProjectDetailSerializer, ProjectCreateUpdateSerializer,
    ProjectMemberSerializer, KanbanBoardSerializer, KanbanColumnSerializer,
    SprintSerializer, MilestoneSerializer, TaskListSerializer,
    TaskDetailSerializer, TaskCreateUpdateSerializer, TaskSubmissionSerializer,
    TaskAttachmentSerializer, TimeLogSerializer, TaskChecklistSerializer,
    ChecklistItemSerializer, CommentSerializer, RiskSerializer,
    ProjectDocumentSerializer, ProjectExpenseSerializer, ProjectActivitySerializer,
    ProjectMeetingSerializer, NotificationPrefSerializer,
    KanbanBulkMoveSerializer, GanttTaskSerializer,
)


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def log_activity(project, actor, verb, description, task=None, meta=None):
    ProjectActivity.objects.create(
        project=project,
        actor=actor,
        verb=verb,
        description=description,
        task=task,
        meta=meta or {},
    )


def recalculate_project_progress(project):
    """Auto-update project progress from task completion."""
    tasks = project.tasks.all()
    total = tasks.count()
    if total:
        done = tasks.filter(status__in=['done', 'approved']).count()
        project.progress_percent = round((done / total) * 100)
        project.save(update_fields=['progress_percent', 'updated_at'])


# ─────────────────────────────────────────────────────────────────────────────
# PROJECT VIEWSET
# ─────────────────────────────────────────────────────────────────────────────

class ProjectViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields   = ['status', 'priority', 'department', 'branch', 'is_archived', 'is_template']
    search_fields      = ['name', 'code', 'description', 'tags']
    ordering_fields    = ['name', 'created_at', 'start_date', 'end_date', 'priority', 'progress_percent']
    ordering           = ['-created_at']

    def get_queryset(self):
        user = self.request.user
        qs   = Project.objects.select_related('owner', 'manager', 'department', 'branch')

        # RBAC — scope to user's memberships unless admin/hr/executive
        if not (user.is_staff or getattr(user, 'is_hr', False) or getattr(user, 'is_executive', False)):
            qs = qs.filter(
                Q(owner=user) |
                Q(manager=user) |
                Q(members__user=user, members__is_active=True)
            ).distinct()

        return qs.filter(is_archived=False)

    def get_serializer_class(self):
        if self.action in ('list',):
            return ProjectListSerializer
        if self.action in ('create', 'update', 'partial_update'):
            return ProjectCreateUpdateSerializer
        return ProjectDetailSerializer

    def perform_create(self, serializer):
        project = serializer.save()
        # Auto-add creator as lead member
        ProjectMember.objects.create(
            project=project,
            user=self.request.user,
            role='lead',
            created_by=self.request.user,
        )

        # Auto-create a default Kanban board with standard columns so the
        # Kanban tab works immediately without a separate setup step.
        board = KanbanBoard.objects.create(
            project=project,
            name='Main Board',
            is_default=True,
            created_by=self.request.user,
        )
        default_columns = [
            ('Backlog',     '#9CA3AF', TaskStatus.BACKLOG,     None),
            ('To Do',       '#6B7280', TaskStatus.PENDING,     None),
            ('In Progress', '#6366F1', TaskStatus.IN_PROGRESS, None),
            ('In Review',   '#8B5CF6', TaskStatus.IN_REVIEW,   None),
            ('Done',        '#10B981', TaskStatus.DONE,        None),
        ]
        for position, (name, color, maps_to_status, wip_limit) in enumerate(default_columns):
            KanbanColumn.objects.create(
                board=board,
                name=name,
                color=color,
                position=position,
                maps_to_status=maps_to_status,
                wip_limit=wip_limit,
                created_by=self.request.user,
            )

        log_activity(project, self.request.user, 'created', f'Project "{project.name}" created.')

    def perform_update(self, serializer):
        old = self.get_object()
        old_status = old.status
        project = serializer.save()
        if old_status != project.status:
            log_activity(
                project, self.request.user, 'status_changed',
                f'Status changed from {old_status} to {project.status}.',
                meta={'from': old_status, 'to': project.status}
            )

    def perform_destroy(self, instance):
        # Soft-archive instead of hard delete
        instance.is_archived = True
        instance.status = ProjectStatus.ARCHIVED
        instance.save(update_fields=['is_archived', 'status', 'updated_at'])
        log_activity(instance, self.request.user, 'archived', f'Project "{instance.name}" archived.')

    # ── CUSTOM ACTIONS ────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='restore')
    def restore(self, request, pk=None):
        project = self.get_object()
        project.is_archived = False
        project.status = ProjectStatus.ACTIVE
        project.save(update_fields=['is_archived', 'status', 'updated_at'])
        log_activity(project, request.user, 'restored', f'Project "{project.name}" restored.')
        return Response({'detail': 'Project restored.'})

    @action(detail=True, methods=['post'], url_path='duplicate')
    def duplicate(self, request, pk=None):
        """Duplicate project as template or new project."""
        original = self.get_object()
        with transaction.atomic():
            new_project = Project.objects.create(
                name=f'Copy of {original.name}',
                code=f'{original.code}-COPY-{int(timezone.now().timestamp())}',
                description=original.description,
                objectives=original.objectives,
                cover_color=original.cover_color,
                department=original.department,
                branch=original.branch,
                owner=request.user,
                priority=original.priority,
                status=ProjectStatus.DRAFT,
                budget_allocated=original.budget_allocated,
                tags=original.tags,
                created_by=request.user,
            )
            # Copy members
            for member in original.members.filter(is_active=True):
                ProjectMember.objects.create(
                    project=new_project,
                    user=member.user,
                    role=member.role,
                    allocation_percent=member.allocation_percent,
                )
            # Copy milestones
            for ms in original.milestones.all():
                Milestone.objects.create(
                    project=new_project,
                    name=ms.name,
                    description=ms.description,
                    due_date=ms.due_date,
                    status='pending',
                )
            log_activity(new_project, request.user, 'created', f'Duplicated from project {original.code}.')
        return Response(ProjectListSerializer(new_project).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='analytics')
    def analytics(self, request, pk=None):
        project = self.get_object()
        tasks   = project.tasks.all()
        members = project.members.filter(is_active=True)

        # Task burndown: tasks created vs completed per week
        task_stats = {
            'total': tasks.count(),
            'by_status': dict(tasks.values_list('status').annotate(c=Count('id')).values_list('status', 'c')),
            'by_priority': dict(tasks.values_list('priority').annotate(c=Count('id')).values_list('priority', 'c')),
            'overdue': tasks.filter(due_date__lt=timezone.now().date()).exclude(status__in=['done', 'approved']).count(),
            'total_estimated_hours': tasks.aggregate(s=Sum('estimated_hours'))['s'] or 0,
            'total_logged_hours': tasks.aggregate(s=Sum('logged_hours'))['s'] or 0,
        }

        risk_stats = {
            'total': project.risks.count(),
            'by_severity': dict(project.risks.values_list('severity').annotate(c=Count('id')).values_list('severity', 'c')),
            'open': project.risks.exclude(status='resolved').count(),
        }

        member_stats = []
        for m in members.select_related('user'):
            user_tasks = tasks.filter(assignees=m.user)
            member_stats.append({
                'user_id': str(m.user_id),
                'name': m.user.get_full_name() or m.user.username,
                'role': m.role,
                'task_count': user_tasks.count(),
                'completed': user_tasks.filter(status__in=['done', 'approved']).count(),
                'logged_hours': user_tasks.aggregate(s=Sum('logged_hours'))['s'] or 0,
            })

        sprint_stats = []
        for sprint in project.sprints.all():
            sprint_tasks = sprint.tasks.all()
            sprint_stats.append({
                'id': str(sprint.id),
                'name': sprint.name,
                'status': sprint.status,
                'total': sprint_tasks.count(),
                'done': sprint_tasks.filter(status__in=['done', 'approved']).count(),
                'velocity': sprint.velocity,
            })

        return Response({
            'project_id': str(project.id),
            'code': project.code,
            'progress_percent': project.progress_percent,
            'budget_utilization': project.budget_utilization,
            'task_stats': task_stats,
            'risk_stats': risk_stats,
            'member_stats': member_stats,
            'sprint_stats': sprint_stats,
        })

    @action(detail=True, methods=['get'], url_path='gantt')
    def gantt(self, request, pk=None):
        project = self.get_object()
        tasks   = project.tasks.prefetch_related('assignees', 'predecessors', 'milestone')
        return Response({
            'project': {'id': str(project.id), 'name': project.name, 'start_date': project.start_date, 'end_date': project.end_date},
            'tasks': GanttTaskSerializer(tasks, many=True).data,
            'milestones': MilestoneSerializer(project.milestones.all(), many=True).data,
            'sprints': SprintSerializer(project.sprints.all(), many=True).data,
        })

    @action(detail=True, methods=['get'], url_path='kanban')
    def kanban(self, request, pk=None):
        project = self.get_object()
        board   = project.kanban_boards.filter(is_default=True).first()
        if not board:
            board = project.kanban_boards.first()
        if not board:
            return Response({'detail': 'No Kanban board found for this project.'}, status=404)

        columns = board.columns.prefetch_related(
            'tasks__assignees', 'tasks__attachments', 'tasks__comments'
        ).order_by('position')

        data = []
        for col in columns:
            col_tasks = col.tasks.filter(is_archived=False, parent=None).order_by('kanban_position')
            data.append({
                **KanbanColumnSerializer(col).data,
                'tasks': TaskListSerializer(col_tasks, many=True).data,
            })

        return Response({'board': KanbanBoardSerializer(board).data, 'columns': data})

    @action(detail=True, methods=['post'], url_path='kanban/move')
    def kanban_move(self, request, pk=None):
        serializer = KanbanBulkMoveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        task   = get_object_or_404(Task, pk=data['task_id'], project=self.get_object())
        column = get_object_or_404(KanbanColumn, pk=data['target_column'])

        old_status = task.status
        task.kanban_column   = column
        task.kanban_position = data['position']
        if column.maps_to_status:
            task.status = column.maps_to_status
        task.save(update_fields=['kanban_column', 'kanban_position', 'status', 'updated_at'])

        if old_status != task.status:
            log_activity(
                task.project, request.user, 'task_moved',
                f'Task [{task.reference}] moved to column "{column.name}".',
                task=task,
                meta={'from_status': old_status, 'to_status': task.status, 'column': column.name}
            )
            recalculate_project_progress(task.project)

        return Response(TaskListSerializer(task).data)

    @action(detail=True, methods=['get'], url_path='activity')
    def activity(self, request, pk=None):
        project    = self.get_object()
        activities = project.activities.select_related('actor', 'task').order_by('-created_at')[:50]
        return Response(ProjectActivitySerializer(activities, many=True).data)

    @action(detail=True, methods=['get', 'put'], url_path='notification-preferences')
    def notification_preferences(self, request, pk=None):
        project = self.get_object()
        pref, _ = ProjectNotificationPreference.objects.get_or_create(
            project=project, user=request.user,
            defaults={'created_by': request.user}
        )
        if request.method == 'GET':
            return Response(NotificationPrefSerializer(pref).data)
        serializer = NotificationPrefSerializer(pref, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# ─────────────────────────────────────────────────────────────────────────────
# MEMBER VIEWSET
# ─────────────────────────────────────────────────────────────────────────────

class ProjectMemberViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = ProjectMemberSerializer

    def get_queryset(self):
        return ProjectMember.objects.filter(
            project_id=self.kwargs['project_pk']
        ).select_related('user')

    def perform_create(self, serializer):
        project = get_object_or_404(Project, pk=self.kwargs['project_pk'])
        member  = serializer.save(project=project, created_by=self.request.user)
        log_activity(project, self.request.user, 'member_added',
                     f'{member.user.get_full_name()} added to project as {member.role}.')

    def perform_destroy(self, instance):
        log_activity(instance.project, self.request.user, 'member_removed',
                     f'{instance.user.get_full_name()} removed from project.')
        instance.is_active = False
        instance.left_at   = timezone.now().date()
        instance.save(update_fields=['is_active', 'left_at', 'updated_at'])


# ─────────────────────────────────────────────────────────────────────────────
# KANBAN BOARD & COLUMN
# ─────────────────────────────────────────────────────────────────────────────

class KanbanBoardViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = KanbanBoardSerializer

    def get_queryset(self):
        return KanbanBoard.objects.filter(project_id=self.kwargs['project_pk'])

    def perform_create(self, serializer):
        project = get_object_or_404(Project, pk=self.kwargs['project_pk'])
        serializer.save(project=project, created_by=self.request.user)


class KanbanColumnViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = KanbanColumnSerializer

    def get_queryset(self):
        return KanbanColumn.objects.filter(board_id=self.kwargs['board_pk'])

    def perform_create(self, serializer):
        board = get_object_or_404(KanbanBoard, pk=self.kwargs['board_pk'])
        serializer.save(board=board, created_by=self.request.user)

    @action(detail=False, methods=['post'], url_path='reorder')
    def reorder(self, request, project_pk=None, board_pk=None):
        """Reorder columns: [{id, position}, ...]"""
        items = request.data.get('columns', [])
        for item in items:
            KanbanColumn.objects.filter(pk=item['id'], board_id=board_pk).update(position=item['position'])
        return Response({'detail': 'Columns reordered.'})


# ─────────────────────────────────────────────────────────────────────────────
# SPRINT VIEWSET
# ─────────────────────────────────────────────────────────────────────────────

class SprintViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = SprintSerializer

    def get_queryset(self):
        return Sprint.objects.filter(project_id=self.kwargs['project_pk'])

    def perform_create(self, serializer):
        project = get_object_or_404(Project, pk=self.kwargs['project_pk'])
        sprint  = serializer.save(project=project, created_by=self.request.user)
        log_activity(project, self.request.user, 'sprint_created', f'Sprint "{sprint.name}" created.')

    @action(detail=True, methods=['post'], url_path='start')
    def start(self, request, project_pk=None, pk=None):
        sprint = self.get_object()
        sprint.status = 'active'
        sprint.save(update_fields=['status', 'updated_at'])
        log_activity(sprint.project, request.user, 'sprint_started', f'Sprint "{sprint.name}" started.')
        return Response(SprintSerializer(sprint).data)

    @action(detail=True, methods=['post'], url_path='complete')
    def complete(self, request, project_pk=None, pk=None):
        sprint = self.get_object()
        velocity = sprint.tasks.filter(status__in=['done', 'approved']).aggregate(s=Sum('story_points'))['s'] or 0
        sprint.status   = 'completed'
        sprint.velocity = velocity
        sprint.save(update_fields=['status', 'velocity', 'updated_at'])
        log_activity(sprint.project, request.user, 'sprint_completed',
                     f'Sprint "{sprint.name}" completed. Velocity: {velocity} pts.')
        return Response(SprintSerializer(sprint).data)


# ─────────────────────────────────────────────────────────────────────────────
# MILESTONE VIEWSET
# ─────────────────────────────────────────────────────────────────────────────

class MilestoneViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = MilestoneSerializer

    def get_queryset(self):
        return Milestone.objects.filter(project_id=self.kwargs['project_pk'])

    def perform_create(self, serializer):
        project = get_object_or_404(Project, pk=self.kwargs['project_pk'])
        serializer.save(project=project, created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='complete')
    def mark_complete(self, request, project_pk=None, pk=None):
        milestone = self.get_object()
        milestone.status         = 'completed'
        milestone.completed_date = timezone.now().date()
        milestone.save(update_fields=['status', 'completed_date', 'updated_at'])
        log_activity(milestone.project, request.user, 'milestone_completed',
                     f'Milestone "{milestone.name}" marked complete.')
        return Response(MilestoneSerializer(milestone).data)


# ─────────────────────────────────────────────────────────────────────────────
# TASK VIEWSET
# ─────────────────────────────────────────────────────────────────────────────

class TaskViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields   = ['status', 'priority', 'sprint', 'milestone', 'assignees', 'kanban_column', 'parent']
    search_fields      = ['title', 'reference', 'description', 'tags']
    ordering_fields    = ['due_date', 'created_at', 'priority', 'kanban_position', 'progress_percent']

    def get_queryset(self):
        return Task.objects.filter(
            project_id=self.kwargs['project_pk'],
            is_archived=False,
        ).prefetch_related('assignees', 'attachments').select_related(
            'reporter', 'sprint', 'milestone', 'kanban_column', 'parent'
        )

    def get_serializer_class(self):
        if self.action == 'list':
            return TaskListSerializer
        if self.action in ('create', 'update', 'partial_update'):
            return TaskCreateUpdateSerializer
        return TaskDetailSerializer

    def perform_create(self, serializer):
        project = get_object_or_404(Project, pk=self.kwargs['project_pk'])
        # Auto-generate reference
        count   = Task.objects.filter(project=project).count() + 1
        ref     = f'{project.code}-{count:04d}'
        task    = serializer.save(
            project=project,
            reporter=self.request.user,
            reference=ref,
            created_by=self.request.user,
        )
        log_activity(project, self.request.user, 'task_created',
                     f'Task [{task.reference}] "{task.title}" created.', task=task)

    def perform_update(self, serializer):
        old_status = self.get_object().status
        task = serializer.save()
        if old_status != task.status:
            if task.status in ('done', 'approved'):
                task.completed_at = timezone.now()
                task.save(update_fields=['completed_at'])
            log_activity(
                task.project, self.request.user, 'task_status_changed',
                f'Task [{task.reference}] status: {old_status} → {task.status}.',
                task=task, meta={'from': old_status, 'to': task.status}
            )
            recalculate_project_progress(task.project)

    def perform_destroy(self, instance):
        instance.is_archived = True
        instance.save(update_fields=['is_archived', 'updated_at'])
        log_activity(instance.project, self.request.user, 'task_archived',
                     f'Task [{instance.reference}] archived.', task=instance)

    # ── NESTED ACTIONS ────────────────────────────────────────────────────────

    @action(detail=True, methods=['get', 'post'], url_path='comments')
    def comments(self, request, project_pk=None, pk=None):
        task = self.get_object()
        if request.method == 'GET':
            qs = task.comments.filter(parent=None).select_related('author').prefetch_related('replies__author')
            return Response(CommentSerializer(qs, many=True, context={'request': request}).data)
        serializer = CommentSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(task=task)
        log_activity(task.project, request.user, 'commented',
                     f'Comment added to task [{task.reference}].', task=task)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get', 'post'], url_path='time-logs')
    def time_logs(self, request, project_pk=None, pk=None):
        task = self.get_object()
        if request.method == 'GET':
            return Response(TimeLogSerializer(task.time_logs.all(), many=True).data)
        serializer = TimeLogSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        log_entry = serializer.save(task=task, logged_by=request.user, created_by=request.user)
        # Update task logged_hours
        task.logged_hours = (task.logged_hours or 0) + log_entry.hours
        task.save(update_fields=['logged_hours', 'updated_at'])
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get', 'post'], url_path='submissions')
    def submissions(self, request, project_pk=None, pk=None):
        task = self.get_object()
        if request.method == 'GET':
            return Response(TaskSubmissionSerializer(task.submissions.all(), many=True, context={'request': request}).data)
        serializer = TaskSubmissionSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        submission = serializer.save(task=task, submitted_by=request.user, created_by=request.user)
        task.status = TaskStatus.SUBMITTED
        task.save(update_fields=['status', 'updated_at'])
        log_activity(task.project, request.user, 'task_submitted',
                     f'Task [{task.reference}] submitted for review.', task=task)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='submissions/(?P<sub_pk>[^/.]+)/review')
    def review_submission(self, request, project_pk=None, pk=None, sub_pk=None):
        task       = self.get_object()
        submission = get_object_or_404(TaskSubmission, pk=sub_pk, task=task)
        action_val = request.data.get('action')  # 'approve' | 'reject'
        notes      = request.data.get('notes', '')

        if action_val == 'approve':
            submission.status   = 'approved'
            task.status         = TaskStatus.APPROVED
            task.completed_at   = timezone.now()
        elif action_val == 'reject':
            submission.status   = 'rejected'
            task.status         = TaskStatus.REJECTED
        else:
            return Response({'detail': 'action must be approve or reject.'}, status=400)

        submission.reviewed_by   = request.user
        submission.reviewed_at   = timezone.now()
        submission.review_notes  = notes
        submission.save()
        task.save(update_fields=['status', 'completed_at', 'updated_at'])
        recalculate_project_progress(task.project)
        log_activity(task.project, request.user,
                     f'task_{action_val}d',
                     f'Task [{task.reference}] submission {action_val}d.', task=task)
        return Response(TaskSubmissionSerializer(submission, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='attachments')
    def upload_attachment(self, request, project_pk=None, pk=None):
        task = self.get_object()
        serializer = TaskAttachmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(task=task, uploaded_by=request.user, created_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get', 'post'], url_path='checklists')
    def checklists(self, request, project_pk=None, pk=None):
        task = self.get_object()
        if request.method == 'GET':
            return Response(TaskChecklistSerializer(task.checklists.all(), many=True).data)
        serializer = TaskChecklistSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(task=task, created_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='extend-deadline')
    def extend_deadline(self, request, project_pk=None, pk=None):
        task     = self.get_object()
        new_date = request.data.get('due_date')
        reason   = request.data.get('reason', '')
        if not new_date:
            return Response({'detail': 'due_date required.'}, status=400)
        old_date     = task.due_date
        task.due_date = new_date
        task.save(update_fields=['due_date', 'updated_at'])
        log_activity(task.project, request.user, 'deadline_extended',
                     f'Task [{task.reference}] deadline extended: {old_date} → {new_date}. Reason: {reason}',
                     task=task, meta={'old_date': str(old_date), 'new_date': new_date, 'reason': reason})
        return Response(TaskDetailSerializer(task).data)

    @action(detail=True, methods=['post'], url_path='dependencies')
    def add_dependency(self, request, project_pk=None, pk=None):
        task = self.get_object()
        predecessor_id   = request.data.get('predecessor_id')
        dependency_type  = request.data.get('dependency_type', 'FS')
        lag_days         = request.data.get('lag_days', 0)
        predecessor      = get_object_or_404(Task, pk=predecessor_id, project=task.project)
        dep, created     = TaskDependency.objects.get_or_create(
            predecessor=predecessor, successor=task,
            defaults={'dependency_type': dependency_type, 'lag_days': lag_days}
        )
        return Response({'detail': 'Dependency added.' if created else 'Already exists.'})


# ─────────────────────────────────────────────────────────────────────────────
# RISK VIEWSET
# ─────────────────────────────────────────────────────────────────────────────

class RiskViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = RiskSerializer
    filter_backends    = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields   = ['severity', 'status', 'category']
    ordering_fields    = ['severity', 'probability', 'created_at']

    def get_queryset(self):
        return Risk.objects.filter(project_id=self.kwargs['project_pk']).select_related('owner')

    def perform_create(self, serializer):
        project = get_object_or_404(Project, pk=self.kwargs['project_pk'])
        risk    = serializer.save(project=project, created_by=self.request.user)
        log_activity(project, self.request.user, 'risk_added',
                     f'Risk "{risk.title}" ({risk.severity}) added.')

    @action(detail=True, methods=['post'], url_path='resolve')
    def resolve(self, request, project_pk=None, pk=None):
        risk = self.get_object()
        risk.status      = 'resolved'
        risk.resolved_at = timezone.now()
        risk.save(update_fields=['status', 'resolved_at', 'updated_at'])
        log_activity(risk.project, request.user, 'risk_resolved', f'Risk "{risk.title}" resolved.')
        return Response(RiskSerializer(risk).data)


# ─────────────────────────────────────────────────────────────────────────────
# EXPENSE VIEWSET (Budget Tracking)
# ─────────────────────────────────────────────────────────────────────────────

class ProjectExpenseViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = ProjectExpenseSerializer
    filter_backends    = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields   = ['category', 'status', 'task']
    ordering_fields    = ['incurred_on', 'amount', 'created_at']
    ordering           = ['-incurred_on']

    def get_queryset(self):
        return ProjectExpense.objects.filter(
            project_id=self.kwargs['project_pk']
        ).select_related('submitted_by', 'reviewed_by', 'task')

    def perform_create(self, serializer):
        project = get_object_or_404(Project, pk=self.kwargs['project_pk'])
        expense = serializer.save(project=project, created_by=self.request.user)
        log_activity(
            project, self.request.user, 'expense_logged',
            f'Expense "{expense.title}" ({expense.amount} {expense.currency}) logged under {expense.get_category_display()}.'
        )
        # Newly logged expenses start as pending and don't affect budget_spent
        # until approved — no recalculation needed here.

    def perform_update(self, serializer):
        expense = serializer.save()
        recalculate_project_budget(expense.project)

    def perform_destroy(self, instance):
        project = instance.project
        log_activity(project, self.request.user, 'expense_deleted',
                     f'Expense "{instance.title}" deleted.')
        instance.delete()
        recalculate_project_budget(project)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, project_pk=None, pk=None):
        expense = self.get_object()
        expense.status      = ExpenseStatus.APPROVED
        expense.reviewed_by = request.user
        expense.reviewed_at = timezone.now()
        expense.review_notes = request.data.get('notes', '')
        expense.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'review_notes', 'updated_at'])
        recalculate_project_budget(expense.project)
        log_activity(expense.project, request.user, 'expense_approved',
                     f'Expense "{expense.title}" ({expense.amount} {expense.currency}) approved.')
        return Response(ProjectExpenseSerializer(expense).data)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, project_pk=None, pk=None):
        expense = self.get_object()
        expense.status        = ExpenseStatus.REJECTED
        expense.reviewed_by   = request.user
        expense.reviewed_at   = timezone.now()
        expense.review_notes  = request.data.get('notes', '')
        expense.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'review_notes', 'updated_at'])
        recalculate_project_budget(expense.project)
        log_activity(expense.project, request.user, 'expense_rejected',
                     f'Expense "{expense.title}" rejected.')
        return Response(ProjectExpenseSerializer(expense).data)


# ─────────────────────────────────────────────────────────────────────────────
# DOCUMENT VIEWSET
# ─────────────────────────────────────────────────────────────────────────────

class ProjectDocumentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = ProjectDocumentSerializer
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields   = ['doc_type', 'is_latest']
    search_fields      = ['title', 'description']

    def get_queryset(self):
        return ProjectDocument.objects.filter(project_id=self.kwargs['project_pk'])

    def perform_create(self, serializer):
        project = get_object_or_404(Project, pk=self.kwargs['project_pk'])
        serializer.save(project=project, created_by=self.request.user)


# ─────────────────────────────────────────────────────────────────────────────
# MEETING VIEWSET
# ─────────────────────────────────────────────────────────────────────────────

class ProjectMeetingViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = ProjectMeetingSerializer
    filter_backends    = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields   = ['is_completed']
    ordering_fields    = ['scheduled_at']

    def get_queryset(self):
        return ProjectMeeting.objects.filter(project_id=self.kwargs['project_pk']).prefetch_related('attendees')

    def perform_create(self, serializer):
        project = get_object_or_404(Project, pk=self.kwargs['project_pk'])
        serializer.save(project=project, organizer=self.request.user, created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='complete')
    def mark_complete(self, request, project_pk=None, pk=None):
        meeting          = self.get_object()
        meeting.is_completed = True
        meeting.minutes  = request.data.get('minutes', meeting.minutes)
        meeting.save(update_fields=['is_completed', 'minutes', 'updated_at'])
        return Response(ProjectMeetingSerializer(meeting).data)


# ─────────────────────────────────────────────────────────────────────────────
# COMMENT VIEWSET (standalone — for project-level comments)
# ─────────────────────────────────────────────────────────────────────────────

class ProjectCommentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = CommentSerializer

    def get_queryset(self):
        return Comment.objects.filter(
            project_id=self.kwargs['project_pk'], parent=None
        ).select_related('author').prefetch_related('replies__author')

    def perform_create(self, serializer):
        project = get_object_or_404(Project, pk=self.kwargs['project_pk'])
        serializer.save(project=project, author=self.request.user)

    def perform_update(self, serializer):
        serializer.save(is_edited=True)

    def perform_destroy(self, instance):
        if instance.author != self.request.user and not self.request.user.is_staff:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You can only delete your own comments.')
        instance.delete()


# ─────────────────────────────────────────────────────────────────────────────
# CHECKLIST ITEM UPDATE (standalone)
# ─────────────────────────────────────────────────────────────────────────────

class ChecklistItemView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, project_pk, task_pk, checklist_pk, item_pk):
        item = get_object_or_404(ChecklistItem, pk=item_pk, checklist_id=checklist_pk)
        is_done = request.data.get('is_done')
        if is_done is not None:
            item.is_done = is_done
            if is_done:
                item.completed_by = request.user
                item.completed_at = timezone.now()
            else:
                item.completed_by = None
                item.completed_at = None
            item.save()
        return Response(ChecklistItemSerializer(item).data)


# ─────────────────────────────────────────────────────────────────────────────
# DASHBOARD — cross-project overview for current user
# ─────────────────────────────────────────────────────────────────────────────

class ProjectDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        projects = Project.objects.filter(
            Q(owner=user) | Q(members__user=user, members__is_active=True),
            is_archived=False,
        ).distinct()

        my_tasks = Task.objects.filter(
            assignees=user, is_archived=False
        ).exclude(status__in=['done', 'approved']).select_related('project')

        overdue_tasks = my_tasks.filter(due_date__lt=timezone.now().date())
        due_soon      = my_tasks.filter(
            due_date__gte=timezone.now().date(),
            due_date__lte=(timezone.now() + timezone.timedelta(days=7)).date()
        )

        return Response({
            'summary': {
                'active_projects': projects.filter(status='active').count(),
                'total_projects': projects.count(),
                'my_open_tasks': my_tasks.count(),
                'overdue_tasks': overdue_tasks.count(),
                'due_this_week': due_soon.count(),
            },
            'recent_projects': ProjectListSerializer(
                projects.order_by('-updated_at')[:6], many=True
            ).data,
            'my_overdue_tasks': TaskListSerializer(overdue_tasks[:10], many=True).data,
            'due_this_week': TaskListSerializer(due_soon[:10], many=True).data,
        })