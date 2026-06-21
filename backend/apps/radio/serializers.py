"""
apps/radio/serializers.py
─────────────────────────
DRF serializers for Frequency, Show, and RadioSlot.
"""

from rest_framework import serializers
from .models import Frequency, Show, RadioSlot


class FrequencySerializer(serializers.ModelSerializer):
    class Meta:
        model  = Frequency
        fields = [
            "id", "name", "frequency_mhz", "band",
            "stream_url", "description", "is_active", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class ShowSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Show
        fields = [
            "id", "name", "show_type", "description",
            "cover_image", "is_active", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class RadioSlotSerializer(serializers.ModelSerializer):
    # Write with IDs, read back names automatically from denorm fields
    frequency_id = serializers.PrimaryKeyRelatedField(
        queryset=Frequency.objects.filter(is_active=True),
        source="frequency",
        write_only=True,
    )
    show_id = serializers.PrimaryKeyRelatedField(
        queryset=Show.objects.filter(is_active=True),
        source="show",
        write_only=True,
    )
    presenter = serializers.PrimaryKeyRelatedField(
        queryset=__import__("django.contrib.auth", fromlist=["get_user_model"]).get_user_model().objects.all(),
        allow_null=True,
        required=False,
    )

    # Computed / denorm read fields
    duration_minutes = serializers.ReadOnlyField()

    class Meta:
        model  = RadioSlot
        fields = [
            "id",
            # write-only FK inputs
            "frequency_id",
            "show_id",
            "presenter",
            # denorm display
            "show_name",
            "frequency_name",
            "presenter_name",
            "show_type",
            # scheduling
            "start_datetime",
            "end_datetime",
            "duration_minutes",
            "status",
            "location",
            # content
            "notes",
            "show_plan",
            # meta
            "reminded_30min",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id", "show_name", "frequency_name",
            "presenter_name", "show_type",
            "duration_minutes", "reminded_30min",
            "created_at", "updated_at",
        ]

    def validate(self, attrs):
        start = attrs.get("start_datetime")
        end   = attrs.get("end_datetime")
        if start and end and end <= start:
            raise serializers.ValidationError(
                {"end_datetime": "End time must be after start time."}
            )
        return attrs
