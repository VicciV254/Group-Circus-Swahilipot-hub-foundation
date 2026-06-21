"""
Nexus Attendance — Department/Supervisor Dashboard Views
Adds to apps/attendance/views.py (or import from here in urls.py)

Endpoints:
  GET  /attendance/dept/overview/         — dept + branch summary stats
  GET  /attendance/dept/members/          — all members with absence/late counts
  GET  /attendance/dept/absentees/        — members absent N+ days (not on leave)
  GET  /attendance/dept/late-comers/      — members with late arrivals
  GET  /attendance/dept/trends/           — 30-day daily trend (present/absent/late)
  POST /attendance/dept/warn/<user_id>/   — send warning message to user
  POST /attendance/dept/deactivate/<user_id>/ — manually deactivate user account

Auto-enforcement (called internally + can be triggered via cron):
  POST /attendance/dept/auto-enforce/     — run auto-warn + auto-deactivate rules
"""
from datetime import date, timedelta
from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import serializers

from .models import AttendanceRecord, LeaveRequest

User = get_user_model()

SUPERVISOR_ROLES = {'supervisor', 'department_leader', 'hr_officer', 'system_admin'}

# ── Thresholds ────────────────────────────────────────────────────────────────
ABSENT_WARN_THRESHOLD      = 3   # warn after 3 unexcused absences
ABSENT_DEACTIVATE_THRESHOLD = 5  # deactivate after 5 unexcused absences (configurable)
LATE_WARN_THRESHOLD        = 3   # warn after 3 late check-ins
LATE_DEACTIVATE_THRESHOLD  = 10  # deactivate after 10 late check-ins


def _require_supervisor(user):
    """Returns True if the user may use dept dashboards."""
    return user.role in SUPERVISOR_ROLES


def _dept_users(requesting_user):
    """Return the User queryset scoped to the requester's department / org."""
    u = requesting_user
    qs = User.objects.filter(is_active=True).select_related('department', 'branch')
    if u.role == 'system_admin':
        return qs.filter(organisation=u.organisation)
    if u.role in ('hr_officer', 'executive'):
        return qs.filter(organisation=u.organisation)
    # supervisor / department_leader — their own department only
    return qs.filter(department=u.department)


def _approved_leave_dates(user_id, start, end):
    """Return a set of dates where a user has an approved leave overlapping [start, end]."""
    leaves = LeaveRequest.objects.filter(
        user_id=user_id, status='approved',
        start_date__lte=end, end_date__gte=start,
    )
    leave_dates = set()
    for lv in leaves:
        d = lv.start_date
        while d <= lv.end_date:
            if start <= d <= end:
                leave_dates.add(d)
            d += timedelta(days=1)
    return leave_dates


def _workdays_in_range(start: date, end: date):
    """Return list of Mon–Fri dates between start and end (inclusive)."""
    days = []
    d = start
    while d <= end:
        if d.weekday() < 5:  # Mon=0, Fri=4
            days.append(d)
        d += timedelta(days=1)
    return days


def _member_stats(member, start, end):
    """
    Calculate attendance stats for a single user over [start, end].
    Returns dict with counts and flag lists.
    """
    records = AttendanceRecord.objects.filter(user=member, date__range=(start, end))
    rec_by_date = {r.date: r for r in records}
    workdays = _workdays_in_range(start, end)
    leave_dates = _approved_leave_dates(member.id, start, end)

    present = late = absent = half_day = on_leave = 0
    absent_dates = []
    late_dates = []

    for d in workdays:
        if d > date.today():
            continue
        if d in leave_dates:
            on_leave += 1
            continue
        rec = rec_by_date.get(d)
        if rec is None:
            absent += 1
            absent_dates.append(str(d))
        elif rec.status == 'late':
            late += 1
            late_dates.append(str(d))
            present += 1  # still attended
        elif rec.status in ('present', 'half_day'):
            if rec.status == 'half_day':
                half_day += 1
            present += 1
        elif rec.status == 'absent':
            absent += 1
            absent_dates.append(str(d))

    total_workdays = len([d for d in workdays if d <= date.today()])
    return {
        'user_id':    str(member.id),
        'name':       member.full_name,
        'email':      member.email,
        'role':       member.get_role_display(),
        'department': member.department.name if member.department else '—',
        'branch':     member.branch.name if member.branch else '—',
        'present':    present,
        'absent':     absent,
        'late':       late,
        'half_day':   half_day,
        'on_leave':   on_leave,
        'total_workdays': total_workdays,
        'attendance_rate': round((present / total_workdays * 100), 1) if total_workdays else 0,
        'absent_dates': absent_dates,
        'late_dates':   late_dates,
        # Flags for automatic actions
        'needs_absent_warning':     absent >= ABSENT_WARN_THRESHOLD,
        'needs_absent_deactivation': absent >= ABSENT_DEACTIVATE_THRESHOLD,
        'needs_late_warning':       late >= LATE_WARN_THRESHOLD,
        'needs_late_deactivation':  late >= LATE_DEACTIVATE_THRESHOLD,
    }


# ── 1. Overview ───────────────────────────────────────────────────────────────
class DeptOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _require_supervisor(request.user):
            return Response({'detail': 'Permission denied.'}, status=403)

        u = request.user
        dept_users = _dept_users(u)
        today = date.today()
        start_of_month = today.replace(day=1)

        # Today's records
        today_records = AttendanceRecord.objects.filter(
            user__in=dept_users, date=today
        ).select_related('user')

        present_today  = today_records.filter(status__in=['present', 'late', 'half_day']).count()
        late_today     = today_records.filter(status='late').count()
        absent_today   = dept_users.count() - today_records.filter(
            check_in_time__isnull=False
        ).count()

        # Branch info
        branch = u.branch
        branch_user_count = User.objects.filter(
            branch=branch, is_active=True
        ).count() if branch else None

        # Pending leaves
        pending_leaves = LeaveRequest.objects.filter(
            user__in=dept_users, status='pending'
        ).count()

        # Members needing action (last 30 days)
        end = today
        start = today - timedelta(days=30)
        members = list(dept_users)
        needs_warning = 0
        needs_deactivation = 0
        for m in members:
            stats = _member_stats(m, start, end)
            if stats['needs_absent_warning'] or stats['needs_late_warning']:
                needs_warning += 1
            if stats['needs_absent_deactivation'] or stats['needs_late_deactivation']:
                needs_deactivation += 1

        return Response({
            'department': {
                'name': u.department.name if u.department else 'All Departments',
                'total_members': dept_users.count(),
            },
            'branch': {
                'name': branch.name if branch else '—',
                'total_members': branch_user_count,
            },
            'today': {
                'date': str(today),
                'present': present_today,
                'late': late_today,
                'absent': absent_today,
                'checked_in': today_records.filter(check_in_time__isnull=False).count(),
            },
            'alerts': {
                'pending_leaves': pending_leaves,
                'members_needing_warning': needs_warning,
                'members_needing_deactivation': needs_deactivation,
            },
        })


# ── 2. All Members with Stats ─────────────────────────────────────────────────
class DeptMembersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _require_supervisor(request.user):
            return Response({'detail': 'Permission denied.'}, status=403)

        days = int(request.query_params.get('days', 30))
        end = date.today()
        start = end - timedelta(days=days)

        dept_users = _dept_users(request.user)
        result = [_member_stats(m, start, end) for m in dept_users]
        result.sort(key=lambda x: x['absent'], reverse=True)

        return Response({
            'period': {'start': str(start), 'end': str(end), 'days': days},
            'members': result,
        })


# ── 3. Absentees ──────────────────────────────────────────────────────────────
class DeptAbsenteesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _require_supervisor(request.user):
            return Response({'detail': 'Permission denied.'}, status=403)

        min_absences = int(request.query_params.get('min', 1))
        days = int(request.query_params.get('days', 30))
        end = date.today()
        start = end - timedelta(days=days)

        dept_users = _dept_users(request.user)
        absentees = []
        for m in dept_users:
            s = _member_stats(m, start, end)
            if s['absent'] >= min_absences:
                absentees.append(s)

        absentees.sort(key=lambda x: x['absent'], reverse=True)
        return Response({
            'period': {'start': str(start), 'end': str(end)},
            'min_absences': min_absences,
            'count': len(absentees),
            'thresholds': {
                'warn_at': ABSENT_WARN_THRESHOLD,
                'deactivate_at': ABSENT_DEACTIVATE_THRESHOLD,
            },
            'absentees': absentees,
        })


# ── 4. Late Comers ────────────────────────────────────────────────────────────
class DeptLateComersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _require_supervisor(request.user):
            return Response({'detail': 'Permission denied.'}, status=403)

        min_late = int(request.query_params.get('min', 1))
        days = int(request.query_params.get('days', 30))
        end = date.today()
        start = end - timedelta(days=days)

        dept_users = _dept_users(request.user)
        late_comers = []
        for m in dept_users:
            s = _member_stats(m, start, end)
            if s['late'] >= min_late:
                late_comers.append(s)

        late_comers.sort(key=lambda x: x['late'], reverse=True)
        return Response({
            'period': {'start': str(start), 'end': str(end)},
            'min_late': min_late,
            'count': len(late_comers),
            'thresholds': {
                'warn_at': LATE_WARN_THRESHOLD,
                'deactivate_at': LATE_DEACTIVATE_THRESHOLD,
            },
            'late_comers': late_comers,
        })


# ── 5. Attendance Trends ──────────────────────────────────────────────────────
class DeptTrendsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _require_supervisor(request.user):
            return Response({'detail': 'Permission denied.'}, status=403)

        days = int(request.query_params.get('days', 30))
        end = date.today()
        start = end - timedelta(days=days)

        dept_users = _dept_users(request.user)
        user_ids = list(dept_users.values_list('id', flat=True))
        total_members = len(user_ids)

        records = AttendanceRecord.objects.filter(
            user_id__in=user_ids, date__range=(start, end)
        ).values('date', 'status').annotate(count=Count('id'))

        daily = {}
        d = start
        while d <= end:
            if d.weekday() < 5:
                daily[str(d)] = {'date': str(d), 'present': 0, 'late': 0, 'absent': 0, 'half_day': 0, 'on_leave': 0}
            d += timedelta(days=1)

        for row in records:
            key = str(row['date'])
            if key not in daily:
                continue
            s = row['status']
            if s in ('present',):
                daily[key]['present'] += row['count']
            elif s == 'late':
                daily[key]['late'] += row['count']
                daily[key]['present'] += row['count']  # also present
            elif s == 'absent':
                daily[key]['absent'] += row['count']
            elif s == 'half_day':
                daily[key]['half_day'] += row['count']
                daily[key]['present'] += row['count']
            elif s == 'leave':
                daily[key]['on_leave'] += row['count']

        # Fill in implied absences (no record = absent)
        for key, day_data in daily.items():
            if date.fromisoformat(key) <= date.today():
                accounted = day_data['present'] + day_data['absent'] + day_data['on_leave']
                day_data['absent'] += max(0, total_members - accounted)

        trend_list = sorted(daily.values(), key=lambda x: x['date'])

        # Summary
        all_present = sum(d['present'] for d in trend_list)
        all_absent  = sum(d['absent'] for d in trend_list)
        all_late    = sum(d['late'] for d in trend_list)
        total_slots = max(all_present + all_absent, 1)

        return Response({
            'period': {'start': str(start), 'end': str(end), 'days': days},
            'total_members': total_members,
            'summary': {
                'avg_present_rate': round(all_present / total_slots * 100, 1),
                'avg_absent_rate':  round(all_absent  / total_slots * 100, 1),
                'avg_late_rate':    round(all_late     / max(all_present, 1) * 100, 1),
            },
            'trend': trend_list,
        })


# ── 6. Send Warning ───────────────────────────────────────────────────────────
class SendWarningView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        if not _require_supervisor(request.user):
            return Response({'detail': 'Permission denied.'}, status=403)

        try:
            target = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=404)

        # Ensure target is in requester's scope
        scoped = _dept_users(request.user)
        if not scoped.filter(id=user_id).exists():
            return Response({'detail': 'User not in your department.'}, status=403)

        reason     = request.data.get('reason', 'attendance')   # 'attendance' | 'lateness'
        custom_msg = request.data.get('message', '')

        default_messages = {
            'attendance': (
                f"Dear {target.first_name}, this is a formal warning regarding your "
                f"attendance record. You have accumulated multiple unexcused absences "
                f"which is in violation of our attendance policy. Please ensure regular "
                f"attendance going forward. Failure to improve may result in further "
                f"disciplinary action."
            ),
            'lateness': (
                f"Dear {target.first_name}, this is a formal warning regarding repeated "
                f"late check-ins. You have been late on multiple occasions this month. "
                f"Please ensure punctual arrival. Continued lateness may result in account "
                f"suspension."
            ),
        }

        message = custom_msg or default_messages.get(reason, default_messages['attendance'])

        # ── Send notification (email / push / sms based on preferences) ──
        # In production, hook to Celery tasks / django-notifications / Firebase
        # For now: log + return the message payload
        sent_via = []

        if target.notification_email and target.email:
            # send_attendance_warning_email.delay(target.id, message)
            sent_via.append('email')

        if target.notification_sms and target.phone:
            # send_sms_warning.delay(target.phone, message)
            sent_via.append('sms')

        if target.notification_push and target.fcm_token:
            # send_push_warning.delay(target.fcm_token, 'Attendance Warning', message)
            sent_via.append('push')

        # Audit log entry (optional — plug in your AuditLog model)
        # AuditLog.objects.create(user=request.user, action='send_warning',
        #     description=f"Warning sent to {target.email}: {reason}")

        return Response({
            'detail': f'Warning sent to {target.full_name}.',
            'sent_via': sent_via,
            'message_preview': message,
            'target': {'id': str(target.id), 'name': target.full_name, 'email': target.email},
        })


# ── 7. Deactivate Account ─────────────────────────────────────────────────────
class DeactivateUserView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        if not _require_supervisor(request.user):
            return Response({'detail': 'Permission denied.'}, status=403)

        try:
            target = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=404)

        scoped = _dept_users(request.user)
        if not scoped.filter(id=user_id).exists():
            return Response({'detail': 'User not in your scope.'}, status=403)

        if target == request.user:
            return Response({'detail': 'You cannot deactivate yourself.'}, status=400)

        reason = request.data.get('reason', 'Attendance policy violation.')
        target.is_active = False
        target.save(update_fields=['is_active'])

        # AuditLog.objects.create(user=request.user, action='deactivate_user',
        #     description=f"Account deactivated: {target.email}. Reason: {reason}")

        return Response({
            'detail': f'{target.full_name}\'s account has been deactivated.',
            'reason': reason,
            'target': {'id': str(target.id), 'name': target.full_name, 'email': target.email},
        })


# ── 8. Auto-Enforce (cron / manual trigger) ───────────────────────────────────
class AutoEnforceView(APIView):
    """
    Run the automatic enforcement rules for the department/org.
    Called by a cron job daily, or manually by HR/admin.
    Returns a report of actions taken.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in {'system_admin', 'hr_officer', 'department_leader'}:
            return Response({'detail': 'Permission denied.'}, status=403)

        dry_run = request.data.get('dry_run', False)
        days = 30
        end = date.today()
        start = end - timedelta(days=days)

        dept_users = _dept_users(request.user)
        warned    = []
        deactivated = []

        for member in dept_users:
            stats = _member_stats(member, start, end)

            # --- Auto-deactivate (stronger check first) ---
            if stats['needs_absent_deactivation'] or stats['needs_late_deactivation']:
                reason = []
                if stats['needs_absent_deactivation']:
                    reason.append(f"{stats['absent']} unexcused absences")
                if stats['needs_late_deactivation']:
                    reason.append(f"{stats['late']} late arrivals")
                reason_str = ', '.join(reason)

                if not dry_run and member.is_active:
                    member.is_active = False
                    member.save(update_fields=['is_active'])

                deactivated.append({
                    'user': member.full_name,
                    'email': member.email,
                    'reason': reason_str,
                    'dry_run': dry_run,
                })

            # --- Auto-warn ---
            elif stats['needs_absent_warning'] or stats['needs_late_warning']:
                reason = []
                if stats['needs_absent_warning']:
                    reason.append(f"{stats['absent']} absences")
                if stats['needs_late_warning']:
                    reason.append(f"{stats['late']} late arrivals")

                # if not dry_run: send_warning_notification(member, reason)
                warned.append({
                    'user': member.full_name,
                    'email': member.email,
                    'reason': ', '.join(reason),
                    'dry_run': dry_run,
                })

        return Response({
            'dry_run': dry_run,
            'period': {'start': str(start), 'end': str(end)},
            'thresholds': {
                'absent_warn': ABSENT_WARN_THRESHOLD,
                'absent_deactivate': ABSENT_DEACTIVATE_THRESHOLD,
                'late_warn': LATE_WARN_THRESHOLD,
                'late_deactivate': LATE_DEACTIVATE_THRESHOLD,
            },
            'actions': {
                'warned_count': len(warned),
                'deactivated_count': len(deactivated),
                'warned': warned,
                'deactivated': deactivated,
            },
        })


# ── 9. Today's Snapshot ───────────────────────────────────────────────────────
class DeptTodaySnapshotView(APIView):
    """Who is in / out / absent right now."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _require_supervisor(request.user):
            return Response({'detail': 'Permission denied.'}, status=403)

        today = date.today()
        dept_users = _dept_users(request.user)
        records = AttendanceRecord.objects.filter(
            user__in=dept_users, date=today
        ).select_related('user')

        checked_in_ids = {r.user_id for r in records if r.check_in_time}
        checked_out_ids = {r.user_id for r in records if r.check_out_time}

        on_leave_ids = set(
            LeaveRequest.objects.filter(
                user__in=dept_users,
                status='approved',
                start_date__lte=today,
                end_date__gte=today,
            ).values_list('user_id', flat=True)
        )

        present_now = []
        absent_today = []
        on_leave_today = []

        for u in dept_users:
            info = {
                'id': str(u.id),
                'name': u.full_name,
                'role': u.get_role_display(),
                'department': u.department.name if u.department else '—',
            }
            if u.id in on_leave_ids:
                on_leave_today.append(info)
            elif u.id in checked_in_ids:
                rec = next(r for r in records if r.user_id == u.id)
                info['check_in'] = rec.check_in_time.strftime('%H:%M') if rec.check_in_time else None
                info['check_out'] = rec.check_out_time.strftime('%H:%M') if rec.check_out_time else None
                info['status'] = rec.status
                info['still_in'] = rec.check_in_time is not None and rec.check_out_time is None
                present_now.append(info)
            else:
                absent_today.append(info)

        return Response({
            'date': str(today),
            'summary': {
                'present': len(present_now),
                'absent': len(absent_today),
                'on_leave': len(on_leave_today),
                'total': dept_users.count(),
            },
            'present': present_now,
            'absent': absent_today,
            'on_leave': on_leave_today,
        })