"""
Nexus — Attachees URL Configuration
Mount at: /api/v1/attachees/
"""
from django.urls import path
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from .attachee_bulk_views import (
    AttacheeBulkImportView,
    BulkImportTemplateView,
    AssignSupervisorView,
    DeassignSupervisorView,
    ToggleAttacheeActiveView,
    CreateUserWithCredentialsView,
)


class ModuleView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        return Response({'detail': 'Attachees module'})


urlpatterns = [
    # List / detail stubs (replace with real serializer views)
    path('', ModuleView.as_view()),
    path('<uuid:pk>/', ModuleView.as_view()),

    # Single-user creation with auto-generated credentials & welcome email
    path('create/', CreateUserWithCredentialsView.as_view(), name='attachee-create'),

    # Bulk import
    path('bulk-import/', AttacheeBulkImportView.as_view(), name='attachee-bulk-import'),
    path('bulk-import/template/', BulkImportTemplateView.as_view(), name='attachee-import-template'),

    # Per-attachee management
    path('<uuid:pk>/assign-supervisor/', AssignSupervisorView.as_view(), name='attachee-assign-supervisor'),
    path('<uuid:pk>/deassign-supervisor/', DeassignSupervisorView.as_view(), name='attachee-deassign-supervisor'),
    path('<uuid:pk>/toggle-active/', ToggleAttacheeActiveView.as_view(), name='attachee-toggle-active'),
]