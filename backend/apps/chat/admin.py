from django.contrib import admin
from .models import (
    Conversation, ConversationMember, ChatMedia,
    Message, MessageReceipt, UserPresence, Call, GroupAuditLog,
)


class ConversationMemberInline(admin.TabularInline):
    model = ConversationMember
    extra = 0
    readonly_fields = ("joined_at", "last_read_at")


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("id", "type", "name", "created_by", "created_at")
    list_filter = ("type",)
    search_fields = ("name", "created_by__email")
    inlines = [ConversationMemberInline]
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "conversation", "sender", "status", "is_system", "created_at")
    list_filter = ("status", "is_system")
    search_fields = ("content", "sender__email")
    readonly_fields = ("id", "created_at")


@admin.register(ChatMedia)
class ChatMediaAdmin(admin.ModelAdmin):
    list_display = ("id", "original_name", "media_type", "uploaded_by", "size", "created_at")
    list_filter = ("media_type",)


@admin.register(UserPresence)
class UserPresenceAdmin(admin.ModelAdmin):
    list_display = ("user", "status", "last_seen")
    list_filter = ("status",)


@admin.register(Call)
class CallAdmin(admin.ModelAdmin):
    list_display = ("id", "call_type", "status", "initiator", "recipient", "started_at", "duration")
    list_filter = ("call_type", "status")


@admin.register(GroupAuditLog)
class GroupAuditLogAdmin(admin.ModelAdmin):
    list_display = ("id", "action", "actor", "actor_role", "group_name", "success", "created_at")
    list_filter = ("success",)
    readonly_fields = ("id", "created_at")
