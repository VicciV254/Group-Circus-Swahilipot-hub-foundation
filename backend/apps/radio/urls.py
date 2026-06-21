"""
apps/radio/urls.py
──────────────────
Nexus Radio — URL Configuration

Endpoints
─────────
GET/POST   /radio/frequencies/              List + create frequencies
GET/PATCH  /radio/frequencies/<uuid>/       Retrieve + update a frequency

GET/POST   /radio/shows/                    List + create shows
GET/PATCH  /radio/shows/<uuid>/             Retrieve + update a show

GET/POST   /radio/schedule/                 List slots (filterable by date range) + create
GET/PATCH/DELETE /radio/schedule/<uuid>/    Slot detail, update, delete
POST       /radio/schedule/<uuid>/show-plan/ Presenter submits their show plan

GET        /radio/my-schedule/              Slots assigned to the current user
POST       /radio/notify/                   Send email notification for a slot action
GET        /radio/upcoming-reminders/       Slots starting within ?window=N minutes
"""

from __future__ import annotations

import logging
from datetime import timedelta
from urllib.parse import urlencode

from django.contrib.auth import get_user_model
from django.conf import settings
from django.core.mail import send_mail
from django.urls import path
from django.utils import timezone

from rest_framework import filters, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from .models import Frequency, RadioSlot, Show
from .serializers import FrequencySerializer, RadioSlotSerializer, ShowSerializer

logger = logging.getLogger(__name__)
User = get_user_model()


# ─────────────────────────────────────────────────────────────────────────────
# Permission helpers
# ─────────────────────────────────────────────────────────────────────────────
ADMIN_ROLES = {"broadcast_admin", "broadcast_staff", "system_admin"}


def _is_admin(user) -> bool:
    return getattr(user, "role", "") in ADMIN_ROLES


# ─────────────────────────────────────────────────────────────────────────────
# Frequency ViewSet
# ─────────────────────────────────────────────────────────────────────────────
class FrequencyViewSet(ModelViewSet):
    """
    GET  /radio/frequencies/          → list all active frequencies
    POST /radio/frequencies/          → create (admin only)
    GET  /radio/frequencies/<id>/     → retrieve
    PATCH /radio/frequencies/<id>/    → update (admin only)
    DELETE /radio/frequencies/<id>/   → soft-delete via is_active=False (admin only)
    """

    serializer_class   = FrequencySerializer
    permission_classes = [IsAuthenticated]
    filter_backends    = [filters.SearchFilter, filters.OrderingFilter]
    search_fields      = ["name", "band"]
    ordering_fields    = ["name", "frequency_mhz", "band"]
    ordering           = ["band", "frequency_mhz"]

    def get_queryset(self):
        qs = Frequency.objects.all()
        # Non-admins only see active frequencies
        if not _is_admin(self.request.user):
            qs = qs.filter(is_active=True)
        return qs

    def create(self, request, *args, **kwargs):
        if not _is_admin(request.user):
            return Response({"detail": "Permission denied."}, status=403)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not _is_admin(request.user):
            return Response({"detail": "Permission denied."}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not _is_admin(request.user):
            return Response({"detail": "Permission denied."}, status=403)
        # Soft-delete
        obj = self.get_object()
        obj.is_active = False
        obj.save(update_fields=["is_active"])
        return Response(status=204)


# ─────────────────────────────────────────────────────────────────────────────
# Show ViewSet
# ─────────────────────────────────────────────────────────────────────────────
class ShowViewSet(ModelViewSet):
    """
    GET  /radio/shows/         → list all active shows
    POST /radio/shows/         → create (admin only)
    GET  /radio/shows/<id>/    → retrieve
    PATCH /radio/shows/<id>/   → update (admin only)
    DELETE /radio/shows/<id>/  → soft-delete (admin only)
    """

    serializer_class   = ShowSerializer
    permission_classes = [IsAuthenticated]
    filter_backends    = [filters.SearchFilter, filters.OrderingFilter]
    search_fields      = ["name", "show_type"]
    ordering_fields    = ["name", "show_type"]
    ordering           = ["name"]

    def get_queryset(self):
        qs = Show.objects.all()
        if not _is_admin(self.request.user):
            qs = qs.filter(is_active=True)
        # Optional ?type=music filter
        show_type = self.request.query_params.get("type")
        if show_type:
            qs = qs.filter(show_type=show_type)
        return qs

    def create(self, request, *args, **kwargs):
        if not _is_admin(request.user):
            return Response({"detail": "Permission denied."}, status=403)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not _is_admin(request.user):
            return Response({"detail": "Permission denied."}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not _is_admin(request.user):
            return Response({"detail": "Permission denied."}, status=403)
        obj = self.get_object()
        obj.is_active = False
        obj.save(update_fields=["is_active"])
        return Response(status=204)


# ─────────────────────────────────────────────────────────────────────────────
# RadioSlot ViewSet
# ─────────────────────────────────────────────────────────────────────────────
class RadioSlotViewSet(ModelViewSet):
    """
    GET  /radio/schedule/         → week-range filtered slot list
    POST /radio/schedule/         → create slot (admin only)
    GET  /radio/schedule/<id>/    → slot detail
    PATCH /radio/schedule/<id>/   → update slot (admin only)
    DELETE /radio/schedule/<id>/  → delete slot (admin only)
    POST /radio/schedule/<id>/show-plan/  → presenter submits show plan
    """

    serializer_class   = RadioSlotSerializer
    permission_classes = [IsAuthenticated]
    filter_backends    = [filters.SearchFilter, filters.OrderingFilter]
    search_fields      = ["show_name", "presenter_name", "frequency_name"]
    ordering_fields    = ["start_datetime", "show_name", "status"]
    ordering           = ["start_datetime"]

    def get_queryset(self):
        qs = RadioSlot.objects.select_related("frequency", "show", "presenter")

        # Date-range filter: ?start=YYYY-MM-DD&end=YYYY-MM-DD
        start = self.request.query_params.get("start")
        end   = self.request.query_params.get("end")
        if start:
            qs = qs.filter(start_datetime__date__gte=start)
        if end:
            qs = qs.filter(start_datetime__date__lte=end)

        # Status filter
        slot_status = self.request.query_params.get("status")
        if slot_status:
            qs = qs.filter(status=slot_status)

        return qs

    def create(self, request, *args, **kwargs):
        if not _is_admin(request.user):
            return Response({"detail": "Permission denied."}, status=403)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not _is_admin(request.user):
            return Response({"detail": "Permission denied."}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not _is_admin(request.user):
            return Response({"detail": "Permission denied."}, status=403)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="show-plan")
    def show_plan(self, request, pk=None):
        """POST /radio/schedule/<id>/show-plan/ — presenter submits their show plan."""
        slot = self.get_object()
        plan = request.data.get("show_plan", "").strip()
        if not plan:
            return Response({"detail": "show_plan is required."}, status=400)

        # Only the assigned presenter (or admin) may submit
        is_assigned = str(slot.presenter_id) == str(request.user.id)
        if not is_assigned and not _is_admin(request.user):
            return Response({"detail": "You are not the assigned presenter for this slot."}, status=403)

        slot.show_plan = plan
        slot.save(update_fields=["show_plan", "updated_at"])
        return Response(RadioSlotSerializer(slot).data)


# ─────────────────────────────────────────────────────────────────────────────
# My Schedule
# ─────────────────────────────────────────────────────────────────────────────
class MyScheduleView(APIView):
    """GET /radio/my-schedule/ — upcoming slots assigned to the current user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        slots = RadioSlot.objects.filter(
            presenter=request.user,
            start_datetime__gte=now,
            status__in=["scheduled", "live"],
        ).select_related("frequency", "show").order_by("start_datetime")

        serializer = RadioSlotSerializer(slots, many=True)
        return Response(serializer.data)


# ─────────────────────────────────────────────────────────────────────────────
# Slot Notification (email)
# ─────────────────────────────────────────────────────────────────────────────
def _google_calendar_url(slot_data: dict) -> str:
    from datetime import datetime

    def _fmt(iso: str) -> str:
        try:
            dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            return dt.strftime("%Y%m%dT%H%M%SZ")
        except Exception:
            return ""

    params = {
        "action":   "TEMPLATE",
        "text":     slot_data.get("show_name", "Radio Slot"),
        "dates":    f"{_fmt(slot_data.get('start_datetime',''))}/{_fmt(slot_data.get('end_datetime',''))}",
        "details":  slot_data.get("description", ""),
        "location": slot_data.get("location", ""),
    }
    return f"https://calendar.google.com/calendar/render?{urlencode(params)}"


class SlotNotifyView(APIView):
    """
    POST /radio/notify/
    Body: { slot, presenter_user_id, action: "created"|"updated"|"cancelled" }
    Looks up the presenter's email and sends a styled confirmation email.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, **kwargs):
        slot             = request.data.get("slot", {})
        presenter_user_id = request.data.get("presenter_user_id")
        action           = request.data.get("action", "created")

        if not presenter_user_id or not slot:
            return Response({"error": "slot and presenter_user_id are required."}, status=400)

        try:
            presenter = User.objects.get(pk=presenter_user_id)
            email     = presenter.email
        except User.DoesNotExist:
            return Response({"error": "Presenter user not found."}, status=404)

        if not email:
            return Response({"error": "Presenter has no email on record."}, status=422)

        gcal_url   = _google_calendar_url(slot)
        show_name  = slot.get("show_name", "Your slot")
        start_dt   = slot.get("start_datetime", "")
        end_dt     = slot.get("end_datetime", "")
        frequency  = slot.get("frequency_name", "")
        location   = slot.get("location", "")

        if action == "cancelled":
            verb, subject_tag, header_icon, header_color = "cancelled", "⚠️ Slot Cancelled", "🚫", "#ef4444"
        elif action == "updated":
            verb, subject_tag, header_icon, header_color = "updated", "Slot Updated", "✏️", "#f59e0b"
        else:
            verb, subject_tag, header_icon, header_color = "created", "Slot Confirmed", "✅", "#22c55e"

        subject = f"[Nexus Radio] {subject_tag}: {show_name}"

        cta_block = (
            '<div style="background:#450a0a;border:1px solid #ef4444;border-radius:8px;'
            'padding:14px 18px;margin-bottom:16px;">'
            '<p style="color:#fca5a5;margin:0;font-size:14px;font-weight:600;">'
            '⚠️ This slot has been cancelled and removed from the schedule.</p>'
            '</div>'
        ) if action == "cancelled" else (
            f'<a href="{gcal_url}" '
            'style="display:inline-block;background:#3b63f5;color:#fff;padding:10px 22px;'
            'border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;margin-bottom:12px;">'
            '📅 Add to Google Calendar</a>'
        )

        html_body = f"""
<html><body style="font-family:sans-serif;color:#1e293b;max-width:600px;margin:auto;">
  <div style="background:#1e2538;padding:24px 28px;border-radius:12px;">
    <h2 style="color:{header_color};margin:0 0 4px;">{header_icon} {subject_tag}: {show_name}</h2>
    <p style="color:#94a3b8;margin:0 0 20px;font-size:14px;">Nexus Broadcast Management</p>
    <div style="background:#0f172a;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="color:#64748b;padding:4px 0;width:110px;">Show</td>
            <td style="color:#f1f5f9;font-weight:600;">{show_name}</td></tr>
        <tr><td style="color:#64748b;padding:4px 0;">Start</td>
            <td style="color:#f1f5f9;">{start_dt}</td></tr>
        <tr><td style="color:#64748b;padding:4px 0;">End</td>
            <td style="color:#f1f5f9;">{end_dt}</td></tr>
        {'<tr><td style="color:#64748b;padding:4px 0;">Frequency</td><td style="color:#f1f5f9;">' + frequency + '</td></tr>' if frequency else ''}
        {'<tr><td style="color:#64748b;padding:4px 0;">Location</td><td style="color:#f1f5f9;">' + location + '</td></tr>' if location else ''}
      </table>
    </div>
    {cta_block}
    <p style="color:#475569;font-size:12px;margin-top:20px;">
      You received this email because you are the assigned presenter for this slot on Nexus Radio.
      {"" if action == "cancelled" else " You will receive a reminder 30 minutes before air-time."}
    </p>
  </div>
</body></html>"""

        plain_body = (
            f"SLOT CANCELLED: {show_name}\nOriginal time: {start_dt} — {end_dt}\n"
            if action == "cancelled"
            else f"Radio slot {verb}: {show_name}\nStart: {start_dt}\nEnd: {end_dt}\n"
                 f"Frequency: {frequency}\nLocation: {location}\n\nAdd to Google Calendar:\n{gcal_url}"
        )

        try:
            send_mail(
                subject=subject,
                message=plain_body,
                html_message=html_body,
                from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@nexus.local"),
                recipient_list=[email],
                fail_silently=False,
            )
            logger.info("Slot [%s] notification (%s) sent to %s", slot.get("id"), action, email)
        except Exception as exc:
            logger.exception("Failed to send slot notification: %s", exc)
            return Response({"error": "Email delivery failed.", "detail": str(exc)}, status=500)

        return Response({"sent_to": email, "gcal_url": gcal_url})


# ─────────────────────────────────────────────────────────────────────────────
# Upcoming Reminders
# ─────────────────────────────────────────────────────────────────────────────
class UpcomingRemindersView(APIView):
    """GET /radio/upcoming-reminders/?window=65 — slots starting within N minutes for the current user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            window_minutes = min(int(request.query_params.get("window", 60)), 1440)
        except (ValueError, TypeError):
            window_minutes = 60

        now    = timezone.now()
        cutoff = now + timedelta(minutes=window_minutes)

        slots = RadioSlot.objects.filter(
            presenter=request.user,
            start_datetime__gt=now,
            start_datetime__lte=cutoff,
            status="scheduled",
        ).values("id", "show_name", "start_datetime", "end_datetime", "frequency_name", "location")

        results = []
        for s in slots:
            minutes_away = int((s["start_datetime"] - now).total_seconds() / 60)
            results.append({
                **{k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in s.items()},
                "minutes_away": minutes_away,
                "gcal_url": _google_calendar_url({
                    "show_name":      s["show_name"],
                    "start_datetime": s["start_datetime"].isoformat(),
                    "end_datetime":   s["end_datetime"].isoformat(),
                    "location":       s.get("location", ""),
                }),
            })

        return Response({"results": results})


# ─────────────────────────────────────────────────────────────────────────────
# URL patterns
# ─────────────────────────────────────────────────────────────────────────────
frequency_list   = FrequencyViewSet.as_view({"get": "list",     "post": "create"})
frequency_detail = FrequencyViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"})

show_list   = ShowViewSet.as_view({"get": "list",     "post": "create"})
show_detail = ShowViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"})

slot_list   = RadioSlotViewSet.as_view({"get": "list",     "post": "create"})
slot_detail = RadioSlotViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"})
slot_plan   = RadioSlotViewSet.as_view({"post": "show_plan"})

urlpatterns = [
    # Frequencies
    path("frequencies/",           frequency_list,   name="radio-frequencies"),
    path("frequencies/<uuid:pk>/", frequency_detail, name="radio-frequency-detail"),

    # Shows
    path("shows/",           show_list,   name="radio-shows"),
    path("shows/<uuid:pk>/", show_detail, name="radio-show-detail"),

    # Schedule / Slots
    path("schedule/",                          slot_list,   name="radio-schedule"),
    path("schedule/<uuid:pk>/",                slot_detail, name="radio-slot-detail"),
    path("schedule/<uuid:pk>/show-plan/",      slot_plan,   name="radio-show-plan"),

    # Presenter portal
    path("my-schedule/",         MyScheduleView.as_view(),        name="radio-my-schedule"),

    # Notifications & reminders
    path("notify/",              SlotNotifyView.as_view(),         name="radio-notify"),
    path("upcoming-reminders/",  UpcomingRemindersView.as_view(),  name="radio-upcoming-reminders"),
]