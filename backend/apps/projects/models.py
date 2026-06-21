"""
Enterprise Internship Management System
Projects App — Models
Production-Grade | Django ORM
"""

import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator


# ─────────────────────────────────────────────────────────────────────────────
# ENUMERATIONS
# ─────────────────────────────────────────────────────────────────────────────

class ProjectStatus(models.TextChoices):
    DRAFT       = 'draft',       'Draft'
    PLANNING    = 'planning',    'Planning'
    ACTIVE      = 'active',      'Active'
    ON_HOLD     = 'on_hold',     'On Hold'
    COMPLETED   = 'completed',   'Completed'
    CANCELLED   = 'cancelled',   'Cancelled'
    ARCHIVED    = 'archived',    'Archived'


class ProjectPriority(models.TextChoices):
    CRITICAL = 'critical', 'Critical'
    HIGH     = 'high',     'High'
    MEDIUM   = 'medium',   'Medium'
    LOW      = 'low',      'Low'


class TaskStatus(models.TextChoices):
    BACKLOG     = 'backlog',     'Backlog'
    PENDING     = 'pending',     'Pending'
    IN_PROGRESS = 'in_progress', 'In Progress'
    IN_REVIEW   = 'in_review',   'In Review'
    SUBMITTED   = 'submitted',   'Submitted'
    APPROVED    = 'approved',    'Approved'
    REJECTED    = 'rejected',    'Rejected'
    OVERDUE     = 'overdue',     'Overdue'
    DONE        = 'done',        'Done'


class TaskPriority(models.TextChoices):
    URGENT = 'urgent', 'Urgent'
    HIGH   = 'high',   'High'
    MEDIUM = 'medium', 'Medium'
    LOW    = 'low',    'Low'


class MilestoneStatus(models.TextChoices):
    PENDING     = 'pending',     'Pending'
    IN_PROGRESS = 'in_progress', 'In Progress'
    COMPLETED   = 'completed',   'Completed'
    MISSED      = 'missed',      'Missed'


class RiskSeverity(models.TextChoices):
    CRITICAL = 'critical', 'Critical'
    HIGH     = 'high',     'High'
    MEDIUM   = 'medium',   'Medium'
    LOW      = 'low',      'Low'


class RiskStatus(models.TextChoices):
    IDENTIFIED  = 'identified',  'Identified'
    MITIGATING  = 'mitigating',  'Mitigating'
    RESOLVED    = 'resolved',    'Resolved'
    ACCEPTED    = 'accepted',    'Accepted'


class CommentType(models.TextChoices):
    GENERAL   = 'general',   'General'
    FEEDBACK  = 'feedback',  'Feedback'
    APPROVAL  = 'approval',  'Approval'
    REJECTION = 'rejection', 'Rejection'


class SprintStatus(models.TextChoices):
    PLANNING  = 'planning',  'Planning'
    ACTIVE    = 'active',    'Active'
    COMPLETED = 'completed', 'Completed'
    CANCELLED = 'cancelled', 'Cancelled'


# ─────────────────────────────────────────────────────────────────────────────
# BASE MODEL
# ─────────────────────────────────────────────────────────────────────────────

class BaseModel(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='+'
    )

    class Meta:
        abstract = True


# ─────────────────────────────────────────────────────────────────────────────
# PROJECT
# ─────────────────────────────────────────────────────────────────────────────

class Project(BaseModel):
    """
    Core project entity. Scoped to a department and organisation branch.
    Supports Kanban, Gantt, resource allocation, risk management.
    """
    # Identity
    name        = models.CharField(max_length=255, db_index=True)
    code        = models.CharField(max_length=32, unique=True, help_text='Unique project code e.g. PRJ-2024-001')
    description = models.TextField(blank=True)
    objectives  = models.TextField(blank=True, help_text='Strategic objectives / scope statement')
    cover_color = models.CharField(max_length=7, default='#6366F1', help_text='Hex color for UI card')
    cover_image = models.URLField(blank=True)

    # Org hierarchy
    department  = models.ForeignKey(
        'accounts.Department', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='projects'
    )
    branch      = models.ForeignKey(
        'accounts.Branch', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='projects'
    )

    # Ownership
    owner       = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='owned_projects'
    )
    manager     = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='managed_projects'
    )

    # Lifecycle
    status      = models.CharField(max_length=20, choices=ProjectStatus.choices, default=ProjectStatus.DRAFT, db_index=True)
    priority    = models.CharField(max_length=20, choices=ProjectPriority.choices, default=ProjectPriority.MEDIUM)
    start_date  = models.DateField(null=True, blank=True)
    end_date    = models.DateField(null=True, blank=True)
    actual_end_date = models.DateField(null=True, blank=True)

    # Budget
    budget_allocated = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    budget_spent     = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # Progress (auto-computed but can be overridden)
    progress_percent = models.PositiveSmallIntegerField(
        default=0, validators=[MaxValueValidator(100)],
        help_text='Overall completion percentage'
    )

    # Flags
    is_confidential = models.BooleanField(default=False)
    is_archived     = models.BooleanField(default=False)
    is_template     = models.BooleanField(default=False, help_text='Acts as a reusable template')

    # Tags (simple comma-sep or use a proper M2M tag model)
    tags = models.JSONField(default=list, blank=True)

    class Meta:
        db_table   = 'projects_project'
        ordering   = ['-created_at']
        indexes    = [
            models.Index(fields=['status', 'department']),
            models.Index(fields=['owner', 'status']),
            models.Index(fields=['start_date', 'end_date']),
        ]
        permissions = [
            ('can_archive_project',   'Can archive projects'),
            ('can_view_financials',   'Can view project financial data'),
            ('can_manage_resources',  'Can manage project resource allocation'),
        ]

    def __str__(self):
        return f'[{self.code}] {self.name}'

    @property
    def is_overdue(self):
        if self.end_date and self.status not in (ProjectStatus.COMPLETED, ProjectStatus.CANCELLED):
            return timezone.now().date() > self.end_date
        return False

    @property
    def budget_utilization(self):
        if self.budget_allocated:
            return round((self.budget_spent / self.budget_allocated) * 100, 1)
        return 0


# ─────────────────────────────────────────────────────────────────────────────
# PROJECT MEMBERS (Resource Allocation)
# ─────────────────────────────────────────────────────────────────────────────

class ProjectMember(BaseModel):
    """Tracks resource allocation per project — staff, attachees, supervisors."""

    class Role(models.TextChoices):
        LEAD       = 'lead',       'Project Lead'
        MEMBER     = 'member',     'Team Member'
        REVIEWER   = 'reviewer',   'Reviewer'
        OBSERVER   = 'observer',   'Observer'
        ATTACHEE   = 'attachee',   'Attachee'
        SUPERVISOR = 'supervisor', 'Supervisor'
        CONSULTANT = 'consultant', 'Consultant'

    project          = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='members')
    user             = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='project_memberships')
    role             = models.CharField(max_length=20, choices=Role.choices, default=Role.MEMBER)
    allocation_percent = models.PositiveSmallIntegerField(
        default=100, validators=[MaxValueValidator(100)],
        help_text='% of working time allocated to this project'
    )
    joined_at        = models.DateField(default=timezone.localdate)
    left_at          = models.DateField(null=True, blank=True)
    is_active        = models.BooleanField(default=True)

    class Meta:
        db_table   = 'projects_project_member'
        unique_together = ('project', 'user')
        indexes    = [models.Index(fields=['project', 'is_active'])]

    def __str__(self):
        return f'{self.user} → {self.project.code} [{self.role}]'


# ─────────────────────────────────────────────────────────────────────────────
# KANBAN BOARD
# ─────────────────────────────────────────────────────────────────────────────

class KanbanBoard(BaseModel):
    """Each project can have one or more Kanban boards."""
    project     = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='kanban_boards')
    name        = models.CharField(max_length=128, default='Main Board')
    description = models.TextField(blank=True)
    is_default  = models.BooleanField(default=False)

    class Meta:
        db_table = 'projects_kanban_board'

    def __str__(self):
        return f'{self.project.code} / {self.name}'


class KanbanColumn(BaseModel):
    """Columns within a Kanban board (configurable)."""
    board      = models.ForeignKey(KanbanBoard, on_delete=models.CASCADE, related_name='columns')
    name       = models.CharField(max_length=64)
    color      = models.CharField(max_length=7, default='#6366F1')
    position   = models.PositiveSmallIntegerField(default=0)
    wip_limit  = models.PositiveSmallIntegerField(null=True, blank=True, help_text='Work-in-progress limit')
    maps_to_status = models.CharField(
        max_length=20, choices=TaskStatus.choices, null=True, blank=True,
        help_text='Automatically move tasks with this status to this column'
    )

    class Meta:
        db_table = 'projects_kanban_column'
        ordering = ['position']

    def __str__(self):
        return f'{self.board} / {self.name}'


# ─────────────────────────────────────────────────────────────────────────────
# SPRINT
# ─────────────────────────────────────────────────────────────────────────────

class Sprint(BaseModel):
    """Agile sprint / iteration within a project."""
    project    = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='sprints')
    name       = models.CharField(max_length=128)
    goal       = models.TextField(blank=True)
    status     = models.CharField(max_length=20, choices=SprintStatus.choices, default=SprintStatus.PLANNING)
    start_date = models.DateField()
    end_date   = models.DateField()
    velocity   = models.PositiveSmallIntegerField(null=True, blank=True, help_text='Story points completed')

    class Meta:
        db_table = 'projects_sprint'
        ordering = ['start_date']

    def __str__(self):
        return f'{self.project.code} / {self.name}'


# ─────────────────────────────────────────────────────────────────────────────
# MILESTONE
# ─────────────────────────────────────────────────────────────────────────────

class Milestone(BaseModel):
    project     = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='milestones')
    name        = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    due_date    = models.DateField()
    completed_date = models.DateField(null=True, blank=True)
    status      = models.CharField(max_length=20, choices=MilestoneStatus.choices, default=MilestoneStatus.PENDING)
    owner       = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='milestones'
    )

    class Meta:
        db_table = 'projects_milestone'
        ordering = ['due_date']

    def __str__(self):
        return f'{self.project.code} / {self.name}'

    @property
    def is_overdue(self):
        if self.status != MilestoneStatus.COMPLETED:
            return timezone.now().date() > self.due_date
        return False


# ─────────────────────────────────────────────────────────────────────────────
# TASK
# ─────────────────────────────────────────────────────────────────────────────

class Task(BaseModel):
    """
    Full task entity — supports Kanban card, Gantt bar, subtasks, dependencies,
    file deliverables, time tracking, and multi-assignee allocation.
    """
    # Hierarchy
    project   = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='tasks')
    sprint    = models.ForeignKey(Sprint, null=True, blank=True, on_delete=models.SET_NULL, related_name='tasks')
    milestone = models.ForeignKey(Milestone, null=True, blank=True, on_delete=models.SET_NULL, related_name='tasks')
    parent    = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='subtasks')
    kanban_column = models.ForeignKey(KanbanColumn, null=True, blank=True, on_delete=models.SET_NULL, related_name='tasks')

    # Identity
    title       = models.CharField(max_length=512, db_index=True)
    description = models.TextField(blank=True)
    reference   = models.CharField(max_length=32, unique=True, help_text='e.g. TSK-001')

    # Assignments
    assignees = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through='TaskAssignment',
        through_fields=('task', 'user'),
        related_name='assigned_tasks',
    )
    reporter  = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='reported_tasks'
    )

    # Status & priority
    status      = models.CharField(max_length=20, choices=TaskStatus.choices, default=TaskStatus.PENDING, db_index=True)
    priority    = models.CharField(max_length=20, choices=TaskPriority.choices, default=TaskPriority.MEDIUM)

    # Timeline (for Gantt)
    start_date  = models.DateField(null=True, blank=True)
    due_date    = models.DateField(null=True, blank=True, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Effort & tracking
    estimated_hours = models.DecimalField(max_digits=6, decimal_places=1, null=True, blank=True)
    logged_hours    = models.DecimalField(max_digits=6, decimal_places=1, default=0)
    story_points    = models.PositiveSmallIntegerField(null=True, blank=True)
    progress_percent = models.PositiveSmallIntegerField(default=0, validators=[MaxValueValidator(100)])

    # Kanban position
    kanban_position = models.PositiveIntegerField(default=0, help_text='Sort order within column')

    # Tags / labels
    tags   = models.JSONField(default=list, blank=True)
    labels = models.JSONField(default=list, blank=True)

    # Flags
    is_archived    = models.BooleanField(default=False)
    requires_approval = models.BooleanField(default=False)

    class Meta:
        db_table  = 'projects_task'
        ordering  = ['kanban_position', 'due_date']
        indexes   = [
            models.Index(fields=['project', 'status']),
            models.Index(fields=['project', 'sprint']),
            models.Index(fields=['due_date', 'status']),
        ]

    def __str__(self):
        return f'[{self.reference}] {self.title}'

    @property
    def is_overdue(self):
        if self.due_date and self.status not in (TaskStatus.DONE, TaskStatus.APPROVED):
            return timezone.now().date() > self.due_date
        return False


class TaskAssignment(BaseModel):
    """Through-model for Task ↔ User with per-assignment metadata."""
    task            = models.ForeignKey(Task, on_delete=models.CASCADE)
    user            = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    allocated_hours = models.DecimalField(max_digits=6, decimal_places=1, null=True, blank=True)
    is_primary      = models.BooleanField(default=False)

    class Meta:
        db_table      = 'projects_task_assignment'
        unique_together = ('task', 'user')


class TaskDependency(BaseModel):
    """Finish-to-start (and other) task dependencies for Gantt rendering."""

    class DependencyType(models.TextChoices):
        FINISH_TO_START  = 'FS', 'Finish → Start'
        START_TO_START   = 'SS', 'Start → Start'
        FINISH_TO_FINISH = 'FF', 'Finish → Finish'
        START_TO_FINISH  = 'SF', 'Start → Finish'

    predecessor     = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='successors')
    successor       = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='predecessors')
    dependency_type = models.CharField(max_length=2, choices=DependencyType.choices, default=DependencyType.FINISH_TO_START)
    lag_days        = models.SmallIntegerField(default=0, help_text='Positive=lag, negative=lead')

    class Meta:
        db_table      = 'projects_task_dependency'
        unique_together = ('predecessor', 'successor')


# ─────────────────────────────────────────────────────────────────────────────
# TASK SUBMISSION
# ─────────────────────────────────────────────────────────────────────────────

class TaskSubmission(BaseModel):
    """Attachee/member submits completed work for review."""
    task        = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='submissions')
    submitted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='task_submissions')
    notes       = models.TextField(blank=True)
    status      = models.CharField(
        max_length=20,
        choices=[('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected')],
        default='pending'
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='reviewed_submissions'
    )
    reviewed_at  = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True)

    class Meta:
        db_table = 'projects_task_submission'
        ordering = ['-created_at']


class TaskAttachment(BaseModel):
    """File deliverables attached to a task or submission."""
    task        = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='attachments')
    submission  = models.ForeignKey(TaskSubmission, null=True, blank=True, on_delete=models.SET_NULL, related_name='attachments')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    file_name   = models.CharField(max_length=255)
    file_url    = models.URLField()
    file_size   = models.PositiveBigIntegerField(null=True, blank=True, help_text='Size in bytes')
    mime_type   = models.CharField(max_length=128, blank=True)

    class Meta:
        db_table = 'projects_task_attachment'


# ─────────────────────────────────────────────────────────────────────────────
# TIME LOG
# ─────────────────────────────────────────────────────────────────────────────

class TimeLog(BaseModel):
    """Time-tracking entries logged against a task."""
    task        = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='time_logs')
    logged_by   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='time_logs')
    date        = models.DateField(default=timezone.localdate)
    hours       = models.DecimalField(max_digits=5, decimal_places=2, validators=[MinValueValidator(0.1)])
    description = models.TextField(blank=True)
    is_billable = models.BooleanField(default=False)

    class Meta:
        db_table = 'projects_time_log'
        ordering = ['-date']


# ─────────────────────────────────────────────────────────────────────────────
# CHECKLIST
# ─────────────────────────────────────────────────────────────────────────────

class TaskChecklist(BaseModel):
    """Lightweight sub-items within a task (not full subtasks)."""
    task       = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='checklists')
    title      = models.CharField(max_length=255)
    position   = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'projects_task_checklist'
        ordering = ['position']


class ChecklistItem(BaseModel):
    checklist   = models.ForeignKey(TaskChecklist, on_delete=models.CASCADE, related_name='items')
    text        = models.CharField(max_length=512)
    is_done     = models.BooleanField(default=False)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='+'
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    position    = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'projects_checklist_item'
        ordering = ['position']


# ─────────────────────────────────────────────────────────────────────────────
# COMMENTS
# ─────────────────────────────────────────────────────────────────────────────

class Comment(BaseModel):
    """Generic comment supporting tasks, projects, and submissions."""
    # Polymorphic via nullable FKs (simpler than ContentType for this scope)
    task       = models.ForeignKey(Task, null=True, blank=True, on_delete=models.CASCADE, related_name='comments')
    project    = models.ForeignKey(Project, null=True, blank=True, on_delete=models.CASCADE, related_name='comments')
    submission = models.ForeignKey(TaskSubmission, null=True, blank=True, on_delete=models.CASCADE, related_name='comments')

    author     = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='project_comments')
    body       = models.TextField()
    comment_type = models.CharField(max_length=20, choices=CommentType.choices, default=CommentType.GENERAL)
    parent     = models.ForeignKey('self', null=True, blank=True, on_delete=models.CASCADE, related_name='replies')
    is_edited  = models.BooleanField(default=False)

    class Meta:
        db_table = 'projects_comment'
        ordering = ['created_at']


# ─────────────────────────────────────────────────────────────────────────────
# RISK MANAGEMENT
# ─────────────────────────────────────────────────────────────────────────────

class Risk(BaseModel):
    project        = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='risks')
    title          = models.CharField(max_length=255)
    description    = models.TextField()
    category       = models.CharField(max_length=64, blank=True, help_text='e.g. Technical, Financial, HR, Legal')
    severity       = models.CharField(max_length=20, choices=RiskSeverity.choices, default=RiskSeverity.MEDIUM)
    probability    = models.PositiveSmallIntegerField(
        default=50, validators=[MaxValueValidator(100)],
        help_text='Likelihood 0–100%'
    )
    impact_score   = models.PositiveSmallIntegerField(
        default=50, validators=[MaxValueValidator(100)],
        help_text='Impact 0–100%'
    )
    status         = models.CharField(max_length=20, choices=RiskStatus.choices, default=RiskStatus.IDENTIFIED)
    mitigation_plan = models.TextField(blank=True)
    contingency_plan = models.TextField(blank=True)
    owner          = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='risks'
    )
    due_date       = models.DateField(null=True, blank=True)
    resolved_at    = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'projects_risk'
        ordering = ['-severity', '-probability']

    def __str__(self):
        return f'{self.project.code} / Risk: {self.title}'

    @property
    def risk_score(self):
        return round((self.probability * self.impact_score) / 100)


# ─────────────────────────────────────────────────────────────────────────────
# PROJECT EXPENSE (Budget Tracking)
# ─────────────────────────────────────────────────────────────────────────────

class ExpenseCategory(models.TextChoices):
    LABOR        = 'labor',        'Labor / Stipends'
    EQUIPMENT    = 'equipment',    'Equipment'
    TRAVEL       = 'travel',       'Travel'
    MATERIALS    = 'materials',    'Materials & Supplies'
    SOFTWARE     = 'software',     'Software & Licenses'
    SERVICES     = 'services',     'Professional Services'
    VENUE        = 'venue',        'Venue & Facilities'
    MARKETING    = 'marketing',    'Marketing & Communications'
    CONTINGENCY  = 'contingency',  'Contingency'
    OTHER        = 'other',        'Other'


class ExpenseStatus(models.TextChoices):
    PENDING   = 'pending',   'Pending Approval'
    APPROVED  = 'approved',  'Approved'
    REJECTED  = 'rejected',  'Rejected'


class ProjectExpense(BaseModel):
    """
    A single logged expense against a project's budget. Approved expenses
    are summed to auto-recalculate Project.budget_spent (see
    recalculate_project_budget below) — budget_spent is never edited
    directly; it is always derived from this ledger.
    """
    project     = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='expenses')
    title       = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    category    = models.CharField(max_length=20, choices=ExpenseCategory.choices, default=ExpenseCategory.OTHER)
    amount      = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(0.01)])
    currency    = models.CharField(max_length=3, default='USD')
    incurred_on = models.DateField(default=timezone.localdate)
    status      = models.CharField(max_length=20, choices=ExpenseStatus.choices, default=ExpenseStatus.PENDING)

    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='submitted_expenses'
    )
    reviewed_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='reviewed_expenses'
    )
    reviewed_at  = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True)

    receipt_url  = models.URLField(blank=True, help_text='Optional receipt/invoice attachment URL')
    task         = models.ForeignKey(
        Task, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='expenses', help_text='Optionally link this expense to a specific task'
    )

    class Meta:
        db_table = 'projects_expense'
        ordering = ['-incurred_on', '-created_at']
        indexes  = [
            models.Index(fields=['project', 'status']),
            models.Index(fields=['project', 'category']),
        ]

    def __str__(self):
        return f'{self.project.code} / {self.title} ({self.amount} {self.currency})'


def recalculate_project_budget(project):
    """
    Recomputes Project.budget_spent as the sum of all APPROVED expenses.
    Called whenever an expense is created, updated, deleted, or its status
    changes — keeps budget_spent always derived, never manually editable.
    """
    total = project.expenses.filter(status=ExpenseStatus.APPROVED).aggregate(
        total=models.Sum('amount')
    )['total'] or 0
    project.budget_spent = total
    project.save(update_fields=['budget_spent', 'updated_at'])



class ProjectDocument(BaseModel):
    """Project-specific documents — specs, contracts, reports, etc."""

    class DocType(models.TextChoices):
        SPECIFICATION = 'specification', 'Specification'
        CONTRACT      = 'contract',      'Contract'
        REPORT        = 'report',        'Report'
        PLAN          = 'plan',          'Plan'
        MINUTES       = 'minutes',       'Meeting Minutes'
        DELIVERABLE   = 'deliverable',   'Deliverable'
        OTHER         = 'other',         'Other'

    project     = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='documents')
    title       = models.CharField(max_length=255)
    doc_type    = models.CharField(max_length=20, choices=DocType.choices, default=DocType.OTHER)
    description = models.TextField(blank=True)
    file_url    = models.URLField()
    file_name   = models.CharField(max_length=255)
    file_size   = models.PositiveBigIntegerField(null=True, blank=True)
    mime_type   = models.CharField(max_length=128, blank=True)
    version     = models.CharField(max_length=16, default='1.0')
    is_latest   = models.BooleanField(default=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='+'
    )

    class Meta:
        db_table = 'projects_document'
        ordering = ['-created_at']


# ─────────────────────────────────────────────────────────────────────────────
# PROJECT ACTIVITY LOG (immutable audit)
# ─────────────────────────────────────────────────────────────────────────────

class ProjectActivity(BaseModel):
    """Immutable audit trail for all project-level events."""
    project     = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='activities')
    task        = models.ForeignKey(Task, null=True, blank=True, on_delete=models.SET_NULL, related_name='activities')
    actor       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    verb        = models.CharField(max_length=64, help_text='e.g. created, updated_status, assigned, commented')
    description = models.TextField()
    meta        = models.JSONField(default=dict, blank=True, help_text='Before/after state, extra data')

    class Meta:
        db_table = 'projects_activity'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.actor} {self.verb} on {self.project.code}'


# ─────────────────────────────────────────────────────────────────────────────
# MEETING
# ─────────────────────────────────────────────────────────────────────────────

class ProjectMeeting(BaseModel):
    """Project meetings — scheduling, minutes, attendees."""
    project      = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='meetings')
    title        = models.CharField(max_length=255)
    description  = models.TextField(blank=True)
    scheduled_at = models.DateTimeField()
    duration_min = models.PositiveSmallIntegerField(default=60)
    location     = models.CharField(max_length=255, blank=True, help_text='Room or video link')
    attendees    = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name='project_meetings', blank=True)
    organizer    = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='organized_meetings'
    )
    minutes      = models.TextField(blank=True)
    is_completed = models.BooleanField(default=False)
    gcal_event_id = models.CharField(max_length=256, blank=True, help_text='Google Calendar event ID')

    class Meta:
        db_table = 'projects_meeting'
        ordering = ['scheduled_at']


# ─────────────────────────────────────────────────────────────────────────────
# NOTIFICATION PREFERENCES (project-level)
# ─────────────────────────────────────────────────────────────────────────────

class ProjectNotificationPreference(BaseModel):
    """Per-user, per-project notification preferences."""
    project          = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='notification_prefs')
    user             = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='project_notif_prefs')
    task_assigned    = models.BooleanField(default=True)
    task_due         = models.BooleanField(default=True)
    task_overdue     = models.BooleanField(default=True)
    status_change    = models.BooleanField(default=True)
    new_comment      = models.BooleanField(default=True)
    mention          = models.BooleanField(default=True)
    milestone_due    = models.BooleanField(default=True)
    risk_escalated   = models.BooleanField(default=True)

    class Meta:
        db_table      = 'projects_notification_pref'
        unique_together = ('project', 'user')
        