"""Nexus Accounts — URL Configuration"""
from django.urls import path
from .views import (
    UserProfileView, UserListView, UserDetailView,
    UserPreferencesView, UserActivateView, UserResetPasswordView,
)
from apps.accounts.org_views import (
    OrganisationView, BranchListView, BranchDetailView,
    DepartmentListView, DepartmentDetailView,
    UserStatsView, BulkImportView, ChangePasswordView,
    MFASetupView, MFADisableView, AuditLogView,
    UserSessionListView, RevokeSessionView,
    SupervisorListView, UserExportView, ChangeRoleView,
    AdminUserSessionsView, AdminRevokeSessionView, AdminRevokeAllSessionsView,
    BulkActivateView, BulkDeactivateView, BulkChangeRoleView, BulkReassignView,
)

urlpatterns = [
    # Profile
    path('profile/',          UserProfileView.as_view(),     name='user-profile'),
    path('profile/password/', ChangePasswordView.as_view(),  name='change-password'),

    # Preferences
    path('preferences/',      UserPreferencesView.as_view(), name='user-preferences'),

    # MFA
    path('mfa/setup/',        MFASetupView.as_view(),        name='mfa-setup'),
    path('mfa/disable/',      MFADisableView.as_view(),      name='mfa-disable'),

    # Sessions
    path('sessions/',                      UserSessionListView.as_view(), name='user-sessions'),
    path('sessions/<uuid:pk>/revoke/',     RevokeSessionView.as_view(),   name='revoke-session'),

    # Users — specific paths BEFORE <uuid:pk> (otherwise Django matches "stats" as a UUID)
    path('users/stats/',                   UserStatsView.as_view(),          name='user-stats'),
    path('users/bulk-import/',             BulkImportView.as_view(),         name='user-bulk-import'),
    path('users/supervisors/',             SupervisorListView.as_view(),     name='user-supervisors'),
    path('users/export/',                  UserExportView.as_view(),         name='user-export'),
    path('users/bulk-activate/',           BulkActivateView.as_view(),       name='user-bulk-activate'),
    path('users/bulk-deactivate/',         BulkDeactivateView.as_view(),     name='user-bulk-deactivate'),
    path('users/bulk-change-role/',        BulkChangeRoleView.as_view(),     name='user-bulk-change-role'),
    path('users/bulk-reassign/',           BulkReassignView.as_view(),       name='user-bulk-reassign'),
    path('users/',                         UserListView.as_view(),           name='user-list'),
    path('users/<uuid:pk>/',               UserDetailView.as_view(),         name='user-detail'),
    path('users/<uuid:pk>/activate/',      UserActivateView.as_view(),       name='user-activate'),
    path('users/<uuid:pk>/reset-password/', UserResetPasswordView.as_view(), name='user-reset-password'),
    path('users/<uuid:pk>/change-role/',   ChangeRoleView.as_view(),         name='user-change-role'),
    path('users/<uuid:pk>/sessions/',          AdminUserSessionsView.as_view(),     name='user-sessions-admin'),
    path('users/<uuid:pk>/sessions/revoke-all/', AdminRevokeAllSessionsView.as_view(), name='user-sessions-revoke-all'),

    # Sessions — admin revoke of any session in the org
    path('sessions/<uuid:pk>/admin-revoke/', AdminRevokeSessionView.as_view(), name='session-admin-revoke'),

    # Organisation
    path('organisation/',              OrganisationView.as_view(),     name='organisation'),

    # Branches
    path('branches/',                  BranchListView.as_view(),       name='branch-list'),
    path('branches/<uuid:pk>/',        BranchDetailView.as_view(),     name='branch-detail'),

    # Departments
    path('departments/',               DepartmentListView.as_view(),   name='department-list'),
    path('departments/<uuid:pk>/',     DepartmentDetailView.as_view(), name='department-detail'),

    # Audit log
    path('audit-log/',                 AuditLogView.as_view(),         name='audit-log'),
]