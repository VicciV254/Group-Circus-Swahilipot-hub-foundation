"""Nexus Equipment — URL Configuration"""
from django.urls import path
from .models import (
    EquipmentInventoryView, EquipmentDetailView, RetireEquipmentView, ReactivateEquipmentView,
    CheckoutRequestListView, ApproveCheckoutView, ReturnEquipmentView,
    MaintenanceLogView, MaintenanceLogDetailView, ResolveMaintenanceView,
    EquipmentStatsView,
)
from .category_views import EquipmentCategoryView

urlpatterns = [
    path('',                              EquipmentInventoryView.as_view(),    name='equipment-list'),
    path('stats/',                        EquipmentStatsView.as_view(),        name='equipment-stats'),
    path('categories/',                   EquipmentCategoryView.as_view(),     name='equipment-categories'),
    path('<uuid:pk>/',                    EquipmentDetailView.as_view(),       name='equipment-detail'),
    path('<uuid:pk>/retire/',             RetireEquipmentView.as_view(),       name='equipment-retire'),
    path('<uuid:pk>/reactivate/',         ReactivateEquipmentView.as_view(),   name='equipment-reactivate'),
    path('checkout-requests/',            CheckoutRequestListView.as_view(),   name='checkout-list'),
    path('checkout-requests/<uuid:pk>/approve/', ApproveCheckoutView.as_view(), name='checkout-approve'),
    path('checkout-requests/<uuid:pk>/return/',  ReturnEquipmentView.as_view(),  name='checkout-return'),
    path('maintenance/',                  MaintenanceLogView.as_view(),        name='maintenance-list'),
    path('maintenance/<uuid:pk>/',        MaintenanceLogDetailView.as_view(),  name='maintenance-detail'),
    path('maintenance/<uuid:pk>/resolve/', ResolveMaintenanceView.as_view(),   name='maintenance-resolve'),
]
