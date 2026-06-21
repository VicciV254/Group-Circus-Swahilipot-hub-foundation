from django.urls import path
from .models import (
    CertificateListView,
    CertificateDetailView,
    GenerateCertificateView,
    DownloadCertificateView,
    VerifyCertificateView,
    BadgeListView,
)

urlpatterns = [
    path('', CertificateListView.as_view()),

    path('generate/', GenerateCertificateView.as_view()),
    path('badges/', BadgeListView.as_view()),
    path('verify/<str:code>/', VerifyCertificateView.as_view()),

    path('<uuid:pk>/download/', DownloadCertificateView.as_view()),
    path('<uuid:pk>/', CertificateDetailView.as_view()),
]