"""Nexus Accounts — Users, Roles, Departments, Branches"""
import uuid
import pyotp
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils import timezone
from core.models import TimeStampedModel, SoftDeleteModel
from .org_policy_models import OrgPolicy 

class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'system_admin')
        return self.create_user(email, password, **extra_fields)


class Organisation(TimeStampedModel):
    """Top-level organisation (multinational, gov, NGO, bank, hospital, university)"""
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=20, unique=True)
    logo = models.ImageField(upload_to='org/logos/', null=True, blank=True)
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    website = models.URLField(blank=True)
    sector = models.CharField(max_length=50, choices=[
        ('corporate', 'Corporate'), ('government', 'Government'),
        ('ngo', 'NGO'), ('hospital', 'Hospital'),
        ('bank', 'Bank'), ('university', 'University'),
        ('broadcast', 'Broadcast Media'), ('other', 'Other'),
    ], default='corporate')
    is_active = models.BooleanField(default=True)
    max_users = models.IntegerField(default=10000)
    subscription_expires = models.DateField(null=True, blank=True)

    def __str__(self):
        return self.name


class Branch(TimeStampedModel):
    """Branch / subsidiary / campus"""
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name='branches')
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=20)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, default='Kenya')
    phone = models.CharField(max_length=30, blank=True)
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    geofence_radius = models.IntegerField(default=100)  # metres
    is_active = models.BooleanField(default=True)
    is_headquarters = models.BooleanField(default=False)

    class Meta:    # type: ignore
        unique_together = [['organisation', 'code']]

    def __str__(self):
        return f"{self.name} — {self.organisation.name}"


class Department(TimeStampedModel):
    """Department within a branch"""
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name='departments')
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name='departments', null=True, blank=True)
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=20)
    description = models.TextField(blank=True)
    budget_code = models.CharField(max_length=50, blank=True)
    is_active = models.BooleanField(default=True)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='sub_departments')

    def __str__(self):
        return f"{self.name} — {self.branch.name if self.branch else self.organisation.name}"


class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    ROLES = [
        ('attachee', 'Attachee / Intern'),
        ('supervisor', 'Supervisor'),
        ('department_leader', 'Department Leader'),
        ('hr_officer', 'HR Officer'),
        ('system_admin', 'System Administrator'),
        ('data_analyst', 'Data Analyst'),
        ('executive', 'Executive Management'),
        ('finance', 'Finance Officer'),
        ('procurement', 'Procurement Officer'),
        ('ict', 'ICT / IT Staff'),
        ('communications', 'Communications / PR'),
        ('legal', 'Legal Officer'),
        ('qc', 'Quality Assurance'),
        ('operations', 'Operations Staff'),
        ('customer_service', 'Customer Service'),
        ('rd', 'Research & Development'),
        ('hse', 'HSE Officer'),
        ('facilities', 'Facilities Manager'),
        ('security_officer', 'Security Officer'),
        ('university_coordinator', 'University Coordinator'),
        ('lecturer', 'Lecturer'),
        # Broadcast-specific roles
        ('broadcast_admin', 'Broadcast Admin'),
        ('broadcast_staff', 'Broadcast Staff'),
        ('broadcast_student', 'Broadcast Student'),
        ('journalist', 'Journalist'),
        ('presenter', 'Presenter / DJ'),
        ('editor', 'Editor'),
        ('videographer', 'Videographer'),
        ('station_engineer', 'Station Engineer'),
    ]

    FONT_CHOICES = [
        ('default',  'Default'),
        ('dyslexic', 'Dyslexic-friendly'),
        ('mono',     'Monospace'),
        ('serif',    'Serif'),
    ]

    email = models.EmailField(unique=True)
    employee_id = models.CharField(max_length=50, blank=True, unique=True, null=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    phone = models.CharField(max_length=30, blank=True)
    profile_photo = models.ImageField(upload_to='profiles/', null=True, blank=True)
    role = models.CharField(max_length=50, choices=ROLES, default='attachee')
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, null=True, blank=True, related_name='users')
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name='users')
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True, related_name='users')
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)
    last_login = models.DateTimeField(null=True, blank=True)

    STATUS_CHOICES = [
        ('active', 'Active'),
        ('inactive', 'Inactive'),
        ('suspended', 'Suspended'),
        ('pending', 'Pending'),
        ('offboarded', 'Offboarded'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')

    # Account lockout (e.g. after repeated failed login attempts)
    failed_login_attempts = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    # MFA — authenticator app (TOTP)
    mfa_enabled = models.BooleanField(default=False)
    mfa_secret = models.CharField(max_length=32, blank=True)
    mfa_verified = models.BooleanField(default=False)

    # MFA — email OTP (single active slot; overwritten on every resend,
    #         which automatically invalidates any previous code)
    mfa_email_code = models.CharField(max_length=100, blank=True)
    mfa_email_code_expires = models.DateTimeField(null=True, blank=True)

    # Profile extras
    bio = models.TextField(blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    national_id = models.CharField(max_length=50, blank=True)
    emergency_contact_name = models.CharField(max_length=100, blank=True)
    emergency_contact_phone = models.CharField(max_length=30, blank=True)
    address = models.TextField(blank=True)

    # Preferences
    notification_email = models.BooleanField(default=True)
    notification_sms = models.BooleanField(default=True)
    notification_push = models.BooleanField(default=True)
    timezone_preference = models.CharField(max_length=50, default='Africa/Nairobi')
    must_change_password = models.BooleanField(default=False)


    # ── Accessibility preferences (synced across devices) ──────────────────
    font_preference = models.CharField(
        max_length=20,
        choices=FONT_CHOICES,
        default='default',
        help_text='UI font selected by the user in Accessibility settings',
    )

    LANGUAGE_CHOICES = [
        ('en', 'English'),
        ('sw', 'Swahili'),
        ('fr', 'French'),
        ('ar', 'Arabic'),
        ('es', 'Spanish'),
        ('pt', 'Portuguese'),
    ]

    language_preference = models.CharField(
        max_length=10,
        choices=LANGUAGE_CHOICES,
        default='en',
        help_text='UI language selected by the user in Accessibility settings',
    )

    # Device tracking
    last_ip = models.GenericIPAddressField(null=True, blank=True)
    last_device = models.CharField(max_length=200, blank=True)
    fcm_token = models.TextField(blank=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    objects = UserManager()

    class Meta:  # type: ignore
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['role', 'organisation']),
            models.Index(fields=['branch', 'department']),
        ]

    @property
    def is_locked(self):
        return bool(self.locked_until and self.locked_until > timezone.now())

    def __str__(self):
        return f"{self.get_full_name()} ({self.get_role_display()})"

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def get_mfa_totp(self):
        if not self.mfa_secret:
            self.mfa_secret = pyotp.random_base32()
            self.save(update_fields=['mfa_secret'])
        return pyotp.TOTP(self.mfa_secret)

    def verify_mfa(self, token):
        if not self.mfa_enabled:
            return True
        totp = self.get_mfa_totp()
        return totp.verify(token, valid_window=1)

    @property
    def full_name(self):
        return self.get_full_name()

    @property
    def is_broadcast_role(self):
        return self.role in ['broadcast_admin', 'broadcast_staff', 'broadcast_student',
                             'journalist', 'presenter', 'editor', 'videographer', 'station_engineer']

    @property
    def is_attachee_role(self):
        return self.role in ['attachee', 'supervisor', 'department_leader', 'hr_officer',
                             'system_admin', 'data_analyst', 'executive']


class UserSession(TimeStampedModel):
    """Track active user sessions"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sessions')
    session_token = models.CharField(max_length=255, unique=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    device_type = models.CharField(max_length=50, blank=True)
    location = models.CharField(max_length=200, blank=True)
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField()
    last_activity = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.email} — {self.ip_address}"