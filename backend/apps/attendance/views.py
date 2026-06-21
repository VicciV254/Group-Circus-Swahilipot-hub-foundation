"""Nexus Attendance — Views & Serializers (split from models.py)"""
from django.utils import timezone
from rest_framework import serializers, generics
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AttendanceRecord, LeaveRequest, haversine_distance


# ─── SERIALIZERS ──────────────────────────────────────────────────────────────

class AttendanceRecordSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    is_checked_in = serializers.SerializerMethodField()

    class Meta:  # type: ignore
        model = AttendanceRecord
        fields = '__all__'

    def get_is_checked_in(self, obj):
        return obj.check_in_time is not None and obj.check_out_time is None


class CheckInSerializer(serializers.Serializer):
    latitude  = serializers.DecimalField(max_digits=10, decimal_places=7)
    longitude = serializers.DecimalField(max_digits=10, decimal_places=7)
    method    = serializers.ChoiceField(choices=['gps', 'qr', 'facial', 'manual'], default='gps')
    qr_code   = serializers.CharField(required=False, allow_blank=True)


class CheckOutSerializer(serializers.Serializer):
    latitude  = serializers.DecimalField(max_digits=10, decimal_places=7)
    longitude = serializers.DecimalField(max_digits=10, decimal_places=7)


class LeaveSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)

    class Meta:  # type: ignore
        model = LeaveRequest
        fields = '__all__'
        read_only_fields = ['user', 'reviewed_by', 'reviewed_at']


# ─── REVIEW ROLES ─────────────────────────────────────────────────────────────

REVIEW_ROLES = {'system_admin', 'hr_officer', 'supervisor', 'department_leader', 'executive'}


# ─── VIEWS ────────────────────────────────────────────────────────────────────

class TodayAttendanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.now().date()
        record = AttendanceRecord.objects.filter(user=request.user, date=today).first()
        if not record:
            return Response(None)
        return Response(AttendanceRecordSerializer(record).data)


class CheckInView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CheckInSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        user  = request.user
        today = timezone.now().date()

        existing = AttendanceRecord.objects.filter(user=user, date=today).first()
        if existing and existing.check_in_time:
            return Response({'detail': 'Already checked in today'}, status=400)

        lat = serializer.validated_data['latitude']
        lon = serializer.validated_data['longitude']

        distance = None
        if user.branch and user.branch.latitude and user.branch.longitude:
            distance = haversine_distance(
                user.branch.latitude, user.branch.longitude, lat, lon
            )
            radius = user.branch.geofence_radius
            if distance > radius and serializer.validated_data['method'] == 'gps':
                return Response({
                    'detail': f'You are {int(distance)}m from the workplace. Must be within {radius}m to check in.',
                    'distance': int(distance),
                    'allowed_radius': radius,
                }, status=400)

        record, _ = AttendanceRecord.objects.get_or_create(user=user, date=today)
        record.check_in_time             = timezone.now()
        record.check_in_latitude         = lat
        record.check_in_longitude        = lon
        record.check_in_distance_metres  = distance
        record.method                    = serializer.validated_data['method']
        record.qr_code_used              = serializer.validated_data.get('qr_code', '')
        record.status = 'late' if timezone.now().hour >= 9 else 'present'
        record.save()
        return Response(AttendanceRecordSerializer(record).data, status=201)


class CheckOutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user  = request.user
        today = timezone.now().date()

        record = AttendanceRecord.objects.filter(
            user=user, date=today,
            check_in_time__isnull=False,
            check_out_time__isnull=True,
        ).first()

        if not record:
            return Response({'detail': 'No active check-in found for today'}, status=400)

        serializer = CheckOutSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        record.check_out_time      = timezone.now()
        record.check_out_latitude  = serializer.validated_data['latitude']
        record.check_out_longitude = serializer.validated_data['longitude']

        if record.check_in_time and record.check_out_time:
            delta = record.check_out_time - record.check_in_time
            if delta.total_seconds() < 14400:
                record.status = 'half_day'

        record.save()
        return Response(AttendanceRecordSerializer(record).data)


class AttendanceHistoryView(generics.ListAPIView):
    serializer_class   = AttendanceRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ['supervisor', 'department_leader', 'hr_officer', 'system_admin']:
            qs = AttendanceRecord.objects.filter(user__organisation=user.organisation)
            dept        = self.request.query_params.get('department')
            target_user = self.request.query_params.get('user_id')
            if dept:
                qs = qs.filter(user__department_id=dept)
            if target_user:
                qs = qs.filter(user_id=target_user)
            return qs
        return AttendanceRecord.objects.filter(user=user)


class LeaveRequestListCreateView(generics.ListCreateAPIView):
    serializer_class   = LeaveSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in REVIEW_ROLES:
            return LeaveRequest.objects.filter(user__organisation=user.organisation)
        return LeaveRequest.objects.filter(user=user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class LeaveRequestDetailView(generics.RetrieveUpdateAPIView):
    """GET + PATCH — reviewers only for PATCH."""
    serializer_class   = LeaveSerializer
    permission_classes = [IsAuthenticated]
    http_method_names  = ['get', 'patch', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        if user.role in REVIEW_ROLES:
            return LeaveRequest.objects.filter(user__organisation=user.organisation)
        return LeaveRequest.objects.filter(user=user)

    def perform_update(self, serializer):
        user = self.request.user
        if user.role not in REVIEW_ROLES:
            raise PermissionDenied("You do not have permission to review leave requests.")
        serializer.save(reviewed_by=user, reviewed_at=timezone.now())

class GeofenceViolationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        today = timezone.now().date()

        record = AttendanceRecord.objects.filter(
            user=user,
            date=today,
            check_in_time__isnull=False,
            check_out_time__isnull=True,
        ).first()

        if not record:
            return Response({'detail': 'No active check-in session found'}, status=400)

        lat      = request.data.get('latitude')
        lon      = request.data.get('longitude')
        distance = request.data.get('distance_from_workplace')

        if not all([lat, lon, distance]):
            return Response({'detail': 'latitude, longitude and distance_from_workplace are required'}, status=400)

        violation = GeofenceViolation.objects.create(
            attendance=record,
            user=user,
            latitude=lat,
            longitude=lon,
            distance_from_workplace=distance,
            alert_sent=True,
        )

        # ── Email alert ────────────────────────────────────────────────────
        recipients = []

        # 1. Department leader
        if hasattr(user, 'department') and user.department:
            try:
                from apps.accounts.models import User as AccountUser
                leader = AccountUser.objects.filter(
                    department=user.department,
                    role='department_leader',
                    is_active=True,
                ).first()
                if leader:
                    recipients.append(leader.email)
            except Exception:
                pass

        # 2. HR officers in the same organisation
        try:
            from apps.accounts.models import User as AccountUser
            hr_emails = AccountUser.objects.filter(
                organisation=user.organisation,
                role__in=['hr_officer', 'system_admin'],
                is_active=True,
            ).values_list('email', flat=True)
            recipients.extend(list(hr_emails))
        except Exception:
            pass

        # Deduplicate
        recipients = list(set(recipients))

        if recipients:
            try:
                from django.core.mail import send_mail
                from django.conf import settings

                send_mail(
                    subject=f'[Geofence Alert] {user.full_name} left the workplace zone',
                    message=(
                        f'Hello,\n\n'
                        f'{user.full_name} ({user.email}) moved outside the geofence boundary.\n\n'
                        f'Distance from workplace : {round(float(distance))}m\n'
                        f'GPS coordinates         : {lat}, {lon}\n'
                        f'Time                    : {timezone.now().strftime("%H:%M on %d %b %Y")}\n\n'
                        f'This alert was generated automatically by the Nexus attendance system.\n'
                        f'The employee is still marked as checked in.\n'
                    ),
                    from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@nexus.local'),
                    recipient_list=recipients,
                    fail_silently=True,
                )
            except Exception:
                pass

        return Response({
            'detail': 'Geofence violation recorded and alert sent',
            'id': str(violation.id),
            'alert_sent_to': recipients,
        }, status=201)

class GeofenceViolationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user  = request.user
        today = timezone.now().date()

        record = AttendanceRecord.objects.filter(
            user=user,
            date=today,
            check_in_time__isnull=False,
            check_out_time__isnull=True,
        ).first()

        if not record:
            return Response({'detail': 'No active check-in session found'}, status=400)

        lat      = request.data.get('latitude')
        lon      = request.data.get('longitude')
        distance = request.data.get('distance_from_workplace')

        if not all([lat, lon, distance]):
            return Response(
                {'detail': 'latitude, longitude and distance_from_workplace are required'},
                status=400,
            )

        violation = GeofenceViolation.objects.create(
            attendance=record,
            user=user,
            latitude=lat,
            longitude=lon,
            distance_from_workplace=distance,
            alert_sent=True,
        )

        # ── Build recipient list ───────────────────────────────────────────
        recipients = []

        # Department leader
        try:
            from django.contrib.auth import get_user_model
            UserModel = get_user_model()

            if user.department:
                leader = UserModel.objects.filter(
                    department=user.department,
                    role='department_leader',
                    is_active=True,
                ).first()
                if leader:
                    recipients.append(leader.email)

            # HR officers + system admins in the same org
            hr_emails = UserModel.objects.filter(
                organisation=user.organisation,
                role__in=['hr_officer', 'system_admin'],
                is_active=True,
            ).values_list('email', flat=True)
            recipients.extend(list(hr_emails))
        except Exception:
            pass

        recipients = list(set(recipients))  # deduplicate

        # ── Send email ────────────────────────────────────────────────────
        if recipients:
            try:
                from django.core.mail import send_mail
                from django.conf import settings

                send_mail(
                    subject=f'[Geofence Alert] {user.full_name} left the workplace zone',
                    message=(
                        f'Hello,\n\n'
                        f'{user.full_name} ({user.email}) moved outside '
                        f'the geofence boundary.\n\n'
                        f'Distance from workplace : {round(float(distance))}m\n'
                        f'GPS coordinates         : {lat}, {lon}\n'
                        f'Time                    : '
                        f'{timezone.now().strftime("%H:%M on %d %b %Y")}\n\n'
                        f'The employee is still marked as checked in.\n\n'
                        f'— Nexus Attendance System'
                    ),
                    from_email=getattr(
                        settings, 'DEFAULT_FROM_EMAIL', 'noreply@nexus.local'
                    ),
                    recipient_list=recipients,
                    fail_silently=True,
                )
            except Exception:
                pass

        return Response({
            'detail': 'Geofence violation recorded and alert sent',
            'id': str(violation.id),
            'alert_sent_to': recipients,
        }, status=201)