"""Nexus News & Radio — Category, Frequency, Show, Seat Views
Production-level views with full permission checks, filtering, and serialization.
"""
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied

from .models import (
    NewsCategory,
    RadioFrequency,
    RadioShow,
    RadioSlot,
    RadioSlotSerializer,
    SeatRequest,
    SeatAllocation,
    SoftwareSubscription,
    SoftwareSubscriptionSerializer,
)

EDITOR_ROLES = ('editor', 'broadcast_admin', 'broadcast_staff')
ADMIN_ROLES  = ('broadcast_admin', 'ict', 'system_admin')


# ═══════════════════════════════════════════════════════════════
# NEWS CATEGORIES
# ═══════════════════════════════════════════════════════════════

class NewsCategorySerializer(serializers.ModelSerializer):
    story_count = serializers.SerializerMethodField()

    class Meta:  # type: ignore
        model = NewsCategory
        fields = [
            'id', 'name', 'slug', 'colour', 'description',
            'broadcast_deadline_hour', 'is_active', 'sort_order',
            'story_count', 'created_at',
        ]
        read_only_fields = ['slug', 'organisation', 'created_at']

    def get_story_count(self, obj):
        return obj.stories.filter(status__in=['published', 'approved']).count()


class NewsCategoryView(generics.ListCreateAPIView):
    """List all active categories or create a new one (editors only)."""
    serializer_class = NewsCategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = NewsCategory.objects.filter(organisation=self.request.user.organisation)
        if self.request.query_params.get('active_only', '').lower() == 'true':
            qs = qs.filter(is_active=True)
        return qs.order_by('sort_order', 'name')

    def perform_create(self, serializer):
        if self.request.user.role not in EDITOR_ROLES + ADMIN_ROLES:
            raise PermissionDenied('Only editors can manage categories.')
        serializer.save(organisation=self.request.user.organisation)


class NewsCategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update or delete a single news category."""
    serializer_class = NewsCategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return NewsCategory.objects.filter(organisation=self.request.user.organisation)

    def perform_update(self, serializer):
        if self.request.user.role not in EDITOR_ROLES + ADMIN_ROLES:
            raise PermissionDenied('Only editors can update categories.')
        serializer.save()

    def perform_destroy(self, instance):
        if self.request.user.role not in ADMIN_ROLES:
            raise PermissionDenied('Only admins can delete categories.')
        if instance.stories.exists():
            raise PermissionDenied(
                'Cannot delete a category that has stories. Deactivate it instead.'
            )
        instance.delete()


class ReorderCategoriesView(APIView):
    """Bulk reorder categories via drag-and-drop sort_order update."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in EDITOR_ROLES + ADMIN_ROLES:
            raise PermissionDenied('Only editors can reorder categories.')

        items = request.data.get('order', [])  # [{id, sort_order}, ...]
        if not items:
            return Response({'detail': 'order list is required.'}, status=400)

        updated = 0
        for item in items:
            rows = NewsCategory.objects.filter(
                id=item.get('id'),
                organisation=request.user.organisation,
            ).update(sort_order=item.get('sort_order', 0))
            updated += rows

        return Response({'updated': updated})


# ═══════════════════════════════════════════════════════════════
# RADIO — FREQUENCIES
# ═══════════════════════════════════════════════════════════════

class RadioFrequencySerializer(serializers.ModelSerializer):
    slot_count = serializers.SerializerMethodField()

    class Meta:  # type: ignore
        model = RadioFrequency
        fields = [
            'id', 'name', 'frequency_mhz', 'description',
            'is_active', 'colour', 'stream_url', 'slot_count', 'created_at',
        ]
        read_only_fields = ['organisation', 'created_at']

    def get_slot_count(self, obj):
        return obj.slots.filter(
            status__in=['scheduled', 'live'],
            start_datetime__gte=timezone.now(),
        ).count()


class RadioFrequencyView(generics.ListCreateAPIView):
    serializer_class = RadioFrequencySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = RadioFrequency.objects.filter(organisation=self.request.user.organisation)
        if self.request.query_params.get('active_only', 'true').lower() == 'true':
            qs = qs.filter(is_active=True)
        return qs.order_by('name')

    def perform_create(self, serializer):
        if self.request.user.role not in ADMIN_ROLES:
            raise PermissionDenied('Only admins can add radio frequencies.')
        serializer.save(organisation=self.request.user.organisation)


class RadioFrequencyDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = RadioFrequencySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return RadioFrequency.objects.filter(organisation=self.request.user.organisation)

    def perform_update(self, serializer):
        if self.request.user.role not in ADMIN_ROLES:
            raise PermissionDenied('Only admins can update frequencies.')
        serializer.save()

    def perform_destroy(self, instance):
        if self.request.user.role not in ADMIN_ROLES:
            raise PermissionDenied('Only admins can delete frequencies.')
        if instance.slots.filter(status__in=['scheduled', 'live']).exists():
            raise PermissionDenied(
                'Cannot delete a frequency with active or scheduled slots.'
            )
        instance.delete()


# ═══════════════════════════════════════════════════════════════
# RADIO — SHOWS
# ═══════════════════════════════════════════════════════════════

class RadioShowSerializer(serializers.ModelSerializer):
    default_presenter_name = serializers.CharField(
        source='default_presenter.full_name', read_only=True
    )
    upcoming_slots_count = serializers.SerializerMethodField()

    class Meta:  # type: ignore
        model = RadioShow
        fields = [
            'id', 'name', 'show_type', 'description', 'default_presenter',
            'default_presenter_name', 'colour', 'cover_image', 'is_active',
            'default_duration_minutes', 'upcoming_slots_count', 'created_at',
        ]
        read_only_fields = ['organisation', 'created_at']

    def get_upcoming_slots_count(self, obj):
        return obj.slots.filter(
            start_datetime__gte=timezone.now(),
            status='scheduled',
        ).count()


class RadioShowView(generics.ListCreateAPIView):
    serializer_class = RadioShowSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = RadioShow.objects.filter(
            organisation=self.request.user.organisation
        ).select_related('default_presenter')
        p = self.request.query_params
        if show_type := p.get('show_type'):
            qs = qs.filter(show_type=show_type)
        if p.get('active_only', '').lower() == 'true':
            qs = qs.filter(is_active=True)
        return qs.order_by('name')

    def perform_create(self, serializer):
        if self.request.user.role not in EDITOR_ROLES + ADMIN_ROLES:
            raise PermissionDenied('Only editors can create radio shows.')
        serializer.save(organisation=self.request.user.organisation)


class RadioShowDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = RadioShowSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return RadioShow.objects.filter(
            organisation=self.request.user.organisation
        ).select_related('default_presenter')

    def perform_update(self, serializer):
        if self.request.user.role not in EDITOR_ROLES + ADMIN_ROLES:
            raise PermissionDenied('Only editors can update radio shows.')
        serializer.save()

    def perform_destroy(self, instance):
        if self.request.user.role not in ADMIN_ROLES:
            raise PermissionDenied('Only admins can delete radio shows.')
        if instance.slots.filter(status__in=['scheduled', 'live']).exists():
            raise PermissionDenied(
                'Cannot delete a show with active or upcoming slots. Cancel slots first.'
            )
        instance.delete()


# ═══════════════════════════════════════════════════════════════
# RADIO — MY SCHEDULE (Presenter view)
# ═══════════════════════════════════════════════════════════════

class RadioMyScheduleView(generics.ListAPIView):
    """Returns upcoming slots assigned to the authenticated presenter."""
    serializer_class = RadioSlotSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        from django.db.models import Q
        user = self.request.user
        return (
            RadioSlot.objects
            .filter(
                Q(presenter=user) | Q(co_presenter=user),
                start_datetime__gte=timezone.now(),
            )
            .select_related('show', 'frequency', 'presenter', 'co_presenter')
            .order_by('start_datetime')
        )


class RadioScheduleConflictCheckView(APIView):
    """
    Check for scheduling conflicts before creating a slot.
    POST { frequency, start_datetime, end_datetime, exclude_id? }
    Returns { has_conflict, conflicts: [...] }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        freq_id = request.data.get('frequency')
        start = request.data.get('start_datetime')
        end = request.data.get('end_datetime')
        exclude_id = request.data.get('exclude_id')

        if not all([freq_id, start, end]):
            return Response(
                {'detail': 'frequency, start_datetime, and end_datetime are required.'},
                status=400,
            )

        qs = RadioSlot.objects.filter(
            frequency__id=freq_id,
            organisation=request.user.organisation,
            status__in=['scheduled', 'live'],
            start_datetime__lt=end,
            end_datetime__gt=start,
        ).select_related('show', 'presenter')

        if exclude_id:
            qs = qs.exclude(id=exclude_id)

        conflicts = RadioSlotSerializer(qs, many=True).data
        return Response({'has_conflict': bool(conflicts), 'conflicts': conflicts})


# ═══════════════════════════════════════════════════════════════
# SOFTWARE SUBSCRIPTIONS — SEAT REQUESTS
# ═══════════════════════════════════════════════════════════════

class SeatRequestSerializer(serializers.ModelSerializer):
    requested_by_name  = serializers.CharField(source='requested_by.full_name', read_only=True)
    requested_by_email = serializers.CharField(source='requested_by.email', read_only=True)
    requested_by_role  = serializers.CharField(source='requested_by.role', read_only=True)
    subscription_name  = serializers.CharField(source='subscription.software_name', read_only=True)
    subscription_status = serializers.CharField(source='subscription.status', read_only=True)
    reviewed_by_name   = serializers.CharField(source='reviewed_by.full_name', read_only=True)

    class Meta:  # type: ignore
        model = SeatRequest
        fields = [
            'id', 'subscription', 'subscription_name', 'subscription_status',
            'requested_by', 'requested_by_name', 'requested_by_email', 'requested_by_role',
            'purpose', 'status', 'reviewed_by', 'reviewed_by_name', 'reviewed_at',
            'rejection_reason', 'created_at',
        ]
        read_only_fields = ['requested_by', 'status', 'reviewed_by', 'reviewed_at']


class SeatRequestListView(generics.ListAPIView):
    """
    Admins see all seat requests for their org.
    Regular users see only their own.
    Filterable by status and subscription.
    """
    serializer_class = SeatRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ADMIN_ROLES:
            qs = SeatRequest.objects.filter(
                subscription__organisation=user.organisation
            ).select_related('requested_by', 'subscription', 'reviewed_by')
        else:
            qs = SeatRequest.objects.filter(
                requested_by=user
            ).select_related('subscription', 'reviewed_by')

        p = self.request.query_params
        if req_status := p.get('status'):
            qs = qs.filter(status=req_status)
        if sub_id := p.get('subscription'):
            qs = qs.filter(subscription__id=sub_id)

        return qs.order_by('-created_at')


class SeatAllocationSerializer(serializers.ModelSerializer):
    user_name  = serializers.CharField(source='user.full_name', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)
    user_role  = serializers.CharField(source='user.role', read_only=True)
    allocated_by_name = serializers.CharField(source='allocated_by.full_name', read_only=True)
    revoked_by_name   = serializers.CharField(source='revoked_by.full_name', read_only=True)
    subscription_name = serializers.CharField(source='subscription.software_name', read_only=True)

    class Meta:  # type: ignore
        model = SeatAllocation
        fields = [
            'id', 'subscription', 'subscription_name',
            'user', 'user_name', 'user_email', 'user_role',
            'allocated_by', 'allocated_by_name', 'allocated_at',
            'is_active', 'revoked_at', 'revoked_by', 'revoked_by_name', 'notes',
        ]
        read_only_fields = [
            'allocated_by', 'allocated_at', 'revoked_at', 'revoked_by',
        ]


class SeatAllocationListView(generics.ListAPIView):
    """List all active seat allocations for the organisation (admins only)."""
    serializer_class = SeatAllocationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role not in ADMIN_ROLES:
            # Regular users see their own allocations only
            return SeatAllocation.objects.filter(
                user=user, is_active=True
            ).select_related('subscription', 'allocated_by')

        qs = SeatAllocation.objects.filter(
            subscription__organisation=user.organisation
        ).select_related('user', 'subscription', 'allocated_by', 'revoked_by')

        p = self.request.query_params
        if sub_id := p.get('subscription'):
            qs = qs.filter(subscription__id=sub_id)
        if active := p.get('is_active'):
            qs = qs.filter(is_active=active.lower() == 'true')

        return qs.order_by('subscription__software_name', 'user__full_name')


# ═══════════════════════════════════════════════════════════════
# DASHBOARD / ANALYTICS SUMMARY VIEWS
# ═══════════════════════════════════════════════════════════════

class NewsDashboardSummaryView(APIView):
    """
    Returns aggregate stats for the News CMS dashboard header.
    Editors see org-wide counts; journalists see their own.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import NewsStory
        user = request.user

        base_qs = NewsStory.objects.filter(organisation=user.organisation)
        if user.role not in EDITOR_ROLES + ADMIN_ROLES:
            base_qs = base_qs.filter(author=user)

        from django.db.models import Count
        counts = base_qs.values('status').annotate(n=Count('id'))
        by_status = {row['status']: row['n'] for row in counts}

        today_published = base_qs.filter(
            published_at__date=timezone.now().date()
        ).count()

        pending_review = (
            NewsStory.objects
            .filter(organisation=user.organisation, status='submitted')
            .count()
            if user.role in EDITOR_ROLES + ADMIN_ROLES else 0
        )

        upcoming_slots = (
            RadioSlot.objects
            .filter(
                organisation=user.organisation,
                start_datetime__gte=timezone.now(),
                status='scheduled',
            )
            .count()
        )

        expiring_subs = (
            SoftwareSubscription.objects
            .filter(organisation=user.organisation, status='expiring_soon')
            .count()
        )

        return Response({
            'stories_by_status': by_status,
            'today_published': today_published,
            'pending_review': pending_review,
            'upcoming_radio_slots': upcoming_slots,
            'expiring_subscriptions': expiring_subs,
        })
