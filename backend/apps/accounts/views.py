"""Nexus Accounts — Serializers, Views, JWT"""
from typing import cast, TYPE_CHECKING

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers, generics, status, permissions
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from datetime import timedelta
import secrets
from django.core.mail import send_mail
from django.conf import settings

User = get_user_model()


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['email'] = user.email
        token['role'] = user.role
        token['full_name'] = user.get_full_name()
        token['org_id'] = str(user.organisation_id) if user.organisation_id else None
        token['branch_id'] = str(user.branch_id) if user.branch_id else None
        token['mfa_required'] = user.mfa_enabled and not user.mfa_verified
        token['must_change_password'] = user.must_change_password  # ← ADD THIS
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        user = cast(User, self.user)
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])
        data['user'] = UserProfileSerializer(user).data
        data['mfa_required'] = user.mfa_enabled

        # Auto-send email OTP the moment the user logs in (if MFA is enabled)
        if user.mfa_enabled:
            _send_email_otp(user)
        data['must_change_password'] = user.must_change_password  
        return data


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


def _send_email_otp(user):
    """
    Generate a fresh 6-digit email OTP, overwrite any prior code (invalidating it),
    and email it to the user. The code expires in 15 minutes.
    Calling this multiple times always makes the LATEST code the only valid one.
    """
    import secrets
    from django.core.mail import send_mail
    from django.conf import settings
    from datetime import timedelta

    code = str(secrets.randbelow(900000) + 100000)   # always 6 digits, 100000–999999
    expires_at = timezone.now() + timedelta(minutes=15)

    # Overwriting the stored code automatically invalidates any previous one
    user.mfa_email_code = code
    user.mfa_email_code_expires = expires_at
    user.save(update_fields=['mfa_email_code', 'mfa_email_code_expires'])

    org_name = user.organisation.name if user.organisation else 'Swahilipot Foundation'

    send_mail(
        subject=f'[{org_name}] Your login verification code',
        message=(
            f'Hello {user.first_name},\n\n'
            f'Your one-time verification code is:\n\n'
            f'    {code}\n\n'
            f'This code expires in 15 minutes. Do not share it with anyone.\n\n'
            f'If you did not request this code, contact your system administrator immediately.\n\n'
            f'— {org_name} Security Team'
        ),
        from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@swahilipot.org'),
        recipient_list=[user.email],
        fail_silently=True,
    )


class MFAVerifyView(APIView):
    """
    POST /auth/mfa/verify/
    Body: { "token": "123456", "method": "email" | "totp" }

    method=email  → validates the stored email OTP (15-min expiry, single-use)
    method=totp   → validates the authenticator TOTP code
    Both paths set mfa_verified=True on success.
    """
    def post(self, request: Request):
        token = request.data.get('token', '').strip()
        method = request.data.get('method', 'email')
        user = cast(User, request.user)

        if not token:
            return Response({'detail': 'Verification code is required.'}, status=400)

        if method == 'email':
            stored_code = getattr(user, 'mfa_email_code', None)
            expires_at  = getattr(user, 'mfa_email_code_expires', None)

            if not stored_code:
                return Response(
                    {'detail': 'No active code found. Please request a new one.'},
                    status=400,
                )
            if not expires_at or timezone.now() > expires_at:
                return Response(
                    {'detail': 'This code has expired. Please request a new one.'},
                    status=400,
                )
            if token != stored_code:
                return Response(
                    {'verified': False, 'detail': 'Invalid code. Please try again.'},
                    status=400,
                )

            # Invalidate the code immediately after successful use
            user.mfa_email_code = ''
            user.mfa_email_code_expires = None
            user.mfa_verified = True
            user.save(update_fields=['mfa_email_code', 'mfa_email_code_expires', 'mfa_verified'])
            return Response({'verified': True})

        else:
            # TOTP authenticator app path
            if user.verify_mfa(token):
                user.mfa_verified = True
                user.save(update_fields=['mfa_verified'])
                return Response({'verified': True})
            return Response(
                {'verified': False, 'detail': 'Invalid authenticator code.'},
                status=400,
            )


class MFAResendView(APIView):
    """
    POST /auth/mfa/resend/
    Generates a brand-new email OTP and sends it, making all previous codes invalid.
    The 15-minute timer restarts from the moment this is called.
    """
    def post(self, request: Request):
        user = cast(User, request.user)
        if not user.mfa_enabled:
            return Response({'detail': 'MFA is not enabled for this account.'}, status=400)
        _send_email_otp(user)
        return Response({'detail': 'A new verification code has been sent to your email.'})


class LogoutView(APIView):
    def post(self, request: Request):
        try:
            refresh = request.data.get('refresh')
            # Reset mfa_verified so the next login re-triggers the full MFA flow
            user = cast(User, request.user)
            if user and user.is_authenticated:
                user.mfa_verified = False
                user.save(update_fields=['mfa_verified'])
            if refresh:
                token = RefreshToken(refresh)
                token.blacklist()
            return Response({'detail': 'Successfully logged out.'})
        except Exception:
            return Response({'detail': 'Token already invalid.'}, status=400)


class UserProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    organisation_name = serializers.CharField(source='organisation.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    profile_photo = serializers.SerializerMethodField()
    is_locked = serializers.ReadOnlyField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'employee_id', 'first_name', 'last_name', 'full_name',
            'phone', 'profile_photo', 'role', 'role_display',
            'organisation', 'organisation_name', 'branch', 'branch_name',
            'department', 'department_name', 'bio', 'date_of_birth',
            'emergency_contact_name', 'emergency_contact_phone',
            'mfa_enabled', 'notification_email', 'notification_sms', 'notification_push',
            'date_joined', 'last_login', 'is_active',
            'status', 'is_locked', 'failed_login_attempts', 'locked_until',
            # ── Accessibility ──────────────────────────────────────────────
            'font_preference',
            'language_preference',
        ]
        read_only_fields = ['id', 'email', 'date_joined', 'last_login', 'is_locked']

    def get_profile_photo(self, obj):
        if not obj.profile_photo:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.profile_photo.url)
        return obj.profile_photo.url


# ── Dedicated accessibility / preferences endpoint ────────────────────────────

class UserPreferencesSerializer(serializers.ModelSerializer):
    """Lightweight serializer — only fields the user can self-update."""

    VALID_FONTS = {'default', 'dyslexic', 'mono', 'serif'}

    font_preference = serializers.ChoiceField(
        choices=['default', 'dyslexic', 'mono', 'serif'],
        required=False,
    )

    language_preference = serializers.ChoiceField(
        choices=['en', 'sw', 'fr', 'ar', 'es', 'pt'],
        required=False,
    )

    class Meta:
        model = User
        fields = [
            'font_preference',
            'language_preference',
            'notification_email',
            'notification_sms',
            'notification_push',
            'timezone_preference',
        ]


class UserPreferencesView(generics.RetrieveUpdateAPIView):
    """
    GET  /api/accounts/preferences/   → return current preferences
    PATCH /api/accounts/preferences/  → update one or more preferences
    """
    serializer_class = UserPreferencesSerializer
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_object(self):
        return cast(User, self.request.user)

    def perform_update(self, serializer):
        # Only save the fields that were actually sent
        serializer.save()

    def patch(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)


# ─────────────────────────────────────────────────────────────────────────────

class UserListSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    is_locked = serializers.ReadOnlyField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'employee_id', 'full_name', 'role', 'role_display',
            'department', 'department_name', 'branch', 'branch_name',
            'is_active', 'status', 'is_locked', 'date_joined', 'profile_photo',
        ]


import string as _string


def _generate_temp_password(length: int = 12) -> str:
    import secrets as _sec
    alphabet = _string.ascii_letters + _string.digits + "!@#$%"
    while True:
        pwd = "".join(_sec.choice(alphabet) for _ in range(length))
        if (any(c.isupper() for c in pwd) and
                any(c.islower() for c in pwd) and
                any(c.isdigit() for c in pwd) and
                any(c in "!@#$%" for c in pwd)):
            return pwd


def _generate_employee_id(organisation) -> str:
    from django.db import transaction
    prefix = (organisation.code if organisation and organisation.code else "EMP").upper()
    with transaction.atomic():
        existing = (
            User.objects.select_for_update()
            .filter(organisation=organisation, employee_id__startswith=prefix + "-")
            .values_list("employee_id", flat=True)
        )
        max_num = 0
        for eid in existing:
            try:
                num = int(eid.split("-")[-1])
                if num > max_num:
                    max_num = num
            except (ValueError, IndexError):
                pass
        return f"{prefix}-{max_num + 1:04d}"


def _generate_staff_employee_id(organisation, start: int = 1000) -> str:
    """
    Generate the next available STAFF-#### employee_id, filling any gaps
    left by deactivated/deleted users rather than always incrementing the max.
    e.g. if STAFF-1000 and STAFF-1001 exist but STAFF-1002 is free, returns STAFF-1002.
    """
    from django.db import transaction

    with transaction.atomic():
        existing = set(
            User.objects.select_for_update()
            .filter(employee_id__startswith="STAFF-")
            .values_list("employee_id", flat=True)
        )
        used_numbers = set()
        for eid in existing:
            try:
                used_numbers.add(int(eid.split("-")[-1]))
            except (ValueError, IndexError):
                pass

        n = start
        while n in used_numbers:
            n += 1
        return f"STAFF-{n:04d}"


def _generate_intern_employee_id(organisation, start: int = 1000) -> str:
    """
    Generate the next available INTERN-#### employee_id, filling any gaps
    the same way _generate_staff_employee_id does for STAFF-####.
    Used when a user is reverted to the 'attachee' (intern) role.
    """
    from django.db import transaction

    with transaction.atomic():
        existing = set(
            User.objects.select_for_update()
            .filter(employee_id__startswith="INTERN-")
            .values_list("employee_id", flat=True)
        )
        used_numbers = set()
        for eid in existing:
            try:
                used_numbers.add(int(eid.split("-")[-1]))
            except (ValueError, IndexError):
                pass

        n = start
        while n in used_numbers:
            n += 1
        return f"INTERN-{n:04d}"


class UserCreateSerializer(serializers.ModelSerializer):
    password         = serializers.CharField(write_only=True, required=False, allow_blank=True, default="")
    institution      = serializers.CharField(write_only=True, required=False, allow_blank=True, default="")
    internship_start = serializers.DateField(write_only=True, required=False, allow_null=True)
    internship_end   = serializers.DateField(write_only=True, required=False, allow_null=True)
    temp_password    = serializers.SerializerMethodField()
    full_name        = serializers.ReadOnlyField()
    role_display     = serializers.CharField(source="get_role_display", read_only=True)
    department_name  = serializers.CharField(source="department.name", read_only=True)
    branch_name      = serializers.CharField(source="branch.name", read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "email", "password",
            "first_name", "last_name", "full_name",
            "employee_id", "phone", "role", "role_display",
            "branch", "branch_name", "department", "department_name",
            "is_active", "date_joined",
            "institution", "internship_start", "internship_end",
            "temp_password",
        ]
        read_only_fields = ["id", "employee_id", "is_active", "date_joined"]

    def get_temp_password(self, obj):
        return getattr(obj, "_temp_password", None)

    def create(self, validated_data):
        raw_password     = validated_data.pop("password", "") or ""
        institution      = validated_data.pop("institution", "") or ""
        internship_start = validated_data.pop("internship_start", None)
        internship_end   = validated_data.pop("internship_end", None)
        organisation     = validated_data.get("organisation")

        if not raw_password.strip():
            raw_password = _generate_temp_password()

        emp_id = _generate_employee_id(organisation)
        user = User(employee_id=emp_id, must_change_password=True, **validated_data)
        user.set_password(raw_password)
        user.save()

        if institution or internship_start or internship_end:
            try:
                profile = user.attachee_profile
                if institution:      profile.institution = institution
                if internship_start: profile.start_date  = internship_start
                if internship_end:   profile.end_date    = internship_end
                profile.save()
            except Exception:
                pass

        user._temp_password = raw_password
        return user


class UserProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserProfileSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_object(self):  # type: ignore[override]
        return cast(User, self.request.user)

    def perform_update(self, serializer):
        instance = serializer.save()
        photo = self.request.FILES.get("profile_photo")
        if photo:
            instance.profile_photo = photo
            instance.save(update_fields=["profile_photo"])


class UserListView(generics.ListCreateAPIView):
    serializer_class = UserListSerializer

    def get_queryset(self):  # type: ignore[override]
        user = cast(User, self.request.user)
        qs = User.objects.select_related('department', 'branch', 'organisation')
        if user.role == 'system_admin':
            qs = qs.filter(organisation=user.organisation)
        elif user.role in ['hr_officer', 'executive']:
            qs = qs.filter(organisation=user.organisation)
        elif user.role == 'department_leader':
            qs = qs.filter(department=user.department)
        elif user.role == 'supervisor':
            qs = qs.filter(department=user.department)
        else:
            qs = qs.filter(id=user.id)

        role = self.request.query_params.get('role')
        if role:
            qs = qs.filter(role=role)

        status_param = self.request.query_params.get('status')
        if status_param:
            valid_statuses = {c[0] for c in User.STATUS_CHOICES}
            if status_param in valid_statuses:
                qs = qs.filter(status=status_param)

        return qs

    def get_serializer_class(self):  # type: ignore[override]
        if self.request.method == 'POST':
            return UserCreateSerializer
        return UserListSerializer

    def perform_create(self, serializer):
        user = cast(User, self.request.user)
        serializer.save(organisation=user.organisation)

    # ADD THIS right after perform_create:
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UserProfileSerializer

    def get_queryset(self):  # type: ignore[override]
        user = cast(User, self.request.user)
        return User.objects.filter(organisation=user.organisation)

    def perform_update(self, serializer):
        instance = serializer.save()
        if 'status' in serializer.validated_data:
            should_be_active = instance.status in ('active', 'pending')
            if instance.is_active != should_be_active:
                instance.is_active = should_be_active
                instance.save(update_fields=['is_active'])

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.pk == request.user.pk:
            return Response(
                {"detail": "You cannot deactivate your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.status = 'inactive'
        instance.save(update_fields=['is_active', 'status'])

class UserActivateView(APIView):
    def post(self, request, pk):
        user = cast(User, request.user)
        try:
            target = User.objects.get(pk=pk, organisation=user.organisation)
            target.is_active = True
            target.status = 'active'
            target.save(update_fields=["is_active", "status"])
            return Response({"detail": "User activated successfully"})
        except User.DoesNotExist:
            return Response({"detail": "Not found"}, status=404)


class UserResetPasswordView(APIView):
    def post(self, request, pk):
        user = cast(User, request.user)
        if user.role not in ("system_admin", "hr_officer", "executive"):
            return Response({"detail": "Permission denied"}, status=403)
        try:
            target = User.objects.get(pk=pk, organisation=user.organisation)
            new_password = _generate_temp_password()
            target.set_password(new_password)
            target.must_change_password = True
            target.save(update_fields=["password", "must_change_password"])
            return Response({
                "detail": "Password reset successfully",
                "temp_password": new_password,
                "new_password": new_password,
                "email": target.email,
                "employee_id": target.employee_id,
                "full_name": target.get_full_name(),
            })
        except User.DoesNotExist:
            return Response({"detail": "Not found"}, status=404)