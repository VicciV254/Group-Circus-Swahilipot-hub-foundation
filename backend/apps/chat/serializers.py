"""
apps/chat/serializers.py — Updated with group permissions + voice
"""
from django.utils import timezone
from rest_framework import serializers
from .models import (
    Conversation, ConversationMember, ChatMedia,
    Message, MessageReceipt, UserPresence, Call, GroupAuditLog,
)


def safe_name(user):
    try:
        full = f"{user.first_name or ''} {user.last_name or ''}".strip()
        return full or user.email
    except Exception:
        return "Unknown"


class ParticipantSerializer(serializers.Serializer):
    id = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()
    isOnline = serializers.SerializerMethodField()
    lastSeen = serializers.SerializerMethodField()

    def get_id(self, user):
        return str(user.id)

    def get_name(self, user):
        return safe_name(user)

    def get_role(self, user):
        return getattr(user, "role", "") or ""

    def get_department(self, user):
        try:
            dept = getattr(user, "department", None)
            if dept:
                return str(dept)
        except Exception:
            pass
        return None

    def get_email(self, user):
        return user.email or ""

    def get_isOnline(self, user):
        try:
            return user.presence.status == "online"
        except Exception:
            return False

    def get_lastSeen(self, user):
        try:
            p = user.presence
            if p.status != "online" and p.last_seen:
                diff = timezone.now() - p.last_seen
                m = int(diff.total_seconds() // 60)
                if m < 1: return "just now"
                if m < 60: return f"{m}m ago"
                if m < 1440: return f"{m // 60}h ago"
                return f"{m // 1440}d ago"
        except Exception:
            pass
        return None


class ChatMediaSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    name = serializers.CharField(source="original_name")
    type = serializers.CharField(source="media_type")

    class Meta:
        model = ChatMedia
        fields = ["id", "type", "url", "name", "size", "mime_type", "duration", "created_at"]

    def get_url(self, obj):
        request = self.context.get("request")
        try:
            if request and obj.file:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url if obj.file else ""
        except Exception:
            return ""


class CallSerializer(serializers.ModelSerializer):
    type = serializers.CharField(source="call_type")
    initiatorId = serializers.SerializerMethodField()
    recipientId = serializers.SerializerMethodField()
    conversationId = serializers.SerializerMethodField()

    class Meta:
        model = Call
        fields = ["id", "type", "status", "initiatorId", "recipientId",
                  "conversationId", "started_at", "connected_at", "ended_at", "duration"]

    def get_initiatorId(self, obj):
        return str(obj.initiator_id) if obj.initiator_id else None

    def get_recipientId(self, obj):
        return str(obj.recipient_id) if obj.recipient_id else None

    def get_conversationId(self, obj):
        return str(obj.conversation_id)


class MessageSerializer(serializers.ModelSerializer):
    senderId = serializers.SerializerMethodField()
    senderName = serializers.SerializerMethodField()
    timestamp = serializers.DateTimeField(source="created_at")
    media = ChatMediaSerializer(many=True, read_only=True)
    callRecord = serializers.SerializerMethodField()
    isSystem = serializers.BooleanField(source="is_system")
    replyTo = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ["id", "senderId", "senderName", "content", "status",
                  "timestamp", "media", "callRecord", "isSystem", "replyTo"]

    def get_senderId(self, obj):
        return str(obj.sender_id) if obj.sender_id else None

    def get_senderName(self, obj):
        if not obj.sender:
            return "Unknown"
        return safe_name(obj.sender)

    def get_callRecord(self, obj):
        try:
            cr = obj.call_record
            if not cr:
                return None
            return {
                "id": str(cr.id),
                "type": cr.call_type,
                "status": cr.status,
                "duration": cr.duration,
                "initiatorId": str(cr.initiator_id) if cr.initiator_id else None,
                "recipientId": str(cr.recipient_id) if cr.recipient_id else None,
                "started_at": cr.started_at.isoformat() if cr.started_at else None,
            }
        except Exception:
            return None

    def get_replyTo(self, obj):
        if not obj.reply_to_id:
            return None
        try:
            r = obj.reply_to
            return {
                "id": str(r.id),
                "senderId": str(r.sender_id),
                "senderName": safe_name(r.sender) if r.sender else "Unknown",
                "content": r.content[:100],
            }
        except Exception:
            return None


class ConversationMemberSerializer(serializers.ModelSerializer):
    id = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()

    class Meta:
        model = ConversationMember
        fields = ["id", "name", "email", "role", "is_admin", "can_send", "is_muted", "joined_at"]

    def get_id(self, obj):
        return str(obj.user_id)

    def get_name(self, obj):
        return safe_name(obj.user)

    def get_email(self, obj):
        return obj.user.email


class ConversationSerializer(serializers.ModelSerializer):
    participants = serializers.SerializerMethodField()
    lastMessage = serializers.SerializerMethodField()
    unreadCount = serializers.SerializerMethodField()
    sendPermission = serializers.CharField(source="send_permission")
    canSend = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ["id", "type", "name", "description", "sendPermission", "canSend",
                  "participants", "lastMessage", "unreadCount", "updated_at"]

    def get_participants(self, obj):
        request = self.context.get("request")
        current_user = request.user if request else None
        try:
            members_qs = obj.members.select_related("user").all()
            if obj.type == "direct" and current_user:
                users = [m.user for m in members_qs if m.user_id != current_user.id]
            else:
                users = [m.user for m in members_qs]
            return ParticipantSerializer(users, many=True, context=self.context).data
        except Exception:
            return []

    def get_lastMessage(self, obj):
        try:
            msg = obj.messages.order_by("-created_at").first()
            if not msg:
                return None
            request = self.context.get("request")
            current_user = request.user if request else None
            is_mine = current_user and str(msg.sender_id) == str(current_user.id)
            content = msg.content or ("[voice]" if msg.media.filter(media_type="voice").exists()
                                      else "[media]" if msg.media.exists() else "[call]")
            sender_name = "You" if is_mine else (safe_name(msg.sender) if msg.sender else "Unknown")
            return {
                "content": content,
                "timestamp": msg.created_at.isoformat(),
                "senderName": sender_name,
            }
        except Exception:
            return None

    def get_unreadCount(self, obj):
        try:
            request = self.context.get("request")
            if not request:
                return 0
            return obj.get_unread_count(request.user)
        except Exception:
            return 0

    def get_canSend(self, obj):
        try:
            request = self.context.get("request")
            if not request:
                return True
            return obj.can_send_message(request.user)
        except Exception:
            return True


class PresenceSerializer(serializers.ModelSerializer):
    userId = serializers.SerializerMethodField()
    isOnline = serializers.SerializerMethodField()

    class Meta:
        model = UserPresence
        fields = ["userId", "status", "isOnline", "last_seen"]

    def get_userId(self, obj):
        return str(obj.user_id)

    def get_isOnline(self, obj):
        return obj.status == "online"


class AuditLogSerializer(serializers.ModelSerializer):
    actorId = serializers.SerializerMethodField()
    actorName = serializers.SerializerMethodField()
    conversationId = serializers.SerializerMethodField()

    class Meta:
        model = GroupAuditLog
        fields = ["id", "action", "actorId", "actorName", "actor_role",
                  "conversationId", "group_name", "success", "detail", "created_at"]

    def get_actorId(self, obj):
        return str(obj.actor_id) if obj.actor_id else None

    def get_actorName(self, obj):
        if not obj.actor:
            return "Unknown"
        return safe_name(obj.actor)

    def get_conversationId(self, obj):
        return str(obj.conversation_id) if obj.conversation_id else None


# ── Write serializers ─────────────────────────────────────────────────────────

class SendMessageSerializer(serializers.Serializer):
    content = serializers.CharField(allow_blank=True, default="")
    media_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    reply_to_id = serializers.UUIDField(required=False, allow_null=True)


class CreateDirectSerializer(serializers.Serializer):
    recipient_id = serializers.UUIDField()


class CreateGroupSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    participant_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1)
    send_permission = serializers.ChoiceField(
        choices=["all", "admins_only", "selected"], default="all"
    )


class UpdatePresenceSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["online", "away", "offline"])


class InitiateCallSerializer(serializers.Serializer):
    recipient_id = serializers.UUIDField()
    type = serializers.ChoiceField(choices=["voice", "video"])
    conversation_id = serializers.UUIDField()


class EndCallSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["ended", "missed", "declined"])
    duration = serializers.IntegerField(required=False, min_value=0)


class UpdateGroupPermissionsSerializer(serializers.Serializer):
    send_permission = serializers.ChoiceField(choices=["all", "admins_only", "selected"])
    allowed_member_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list
    )


class UpdateMemberRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["admin", "moderator", "member"], required=False)
    can_send = serializers.BooleanField(required=False)
    is_muted = serializers.BooleanField(required=False)
    