"""
apps/logbooks/views.py

Production-grade DRF ViewSets for the Logbooks module.
All business-logic actions are explicit @action endpoints so the
REST surface is self-documenting.
"""
import base64
import uuid
from io import BytesIO

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q, Prefetch
from django.utils import timezone
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import (
    Logbook, LogbookEntry, EntryAttachment,
    LogbookComment, LogbookAuditLog,
    Program, Cohort, DepartmentActivation,
)
from .filters import LogbookFilter, LogbookEntryFilter
from .permissions import (
    CanViewLogbook, CanEditEntry, CanReviewEntry, SUPERVISOR_ROLES,
    IsProgramAdmin, PROGRAM_ADMIN_ROLES,
)
from .serializers import (
    LogbookListSerializer, LogbookDetailSerializer, LogbookCreateSerializer,
    LogbookEntryListSerializer, LogbookEntryDetailSerializer,
    EntryAttachmentSerializer, EntryAttachmentUploadSerializer,
    LogbookCommentSerializer, LogbookAuditLogSerializer,
    SignatureSerializer,
    ProgramListSerializer, ProgramDetailSerializer, ProgramCreateSerializer,
    CohortSerializer, DepartmentActivationSerializer,
    DepartmentActivationActivateSerializer, DepartmentLogbookSerializer,
)
from .services import LogbookService  # see services.py


# ──────────────────────────────────────────────────────────
# Helper
# ──────────────────────────────────────────────────────────

def _audit(logbook, action, actor, entry=None, detail=None, request=None):
    ip = None
    if request:
        x_forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
        ip = x_forwarded.split(",")[0] if x_forwarded else request.META.get("REMOTE_ADDR")
    LogbookAuditLog.objects.create(
        logbook=logbook,
        entry=entry,
        actor=actor,
        action=action,
        detail=detail or {},
        ip_address=ip,
    )


# ──────────────────────────────────────────────────────────
# Logbook ViewSet
# ──────────────────────────────────────────────────────────

class LogbookViewSet(viewsets.ModelViewSet):
    """
    /api/logbooks/

    list        GET    /
    create      POST   /          (supervisor/HR only)
    retrieve    GET    /{id}/
    update      PUT    /{id}/
    partial_update PATCH /{id}/
    destroy     DELETE /{id}/     (admin only)

    Extra actions:
        POST /{id}/submit/              — intern final-submits
        POST /{id}/approve/             — supervisor final-approves
        POST /{id}/sign/                — intern or supervisor digital signature
        GET  /{id}/summary/             — stats & progress summary
        GET  /{id}/export/              — PDF export (delegates to service)
        GET  /{id}/audit/               — full audit trail
    """

    permission_classes = [IsAuthenticated, CanViewLogbook]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = LogbookFilter
    search_fields = ["title", "intern__first_name", "intern__last_name", "intern__email"]
    ordering_fields = ["start_date", "end_date", "created_at"]
    ordering = ["-start_date"]

    def get_queryset(self):
        user = self.request.user
        qs = Logbook.objects.select_related("intern", "supervisor", "department")
        if user.role in SUPERVISOR_ROLES:
            # supervisors see all, or filter to their own if desired
            supervisor_filter = self.request.query_params.get("mine")
            if supervisor_filter:
                qs = qs.filter(supervisor=user)
        else:
            # interns see only their own
            qs = qs.filter(intern=user)
        return qs

    def get_serializer_class(self):
        if self.action == "create":
            return LogbookCreateSerializer
        if self.action in ("list",):
            return LogbookListSerializer
        return LogbookDetailSerializer

    def perform_create(self, serializer):
        lb = serializer.save()
        _audit(lb, LogbookAuditLog.Action.CREATED, self.request.user,
               detail={"title": lb.title}, request=self.request)

    def perform_update(self, serializer):
        lb = serializer.save()
        _audit(lb, LogbookAuditLog.Action.UPDATED, self.request.user,
               request=self.request)

    # ── SUBMIT (intern finalises the whole logbook) ──────
    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        lb = self.get_object()
        if lb.intern != request.user:
            return Response(
                {"detail": "Only the intern can submit this logbook."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if lb.final_submitted:
            return Response(
                {"detail": "Logbook already submitted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # All entries must be submitted or approved
        pending = lb.entries.filter(
            status__in=[LogbookEntry.Status.DRAFT, LogbookEntry.Status.REJECTED]
        )
        if pending.exists():
            return Response(
                {
                    "detail": "All entries must be submitted or approved before final submission.",
                    "pending_count": pending.count(),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        lb.final_submitted = True
        lb.final_submitted_at = timezone.now()
        lb.save(update_fields=["final_submitted", "final_submitted_at", "updated_at"])
        _audit(lb, LogbookAuditLog.Action.FINAL_SUBMITTED, request.user, request=request)
        # Notify supervisor
        LogbookService.notify_supervisor_final_submission(lb)
        return Response({"detail": "Logbook submitted for final review."})

    # ── APPROVE (supervisor final-approves) ──────────────
    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        lb = self.get_object()
        if request.user.role not in SUPERVISOR_ROLES:
            return Response({"detail": "Permission denied."}, status=403)
        if not lb.final_submitted:
            return Response({"detail": "Logbook has not been submitted yet."}, status=400)
        if lb.final_approved:
            return Response({"detail": "Logbook already approved."}, status=400)
        rating = request.data.get("overall_rating")
        comments = request.data.get("overall_comments", "")
        lb.final_approved = True
        lb.final_approved_at = timezone.now()
        lb.final_approved_by = request.user
        if rating:
            lb.overall_rating = int(rating)
        lb.overall_comments = comments
        lb.save()
        _audit(lb, LogbookAuditLog.Action.FINAL_APPROVED, request.user,
               detail={"rating": rating}, request=request)
        LogbookService.notify_intern_final_approval(lb)
        return Response({"detail": "Logbook approved."})

    # ── DIGITAL SIGNATURE ────────────────────────────────
    @action(detail=True, methods=["post"])
    def sign(self, request, pk=None):
        lb = self.get_object()
        ser = SignatureSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        data_url = ser.validated_data["signature"]
        header, encoded = data_url.split(",", 1)
        image_data = base64.b64decode(encoded)
        filename = f"sig_{uuid.uuid4().hex}.png"
        content = ContentFile(image_data, name=filename)

        user = request.user
        if user == lb.intern:
            lb.intern_signature.save(filename, content, save=False)
            lb.intern_signed_at = timezone.now()
            lb.save(update_fields=["intern_signature", "intern_signed_at", "updated_at"])
            role_label = "intern"
        elif user.role in SUPERVISOR_ROLES:
            lb.supervisor_signature.save(filename, content, save=False)
            lb.supervisor_signed_at = timezone.now()
            lb.save(update_fields=["supervisor_signature", "supervisor_signed_at", "updated_at"])
            role_label = "supervisor"
        else:
            return Response({"detail": "Not authorised to sign this logbook."}, status=403)

        _audit(lb, LogbookAuditLog.Action.SIGNED, user,
               detail={"role": role_label}, request=request)
        return Response({"detail": f"Signature saved ({role_label})."})

    # ── SUMMARY (stats) ──────────────────────────────────
    @action(detail=True, methods=["get"])
    def summary(self, request, pk=None):
        lb = self.get_object()
        entries = lb.entries.all()
        by_status = {}
        for s, _ in LogbookEntry.Status.choices:
            by_status[s] = entries.filter(status=s).count()
        return Response({
            "logbook_id": str(lb.id),
            "title": lb.title,
            "total_entries": lb.total_entries,
            "completion_percentage": lb.completion_percentage,
            "entries_by_status": by_status,
            "overall_rating": lb.overall_rating,
            "final_submitted": lb.final_submitted,
            "final_approved": lb.final_approved,
            "intern_signed": bool(lb.intern_signed_at),
            "supervisor_signed": bool(lb.supervisor_signed_at),
        })

    # ── PDF EXPORT ───────────────────────────────────────
    @action(detail=True, methods=["get"])
    def export(self, request, pk=None):
        lb = self.get_object()
        pdf_bytes = LogbookService.generate_pdf(lb, request)
        from django.http import HttpResponse
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        safe_title = lb.title.replace(" ", "_")[:50]
        response["Content-Disposition"] = f'attachment; filename="{safe_title}_logbook.pdf"'
        return response

    # ── AUDIT TRAIL ──────────────────────────────────────
    @action(detail=True, methods=["get"])
    def audit(self, request, pk=None):
        lb = self.get_object()
        logs = lb.audit_logs.select_related("actor", "entry")
        ser = LogbookAuditLogSerializer(logs, many=True, context={"request": request})
        return Response(ser.data)


# ──────────────────────────────────────────────────────────
# LogbookEntry ViewSet  (nested under logbook)
# ──────────────────────────────────────────────────────────

class LogbookEntryViewSet(viewsets.ModelViewSet):
    """
    /api/logbooks/{logbook_pk}/entries/

    Extra actions:
        POST /{id}/submit/              — intern submits
        POST /{id}/approve/             — supervisor approves
        POST /{id}/reject/              — supervisor rejects
        POST /{id}/request_revision/    — supervisor requests revision
        POST /{id}/acknowledge/         — intern acknowledges supervisor comments
        GET  /{id}/attachments/         — list attachments
        POST /{id}/attachments/         — upload attachment
        DELETE /{id}/attachments/{att}/ — delete attachment
        GET  /{id}/comments/            — list comments
        POST /{id}/comments/            — add comment
    """

    permission_classes = [IsAuthenticated, CanEditEntry]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = LogbookEntryFilter
    ordering_fields = ["date", "created_at"]
    ordering = ["-date"]

    def get_queryset(self):
        lb_pk = self.kwargs.get("logbook_pk")
        user = self.request.user
        qs = LogbookEntry.objects.filter(logbook_id=lb_pk).select_related(
            "logbook__intern", "reviewed_by"
        ).prefetch_related("attachments", "comments__author")

        # Interns see only their own logbook entries
        if user.role not in SUPERVISOR_ROLES:
            qs = qs.filter(logbook__intern=user)
        return qs

    def get_serializer_class(self):
        if self.action == "list":
            return LogbookEntryListSerializer
        return LogbookEntryDetailSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["logbook_id"] = self.kwargs.get("logbook_pk")
        return ctx

    @transaction.atomic
    def perform_create(self, serializer):
        lb = Logbook.objects.get(pk=self.kwargs["logbook_pk"])
        if lb.final_submitted:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Cannot add entries to a submitted logbook.")
        entry = serializer.save(logbook=lb)
        # Auto-submit if requested
        submit = self.request.data.get("submit", False)
        if submit:
            entry.submit()
        _audit(lb, LogbookAuditLog.Action.CREATED, self.request.user,
               entry=entry, request=self.request)

    @transaction.atomic
    def perform_update(self, serializer):
        from rest_framework.exceptions import PermissionDenied
        entry = self.get_object()
        if entry.locked:
            raise PermissionDenied("This entry has been reviewed and is locked from further edits.")
        entry = serializer.save()
        _audit(
            entry.logbook, LogbookAuditLog.Action.UPDATED, self.request.user,
            entry=entry, request=self.request
        )

    # ── SUBMIT ───────────────────────────────────────────
    @action(detail=True, methods=["post"])
    def submit(self, request, logbook_pk=None, pk=None):
        entry = self.get_object()
        if entry.logbook.intern != request.user:
            return Response({"detail": "Only the intern can submit this entry."}, status=403)
        if entry.status not in (
            LogbookEntry.Status.DRAFT,
            LogbookEntry.Status.REJECTED,
            LogbookEntry.Status.REVISION_REQUESTED,
        ):
            return Response({"detail": f"Cannot submit from status '{entry.status}'."}, status=400)
        entry.submit()
        _audit(entry.logbook, LogbookAuditLog.Action.SUBMITTED, request.user,
               entry=entry, request=request)
        LogbookService.notify_supervisor_entry_submitted(entry)
        return Response({"detail": "Entry submitted for review."})

    # ── APPROVE ──────────────────────────────────────────
    @action(detail=True, methods=["post"])
    def approve(self, request, logbook_pk=None, pk=None):
        if request.user.role not in SUPERVISOR_ROLES:
            return Response({"detail": "Permission denied."}, status=403)
        entry = self.get_object()
        if entry.locked:
            return Response({"detail": "This entry has already been reviewed and is locked."}, status=400)
        if entry.status != LogbookEntry.Status.SUBMITTED:
            return Response({"detail": "Only submitted entries can be approved."}, status=400)
        comments = request.data.get("supervisor_comments", "")
        rating = request.data.get("supervisor_rating")
        if comments:
            entry.supervisor_comments = comments
        if rating:
            entry.supervisor_rating = int(rating)
        entry.approve(request.user)
        _audit(entry.logbook, LogbookAuditLog.Action.APPROVED, request.user,
               entry=entry, request=request)
        LogbookService.notify_intern_entry_approved(entry)
        return Response({"detail": "Entry approved."})

    # ── REJECT (a.k.a. "deapprove") ──────────────────────
    @action(detail=True, methods=["post"])
    def reject(self, request, logbook_pk=None, pk=None):
        if request.user.role not in SUPERVISOR_ROLES:
            return Response({"detail": "Permission denied."}, status=403)
        entry = self.get_object()
        if entry.locked:
            return Response({"detail": "This entry has already been reviewed and is locked."}, status=400)
        comments = request.data.get("supervisor_comments", "")
        entry.reject(request.user, comments)
        _audit(entry.logbook, LogbookAuditLog.Action.REJECTED, request.user,
               entry=entry, request=request)
        LogbookService.notify_intern_entry_rejected(entry)
        return Response({"detail": "Entry rejected."})

    # ── REQUEST REVISION ─────────────────────────────────
    @action(detail=True, methods=["post"], url_path="request-revision")
    def request_revision(self, request, logbook_pk=None, pk=None):
        if request.user.role not in SUPERVISOR_ROLES:
            return Response({"detail": "Permission denied."}, status=403)
        entry = self.get_object()
        if entry.locked:
            return Response({"detail": "This entry has already been reviewed and is locked."}, status=400)
        comments = request.data.get("supervisor_comments", "")
        entry.request_revision(request.user, comments)
        _audit(entry.logbook, LogbookAuditLog.Action.REVISION_REQUESTED, request.user,
               entry=entry, request=request)
        LogbookService.notify_intern_revision_requested(entry)
        return Response({"detail": "Revision requested."})

    # ── ACKNOWLEDGE ──────────────────────────────────────
    @action(detail=True, methods=["post"])
    def acknowledge(self, request, logbook_pk=None, pk=None):
        entry = self.get_object()
        if entry.logbook.intern != request.user:
            return Response({"detail": "Only the intern can acknowledge."}, status=403)
        entry.intern_acknowledged = True
        entry.intern_acknowledged_at = timezone.now()
        entry.save(update_fields=["intern_acknowledged", "intern_acknowledged_at", "updated_at"])
        return Response({"detail": "Acknowledged."})

    # ── ATTACHMENTS ──────────────────────────────────────
    @action(
        detail=True, methods=["get", "post"],
        parser_classes=[MultiPartParser, FormParser],
    )
    def attachments(self, request, logbook_pk=None, pk=None):
        entry = self.get_object()
        if request.method == "GET":
            atts = entry.attachments.all()
            ser = EntryAttachmentSerializer(atts, many=True, context={"request": request})
            return Response(ser.data)
        # POST — upload
        ser = EntryAttachmentUploadSerializer(
            data=request.data,
            context={"request": request, "entry": entry}
        )
        ser.is_valid(raise_exception=True)
        att = ser.save()
        _audit(entry.logbook, LogbookAuditLog.Action.ATTACHMENT_ADDED, request.user,
               entry=entry, detail={"filename": att.original_name}, request=request)
        return Response(
            EntryAttachmentSerializer(att, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True, methods=["delete"],
        url_path=r"attachments/(?P<att_pk>[0-9a-f-]+)",
    )
    def delete_attachment(self, request, logbook_pk=None, pk=None, att_pk=None):
        entry = self.get_object()
        try:
            att = entry.attachments.get(pk=att_pk)
        except EntryAttachment.DoesNotExist:
            return Response({"detail": "Attachment not found."}, status=404)
        name = att.original_name
        att.file.delete(save=False)
        att.delete()
        _audit(entry.logbook, LogbookAuditLog.Action.ATTACHMENT_REMOVED, request.user,
               entry=entry, detail={"filename": name}, request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ── COMMENTS ─────────────────────────────────────────
    @action(detail=True, methods=["get", "post"])
    def comments(self, request, logbook_pk=None, pk=None):
        entry = self.get_object()
        if request.method == "GET":
            qs = entry.comments.filter(parent=None).select_related("author").prefetch_related(
                "replies__author"
            )
            ser = LogbookCommentSerializer(qs, many=True, context={"request": request})
            return Response(ser.data)
        # POST
        ser = LogbookCommentSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        comment = ser.save(entry=entry, author=request.user)
        _audit(entry.logbook, LogbookAuditLog.Action.COMMENT_ADDED, request.user,
               entry=entry, request=request)
        return Response(
            LogbookCommentSerializer(comment, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


# ──────────────────────────────────────────────────────────
# Standalone comment edit/delete
# ──────────────────────────────────────────────────────────

class LogbookCommentViewSet(viewsets.GenericViewSet):
    """
    /api/logbook-comments/{id}/    PATCH / DELETE only
    """
    permission_classes = [IsAuthenticated]
    serializer_class = LogbookCommentSerializer

    def get_queryset(self):
        return LogbookComment.objects.select_related("author")

    def partial_update(self, request, pk=None):
        comment = self.get_object()
        if comment.author != request.user:
            return Response({"detail": "Only the author can edit this comment."}, status=403)
        ser = self.get_serializer(comment, data=request.data, partial=True,
                                  context={"request": request})
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def destroy(self, request, pk=None):
        comment = self.get_object()
        user = request.user
        if comment.author != user and user.role not in SUPERVISOR_ROLES:
            return Response({"detail": "Permission denied."}, status=403)
        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ──────────────────────────────────────────────────────────
# Program ViewSet
# ──────────────────────────────────────────────────────────

class ProgramViewSet(viewsets.ModelViewSet):
    """
    /api/v1/logbooks/programs/

    Admin supplies only name + description (+ an overall date range used
    to schedule the 3 auto-created cohorts). Everything else — cohort
    creation, sequencing, department rows — happens automatically.
    """

    permission_classes = [IsAuthenticated]
    ordering = ["-start_date"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), IsProgramAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        return Program.objects.all().order_by("-start_date")

    def get_serializer_class(self):
        if self.action == "create":
            return ProgramCreateSerializer
        if self.action == "list":
            return ProgramListSerializer
        return ProgramDetailSerializer

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        program = ser.save()
        out = ProgramDetailSerializer(program, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)


# ──────────────────────────────────────────────────────────
# Cohort ViewSet (nested under program) — read-only
# ──────────────────────────────────────────────────────────

class CohortViewSet(viewsets.ReadOnlyModelViewSet):
    """
    /api/v1/logbooks/programs/{program_pk}/cohorts/

    Read-only: cohorts are auto-created with the program and their
    open/closed status is date+sequence-driven, not a direct mutation.
    Each list/retrieve call live-refreshes status so the badge is never
    stale even if the Celery sweep hasn't ticked yet this minute.
    """

    serializer_class = CohortSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        program_pk = self.kwargs.get("program_pk")
        qs = Cohort.objects.filter(program_id=program_pk).select_related(
            "program"
        ).prefetch_related("department_activations__department", "department_activations__supervisor")
        return qs.order_by("sequence")

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        for cohort in qs:
            cohort.refresh_status()
        ser = self.get_serializer(qs, many=True)
        return Response(ser.data)

    def retrieve(self, request, *args, **kwargs):
        obj = self.get_object()
        obj.refresh_status()
        ser = self.get_serializer(obj)
        return Response(ser.data)


# ──────────────────────────────────────────────────────────
# DepartmentActivation ViewSet (nested under cohort)
# ──────────────────────────────────────────────────────────

class DepartmentActivationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    /api/v1/logbooks/programs/{program_pk}/cohorts/{cohort_pk}/departments/

    Extra actions:
        POST /{id}/activate/    — enrol every attachee in this department,
                                   create their Logbooks, email them
        POST /{id}/deactivate/  — switch off (existing logbooks/entries
                                   are preserved, not deleted)
        GET  /{id}/logbooks/    — list this department's attachee logbooks
                                   for the cohort, with progress
    """

    serializer_class = DepartmentActivationSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ("activate", "deactivate"):
            return [IsAuthenticated(), IsProgramAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        cohort_pk = self.kwargs.get("cohort_pk")
        return DepartmentActivation.objects.filter(
            cohort_id=cohort_pk
        ).select_related("department", "supervisor", "cohort", "cohort__program")

    @transaction.atomic
    @action(detail=True, methods=["post"])
    def activate(self, request, program_pk=None, cohort_pk=None, pk=None):
        dept_act = self.get_object()
        cohort = dept_act.cohort

        # Strict rule: departments can only be (de)activated while their
        # cohort is open.
        if cohort.refresh_status() != Cohort.Status.OPEN:
            return Response(
                {"detail": "This cohort is not currently open."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ser = DepartmentActivationActivateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        supervisor = None
        supervisor_id = ser.validated_data.get("supervisor_id")
        if supervisor_id:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                supervisor = User.objects.get(pk=supervisor_id)
            except User.DoesNotExist:
                return Response({"detail": "Supervisor not found."}, status=400)

        dept_act.is_active = True
        dept_act.activated_at = timezone.now()
        dept_act.activated_by = request.user
        dept_act.deactivated_at = None
        if supervisor:
            dept_act.supervisor = supervisor
        dept_act.save(update_fields=[
            "is_active", "activated_at", "activated_by", "deactivated_at",
            "supervisor", "updated_at",
        ])

        # Idempotent enrolment: only create logbooks / send emails once
        # per activation cycle, so re-activating after a deactivate
        # doesn't spam attachees who already had a logbook from before.
        if not dept_act.logbooks_created:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            attachees = User.objects.filter(department=dept_act.department)

            created_logbooks = []
            for attachee in attachees:
                lb, lb_created = Logbook.objects.get_or_create(
                    intern=attachee,
                    department_activation=dept_act,
                    defaults={
                        "title": f"{cohort.program.name} — {cohort.label}",
                        "description": cohort.program.description,
                        "supervisor": dept_act.supervisor,
                        "department": dept_act.department,
                        "start_date": cohort.start_date,
                        "end_date": cohort.end_date,
                    },
                )
                if lb_created:
                    _audit(lb, LogbookAuditLog.Action.CREATED, request.user,
                           detail={"source": "department_activation"}, request=request)
                created_logbooks.append(lb)

            dept_act.logbooks_created = True
            dept_act.save(update_fields=["logbooks_created", "updated_at"])

            if not dept_act.email_sent:
                for lb in created_logbooks:
                    LogbookService.notify_attachee_program_activated(lb)
                dept_act.email_sent = True
                dept_act.save(update_fields=["email_sent", "updated_at"])

        out = DepartmentActivationSerializer(dept_act, context={"request": request})
        return Response(out.data)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, program_pk=None, cohort_pk=None, pk=None):
        dept_act = self.get_object()
        dept_act.is_active = False
        dept_act.deactivated_at = timezone.now()
        dept_act.save(update_fields=["is_active", "deactivated_at", "updated_at"])
        out = DepartmentActivationSerializer(dept_act, context={"request": request})
        return Response(out.data)

    @action(detail=True, methods=["get"])
    def logbooks(self, request, program_pk=None, cohort_pk=None, pk=None):
        dept_act = self.get_object()
        qs = Logbook.objects.filter(
            department_activation=dept_act
        ).select_related("intern", "supervisor", "department").prefetch_related("entries")
        ser = DepartmentLogbookSerializer(qs, many=True, context={"request": request})
        return Response(ser.data)
