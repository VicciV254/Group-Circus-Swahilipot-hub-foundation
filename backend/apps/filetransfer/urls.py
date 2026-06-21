from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FileTransferViewSet, FileDownloadView

router = DefaultRouter()
router.register(r"", FileTransferViewSet, basename="file-transfer")

urlpatterns = [
    path("download/<uuid:token>/", FileDownloadView.as_view(), name="file-download"),
    path("", include(router.urls)),
]