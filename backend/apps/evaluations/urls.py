from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import EvaluationTemplateViewSet, EvaluationViewSet

router = DefaultRouter()
router.register(r"templates", EvaluationTemplateViewSet, basename="evaluation-template")
router.register(r"", EvaluationViewSet, basename="evaluation")

urlpatterns = [
    path("", include(router.urls)),
]