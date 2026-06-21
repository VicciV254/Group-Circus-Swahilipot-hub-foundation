# backend/apps/ai_assistant/models.py
# ── Nexus AI Assistant — Django Models ────────────────────────────────────────

import uuid
from django.db import models
from django.conf import settings


class AIConversation(models.Model):
    """Stores AI chat conversations per user."""

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user       = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_conversations",
    )
    title      = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.user} — {self.title}"


class AIMessage(models.Model):
    """Individual messages within a conversation."""

    ROLE_CHOICES = [
        ("user",      "User"),
        ("assistant", "Assistant"),
        ("system",    "System"),
    ]

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        AIConversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    role         = models.CharField(max_length=20, choices=ROLE_CHOICES)
    content      = models.TextField()
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"[{self.role}] {self.content[:60]}"
