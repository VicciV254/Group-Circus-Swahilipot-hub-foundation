"""Nexus FM Report — Permission classes"""
from rest_framework.permissions import BasePermission, SAFE_METHODS


ADMIN_ROLES = {'system_admin', 'broadcast_admin'}


class IsOrgMember(BasePermission):
    """User must belong to an organisation to touch any FM-report resource."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'organisation_id', None)
        )

    def has_object_permission(self, request, view, obj):
        org_id = getattr(obj, 'organisation_id', None) or getattr(
            getattr(obj, 'station', None), 'organisation_id', None
        )
        return org_id == request.user.organisation_id


class IsBroadcastAdminOrReadOnly(BasePermission):
    """Read access for any org member; writes restricted to admin roles."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return getattr(request.user, 'role', None) in ADMIN_ROLES


class IsBroadcastAdmin(BasePermission):
    """Strict: only admin roles may call this endpoint at all (e.g. trigger alert)."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'role', None) in ADMIN_ROLES
        )


class HasValidHeartbeatToken(BasePermission):
    """
    Transmitter hardware authenticates with a per-station shared secret token
    instead of a user session. Token is compared in the view against
    station.heartbeat_token, since the station isn't known until URL resolution;
    this permission only checks the header is present and well-formed.
    """

    def has_permission(self, request, view):
        token = request.headers.get('X-Heartbeat-Token', '')
        return bool(token) and len(token) >= 32


class IsOrgOwnerOrSystemAdmin(BasePermission):
    """Only the organisation owner or a system admin may change member roles."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (
                getattr(request.user, 'role', None) == 'system_admin'
                or getattr(request.user, 'is_org_owner', False)
            )
        )
    