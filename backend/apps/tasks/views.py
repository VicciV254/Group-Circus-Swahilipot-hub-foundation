"""
apps/tasks/views.py
All Task API views extracted from models.py (where they do not belong).
"""
from .models import (
    Task, TaskFile, TaskSubmissionFile,
    TaskSerializer, TaskFileSerializer,
    LogbookEntry, LogbookEntrySerializer,
    Certificate, CertificateSerializer,
    _guess_file_type, _fmt_size,
)
from django.utils import timezone
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView


class TaskListView(generics.ListCreateAPIView):
    serializer_class = TaskSerializer

    def get_queryset(self):
        user = self.request.user
        qs   = (Task.objects
                    .filter(organisation=user.organisation)
                    .prefetch_related('assigned_to', 'departments', 'task_files', 'submission_files')
                    .select_related('assigned_by'))

        if user.role == 'attachee':
            qs = qs.filter(assigned_to=user)
        elif user.role == 'supervisor':
            qs = qs.filter(assigned_by=user)

        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def perform_create(self, serializer):
        assigned_to_ids = self.request.data.get('assigned_to', [])
        dept_ids        = self.request.data.get('departments', [])

        task = serializer.save(
            assigned_by  = self.request.user,
            organisation = self.request.user.organisation,
        )

        if assigned_to_ids:
            task.assigned_to.set(assigned_to_ids)
        if dept_ids:
            task.departments.set(dept_ids)

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

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

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

        for f in request.FILES.getlist('files'):
            TaskSubmissionFile.objects.create(
                task = task,
                name = f.name,
                file = f,
                size = _fmt_size(f.size),
            )

        try:
            from apps.notifications.services import NotificationService
            NotificationService.notify_user(
                task.assigned_by,
                f"Task Submitted: {task.title}",
                "A task has been submitted for review.",
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
            signed_by_name   = request.data.get('signed_by_name', request.user.full_name),
            signed_by_title  = request.data.get('signed_by_title', request.user.get_role_display()),
            status           = 'generated',
            template_data    = {
                'attachee_name': attachee.full_name,
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