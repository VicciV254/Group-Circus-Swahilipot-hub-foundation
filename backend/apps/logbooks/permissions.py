"""
apps/logbooks/permissions.py

Fine-grained DRF permissions for the Logbooks module.
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS

SUPERVISOR_ROLES = {
    "supervisor",
    "department_leader",
    "hr_officer",
    "system_admin",
    "broadcast_admin",
}

# Subset of SUPERVISOR_ROLES allowed to create Programs and
# activate/deactivate Departments within a Cohort. Plain "supervisor"
# and "department_leader" can review logbooks but not administer the
# program structure itself.
PROGRAM_ADMIN_ROLES = {
    "hr_officer",
    "system_admin",
    "broadcast_admin",
}


class IsProgramAdmin(BasePermission):
    """Only program-admin-tier roles may create Programs or toggle Department activation."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in PROGRAM_ADMIN_ROLES
        )


class IsLogbookIntern(BasePermission):
    """The authenticated user is the intern who owns the logbook."""

    def has_object_permission(self, request, view, obj):
        from .models import Logbook, LogbookEntry
        if isinstance(obj, Logbook):
            return obj.intern == request.user
        if isinstance(obj, LogbookEntry):
            return obj.logbook.intern == request.user
        return False


class IsLogbookSupervisor(BasePermission):
    """The authenticated user is the assigned supervisor of the logbook."""

    def has_object_permission(self, request, view, obj):
        from .models import Logbook, LogbookEntry
        if isinstance(obj, Logbook):
            return obj.supervisor == request.user
        if isinstance(obj, LogbookEntry):
            return obj.logbook.supervisor == request.user
        return False


class CanViewLogbook(BasePermission):
    """
    Readable by:
      - the intern themselves
      - the assigned supervisor
      - any user with a supervisor-level role
    """

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        from .models import Logbook, LogbookEntry
        user = request.user
        if user.role in SUPERVISOR_ROLES:
            return True
        if isinstance(obj, Logbook):
            return obj.intern == user or obj.supervisor == user
        if isinstance(obj, LogbookEntry):
            return obj.logbook.intern == user or obj.logbook.supervisor == user
        return False


class CanEditEntry(BasePermission):
    """
    An entry can be edited by its intern only when:
      - it's in draft/rejected/revision_requested status, AND
      - it has not been permanently locked by a supervisor review, AND
      - it is today's entry (an attachee can only ever touch the entry
        for the current day — past entries are read-only to them even
        if technically still in an editable status).
    """

    def has_object_permission(self, request, view, obj):
        from datetime import date
        from .models import LogbookEntry
        user = request.user
        if request.method in SAFE_METHODS:
            return True
        if user.role in SUPERVISOR_ROLES:
            # supervisors can only write supervisor_comments / rating,
            # and only on an entry that hasn't already been reviewed.
            return not obj.locked
        if obj.locked:
            return False
        if obj.date != date.today():
            return False
        editable = {
            LogbookEntry.Status.DRAFT,
            LogbookEntry.Status.REJECTED,
            LogbookEntry.Status.REVISION_REQUESTED,
        }
        return obj.logbook.intern == user and obj.status in editable


class CanReviewEntry(BasePermission):
    """Only supervisor-role users can approve/reject/request revision."""

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and (
            request.user.role in SUPERVISOR_ROLES
        )
