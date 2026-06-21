from datetime import timedelta

from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import WifiGrant
from .serializers import WifiGrantSerializer

ADMIN_ROLES = {'ict', 'system_admin', 'broadcast_admin'}


def is_admin(user):
    return getattr(user, 'role', None) in ADMIN_ROLES


class WifiGrantListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Admins see all grants; regular users see only their own.
        """
        if is_admin(request.user):
            qs = WifiGrant.objects.select_related('requested_by', 'reviewed_by').all()
        else:
            qs = WifiGrant.objects.select_related('requested_by').filter(
                requested_by=request.user
            )
        serializer = WifiGrantSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        """
        Any authenticated user can submit a Wi-Fi access request.
        """
        serializer = WifiGrantSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        grant = serializer.save(
            requested_by=request.user,
            status=WifiGrant.STATUS_PENDING,
        )
        return Response(WifiGrantSerializer(grant).data, status=status.HTTP_201_CREATED)


class WifiGrantDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_grant(self, pk, user):
        grant = get_object_or_404(WifiGrant, pk=pk)
        # Non-admins can only see their own grants
        if not is_admin(user) and grant.requested_by != user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied
        return grant

    def get(self, request, pk):
        grant = self._get_grant(pk, request.user)
        return Response(WifiGrantSerializer(grant).data)

    def patch(self, request, pk):
        grant = self._get_grant(pk, request.user)
        serializer = WifiGrantSerializer(grant, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(WifiGrantSerializer(grant).data)

    def delete(self, request, pk):
        grant = self._get_grant(pk, request.user)
        grant.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WifiGrantApproveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_admin(request.user):
            return Response(
                {'detail': 'You do not have permission to approve Wi-Fi requests.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        action = request.data.get('action')
        if action not in ('approve', 'reject'):
            return Response(
                {'detail': "action must be 'approve' or 'reject'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        grant = get_object_or_404(WifiGrant, pk=pk)

        if grant.status != WifiGrant.STATUS_PENDING:
            return Response(
                {'detail': f"Cannot {action} a grant that is already '{grant.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if action == 'approve':
            grant.status = WifiGrant.STATUS_APPROVED
            grant.expires_at = timezone.now() + timedelta(days=grant.duration_days)
        else:
            grant.status = WifiGrant.STATUS_REJECTED

        grant.reviewed_by = request.user
        grant.reviewed_at = timezone.now()
        grant.save()

        return Response(WifiGrantSerializer(grant).data)


class WifiGrantRevokeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not is_admin(request.user):
            return Response(
                {'detail': 'You do not have permission to revoke Wi-Fi access.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        grant = get_object_or_404(WifiGrant, pk=pk)

        if grant.status != WifiGrant.STATUS_APPROVED:
            return Response(
                {'detail': f"Cannot revoke a grant that is '{grant.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        grant.status = WifiGrant.STATUS_REVOKED
        grant.reviewed_by = request.user
        grant.reviewed_at = timezone.now()
        grant.save()

        return Response(WifiGrantSerializer(grant).data)


class WifiActiveGrantsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = WifiGrant.objects.filter(
            status=WifiGrant.STATUS_APPROVED,
            expires_at__gt=timezone.now(),
        ).select_related('requested_by')
        return Response(WifiGrantSerializer(qs, many=True).data)