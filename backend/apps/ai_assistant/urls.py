# backend/apps/ai_assistant/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AIChatView, AIConversationViewSet

router = DefaultRouter()
router.register("conversations", AIConversationViewSet, basename="ai-conversations")

urlpatterns = [
    path("chat/",  AIChatView.as_view(), name="ai-chat"),
    path("",       include(router.urls)),
]
