"""Nexus Broadcast — News CMS, Radio Schedule, Software Subscriptions
Production-level models with full validation, version history, notifications,
editorial comments, publishing pipeline, and seat management.
"""
from __future__ import annotations

import uuid
from django.db import models
from django.db.models import Q
from django.utils import timezone
from django.utils.text import slugify
from django.core.exceptions import ValidationError
from rest_framework import serializers, generics, status, filters
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from core.models import TimeStampedModel


# ═══════════════════════════════════════════════════════════════
# NEWS CMS
# ═══════════════════════════════════════════════════════════════

class NewsCategory(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        'accounts.Organisation', on_delete=models.CASCADE, related_name='news_categories'
    )
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=100, blank=True)
    colour = models.CharField(max_length=7, default='#0EA5E9')
    description = models.TextField(blank=True)
    broadcast_deadline_hour = models.IntegerField(
        default=17, help_text='Hour of day (0-23) when stories are due'
    )
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)

    class Meta:  # type: ignore
        ordering = ['sort_order', 'name']
        unique_together = [['organisation', 'slug']]
        verbose_name_plural = 'News Categories'

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class NewsStory(TimeStampedModel):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted for Review'),
        ('under_review', 'Under Review'),
        ('changes_requested', 'Changes Requested'),
        ('approved', 'Approved'),
        ('published', 'Published'),
        ('rejected', 'Rejected'),
        ('archived', 'Archived'),
    ]

    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('normal', 'Normal'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        'accounts.Organisation', on_delete=models.CASCADE, related_name='news_stories'
    )
    author = models.ForeignKey(
        'accounts.User', on_delete=models.CASCADE, related_name='authored_stories'
    )
    editor = models.ForeignKey(
        'accounts.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='edited_stories'
    )
    category = models.ForeignKey(
        NewsCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='stories'
    )

    # Content
    title = models.CharField(max_length=300)
    subtitle = models.CharField(max_length=300, blank=True)
    body = models.TextField()
    summary = models.TextField(blank=True, help_text='Short summary for listings / broadcast tease')
    tags = models.JSONField(default=list, blank=True)
    sources = models.JSONField(default=list, blank=True, help_text='List of source references')
    featured_image = models.ImageField(upload_to='news/images/%Y/%m/', null=True, blank=True)
    featured_image_caption = models.CharField(max_length=300, blank=True)
    featured_image_credit = models.CharField(max_length=200, blank=True)
    attachments = models.JSONField(default=list, blank=True, help_text='List of attachment URLs')

    # Workflow
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='draft')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='normal')
    is_breaking = models.BooleanField(default=False)
    is_featured = models.BooleanField(default=False)

    # Publishing
    published_at = models.DateTimeField(null=True, blank=True)
    scheduled_publish_at = models.DateTimeField(
        null=True, blank=True, help_text='Schedule publish for a future time'
    )
    submission_deadline = models.DateTimeField(null=True, blank=True)
    broadcast_slot = models.ForeignKey(
        'RadioSlot', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='linked_stories'
    )
    expires_at = models.DateTimeField(null=True, blank=True, help_text='Auto-archive after this date')

    # SEO / meta
    seo_title = models.CharField(max_length=300, blank=True)
    seo_description = models.CharField(max_length=500, blank=True)

    # Stats
    view_count = models.IntegerField(default=0)
    word_count = models.IntegerField(default=0)
    read_time_minutes = models.IntegerField(default=0)

    # Rejection tracking
    rejection_reason = models.TextField(blank=True)
    changes_requested_note = models.TextField(blank=True)

    class Meta:  # type: ignore
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'organisation']),
            models.Index(fields=['published_at']),
            models.Index(fields=['author', 'status']),
            models.Index(fields=['is_breaking', 'status']),
            models.Index(fields=['scheduled_publish_at']),
        ]

    def __str__(self):
        return self.title

    def clean(self):
        if self.scheduled_publish_at and self.submission_deadline:
            if self.scheduled_publish_at < self.submission_deadline:
                raise ValidationError('Scheduled publish time must be after the submission deadline.')

    def save(self, *args, **kwargs):
        words = self.body.split()
        self.word_count = len(words)
        self.read_time_minutes = max(1, self.word_count // 200)
        if self.status == 'published' and not self.published_at:
            self.published_at = timezone.now()
        super().save(*args, **kwargs)

    def can_be_edited_by(self, user) -> bool:
        if user.role in ['editor', 'broadcast_admin']:
            return True
        return self.author == user and self.status in ('draft', 'changes_requested')

    def transition_to(self, new_status: str, user, comment: str = '') -> bool:
        """Validate and apply a status transition, creating version + comment."""
        ALLOWED_TRANSITIONS = {
            'draft': ['submitted', 'archived'],
            'submitted': ['under_review', 'changes_requested', 'rejected', 'approved', 'published'],
            'under_review': ['changes_requested', 'rejected', 'approved', 'published'],
            'changes_requested': ['submitted', 'archived'],
            'approved': ['published', 'archived'],
            'published': ['archived'],
            'rejected': ['draft'],
            'archived': ['draft'],
        }
        if new_status not in ALLOWED_TRANSITIONS.get(self.status, []):
            raise ValidationError(f'Cannot move story from {self.status} to {new_status}.')

        old_status = self.status
        self.status = new_status
        if new_status == 'under_review':
            self.editor = user
        self.save()

        if comment:
            EditorialComment.objects.create(
                story=self, author=user, comment=comment,
                action=new_status,
            )

        # Create version snapshot on publish
        if new_status == 'published':
            last_version = self.versions.order_by('-version_number').first()
            next_num = (last_version.version_number + 1) if last_version else 1
            NewsStoryVersion.objects.create(
                story=self, version_number=next_num,
                title=self.title, body=self.body,
                edited_by=user,
                change_summary=f'Published (from {old_status})',
            )
        return True


class NewsStoryVersion(TimeStampedModel):
    """Immutable version snapshot for a news story."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    story = models.ForeignKey(
        NewsStory, on_delete=models.CASCADE, related_name='versions'
    )
    version_number = models.IntegerField()
    title = models.CharField(max_length=300)
    body = models.TextField()
    edited_by = models.ForeignKey('accounts.User', on_delete=models.CASCADE)
    change_summary = models.TextField(blank=True)
    diff_snapshot = models.JSONField(
        default=dict, blank=True, help_text='Optional JSON diff for tracking changes'
    )

    class Meta:  # type: ignore
        ordering = ['-version_number']
        unique_together = [['story', 'version_number']]

    def __str__(self):
        return f"{self.story.title} — v{self.version_number}"


class EditorialComment(TimeStampedModel):
    """Threaded editorial comments / review notes on a story."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    story = models.ForeignKey(
        NewsStory, on_delete=models.CASCADE, related_name='editorial_comments'
    )
    author = models.ForeignKey('accounts.User', on_delete=models.CASCADE)
    comment = models.TextField()
    action = models.CharField(
        max_length=30, blank=True,
        help_text='Status transition that triggered this comment, if any'
    )
    is_resolved = models.BooleanField(default=False)
    resolved_by = models.ForeignKey(
        'accounts.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='resolved_comments'
    )
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:  # type: ignore
        ordering = ['created_at']

    def resolve(self, user):
        self.is_resolved = True
        self.resolved_by = user
        self.resolved_at = timezone.now()
        self.save()


# ═══════════════════════════════════════════════════════════════
# RADIO SCHEDULE
# ═══════════════════════════════════════════════════════════════

class RadioFrequency(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        'accounts.Organisation', on_delete=models.CASCADE, related_name='radio_frequencies'
    )
    name = models.CharField(max_length=100)
    frequency_mhz = models.CharField(max_length=20)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    colour = models.CharField(max_length=7, default='#6366F1')
    stream_url = models.URLField(blank=True, help_text='Live stream URL if available')

    class Meta:  # type: ignore
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.frequency_mhz} MHz)"


class RadioShow(TimeStampedModel):
    SHOW_TYPES = [
        ('news', 'News'),
        ('music', 'Music'),
        ('talk', 'Talk'),
        ('sport', 'Sport'),
        ('drama', 'Drama'),
        ('education', 'Education'),
        ('religious', 'Religious'),
        ('entertainment', 'Entertainment'),
        ('other', 'Other'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        'accounts.Organisation', on_delete=models.CASCADE, related_name='radio_shows'
    )
    name = models.CharField(max_length=200)
    show_type = models.CharField(max_length=30, choices=SHOW_TYPES)
    description = models.TextField(blank=True)
    default_presenter = models.ForeignKey(
        'accounts.User', null=True, blank=True, on_delete=models.SET_NULL
    )
    colour = models.CharField(max_length=7, default='#3B82F6')
    cover_image = models.ImageField(upload_to='radio/shows/', null=True, blank=True)
    is_active = models.BooleanField(default=True)
    default_duration_minutes = models.IntegerField(default=60)

    class Meta:  # type: ignore
        ordering = ['name']

    def __str__(self):
        return self.name


class RadioSlot(TimeStampedModel):
    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('live', 'Live'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
        ('no_show', 'No Show'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        'accounts.Organisation', on_delete=models.CASCADE, related_name='radio_slots'
    )
    frequency = models.ForeignKey(
        RadioFrequency, on_delete=models.CASCADE, related_name='slots'
    )
    show = models.ForeignKey(RadioShow, on_delete=models.CASCADE, related_name='slots')
    presenter = models.ForeignKey(
        'accounts.User', on_delete=models.CASCADE, related_name='radio_slots'
    )
    co_presenter = models.ForeignKey(
        'accounts.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='co_presenting_slots'
    )
    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')
    show_plan = models.TextField(
        blank=True, help_text='Topics, guests, content notes submitted by presenter'
    )
    show_plan_submitted_at = models.DateTimeField(null=True, blank=True)
    show_plan_approved = models.BooleanField(default=False)
    show_plan_approved_by = models.ForeignKey(
        'accounts.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='approved_show_plans'
    )
    guests = models.JSONField(default=list, blank=True, help_text='List of guest names/details')
    reminder_24h_sent = models.BooleanField(default=False)
    reminder_2h_sent = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    cancellation_reason = models.TextField(blank=True)
    recording_url = models.URLField(blank=True)

    class Meta:  # type: ignore
        ordering = ['start_datetime']
        indexes = [
            models.Index(fields=['start_datetime', 'frequency']),
            models.Index(fields=['presenter']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"{self.show.name} — {self.start_datetime.strftime('%Y-%m-%d %H:%M')}"

    def clean(self):
        if self.end_datetime and self.start_datetime:
            if self.end_datetime <= self.start_datetime:
                raise ValidationError('End time must be after start time.')

    def save(self, *args, **kwargs):
        # Conflict check (skip on update of same record)
        if not self.pk or self._state.adding:
            conflict = RadioSlot.objects.filter(
                frequency=self.frequency,
                status__in=['scheduled', 'live'],
                start_datetime__lt=self.end_datetime,
                end_datetime__gt=self.start_datetime,
            ).exclude(pk=self.pk).exists()
            if conflict:
                from rest_framework.exceptions import ValidationError as DRFValidationError
                raise DRFValidationError(
                    {'detail': 'This frequency already has a slot booked for the selected time.'}
                )
        super().save(*args, **kwargs)

    @property
    def duration_minutes(self):
        delta = self.end_datetime - self.start_datetime
        return int(delta.total_seconds() / 60)


# ═══════════════════════════════════════════════════════════════
# SOFTWARE SUBSCRIPTIONS
# ═══════════════════════════════════════════════════════════════

class SoftwareSubscription(TimeStampedModel):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('expired', 'Expired'),
        ('expiring_soon', 'Expiring Soon'),
        ('cancelled', 'Cancelled'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        'accounts.Organisation', on_delete=models.CASCADE,
        related_name='software_subscriptions'
    )
    software_name = models.CharField(max_length=200)
    vendor = models.CharField(max_length=200, blank=True)
    version = models.CharField(max_length=50, blank=True)
    description = models.TextField(blank=True)
    category = models.CharField(
        max_length=100, blank=True, help_text='e.g. Audio Editing, Broadcast, Productivity'
    )
    total_seats = models.IntegerField(default=1)
    expiry_date = models.DateField()
    renewal_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, default='KES')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    licence_key = models.TextField(blank=True)
    licence_file = models.FileField(upload_to='subscriptions/licences/', null=True, blank=True)
    notes = models.TextField(blank=True)
    support_contact = models.CharField(max_length=300, blank=True)
    support_url = models.URLField(blank=True)
    alert_30_sent = models.BooleanField(default=False)
    alert_7_sent = models.BooleanField(default=False)
    auto_renew = models.BooleanField(default=False)
    purchase_date = models.DateField(null=True, blank=True)
    purchase_order_ref = models.CharField(max_length=100, blank=True)

    class Meta:  # type: ignore
        ordering = ['expiry_date']

    def __str__(self):
        return f"{self.software_name} — expires {self.expiry_date}"

    @property
    def allocated_seats(self):
        return self.seat_allocations.filter(is_active=True).count()

    @property
    def available_seats(self):
        return max(0, self.total_seats - self.allocated_seats)

    @property
    def days_until_expiry(self):
        return (self.expiry_date - timezone.now().date()).days

    def update_status(self):
        days = self.days_until_expiry
        if days < 0:
            self.status = 'expired'
        elif days <= 30:
            self.status = 'expiring_soon'
        else:
            self.status = 'active'
        self.save(update_fields=['status'])


class SeatAllocation(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subscription = models.ForeignKey(
        SoftwareSubscription, on_delete=models.CASCADE, related_name='seat_allocations'
    )
    user = models.ForeignKey(
        'accounts.User', on_delete=models.CASCADE, related_name='software_seats'
    )
    allocated_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL,
        null=True, related_name='allocations_made'
    )
    allocated_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(
        'accounts.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='allocations_revoked'
    )
    notes = models.TextField(blank=True)

    class Meta:  # type: ignore
        unique_together = [['subscription', 'user']]

    def revoke(self, by_user):
        self.is_active = False
        self.revoked_at = timezone.now()
        self.revoked_by = by_user
        self.save()


class SeatRequest(TimeStampedModel):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('waitlisted', 'Waitlisted'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subscription = models.ForeignKey(
        SoftwareSubscription, on_delete=models.CASCADE, related_name='seat_requests'
    )
    requested_by = models.ForeignKey(
        'accounts.User', on_delete=models.CASCADE, related_name='seat_requests'
    )
    purpose = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    reviewed_by = models.ForeignKey(
        'accounts.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='seat_reviews'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    class Meta:  # type: ignore
        ordering = ['-created_at']


# ─── SERIALIZERS ─────────────────────────────────────────────────────────────

class NewsCategorySerializer(serializers.ModelSerializer):
    story_count = serializers.SerializerMethodField()

    class Meta:  # type: ignore
        model = NewsCategory
        fields = '__all__'
        read_only_fields = ['organisation', 'slug']

    def get_story_count(self, obj):
        return obj.stories.filter(status__in=['published', 'approved']).count()


class EditorialCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.full_name', read_only=True)
    author_role = serializers.CharField(source='author.role', read_only=True)

    class Meta:  # type: ignore
        model = EditorialComment
        fields = ['id', 'author_name', 'author_role', 'comment', 'action',
                  'is_resolved', 'resolved_at', 'created_at']
        read_only_fields = ['author', 'action']


class NewsStoryVersionSerializer(serializers.ModelSerializer):
    edited_by_name = serializers.CharField(source='edited_by.full_name', read_only=True)

    class Meta:  # type: ignore
        model = NewsStoryVersion
        fields = ['id', 'version_number', 'title', 'body',
                  'edited_by_name', 'change_summary', 'created_at']


class NewsStorySerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.full_name', read_only=True)
    author_avatar = serializers.SerializerMethodField()
    editor_name = serializers.CharField(source='editor.full_name', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_colour = serializers.CharField(source='category.colour', read_only=True)
    editorial_comments = EditorialCommentSerializer(many=True, read_only=True)
    versions = NewsStoryVersionSerializer(many=True, read_only=True)
    comment_count = serializers.SerializerMethodField()
    unresolved_comment_count = serializers.SerializerMethodField()

    class Meta:  # type: ignore
        model = NewsStory
        fields = '__all__'
        read_only_fields = [
            'author', 'word_count', 'view_count', 'read_time_minutes',
            'published_at', 'organisation',
        ]

    def get_author_avatar(self, obj):
        try:
            return obj.author.avatar.url if obj.author.avatar else None
        except Exception:
            return None

    def get_comment_count(self, obj):
        return obj.editorial_comments.count()

    def get_unresolved_comment_count(self, obj):
        return obj.editorial_comments.filter(is_resolved=False).count()


class RadioSlotSerializer(serializers.ModelSerializer):
    presenter_name = serializers.CharField(source='presenter.full_name', read_only=True)
    co_presenter_name = serializers.CharField(source='co_presenter.full_name', read_only=True)
    show_name = serializers.CharField(source='show.name', read_only=True)
    show_type = serializers.CharField(source='show.show_type', read_only=True)
    show_colour = serializers.CharField(source='show.colour', read_only=True)
    frequency_name = serializers.CharField(source='frequency.name', read_only=True)
    frequency_mhz = serializers.CharField(source='frequency.frequency_mhz', read_only=True)
    duration_minutes = serializers.ReadOnlyField()

    class Meta:  # type: ignore
        model = RadioSlot
        fields = '__all__'


class SoftwareSubscriptionSerializer(serializers.ModelSerializer):
    allocated_seats = serializers.ReadOnlyField()
    available_seats = serializers.ReadOnlyField()
    days_until_expiry = serializers.ReadOnlyField()
    seat_holders = serializers.SerializerMethodField()

    class Meta:  # type: ignore
        model = SoftwareSubscription
        exclude = ['licence_key']

    def get_seat_holders(self, obj):
        allocs = obj.seat_allocations.filter(is_active=True).select_related('user')
        return [
            {'id': str(a.user.id), 'name': a.user.full_name, 'email': a.user.email}
            for a in allocs
        ]


# ─── VIEWS ───────────────────────────────────────────────────────────────────

JOURNALIST_ROLES = ('journalist',)
EDITOR_ROLES = ('editor', 'broadcast_admin', 'broadcast_staff')
ADMIN_ROLES = ('broadcast_admin', 'ict', 'system_admin')


def _notify(user, title: str, message: str, notification_type: str):
    """Fire-and-forget notification — never raise."""
    try:
        from apps.notifications.services import NotificationService
        NotificationService.notify_user(user, title, message, notification_type)
    except Exception:
        pass


class NewsStoryListView(generics.ListCreateAPIView):
    serializer_class = NewsStorySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'subtitle', 'body', 'tags', 'author__full_name']
    ordering_fields = ['created_at', 'updated_at', 'published_at', 'word_count', 'priority']
    ordering = ['-created_at']

    def get_queryset(self):
        user = self.request.user
        qs = (
            NewsStory.objects
            .filter(organisation=user.organisation)
            .select_related('author', 'editor', 'category')
            .prefetch_related('editorial_comments', 'versions')
        )

        # Role-based filtering
        if user.role in JOURNALIST_ROLES:
            qs = qs.filter(author=user)
        elif user.role not in EDITOR_ROLES:
            qs = qs.filter(status='published')

        # Query param filters
        p = self.request.query_params
        if status_filter := p.get('status'):
            qs = qs.filter(status=status_filter)
        if category := p.get('category'):
            qs = qs.filter(category__slug=category)
        if author := p.get('author'):
            qs = qs.filter(author__id=author)
        if priority := p.get('priority'):
            qs = qs.filter(priority=priority)
        if breaking := p.get('is_breaking'):
            qs = qs.filter(is_breaking=breaking.lower() == 'true')
        if featured := p.get('is_featured'):
            qs = qs.filter(is_featured=featured.lower() == 'true')
        if tag := p.get('tag'):
            qs = qs.filter(tags__contains=tag)
        if date_from := p.get('date_from'):
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to := p.get('date_to'):
            qs = qs.filter(created_at__date__lte=date_to)

        return qs

    def perform_create(self, serializer):
        serializer.save(
            author=self.request.user,
            organisation=self.request.user.organisation,
        )


class NewsStoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = NewsStorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return (
            NewsStory.objects
            .filter(organisation=user.organisation)
            .select_related('author', 'editor', 'category')
            .prefetch_related('editorial_comments__author', 'versions__edited_by')
        )

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        # Increment view count atomically
        NewsStory.objects.filter(pk=instance.pk).update(view_count=models.F('view_count') + 1)
        instance.refresh_from_db(fields=['view_count'])
        return Response(self.get_serializer(instance).data)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if not instance.can_be_edited_by(request.user):
            raise PermissionDenied('You do not have permission to edit this story.')

        partial = kwargs.pop('partial', False)
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        old_status = instance.status
        updated = serializer.save()

        # Save version on meaningful body/title change
        if 'body' in request.data or 'title' in request.data:
            last = updated.versions.order_by('-version_number').first()
            next_num = (last.version_number + 1) if last else 1
            NewsStoryVersion.objects.create(
                story=updated,
                version_number=next_num,
                title=updated.title,
                body=updated.body,
                edited_by=request.user,
                change_summary=request.data.get('change_summary', 'Manual edit'),
            )

        return Response(serializer.data)

    def perform_destroy(self, instance):
        if instance.status == 'published':
            raise PermissionDenied('Published stories cannot be deleted — archive instead.')
        if instance.author != self.request.user and self.request.user.role not in EDITOR_ROLES:
            raise PermissionDenied('You do not have permission to delete this story.')
        instance.delete()


class NewsStoryReviewView(APIView):
    """Editor/admin review endpoint — approve, reject, request_changes, publish."""
    permission_classes = [IsAuthenticated]

    VALID_ACTIONS = {'approve', 'request_changes', 'reject', 'publish', 'archive', 'under_review'}

    def post(self, request, pk):
        if request.user.role not in EDITOR_ROLES:
            raise PermissionDenied('Only editors can review stories.')

        try:
            story = NewsStory.objects.select_related('author').get(
                pk=pk, organisation=request.user.organisation
            )
        except NewsStory.DoesNotExist:
            return Response({'detail': 'Story not found.'}, status=404)

        action = request.data.get('action', '').strip()
        comment = request.data.get('comment', '').strip()

        if action not in self.VALID_ACTIONS:
            return Response(
                {'detail': f"Invalid action. Choose from: {', '.join(self.VALID_ACTIONS)}"},
                status=400,
            )

        STATUS_MAP = {
            'approve': 'approved',
            'request_changes': 'changes_requested',
            'reject': 'rejected',
            'publish': 'published',
            'archive': 'archived',
            'under_review': 'under_review',
        }
        new_status = STATUS_MAP[action]

        try:
            story.transition_to(new_status, request.user, comment)
        except Exception as e:
            return Response({'detail': str(e)}, status=400)

        action_label = action.replace('_', ' ').title()
        _notify(
            story.author,
            f"Story {action_label} — {story.title}",
            comment or f"Your story has been {action_label.lower()}.",
            'story_review',
        )

        return Response(NewsStorySerializer(story).data)


class NewsStoryBulkActionView(APIView):
    """Bulk status transitions for editors."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in EDITOR_ROLES:
            raise PermissionDenied('Only editors can perform bulk actions.')

        story_ids = request.data.get('ids', [])
        action = request.data.get('action', '')

        if not story_ids or not action:
            return Response({'detail': 'ids and action are required.'}, status=400)

        stories = NewsStory.objects.filter(
            id__in=story_ids, organisation=request.user.organisation
        )
        updated = 0
        errors = []

        for story in stories:
            try:
                STATUS_MAP = {
                    'publish': 'published', 'archive': 'archived',
                    'approve': 'approved', 'reject': 'rejected',
                }
                story.transition_to(STATUS_MAP[action], request.user)
                updated += 1
            except Exception as e:
                errors.append({'id': str(story.id), 'error': str(e)})

        return Response({'updated': updated, 'errors': errors})


class EditorialCommentView(generics.ListCreateAPIView):
    """List and add editorial comments on a story."""
    serializer_class = EditorialCommentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return EditorialComment.objects.filter(
            story__id=self.kwargs['pk'],
            story__organisation=self.request.user.organisation,
        ).select_related('author')

    def perform_create(self, serializer):
        story = NewsStory.objects.get(
            pk=self.kwargs['pk'], organisation=self.request.user.organisation
        )
        serializer.save(author=self.request.user, story=story)
        _notify(
            story.author,
            f"New comment on your story — {story.title}",
            serializer.validated_data['comment'],
            'editorial_comment',
        )


class ResolveCommentView(APIView):
    """Resolve an editorial comment."""
    permission_classes = [IsAuthenticated]

    def post(self, request, comment_pk):
        try:
            comment = EditorialComment.objects.get(
                pk=comment_pk,
                story__organisation=request.user.organisation,
            )
        except EditorialComment.DoesNotExist:
            return Response({'detail': 'Comment not found.'}, status=404)

        comment.resolve(request.user)
        return Response({'status': 'resolved'})


class NewsStoryVersionListView(generics.ListAPIView):
    """Version history for a story."""
    serializer_class = NewsStoryVersionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return NewsStoryVersion.objects.filter(
            story__id=self.kwargs['pk'],
            story__organisation=self.request.user.organisation,
        ).select_related('edited_by')


# ─── RADIO ───────────────────────────────────────────────────────────────────

class RadioScheduleView(generics.ListCreateAPIView):
    serializer_class = RadioSlotSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = (
            RadioSlot.objects
            .filter(organisation=user.organisation)
            .select_related('presenter', 'co_presenter', 'show', 'frequency')
        )
        if user.role == 'presenter':
            qs = qs.filter(Q(presenter=user) | Q(co_presenter=user))

        p = self.request.query_params
        if start := p.get('start'):
            qs = qs.filter(start_datetime__gte=start)
        if end := p.get('end'):
            qs = qs.filter(end_datetime__lte=end)
        if freq := p.get('frequency'):
            qs = qs.filter(frequency__id=freq)
        if slot_status := p.get('status'):
            qs = qs.filter(status=slot_status)
        return qs

    def perform_create(self, serializer):
        serializer.save(organisation=self.request.user.organisation)


class RadioSlotDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = RadioSlotSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return RadioSlot.objects.filter(
            organisation=self.request.user.organisation
        ).select_related('presenter', 'co_presenter', 'show', 'frequency')


class SubmitShowPlanView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            slot = RadioSlot.objects.get(
                pk=pk,
                organisation=request.user.organisation,
            )
        except RadioSlot.DoesNotExist:
            return Response({'detail': 'Slot not found.'}, status=404)

        if slot.presenter != request.user and slot.co_presenter != request.user:
            if request.user.role not in EDITOR_ROLES:
                raise PermissionDenied('You are not assigned to this slot.')

        slot.show_plan = request.data.get('show_plan', '').strip()
        if not slot.show_plan:
            return Response({'detail': 'show_plan is required.'}, status=400)
        slot.show_plan_submitted_at = timezone.now()
        slot.show_plan_approved = False
        slot.save()
        return Response(RadioSlotSerializer(slot).data)


class ApproveShowPlanView(APIView):
    """Editor approves or rejects a submitted show plan."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.role not in EDITOR_ROLES:
            raise PermissionDenied('Only editors can approve show plans.')

        try:
            slot = RadioSlot.objects.select_related('presenter').get(
                pk=pk, organisation=request.user.organisation
            )
        except RadioSlot.DoesNotExist:
            return Response({'detail': 'Slot not found.'}, status=404)

        approved = request.data.get('approved', True)
        slot.show_plan_approved = approved
        slot.show_plan_approved_by = request.user
        slot.save()

        action = 'approved' if approved else 'rejected'
        _notify(
            slot.presenter,
            f"Show plan {action} — {slot.show.name}",
            request.data.get('comment', f'Your show plan has been {action}.'),
            'show_plan_review',
        )
        return Response(RadioSlotSerializer(slot).data)


# ─── SUBSCRIPTIONS ───────────────────────────────────────────────────────────

class SubscriptionListView(generics.ListCreateAPIView):
    serializer_class = SoftwareSubscriptionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = SoftwareSubscription.objects.filter(organisation=self.request.user.organisation)
        p = self.request.query_params
        if sub_status := p.get('status'):
            qs = qs.filter(status=sub_status)
        if expiring := p.get('expiring_days'):
            from datetime import timedelta
            cutoff = timezone.now().date() + timedelta(days=int(expiring))
            qs = qs.filter(expiry_date__lte=cutoff, status__in=['active', 'expiring_soon'])
        return qs

    def perform_create(self, serializer):
        if self.request.user.role not in ADMIN_ROLES:
            raise PermissionDenied('Only admins can add subscriptions.')
        serializer.save(organisation=self.request.user.organisation)


class SubscriptionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = SoftwareSubscriptionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return SoftwareSubscription.objects.filter(organisation=self.request.user.organisation)

    def perform_update(self, serializer):
        if self.request.user.role not in ADMIN_ROLES:
            raise PermissionDenied('Only admins can update subscriptions.')
        serializer.save()

    def perform_destroy(self, instance):
        if self.request.user.role not in ADMIN_ROLES:
            raise PermissionDenied('Only admins can delete subscriptions.')
        instance.delete()


class RevokeSeatView(APIView):
    """Admin revokes an active seat allocation."""
    permission_classes = [IsAuthenticated]

    def post(self, request, allocation_id):
        if request.user.role not in ADMIN_ROLES:
            raise PermissionDenied('Only admins can revoke seats.')
        try:
            alloc = SeatAllocation.objects.get(
                id=allocation_id,
                subscription__organisation=request.user.organisation,
                is_active=True,
            )
        except SeatAllocation.DoesNotExist:
            return Response({'detail': 'Allocation not found.'}, status=404)

        alloc.revoke(request.user)
        return Response({'status': 'revoked'})


class RequestSeatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, subscription_id):
        try:
            sub = SoftwareSubscription.objects.get(
                id=subscription_id, organisation=request.user.organisation
            )
        except SoftwareSubscription.DoesNotExist:
            return Response({'detail': 'Subscription not found.'}, status=404)

        if sub.status == 'expired':
            return Response({'detail': 'This subscription has expired.'}, status=400)

        # Prevent duplicate active requests
        existing = SeatRequest.objects.filter(
            subscription=sub, requested_by=request.user,
            status__in=['pending', 'waitlisted']
        ).first()
        if existing:
            return Response(
                {'detail': f'You already have a {existing.status} request for this subscription.'},
                status=400,
            )

        # Check if already allocated
        if SeatAllocation.objects.filter(
            subscription=sub, user=request.user, is_active=True
        ).exists():
            return Response({'detail': 'You already have an active seat.'}, status=400)

        req_status = 'waitlisted' if sub.available_seats <= 0 else 'pending'
        req = SeatRequest.objects.create(
            subscription=sub,
            requested_by=request.user,
            purpose=request.data.get('purpose', ''),
            status=req_status,
        )

        msg = (
            'No seats available — you have been added to the waitlist.'
            if req_status == 'waitlisted'
            else 'Seat request submitted for approval.'
        )
        return Response({'id': str(req.id), 'status': req_status, 'detail': msg}, status=201)


class AllocateSeatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id):
        if request.user.role not in ADMIN_ROLES:
            raise PermissionDenied('Only admins can allocate seats.')

        try:
            req = SeatRequest.objects.select_related(
                'subscription', 'requested_by'
            ).get(id=request_id, subscription__organisation=request.user.organisation)
        except SeatRequest.DoesNotExist:
            return Response({'detail': 'Request not found.'}, status=404)

        action = request.data.get('action', '')
        if action == 'approve':
            if req.subscription.available_seats <= 0:
                return Response({'detail': 'No seats available.'}, status=400)
            SeatAllocation.objects.get_or_create(
                subscription=req.subscription,
                user=req.requested_by,
                defaults={'allocated_by': request.user},
            )
            req.status = 'approved'
            _notify(
                req.requested_by,
                f"Seat approved — {req.subscription.software_name}",
                'Your seat request has been approved.',
                'seat_approved',
            )
        elif action == 'reject':
            req.status = 'rejected'
            req.rejection_reason = request.data.get('reason', '')
            _notify(
                req.requested_by,
                f"Seat request declined — {req.subscription.software_name}",
                req.rejection_reason or 'Your seat request was declined.',
                'seat_rejected',
            )
        else:
            return Response({'detail': "action must be 'approve' or 'reject'."}, status=400)

        req.reviewed_by = request.user
        req.reviewed_at = timezone.now()
        req.save()
        return Response({'status': req.status})
