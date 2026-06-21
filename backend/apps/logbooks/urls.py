"""
apps/logbooks/urls.py

Mounted at the project root as:
    path('api/v1/logbooks/', include('apps.logbooks.urls'))

Because the root urls.py already supplies the 'logbooks/' prefix,
this router registers everything at "" (empty string) — NOT "logbooks".
Registering with r"logbooks" here would double the segment, producing
/api/v1/logbooks/logbooks/ and leaving /api/v1/logbooks/ resolving to
the DRF router root view (GET-only), which is what caused the
405 "Method POST not allowed" error.

IMPORTANT — registration order: "programs" MUST be registered before
the empty-prefix LogbookViewSet. DRF routers resolve URL patterns in
registration order, and LogbookViewSet is registered at the empty
prefix r"" with a detail route shaped like /{pk}/ — without "programs"
coming first, a request to /api/v1/logbooks/programs/ would instead
match LogbookViewSet's retrieve action with pk="programs".

Resulting URLs:
  /api/v1/logbooks/
  /api/v1/logbooks/{id}/
  /api/v1/logbooks/{id}/submit/
  /api/v1/logbooks/{id}/approve/
  /api/v1/logbooks/{id}/sign/
  /api/v1/logbooks/{id}/summary/
  /api/v1/logbooks/{id}/export/
  /api/v1/logbooks/{id}/audit/
  /api/v1/logbooks/{id}/entries/
  /api/v1/logbooks/{id}/entries/{eid}/
  /api/v1/logbooks/{id}/entries/{eid}/submit/
  /api/v1/logbooks/{id}/entries/{eid}/approve/
  /api/v1/logbooks/{id}/entries/{eid}/reject/
  /api/v1/logbooks/{id}/entries/{eid}/request-revision/
  /api/v1/logbooks/{id}/entries/{eid}/acknowledge/
  /api/v1/logbooks/{id}/entries/{eid}/attachments/
  /api/v1/logbooks/{id}/entries/{eid}/attachments/{att_pk}/
  /api/v1/logbooks/{id}/entries/{eid}/comments/
  /api/v1/logbooks/logbook-comments/{id}/   (PATCH / DELETE)

  /api/v1/logbooks/programs/
  /api/v1/logbooks/programs/{id}/
  /api/v1/logbooks/programs/{id}/cohorts/
  /api/v1/logbooks/programs/{id}/cohorts/{cohort_id}/
  /api/v1/logbooks/programs/{id}/cohorts/{cohort_id}/departments/
  /api/v1/logbooks/programs/{id}/cohorts/{cohort_id}/departments/{dept_id}/
  /api/v1/logbooks/programs/{id}/cohorts/{cohort_id}/departments/{dept_id}/activate/
  /api/v1/logbooks/programs/{id}/cohorts/{cohort_id}/departments/{dept_id}/deactivate/
  /api/v1/logbooks/programs/{id}/cohorts/{cohort_id}/departments/{dept_id}/logbooks/

Note: because logbook-comments is also registered on this same router,
it ends up nested under the /api/v1/logbooks/ prefix too (as shown above).
If you'd rather it live at /api/v1/logbook-comments/ instead, mount it
separately in the root urls.py and remove its registration here.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_nested.routers import NestedDefaultRouter
from .views import (
    LogbookViewSet, LogbookEntryViewSet, LogbookCommentViewSet,
    ProgramViewSet, CohortViewSet, DepartmentActivationViewSet,
)

# Empty-string prefix — the root urls.py already supplies "logbooks/"
router = DefaultRouter()

# "programs" registered FIRST — see registration-order note above.
router.register(r"programs", ProgramViewSet, basename="program")
router.register(r"logbook-comments", LogbookCommentViewSet, basename="logbook-comment")
router.register(r"", LogbookViewSet, basename="logbook")

# Nested entries: lookup uses the empty-prefix Logbook registration above
entries_router = NestedDefaultRouter(router, r"", lookup="logbook")
entries_router.register(r"entries", LogbookEntryViewSet, basename="logbook-entry")

# Nested cohorts: lookup uses the "programs" registration above
cohorts_router = NestedDefaultRouter(router, r"programs", lookup="program")
cohorts_router.register(r"cohorts", CohortViewSet, basename="program-cohort")

# Nested department-activations: lookup uses the cohorts registration above
departments_router = NestedDefaultRouter(cohorts_router, r"cohorts", lookup="cohort")
departments_router.register(r"departments", DepartmentActivationViewSet, basename="cohort-department")

urlpatterns = [
    path("", include(router.urls)),
    path("", include(entries_router.urls)),
    path("", include(cohorts_router.urls)),
    path("", include(departments_router.urls)),
]