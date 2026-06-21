from django.urls import path

# Views are defined inside models.py (alongside serializers).
# Import them from there until you do the full models/views/serializers split.
from .models import TaskListView, TaskDetailView, TaskSubmitView, TaskReviewView

urlpatterns = [
    path('',                   TaskListView.as_view()),
    path('<uuid:pk>/',         TaskDetailView.as_view()),
    path('<uuid:pk>/submit/',  TaskSubmitView.as_view()),
    path('<uuid:pk>/review/',  TaskReviewView.as_view()),
]