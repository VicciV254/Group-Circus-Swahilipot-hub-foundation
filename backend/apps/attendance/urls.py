"""
apps/attendance/urls.py  — full URL config including dept dashboard
"""
from django.urls import path
from .views import (
    TodayAttendanceView,
    CheckInView,
    CheckOutView,
    AttendanceHistoryView,
    LeaveRequestListCreateView,
    LeaveRequestDetailView,
    GeofenceViolationView,
)

from .dept_views import (
    DeptOverviewView,
    DeptMembersView,
    DeptAbsenteesView,
    DeptLateComersView,
    DeptTrendsView,
    DeptTodaySnapshotView,
    SendWarningView,
    DeactivateUserView,
    AutoEnforceView,
)

urlpatterns = [
    # ── Employee self-service ────────────────────────────────────────────────
    path('check-in/',        CheckInView.as_view(),              name='attendance-check-in'),
    path('check-out/',       CheckOutView.as_view(),             name='attendance-check-out'),
    path('today/',           TodayAttendanceView.as_view(),      name='attendance-today'),
    path('history/',         AttendanceHistoryView.as_view(),    name='attendance-history'),
    path('leave/',           LeaveRequestListCreateView.as_view(), name='attendance-leave-list'),
    path('leave/<uuid:pk>/', LeaveRequestDetailView.as_view(),   name='attendance-leave-detail'),
    path('geofence-violation/', GeofenceViolationView.as_view(), name='geofence-violation'),

    # ── Supervisor / Department Leader dashboard ──────────────────────────────
    path('dept/overview/',        DeptOverviewView.as_view(),       name='dept-overview'),
    path('dept/today/',           DeptTodaySnapshotView.as_view(),  name='dept-today-snapshot'),
    path('dept/members/',         DeptMembersView.as_view(),        name='dept-members'),
    path('dept/absentees/',       DeptAbsenteesView.as_view(),      name='dept-absentees'),
    path('dept/late-comers/',     DeptLateComersView.as_view(),     name='dept-late-comers'),
    path('dept/trends/',          DeptTrendsView.as_view(),         name='dept-trends'),
    path('dept/warn/<uuid:user_id>/',       SendWarningView.as_view(),    name='dept-warn-user'),
    path('dept/deactivate/<uuid:user_id>/', DeactivateUserView.as_view(), name='dept-deactivate-user'),
    path('dept/auto-enforce/',    AutoEnforceView.as_view(),        name='dept-auto-enforce'),
    
]