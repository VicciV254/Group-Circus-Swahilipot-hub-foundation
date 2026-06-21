"""
Nexus — Auth URL Configuration
Mount this at: /api/v1/auth/

Example in your project urls.py:
    path('api/v1/auth/', include('apps.accounts.auth_urls')),
"""
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import CustomTokenObtainPairView, MFAVerifyView, MFAResendView, LogoutView

urlpatterns = [
    path('login/',      CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('refresh/',    TokenRefreshView.as_view(),          name='token_refresh'),
    path('logout/',     LogoutView.as_view(),                name='logout'),
    path('mfa/verify/', MFAVerifyView.as_view(),             name='mfa-verify'),
    path('mfa/resend/', MFAResendView.as_view(),             name='mfa-resend'),


]