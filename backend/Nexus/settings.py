"""
Swahilipot Foundation Management System — Settings
"""
import os
import json
from pathlib import Path
from datetime import timedelta
from decouple import config

BASE_DIR = Path(__file__).resolve().parent.parent

# ── Core ──────────────────────────────────────────────────────────────────────
SECRET_KEY = config('SECRET_KEY')  # Required — no fallback
DEBUG = config('DEBUG',) == 'True'
ALLOWED_HOSTS = config('ALLOWED_HOSTS').split(',') # type: ignore

# ── Apps ──────────────────────────────────────────────────────────────────────
DJANGO_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_filters',
    'channels',
    'background_task',
    'storages',
]

LOCAL_APPS = [
    'apps.accounts',
    'apps.attachees',
    'apps.attendance',
    'apps.tasks',
    'apps.logbooks',
    'apps.evaluations',
    'apps.certificates',
    'apps.notifications',
    'apps.documents',
    'apps.analytics',
    'apps.finance',
    'apps.procurement',
    'apps.ict',
    'apps.communications',
    'apps.legal',
    'apps.qc',
    'apps.operations',
    'apps.customer_service',
    'apps.rd',
    'apps.hse',
    'apps.facilities',
    'apps.security',
    'apps.university',
    'apps.workflow',
    'apps.knowledge',
    'apps.equipment',
    'apps.projects',
    'apps.subscriptions',
    'apps.wifi',
    'apps.feedback',
    'apps.filetransfer',
    'apps.fm_report',
    'apps.calls',
    'apps.radio',
    'apps.news',
    'apps.videography',
    'apps.broadcast',
    'core',
    'apps.chat',
    'apps.ai_assistant'
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# ── Middleware ────────────────────────────────────────────────────────────────
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'core.middleware.AuditLogMiddleware',
    'core.middleware.RateLimitMiddleware',
]
APPEND_SLASH = False

ROOT_URLCONF = 'Nexus.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'Nexus.wsgi.application'
ASGI_APPLICATION = 'Nexus.asgi.application'

# ── Database ──────────────────────────────────────────────────────────────────
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME'),
        'USER': config('DB_USER'),
        'PASSWORD': config('DB_PASSWORD'),
        'HOST': config('DB_HOST'),
        'PORT': config('DB_PORT', '5432'),
        'OPTIONS': {
            'options': '-c search_path=public',
        },
        'CONN_MAX_AGE': 60,
    }
}

# ── Redis / Cache ─────────────────────────────────────────────────────────────
REDIS_URL = config('REDIS_URL')

CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': f"{REDIS_URL}/1",
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        }
    }
}

# for production
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [{
                "host": "127.0.0.1",
                "port": 6379,
                "db": 2,
                "socket_timeout": 60,
                "socket_keepalive": True,
                "socket_keepalive_options": {},
                "health_check_interval": 25,
            }],
        },
    }
}

# ── Celery ────────────────────────────────────────────────────────────────────
CELERY_BROKER_URL = f"{REDIS_URL}/1"
CELERY_RESULT_BACKEND = f"{REDIS_URL}/1"

# ── Auth ──────────────────────────────────────────────────────────────────────
AUTH_USER_MODEL = 'accounts.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 10}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ── JWT ───────────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=8),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}

# ── DRF ───────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'core.pagination.StandardResultsPagination',
    'PAGE_SIZE': 25,
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/hour',
        'user': '10000/hour',
        'login': '10/minute',
        'fm_report_writes': '200/hour',
    },
    'EXCEPTION_HANDLER': 'core.exceptions.custom_exception_handler',
}

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS').split(',') # type: ignore

CORS_ALLOW_CREDENTIALS = True
# ⚠️ CORS_ALLOW_ALL_ORIGINS removed — was allowing every website to call your API

# ── Static / Media ────────────────────────────────────────────────────────────
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# ── File Storage (S3 / MinIO / R2) ───────────────────────────────────────────
USE_S3 = config('USE_S3', 'False') == 'True'
if USE_S3:
    DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
    AWS_ACCESS_KEY_ID = config('AWS_ACCESS_KEY_ID')
    AWS_SECRET_ACCESS_KEY = config('AWS_SECRET_ACCESS_KEY')
    AWS_STORAGE_BUCKET_NAME = config('AWS_STORAGE_BUCKET_NAME', 'nexus-media')
    AWS_S3_ENDPOINT_URL = config('AWS_S3_ENDPOINT_URL')
    AWS_S3_FILE_OVERWRITE = False
    AWS_DEFAULT_ACL = 'private'
    AWS_S3_CUSTOM_DOMAIN = config('AWS_S3_CUSTOM_DOMAIN')

# ── Email ─────────────────────────────────────────────────────────────────────
EMAIL_BACKEND = config('EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = config('EMAIL_HOST', '')
EMAIL_PORT = int(config('EMAIL_PORT', 587))
EMAIL_USE_TLS = True
EMAIL_HOST_USER = config('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', '')
SERVER_EMAIL = DEFAULT_FROM_EMAIL

# ── SMS ───────────────────────────────────────────────────────────────────────
SMS_PROVIDER = config('SMS_PROVIDER', 'africas_talking')
SMS_API_KEY = config('SMS_API_KEY', '')
SMS_USERNAME = config('SMS_USERNAME', 'sandbox')
SMS_SHORTCODE = config('SMS_SHORTCODE', 'Nexus')

# ── Push / FCM ────────────────────────────────────────────────────────────────
FCM_SERVER_KEY = config('FCM_SERVER_KEY', '')

# ── Other settings ────────────────────────────────────────────────────────────
WORKPLACE_GEOFENCE_RADIUS_METERS = int(config('GEOFENCE_RADIUS', 100))
EMERGENCY_ALERT_EMAILS = config('EMERGENCY_ALERT_EMAILS').split(',') #type:ignore
EMERGENCY_ALERT_PHONES = config('EMERGENCY_ALERT_PHONES',).split(',') #type:ignore
FM_HEARTBEAT_ENDPOINT = config('FM_HEARTBEAT_ENDPOINT', '')
FM_HEARTBEAT_INTERVAL_SECONDS = int(config('FM_HEARTBEAT_INTERVAL', 300))

FM_PRESET_STREAMS = []
_fm_preset_streams_raw = str(config('FM_PRESET_STREAMS_JSON', ))
if _fm_preset_streams_raw:
    try:
        FM_PRESET_STREAMS = json.loads(_fm_preset_streams_raw)
    except (json.JSONDecodeError, TypeError):
        FM_PRESET_STREAMS = []

MFA_REQUIRED_ROLES = ['hr_officer', 'system_admin', 'executive', 'finance', 'legal']

# ── Internationalisation ──────────────────────────────────────────────────────
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Africa/Nairobi'
USE_I18N = True
USE_TZ = True  # Fixed — was False, causes datetime bugs

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ── Logging ───────────────────────────────────────────────────────────────────
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {'class': 'logging.StreamHandler', 'formatter': 'verbose'},
    },
    'root': {'handlers': ['console'], 'level': 'INFO'},
    'loggers': {
        'django': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
        'Nexus': {'handlers': ['console'], 'level': 'DEBUG', 'propagate': False},
    },
}
FRONTEND_URL = "http://localhost:5174"
# ── Security (production only) ────────────────────────────────────────────────
if not DEBUG:
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_SSL_REDIRECT = False
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    X_FRAME_OPTIONS = 'DENY'