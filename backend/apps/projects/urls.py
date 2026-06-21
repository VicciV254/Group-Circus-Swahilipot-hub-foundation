"""
Enterprise Internship Management System
Projects App — URL Configuration
Production-Grade | DRF Nested Routers
"""

from django.urls import path, include
from rest_framework_nested import routers
from .views import (
    ProjectViewSet, ProjectMemberViewSet, KanbanBoardViewSet,
    KanbanColumnViewSet, SprintViewSet, MilestoneViewSet,
    TaskViewSet, RiskViewSet, ProjectDocumentViewSet, ProjectExpenseViewSet,
    ProjectMeetingViewSet, ProjectCommentViewSet,
    ChecklistItemView, ProjectDashboardView,
)

# ── Root router ───────────────────────────────────────────────────────────────
router = routers.DefaultRouter()
router.register(r'projects', ProjectViewSet, basename='project')

# ── Nested: /projects/{project_pk}/... ───────────────────────────────────────
projects_router = routers.NestedDefaultRouter(router, r'projects', lookup='project')
projects_router.register(r'members',   ProjectMemberViewSet,   basename='project-member')
projects_router.register(r'kanban',    KanbanBoardViewSet,     basename='project-kanban')
projects_router.register(r'sprints',   SprintViewSet,          basename='project-sprint')
projects_router.register(r'milestones',MilestoneViewSet,       basename='project-milestone')
projects_router.register(r'tasks',     TaskViewSet,            basename='project-task')
projects_router.register(r'risks',     RiskViewSet,            basename='project-risk')
projects_router.register(r'documents', ProjectDocumentViewSet, basename='project-document')
projects_router.register(r'expenses',  ProjectExpenseViewSet,  basename='project-expense')
projects_router.register(r'meetings',  ProjectMeetingViewSet,  basename='project-meeting')
projects_router.register(r'comments',  ProjectCommentViewSet,  basename='project-comment')

# ── Nested: /projects/{project_pk}/kanban/{board_pk}/columns/ ────────────────
kanban_router = routers.NestedDefaultRouter(projects_router, r'kanban', lookup='board')
kanban_router.register(r'columns', KanbanColumnViewSet, basename='kanban-column')

# ── Checklist item toggle ─────────────────────────────────────────────────────
checklist_item_url = path(
    'projects/<uuid:project_pk>/tasks/<uuid:task_pk>/checklists/<uuid:checklist_pk>/items/<uuid:item_pk>/',
    ChecklistItemView.as_view(),
    name='checklist-item-detail',
)

urlpatterns = [
    path('', include(router.urls)),
    path('', include(projects_router.urls)),
    path('', include(kanban_router.urls)),
    path('dashboard/', ProjectDashboardView.as_view(), name='project-dashboard'),
    checklist_item_url,
]

"""
Generated endpoints (sample):

GET    /projects/                                              — list all projects
POST   /projects/                                              — create project
GET    /projects/{id}/                                         — project detail
PATCH  /projects/{id}/                                         — update project
DELETE /projects/{id}/                                         — archive project
POST   /projects/{id}/restore/                                 — restore archived
POST   /projects/{id}/duplicate/                               — duplicate project
GET    /projects/{id}/analytics/                               — analytics
GET    /projects/{id}/gantt/                                   — gantt data
GET    /projects/{id}/kanban/                                  — kanban board
POST   /projects/{id}/kanban/move/                             — move task on kanban
GET    /projects/{id}/activity/                                — activity feed

GET    /projects/{id}/members/                                 — list members
POST   /projects/{id}/members/                                 — add member

GET    /projects/{id}/sprints/                                 — list sprints
POST   /projects/{id}/sprints/                                 — create sprint
POST   /projects/{id}/sprints/{id}/start/                      — start sprint
POST   /projects/{id}/sprints/{id}/complete/                   — complete sprint

GET    /projects/{id}/milestones/                              — list milestones
POST   /projects/{id}/milestones/{id}/complete/                — mark complete

GET    /projects/{id}/tasks/                                   — list tasks
POST   /projects/{id}/tasks/                                   — create task
GET    /projects/{id}/tasks/{id}/                              — task detail
PATCH  /projects/{id}/tasks/{id}/                              — update task
GET    /projects/{id}/tasks/{id}/comments/                     — task comments
POST   /projects/{id}/tasks/{id}/time-logs/                    — log time
POST   /projects/{id}/tasks/{id}/submissions/                  — submit task
POST   /projects/{id}/tasks/{id}/submissions/{id}/review/      — review submission
POST   /projects/{id}/tasks/{id}/extend-deadline/              — extend deadline
POST   /projects/{id}/tasks/{id}/dependencies/                 — add dependency

GET    /projects/{id}/risks/                                   — list risks
POST   /projects/{id}/risks/{id}/resolve/                      — resolve risk

GET    /projects/{id}/documents/                               — list documents
GET    /projects/{id}/meetings/                                — list meetings
GET    /projects/{id}/comments/                                — project comments

GET    /dashboard/                                             — user dashboard
"""