"""Nexus Internship Core — Tasks, Logbooks, Evaluations, Certificates"""
from django.db import models
from django.utils import timezone
from rest_framework import serializers, generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from core.models import TimeStampedModel, AuditedModel
# NOTE: views are defined at the bottom of this file.
# Do NOT add `from .views import ...` here — that causes a circular import
# because views.py would itself import from models.py.


# ═══════════════════════════════════════════════════════════════
# TASKS
# ═══════════════════════════════════════════════════════════════

class Task(TimeStampedModel):
    PRIORITY = [('low', 'Low'), ('medium', 'Medium'), ('high', 'High'), ('urgent', 'Urgent')]
    STATUS = [
        ('pending', 'Pending'), ('in_progress', 'In Progress'),
        ('submitted', 'Submitted'), ('reviewed', 'Reviewed'),
        ('approved', 'Approved'), ('rejected', 'Rejected'), ('overdue', 'Overdue'),
    ]
    RECURRENCE = [
        ('none', 'None'), ('daily', 'Daily'), ('weekly', 'Weekly'), ('monthly', 'Monthly'),
    ]

    title               = models.CharField(max_length=300)
    description         = models.TextField()

    # ── FIX 1: was ForeignKey (single user). Now M2M to support bulk/multi-assign ──
    # related_name uses 'task_assignments' (not 'assigned_tasks') to avoid clash
    # with equipment.MaintenanceLog.assigned_to which already owns that name.
    assigned_to         = models.ManyToManyField(
                            'accounts.User',
                            related_name='task_assignments',
                            blank=True,
                          )
    assigned_by         = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='created_tasks')
    organisation        = models.ForeignKey('accounts.Organisation', on_delete=models.CASCADE)

    # ── FIX 2: was single FK. Now M2M to match frontend's departments[] array ──
    departments         = models.ManyToManyField(
                            'accounts.Department',
                            related_name='task_departments',
                            blank=True,
                          )

    # ── FIX 3: new field — frontend sends is_bulk ──
    is_bulk             = models.BooleanField(default=False)

    priority            = models.CharField(max_length=10, choices=PRIORITY, default='medium')
    status              = models.CharField(max_length=20, choices=STATUS, default='pending')
    due_date            = models.DateTimeField()
    extended_due_date   = models.DateTimeField(null=True, blank=True)
    progress_percent    = models.IntegerField(default=0)
    submission_notes    = models.TextField(blank=True)
    submitted_at        = models.DateTimeField(null=True, blank=True)
    supervisor_feedback = models.TextField(blank=True)
    reviewed_at         = models.DateTimeField(null=True, blank=True)
    overdue_alert_sent  = models.BooleanField(default=False)
    recurrence          = models.CharField(max_length=20, choices=RECURRENCE, default='none')
    notify_via          = models.CharField(max_length=20, default='in_app')
    tags                = models.JSONField(default=list)

    class Meta:  # type: ignore
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['due_date', 'status']),
        ]

    def __str__(self):
        return self.title

    def is_overdue(self):
        effective_due = self.extended_due_date or self.due_date
        return self.status not in ('approved', 'rejected') and effective_due < timezone.now()


# ── FIX 4: new model — replaces single attachments FileField with a proper M2M file set ──
class TaskFile(TimeStampedModel):
    """Files attached to a task by the assigner."""
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='task_files')
    name = models.CharField(max_length=500)
    file = models.FileField(upload_to='tasks/attachments/')
    size = models.CharField(max_length=50, blank=True)

    def __str__(self):
        return self.name


# ── FIX 5: new model — replaces single submission_file FileField ──
class TaskSubmissionFile(TimeStampedModel):
    """Files uploaded by assignee when submitting a task."""
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='submission_files')
    name = models.CharField(max_length=500)
    file = models.FileField(upload_to='tasks/submissions/')
    size = models.CharField(max_length=50, blank=True)

    def __str__(self):
        return self.name


class DeadlineExtensionRequest(TimeStampedModel):
    STATUS = [('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected')]
    task                     = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='extension_requests')
    requested_by             = models.ForeignKey('accounts.User', on_delete=models.CASCADE)
    reason                   = models.TextField()
    requested_extension_date = models.DateTimeField()
    status                   = models.CharField(max_length=20, choices=STATUS, default='pending')
    reviewed_by              = models.ForeignKey('accounts.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='extension_reviews')
    review_notes             = models.TextField(blank=True)


# ═══════════════════════════════════════════════════════════════
# LOGBOOKS
# ═══════════════════════════════════════════════════════════════

class Logbook(TimeStampedModel):
    """One logbook per attachee per attachment period"""
    attachee           = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='logbooks')
    organisation       = models.ForeignKey('accounts.Organisation', on_delete=models.CASCADE)
    title              = models.CharField(max_length=200, default='Industrial Attachment Logbook')
    start_date         = models.DateField()
    end_date           = models.DateField()
    is_active          = models.BooleanField(default=True)
    final_submitted    = models.BooleanField(default=False)
    final_submitted_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.attachee.first_name} {self.attachee.last_name}".strip() + " — Logbook"


class LogbookEntry(TimeStampedModel):
    STATUS = [
        ('draft', 'Draft'), ('submitted', 'Submitted'),
        ('approved', 'Approved'), ('rejected', 'Rejected'),
    ]
    logbook              = models.ForeignKey(Logbook, on_delete=models.CASCADE, related_name='entries')
    date                 = models.DateField()
    activities           = models.TextField()
    skills_acquired      = models.TextField(blank=True)
    challenges           = models.TextField(blank=True)
    reflection           = models.TextField(blank=True)
    status               = models.CharField(max_length=20, choices=STATUS, default='draft')
    supervisor_comments  = models.TextField(blank=True)
    supervisor_signature = models.CharField(max_length=200, blank=True)
    reviewed_by          = models.ForeignKey('accounts.User', null=True, blank=True, on_delete=models.SET_NULL)
    reviewed_at          = models.DateTimeField(null=True, blank=True)
    attachments          = models.FileField(upload_to='logbooks/attachments/', null=True, blank=True)

    class Meta:  # type: ignore
        unique_together = [['logbook', 'date']]
        ordering = ['-date']


# ═══════════════════════════════════════════════════════════════
# EVALUATIONS
# ═══════════════════════════════════════════════════════════════

class EvaluationTemplate(TimeStampedModel):
    TYPES = [('weekly', 'Weekly'), ('monthly', 'Monthly'), ('final', 'Final'), ('mid_term', 'Mid-Term')]
    organisation    = models.ForeignKey('accounts.Organisation', on_delete=models.CASCADE)
    name            = models.CharField(max_length=200)
    evaluation_type = models.CharField(max_length=20, choices=TYPES)
    criteria        = models.JSONField(default=list, help_text='List of {criterion, max_score, weight} objects')
    is_active       = models.BooleanField(default=True)


class Evaluation(TimeStampedModel):
    STATUS = [('pending', 'Pending'), ('in_progress', 'In Progress'), ('completed', 'Completed')]
    template               = models.ForeignKey(EvaluationTemplate, on_delete=models.CASCADE)
    attachee               = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='evaluations_received')
    evaluator              = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='evaluations_given')
    organisation           = models.ForeignKey('accounts.Organisation', on_delete=models.CASCADE)
    period_start           = models.DateField()
    period_end             = models.DateField()
    scores                 = models.JSONField(default=dict)
    total_score            = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    max_possible_score     = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    percentage             = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    overall_feedback       = models.TextField(blank=True)
    strengths              = models.TextField(blank=True)
    areas_for_improvement  = models.TextField(blank=True)
    recommendation         = models.CharField(max_length=100, blank=True)
    status                 = models.CharField(max_length=20, choices=STATUS, default='pending')
    completed_at           = models.DateTimeField(null=True, blank=True)
    attachee_acknowledged  = models.BooleanField(default=False)
    attachee_comments      = models.TextField(blank=True)

    class Meta:  # type: ignore
        ordering = ['-created_at']


# ═══════════════════════════════════════════════════════════════
# CERTIFICATES & RECOMMENDATION LETTERS
# ═══════════════════════════════════════════════════════════════

class Certificate(TimeStampedModel):
    TYPES = [
        ('completion',     'Certificate of Completion'),
        ('recommendation', 'Recommendation Letter'),
        ('achievement',    'Achievement Award'),
        ('participation',  'Participation Certificate'),
    ]
    STATUS = [('pending', 'Pending'), ('generated', 'Generated'), ('issued', 'Issued'), ('revoked', 'Revoked')]

    recipient             = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='certificates')
    organisation          = models.ForeignKey('accounts.Organisation', on_delete=models.CASCADE)
    certificate_type      = models.CharField(max_length=30, choices=TYPES)
    certificate_number    = models.CharField(max_length=50, unique=True)
    issue_date            = models.DateField(null=True, blank=True)
    valid_until           = models.DateField(null=True, blank=True)
    status                = models.CharField(max_length=20, choices=STATUS, default='pending')
    template_data         = models.JSONField(default=dict)
    pdf_file              = models.FileField(upload_to='certificates/', null=True, blank=True)
    issued_by             = models.ForeignKey('accounts.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='issued_certificates')
    signed_by_name        = models.CharField(max_length=200, blank=True)
    signed_by_title       = models.CharField(max_length=200, blank=True)
    qr_verification_code  = models.CharField(max_length=100, unique=True)
    verification_url      = models.URLField(blank=True)

    class Meta:  # type: ignore
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_certificate_type_display()} — {self.recipient.first_name} {self.recipient.last_name}".strip()

    def save(self, *args, **kwargs):
        import uuid
        if not self.certificate_number:
            self.certificate_number = f"Nexus-{timezone.now().year}-{str(uuid.uuid4())[:8].upper()}"
        if not self.qr_verification_code:
            self.qr_verification_code = str(uuid.uuid4())
        super().save(*args, **kwargs)


class AchievementBadge(TimeStampedModel):
    BADGE_TYPES = [
        ('punctuality',  'Perfect Punctuality'),
        ('task_master',  'Task Master'),
        ('fast_learner', 'Fast Learner'),
        ('team_player',  'Team Player'),
        ('innovator',    'Innovator'),
        ('communicator', 'Outstanding Communicator'),
        ('milestone',    'Milestone Achievement'),
        ('completion',   'Attachment Completion'),
    ]
    user         = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='badges')
    badge_type   = models.CharField(max_length=30, choices=BADGE_TYPES)
    awarded_by   = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='awarded_badges')
    organisation = models.ForeignKey('accounts.Organisation', on_delete=models.CASCADE)
    reason       = models.TextField(blank=True)
    awarded_at   = models.DateTimeField(auto_now_add=True)

    class Meta:  # type: ignore
        ordering = ['-awarded_at']


# ─── SERIALIZERS ─────────────────────────────────────────────────────────────

class TaskFileSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:  # type: ignore
        model  = TaskFile
        fields = ['id', 'name', 'size', 'url']

    def get_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None


class TaskSerializer(serializers.ModelSerializer):
    # ── FIX 6: renamed from assigned_to_name (str) → assigned_to_names (list) ──
    assigned_to_names = serializers.SerializerMethodField()
    assigned_by_name  = serializers.SerializerMethodField()

    # ── FIX 7: department_names[] list, not single FK ──
    department_names  = serializers.SerializerMethodField()

    # ── FIX 8: files[] and submission{} shaped exactly as frontend expects ──
    files             = serializers.SerializerMethodField()
    submission        = serializers.SerializerMethodField()
    is_overdue        = serializers.SerializerMethodField()

    # assigned_to: read as list of UUIDs; writes handled via task.assigned_to.set()
    # in perform_create/perform_update, so no queryset needed on the field itself.
    assigned_to       = serializers.PrimaryKeyRelatedField(
                            many=True, read_only=True,
                        )

    class Meta:  # type: ignore
        model  = Task
        fields = [
            'id', 'title', 'description', 'priority', 'status',
            'due_date', 'extended_due_date', 'progress_percent',
            'is_bulk', 'recurrence', 'notify_via', 'tags',
            'assigned_to', 'assigned_to_names',
            'assigned_by', 'assigned_by_name',
            'departments', 'department_names',
            'files', 'submission', 'supervisor_feedback',
            'is_overdue', 'created_at',
        ]
        read_only_fields = ['assigned_by', 'organisation']

    def get_assigned_to_names(self, obj):
        # User model uses first_name + last_name, not a single full_name field
        return [
            f"{u.first_name} {u.last_name}".strip() or u.email
            for u in obj.assigned_to.all()
        ]

    def get_assigned_by_name(self, obj):
        if not obj.assigned_by_id:
            return ''
        u = obj.assigned_by
        return f"{u.first_name} {u.last_name}".strip() or u.email

    def get_department_names(self, obj):
        return list(obj.departments.values_list('name', flat=True))

    def get_is_overdue(self, obj):
        return obj.is_overdue()

    def get_files(self, obj):
        files = obj.task_files.all()
        return TaskFileSerializer(files, many=True, context=self.context).data

    def get_submission(self, obj):
        """Return submission dict shaped as the frontend expects, or null."""
        if not obj.submitted_at:
            return None
        sub_files = obj.submission_files.all()
        return {
            'notes':        obj.submission_notes,
            'submitted_at': obj.submitted_at.isoformat(),
            'files': [
                {
                    'id':   f.id,
                    'name': f.name,
                    'size': f.size,
                    'type': _guess_file_type(f.name),
                    'url':  self.context['request'].build_absolute_uri(f.file.url)
                            if f.file and self.context.get('request') else None,
                }
                for f in sub_files
            ],
        }


def _guess_file_type(name: str) -> str:
    ext = name.rsplit('.', 1)[-1].lower() if '.' in name else ''
    if ext == 'pdf':            return 'pdf'
    if ext in ('png', 'jpg', 'jpeg', 'gif', 'webp'): return 'img'
    if ext in ('doc', 'docx'):  return 'doc'
    if ext in ('xls', 'xlsx', 'csv'): return 'xls'
    return 'other'


class LogbookEntrySerializer(serializers.ModelSerializer):
    reviewed_by_name = serializers.SerializerMethodField()

    def get_reviewed_by_name(self, obj):
        if not obj.reviewed_by_id: return ''
        u = obj.reviewed_by
        return f"{u.first_name} {u.last_name}".strip() or u.email

    class Meta:  # type: ignore
        model  = LogbookEntry
        fields = '__all__'


class EvaluationSerializer(serializers.ModelSerializer):
    attachee_name  = serializers.SerializerMethodField()

    def get_attachee_name(self, obj):
        u = obj.attachee
        return f"{u.first_name} {u.last_name}".strip() or u.email
    evaluator_name = serializers.SerializerMethodField()

    def get_evaluator_name(self, obj):
        u = obj.evaluator
        return f"{u.first_name} {u.last_name}".strip() or u.email

    class Meta:  # type: ignore
        model  = Evaluation
        fields = '__all__'


class CertificateSerializer(serializers.ModelSerializer):
    recipient_name = serializers.SerializerMethodField()

    def get_recipient_name(self, obj):
        u = obj.recipient
        return f"{u.first_name} {u.last_name}".strip() or u.email

    class Meta:  # type: ignore
        model  = Certificate
        fields = '__all__'


# ─── VIEWS ───────────────────────────────────────────────────────────────────

class TaskListView(generics.ListCreateAPIView):
    serializer_class = TaskSerializer

    def get_queryset(self):
        user = self.request.user
        qs   = (Task.objects
                    .filter(organisation=user.organisation)
                    .prefetch_related('assigned_to', 'departments', 'task_files', 'submission_files')
                    .select_related('assigned_by'))

        # ── FIX 9: was qs.filter(assigned_to=user) — now M2M lookup ──
        if user.role == 'attachee':
            qs = qs.filter(assigned_to=user)
        elif user.role == 'supervisor':
            qs = qs.filter(assigned_by=user)

        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        return qs

    def perform_create(self, serializer):
        data = self.request.data

        # Handle both JSON (dict) and multipart (QueryDict)
        if hasattr(data, 'getlist'):
            assigned_to_ids = data.getlist('assigned_to')
            dept_ids        = data.getlist('departments')
        else:
            assigned_to_ids = data.get('assigned_to', [])
            dept_ids        = data.get('departments', [])
            if isinstance(assigned_to_ids, str):
                assigned_to_ids = [assigned_to_ids]
            if isinstance(dept_ids, str):
                dept_ids = [dept_ids]

        task = serializer.save(
            assigned_by  = self.request.user,
            organisation = self.request.user.organisation,
        )

        if assigned_to_ids:
            task.assigned_to.set(assigned_to_ids)
        if dept_ids:
            task.departments.set(dept_ids)

        for f in self.request.FILES.getlist('files'):
            TaskFile.objects.create(
                task = task,
                name = f.name,
                file = f,
                size = _fmt_size(f.size),
            )

        try:
            from apps.notifications.services import NotificationService
            for assignee in task.assigned_to.all():
                NotificationService.notify_user(
                    assignee,
                    f"New Task: {task.title}",
                    f"You have been assigned a new task due {task.due_date.strftime('%Y-%m-%d')}.",
                    'task_assigned',
                )
        except Exception:
            pass

class TaskDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TaskSerializer

    def get_queryset(self):
        user = self.request.user
        qs   = (Task.objects
                    .filter(organisation=user.organisation)
                    .prefetch_related('assigned_to', 'departments', 'task_files', 'submission_files')
                    .select_related('assigned_by'))
        if user.role == 'attachee':
            return qs.filter(assigned_to=user)
        return qs

    def perform_update(self, serializer):
        task       = self.get_object()
        new_status = self.request.data.get('status')
        user       = self.request.user

        if new_status == 'in_progress' and task.status == 'pending' and user.role == 'attachee':
            serializer.save(status='in_progress')
            return

        serializer.save()


class TaskSubmitView(APIView):
    def post(self, request, pk):
        try:
            task = Task.objects.get(pk=pk, assigned_to=request.user)
        except Task.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)

        if task.status not in ('pending', 'in_progress'):
            return Response(
                {'detail': f'Cannot submit a task with status: {task.status}'},
                status=400,
            )

        task.status           = 'submitted'
        task.submission_notes = request.data.get('notes', '')
        task.submitted_at     = timezone.now()
        task.save()

        # ── FIX 11: handle multiple submission files, not just one ──
        for f in request.FILES.getlist('files'):
            TaskSubmissionFile.objects.create(
                task = task,
                name = f.name,
                file = f,
                size = _fmt_size(f.size),
            )

        try:
            from apps.notifications.services import NotificationService
            for supervisor in task.assigned_to.model.objects.filter(
                pk=task.assigned_by_id
            ):
                NotificationService.notify_user(
                    task.assigned_by,
                    f"Task Submitted: {task.title}",
                    f"A task has been submitted for review.",
                    'task_submitted',
                )
        except Exception:
            pass

        return Response(TaskSerializer(task, context={'request': request}).data)


class TaskReviewView(APIView):
    def post(self, request, pk):
        try:
            task = Task.objects.get(pk=pk, organisation=request.user.organisation)
        except Task.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)

        action   = request.data.get('action')
        feedback = request.data.get('feedback', '')

        if action == 'approve':
            task.status = 'approved'
        elif action == 'reject':
            task.status = 'rejected'
        else:
            return Response({'detail': 'action must be approve or reject'}, status=400)

        task.supervisor_feedback = feedback
        task.reviewed_at         = timezone.now()
        task.save()

        try:
            from apps.notifications.services import NotificationService
            for assignee in task.assigned_to.all():
                NotificationService.notify_user(
                    assignee,
                    f"Task {action.title()}d: {task.title}",
                    feedback or f"Your task has been {action}d.",
                    'task_reviewed',
                )
        except Exception:
            pass

        return Response(TaskSerializer(task, context={'request': request}).data)


def _fmt_size(bytes_: int) -> str:
    if bytes_ < 1024:         return f"{bytes_} B"
    if bytes_ < 1_048_576:   return f"{bytes_ // 1024} KB"
    return f"{bytes_ / 1_048_576:.1f} MB"


class LogbookEntryListView(generics.ListCreateAPIView):
    serializer_class = LogbookEntrySerializer

    def get_queryset(self):
        user       = self.request.user
        logbook_id = self.kwargs.get('logbook_id')
        return LogbookEntry.objects.filter(
            logbook_id            = logbook_id,
            logbook__organisation = user.organisation,
        )

    def perform_create(self, serializer):
        serializer.save(logbook_id=self.kwargs['logbook_id'])


class CertificateGenerateView(APIView):
    def post(self, request):
        attachee_id = request.data.get('attachee_id')
        cert_type   = request.data.get('certificate_type', 'completion')

        try:
            from apps.accounts.models import User
            attachee = User.objects.get(id=attachee_id, organisation=request.user.organisation)
        except Exception:
            return Response({'detail': 'Attachee not found'}, status=404)

        cert = Certificate.objects.create(
            recipient        = attachee,
            organisation     = request.user.organisation,
            certificate_type = cert_type,
            issued_by        = request.user,
            issue_date       = timezone.now().date(),
            signed_by_name   = request.data.get('signed_by_name', f"{request.user.first_name} {request.user.last_name}".strip()),
            signed_by_title  = request.data.get('signed_by_title', request.user.get_role_display()),
            status           = 'generated',
            template_data    = {
                'attachee_name': f"{attachee.first_name} {attachee.last_name}".strip(),
                'organisation':  request.user.organisation.name,
                'department':    attachee.department.name if attachee.department else '',
                'issue_date':    timezone.now().date().isoformat(),
                'signed_by':     request.data.get('signed_by_name', ''),
            },
        )

        try:
            from apps.notifications.services import NotificationService
            NotificationService.notify_user(
                attachee,
                f"Your {cert.get_certificate_type_display()} is Ready",
                "Your certificate has been generated. You can download it from your portal.",
                'certificate_issued',
            )
        except Exception:
            pass

        return Response(CertificateSerializer(cert).data, status=201)