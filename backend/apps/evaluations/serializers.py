from rest_framework import serializers
from apps.tasks.models import Evaluation, EvaluationTemplate


class EvaluationTemplateSerializer(serializers.ModelSerializer):
    class Meta:  # type: ignore
        model = EvaluationTemplate
        fields = [
            "id",
            "name",
            "evaluation_type",
            "criteria",
            "is_active",
        ]
        read_only_fields = ["id"]


class EvaluationListSerializer(serializers.ModelSerializer):
    template = EvaluationTemplateSerializer(read_only=True)
    evaluator_name = serializers.CharField(source="evaluator.full_name", read_only=True)
    evaluatee_name = serializers.CharField(source="attachee.full_name", read_only=True)
    # Hoist evaluation_type to the top level so the badge always has it,
    # even if the frontend reads ev.template.evaluation_type
    evaluation_type = serializers.CharField(
        source="template.evaluation_type", read_only=True, default=None
    )

    class Meta:  # type: ignore
        model = Evaluation
        fields = [
            "id",
            "template",
            "evaluation_type",   # top-level convenience field
            "status",
            "period_start",
            "period_end",
            "scores",
            "total_score",
            "percentage",
            "overall_feedback",
            "strengths",
            "areas_for_improvement",
            "recommendation",
            "evaluator_name",
            "evaluatee_name",
            "attachee_acknowledged",
            "attachee_comments",
            "completed_at",
            "created_at",
        ]
        read_only_fields = [
            "id", "evaluator_name", "evaluatee_name",
            "evaluation_type", "created_at",
        ]


class EvaluationCreateSerializer(serializers.ModelSerializer):
    """Used for POST /evaluations/ — evaluators only."""

    class Meta:  # type: ignore
        model = Evaluation
        fields = [
            "id",
            "template",
            "attachee",
            "period_start",
            "period_end",
            "scores",
            "overall_feedback",
            "strengths",
            "areas_for_improvement",
            "recommendation",
        ]
        read_only_fields = ["id"]

    def create(self, validated_data):
        request = self.context.get("request")
        return Evaluation.objects.create(
            evaluator=request.user,
            organisation=request.user.organisation,
            status="pending",
            **validated_data,
        )


class EvaluationUpdateSerializer(serializers.ModelSerializer):
    class Meta:  # type: ignore
        model = Evaluation
        fields = [
            "scores",
            "overall_feedback",
            "strengths",
            "areas_for_improvement",
            "recommendation",
            "status",
            "attachee_acknowledged",
            "attachee_comments",
        ]