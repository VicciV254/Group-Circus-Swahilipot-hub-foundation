"""Nexus Accounts — Organisation, Branches, Departments, MFA, Sessions"""
import pyotp
import qrcode
import base64
from io import BytesIO
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import generics, status, serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser
from core.models import AuditLog
from core.middleware import IsSystemAdmin, IsHROrAdmin
from .models import Organisation, Branch, Department, UserSession
# Fix missing import
from django.db import models
User = get_user_model()


# ── Organisation ─────────────────────────────────────────────────────────────
# ── Organisation ─────────────────────────────────────────────────────────────
class OrganisationSerializer(serializers.ModelSerializer):
    contact_email          = serializers.EmailField(source="email", read_only=True)
    contact_phone          = serializers.CharField(source="phone", read_only=True)
    annual_leave_days      = serializers.SerializerMethodField()
    sick_leave_days        = serializers.SerializerMethodField()
    maternity_leave_days   = serializers.SerializerMethodField()
    paternity_leave_days   = serializers.SerializerMethodField()
    probation_weeks        = serializers.SerializerMethodField()
    notice_weeks           = serializers.SerializerMethodField()
    default_stipend_amount = serializers.SerializerMethodField()

    class Meta:  # type: ignore
        model  = Organisation
        fields = [
            "id", "name", "code", "logo", "address",
            "phone", "email", "website", "sector", "is_active",
            "max_users", "subscription_expires",
            "contact_email", "contact_phone",
            "annual_leave_days", "sick_leave_days",
            "maternity_leave_days", "paternity_leave_days",
            "probation_weeks", "notice_weeks", "default_stipend_amount",
        ]

    def _policy(self, obj, key, default):
        try:
            return getattr(obj.hr_policy, key, default)
        except Exception:
            return default

    def get_annual_leave_days(self, obj):      return self._policy(obj, "annual_leave_days", 21)
    def get_sick_leave_days(self, obj):        return self._policy(obj, "sick_leave_days", 14)
    def get_maternity_leave_days(self, obj):   return self._policy(obj, "maternity_leave_days", 90)
    def get_paternity_leave_days(self, obj):   return self._policy(obj, "paternity_leave_days", 14)
    def get_probation_weeks(self, obj):        return self._policy(obj, "probation_weeks", 12)
    def get_notice_weeks(self, obj):           return self._policy(obj, "notice_weeks", 4)
    def get_default_stipend_amount(self, obj): return self._policy(obj, "default_stipend_amount", 0)


class OrganisationUpdateSerializer(serializers.ModelSerializer):
    contact_email          = serializers.EmailField(source="email", required=False, allow_blank=True)
    contact_phone          = serializers.CharField(source="phone", required=False, allow_blank=True)
    annual_leave_days      = serializers.IntegerField(required=False, min_value=0)
    sick_leave_days        = serializers.IntegerField(required=False, min_value=0)
    maternity_leave_days   = serializers.IntegerField(required=False, min_value=0)
    paternity_leave_days   = serializers.IntegerField(required=False, min_value=0)
    probation_weeks        = serializers.IntegerField(required=False, min_value=0)
    notice_weeks           = serializers.IntegerField(required=False, min_value=0)
    default_stipend_amount = serializers.DecimalField(required=False, max_digits=12, decimal_places=2, min_value=0)

    HR_POLICY_FIELDS = [
        "annual_leave_days", "sick_leave_days", "maternity_leave_days",
        "paternity_leave_days", "probation_weeks", "notice_weeks", "default_stipend_amount",
    ]

    class Meta:  # type: ignore
        model  = Organisation
        fields = [
            "name", "code", "address", "website", "sector",
            "contact_email", "contact_phone",
            "annual_leave_days", "sick_leave_days",
            "maternity_leave_days", "paternity_leave_days",
            "probation_weeks", "notice_weeks", "default_stipend_amount",
        ]

    def update(self, instance, validated_data):
        policy_data = {k: validated_data.pop(k) for k in self.HR_POLICY_FIELDS if k in validated_data}
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if policy_data:
            try:
                from .org_policy_models import OrgPolicy
                policy, _ = OrgPolicy.objects.get_or_create(organisation=instance)
                for k, v in policy_data.items():
                    setattr(policy, k, v)
                policy.save()
            except Exception:
                pass
        return instance


class OrganisationView(generics.RetrieveUpdateAPIView):
    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return OrganisationUpdateSerializer
        return OrganisationSerializer

    def get_object(self):
        return self.request.user.organisation

    def update(self, request, *args, **kwargs):
        instance  = self.get_object()
        write_ser = OrganisationUpdateSerializer(instance, data=request.data, partial=True)
        write_ser.is_valid(raise_exception=True)
        updated   = write_ser.save()
        read_ser  = OrganisationSerializer(updated, context={"request": request})
        return Response(read_ser.data)

# ── Branches ─────────────────────────────────────────────────────────────────
class BranchSerializer(serializers.ModelSerializer):
    user_count = serializers.SerializerMethodField()

    class Meta:  # type: ignore
        model = Branch
        fields = '__all__'

    def get_user_count(self, obj):
        return obj.users.filter(is_active=True).count()


class BranchListView(generics.ListCreateAPIView):
    serializer_class = BranchSerializer

    def get_queryset(self):
        return Branch.objects.filter(organisation=self.request.user.organisation)

    def perform_create(self, serializer):
        serializer.save(organisation=self.request.user.organisation)


class BranchDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = BranchSerializer

    def get_queryset(self):
        return Branch.objects.filter(organisation=self.request.user.organisation)


# ── Departments ───────────────────────────────────────────────────────────────
class DepartmentSerializer(serializers.ModelSerializer):
    user_count = serializers.SerializerMethodField()
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:  # type: ignore
        model = Department
        fields = '__all__'

    def get_user_count(self, obj):
        return obj.users.filter(is_active=True).count()


class DepartmentListView(generics.ListCreateAPIView):
    serializer_class = DepartmentSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Department.objects.filter(organisation=user.organisation)
        if user.role == 'department_leader':
            return qs.filter(id=user.department_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(organisation=self.request.user.organisation)


class DepartmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = DepartmentSerializer

    def get_queryset(self):
        return Department.objects.filter(organisation=self.request.user.organisation)


# ── User Stats ────────────────────────────────────────────────────────────────
class UserStatsView(APIView):
    def get(self, request):
        org = request.user.organisation
        users = User.objects.filter(organisation=org)
        by_role = {}
        for role_key, role_label in User.ROLES:
            count = users.filter(role=role_key, is_active=True).count()
            if count > 0:
                by_role[role_label] = count

        return Response({
            'total_users':    users.count(),
            'active_users':   users.filter(is_active=True).count(),
            'inactive_users': users.filter(is_active=False).count(),
            'mfa_enabled':    users.filter(mfa_enabled=True).count(),
            'by_role':        by_role,
            'by_department':  list(
                users.filter(is_active=True)
                     .values('department__name')
                     .annotate(count=models.Count('id'))
                     .order_by('-count')[:10]
            ),
        })


# ── Bulk Import ───────────────────────────────────────────────────────────────
class BulkImportView(APIView):
    """
    CSV required : email, first_name, last_name
    CSV optional : role (default: attachee), phone, institution
    password and employee_id are always auto-generated.
    """
    parser_classes = [MultiPartParser]
    permission_classes = [IsSystemAdmin]

    def post(self, request):
        import csv, io
        from django.db import transaction
        from .views import _generate_temp_password, _generate_employee_id

        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "No file provided"}, status=400)

        VALID_ROLES = {r[0] for r in User.ROLES}
        org = request.user.organisation
        created, errors = [], []

        try:
            decoded = file.read().decode("utf-8-sig")
            reader  = csv.DictReader(io.StringIO(decoded))

            for i, row in enumerate(reader, 1):
                email = (row.get("email") or "").strip().lower()
                if not email:
                    errors.append({"row": i, "error": "Email is required"})
                    continue
                if User.objects.filter(email=email).exists():
                    errors.append({"row": i, "email": email, "error": "Email already exists"})
                    continue

                role = (row.get("role") or "attachee").strip().lower()
                if role not in VALID_ROLES:
                    role = "attachee"

                try:
                    with transaction.atomic():
                        pwd    = _generate_temp_password()
                        emp_id = _generate_employee_id(org)
                        user = User(
                            email=email,
                            first_name=(row.get("first_name") or "").strip(),
                            last_name=(row.get("last_name")  or "").strip(),
                            role=role,
                            organisation=org,
                            phone=(row.get("phone") or "").strip(),
                            employee_id=emp_id,
                            must_change_password=True,
                        )
                        user.set_password(pwd)
                        user.save()
                        institution = (row.get("institution") or "").strip()
                        if institution and role == "attachee":
                            try:
                                profile = user.attachee_profile
                                profile.institution = institution
                                profile.save(update_fields=["institution"])
                            except Exception:
                                pass
                    created.append({
                        "email": user.email, "employee_id": user.employee_id,
                        "temp_password": pwd, "full_name": user.get_full_name(),
                    })
                except Exception as e:
                    errors.append({"row": i, "email": email, "error": str(e)})

        except Exception as e:
            return Response({"detail": f"File parsing error: {e}"}, status=400)

        if not created and errors:
            return Response({"created": 0, "errors": len(errors), "error_details": errors[:20]}, status=400)

        return Response({
            "created": len(created), "errors": len(errors),
            "created_users": created[:50], "error_details": errors[:20],
        }, status=201)
    

# ── Change Password ───────────────────────────────────────────────────────────
class ChangePasswordView(APIView):
    def post(self, request):
        current = request.data.get('current_password')
        new_pass = request.data.get('new_password')
        if not new_pass:
            return Response({'detail': 'New password required'}, status=400)
        if len(new_pass) < 10:
            return Response({'detail': 'Password must be at least 10 characters'}, status=400)

        # Skip current password check if user must change password (first login)
        if not request.user.must_change_password:
            if not current:
                return Response({'detail': 'Current password required'}, status=400)
            if not request.user.check_password(current):
                return Response({'detail': 'Current password is incorrect'}, status=400)

        request.user.set_password(new_pass)
        request.user.must_change_password = False
        request.user.save(update_fields=['password', 'must_change_password'])
        return Response({'detail': 'Password changed successfully'})


# ── MFA Setup ─────────────────────────────────────────────────────────────────
class MFASetupView(APIView):
    def get(self, request):
        """Return QR code and secret for MFA setup"""
        user = request.user
        totp = user.get_mfa_totp()
        provisioning_uri = totp.provisioning_uri(
            name=user.email,
            issuer_name='Nexus Enterprise'
        )
        img = qrcode.make(provisioning_uri)
        buffer = BytesIO()
        img.save(buffer, 'PNG')
        qr_b64 = base64.b64encode(buffer.getvalue()).decode()
        return Response({
            'secret': user.mfa_secret,
            'qr_code': f'data:image/png;base64,{qr_b64}',
            'provisioning_uri': provisioning_uri,
        })

    def post(self, request):
        """Verify and enable MFA"""
        token = request.data.get('token')
        user = request.user
        if user.verify_mfa(token):
            user.mfa_enabled = True
            user.save(update_fields=['mfa_enabled'])
            return Response({'detail': 'MFA enabled successfully'})
        return Response({'detail': 'Invalid token — MFA not enabled'}, status=400)


class MFADisableView(APIView):
    def post(self, request):
        token = request.data.get('token')
        password = request.data.get('password')
        user = request.user
        if not user.check_password(password):
            return Response({'detail': 'Incorrect password'}, status=400)
        if not user.verify_mfa(token):
            return Response({'detail': 'Invalid MFA token'}, status=400)
        user.mfa_enabled = False
        user.mfa_secret = ''
        user.save(update_fields=['mfa_enabled', 'mfa_secret'])
        return Response({'detail': 'MFA disabled'})


# ── Sessions ──────────────────────────────────────────────────────────────────
class UserSessionSerializer(serializers.ModelSerializer):
    class Meta:  # type: ignore
        model = UserSession
        fields = '__all__'
        read_only_fields = ['user']


class UserSessionListView(generics.ListAPIView):
    serializer_class = UserSessionSerializer

    def get_queryset(self):
        return UserSession.objects.filter(user=self.request.user, is_active=True)


class RevokeSessionView(APIView):
    def post(self, request, pk):
        try:
            session = UserSession.objects.get(pk=pk, user=request.user)
            session.is_active = False
            session.save()
            return Response({'detail': 'Session revoked'})
        except UserSession.DoesNotExist:
            return Response({'detail': 'Session not found'}, status=404)


# ── Audit Log ────────────────────────────────────────────────────────────────
class AuditLogSerializer(serializers.ModelSerializer):
    user_name  = serializers.CharField(source="user.full_name", read_only=True)
    user_email = serializers.CharField(source="user.email",     read_only=True)
    timestamp  = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:  # type: ignore
        model  = AuditLog
        fields = "__all__"


class AuditLogView(generics.ListAPIView):
    serializer_class = AuditLogSerializer

    def get_queryset(self):
        qs = AuditLog.objects.filter(
            user__organisation=self.request.user.organisation
        ).select_related("user")

        user_id = self.request.query_params.get("user")
        action  = self.request.query_params.get("action")
        date    = self.request.query_params.get("date")
        search  = self.request.query_params.get("search")

        if user_id: qs = qs.filter(user_id=user_id)
        if action:  qs = qs.filter(action__icontains=action)
        if date:    qs = qs.filter(created_at__date=date)
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(user__email__icontains=search) |
                Q(action__icontains=search) |
                Q(resource_type__icontains=search)
            )
        return qs.order_by("-created_at")


# ── Supervisors (for dropdowns) ─────────────────────────────────────────────
class SupervisorListView(generics.ListAPIView):
    """Lightweight list of users who can act as a supervisor, for picker UIs."""

    def get_serializer_class(self):
        from .views import UserListSerializer
        return UserListSerializer

    def get_queryset(self):
        user = self.request.user
        return User.objects.filter(
            organisation=user.organisation,
            role__in=["supervisor", "department_leader", "hr_officer", "system_admin"],
            is_active=True,
        ).order_by("first_name", "last_name")


# ── Export ───────────────────────────────────────────────────────────────────
class UserExportView(APIView):
    """GET /accounts/users/export/?format=csv → CSV download of the org's users."""

    def get(self, request):
        import csv
        import io
        from django.http import HttpResponse

        fmt = request.query_params.get("format", "csv")
        if fmt != "csv":
            return Response({"detail": "Only format=csv is currently supported"}, status=400)

        org = request.user.organisation
        users = (
            User.objects.filter(organisation=org)
            .select_related("department", "branch")
            .order_by("first_name", "last_name")
        )

        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow([
            "Employee ID", "Email", "First Name", "Last Name", "Role",
            "Department", "Branch", "Phone", "Active", "Date Joined",
        ])
        for u in users:
            writer.writerow([
                u.employee_id, u.email, u.first_name, u.last_name, u.get_role_display(),
                u.department.name if u.department else "",
                u.branch.name if u.branch else "",
                u.phone, "Yes" if u.is_active else "No",
                u.date_joined.strftime("%Y-%m-%d") if u.date_joined else "",
            ])

        response = HttpResponse(buffer.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="users.csv"'
        return response


# ── Single-user Change Role ─────────────────────────────────────────────────
class ChangeRoleView(APIView):
    def post(self, request, pk):
        from django.db import transaction

        user = request.user
        if user.role not in ("system_admin", "hr_officer", "executive"):
            return Response({"detail": "Permission denied"}, status=403)

        new_role = request.data.get("role")
        valid_roles = {r[0] for r in User.ROLES}
        if not new_role or new_role not in valid_roles:
            return Response({"detail": "Valid role is required"}, status=400)

        try:
            # Lock this user's row for the duration of the transaction so a
            # double-click or a concurrent bulk job can't race this update.
            with transaction.atomic():
                target = User.objects.select_for_update().get(
                    pk=pk, organisation=user.organisation
                )

                if target.pk == user.pk:
                    return Response(
                        {"detail": "You cannot change your own role."}, status=400
                    )

                if target.role == new_role:
                    return Response(
                        {"detail": f"User already has the role '{target.get_role_display()}'."},
                        status=400,
                    )

                old_role_display = target.get_role_display()
                old_employee_id = target.employee_id

                update_fields = ["role"]
                new_employee_id = old_employee_id

                if new_role == "attachee":
                    # Reverting to intern — give them back an INTERN-#### id
                    # unless they already have one.
                    if not old_employee_id or not old_employee_id.upper().startswith("INTERN-"):
                        from .views import _generate_intern_employee_id
                        new_employee_id = _generate_intern_employee_id(target.organisation)
                        target.employee_id = new_employee_id
                        update_fields.append("employee_id")
                else:
                    # Promoting off attachee — give them a STAFF-#### id
                    # unless they already have one.
                    if not old_employee_id or not old_employee_id.upper().startswith("STAFF-"):
                        from .views import _generate_staff_employee_id
                        new_employee_id = _generate_staff_employee_id(target.organisation)
                        target.employee_id = new_employee_id
                        update_fields.append("employee_id")

                target.role = new_role
                target.save(update_fields=update_fields)
        except User.DoesNotExist:
            return Response({"detail": "Not found"}, status=404)

        # Re-read the committed row so the email always reflects exactly what's
        # in the database — never a value computed before the transaction closed.
        target.refresh_from_db()

        _send_role_change_email(
            target, old_role_display, target.get_role_display(),
            old_employee_id, target.employee_id,
        )

        return Response({
            "detail": "Role updated",
            "role": target.role,
            "employee_id": target.employee_id,
        })


def _send_role_change_email(user, old_role_display, new_role_display, old_employee_id, new_employee_id):
    from django.core.mail import send_mail
    from django.conf import settings

    org_name = user.organisation.name if user.organisation else "Swahilipot Foundation"

    send_mail(
        subject=f"[{org_name}] Your role has been updated",
        message=(
            f"Hello {user.first_name},\n\n"
            f"Your role has been changed from {old_role_display} to {new_role_display}.\n"
            f"Your employee ID has also been updated from {old_employee_id} to {new_employee_id}.\n\n"
            f"If you have any questions, please contact your administrator.\n\n"
            f"— {org_name} HR Team"
        ),
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@swahilipot.org"),
        recipient_list=[user.email],
        fail_silently=True,
    )


# ── Admin session management for a specific user ───────────────────────────
class AdminUserSessionsView(generics.ListAPIView):
    """GET /accounts/users/<uuid:pk>/sessions/ — admin view of one user's active sessions."""
    serializer_class = UserSessionSerializer

    def get_queryset(self):
        admin = self.request.user
        if admin.role not in ("system_admin", "hr_officer", "executive"):
            return UserSession.objects.none()
        return UserSession.objects.filter(
            user_id=self.kwargs["pk"],
            user__organisation=admin.organisation,
            is_active=True,
        )


class AdminRevokeSessionView(APIView):
    """POST /accounts/sessions/<uuid:pk>/admin-revoke/ — admin revokes any session in their org."""

    def post(self, request, pk):
        admin = request.user
        if admin.role not in ("system_admin", "hr_officer", "executive"):
            return Response({"detail": "Permission denied"}, status=403)
        try:
            session = UserSession.objects.get(pk=pk, user__organisation=admin.organisation)
        except UserSession.DoesNotExist:
            return Response({"detail": "Session not found"}, status=404)
        session.is_active = False
        session.save(update_fields=["is_active"])
        return Response({"detail": "Session revoked"})


class AdminRevokeAllSessionsView(APIView):
    """POST /accounts/users/<uuid:pk>/sessions/revoke-all/ — admin revokes all sessions for a user."""

    def post(self, request, pk):
        admin = request.user
        if admin.role not in ("system_admin", "hr_officer", "executive"):
            return Response({"detail": "Permission denied"}, status=403)
        try:
            target = User.objects.get(pk=pk, organisation=admin.organisation)
        except User.DoesNotExist:
            return Response({"detail": "Not found"}, status=404)
        count = UserSession.objects.filter(user=target, is_active=True).update(is_active=False)
        return Response({"detail": f"{count} session(s) revoked"})


# ── Bulk actions ─────────────────────────────────────────────────────────────
class _BulkUserActionBase(APIView):
    def _get_target_queryset(self, request):
        ids = request.data.get("ids") or []
        if not ids:
            return None
        return User.objects.filter(pk__in=ids, organisation=request.user.organisation)


class BulkActivateView(_BulkUserActionBase):
    def post(self, request):
        qs = self._get_target_queryset(request)
        if qs is None:
            return Response({"detail": "No user ids provided"}, status=400)
        count = qs.update(is_active=True, status="active")
        return Response({"detail": f"{count} user(s) activated", "count": count})


class BulkDeactivateView(_BulkUserActionBase):
    def post(self, request):
        qs = self._get_target_queryset(request)
        if qs is None:
            return Response({"detail": "No user ids provided"}, status=400)

        skipped_self = qs.filter(pk=request.user.pk).exists()
        qs = qs.exclude(pk=request.user.pk)

        count = qs.update(is_active=False, status="inactive")
        detail = f"{count} user(s) deactivated"
        if skipped_self:
            detail += " (your own account was skipped — you cannot deactivate yourself)"
        return Response({"detail": detail, "count": count, "skipped_self": skipped_self})


class BulkChangeRoleView(_BulkUserActionBase):
    def post(self, request):
        if request.user.role not in ("system_admin", "hr_officer", "executive"):
            return Response({"detail": "Permission denied"}, status=403)
        new_role = request.data.get("role")
        valid_roles = {r[0] for r in User.ROLES}
        if not new_role or new_role not in valid_roles:
            return Response({"detail": "Valid role is required"}, status=400)
        qs = self._get_target_queryset(request)
        if qs is None:
            return Response({"detail": "No user ids provided"}, status=400)

        skipped_self = qs.filter(pk=request.user.pk).exists()
        qs = qs.exclude(pk=request.user.pk)

        skipped_same_role = qs.filter(role=new_role).count()
        qs = qs.exclude(role=new_role)

        from .views import _generate_staff_employee_id, _generate_intern_employee_id
        from django.db import transaction

        target_ids = list(qs.values_list("pk", flat=True))
        count = 0
        for target_id in target_ids:
            with transaction.atomic():
                target = User.objects.select_for_update().get(pk=target_id)

                old_role_display = target.get_role_display()
                old_employee_id = target.employee_id

                update_fields = ["role"]
                if new_role == "attachee":
                    if not old_employee_id or not old_employee_id.upper().startswith("INTERN-"):
                        new_employee_id = _generate_intern_employee_id(target.organisation)
                        target.employee_id = new_employee_id
                        update_fields.append("employee_id")
                else:
                    if not old_employee_id or not old_employee_id.upper().startswith("STAFF-"):
                        new_employee_id = _generate_staff_employee_id(target.organisation)
                        target.employee_id = new_employee_id
                        update_fields.append("employee_id")

                target.role = new_role
                target.save(update_fields=update_fields)

            # Outside the transaction: re-read the committed row so the email
            # always reflects exactly what's in the database.
            target.refresh_from_db()
            _send_role_change_email(
                target, old_role_display, target.get_role_display(),
                old_employee_id, target.employee_id,
            )
            count += 1

        detail = f"{count} user(s) updated"
        if skipped_self:
            detail += " (your own account was skipped — you cannot change your own role)"
        if skipped_same_role:
            detail += f" ({skipped_same_role} already had that role and were skipped)"
        return Response({
            "detail": detail,
            "count": count,
            "skipped_self": skipped_self,
            "skipped_same_role": skipped_same_role,
        })


class BulkReassignView(_BulkUserActionBase):
    def post(self, request):
        qs = self._get_target_queryset(request)
        if qs is None:
            return Response({"detail": "No user ids provided"}, status=400)

        update_fields = {}
        branch_id = request.data.get("branch")
        dept_id = request.data.get("department")
        if branch_id:
            update_fields["branch_id"] = branch_id
        if dept_id:
            update_fields["department_id"] = dept_id

        if not update_fields:
            return Response({"detail": "branch or department is required"}, status=400)

        count = qs.update(**update_fields)
        return Response({"detail": f"{count} user(s) reassigned", "count": count})

