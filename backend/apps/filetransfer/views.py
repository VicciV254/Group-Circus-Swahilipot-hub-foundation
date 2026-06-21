import mimetypes
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet
from rest_framework.mixins import ListModelMixin, DestroyModelMixin

from .models import FileTransfer
from .serializers import FileTransferSerializer


class FileTransferViewSet(ListModelMixin, DestroyModelMixin, GenericViewSet):
    """
    GET  /file-transfer/        → list current user's uploads
    POST /file-transfer/        → upload a file
    DELETE /file-transfer/<id>/ → delete a file
    """
    permission_classes = [IsAuthenticated]
    serializer_class = FileTransferSerializer
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        return FileTransfer.objects.filter(uploaded_by=self.request.user)

    def create(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response(
                {"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST
            )

        content_type = file.content_type or mimetypes.guess_type(file.name)[0] or ""

        transfer = FileTransfer(
            uploaded_by=request.user,
            original_filename=file.name,
            file_size=file.size,
            content_type=content_type,
        )
        # Save without file first to get token/id for upload_to path
        transfer.file = file
        transfer.save()

        serializer = self.get_serializer(transfer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        # Delete the physical file
        if instance.file:
            try:
                instance.file.delete(save=False)
            except Exception:
                pass
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FileDownloadView(APIView):
    """
    GET /file-transfer/download/<token>/
    Public endpoint — no auth required so shared links work.
    """
    permission_classes = []

    def get(self, request, token):
        try:
            transfer = FileTransfer.objects.get(token=token)
        except FileTransfer.DoesNotExist:
            raise Http404

        if transfer.is_expired:
            return Response(
                {"detail": "This download link has expired."},
                status=status.HTTP_410_GONE,
            )

        # Increment download count
        FileTransfer.objects.filter(pk=transfer.pk).update(
            download_count=transfer.download_count + 1
        )

        try:
            file_handle = transfer.file.open("rb")
        except (FileNotFoundError, ValueError):
            raise Http404

        content_type = transfer.content_type or "application/octet-stream"
        response = FileResponse(
            file_handle,
            content_type=content_type,
            as_attachment=True,
            filename=transfer.original_filename,
        )
        return response