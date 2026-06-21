from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FeedbackTicketViewSet

router = DefaultRouter()
router.register(r"", FeedbackTicketViewSet, basename="feedback")

urlpatterns = [
    path("", include(router.urls)),
]