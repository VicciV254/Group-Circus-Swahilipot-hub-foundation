from django.urls import path
from .views import (
    WifiGrantListCreateView,
    WifiGrantDetailView,
    WifiGrantApproveView,
    WifiGrantRevokeView,
    WifiActiveGrantsView,
)

urlpatterns = [
    path('',                   WifiGrantListCreateView.as_view()),
    path('active/',            WifiActiveGrantsView.as_view()),
    path('<uuid:pk>/',         WifiGrantDetailView.as_view()),
    path('<uuid:pk>/approve/', WifiGrantApproveView.as_view()),
    path('<uuid:pk>/revoke/',  WifiGrantRevokeView.as_view()),
]