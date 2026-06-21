"""
apps/chat/consumers.py

ChatConsumer — real-time WebSocket handler.
Uses scope["user"] set by JWTAuthMiddleware (no second token parse needed).
"""
import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone

logger = logging.getLogger(__name__)


class ChatConsumer(AsyncWebsocketConsumer):
    """
    Group naming:
      chat_user_{user_id}       — personal channel (call invites)
      chat_conv_{conv_id}       — per-conversation broadcast
    """

    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        self.user = user
        self.user_id = str(user.id)
        self.user_group = f"chat_user_{self.user_id}"
        self.conv_groups = []

        # Join personal channel
        await self.channel_layer.group_add(self.user_group, self.channel_name)

        # Join all conversation channels
        conv_ids = await self._get_conversation_ids()
        for cid in conv_ids:
            group = f"chat_conv_{cid}"
            await self.channel_layer.group_add(group, self.channel_name)
            self.conv_groups.append(group)

        await self.accept()
        await self._set_presence("online")
        await self._broadcast_presence(True)
        logger.info(f"ChatConsumer: {self.user} connected")

    async def disconnect(self, close_code):
        if not hasattr(self, "user"):
            return
        await self._set_presence("offline")
        await self._broadcast_presence(False)
        await self.channel_layer.group_discard(self.user_group, self.channel_name)
        for group in self.conv_groups:
            await self.channel_layer.group_discard(group, self.channel_name)
        logger.info(f"ChatConsumer: {self.user} disconnected ({close_code})")

    async def receive(self, text_data):
        try:
            payload = json.loads(text_data)
        except json.JSONDecodeError:
            return

        msg_type = payload.get("type")
        data = payload.get("payload", {})

        if msg_type == "typing":
            await self._handle_typing(data)
        elif msg_type == "message":
            await self._handle_message(data)
        elif msg_type == "presence":
            await self._handle_presence(data)
        elif msg_type == "call_status":
            await self._handle_call_status(data)

    # ── Outbound handlers ─────────────────────────────────────────────────────

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            "type": "message",
            "payload": event["payload"],
        }))

    async def chat_typing(self, event):
        await self.send(text_data=json.dumps({
            "type": "typing",
            "payload": event["payload"],
        }))

    async def chat_presence(self, event):
        await self.send(text_data=json.dumps({
            "type": "presence",
            "payload": event["payload"],
        }))

    async def chat_call_invite(self, event):
        await self.send(text_data=json.dumps({
            "type": "call_invite",
            "payload": event["payload"],
        }))

    async def chat_call_status(self, event):
        await self.send(text_data=json.dumps({
            "type": "call_status",
            "payload": event["payload"],
        }))

    # ── Inbound handlers ──────────────────────────────────────────────────────

    async def _handle_typing(self, data):
        conv_id = data.get("conversation_id")
        if not conv_id or not await self._is_member(conv_id):
            return
        await self.channel_layer.group_send(
            f"chat_conv_{conv_id}",
            {
                "type": "chat.typing",
                "payload": {
                    "conversation_id": conv_id,
                    "user_id": self.user_id,
                    "is_typing": bool(data.get("is_typing", False)),
                },
            },
        )

    async def _handle_message(self, data):
        conv_id = data.get("conversation_id")
        content = (data.get("content") or "").strip()
        if not conv_id or not content or not await self._is_member(conv_id):
            return
        msg = await self._save_message(conv_id, content)
        if not msg:
            return
        await self.channel_layer.group_send(
            f"chat_conv_{conv_id}",
            {
                "type": "chat.message",
                "payload": {
                    "id": str(msg.id),
                    "conversation_id": conv_id,
                    "senderId": self.user_id,
                    "senderName": self.user.get_full_name() or self.user.email,
                    "content": content,
                    "status": "sent",
                    "timestamp": msg.created_at.isoformat(),
                    "isSystem": False,
                },
            },
        )

    async def _handle_presence(self, data):
        new_status = data.get("status", "online")
        if new_status not in ("online", "away", "offline"):
            return
        await self._set_presence(new_status)
        await self._broadcast_presence(new_status == "online")

    async def _handle_call_status(self, data):
        call_id = data.get("call_id")
        new_status = data.get("status")
        conv_id = data.get("conversation_id")
        if not all([call_id, new_status, conv_id]):
            return
        await self.channel_layer.group_send(
            f"chat_conv_{conv_id}",
            {
                "type": "chat.call_status",
                "payload": {
                    "call_id": call_id,
                    "status": new_status,
                    "user_id": self.user_id,
                },
            },
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _broadcast_presence(self, is_online: bool):
        for group in self.conv_groups:
            await self.channel_layer.group_send(
                group,
                {
                    "type": "chat.presence",
                    "payload": {
                        "user_id": self.user_id,
                        "is_online": is_online,
                    },
                },
            )

    @database_sync_to_async
    def _get_conversation_ids(self):
        from apps.chat.models import ConversationMember
        return list(
            ConversationMember.objects.filter(user=self.user)
            .values_list("conversation_id", flat=True)
        )

    @database_sync_to_async
    def _is_member(self, conv_id):
        from apps.chat.models import ConversationMember
        return ConversationMember.objects.filter(
            conversation_id=conv_id, user=self.user
        ).exists()

    @database_sync_to_async
    def _set_presence(self, status: str):
        from apps.chat.models import UserPresence
        UserPresence.objects.update_or_create(
            user=self.user,
            defaults={"status": status},
        )

    @database_sync_to_async
    def _save_message(self, conv_id, content):
        from apps.chat.models import Message
        try:
            return Message.objects.create(
                conversation_id=conv_id,
                sender=self.user,
                content=content,
                status="sent",
            )
        except Exception as e:
            logger.error(f"WS message save error: {e}")
            return None
