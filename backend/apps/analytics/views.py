"""
Nexus Analytics — Production-grade cross-module analytics engine
================================================================
Covers: Attendance · Tasks · Equipment · FM Station · Broadcast ·
        Users · System Audit · Notifications · Wi-Fi · Feedback ·
        File Transfer · Videography · Certificates · Evaluations

All views are organisation-scoped and require authentication.
"""

from django.db.models import (
    Count, Avg, Sum, Q, F, Max, Min, StdDev, Variance,
    ExpressionWrapper, DurationField, FloatField, IntegerField,
    Case, When, Value, CharField,
)
from django.db.models.functions import (
    TruncDate, TruncWeek, TruncMonth, TruncHour,
    ExtractHour, ExtractWeekDay, Coalesce,
)
from django.utils import timezone
from datetime import timedelta, date, datetime
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status as http_status
from django.http import HttpResponse, StreamingHttpResponse
from django.core.cache import cache
import csv
import io
import json
import math


# ─────────────────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _date_range(start: date, end: date):
    """Yield every date from start to end inclusive."""
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def _rolling_avg(series: list, window: int = 7) -> list:
    """Return a list of rolling averages for a numeric series."""
    result = []
    for i, val in enumerate(series):
        chunk = series[max(0, i - window + 1): i + 1]
        result.append(round(sum(chunk) / len(chunk), 2))
    return result


def _z_score_anomalies(values: list, threshold: float = 2.0) -> list[bool]:
    """Return boolean flags for values more than `threshold` std-devs from mean."""
    if len(values) < 4:
        return [False] * len(values)
    mean = sum(values) / len(values)
    variance = sum((x - mean) ** 2 for x in values) / len(values)
    std = math.sqrt(variance) or 1
    return [abs(v - mean) / std > threshold for v in values]


def _cache_key(org_id: str, name: str, *parts) -> str:
    return f"analytics:{org_id}:{name}:{'_'.join(str(p) for p in parts)}"


def _pct(numerator, denominator, decimals=1):
    if not denominator:
        return 0.0
    return round((numerator / denominator) * 100, decimals)


# ─────────────────────────────────────────────────────────────────────────────
#  1. Main Dashboard  — /analytics/dashboard/
# ─────────────────────────────────────────────────────────────────────────────

class AnalyticsDashboardView(APIView):
    """
    Master analytics dashboard.
    Aggregates KPIs and chart data from every module.
    Cached per-org for 5 minutes.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        org   = request.user.organisation
        today = timezone.now().date()
        now   = timezone.now()

        cache_key = _cache_key(org.id, "dashboard", today)
        cached    = cache.get(cache_key)
        if cached:
            return Response(cached)

        last_7  = today - timedelta(days=7)
        last_14 = today - timedelta(days=14)
        last_30 = today - timedelta(days=30)

        data = {
            "stats":  self._get_stats(org, today, now),
            "charts": {
                "attendance_trend":   self._attendance_trend(org, last_14, today),
                "task_status":        self._task_status(org),
                "task_priority":      self._task_priority(org),
                "equipment_by_cat":   self._equipment_by_category(org),
                "equipment_status":   self._equipment_status(org),
                "fm_uptime_30d":      self._fm_uptime_trend(org, last_30, today),
                "news_by_status":     self._news_by_status(org),
                "top_departments":    self._top_departments(org),
                "activity_heatmap":   self._activity_heatmap(org, last_7),
                "audit_timeline":     self._audit_timeline(org, last_14, today),
                "notification_types": self._notification_types(org, last_30),
                "leave_types":        self._leave_type_distribution(org, last_30),
                "weekly_cohort":      self._weekly_attendance_cohort(org, last_30, today),
                "user_roles":         self._user_role_breakdown(org),
                "task_completion_time": self._task_completion_time(org, last_30),
                "checkin_methods":    self._checkin_methods(org, last_30),
            },
            "insights": self._generate_insights(org, today),
            "alerts":   self._build_alerts(org, today),
        }

        cache.set(cache_key, data, 300)
        return Response(data)

    # ── KPI stats ─────────────────────────────────────────────────────────────

    def _get_stats(self, org, today, now):
        from apps.accounts.models import User
        from apps.attendance.models import AttendanceRecord
        from apps.tasks.models import Task

        stats = {}

        # ── Users ──────────────────────────────────────────────────────────
        users = User.objects.filter(organisation=org, is_active=True)
        stats["active_users"]      = users.count()
        stats["active_attachees"]  = users.filter(role="attachee").count()
        stats["staff_count"]       = users.exclude(role="attachee").count()
        stats["mfa_enabled_count"] = users.filter(mfa_enabled=True).count()
        stats["mfa_adoption_pct"]  = _pct(stats["mfa_enabled_count"], stats["active_users"])

        # ── Attendance ─────────────────────────────────────────────────────
        att_today = AttendanceRecord.objects.filter(user__organisation=org, date=today)
        stats["present_today"]    = att_today.filter(status__in=["present", "late"]).count()
        stats["on_leave_today"]   = att_today.filter(status="leave").count()
        stats["late_today"]       = att_today.filter(status="late").count()
        stats["attendance_rate_today"] = _pct(
            stats["present_today"],
            max(stats["active_users"], 1)
        )

        # 7-day rolling attendance rate
        week_att = AttendanceRecord.objects.filter(
            user__organisation=org,
            date__gte=today - timedelta(days=7),
        )
        total_week   = week_att.count()
        present_week = week_att.filter(status__in=["present", "late"]).count()
        stats["attendance_rate_7d"] = _pct(present_week, total_week)

        # ── Tasks ──────────────────────────────────────────────────────────
        tasks = Task.objects.filter(organisation=org)
        stats["tasks_total"]           = tasks.count()
        stats["tasks_overdue"]         = tasks.filter(status="overdue").count()
        stats["tasks_pending"]         = tasks.filter(status="pending").count()
        stats["tasks_in_progress"]     = tasks.filter(status="in_progress").count()
        stats["tasks_submitted"]       = tasks.filter(status="submitted").count()
        stats["tasks_approved"]        = tasks.filter(status="approved").count()
        stats["tasks_rejected"]        = tasks.filter(status="rejected").count()
        stats["tasks_completed_today"] = tasks.filter(
            status="approved",
            reviewed_at__date=today,
        ).count()
        stats["task_completion_rate"]  = _pct(
            stats["tasks_approved"],
            max(stats["tasks_total"], 1)
        )
        stats["task_overdue_rate"] = _pct(
            stats["tasks_overdue"],
            max(stats["tasks_total"], 1)
        )

        # ── Equipment ──────────────────────────────────────────────────────
        try:
            from apps.equipment.models import EquipmentItem, CheckoutRequest, MaintenanceLog
            items = EquipmentItem.objects.filter(organisation=org, is_active=True)
            stats["equipment_total"]       = items.count()
            stats["equipment_available"]   = items.filter(status="available").count()
            stats["equipment_on_loan"]     = items.filter(status="checked_out").count()
            stats["equipment_under_repair"]= items.filter(status="under_repair").count()
            stats["equipment_overdue"]     = CheckoutRequest.objects.filter(
                item__organisation=org, status="active", end_date__lt=today
            ).count()
            stats["equipment_utilisation_pct"] = _pct(
                stats["equipment_on_loan"],
                max(stats["equipment_total"], 1)
            )
            # Total asset value
            val_agg = items.aggregate(total=Sum("purchase_cost"), current=Sum("current_value"))
            stats["equipment_total_cost"]  = float(val_agg["total"] or 0)
            stats["equipment_current_val"] = float(val_agg["current"] or 0)
            stats["total_asset_value"]     = stats["equipment_total_cost"]  # frontend alias
            # Open maintenance
            stats["maintenance_open"] = MaintenanceLog.objects.filter(
                item__organisation=org, status__in=["reported", "in_progress"]
            ).count()
            stats["maintenance_log"] = list(
                MaintenanceLog.objects.filter(
                    item__organisation=org
                ).select_related("item", "reported_by").order_by("-created_at")[:20].values.values(
                    id=F("id"),
                    item_name=F("item__name"),
                    asset_tag=F("item__asset_tag"),
                    issue=F("issue"),
                    status=F("status"),
                    reported_by=F("reported_by__first_name"),
                    created_at=F("created_at")
                )

            )
            stats["equipment"] = list(
                items.order_by("name").values(
                    "id", "name", "asset_tag", "status", "condition",
                    cost=F("purchase_cost"), location=F("location__name"),
                )
            )
        except Exception:
            stats.update({
                "equipment_total": 0, "equipment_available": 0,
                "equipment_on_loan": 0, "equipment_under_repair": 0,
                "equipment_overdue": 0, "equipment_utilisation_pct": 0,
                "equipment_total_cost": 0, "equipment_current_val": 0,
                "maintenance_open": 0,
            })

        # ── FM ────────────────────────────────────────────────────────────
        try:
            from apps.fm_report.models import FMStation, FMOutage
            stations = FMStation.objects.filter(organisation=org)
            stats["fm_stations_total"]  = stations.count()
            stats["fm_active_outages"]  = stations.filter(current_status="off_air").count()
            stats["fm_on_air"]          = stations.filter(current_status="on_air").count()

            # Today's uptime across all stations
            minutes_elapsed = now.hour * 60 + now.minute
            if stations.exists() and minutes_elapsed > 0:
                outage_today = FMOutage.objects.filter(
                    station__in=stations,
                    down_at__date=today,
                ).aggregate(total=Sum("duration_minutes"))["total"] or 0
                max_minutes = stations.count() * minutes_elapsed
                stats["fm_uptime_percent"] = round(
                    max(0, (max_minutes - outage_today) / max_minutes * 100), 1
                )
            else:
                stats["fm_uptime_percent"] = 100.0

            # 30-day uptime
            outage_30 = FMOutage.objects.filter(
                station__in=stations,
                down_at__gte=timezone.make_aware(
                    datetime.combine(today - timedelta(days=30), datetime.min.time())
                ),
            ).aggregate(total=Sum("duration_minutes"))["total"] or 0
            max_30 = stations.count() * 30 * 1440
            stats["fm_uptime_30d_pct"] = round(
                max(0, (max_30 - outage_30) / max(max_30, 1) * 100), 1
            ) if max_30 > 0 else 100.0

            stats["fm_outages_30d"] = FMOutage.objects.filter(
                station__in=stations,
                down_at__gte=today - timedelta(days=30),
            ).count()
            stats["fm_avg_outage_duration"] = FMOutage.objects.filter(
                station__in=stations,
            ).aggregate(avg=Avg("duration_minutes"))["avg"] or 0

        except Exception:
            stats.update({
                "fm_stations_total": 0, "fm_active_outages": 0,
                "fm_on_air": 0, "fm_uptime_percent": 100.0,
                "fm_uptime_30d_pct": 100.0, "fm_outages_30d": 0,
                "fm_avg_outage_duration": 0,
            })

        # ── Broadcast / News ──────────────────────────────────────────────
        try:
            from apps.news.models import NewsStory, SoftwareSubscription
            stories = NewsStory.objects.filter(organisation=org)
            stats["news_total"]              = stories.count()
            stats["news_published"]          = stories.filter(status="published").count()
            stats["news_published_today"]    = stories.filter(
                status="published", published_at__date=today
            ).count()
            stats["news_draft"]              = stories.filter(status="draft").count()
            stats["news_submitted"]          = stories.filter(status="submitted").count()
            stats["projects_pending_review"] = stats["news_submitted"]
            stats["news_total_views"]        = stories.aggregate(v=Sum("view_count"))["v"] or 0
            stats["news_avg_word_count"]     = round(
                stories.filter(word_count__gt=0).aggregate(a=Avg("word_count"))["a"] or 0
            )
            stats["subscriptions_expiring_7d"] = SoftwareSubscription.objects.filter(
                organisation=org,
                expiry_date__lte=today + timedelta(days=7),
                expiry_date__gte=today,
                status="active",
            ).count()
        except Exception:
            stats.update({
                "news_total": 0, "news_published": 0, "news_published_today": 0,
                "news_draft": 0, "news_submitted": 0, "projects_pending_review": 0,
                "news_total_views": 0, "news_avg_word_count": 0,
                "subscriptions_expiring_7d": 0,
            })

        # ── Wi-Fi ─────────────────────────────────────────────────────────
        try:
            from apps.wifi.models import WifiGrant
            grants = WifiGrant.objects.filter(requested_by__organisation=org)
            stats["wifi_active_grants"]  = grants.filter(status="active").count()
            stats["wifi_pending_grants"] = grants.filter(status="pending").count()
            stats["wifi_revoked_grants"] = grants.filter(status="revoked").count()
            stats["wifi_grants"] = list(
                grants.order_by("-created_at")[:20].values(
                    "id", "status",
                    device=F("device_name"),
                    duration=F("duration_days"),
                    expires_at=F("expiry_date"),
                )
            )
        except Exception:
            stats.update({
                "wifi_active_grants": 0, "wifi_pending_grants": 0,
                "wifi_revoked_grants": 0, "wifi_grants": [],
            })

        # ── Videography ───────────────────────────────────────────────────
        try:
            from apps.videography.models import ShootBooking
            shoots = ShootBooking.objects.filter(organisation=org)
            stats["videography_total"]    = shoots.count()
            stats["videography_approved"] = shoots.filter(status="approved").count()
            stats["videography"] = list(
                shoots.order_by("-created_at")[:20].values(
                    "id", "title", "status", "duration",
                    shoot_date=F("scheduled_date"),
                )
            )
        except Exception:
            stats.update({"videography_total": 0, "videography_approved": 0, "videography": []})

        # ── File Transfers ────────────────────────────────────────────────
        try:
            from apps.filetransfers.models import FileTransfer
            transfers = FileTransfer.objects.filter(uploaded_by__organisation=org)
            stats["file_transfers_total"] = transfers.count()
            # human-readable total size
            total_bytes = transfers.aggregate(s=Sum("file_size"))["s"] or 0
            if total_bytes >= 1_048_576:
                stats["file_transfers_size"] = f"{total_bytes / 1_048_576:.1f} MB"
            else:
                stats["file_transfers_size"] = f"{total_bytes / 1024:.1f} KB"
            stats["file_transfers"] = list(
                transfers.order_by("-created_at")[:20].values(
                    "id", "filename", "file_size",
                    downloads=F("download_count"),
                    uploaded_at=F("created_at"),
                )
            )
        except Exception:
            stats.update({"file_transfers_total": 0, "file_transfers_size": "0 KB", "file_transfers": []})

        # ── Alerts (Emergency Broadcasts) ─────────────────────────────────
        try:
            from apps.notifications.models import Notification
            alert_qs = Notification.objects.filter(
                organisation=org,
                notification_type="emergency",
            )
            stats["total_alerts"]    = alert_qs.count()
            stats["unresolved_alerts"] = alert_qs.filter(is_resolved=False).count()
            stats["critical_alerts"] = alert_qs.filter(severity="critical").count()
            stats["high_alerts"]     = alert_qs.filter(severity="high").count()
            stats["alerts"] = list(
                alert_qs.order_by("-created_at")[:20].values(
                    "id", "title", "severity",
                    sev=F("severity"),
                    date=F("created_at"),
                    resolved=F("is_resolved"),
                )
            )
        except Exception:
            stats.update({
                "total_alerts": 0, "unresolved_alerts": 0,
                "critical_alerts": 0, "high_alerts": 0, "alerts": [],
            })

        # ── Tasks list ────────────────────────────────────────────────────
        try:
            task_list = Task.objects.filter(organisation=org).select_related(
                "assigned_to", "reviewer"
            ).order_by("-created_at")[:20]
            stats["tasks"] = [
                {
                    "id":            str(t.id),
                    "title":         t.title,
                    "priority":      getattr(t, "priority", "low"),
                    "status":        t.status,
                    "assignee":      t.assigned_to.get_full_name() if t.assigned_to else "—",
                    "due_date":      t.due_date.strftime("%b %d %Y") if getattr(t, "due_date", None) else "—",
                    "submitted_at":  t.submitted_at.strftime("%b %d %H:%M") if getattr(t, "submitted_at", None) else "—",
                    "reviewed_at":   t.reviewed_at.strftime("%b %d %H:%M") if getattr(t, "reviewed_at", None) else "—",
                    "turnaround_mins": (
                        round((t.reviewed_at - t.submitted_at).total_seconds() / 60)
                        if getattr(t, "reviewed_at", None) and getattr(t, "submitted_at", None)
                        else None
                    ),
                }
                for t in task_list
            ]
        except Exception:
            stats.setdefault("tasks", [])

        # ── Feedback ──────────────────────────────────────────────────────
        try:
            from apps.feedback.models import FeedbackTicket
            tickets = FeedbackTicket.objects.filter(submitted_by__organisation=org)
            stats["tickets_open"]     = tickets.filter(status="open").count()
            stats["tickets_closed"]   = tickets.filter(status="closed").count()
            stats["tickets_total"]    = tickets.count()
            stats["ticket_resolution_rate"] = _pct(stats["tickets_closed"], stats["tickets_total"])
            # Frontend aliases
            stats["feedback_total"]   = stats["tickets_total"]
            stats["feedback_open"]    = stats["tickets_open"]
            stats["feedback"] = list(
                tickets.order_by("-created_at")[:20].values(
                    "id", "category", "priority", "status", "created_at",
                    ticket_number=F("ticket_id"),
                )
            )
        except Exception:
            stats.update({
                "tickets_open": 0, "tickets_closed": 0, "tickets_total": 0,
                "ticket_resolution_rate": 0, "feedback_total": 0,
                "feedback_open": 0, "feedback": [],
            })

        # ── Certificates ──────────────────────────────────────────────────
        try:
            from apps.certificates.models import Certificate
            certs = Certificate.objects.filter(organisation=org)
            stats["certificates_issued"]  = certs.filter(status__in=["issued", "generated"]).count()
            stats["certificates_revoked"] = certs.filter(status="revoked").count()
            stats["certificates"] = list(
                certs.order_by("-issued_at")[:20].values(
                    id=F("id"),
                    cert_number=F("cert_number"),
                    type=F("type"),
                    status=F("status"),
                    recipient=F("recipient__first_name"),
                    issued_at=F("issued_at")
            )
        )

        except Exception:
            stats.update({"certificates_issued": 0, "certificates_revoked": 0, "certificates": []})

        # ── Audit / System ────────────────────────────────────────────────
        try:
            from core.models import AuditLog
            audit_30 = AuditLog.objects.filter(
                user__organisation=org,
                created_at__date__gte=today - timedelta(days=30),
            )
            stats["api_calls_30d"]  = audit_30.count()
            stats["api_post_30d"]   = audit_30.filter(action="POST").count()
            stats["api_patch_30d"]  = audit_30.filter(action="PATCH").count()
            # Avg response time from extra JSON
            try:
                logs_with_duration = audit_30.filter(extra__has_key="duration_ms")
                durations = [
                    entry.extra.get("duration_ms", 0)
                    for entry in logs_with_duration[:200]
                    if isinstance(entry.extra, dict)
                ]
                stats["avg_response_ms"] = round(sum(durations) / len(durations), 1) if durations else 0
            except Exception:
                stats["avg_response_ms"] = 0
        except Exception:
            stats.update({"api_calls_30d": 0, "api_post_30d": 0, "api_patch_30d": 0, "avg_response_ms": 0})

        return stats

    # ── Chart builders ────────────────────────────────────────────────────────

    def _attendance_trend(self, org, start, end):
        from apps.attendance.models import AttendanceRecord
        daily = {}
        qs = AttendanceRecord.objects.filter(
            user__organisation=org,
            date__gte=start,
            date__lte=end,
        ).values("date").annotate(
            present=Count("id", filter=Q(status__in=["present", "late"])),
            late=Count("id", filter=Q(status="late")),
            absent=Count("id", filter=Q(status="absent")),
            leave=Count("id", filter=Q(status="leave")),
            total=Count("id"),
        ).order_by("date")

        for row in qs:
            daily[row["date"]] = row

        results   = []
        present_series = []
        for d in _date_range(start, end):
            row = daily.get(d, {"present": 0, "late": 0, "absent": 0, "leave": 0, "total": 0})
            present_series.append(row["present"])
            rate = _pct(row["present"], row["total"])
            results.append({
                "date":    d.strftime("%m/%d"),
                "present": row["present"],
                "late":    row["late"],
                "absent":  row["absent"],
                "leave":   row["leave"],
                "total":   row["total"],
                "rate":    rate,
            })

        # Attach rolling average and anomaly flags
        rolling   = _rolling_avg(present_series, 7)
        anomalies = _z_score_anomalies(present_series, 2.0)
        for i, item in enumerate(results):
            item["rolling_avg"] = rolling[i]
            item["anomaly"]     = anomalies[i]

        return results

    def _weekly_attendance_cohort(self, org, start, end):
        from apps.attendance.models import AttendanceRecord
        qs = AttendanceRecord.objects.filter(
            user__organisation=org,
            date__gte=start,
            date__lte=end,
        ).annotate(week=TruncWeek("date")).values("week").annotate(
            present=Count("id", filter=Q(status__in=["present", "late"])),
            absent=Count("id", filter=Q(status="absent")),
            leave=Count("id", filter=Q(status="leave")),
            total=Count("id"),
        ).order_by("week")

        return [
            {
                "week":    f"W{i+1} ({row['week'].strftime('%d %b')})",
                "present": row["present"],
                "absent":  row["absent"],
                "leave":   row["leave"],
                "rate":    _pct(row["present"], row["total"]),
            }
            for i, row in enumerate(qs)
        ]

    def _checkin_methods(self, org, start):
        from apps.attendance.models import AttendanceRecord
        qs = AttendanceRecord.objects.filter(
            user__organisation=org,
            date__gte=start,
        ).values("method").annotate(count=Count("id")).order_by("-count")
        return [{"name": r["method"], "value": r["count"]} for r in qs]

    def _task_status(self, org):
        from apps.tasks.models import Task
        label_map = {
            "pending": "Pending", "in_progress": "In Progress",
            "submitted": "Submitted", "approved": "Approved",
            "rejected": "Rejected", "overdue": "Overdue",
        }
        qs = Task.objects.filter(organisation=org).values("status").annotate(count=Count("id"))
        return [
            {"name": label_map.get(r["status"], r["status"]), "value": r["count"]}
            for r in qs
        ]

    def _task_priority(self, org):
        from apps.tasks.models import Task
        qs = Task.objects.filter(organisation=org).values("priority").annotate(count=Count("id"))
        return [{"name": r["priority"].title(), "value": r["count"]} for r in qs]

    def _task_completion_time(self, org, start):
        """
        Average days from task creation to approval, by priority.
        """
        from apps.tasks.models import Task
        results = []
        for priority in ["low", "medium", "high", "critical"]:
            qs = Task.objects.filter(
                organisation=org,
                priority=priority,
                status="approved",
                reviewed_at__isnull=False,
                created_at__date__gte=start,
            )
            durations = []
            for t in qs:
                delta = (t.reviewed_at.date() - t.created_at.date()).days
                if delta >= 0:
                    durations.append(delta)
            if durations:
                results.append({
                    "priority": priority.title(),
                    "avg_days": round(sum(durations) / len(durations), 1),
                    "count":    len(durations),
                })
        return results

    def _equipment_by_category(self, org):
        try:
            from apps.equipment.models import EquipmentItem
            qs = EquipmentItem.objects.filter(
                organisation=org, is_active=True
            ).values("category__name").annotate(
                count=Count("id"),
                value=Sum("purchase_cost"),
                available=Count("id", filter=Q(status="available")),
                on_loan=Count("id", filter=Q(status="checked_out")),
            ).order_by("-count")
            return [
                {
                    "name":      r["category__name"] or "Uncategorised",
                    "value":     r["count"],
                    "totalCost": float(r["value"] or 0),
                    "available": r["available"],
                    "on_loan":   r["on_loan"],
                }
                for r in qs
            ]
        except Exception:
            return []

    def _equipment_status(self, org):
        try:
            from apps.equipment.models import EquipmentItem
            qs = EquipmentItem.objects.filter(
                organisation=org, is_active=True
            ).values("status").annotate(count=Count("id"))
            label_map = {
                "available": "Available", "checked_out": "On Loan",
                "under_repair": "Under Repair", "retired": "Retired",
            }
            return [
                {"name": label_map.get(r["status"], r["status"]), "value": r["count"]}
                for r in qs
            ]
        except Exception:
            return []

    def _fm_uptime_trend(self, org, start, end):
        try:
            from apps.fm_report.models import FMOutage, FMStation
            stations = list(FMStation.objects.filter(organisation=org))
            if not stations:
                return []
            results = []
            for d in _date_range(start, end):
                day_start = timezone.make_aware(datetime.combine(d, datetime.min.time()))
                day_end   = day_start + timedelta(days=1)
                outage_mins = FMOutage.objects.filter(
                    station__in=stations,
                    down_at__gte=day_start,
                    down_at__lt=day_end,
                ).aggregate(total=Sum("duration_minutes"))["total"] or 0
                max_mins = len(stations) * 1440
                uptime   = round(max(0, (max_mins - outage_mins) / max_mins * 100), 2)
                results.append({
                    "date":         d.strftime("%m/%d"),
                    "uptime":       uptime,
                    "outage_mins":  outage_mins,
                    "sla_breach":   uptime < 95,
                })
            return results
        except Exception:
            return []

    def _news_by_status(self, org):
        try:
            from apps.news.models import NewsStory
            qs = NewsStory.objects.filter(organisation=org).values("status").annotate(count=Count("id"))
            return [{"name": r["status"].title(), "value": r["count"]} for r in qs]
        except Exception:
            return []

    def _top_departments(self, org):
        from apps.accounts.models import Department, User
        result = []
        for dept in Department.objects.filter(organisation=org, is_active=True):
            users = User.objects.filter(department=dept, is_active=True)
            result.append({
                "name":      dept.name,
                "users":     users.count(),
                "attachees": users.filter(role="attachee").count(),
                "staff":     users.exclude(role="attachee").count(),
            })
        return sorted(result, key=lambda x: x["users"], reverse=True)[:10]

    def _activity_heatmap(self, org, start):
        """
        Returns hourly activity counts over the last 7 days,
        structured for a heatmap: [{ hour: 0..23, day: 'Mon', count: N }]
        """
        try:
            from core.models import AuditLog
            qs = AuditLog.objects.filter(
                user__organisation=org,
                created_at__date__gte=start,
            ).annotate(
                hour=ExtractHour("created_at"),
                dow=ExtractWeekDay("created_at"),
            ).values("hour", "dow").annotate(count=Count("id")).order_by("dow", "hour")

            days_map = {1: "Sun", 2: "Mon", 3: "Tue", 4: "Wed", 5: "Thu", 6: "Fri", 7: "Sat"}
            return [
                {
                    "day":   days_map.get(r["dow"], str(r["dow"])),
                    "hour":  r["hour"],
                    "count": r["count"],
                }
                for r in qs
            ]
        except Exception:
            return []

    def _audit_timeline(self, org, start, end):
        try:
            from core.models import AuditLog
            qs = AuditLog.objects.filter(
                user__organisation=org,
                created_at__date__gte=start,
                created_at__date__lte=end,
            ).annotate(day=TruncDate("created_at")).values("day").annotate(
                total=Count("id"),
                posts=Count("id", filter=Q(action="POST")),
                patches=Count("id", filter=Q(action="PATCH")),
                deletes=Count("id", filter=Q(action="DELETE")),
            ).order_by("day")

            by_day = {r["day"]: r for r in qs}
            result = []
            for d in _date_range(start, end):
                r = by_day.get(d, {"total": 0, "posts": 0, "patches": 0, "deletes": 0})
                result.append({
                    "date":    d.strftime("%b %d"),
                    "total":   r["total"],
                    "posts":   r["posts"],
                    "patches": r["patches"],
                    "deletes": r["deletes"],
                })
            return result
        except Exception:
            return []

    def _notification_types(self, org, start):
        try:
            from apps.notifications.models import Notification
            qs = Notification.objects.filter(
                recipient__organisation=org,
                created_at__date__gte=start,
            ).values("notification_type").annotate(
                count=Count("id"),
                read=Count("id", filter=Q(read=True)),
                urgent=Count("id", filter=Q(is_urgent=True)),
            ).order_by("-count")
            return [
                {
                    "name":       r["notification_type"] or "general",
                    "value":      r["count"],
                    "read":       r["read"],
                    "urgent":     r["urgent"],
                    "read_rate":  _pct(r["read"], r["count"]),
                }
                for r in qs
            ]
        except Exception:
            return []

    def _leave_type_distribution(self, org, start):
        try:
            from apps.attendance.models import LeaveRequest
            qs = LeaveRequest.objects.filter(
                user__organisation=org,
                created_at__date__gte=start,
            ).values("leave_type", "status").annotate(count=Count("id"))
            result: dict = {}
            for r in qs:
                lt = r["leave_type"]
                if lt not in result:
                    result[lt] = {"name": lt.title(), "total": 0, "approved": 0, "pending": 0, "rejected": 0}
                result[lt]["total"]          += r["count"]
                result[lt][r["status"]]      = r["count"]
            return list(result.values())
        except Exception:
            return []

    def _user_role_breakdown(self, org):
        from apps.accounts.models import User
        qs = User.objects.filter(organisation=org, is_active=True).values("role").annotate(count=Count("id"))
        return [{"name": r["role"].replace("_", " ").title(), "value": r["count"]} for r in qs]

    # ── Insights engine ───────────────────────────────────────────────────────

    def _generate_insights(self, org, today):
        """
        Auto-generate plain-English insights from the data.
        Returns a list of insight dicts: {type, message, severity}
        """
        insights = []

        # Attendance insight
        try:
            from apps.attendance.models import AttendanceRecord
            week_att  = AttendanceRecord.objects.filter(
                user__organisation=org, date__gte=today - timedelta(days=7)
            )
            total     = week_att.count()
            present   = week_att.filter(status__in=["present", "late"]).count()
            rate      = _pct(present, total)
            if rate < 60:
                insights.append({
                    "type": "attendance", "severity": "critical",
                    "message": f"Attendance rate this week is critically low at {rate}%. Immediate HR review recommended.",
                    "icon": "alert",
                })
            elif rate < 80:
                insights.append({
                    "type": "attendance", "severity": "warning",
                    "message": f"Attendance rate of {rate}% is below the 80% target. Consider follow-up with supervisors.",
                    "icon": "warning",
                })
            else:
                insights.append({
                    "type": "attendance", "severity": "success",
                    "message": f"Strong attendance rate of {rate}% this week. Team is consistent.",
                    "icon": "check",
                })
        except Exception:
            pass

        # Overdue tasks insight
        try:
            from apps.tasks.models import Task
            overdue = Task.objects.filter(organisation=org, status="overdue").count()
            total   = Task.objects.filter(organisation=org).count()
            if overdue > 0:
                pct_overdue = _pct(overdue, total)
                insights.append({
                    "type": "tasks", "severity": "warning" if pct_overdue < 20 else "critical",
                    "message": f"{overdue} task{'s' if overdue > 1 else ''} ({pct_overdue}%) are overdue. Review workload distribution.",
                    "icon": "clock",
                })
        except Exception:
            pass

        # Equipment insight
        try:
            from apps.equipment.models import EquipmentItem
            repair_items = EquipmentItem.objects.filter(
                organisation=org, is_active=True, status="under_repair"
            ).count()
            if repair_items > 0:
                insights.append({
                    "type": "equipment", "severity": "warning",
                    "message": f"{repair_items} equipment item{'s' if repair_items > 1 else ''} currently under repair. Check maintenance SLAs.",
                    "icon": "tool",
                })
        except Exception:
            pass

        # MFA insight
        try:
            from apps.accounts.models import User
            users = User.objects.filter(organisation=org, is_active=True)
            total = users.count()
            mfa   = users.filter(mfa_enabled=True).count()
            if total > 0 and _pct(mfa, total) < 50:
                insights.append({
                    "type": "security", "severity": "critical",
                    "message": f"Only {mfa}/{total} users have MFA enabled ({_pct(mfa, total)}%). Enforce MFA organisation-wide immediately.",
                    "icon": "shield",
                })
        except Exception:
            pass

        return insights

    # ── Alerts ────────────────────────────────────────────────────────────────

    def _build_alerts(self, org, today):
        alerts = []

        try:
            from apps.equipment.models import CheckoutRequest
            overdue = CheckoutRequest.objects.filter(
                item__organisation=org, status="active", end_date__lt=today
            ).count()
            if overdue:
                alerts.append({
                    "type": "overdue_equipment", "level": "warning",
                    "message": f"{overdue} equipment item{'s' if overdue > 1 else ''} overdue for return",
                    "link": "/equipment",
                })
        except Exception:
            pass

        try:
            from apps.news.models import SoftwareSubscription
            expiring = SoftwareSubscription.objects.filter(
                organisation=org,
                expiry_date__lte=today + timedelta(days=7),
                expiry_date__gte=today,
                status="active",
            ).count()
            if expiring:
                alerts.append({
                    "type": "licence_expiring", "level": "critical",
                    "message": f"{expiring} software licence{'s' if expiring > 1 else ''} expiring within 7 days",
                    "link": "/subscriptions",
                })
        except Exception:
            pass

        try:
            from apps.fm_report.models import FMStation
            down = FMStation.objects.filter(organisation=org, current_status="off_air").count()
            if down:
                alerts.append({
                    "type": "fm_outage", "level": "critical",
                    "message": f"{down} FM station{'s' if down > 1 else ''} currently OFF AIR",
                    "link": "/fm-report",
                })
        except Exception:
            pass

        try:
            from apps.accounts.models import User
            no_mfa = User.objects.filter(
                organisation=org, is_active=True, mfa_enabled=False
            ).count()
            if no_mfa > 0:
                alerts.append({
                    "type": "security", "level": "warning",
                    "message": f"{no_mfa} user{'s' if no_mfa > 1 else ''} without MFA enabled",
                    "link": "/users",
                })
        except Exception:
            pass

        return alerts


# ─────────────────────────────────────────────────────────────────────────────
#  2. Attendance Analytics  — /analytics/attendance/
# ─────────────────────────────────────────────────────────────────────────────

class AttendanceAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.attendance.models import AttendanceRecord, LeaveRequest
        org         = request.user.organisation
        period_days = int(request.query_params.get("days", 30))
        dept_id     = request.query_params.get("department")
        start       = timezone.now().date() - timedelta(days=period_days)

        qs = AttendanceRecord.objects.filter(user__organisation=org, date__gte=start)
        if dept_id and dept_id != "all":
            qs = qs.filter(user__department_id=dept_id)

        agg = qs.aggregate(
            total=Count("id"),
            present=Count("id", filter=Q(status="present")),
            late=Count("id", filter=Q(status="late")),
            absent=Count("id", filter=Q(status="absent")),
            on_leave=Count("id", filter=Q(status="leave")),
            avg_hours=Avg("total_hours"),
            max_hours=Max("total_hours"),
            min_hours=Min("total_hours"),
            geofence_violations=Count("id", filter=Q(check_in_distance_metres__gt=200)),
        )

        # Per-user summary
        user_summary = list(
            qs.values("user__first_name", "user__last_name", "user__role")
            .annotate(
                present=Count("id", filter=Q(status__in=["present", "late"])),
                absent=Count("id", filter=Q(status="absent")),
                late=Count("id", filter=Q(status="late")),
                avg_hours=Avg("total_hours"),
            )
            .order_by("-present")[:20]
        )

        # Leave breakdown
        leaves = LeaveRequest.objects.filter(
            user__organisation=org,
            created_at__date__gte=start,
        ).values("leave_type", "status").annotate(count=Count("id"))

        # Weekday patterns
        weekday_pattern = list(
            qs.annotate(dow=ExtractWeekDay("date"))
            .values("dow")
            .annotate(
                present=Count("id", filter=Q(status__in=["present", "late"])),
                absent=Count("id", filter=Q(status="absent")),
            )
            .order_by("dow")
        )
        days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        weekday_data = [
            {
                "day":     days[r["dow"] - 1] if 1 <= r["dow"] <= 7 else str(r["dow"]),
                "present": r["present"],
                "absent":  r["absent"],
            }
            for r in weekday_pattern
        ]

        return Response({
            **{k: (round(float(v), 2) if isinstance(v, float) else v) for k, v in agg.items()},
            "attendance_rate":  _pct(agg["present"], agg["total"]),
            "late_rate":        _pct(agg["late"],    agg["total"]),
            "by_method":        list(qs.values("method").annotate(count=Count("id"))),
            "by_user":          user_summary,
            "leave_breakdown":  list(leaves),
            "weekday_pattern":  weekday_data,
            "period_days":      period_days,
        })


# ─────────────────────────────────────────────────────────────────────────────
#  3. Department Analytics  — /analytics/department/<dept_id>/
# ─────────────────────────────────────────────────────────────────────────────

class DepartmentAnalyticsView(APIView):
    """Full analytics drill-down for a single department."""
    permission_classes = [IsAuthenticated]

    def get(self, request, dept_id):
        from apps.accounts.models import Department, User
        from apps.attendance.models import AttendanceRecord
        from apps.tasks.models import Task

        org  = request.user.organisation
        days = int(request.query_params.get("days", 30))

        try:
            dept = Department.objects.get(id=dept_id, organisation=org)
        except Department.DoesNotExist:
            return Response({"error": "Department not found"}, status=http_status.HTTP_404_NOT_FOUND)

        start = timezone.now().date() - timedelta(days=days)
        users = User.objects.filter(department=dept, is_active=True)

        att = AttendanceRecord.objects.filter(user__in=users, date__gte=start)
        tasks = Task.objects.filter(
            Q(assigned_to__in=users) | Q(department=dept),
            organisation=org,
        )

        return Response({
            "department": {
                "id":   str(dept.id),
                "name": dept.name,
                "code": dept.code,
            },
            "users": {
                "total":     users.count(),
                "attachees": users.filter(role="attachee").count(),
                "staff":     users.exclude(role="attachee").count(),
                "by_role":   list(users.values("role").annotate(count=Count("id"))),
            },
            "attendance": {
                "total":           att.count(),
                "present":         att.filter(status__in=["present", "late"]).count(),
                "absent":          att.filter(status="absent").count(),
                "late":            att.filter(status="late").count(),
                "on_leave":        att.filter(status="leave").count(),
                "avg_hours":       att.aggregate(a=Avg("total_hours"))["a"],
                "attendance_rate": _pct(
                    att.filter(status__in=["present", "late"]).count(),
                    att.count()
                ),
            },
            "tasks": {
                "total":     tasks.count(),
                "approved":  tasks.filter(status="approved").count(),
                "overdue":   tasks.filter(status="overdue").count(),
                "pending":   tasks.filter(status="pending").count(),
                "completion_rate": _pct(
                    tasks.filter(status="approved").count(),
                    tasks.count()
                ),
                "by_priority": list(
                    tasks.values("priority").annotate(count=Count("id"))
                ),
            },
        })


# ─────────────────────────────────────────────────────────────────────────────
#  4. System Analytics  — /analytics/system/
# ─────────────────────────────────────────────────────────────────────────────

class SystemAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from core.models import AuditLog
        org   = request.user.organisation
        days  = int(request.query_params.get("days", 30))
        start = timezone.now().date() - timedelta(days=days)

        qs = AuditLog.objects.filter(
            user__organisation=org,
            created_at__date__gte=start,
        )

        # By resource type
        by_resource = list(
            qs.values("resource_type").annotate(count=Count("id")).order_by("-count")
        )

        # By action
        by_action = list(
            qs.values("action").annotate(count=Count("id")).order_by("-count")
        )

        # By user (top actors)
        by_user = list(
            qs.values("user__first_name", "user__last_name", "user__role")
            .annotate(count=Count("id"))
            .order_by("-count")[:10]
        )

        # Daily timeline
        daily = list(
            qs.annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(
                total=Count("id"),
                posts=Count("id", filter=Q(action="POST")),
                patches=Count("id", filter=Q(action="PATCH")),
            )
            .order_by("day")
        )

        # Hourly distribution
        hourly = list(
            qs.annotate(hour=ExtractHour("created_at"))
            .values("hour")
            .annotate(count=Count("id"))
            .order_by("hour")
        )

        # ── Response time stats from extra JSON ──────────────────────────────
        avg_ms = p50_ms = p95_ms = p99_ms = max_ms = 0
        response_buckets = []
        slow_count = 0
        try:
            sample = list(qs.filter(extra__has_key="duration_ms")[:1000])
            durations = sorted([
                e.extra.get("duration_ms", 0)
                for e in sample
                if isinstance(e.extra, dict) and e.extra.get("duration_ms") is not None
            ])
            if durations:
                n = len(durations)
                avg_ms   = round(sum(durations) / n, 1)
                p50_ms   = durations[int(n * 0.50)]
                p95_ms   = durations[int(n * 0.95)]
                p99_ms   = durations[int(n * 0.99)]
                max_ms   = max(durations)
                slow_count = sum(1 for d in durations if d > 1000)
                fast   = sum(1 for d in durations if d < 100)
                medium = sum(1 for d in durations if 100 <= d < 500)
                slow   = sum(1 for d in durations if 500 <= d < 1000)
                vslow  = sum(1 for d in durations if d >= 1000)
                response_buckets = [
                    {"key": "fast",      "name": "<100ms",    "value": fast,   "pct": round(fast   / n * 100, 1)},
                    {"key": "medium",    "name": "100–500ms", "value": medium, "pct": round(medium / n * 100, 1)},
                    {"key": "slow",      "name": "500ms–1s",  "value": slow,   "pct": round(slow   / n * 100, 1)},
                    {"key": "very_slow", "name": ">1s",       "value": vslow,  "pct": round(vslow  / n * 100, 1)},
                ]
        except Exception:
            pass

        # ── Security metrics ──────────────────────────────────────────────────
        mfa_users = mfa_adoption = blacklisted_tokens = failed_auth = active_sessions = 0
        jwt_issued = auth_calls = offhours_calls = 0
        try:
            from apps.accounts.models import User
            from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
            users_qs = User.objects.filter(organisation=org, is_active=True)
            total_users  = users_qs.count()
            mfa_users    = users_qs.filter(mfa_enabled=True).count()
            mfa_adoption = round(mfa_users / total_users * 100) if total_users else 0
        except Exception:
            pass
        try:
            from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
            blacklisted_tokens = BlacklistedToken.objects.filter(
                token__created_at__date__gte=start
            ).count()
        except Exception:
            pass
        try:
            failed_auth  = qs.filter(action="POST", resource_type="auth",
                                     extra__contains={"status": 401}).count()
            jwt_issued   = qs.filter(action="POST", resource_type__icontains="token").count()
            auth_calls   = qs.filter(resource_type__icontains="auth").count()
            offhours_calls = qs.filter(
                created_at__hour__gte=22
            ).count() + qs.filter(created_at__hour__lt=6).count()
        except Exception:
            pass

        # ── POST/PATCH counts ─────────────────────────────────────────────────
        post_count  = qs.filter(action="POST").count()
        patch_count = qs.filter(action="PATCH").count()

        # ── Slow endpoints (top 3 by avg duration) ────────────────────────────
        slow_endpoints: list = []
        try:
            ep_durations: dict = {}
            for e in sample:
                if not isinstance(getattr(e, "extra", None), dict):
                    continue
                ms  = e.extra.get("duration_ms", 0)
                res = getattr(e, "resource_type", None) or "unknown"
                if ms > 1000:
                    ep_durations.setdefault(res, []).append(ms)
            slow_endpoints = sorted(
                ep_durations.keys(),
                key=lambda k: sum(ep_durations[k]) / len(ep_durations[k]),
                reverse=True,
            )[:3]
        except Exception:
            pass

        # ── Format by_resource for frontend ──────────────────────────────────
        by_resource_fmt = [
            {
                "resource": r.get("resource_type", "unknown"),
                "total":    r.get("count", 0),
            }
            for r in by_resource
        ]

        # ── Format by_user for frontend ───────────────────────────────────────
        by_user_fmt = [
            {
                "name":  f"{u.get('user__first_name', '')} {u.get('user__last_name', '')}".strip() or "Unknown",
                "role":  u.get("user__role", ""),
                "calls": u.get("count", 0),
            }
            for u in by_user
        ]

        # ── Hourly with zero-padded hour strings ──────────────────────────────
        hourly_fmt = [
            {"hour": str(r["hour"]).zfill(2), "count": r["count"]}
            for r in hourly
        ]

        return Response({
            "summary": {
                "total_requests":    qs.count(),
                "post_count":        post_count,
                "patch_count":       patch_count,
                "avg_response_ms":   avg_ms,
                "p50_ms":            p50_ms,
                "p95_ms":            p95_ms,
                "p99_ms":            p99_ms,
                "max_response_ms":   max_ms,
                "slow_count":        slow_count,
                "slow_endpoints":    slow_endpoints,
                "response_buckets":  response_buckets,
                "unique_users":      qs.values("user_id").distinct().count(),
                # Security
                "mfa_users":         mfa_users,
                "mfa_adoption":      mfa_adoption,
                "blacklisted_tokens":blacklisted_tokens,
                "failed_auth":       failed_auth,
                "active_sessions":   active_sessions,
                "jwt_issued":        jwt_issued,
                "auth_calls":        auth_calls,
                "offhours_calls":    offhours_calls,
            },
            "by_resource":         by_resource_fmt,
            "by_action":           by_action,
            "by_user":             by_user_fmt,
            "daily":               [
                {
                    "date":    r["day"].strftime("%b %d"),
                    "total":   r["total"],
                    "posts":   r["posts"],
                    "patches": r["patches"],
                }
                for r in daily
            ],
            "hourly_distribution": hourly_fmt,
        })


# ─────────────────────────────────────────────────────────────────────────────
#  5. FM Analytics  — /analytics/fm/
# ─────────────────────────────────────────────────────────────────────────────

class FMAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            from apps.fm_report.models import FMStation, FMOutage, FMHeartbeat
            org   = request.user.organisation
            days  = int(request.query_params.get("days", 30))
            start = timezone.now().date() - timedelta(days=days)
            stations = FMStation.objects.filter(organisation=org)

            outages = FMOutage.objects.filter(
                station__in=stations,
                down_at__date__gte=start,
            )

            # Per-station summary
            station_summary = []
            for s in stations:
                s_outages = outages.filter(station=s)
                total_outage_mins = s_outages.aggregate(t=Sum("duration_minutes"))["t"] or 0
                max_mins = days * 1440
                uptime   = _pct(max_mins - total_outage_mins, max_mins)
                station_summary.append({
                    "name":            s.name,
                    "frequency":       s.frequency,
                    "current_status":  s.current_status,
                    "uptime_pct":      uptime,
                    "outage_count":    s_outages.count(),
                    "total_downtime":  total_outage_mins,
                })

            return Response({
                "stations":        station_summary,
                "total_outages":   outages.count(),
                "avg_outage_mins": round(outages.aggregate(a=Avg("duration_minutes"))["a"] or 0, 1),
                "by_severity":     list(
                    outages.values("severity").annotate(count=Count("id"))
                ),
                "period_days": days,
            })
        except Exception as e:
            return Response({"error": str(e)}, status=http_status.HTTP_500_INTERNAL_SERVER_ERROR)


# ─────────────────────────────────────────────────────────────────────────────
#  6. Export — /analytics/export/<module>/
#     Supports: attendance, fm-outages, equipment, tasks, users,
#               notifications, feedback, audit, certificates, wifi
# ─────────────────────────────────────────────────────────────────────────────

class ExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, module):
        org   = request.user.organisation
        today = timezone.now().date()
        start = request.query_params.get("start")
        end   = request.query_params.get("end")
        dept  = request.query_params.get("department")

        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = (
            f'attachment; filename="{org.code}-{module}-{today}.csv"'
        )
        response.write("\ufeff")  # UTF-8 BOM for Excel compatibility
        writer = csv.writer(response)

        # ── Attendance ────────────────────────────────────────────────────
        if module == "attendance":
            from apps.attendance.models import AttendanceRecord
            writer.writerow([
                "Date", "User", "Employee ID", "Department", "Role",
                "Check-In", "Check-Out", "Total Hours",
                "Status", "Method", "Late?",
                "Check-In Distance (m)", "Supervisor Approved", "Notes",
            ])
            qs = AttendanceRecord.objects.filter(
                user__organisation=org
            ).select_related("user", "user__department").order_by("-date")
            if start:  qs = qs.filter(date__gte=start)
            if end:    qs = qs.filter(date__lte=end)
            if dept and dept != "all":
                qs = qs.filter(user__department_id=dept)
            for r in qs:
                writer.writerow([
                    r.date,
                    f"{r.user.first_name} {r.user.last_name}",
                    r.user.employee_id,
                    r.user.department.name if r.user.department else "",
                    r.user.role,
                    r.check_in_time.strftime("%H:%M:%S")  if r.check_in_time  else "",
                    r.check_out_time.strftime("%H:%M:%S") if r.check_out_time else "",
                    round(float(r.total_hours), 2)        if r.total_hours    else "",
                    r.status,
                    r.method,
                    "Yes" if r.status == "late" else "No",
                    round(r.check_in_distance_metres or 0, 1),
                    "Yes" if r.supervisor_approved else "No",
                    r.notes or "",
                ])

        # ── FM Outages ────────────────────────────────────────────────────
        elif module == "fm-outages":
            from apps.fm_report.models import FMOutage
            writer.writerow([
                "Station", "Down At", "Restored At", "Duration (min)",
                "Severity", "Auto Detected", "Reported By",
                "Resolved By", "Alert Sent", "Description", "Resolution Notes",
            ])
            qs = FMOutage.objects.filter(
                station__organisation=org
            ).select_related("station", "reported_by", "resolved_by").order_by("-down_at")
            if start: qs = qs.filter(down_at__date__gte=start)
            if end:   qs = qs.filter(down_at__date__lte=end)
            for o in qs:
                writer.writerow([
                    o.station.name,
                    o.down_at.strftime("%Y-%m-%d %H:%M:%S"),
                    o.restored_at.strftime("%Y-%m-%d %H:%M:%S") if o.restored_at else "Ongoing",
                    o.duration_minutes or "",
                    o.severity,
                    "Yes" if o.auto_detected else "No",
                    f"{o.reported_by.first_name} {o.reported_by.last_name}" if o.reported_by else "Auto",
                    f"{o.resolved_by.first_name} {o.resolved_by.last_name}" if o.resolved_by else "",
                    "Yes" if o.alert_sent else "No",
                    o.description or "",
                    o.resolution_notes or "",
                ])

        # ── Equipment ─────────────────────────────────────────────────────
        elif module == "equipment":
            from apps.equipment.models import EquipmentItem
            writer.writerow([
                "Asset Tag", "Name", "Category", "Make", "Model",
                "Serial Number", "Status", "Condition", "Location",
                "Purchase Date", "Purchase Cost (KES)", "Current Value (KES)",
                "Active", "Notes",
            ])
            qs = EquipmentItem.objects.filter(
                organisation=org
            ).select_related("category").order_by("category__name", "name")
            for item in qs:
                writer.writerow([
                    item.asset_tag, item.name,
                    item.category.name if item.category else "",
                    item.make or "", item.model or "",
                    item.serial_number or "",
                    item.status, item.condition,
                    item.location or "",
                    item.purchase_date or "",
                    item.purchase_cost or "",
                    item.current_value or "",
                    "Yes" if item.is_active else "No",
                    item.notes or "",
                ])

        # ── Tasks ─────────────────────────────────────────────────────────
        elif module == "tasks":
            from apps.tasks.models import Task
            writer.writerow([
                "Title", "Priority", "Status", "Progress %",
                "Assigned To", "Assigned By", "Department",
                "Due Date", "Extended Due Date",
                "Submitted At", "Reviewed At",
                "Submission Notes", "Supervisor Feedback", "Overdue?",
            ])
            qs = Task.objects.filter(
                organisation=org
            ).select_related(
                "assigned_to", "assigned_by", "department"
            ).order_by("-created_at")
            if start: qs = qs.filter(created_at__date__gte=start)
            if end:   qs = qs.filter(created_at__date__lte=end)
            if dept and dept != "all":
                qs = qs.filter(department_id=dept)
            for t in qs:
                writer.writerow([
                    t.title, t.priority, t.status, t.progress_percent,
                    f"{t.assigned_to.first_name} {t.assigned_to.last_name}" if t.assigned_to else "",
                    f"{t.assigned_by.first_name} {t.assigned_by.last_name}" if t.assigned_by else "",
                    t.department.name if t.department else "",
                    t.due_date or "",
                    t.extended_due_date or "",
                    t.submitted_at.strftime("%Y-%m-%d %H:%M") if t.submitted_at else "",
                    t.reviewed_at.strftime("%Y-%m-%d %H:%M")  if t.reviewed_at  else "",
                    t.submission_notes or "",
                    t.supervisor_feedback or "",
                    "Yes" if t.status == "overdue" else "No",
                ])

        # ── Users ─────────────────────────────────────────────────────────
        elif module == "users":
            from apps.accounts.models import User
            writer.writerow([
                "Employee ID", "First Name", "Last Name", "Email",
                "Role", "Department", "Branch",
                "Active", "MFA Enabled", "Date Joined", "Last Login",
                "Timezone",
            ])
            qs = User.objects.filter(
                organisation=org
            ).select_related("department", "branch").order_by("last_name")
            if dept and dept != "all":
                qs = qs.filter(department_id=dept)
            for u in qs:
                writer.writerow([
                    u.employee_id, u.first_name, u.last_name, u.email,
                    u.role,
                    u.department.name if u.department else "",
                    u.branch.name if u.branch else "",
                    "Yes" if u.is_active else "No",
                    "Yes" if u.mfa_enabled else "No",
                    u.date_joined.strftime("%Y-%m-%d") if u.date_joined else "",
                    u.last_login.strftime("%Y-%m-%d %H:%M") if u.last_login else "Never",
                    u.timezone_preference or "",
                ])

        # ── Audit Log ─────────────────────────────────────────────────────
        elif module == "audit":
            from core.models import AuditLog
            writer.writerow([
                "Timestamp", "User", "Action", "Resource Type",
                "Resource ID", "IP Address", "Status Code", "Duration (ms)",
            ])
            qs = AuditLog.objects.filter(
                user__organisation=org
            ).select_related("user").order_by("-created_at")
            if start: qs = qs.filter(created_at__date__gte=start)
            if end:   qs = qs.filter(created_at__date__lte=end)
            for a in qs[:5000]:  # cap at 5000 rows
                extra = a.extra if isinstance(a.extra, dict) else {}
                writer.writerow([
                    a.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                    f"{a.user.first_name} {a.user.last_name}" if a.user else "System",
                    a.action, a.resource_type, a.resource_id or "",
                    a.ip_address or "",
                    extra.get("status_code", ""),
                    extra.get("duration_ms", ""),
                ])

        # ── Notifications ─────────────────────────────────────────────────
        elif module == "notifications":
            from apps.notifications.models import Notification
            writer.writerow([
                "Title", "Type", "Recipient", "Sent At",
                "Read", "Read At", "Urgent", "Push Sent", "Email Sent",
            ])
            qs = Notification.objects.filter(
                recipient__organisation=org
            ).select_related("recipient").order_by("-created_at")
            if start: qs = qs.filter(created_at__date__gte=start)
            if end:   qs = qs.filter(created_at__date__lte=end)
            for n in qs:
                writer.writerow([
                    n.title, n.notification_type,
                    f"{n.recipient.first_name} {n.recipient.last_name}",
                    n.created_at.strftime("%Y-%m-%d %H:%M"),
                    "Yes" if n.read else "No",
                    n.read_at.strftime("%Y-%m-%d %H:%M") if n.read_at else "",
                    "Yes" if n.is_urgent else "No",
                    "Yes" if n.push_sent else "No",
                    "Yes" if n.email_sent else "No",
                ])

        # ── Feedback ──────────────────────────────────────────────────────
        elif module == "feedback":
            from apps.feedback.models import FeedbackTicket
            writer.writerow([
                "Ticket #", "Category", "Title", "Priority", "Status",
                "Submitted By", "Created", "Resolved At", "Response",
            ])
            qs = FeedbackTicket.objects.filter(
                submitted_by__organisation=org
            ).select_related("submitted_by", "resolved_by").order_by("-created_at")
            for t in qs:
                writer.writerow([
                    t.ticket_number, t.category, t.title, t.priority, t.status,
                    f"{t.submitted_by.first_name} {t.submitted_by.last_name}",
                    t.created_at.strftime("%Y-%m-%d %H:%M"),
                    t.resolved_at.strftime("%Y-%m-%d %H:%M") if t.resolved_at else "",
                    t.admin_response or "",
                ])

        # ── Certificates ──────────────────────────────────────────────────
        elif module == "certificates":
            from apps.certificates.models import Certificate
            writer.writerow([
                "Certificate #", "Type", "Status", "Recipient",
                "Issue Date", "Signed By", "Title", "QR Code",
            ])
            qs = Certificate.objects.filter(
                organisation=org
            ).select_related("recipient", "issued_by").order_by("-created_at")
            for c in qs:
                writer.writerow([
                    c.certificate_number, c.certificate_type, c.status,
                    f"{c.recipient.first_name} {c.recipient.last_name}",
                    c.issue_date,
                    c.signed_by_name or "", c.signed_by_title or "",
                    c.qr_verification_code or "",
                ])

        # ── Wi-Fi Grants ──────────────────────────────────────────────────
        elif module == "wifi":
            from apps.wifi.models import WifiGrant
            writer.writerow([
                "Requested By", "Device Type", "MAC Address",
                "Purpose", "Status", "Duration (days)",
                "Created", "Expires", "Reviewed By",
            ])
            qs = WifiGrant.objects.filter(
                requested_by__organisation=org
            ).select_related("requested_by", "reviewed_by").order_by("-created_at")
            for g in qs:
                writer.writerow([
                    f"{g.requested_by.first_name} {g.requested_by.last_name}",
                    g.device_type, g.mac_address, g.purpose, g.status,
                    g.duration_days,
                    g.created_at.strftime("%Y-%m-%d %H:%M"),
                    g.expires_at.strftime("%Y-%m-%d %H:%M") if g.expires_at else "",
                    f"{g.reviewed_by.first_name} {g.reviewed_by.last_name}" if g.reviewed_by else "",
                ])

        # ── Full organisation report (multi-sheet summary in one CSV) ─────
        elif module == "full-report":
            writer.writerow(["=== NEXUS FULL ORGANISATION REPORT ===", f"Generated: {today}", f"Org: {org.name}"])
            writer.writerow([])

            # Users summary
            from apps.accounts.models import User
            users = User.objects.filter(organisation=org, is_active=True)
            writer.writerow(["--- USERS ---"])
            writer.writerow(["Total Active", "Attachees", "MFA Enabled"])
            writer.writerow([users.count(), users.filter(role="attachee").count(), users.filter(mfa_enabled=True).count()])
            writer.writerow([])

            # Tasks summary
            from apps.tasks.models import Task
            tasks = Task.objects.filter(organisation=org)
            writer.writerow(["--- TASKS ---"])
            writer.writerow(["Total", "Approved", "Overdue", "Pending"])
            writer.writerow([
                tasks.count(),
                tasks.filter(status="approved").count(),
                tasks.filter(status="overdue").count(),
                tasks.filter(status="pending").count(),
            ])
            writer.writerow([])

            # Attendance summary
            from apps.attendance.models import AttendanceRecord
            att_30 = AttendanceRecord.objects.filter(
                user__organisation=org, date__gte=today - timedelta(days=30)
            )
            writer.writerow(["--- ATTENDANCE (LAST 30 DAYS) ---"])
            writer.writerow(["Present", "Absent", "Late", "On Leave"])
            writer.writerow([
                att_30.filter(status="present").count(),
                att_30.filter(status="absent").count(),
                att_30.filter(status="late").count(),
                att_30.filter(status="leave").count(),
            ])

        else:
            writer.writerow(["Error", f"Unknown module: {module}"])
            writer.writerow(["Available modules:", "attendance, fm-outages, equipment, tasks, users, audit, notifications, feedback, certificates, wifi, full-report"])

        return response


# ─────────────────────────────────────────────────────────────────────────────
#  7. Admin Dashboard Overview  — /analytics/admin-overview/
# ─────────────────────────────────────────────────────────────────────────────

class AdminDashboardOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        org   = request.user.organisation
        today = timezone.now().date()

        dashboard = AnalyticsDashboardView()
        dashboard.request = request

        alerts   = dashboard._build_alerts(org, today)
        insights = dashboard._generate_insights(org, today)

        try:
            from core.models import AuditLog
            activity = AuditLog.objects.filter(
                user__organisation=org
            ).select_related("user").order_by("-created_at")[:20]
            activity_data = [
                {
                    "user_name":  f"{a.user.first_name} {a.user.last_name}" if a.user else "System",
                    "action":     a.action.lower(),
                    "resource":   a.resource_type.replace("_", " "),
                    "timestamp":  a.created_at.isoformat(),
                    "status_code": (a.extra or {}).get("status_code") if isinstance(a.extra, dict) else None,
                }
                for a in activity
            ]
        except Exception:
            activity_data = []

        stats = dashboard._get_stats(org, today, timezone.now())

        return Response({
            "stats":    stats,
            "alerts":   alerts,
            "insights": insights,
            "activity": activity_data,
            "charts": {
                "attendance_trend": dashboard._attendance_trend(org, today - timedelta(days=14), today),
                "task_status":      dashboard._task_status(org),
                "audit_timeline":   dashboard._audit_timeline(org, today - timedelta(days=7), today),
            },
        })