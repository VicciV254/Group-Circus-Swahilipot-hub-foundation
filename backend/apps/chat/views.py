"""
apps/chat/views.py — Full featured with group permissions + real user listing
"""
import mimetypes
import logging
import traceback
from django.utils import timezone
from django.db import transaction
from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from .models import (
    Conversation, ConversationMember, ChatMedia,
    Message, MessageReceipt, UserPresence, Call, GroupAuditLog,
)
from .serializers import (
    ConversationSerializer, MessageSerializer, ChatMediaSerializer,
    CallSerializer, PresenceSerializer, AuditLogSerializer,
    SendMessageSerializer, CreateDirectSerializer, CreateGroupSerializer,
    UpdatePresenceSerializer, InitiateCallSerializer, EndCallSerializer,
    UpdateGroupPermissionsSerializer, UpdateMemberRoleSerializer,
)

User = get_user_model()
logger = logging.getLogger(__name__)

ADMIN_ROLES = {"system_admin", "broadcast_admin", "hr_officer", "executive"}


def is_chat_admin(user):
    return getattr(user, "role", "") in ADMIN_ROLES or user.is_superuser


def safe_name(user):
    try:
        full = f"{user.first_name or ''} {user.last_name or ''}".strip()
        return full or user.email
    except Exception:
        return "Unknown"


def broadcast_chat_message(message, request=None):
    """
    Push a newly-created Message over WebSocket to everyone subscribed to
    chat_conv_{conversation_id}, so the recipient sees it live without
    refreshing. Payload shape matches what ChatConsumer._handle_message
    already sends for WS-originated messages, so the frontend handler
    needs no changes.
    """
    try:
        channel_layer = get_channel_layer()
        if not channel_layer:
            return
        payload = {
            "id": str(message.id),
            "conversation_id": str(message.conversation_id),
            "senderId": str(message.sender_id) if message.sender_id else None,
            "senderName": safe_name(message.sender) if message.sender else "Unknown",
            "content": message.content,
            "status": message.status,
            "timestamp": message.created_at.isoformat(),
            "isSystem": message.is_system,
            "media": ChatMediaSerializer(
                message.media.all(), many=True, context={"request": request}
            ).data,
            "replyTo": MessageSerializer(message, context={"request": request}).data.get("replyTo"),
        }
        async_to_sync(channel_layer.group_send)(
            f"chat_conv_{message.conversation_id}",
            {"type": "chat.message", "payload": payload},
        )
    except Exception as e:
        logger.error(f"broadcast_chat_message failed: {e}")


# ── Users (for conversation list) ────────────────────────────────────────────

class AllUsersView(APIView):
    """
    GET /chat/users/
    Returns all active users except the requester.
    Used by ConversationList to populate "Start conversation" section.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        users = User.objects.filter(
            is_active=True
        ).exclude(id=request.user.id).order_by("first_name", "last_name")

        result = []
        for u in users:
            is_online = False
            try:
                is_online = u.presence.status == "online"
            except Exception:
                pass
            result.append({
                "id": str(u.id),
                "name": safe_name(u),
                "role": getattr(u, "role", ""),
                "email": u.email,
                "isOnline": is_online,
            })
        return Response(result)


# ── Conversations ─────────────────────────────────────────────────────────────

class ConversationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            conv_ids = list(
                ConversationMember.objects.filter(user=request.user)
                .values_list("conversation_id", flat=True)
            )
            conversations = list(
                Conversation.objects.filter(id__in=conv_ids)
                .prefetch_related("members__user", "messages__sender")
                .order_by("-updated_at")
            )
            results = []
            for conv in conversations:
                try:
                    data = ConversationSerializer(conv, context={"request": request}).data
                    results.append(data)
                except Exception as e:
                    logger.error(f"Serialize conv {conv.id}: {e}")
                    results.append({
                        "id": str(conv.id),
                        "type": conv.type,
                        "name": conv.name or "",
                        "participants": [],
                        "lastMessage": None,
                        "unreadCount": 0,
                        "updated_at": conv.updated_at.isoformat(),
                    })
            return Response(results)
        except Exception as e:
            logger.error(f"ConversationListView: {e}\n{traceback.format_exc()}")
            return Response({"detail": str(e)}, status=500)


class ConversationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_conv(self, conv_id, user):
        try:
            return Conversation.objects.prefetch_related(
                "members__user"
            ).get(id=conv_id, members__user=user)
        except Conversation.DoesNotExist:
            return None

    def get(self, request, conv_id):
        conv = self._get_conv(conv_id, request.user)
        if not conv:
            return Response({"detail": "Not found."}, status=404)
        return Response(ConversationSerializer(conv, context={"request": request}).data)

    def patch(self, request, conv_id):
        conv = self._get_conv(conv_id, request.user)
        if not conv or conv.type != "group":
            return Response({"detail": "Not found."}, status=404)
        member = conv.members.filter(user=request.user).first()
        if not member or not member.is_admin:
            return Response({"detail": "Only group admins can update settings."}, status=403)
        if name := request.data.get("name"):
            conv.name = name
        if (desc := request.data.get("description")) is not None:
            conv.description = desc
        conv.save(update_fields=["name", "description", "updated_at"])
        return Response(ConversationSerializer(conv, context={"request": request}).data)


class UpdateGroupPermissionsView(APIView):
    """PATCH /chat/conversations/<id>/permissions/ — set who can send messages"""
    permission_classes = [IsAuthenticated]

    def patch(self, request, conv_id):
        try:
            conv = Conversation.objects.get(id=conv_id, type="group", members__user=request.user)
        except Conversation.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

        member = conv.members.filter(user=request.user).first()
        if not member or not member.is_admin:
            return Response({"detail": "Only group admins can change permissions."}, status=403)

        serializer = UpdateGroupPermissionsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        conv.send_permission = data["send_permission"]
        conv.save(update_fields=["send_permission", "updated_at"])

        # If switching to "selected", grant can_send to admins by default
        if data["send_permission"] == "selected":
            conv.members.filter(is_admin=True).update(can_send=True)
            if "allowed_member_ids" in data:
                conv.members.all().update(can_send=False)
                conv.members.filter(
                    user_id__in=data["allowed_member_ids"]
                ).update(can_send=True)
                conv.members.filter(is_admin=True).update(can_send=True)

        # Post system message
        perm_labels = {
            "all": "allowed all members to send messages",
            "admins_only": "restricted messaging to admins only",
            "selected": "restricted messaging to selected members",
        }
        Message.objects.create(
            conversation=conv,
            sender=request.user,
            content=f"{safe_name(request.user)} {perm_labels.get(data['send_permission'], 'updated permissions')}.",
            is_system=True,
        )

        return Response(ConversationSerializer(conv, context={"request": request}).data)


class UpdateMemberRoleView(APIView):
    """PATCH /chat/conversations/<conv_id>/members/<user_id>/ — promote/demote member"""
    permission_classes = [IsAuthenticated]

    def patch(self, request, conv_id, user_id):
        try:
            conv = Conversation.objects.get(id=conv_id, type="group")
        except Conversation.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

        # Only admins can change roles
        requester_member = conv.members.filter(user=request.user).first()
        if not requester_member or not requester_member.is_admin:
            return Response({"detail": "Only admins can change member roles."}, status=403)

        target_member = conv.members.filter(user_id=user_id).first()
        if not target_member:
            return Response({"detail": "Member not found."}, status=404)

        serializer = UpdateMemberRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if "role" in data:
            target_member.role = data["role"]
            target_member.is_admin = data["role"] == "admin"
        if "can_send" in data:
            target_member.can_send = data["can_send"]
        if "is_muted" in data:
            target_member.is_muted = data["is_muted"]

        target_member.save()

        action = f"made {safe_name(target_member.user)} a {target_member.role}"
        Message.objects.create(
            conversation=conv,
            sender=request.user,
            content=f"{safe_name(request.user)} {action}.",
            is_system=True,
        )

        return Response({
            "id": str(target_member.user_id),
            "role": target_member.role,
            "is_admin": target_member.is_admin,
            "can_send": target_member.can_send,
            "is_muted": target_member.is_muted,
        })


class GroupMembersView(APIView):
    """GET /chat/conversations/<id>/members/ — list all group members with roles"""
    permission_classes = [IsAuthenticated]

    def get(self, request, conv_id):
        if not ConversationMember.objects.filter(
            conversation_id=conv_id, user=request.user
        ).exists():
            return Response({"detail": "Not a member."}, status=403)

        members = ConversationMember.objects.filter(
            conversation_id=conv_id
        ).select_related("user")

        result = []
        for m in members:
            try:
                result.append({
                    "id": str(m.user_id),
                    "name": safe_name(m.user),
                    "email": m.user.email,
                    "role_in_group": m.role,
                    "is_admin": m.is_admin,
                    "can_send": m.can_send,
                    "is_muted": m.is_muted,
                    "joined_at": m.joined_at.isoformat(),
                })
            except Exception:
                continue
        return Response(result)

    def post(self, request, conv_id):
        """POST — add members to group"""
        try:
            conv = Conversation.objects.get(id=conv_id, type="group")
        except Conversation.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

        requester = conv.members.filter(user=request.user).first()
        if not requester or not requester.is_admin:
            return Response({"detail": "Only admins can add members."}, status=403)

        user_ids = request.data.get("user_ids", [])
        added = []
        for uid in user_ids:
            try:
                user = User.objects.get(id=uid, is_active=True)
                _, created = ConversationMember.objects.get_or_create(
                    conversation=conv, user=user,
                    defaults={"role": "member", "can_send": conv.send_permission != "admins_only"}
                )
                if created:
                    added.append(safe_name(user))
            except User.DoesNotExist:
                continue

        if added:
            Message.objects.create(
                conversation=conv,
                sender=request.user,
                content=f"{safe_name(request.user)} added {', '.join(added)} to the group.",
                is_system=True,
            )
            Conversation.objects.filter(id=conv_id).update(updated_at=timezone.now())

        return Response({"added": added})


class LeaveConversationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conv_id):
        member = ConversationMember.objects.filter(
            conversation_id=conv_id, user=request.user
        ).first()
        if not member:
            return Response({"detail": "Not a member."}, status=400)

        # If last admin is leaving a group, transfer admin to next member
        conv = member.conversation
        if conv.type == "group" and member.is_admin:
            other_admins = conv.members.filter(is_admin=True).exclude(user=request.user)
            if not other_admins.exists():
                next_member = conv.members.exclude(user=request.user).first()
                if next_member:
                    next_member.is_admin = True
                    next_member.role = "admin"
                    next_member.save()
                    Message.objects.create(
                        conversation=conv,
                        sender=None,
                        content=f"{safe_name(next_member.user)} is now the group admin.",
                        is_system=True,
                    )

        Message.objects.create(
            conversation=conv,
            sender=None,
            content=f"{safe_name(request.user)} left the group.",
            is_system=True,
        )
        member.delete()
        return Response({"detail": "Left conversation."})


class CreateDirectConversationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CreateDirectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        recipient_id = serializer.validated_data["recipient_id"]

        try:
            recipient = User.objects.get(id=recipient_id, is_active=True)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=404)

        if str(recipient.id) == str(request.user.id):
            return Response({"detail": "Cannot DM yourself."}, status=400)

        existing = (
            Conversation.objects.filter(type="direct")
            .filter(members__user=request.user)
            .filter(members__user=recipient)
            .first()
        )
        if existing:
            return Response(
                ConversationSerializer(existing, context={"request": request}).data
            )

        with transaction.atomic():
            conv = Conversation.objects.create(type="direct", created_by=request.user)
            ConversationMember.objects.create(conversation=conv, user=request.user)
            ConversationMember.objects.create(conversation=conv, user=recipient)

        return Response(
            ConversationSerializer(conv, context={"request": request}).data,
            status=201,
        )


class CreateGroupConversationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CreateGroupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        allowed = is_chat_admin(request.user)

        log_kwargs = dict(
            action="create_group",
            actor=request.user,
            actor_role=getattr(request.user, "role", ""),
            group_name=data["name"],
        )

        if not allowed:
            GroupAuditLog.objects.create(
                **log_kwargs, success=False, detail="Access denied."
            )
            return Response({"detail": "Only admins can create groups."}, status=403)

        members = User.objects.filter(id__in=data["participant_ids"], is_active=True)
        send_permission = data.get("send_permission", "all")

        with transaction.atomic():
            conv = Conversation.objects.create(
                type="group",
                name=data["name"],
                description=data.get("description", ""),
                created_by=request.user,
                send_permission=send_permission,
            )
            # Creator is admin
            ConversationMember.objects.create(
                conversation=conv,
                user=request.user,
                is_admin=True,
                role="admin",
                can_send=True,
            )
            for member in members:
                if member.id != request.user.id:
                    can_send = send_permission in ("all",)
                    ConversationMember.objects.get_or_create(
                        conversation=conv,
                        user=member,
                        defaults={
                            "role": "member",
                            "can_send": can_send,
                        }
                    )

            Message.objects.create(
                conversation=conv,
                sender=request.user,
                content=f"{safe_name(request.user)} created the group.",
                is_system=True,
            )
            GroupAuditLog.objects.create(
                **log_kwargs, success=True, conversation=conv,
                detail=f"send_permission={send_permission}, members={members.count() + 1}",
            )

        return Response(
            ConversationSerializer(conv, context={"request": request}).data,
            status=201,
        )


# ── Messages ──────────────────────────────────────────────────────────────────

class MessageListView(APIView):
    permission_classes = [IsAuthenticated]

    def _is_member(self, conv_id, user):
        return ConversationMember.objects.filter(
            conversation_id=conv_id, user=user
        ).exists()

    def get(self, request, conv_id):
        if not self._is_member(conv_id, request.user):
            return Response({"detail": "Not a member."}, status=403)

        limit = int(request.query_params.get("limit", 50))
        before = request.query_params.get("before")

        qs = Message.objects.filter(
            conversation_id=conv_id
        ).select_related("sender", "reply_to__sender").prefetch_related("media", "call_record")

        if before:
            qs = qs.filter(created_at__lt=before)

        messages = list(reversed(list(qs.order_by("-created_at")[:limit])))

        now = timezone.now()
        for msg in messages:
            if msg.sender_id != request.user.id:
                MessageReceipt.objects.update_or_create(
                    message=msg, user=request.user,
                    defaults={"delivered_at": now},
                )

        return Response({
            "results": MessageSerializer(
                messages, many=True, context={"request": request}
            ).data,
            "count": len(messages),
        })

    def post(self, request, conv_id):
        if not self._is_member(conv_id, request.user):
            return Response({"detail": "Not a member."}, status=403)

        # Check send permissions
        try:
            conv = Conversation.objects.get(id=conv_id)
            if not conv.can_send_message(request.user):
                return Response(
                    {"detail": "You don't have permission to send messages in this group."},
                    status=403,
                )
        except Conversation.DoesNotExist:
            return Response({"detail": "Conversation not found."}, status=404)

        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if not data["content"] and not data.get("media_ids"):
            return Response({"detail": "Message must have content or media."}, status=400)

        with transaction.atomic():
            msg = Message.objects.create(
                conversation_id=conv_id,
                sender=request.user,
                content=data["content"],
                status="sent",
                reply_to_id=data.get("reply_to_id"),
            )
            if data.get("media_ids"):
                media_qs = ChatMedia.objects.filter(
                    id__in=data["media_ids"],
                    conversation_id=conv_id,
                    uploaded_by=request.user,
                )
                msg.media.set(media_qs)
            Conversation.objects.filter(id=conv_id).update(updated_at=timezone.now())

        broadcast_chat_message(msg, request)

        return Response(
            MessageSerializer(msg, context={"request": request}).data,
            status=201,
        )


class UpdateMessageStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, msg_id):
        try:
            msg = Message.objects.get(id=msg_id)
        except Message.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)

        new_status = request.data.get("status")
        if new_status not in ("sent", "delivered", "seen"):
            return Response({"detail": "Invalid status."}, status=400)
        if msg.sender_id == request.user.id:
            return Response({"detail": "Cannot update own message status."}, status=400)

        now = timezone.now()
        receipt, _ = MessageReceipt.objects.get_or_create(message=msg, user=request.user)
        if new_status == "delivered" and not receipt.delivered_at:
            receipt.delivered_at = now
        if new_status == "seen":
            receipt.delivered_at = receipt.delivered_at or now
            receipt.seen_at = now
        receipt.save()

        STATUS_ORDER = {"sent": 0, "delivered": 1, "seen": 2}
        if STATUS_ORDER.get(new_status, 0) > STATUS_ORDER.get(msg.status, 0):
            msg.status = new_status
            msg.save(update_fields=["status", "updated_at"])

        return Response(MessageSerializer(msg, context={"request": request}).data)


class MarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conv_id):
        member = ConversationMember.objects.filter(
            conversation_id=conv_id, user=request.user
        ).first()
        if not member:
            return Response({"detail": "Not a member."}, status=403)

        now = timezone.now()
        member.last_read_at = now
        member.save(update_fields=["last_read_at"])

        Message.objects.filter(
            conversation_id=conv_id
        ).exclude(sender=request.user).exclude(status="seen").update(status="seen")

        return Response({"detail": "Marked as read.", "read_at": now.isoformat()})


# ── Media + Voice ─────────────────────────────────────────────────────────────

class UploadMediaView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file = request.FILES.get("file")
        conv_id = request.data.get("conversation_id")
        is_voice = request.data.get("is_voice", "false").lower() == "true"
        duration = request.data.get("duration")

        if not file:
            return Response({"detail": "No file provided."}, status=400)
        if not ConversationMember.objects.filter(
            conversation_id=conv_id, user=request.user
        ).exists():
            return Response({"detail": "Not a member."}, status=403)

        mime = file.content_type or mimetypes.guess_type(file.name)[0] or ""

        if is_voice:
            media_type = "voice"
        elif mime.startswith("image/"):
            media_type = "image"
        elif mime.startswith("video/"):
            media_type = "video"
        elif mime.startswith("audio/"):
            media_type = "audio"
        else:
            media_type = "document"

        media = ChatMedia.objects.create(
            conversation_id=conv_id,
            uploaded_by=request.user,
            file=file,
            original_name=file.name,
            media_type=media_type,
            mime_type=mime,
            size=file.size,
            duration=int(duration) if duration else None,
        )
        return Response(
            ChatMediaSerializer(media, context={"request": request}).data,
            status=201,
        )


class SharedMediaView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conv_id):
        if not ConversationMember.objects.filter(
            conversation_id=conv_id, user=request.user
        ).exists():
            return Response({"detail": "Not a member."}, status=403)
        media = ChatMedia.objects.filter(conversation_id=conv_id).order_by("-created_at")
        if t := request.query_params.get("type"):
            media = media.filter(media_type=t)
        return Response({
            "results": ChatMediaSerializer(
                media, many=True, context={"request": request}
            ).data,
            "count": media.count(),
        })


# ── Presence ──────────────────────────────────────────────────────────────────

class OnlineUsersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        presences = UserPresence.objects.filter(status="online").select_related("user")
        result = []
        for p in presences:
            try:
                result.append({
                    "id": str(p.user_id),
                    "name": safe_name(p.user),
                    "role": getattr(p.user, "role", ""),
                    "email": p.user.email,
                    "isOnline": True,
                })
            except Exception:
                continue
        return Response(result)


class UpdatePresenceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = UpdatePresenceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data["status"]

        try:
            presence = UserPresence.objects.get(user=request.user)
            presence.status = new_status
            presence.save()
        except UserPresence.DoesNotExist:
            presence = UserPresence(user=request.user, status=new_status)
            presence.save()

        return Response(PresenceSerializer(presence).data)


# ── Calls ─────────────────────────────────────────────────────────────────────

class InitiateCallView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = InitiateCallSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            recipient = User.objects.get(id=data["recipient_id"], is_active=True)
        except User.DoesNotExist:
            return Response({"detail": "Recipient not found."}, status=404)

        if not ConversationMember.objects.filter(
            conversation_id=data["conversation_id"], user=request.user
        ).exists():
            return Response({"detail": "Not a member."}, status=403)

        with transaction.atomic():
            call = Call.objects.create(
                conversation_id=data["conversation_id"],
                initiator=request.user,
                recipient=recipient,
                call_type=data["type"],
                status="ringing",
            )
            Message.objects.create(
                conversation_id=data["conversation_id"],
                sender=request.user,
                content="",
                is_system=True,
                call_record=call,
            )

        return Response(CallSerializer(call).data, status=201)


class EndCallView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, call_id):
        try:
            call = Call.objects.get(id=call_id)
        except Call.DoesNotExist:
            return Response({"detail": "Call not found."}, status=404)

        if request.user not in (call.initiator, call.recipient):
            return Response({"detail": "Not a participant."}, status=403)

        serializer = EndCallSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        now = timezone.now()
        call.status = data["status"]
        call.ended_at = now
        if data.get("duration") is not None:
            call.duration = data["duration"]
        elif call.connected_at:
            call.duration = int((now - call.connected_at).total_seconds())
        call.save()
        return Response(CallSerializer(call).data)


class CallHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conv_id):
        if not ConversationMember.objects.filter(
            conversation_id=conv_id, user=request.user
        ).exists():
            return Response({"detail": "Not a member."}, status=403)
        calls = Call.objects.filter(
            conversation_id=conv_id
        ).select_related("initiator", "recipient").order_by("-started_at")
        return Response(CallSerializer(calls, many=True).data)


# ── Unread / Audit ────────────────────────────────────────────────────────────

class UnreadCountView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        total = 0
        try:
            memberships = ConversationMember.objects.filter(
                user=request.user
            ).select_related("conversation")
            for m in memberships:
                qs = m.conversation.messages.exclude(sender=request.user)
                if m.last_read_at:
                    qs = qs.filter(created_at__gt=m.last_read_at)
                total += qs.count()
        except Exception as e:
            logger.error(f"UnreadCountView: {e}")
        return Response({"count": total})


class AuditLogListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_chat_admin(request.user):
            return Response({"detail": "Admins only."}, status=403)
        logs = GroupAuditLog.objects.select_related(
            "actor", "conversation"
        ).order_by("-created_at")[:200]
        return Response(AuditLogSerializer(logs, many=True).data)