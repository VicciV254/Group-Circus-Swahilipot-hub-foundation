"""
Enterprise Internship Management System
Projects App — Custom Permission Classes (RBAC)

Implements the Role-Based Access Control matrix defined in the system
specification §2:
  - Attachee:            own data only
  - Supervisor:           assigned attachees/staff only
  - Department Leader:    own department only
  - HR Officer:           all departments
  - System Administrator: full access
  - Data Analytics Team:  read-only cross-departmental
  - Executive Management: company-wide dashboards
"""

from rest_framework import permissions


class IsProjectMemberOrAdmin(permissions.BasePermission):
    """
    Allows access only to:
      - System administrators / staff
      - HR officers / executives (cross-department visibility)
      - The project owner or manager
      - Active project members
    """

    def has_object_permission(self, request, view, obj):
        user = request.user
        project = obj if hasattr(obj, 'members') else getattr(obj, 'project', None)
        if project is None:
            return False

        if user.is_staff or getattr(user, 'is_hr', False) or getattr(user, 'is_executive', False):
            return True

        if project.owner_id == user.id or project.manager_id == user.id:
            return True

        return project.members.filter(user=user, is_active=True).exists()


class IsProjectLeadOrManagerOrAdmin(permissions.BasePermission):
    """
    Restricts write access on sensitive sub-resources (budget, risk resolution,
    member management, archiving) to project leads, managers, or admins.
    """

    SAFE_ROLES = ('lead', 'supervisor')

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True

        user = request.user
        project = obj if hasattr(obj, 'members') else getattr(obj, 'project', None)
        if project is None:
            return False

        if user.is_staff or getattr(user, 'is_hr', False):
            return True

        if project.owner_id == user.id or project.manager_id == user.id:
            return True

        return project.members.filter(
            user=user, is_active=True, role__in=self.SAFE_ROLES
        ).exists()


class CanViewFinancials(permissions.BasePermission):
    """Restricts visibility of budget fields to roles with the can_view_financials permission."""

    def has_permission(self, request, view):
        user = request.user
        return (
            user.is_staff
            or getattr(user, 'is_hr', False)
            or getattr(user, 'is_executive', False)
            or user.has_perm('projects.can_view_financials')
        )


class IsTaskAssigneeOrReporterOrAdmin(permissions.BasePermission):
    """Allows task mutation only by assignees, the reporter, project leads, or admins."""

    def has_object_permission(self, request, view, obj):
        user = request.user
        if request.method in permissions.SAFE_METHODS:
            return True

        if user.is_staff or getattr(user, 'is_hr', False):
            return True

        if obj.reporter_id == user.id or obj.assignees.filter(pk=user.id).exists():
            return True

        return obj.project.members.filter(
            user=user, is_active=True, role__in=('lead', 'supervisor', 'reviewer')
        ).exists()
