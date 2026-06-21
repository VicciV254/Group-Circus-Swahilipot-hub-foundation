"""Nexus Enterprise — Root URL Configuration"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenRefreshView
from apps.accounts.views import CustomTokenObtainPairView, LogoutView, MFAVerifyView
# from debug_auth.debug_auth import debug_auth

urlpatterns = [
    # Admin
    # path('debug-auth/', debug_auth),

    path('django-admin/', admin.site.urls),

    # Authentication
    path('api/v1/auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/v1/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/v1/auth/logout/', LogoutView.as_view(), name='logout'),
    path('api/v1/auth/mfa/verify/', MFAVerifyView.as_view(), name='mfa_verify'),

    # Core Modules
    path('api/v1/accounts/', include('apps.accounts.urls')),
    path('api/v1/attachees/', include('apps.attachees.urls')),
    path('api/v1/attendance/', include('apps.attendance.urls')),
    path('api/v1/tasks/', include('apps.tasks.urls')),
    path('api/v1/logbooks/', include('apps.logbooks.urls')),
    path('api/v1/evaluations/', include('apps.evaluations.urls')),
    path('api/v1/certificates/', include('apps.certificates.urls')),
    path('api/v1/notifications/', include('apps.notifications.urls')),
    path('api/v1/documents/', include('apps.documents.urls')),
    path('api/v1/analytics/', include('apps.analytics.urls')),

    # Enterprise Modules
    path('api/v1/finance/', include('apps.finance.urls')),
    path('api/v1/procurement/', include('apps.procurement.urls')),
    path('api/v1/ict/', include('apps.ict.urls')),
    path('api/v1/communications/', include('apps.communications.urls')),
    path('api/v1/legal/', include('apps.legal.urls')),
    path('api/v1/qc/', include('apps.qc.urls')),
    path('api/v1/operations/', include('apps.operations.urls')),
    path('api/v1/customer-service/', include('apps.customer_service.urls')),
    path('api/v1/rd/', include('apps.rd.urls')),
    path('api/v1/hse/', include('apps.hse.urls')),
    path('api/v1/facilities/', include('apps.facilities.urls')),
    path('api/v1/security/', include('apps.security.urls')),
    path('api/v1/university/', include('apps.university.urls')),
    path('api/v1/workflow/', include('apps.workflow.urls')),
    path('api/v1/knowledge/', include('apps.knowledge.urls')),

    # Broadcast Media Modules
    path('api/v1/equipment/', include('apps.equipment.urls')),
    path('api/v1/projects/', include('apps.projects.urls')),
    # path('api/v1/subscriptions/', include('apps.subscriptions.urls')),
    path('api/v1/wifi/', include('apps.wifi.urls')),
    path('api/v1/feedback/', include('apps.feedback.urls')),
    path('api/v1/file-transfer/', include('apps.filetransfer.urls')),
    path('api/v1/fm-report/', include('apps.fm_report.urls')),
    path('api/v1/calls/', include('apps.calls.urls')),
    path('api/v1/radio/', include('apps.radio.urls')),
    path('api/v1/news/', include('apps.news.urls')),
    path('api/v1/videography/', include('apps.videography.urls')),
    path('api/v1/broadcast/', include('apps.broadcast.urls')),
    path('api/v1/admin-dashboard/', include('apps.broadcast.dashboard_urls')),
    path('api/v1/chat/', include('apps.chat.urls')),
    path('api/v1/ai/', include('apps.ai_assistant.urls')),
    path('api/v1/auth/', include('apps.accounts.auth_urls')),
    path('api/v1/project-management/', include('apps.projects.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
