from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.tasks.models import Evaluation, EvaluationTemplate
from .serializers import (
    EvaluationCreateSerializer,
    EvaluationListSerializer,
    EvaluationTemplateSerializer,
    EvaluationUpdateSerializer,
)

EVALUATOR_ROLES = {
    "supervisor",
    "department_leader",
    "hr_officer",
    "system_admin",
    "broadcast_admin",
}


class EvaluationTemplateViewSet(ModelViewSet):
    """CRUD for evaluation templates — evaluators only."""

    serializer_class = EvaluationTemplateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return EvaluationTemplate.objects.filter(
            organisation=self.request.user.organisation,
            is_active=True,
        )

    def perform_create(self, serializer):
        serializer.save(organisation=self.request.user.organisation)

    def _is_evaluator(self):
        return getattr(self.request.user, "role", None) in EVALUATOR_ROLES

    def create(self, request, *args, **kwargs):
        if not self._is_evaluator():
            return Response(
                {"detail": "You do not have permission to create templates."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().create(request, *args, **kwargs)


class EvaluationViewSet(ModelViewSet):
    """
    /evaluations/               — list + create
    /evaluations/<id>/          — retrieve + patch
    /evaluations/<id>/submit/   — finalise and compute percentage
    """

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Evaluation.objects.select_related(
            "template", "evaluator", "attachee"
        ).filter(organisation=user.organisation)

        if getattr(user, "role", None) in EVALUATOR_ROLES:
            return qs
        # Regular users (attachees) see only their own evaluations
        return qs.filter(attachee=user)

    def get_serializer_class(self):
        if self.action == "create":
            return EvaluationCreateSerializer
        if self.action in ("update", "partial_update"):
            return EvaluationUpdateSerializer
        return EvaluationListSerializer

    def _is_evaluator(self):
        return getattr(self.request.user, "role", None) in EVALUATOR_ROLES

    def create(self, request, *args, **kwargs):
        if not self._is_evaluator():
            return Response(
                {"detail": "You do not have permission to create evaluations."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        evaluation = serializer.save()
        output = EvaluationListSerializer(evaluation, context={"request": request})
        return Response(output.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        if not self._is_evaluator():
            return Response(
                {"detail": "You do not have permission to update evaluations."},
                status=status.HTTP_403_FORBIDDEN,
            )
        kwargs["partial"] = True
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        """Finalise an evaluation: compute percentage and mark completed."""
        if not self._is_evaluator():
            return Response(
                {"detail": "You do not have permission to submit evaluations."},
                status=status.HTTP_403_FORBIDDEN,
            )
        evaluation = self.get_object()
        if evaluation.status == "completed":
            return Response(
                {"detail": "Evaluation is already completed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for field in (
            "scores",
            "overall_feedback",
            "strengths",
            "areas_for_improvement",
            "recommendation",
        ):
            if field in request.data:
                setattr(evaluation, field, request.data[field])

        # Compute percentage from template criteria and scores
        pct = self._compute_percentage(evaluation)
        if pct is not None:
            evaluation.percentage = pct

        evaluation.status = "completed"
        evaluation.completed_at = timezone.now()
        evaluation.save()

        serializer = EvaluationListSerializer(evaluation, context={"request": request})
        return Response(serializer.data)

    @staticmethod
    def _compute_percentage(evaluation):
        criteria = getattr(evaluation.template, "criteria", None)
        scores = evaluation.scores
        if not criteria or not scores:
            return None
        total_weighted = sum(
            scores.get(c["criterion"], 0) * c.get("weight", 1) for c in criteria
        )
        max_weighted = sum(
            c.get("max_score", 10) * c.get("weight", 1) for c in criteria
        )
        if max_weighted == 0:
            return None
        return round((total_weighted / max_weighted) * 100, 2)
    