from rest_framework import serializers
from .models import FileTransfer


class FileTransferSerializer(serializers.ModelSerializer):
    is_expired = serializers.ReadOnlyField()
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:  # type: ignore
        model = FileTransfer
        fields = [
            "id",
            "token",
            "uploaded_by",
            "uploaded_by_name",
            "original_filename",
            "file_size",
            "content_type",
            "download_count",
            "expires_at",
            "is_expired",
            "created_at",
        ]
        read_only_fields = fields

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return obj.uploaded_by.get_full_name() or obj.uploaded_by.email
        return "Unknown"