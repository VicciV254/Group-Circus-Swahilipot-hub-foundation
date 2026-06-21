"""Nexus Core — Middleware, Pagination, Exceptions, Permissions"""
import json
import time
import logging
from django.utils import timezone
from django.http import JsonResponse
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import exception_handler
from rest_framework import permissions, status

logger = logging.getLogger('Nexus')


# ── Pagination ────────────────────────────────────────────────────────────────
class StandardResultsPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 200

    def get_paginated_response(self, data):
        return Response({
            'count':    self.page.paginator.count,
            'total_pages': self.page.paginator.num_pages,
            'next':     self.get_next_link(),
            'previous': self.get_previous_link(),
            'results':  data,
        })


class LargePagination(PageNumberPagination):
    page_size = 100
    max_page_size = 1000


# ── Custom Exception Handler ──────────────────────────────────────────────────
def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None:
        response.data = {
            'error': True,
            'status_code': response.status_code,
            'detail': response.data.get('detail', response.data) if isinstance(response.data, dict) else response.data,
            'timestamp': timezone.now().isoformat(),
        }
    return response


# ── Audit Log Middleware ───────────────────────────────────────────────────────
class AuditLogMiddleware:
    """Log all write operations to the immutable audit log"""
    LOGGED_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start_time = time.time()
        response = self.get_response(request)
        duration_ms = int((time.time() - start_time) * 1000)

        if (request.method in self.LOGGED_METHODS
                and request.path.startswith('/api/')
                and hasattr(request, 'user')
                and request.user.is_authenticated
                and response.status_code < 500):
            try:
                from core.models import AuditLog
                body = {}
                if request.content_type and 'json' in request.content_type:
                    try:
                        body = json.loads(request.body.decode('utf-8'))
                        # Scrub sensitive fields
                        for k in ('password', 'token', 'secret', 'mfa_secret', 'licence_key'):
                            body.pop(k, None)
                    except Exception:
                        pass

                AuditLog.objects.create(
                    user=request.user,
                    action=request.method,
                    resource_type=request.path.split('/')[3] if len(request.path.split('/')) > 3 else 'unknown',
                    resource_id=request.path.split('/')[-2] if request.path.split('/')[-1] == '' else request.path.split('/')[-1],
                    new_value=body or None,
                    ip_address=self._get_client_ip(request),
                    user_agent=request.META.get('HTTP_USER_AGENT', '')[:200],
                    extra={'duration_ms': duration_ms, 'status_code': response.status_code},
                )
            except Exception as e:
                logger.error(f"Audit log failed: {e}")

        return response

    def _get_client_ip(self, request):
        xff = request.META.get('HTTP_X_FORWARDED_FOR')
        if xff:
            return xff.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')


# ── Rate Limit Middleware ─────────────────────────────────────────────────────
class RateLimitMiddleware:
    """Simple Redis-backed rate limiting for login endpoint"""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == '/api/v1/auth/login/' and request.method == 'POST':
            ip = request.META.get('REMOTE_ADDR', 'unknown')
            try:
                from django.core.cache import cache
                key = f'login_attempts:{ip}'
                attempts = cache.get(key, 0)
                if attempts >= 10:
                    return JsonResponse(
                        {'detail': 'Too many login attempts. Try again in 15 minutes.'},
                        status=429
                    )
                cache.set(key, attempts + 1, timeout=900)  # 15 min window
            except Exception:
                pass
        return self.get_response(request)


# ── Permissions ───────────────────────────────────────────────────────────────
class IsSystemAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'system_admin'


class IsHROrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            'hr_officer', 'system_admin', 'executive'
        )


class IsSupervisorOrAbove(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            'supervisor', 'department_leader', 'hr_officer',
            'system_admin', 'executive', 'data_analyst'
        )


class IsBroadcastAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            'broadcast_admin', 'system_admin'
        )


class IsBroadcastStaff(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            'broadcast_admin', 'broadcast_staff', 'system_admin',
            'station_engineer', 'editor'
        )


class SameOrganisationOnly(permissions.BasePermission):
    """Ensures users can only access data within their own organisation"""
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
        org_field = getattr(obj, 'organisation_id', None) or getattr(obj, 'organisation', None)
        if org_field is None:
            # Try to traverse relationship
            if hasattr(obj, 'user'):
                return obj.user.organisation_id == request.user.organisation_id
            return True
        if hasattr(org_field, 'id'):
            return org_field.id == request.user.organisation_id
        return org_field == request.user.organisation_id


class ReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.method in permissions.SAFE_METHODS
