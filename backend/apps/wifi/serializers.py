from rest_framework import serializers
from .models import WifiGrant


class WifiGrantSerializer(serializers.ModelSerializer):
    # Read-only display fields the frontend reads from g.requester_name / g.requested_by_name
    requester_name    = serializers.SerializerMethodField()
    requested_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = WifiGrant
        fields = [
            'id',
            'requested_by',
            'requester_name',
            'requested_by_name',
            'device_type',
            'mac_address',
            'purpose',
            'status',
            'duration_days',
            'expires_at',
            'reviewed_by',
            'reviewed_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'requested_by',
            'status',
            'expires_at',
            'reviewed_by',
            'reviewed_at',
            'created_at',
            'updated_at',
        ]

    def get_requester_name(self, obj):
        return obj.requested_by.get_full_name() or obj.requested_by.email

    def get_requested_by_name(self, obj):
        return self.get_requester_name(obj)
    