from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from .models import ShootBooking, Footage
from .serializers import ShootBookingSerializer, FootageSerializer

ADMIN_ROLES = {'broadcast_admin', 'broadcast_staff', 'videographer', 'system_admin'}


def is_admin(user):
    return getattr(user, 'role', None) in ADMIN_ROLES


class ShootBookingViewSet(viewsets.ModelViewSet):
    """
    GET    /videography/          → list bookings
    POST   /videography/          → create booking
    GET    /videography/{pk}/     → retrieve booking
    PATCH  /videography/{pk}/     → update booking
    POST   /videography/{pk}/approve/  → approve or decline
    POST   /videography/{pk}/footage/  → upload footage file
    GET    /videography/footage/  → list all footage
    """
    serializer_class   = ShootBookingSerializer
    permission_classes = [IsAuthenticated]
    filter_backends    = [filters.SearchFilter, filters.OrderingFilter]
    search_fields      = ['title', 'requested_by__first_name', 'requested_by__last_name']
    ordering_fields    = ['created_at', 'shoot_date', 'status']

    def get_queryset(self):
        qs = ShootBooking.objects.select_related('requested_by').prefetch_related('equipment_list')
        # Non-admins only see their own bookings
        if not is_admin(self.request.user):
            qs = qs.filter(requested_by=self.request.user)
        return qs

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)

    # ── POST /videography/{pk}/approve/ ──────────────────────────────────────
    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        if not is_admin(request.user):
            return Response(
                {'detail': 'Permission denied.'},
                status=status.HTTP_403_FORBIDDEN
            )
        booking = get_object_or_404(ShootBooking, pk=pk)
        action_val = request.data.get('action')  # "approve" or "decline"

        if action_val == 'approve':
            booking.status = 'approved'
        elif action_val == 'decline':
            booking.status = 'declined'
        else:
            return Response(
                {'detail': 'action must be "approve" or "decline".'},
                status=status.HTTP_400_BAD_REQUEST
            )

        booking.admin_notes = request.data.get('admin_notes', booking.admin_notes)
        booking.save()
        return Response(ShootBookingSerializer(booking).data)

    # ── POST /videography/{pk}/footage/ ──────────────────────────────────────
    @action(detail=True, methods=['post'], url_path='footage')
    def upload_footage(self, request, pk=None):
        if not is_admin(request.user):
            return Response(
                {'detail': 'Permission denied.'},
                status=status.HTTP_403_FORBIDDEN
            )
        booking = get_object_or_404(ShootBooking, pk=pk)
        file = request.FILES.get('footage')
        if not file:
            return Response({'detail': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        footage = Footage.objects.create(
            booking=booking,
            uploaded_by=request.user,
            title=request.data.get('title', file.name),
            file=file,
        )
        return Response(FootageSerializer(footage).data, status=status.HTTP_201_CREATED)

    # ── GET /videography/footage/ ─────────────────────────────────────────────
    @action(detail=False, methods=['get'], url_path='footage')
    def footage_list(self, request):
        qs = Footage.objects.select_related('booking', 'uploaded_by').all()
        if not is_admin(request.user):
            qs = qs.filter(booking__requested_by=request.user)
        serializer = FootageSerializer(qs, many=True)
        return Response(serializer.data)
