"""Nexus Broadcast Admin Dashboard — URLs"""
from django.urls import path
from apps.analytics.views import AdminDashboardOverviewView, ExportView

urlpatterns = [
    path('overview/',              AdminDashboardOverviewView.as_view(), name='admin-dashboard-overview'),
    path('alerts/',                AdminDashboardOverviewView.as_view(), name='admin-dashboard-alerts'),
    path('activity/',              AdminDashboardOverviewView.as_view(), name='admin-dashboard-activity'),
    path('export/<str:module>/',   ExportView.as_view(),                name='admin-export'),
]
