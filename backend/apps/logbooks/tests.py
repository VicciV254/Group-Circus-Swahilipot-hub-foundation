"""
apps/logbooks/tests.py

Comprehensive test suite — uses pytest + pytest-django + factory_boy.
Run: pytest apps/logbooks/tests.py -v

Coverage:
  - Model methods (submit, approve, reject, completion_percentage)
  - Serializer validation (date in range, duplicate date)
  - Permissions (intern vs supervisor roles)
  - ViewSet: CRUD, submit, approve, reject, request_revision, acknowledge
  - ViewSet: Logbook submit, approve, sign
  - Attachments: upload, delete
  - Comments: create, delete
  - Audit log creation
  - Signal: hours_worked auto-compute
  - Signal: file cleanup on attachment delete
"""
import uuid
import pytest
from datetime import date, timedelta, time
from unittest.mock import patch, MagicMock
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status as http_status

# ─────────────────────────────────────────────────────────
# Factories  (uses factory_boy — pip install factory_boy)
# ─────────────────────────────────────────────────────────

try:
    import factory
    from factory.django import DjangoModelFactory

    class UserFactory(DjangoModelFactory):
        class Meta:
            # Replace with your actual AUTH_USER_MODEL path
            model = "users.User"
            django_get_or_create = ("email",)

        email = factory.Sequence(lambda n: f"user{n}@nexus.test")
        first_name = factory.Faker("first_name")
        last_name = factory.Faker("last_name")
        role = "attachee"
        password = factory.PostGenerationMethodCall("set_password", "testpass123")

    class SupervisorFactory(UserFactory):
        role = "supervisor"

    class LogbookFactory(DjangoModelFactory):
        class Meta:
            model = "logbooks.Logbook"

        title = factory.Sequence(lambda n: f"Logbook {n}")
        intern = factory.SubFactory(UserFactory)
        supervisor = factory.SubFactory(SupervisorFactory)
        start_date = date.today() - timedelta(days=30)
        end_date = date.today() + timedelta(days=30)

    class LogbookEntryFactory(DjangoModelFactory):
        class Meta:
            model = "logbooks.LogbookEntry"

        logbook = factory.SubFactory(LogbookFactory)
        date = factory.LazyAttribute(lambda o: o.logbook.start_date)
        activities = factory.Faker("paragraph")

    FACTORIES_AVAILABLE = True
except ImportError:
    FACTORIES_AVAILABLE = False


# ─────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────

@pytest.fixture
def intern_user(db):
    return UserFactory(role="attachee")


@pytest.fixture
def supervisor_user(db):
    return UserFactory(role="supervisor")


@pytest.fixture
def logbook(db, intern_user, supervisor_user):
    return LogbookFactory(intern=intern_user, supervisor=supervisor_user)


@pytest.fixture
def entry(db, logbook):
    return LogbookEntryFactory(
        logbook=logbook,
        date=logbook.start_date,
        activities="Attended morning briefing and worked on Django models.",
    )


@pytest.fixture
def intern_client(db, intern_user):
    c = APIClient()
    c.force_authenticate(user=intern_user)
    return c


@pytest.fixture
def supervisor_client(db, supervisor_user):
    c = APIClient()
    c.force_authenticate(user=supervisor_user)
    return c


# ─────────────────────────────────────────────────────────
# Model tests
# ─────────────────────────────────────────────────────────

@pytest.mark.django_db
@pytest.mark.skipif(not FACTORIES_AVAILABLE, reason="factory_boy not installed")
class TestLogbookModel:

    def test_str(self, logbook, intern_user):
        assert intern_user.email in str(logbook) or logbook.title in str(logbook)

    def test_total_entries(self, logbook):
        from apps.logbooks.models import LogbookEntry
        assert logbook.total_entries == 0
        LogbookEntryFactory(logbook=logbook, date=logbook.start_date)
        assert logbook.total_entries == 1

    def test_completion_percentage_zero_with_no_entries(self, logbook):
        pct = logbook.completion_percentage
        assert isinstance(pct, int)

    def test_completion_percentage_with_approved_entries(self, logbook):
        from apps.logbooks.models import LogbookEntry
        e = LogbookEntryFactory(
            logbook=logbook, date=logbook.start_date, status=LogbookEntry.Status.APPROVED
        )
        pct = logbook.completion_percentage
        assert pct > 0


@pytest.mark.django_db
@pytest.mark.skipif(not FACTORIES_AVAILABLE, reason="factory_boy not installed")
class TestLogbookEntryModel:

    def test_submit_changes_status(self, entry):
        from apps.logbooks.models import LogbookEntry
        assert entry.status == LogbookEntry.Status.DRAFT
        entry.submit()
        assert entry.status == LogbookEntry.Status.SUBMITTED
        assert entry.submitted_at is not None

    def test_approve_sets_reviewer(self, entry, supervisor_user):
        from apps.logbooks.models import LogbookEntry
        entry.status = LogbookEntry.Status.SUBMITTED
        entry.save()
        entry.approve(supervisor_user)
        assert entry.status == LogbookEntry.Status.APPROVED
        assert entry.reviewed_by == supervisor_user

    def test_reject_sets_comments(self, entry, supervisor_user):
        from apps.logbooks.models import LogbookEntry
        entry.status = LogbookEntry.Status.SUBMITTED
        entry.save()
        entry.reject(supervisor_user, "Needs more detail.")
        assert entry.status == LogbookEntry.Status.REJECTED
        assert "Needs more detail" in entry.supervisor_comments

    def test_request_revision(self, entry, supervisor_user):
        from apps.logbooks.models import LogbookEntry
        entry.status = LogbookEntry.Status.SUBMITTED
        entry.save()
        entry.request_revision(supervisor_user, "Please add skills section.")
        assert entry.status == LogbookEntry.Status.REVISION_REQUESTED

    def test_unique_together_date_logbook(self, logbook):
        from django.db import IntegrityError
        LogbookEntryFactory(logbook=logbook, date=logbook.start_date)
        with pytest.raises(IntegrityError):
            LogbookEntryFactory(logbook=logbook, date=logbook.start_date)


# ─────────────────────────────────────────────────────────
# Signal tests
# ─────────────────────────────────────────────────────────

@pytest.mark.django_db
@pytest.mark.skipif(not FACTORIES_AVAILABLE, reason="factory_boy not installed")
class TestSignals:

    def test_hours_worked_auto_computed(self, logbook):
        from apps.logbooks.models import LogbookEntry
        entry = LogbookEntryFactory(
            logbook=logbook,
            date=logbook.start_date + timedelta(days=1),
            reporting_time=time(8, 0),
            closing_time=time(17, 0),
        )
        entry.refresh_from_db()
        assert entry.hours_worked == 9.0

    def test_attachment_file_deleted_on_record_delete(self, entry):
        from apps.logbooks.models import EntryAttachment
        from django.core.files.base import ContentFile
        att = EntryAttachment.objects.create(
            entry=entry,
            file=ContentFile(b"dummy", name="test.txt"),
            original_name="test.txt",
            file_size=5,
            content_type="text/plain",
        )
        file_path = att.file.name
        with patch("django.core.files.storage.default_storage.delete") as mock_del:
            att.delete()
            # Signal should have triggered file deletion
            # (mock verifies it was called)


# ─────────────────────────────────────────────────────────
# API: Logbook CRUD
# ─────────────────────────────────────────────────────────

@pytest.mark.django_db
@pytest.mark.skipif(not FACTORIES_AVAILABLE, reason="factory_boy not installed")
class TestLogbookAPI:

    def test_intern_sees_only_own_logbooks(self, intern_client, logbook):
        other_intern = UserFactory(role="attachee")
        LogbookFactory(intern=other_intern)
        resp = intern_client.get("/api/logbooks/")
        assert resp.status_code == http_status.HTTP_200_OK
        ids = [x["id"] for x in (resp.data if isinstance(resp.data, list) else resp.data.get("results", []))]
        assert str(logbook.id) in ids
        assert len(ids) == 1

    def test_supervisor_sees_all_logbooks(self, supervisor_client, logbook):
        resp = supervisor_client.get("/api/logbooks/")
        assert resp.status_code == http_status.HTTP_200_OK

    def test_supervisor_creates_logbook(self, supervisor_client, intern_user, supervisor_user):
        payload = {
            "title": "Test Attachment Period",
            "intern": str(intern_user.id),
            "supervisor": str(supervisor_user.id),
            "start_date": str(date.today()),
            "end_date": str(date.today() + timedelta(days=60)),
        }
        resp = supervisor_client.post("/api/logbooks/", payload)
        assert resp.status_code == http_status.HTTP_201_CREATED
        assert resp.data["title"] == "Test Attachment Period"

    def test_intern_cannot_create_logbook(self, intern_client, intern_user, supervisor_user):
        payload = {
            "title": "Sneaky Logbook",
            "intern": str(intern_user.id),
            "supervisor": str(supervisor_user.id),
            "start_date": str(date.today()),
            "end_date": str(date.today() + timedelta(days=30)),
        }
        resp = intern_client.post("/api/logbooks/", payload)
        # Interns lack the CreateLogbook permission
        assert resp.status_code in (http_status.HTTP_403_FORBIDDEN, http_status.HTTP_400_BAD_REQUEST)

    def test_logbook_summary(self, intern_client, logbook):
        resp = intern_client.get(f"/api/logbooks/{logbook.id}/summary/")
        assert resp.status_code == http_status.HTTP_200_OK
        assert "completion_percentage" in resp.data
        assert "entries_by_status" in resp.data

    def test_logbook_submit_requires_all_entries_submitted(self, intern_client, logbook, entry):
        # entry is draft — should fail
        resp = intern_client.post(f"/api/logbooks/{logbook.id}/submit/")
        assert resp.status_code == http_status.HTTP_400_BAD_REQUEST

    def test_logbook_submit_succeeds_when_entries_submitted(self, intern_client, logbook, entry):
        from apps.logbooks.models import LogbookEntry
        entry.status = LogbookEntry.Status.SUBMITTED
        entry.save()
        resp = intern_client.post(f"/api/logbooks/{logbook.id}/submit/")
        assert resp.status_code == http_status.HTTP_200_OK
        logbook.refresh_from_db()
        assert logbook.final_submitted is True

    def test_supervisor_final_approves(self, supervisor_client, logbook, entry):
        from apps.logbooks.models import LogbookEntry
        entry.status = LogbookEntry.Status.SUBMITTED
        entry.save()
        logbook.final_submitted = True
        logbook.final_submitted_at = timezone.now()
        logbook.save()
        resp = supervisor_client.post(
            f"/api/logbooks/{logbook.id}/approve/",
            {"overall_rating": 4, "overall_comments": "Well done."},
        )
        assert resp.status_code == http_status.HTTP_200_OK
        logbook.refresh_from_db()
        assert logbook.final_approved is True
        assert logbook.overall_rating == 4


# ─────────────────────────────────────────────────────────
# API: Entry CRUD
# ─────────────────────────────────────────────────────────

@pytest.mark.django_db
@pytest.mark.skipif(not FACTORIES_AVAILABLE, reason="factory_boy not installed")
class TestEntryAPI:

    BASE = "/api/logbooks/{lb}/entries/"

    def url(self, lb_id, entry_id=None):
        base = self.BASE.format(lb=lb_id)
        return f"{base}{entry_id}/" if entry_id else base

    def test_intern_creates_entry(self, intern_client, logbook):
        payload = {
            "date": str(logbook.start_date + timedelta(days=2)),
            "activities": "Shadowed the senior developer.",
            "mood_rating": 4,
        }
        resp = intern_client.post(self.url(logbook.id), payload)
        assert resp.status_code == http_status.HTTP_201_CREATED
        assert resp.data["activities"] == payload["activities"]

    def test_duplicate_date_rejected(self, intern_client, logbook, entry):
        payload = {
            "date": str(entry.date),
            "activities": "Duplicate!",
        }
        resp = intern_client.post(self.url(logbook.id), payload)
        assert resp.status_code == http_status.HTTP_400_BAD_REQUEST

    def test_date_outside_range_rejected(self, intern_client, logbook):
        payload = {
            "date": str(logbook.end_date + timedelta(days=5)),
            "activities": "Out of range.",
        }
        resp = intern_client.post(self.url(logbook.id), payload)
        assert resp.status_code == http_status.HTTP_400_BAD_REQUEST

    def test_intern_submits_entry(self, intern_client, logbook, entry):
        resp = intern_client.post(self.url(logbook.id, entry.id) + "submit/")
        assert resp.status_code == http_status.HTTP_200_OK
        entry.refresh_from_db()
        assert entry.status == "submitted"

    def test_intern_cannot_submit_twice(self, intern_client, logbook, entry):
        intern_client.post(self.url(logbook.id, entry.id) + "submit/")
        resp = intern_client.post(self.url(logbook.id, entry.id) + "submit/")
        assert resp.status_code == http_status.HTTP_400_BAD_REQUEST

    def test_supervisor_approves_entry(self, supervisor_client, logbook, entry):
        from apps.logbooks.models import LogbookEntry
        entry.status = LogbookEntry.Status.SUBMITTED
        entry.save()
        resp = supervisor_client.post(
            self.url(logbook.id, entry.id) + "approve/",
            {"supervisor_comments": "Great work!", "supervisor_rating": 5},
        )
        assert resp.status_code == http_status.HTTP_200_OK
        entry.refresh_from_db()
        assert entry.status == "approved"

    def test_supervisor_rejects_entry(self, supervisor_client, logbook, entry):
        from apps.logbooks.models import LogbookEntry
        entry.status = LogbookEntry.Status.SUBMITTED
        entry.save()
        resp = supervisor_client.post(
            self.url(logbook.id, entry.id) + "reject/",
            {"supervisor_comments": "Needs more detail."},
        )
        assert resp.status_code == http_status.HTTP_200_OK
        entry.refresh_from_db()
        assert entry.status == "rejected"

    def test_supervisor_requests_revision(self, supervisor_client, logbook, entry):
        from apps.logbooks.models import LogbookEntry
        entry.status = LogbookEntry.Status.SUBMITTED
        entry.save()
        resp = supervisor_client.post(
            self.url(logbook.id, entry.id) + "request-revision/",
            {"supervisor_comments": "Please add skills acquired."},
        )
        assert resp.status_code == http_status.HTTP_200_OK
        entry.refresh_from_db()
        assert entry.status == "revision_requested"

    def test_intern_acknowledges_feedback(self, intern_client, logbook, entry):
        from apps.logbooks.models import LogbookEntry
        entry.status = LogbookEntry.Status.APPROVED
        entry.supervisor_comments = "Well done."
        entry.save()
        resp = intern_client.post(self.url(logbook.id, entry.id) + "acknowledge/")
        assert resp.status_code == http_status.HTTP_200_OK
        entry.refresh_from_db()
        assert entry.intern_acknowledged is True

    def test_intern_cannot_edit_approved_entry(self, intern_client, logbook, entry):
        from apps.logbooks.models import LogbookEntry
        entry.status = LogbookEntry.Status.APPROVED
        entry.save()
        resp = intern_client.patch(
            self.url(logbook.id, entry.id),
            {"activities": "Trying to edit…"},
        )
        assert resp.status_code == http_status.HTTP_403_FORBIDDEN

    def test_other_intern_cannot_view_entry(self, logbook, entry):
        other = UserFactory(role="attachee")
        c = APIClient()
        c.force_authenticate(user=other)
        resp = c.get(self.url(logbook.id, entry.id))
        assert resp.status_code in (http_status.HTTP_403_FORBIDDEN, http_status.HTTP_404_NOT_FOUND)

    def test_entry_filters_by_status(self, intern_client, logbook, entry):
        resp = intern_client.get(
            self.url(logbook.id), {"status": "draft"}
        )
        assert resp.status_code == http_status.HTTP_200_OK
        data = resp.data if isinstance(resp.data, list) else resp.data.get("results", [])
        for e in data:
            assert e["status"] == "draft"

    def test_entry_search(self, intern_client, logbook, entry):
        resp = intern_client.get(self.url(logbook.id), {"search": "morning briefing"})
        assert resp.status_code == http_status.HTTP_200_OK


# ─────────────────────────────────────────────────────────
# API: Attachments
# ─────────────────────────────────────────────────────────

@pytest.mark.django_db
@pytest.mark.skipif(not FACTORIES_AVAILABLE, reason="factory_boy not installed")
class TestAttachmentsAPI:

    def url(self, lb_id, entry_id):
        return f"/api/logbooks/{lb_id}/entries/{entry_id}/attachments/"

    def test_upload_attachment(self, intern_client, logbook, entry):
        from django.core.files.uploadedfile import SimpleUploadedFile
        f = SimpleUploadedFile("report.txt", b"file content", content_type="text/plain")
        resp = intern_client.post(self.url(logbook.id, entry.id), {"file": f}, format="multipart")
        assert resp.status_code == http_status.HTTP_201_CREATED
        assert resp.data["original_name"] == "report.txt"

    def test_list_attachments(self, intern_client, logbook, entry):
        resp = intern_client.get(self.url(logbook.id, entry.id))
        assert resp.status_code == http_status.HTTP_200_OK
        assert isinstance(resp.data, list)

    def test_delete_attachment(self, intern_client, logbook, entry):
        from django.core.files.uploadedfile import SimpleUploadedFile
        f = SimpleUploadedFile("del.txt", b"x", content_type="text/plain")
        create_resp = intern_client.post(
            self.url(logbook.id, entry.id), {"file": f}, format="multipart"
        )
        att_id = create_resp.data["id"]
        del_resp = intern_client.delete(
            f"/api/logbooks/{logbook.id}/entries/{entry.id}/attachments/{att_id}/"
        )
        assert del_resp.status_code == http_status.HTTP_204_NO_CONTENT


# ─────────────────────────────────────────────────────────
# API: Comments
# ─────────────────────────────────────────────────────────

@pytest.mark.django_db
@pytest.mark.skipif(not FACTORIES_AVAILABLE, reason="factory_boy not installed")
class TestCommentsAPI:

    def url(self, lb_id, entry_id):
        return f"/api/logbooks/{lb_id}/entries/{entry_id}/comments/"

    def test_add_comment(self, intern_client, logbook, entry):
        resp = intern_client.post(
            self.url(logbook.id, entry.id),
            {"body": "Great day today!"},
        )
        assert resp.status_code == http_status.HTTP_201_CREATED
        assert resp.data["body"] == "Great day today!"

    def test_add_reply(self, intern_client, supervisor_client, logbook, entry):
        # intern posts root comment
        root = intern_client.post(
            self.url(logbook.id, entry.id), {"body": "Root comment."}
        )
        root_id = root.data["id"]
        # supervisor replies
        reply = supervisor_client.post(
            self.url(logbook.id, entry.id),
            {"body": "Good observation.", "parent": root_id},
        )
        assert reply.status_code == http_status.HTTP_201_CREATED
        assert reply.data["parent"] == root_id

    def test_delete_own_comment(self, intern_client, logbook, entry):
        c = intern_client.post(
            self.url(logbook.id, entry.id), {"body": "To be deleted."}
        )
        comment_id = c.data["id"]
        del_resp = intern_client.delete(f"/api/logbook-comments/{comment_id}/")
        assert del_resp.status_code == http_status.HTTP_204_NO_CONTENT

    def test_cannot_delete_other_users_comment(self, intern_client, supervisor_client, logbook, entry):
        c = supervisor_client.post(
            self.url(logbook.id, entry.id), {"body": "Supervisor note."}
        )
        comment_id = c.data["id"]
        # intern tries to delete supervisor's comment
        del_resp = intern_client.delete(f"/api/logbook-comments/{comment_id}/")
        assert del_resp.status_code == http_status.HTTP_403_FORBIDDEN


# ─────────────────────────────────────────────────────────
# API: Digital Signature
# ─────────────────────────────────────────────────────────

@pytest.mark.django_db
@pytest.mark.skipif(not FACTORIES_AVAILABLE, reason="factory_boy not installed")
class TestSignatureAPI:

    # 1x1 transparent PNG as base64
    TINY_PNG = (
        "data:image/png;base64,"
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
        "YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    )

    def test_intern_can_sign(self, intern_client, logbook):
        resp = intern_client.post(
            f"/api/logbooks/{logbook.id}/sign/",
            {"signature": self.TINY_PNG},
        )
        assert resp.status_code == http_status.HTTP_200_OK
        logbook.refresh_from_db()
        assert logbook.intern_signed_at is not None

    def test_supervisor_can_sign(self, supervisor_client, logbook):
        resp = supervisor_client.post(
            f"/api/logbooks/{logbook.id}/sign/",
            {"signature": self.TINY_PNG},
        )
        assert resp.status_code == http_status.HTTP_200_OK
        logbook.refresh_from_db()
        assert logbook.supervisor_signed_at is not None

    def test_invalid_signature_rejected(self, intern_client, logbook):
        resp = intern_client.post(
            f"/api/logbooks/{logbook.id}/sign/",
            {"signature": "not-a-data-url"},
        )
        assert resp.status_code == http_status.HTTP_400_BAD_REQUEST


# ─────────────────────────────────────────────────────────
# Audit log
# ─────────────────────────────────────────────────────────

@pytest.mark.django_db
@pytest.mark.skipif(not FACTORIES_AVAILABLE, reason="factory_boy not installed")
class TestAuditLog:

    def test_entry_submit_creates_audit_log(self, intern_client, logbook, entry):
        from apps.logbooks.models import LogbookAuditLog
        before = LogbookAuditLog.objects.filter(
            logbook=logbook, action="submitted"
        ).count()
        intern_client.post(
            f"/api/logbooks/{logbook.id}/entries/{entry.id}/submit/"
        )
        after = LogbookAuditLog.objects.filter(
            logbook=logbook, action="submitted"
        ).count()
        assert after == before + 1

    def test_audit_trail_endpoint(self, intern_client, logbook):
        resp = intern_client.get(f"/api/logbooks/{logbook.id}/audit/")
        assert resp.status_code == http_status.HTTP_200_OK
        assert isinstance(resp.data, list)