"""Nexus Analytics — URLs (v3 — full export engine)"""
from django.urls import path
from .views import (
    AnalyticsDashboardView,
    AttendanceAnalyticsView,
    DepartmentAnalyticsView,
    SystemAnalyticsView,
    FMAnalyticsView,
    ExportView,
    AdminDashboardOverviewView,
)
from .views_export import (
    AnalyticsExportView,
    AnalyticsExportMetaView,
)

urlpatterns = [
    # ── Core dashboards ───────────────────────────────────────────────────
    path('dashboard/',              AnalyticsDashboardView.as_view(),      name='analytics-dashboard'),
    path('admin-overview/',         AdminDashboardOverviewView.as_view(),   name='analytics-admin-overview'),

    # ── Module analytics ──────────────────────────────────────────────────
    path('attendance/',             AttendanceAnalyticsView.as_view(),      name='analytics-attendance'),
    path('system/',                 SystemAnalyticsView.as_view(),          name='analytics-system'),
    path('fm/',                     FMAnalyticsView.as_view(),              name='analytics-fm'),
    path('department/<str:dept_id>/',DepartmentAnalyticsView.as_view(),     name='analytics-department'),

    # ── Legacy CSV export (keep for backwards compat) ─────────────────────
    path('export/<str:module>/',    ExportView.as_view(),                   name='analytics-export-legacy'),

    # ── Production export engine ──────────────────────────────────────────
    # GET /analytics/export/                        → list formats & modules
    # GET /analytics/export/<fmt>/                  → full report in format
    # GET /analytics/export/<fmt>/<module>/         → specific module
    # ?days=30&department=<uuid>
    #
    # fmt:    pdf | excel | xlsx | pptx | powerpoint | csv | json
    # module: full | audit | users | modules | performance | attendance |
    #         equipment | alerts | certificates | feedback | wifi |
    #         videography | filetransfers
    path('exports/',                        AnalyticsExportMetaView.as_view(), name='analytics-export-meta'),
    path('exports/<str:fmt>/',              AnalyticsExportView.as_view(),     name='analytics-export-fmt'),
    path('exports/<str:fmt>/<str:module>/', AnalyticsExportView.as_view(),     name='analytics-export-fmt-module'),
]