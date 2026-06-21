# apps/evaluations/models.py
# This app reuses the EvaluationTemplate and Evaluation models that already
# live in apps.tasks.models. No new DB models are defined here — doing so
# would create duplicate reverse-accessor clashes on the User FK fields.
#
# Import them wherever needed inside this package:
#
#   from apps.tasks.models import Evaluation, EvaluationTemplate