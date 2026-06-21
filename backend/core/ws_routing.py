"""Nexus WebSocket — Real-time notifications consumer"""
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.urls import re_path


class NotificationConsumer(AsyncWebsocketConsumer):
    """Real-time notification delivery via WebSocket"""

    async def connect(self):
        self.user = self.scope.get('user')
        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return

        # Personal notification channel
        self.personal_group = f'user_{self.user.id}'
        # Org-wide broadcast channel
        self.org_group = f'org_{self.user.organisation_id}'

        await self.channel_layer.group_add(self.personal_group, self.channel_name)
        await self.channel_layer.group_add(self.org_group, self.channel_name)

        # If broadcast admin/staff — join FM alerts group
        if self.user.role in ('broadcast_admin', 'broadcast_staff', 'station_engineer'):
            await self.channel_layer.group_add(
                f'fm_alerts_{self.user.organisation_id}', self.channel_name
            )

        await self.accept()

        # Send unread count on connect
        count = await self.get_unread_count()
        await self.send(json.dumps({
            'type': 'connected',
            'unread_count': count,
            'user_id': str(self.user.id),
        }))

    async def disconnect(self, close_code):
        if hasattr(self, 'personal_group'):
            await self.channel_layer.group_discard(self.personal_group, self.channel_name)
        if hasattr(self, 'org_group'):
            await self.channel_layer.group_discard(self.org_group, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        action = data.get('action')

        if action == 'mark_read':
            notification_id = data.get('notification_id')
            if notification_id:
                await self.mark_notification_read(notification_id)
                await self.send(json.dumps({
                    'type': 'notification_marked_read',
                    'notification_id': notification_id,
                }))

        elif action == 'get_unread_count':
            count = await self.get_unread_count()
            await self.send(json.dumps({
                'type': 'unread_count',
                'count': count,
            }))

    # ── Group message handlers ─────────────────────────────────────────────

    async def notification_message(self, event):
        """Handle notification pushed to personal or org group"""
        await self.send(json.dumps({
            'type': 'notification',
            'notification': event['notification'],
        }))

    async def fm_alert(self, event):
        """Handle FM station alert"""
        await self.send(json.dumps({
            'type': 'fm_alert',
            'station': event['station'],
            'status': event['status'],
            'message': event['message'],
            'timestamp': event['timestamp'],
        }))

    async def emergency_alert(self, event):
        """Handle emergency alert — shows as top-priority banner"""
        await self.send(json.dumps({
            'type': 'emergency_alert',
            'alert': event['alert'],
        }))

    # ── DB helpers ────────────────────────────────────────────────────────

    @database_sync_to_async
    def get_unread_count(self):
        from apps.notifications.models import Notification
        return Notification.objects.filter(recipient=self.user, read=False).count()

    @database_sync_to_async
    def mark_notification_read(self, notification_id):
        from apps.notifications.models import Notification
        try:
            n = Notification.objects.get(id=notification_id, recipient=self.user)
            n.mark_read()
        except Notification.DoesNotExist:
            pass


# ── URL Routing ───────────────────────────────────────────────────────────
websocket_urlpatterns = [
    re_path(r'ws/notifications/$', NotificationConsumer.as_asgi()),
]


# ── WebSocket broadcast helpers ───────────────────────────────────────────
async def broadcast_notification(user_id, notification_data):
    """Push a notification to a specific user's WebSocket"""
    from channels.layers import get_channel_layer
    channel_layer = get_channel_layer()
    await channel_layer.group_send(
        f'user_{user_id}',
        {'type': 'notification_message', 'notification': notification_data}
    )


async def broadcast_fm_alert(org_id, station_name, status, message):
    """Broadcast FM status change to all broadcast staff"""
    from channels.layers import get_channel_layer
    from django.utils import timezone
    channel_layer = get_channel_layer()
    await channel_layer.group_send(
        f'fm_alerts_{org_id}',
        {
            'type': 'fm_alert',
            'station': station_name,
            'status': status,
            'message': message,
            'timestamp': timezone.now().isoformat(),
        }
    )


async def broadcast_emergency(org_id, alert_data):
    """Broadcast emergency alert to entire org"""
    from channels.layers import get_channel_layer
    channel_layer = get_channel_layer()
    await channel_layer.group_send(
        f'org_{org_id}',
        {'type': 'emergency_alert', 'alert': alert_data}
    )
