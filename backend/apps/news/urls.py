"""Nexus News — URL Configuration (production-level)
All routes for News CMS, Radio Schedule, and Software Subscriptions.
"""
from django.urls import path

from .models import (
    NewsStoryListView,
    NewsStoryDetailView,
    NewsStoryReviewView,
    NewsStoryBulkActionView,
    EditorialCommentView,
    ResolveCommentView,
    NewsStoryVersionListView,
    RadioScheduleView,
    RadioSlotDetailView,
    SubmitShowPlanView,
    ApproveShowPlanView,
    SubscriptionListView,
    SubscriptionDetailView,
    RequestSeatView,
    AllocateSeatView,
    RevokeSeatView,
)
from .category_views import (
    NewsCategoryView,
    NewsCategoryDetailView,
    ReorderCategoriesView,
    RadioFrequencyView,
    RadioFrequencyDetailView,
    RadioShowView,
    RadioShowDetailView,
    RadioMyScheduleView,
    RadioScheduleConflictCheckView,
    SeatRequestListView,
    SeatAllocationListView,
    NewsDashboardSummaryView,
)

urlpatterns = [

    # ── Dashboard ─────────────────────────────────────────────
    path('dashboard/',
         NewsDashboardSummaryView.as_view(),
         name='news-dashboard'),

    # ── News Stories ──────────────────────────────────────────
    path('',
         NewsStoryListView.as_view(),
         name='news-list'),

    path('<uuid:pk>/',
         NewsStoryDetailView.as_view(),
         name='news-detail'),

    path('<uuid:pk>/review/',
         NewsStoryReviewView.as_view(),
         name='news-review'),

    path('bulk/',
         NewsStoryBulkActionView.as_view(),
         name='news-bulk-action'),

    # ── Editorial Comments ────────────────────────────────────
    path('<uuid:pk>/comments/',
         EditorialCommentView.as_view(),
         name='news-comments'),

    path('comments/<uuid:comment_pk>/resolve/',
         ResolveCommentView.as_view(),
         name='news-comment-resolve'),

    # ── Version History ───────────────────────────────────────
    path('<uuid:pk>/versions/',
         NewsStoryVersionListView.as_view(),
         name='news-versions'),

    # ── News Categories ───────────────────────────────────────
    path('categories/',
         NewsCategoryView.as_view(),
         name='news-categories'),

    path('categories/reorder/',
         ReorderCategoriesView.as_view(),
         name='news-categories-reorder'),

    path('categories/<uuid:pk>/',
         NewsCategoryDetailView.as_view(),
         name='news-category-detail'),

    # ── Radio Schedule ────────────────────────────────────────
    path('schedule/',
         RadioScheduleView.as_view(),
         name='radio-schedule'),

    path('schedule/conflict-check/',
         RadioScheduleConflictCheckView.as_view(),
         name='radio-conflict-check'),

    path('schedule/<uuid:pk>/',
         RadioSlotDetailView.as_view(),
         name='radio-slot-detail'),

    path('schedule/<uuid:pk>/show-plan/',
         SubmitShowPlanView.as_view(),
         name='radio-show-plan'),

    path('schedule/<uuid:pk>/show-plan/approve/',
         ApproveShowPlanView.as_view(),
         name='radio-show-plan-approve'),

    path('my-schedule/',
         RadioMyScheduleView.as_view(),
         name='radio-my-schedule'),

    # ── Radio Frequencies ─────────────────────────────────────
    path('frequencies/',
         RadioFrequencyView.as_view(),
         name='radio-frequencies'),

    path('frequencies/<uuid:pk>/',
         RadioFrequencyDetailView.as_view(),
         name='radio-frequency-detail'),

    # ── Radio Shows ───────────────────────────────────────────
    path('shows/',
         RadioShowView.as_view(),
         name='radio-shows'),

    path('shows/<uuid:pk>/',
         RadioShowDetailView.as_view(),
         name='radio-show-detail'),

    # ── Software Subscriptions ────────────────────────────────
    path('subscriptions/',
         SubscriptionListView.as_view(),
         name='subscription-list'),

    path('subscriptions/<uuid:pk>/',
         SubscriptionDetailView.as_view(),
         name='subscription-detail'),

    path('subscriptions/<uuid:subscription_id>/request/',
         RequestSeatView.as_view(),
         name='request-seat'),

    # ── Seat Requests ─────────────────────────────────────────
    path('subscriptions/seat-requests/',
         SeatRequestListView.as_view(),
         name='seat-requests'),

    path('subscriptions/seat-requests/<uuid:request_id>/allocate/',
         AllocateSeatView.as_view(),
         name='allocate-seat'),

    # ── Seat Allocations ──────────────────────────────────────
    path('subscriptions/allocations/',
         SeatAllocationListView.as_view(),
         name='seat-allocations'),

    path('subscriptions/allocations/<uuid:allocation_id>/revoke/',
         RevokeSeatView.as_view(),
         name='revoke-seat'),
]
