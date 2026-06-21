from django.utils import timezone
from django.db.models import Q, Count
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import FeedbackTicket
from .serializers import FeedbackTicketSerializer, FeedbackTicketAdminSerializer

ADMIN_ROLES = {"system_admin", "broadcast_admin", "hr_officer", "ict", "operations"}


def is_admin(user):
    return getattr(user, "role", None) in ADMIN_ROLES


class FeedbackTicketViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = FeedbackTicketSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        qs = FeedbackTicket.objects.select_related("submitted_by")

        # Admins see all tickets; regular users see only their own
        if not is_admin(user):
            qs = qs.filter(submitted_by=user)

        # Search
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(title__icontains=search)
                | Q(description__icontains=search)
                | Q(ticket_number__icontains=search)
                | Q(category__icontains=search)
            )

        # Status filter
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        return qs

    def get_serializer_class(self):
        if self.request.method == "PATCH" and is_admin(self.request.user):
            return FeedbackTicketAdminSerializer
        return FeedbackTicketSerializer

    def perform_create(self, serializer):
        serializer.save(submitted_by=self.request.user)

    def perform_update(self, serializer):
        instance = serializer.save()
        # Auto-set resolved_at when status changes to resolved
        if instance.status == "resolved" and not instance.resolved_at:
            instance.resolved_at = timezone.now()
            instance.resolved_by = self.request.user
            instance.save(update_fields=["resolved_at", "resolved_by"])

    def partial_update(self, request, *args, **kwargs):
        if not is_admin(request.user):
            return Response(
                {"detail": "You do not have permission to update tickets."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().partial_update(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        if not is_admin(request.user):
            return Response(
                {"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN
            )
        qs = FeedbackTicket.objects.all()
        by_status = (
            qs.values("status").annotate(count=Count("id")).order_by("status")
        )
        by_category = (
            qs.values("category").annotate(count=Count("id")).order_by("-count")
        )
        by_priority = (
            qs.values("priority").annotate(count=Count("id")).order_by("priority")
        )
        return Response(
            {
                "total": qs.count(),
                "open": qs.filter(status="open").count(),
                "in_progress": qs.filter(status="in_progress").count(),
                "resolved": qs.filter(status="resolved").count(),
                "closed": qs.filter(status="closed").count(),
                "by_status": list(by_status),
                "by_category": list(by_category),
                "by_priority": list(by_priority),
            }
        )