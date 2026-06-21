"""
apps/logbooks/filters.py

django-filter FilterSets for Logbook and LogbookEntry.

NOTE: relationship fields (intern, supervisor, department) are declared
explicitly as ModelChoiceFilter / UUIDFilter rather than left as bare
strings in Meta.fields. Leaving them as bare strings forces django-filter
to introspect the model's relation graph at import time, which can blow
up with "Unable to resolve relationship" if:
  - the app registry isn't fully populated yet (import-order issue), or
  - the field doesn't exist on the model under that exact name, or
  - the field points to a model that hasn't been migrated/loaded yet.

Declaring filters explicitly avoids all of that — it's also slightly
more efficient since django-filter doesn't have to do introspection.
"""
import django_filters
from django.db.models import Q
from .models import Logbook, LogbookEntry


class LogbookFilter(django_filters.FilterSet):
    """
    Supported query params:
        intern          — exact UUID
        supervisor      — exact UUID
        department      — exact UUID  (omitted automatically if the
                           Logbook model has no `department` field)
        final_submitted — boolean
        final_approved  — boolean
        start_date_gte  — date range start
        start_date_lte  — date range end
        end_date_gte    — date range start
        end_date_lte    — date range end
        search          — full-text across title / intern name / email
    """

    intern = django_filters.UUIDFilter(field_name="intern_id")
    supervisor = django_filters.UUIDFilter(field_name="supervisor_id")

    start_date_gte = django_filters.DateFilter(
        field_name="start_date", lookup_expr="gte"
    )
    start_date_lte = django_filters.DateFilter(
        field_name="start_date", lookup_expr="lte"
    )
    end_date_gte = django_filters.DateFilter(
        field_name="end_date", lookup_expr="gte"
    )
    end_date_lte = django_filters.DateFilter(
        field_name="end_date", lookup_expr="lte"
    )
    search = django_filters.CharFilter(method="filter_search")

    class Meta:
        model = Logbook
        # Only plain/boolean fields here — relationship fields are
        # declared explicitly above to avoid introspection errors.
        fields = ["final_submitted", "final_approved"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Only expose the `department` filter if the model actually has
        # that field. This keeps the FilterSet safe even if your real
        # Logbook model doesn't define a `department` FK.
        if "department" in {f.name for f in Logbook._meta.get_fields()}:
            self.filters["department"] = django_filters.UUIDFilter(
                field_name="department_id"
            )

    def filter_search(self, queryset, name, value):
        return queryset.filter(
            Q(title__icontains=value)
            | Q(intern__first_name__icontains=value)
            | Q(intern__last_name__icontains=value)
            | Q(intern__email__icontains=value)
        )


class LogbookEntryFilter(django_filters.FilterSet):
    """
    Supported query params:
        status            — exact
        date_gte          — date range
        date_lte          — date range
        mood_rating       — exact integer
        supervisor_rating — exact integer
        reviewed_by       — exact UUID
        has_attachments   — boolean filter
        has_comments      — boolean filter
        search            — full-text on activities / location
    """

    reviewed_by = django_filters.UUIDFilter(field_name="reviewed_by_id")

    date_gte = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    date_lte = django_filters.DateFilter(field_name="date", lookup_expr="lte")
    has_attachments = django_filters.BooleanFilter(method="filter_has_attachments")
    has_comments = django_filters.BooleanFilter(method="filter_has_comments")
    search = django_filters.CharFilter(method="filter_search")

    class Meta:
        model = LogbookEntry
        # Only plain scalar fields — relationship field (reviewed_by)
        # declared explicitly above.
        fields = ["status", "mood_rating", "supervisor_rating"]

    def filter_has_attachments(self, queryset, name, value):
        if value:
            return queryset.filter(attachments__isnull=False).distinct()
        return queryset.filter(attachments__isnull=True)

    def filter_has_comments(self, queryset, name, value):
        if value:
            return queryset.filter(comments__isnull=False).distinct()
        return queryset.filter(comments__isnull=True)

    def filter_search(self, queryset, name, value):
        return queryset.filter(
            Q(activities__icontains=value)
            | Q(skills_acquired__icontains=value)
            | Q(challenges__icontains=value)
            | Q(reflection__icontains=value)
            | Q(location__icontains=value)
        )