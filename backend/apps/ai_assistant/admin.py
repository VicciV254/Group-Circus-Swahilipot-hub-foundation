# backend/apps/ai_assistant/admin.py

from django.contrib import admin
from .models import AIConversation, AIMessage


class AIMessageInline(admin.TabularInline):
    model  = AIMessage
    fields = ["role", "content", "created_at"]
    readonly_fields = ["created_at"]
    extra  = 0


@admin.register(AIConversation)
class AIConversationAdmin(admin.ModelAdmin):
    list_display  = ["title", "user", "created_at", "updated_at"]
    list_filter   = ["created_at"]
    search_fields = ["title", "user__email"]
    inlines       = [AIMessageInline]
    readonly_fields = ["id", "created_at", "updated_at"]


@admin.register(AIMessage)
class AIMessageAdmin(admin.ModelAdmin):
    list_display  = ["role", "conversation", "created_at"]
    list_filter   = ["role", "created_at"]
    search_fields = ["content", "conversation__title"]
