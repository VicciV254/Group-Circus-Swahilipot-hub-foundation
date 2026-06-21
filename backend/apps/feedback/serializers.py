from rest_framework import serializers
from .models import FeedbackTicket


class FeedbackTicketSerializer(serializers.ModelSerializer):
    submitted_by_name = serializers.SerializerMethodField()

    class Meta:  # type: ignore
        model = FeedbackTicket
        fields = [
            "id",
            "ticket_number",
            "submitted_by",
            "submitted_by_name",
            "category",
            "title",
            "description",
            "priority",
            "status",
            "admin_response",
            "resolved_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "ticket_number",
            "submitted_by",
            "submitted_by_name",
            "resolved_at",
            "created_at",
            "updated_at",
        ]

    def get_submitted_by_name(self, obj):
        if obj.submitted_by:
            return obj.submitted_by.get_full_name() or obj.submitted_by.email
        return "Unknown"


class FeedbackTicketAdminSerializer(FeedbackTicketSerializer):
    """Allows admins to update status and admin_response."""

    class Meta(FeedbackTicketSerializer.Meta):
        read_only_fields = [
            "id",
            "ticket_number",
            "submitted_by",
            "submitted_by_name",
            "created_at",
            "updated_at",
        ]