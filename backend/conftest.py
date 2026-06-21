# conftest.py  (place at project root alongside manage.py)
"""
Pytest configuration for the Nexus project.
pip install pytest pytest-django factory-boy

pytest.ini (or pyproject.toml) must contain:
    [pytest]
    DJANGO_SETTINGS_MODULE = config.settings.test
    python_files = tests.py test_*.py *_test.py
"""
import django
import pytest


# ── Shared markers ────────────────────────────────────────
def pytest_configure(config):
    config.addinivalue_line(
        "markers", "slow: mark test as slow (run with --runslow)"
    )


# ── Silence unnecessary logging during tests ─────────────
@pytest.fixture(autouse=True)
def silence_loggers(caplog):
    import logging
    logging.disable(logging.CRITICAL)
    yield
    logging.disable(logging.NOTSET)


# ── Re-usable API client fixture ─────────────────────────
@pytest.fixture
def api_client():
    from rest_framework.test import APIClient
    return APIClient()


# ── Shared settings overrides for tests ──────────────────
# config/settings/test.py  — minimal example:
TEST_SETTINGS_SNIPPET = """
from .base import *

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

DEFAULT_FILE_STORAGE = "django.core.files.storage.InMemoryStorage"

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
"""
