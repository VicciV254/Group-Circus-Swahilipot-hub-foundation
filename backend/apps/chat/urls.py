"""
apps/chat/urls.py — full URL set including group permissions + user listing
Mounted at: api/v1/chat/
"""
from django.urls import path
from . import views

urlpatterns = [
    # ── Users (real DB users for "Start conversation") ────────────────────────
    path("users/", views.AllUsersView.as_view(), name="chat-all-users"),

    # ── Conversations ─────────────────────────────────────────────────────────
    path("conversations/", views.ConversationListView.as_view(), name="chat-conversations"),
    path("conversations/direct/", views.CreateDirectConversationView.as_view(), name="chat-create-direct"),
    path("conversations/groups/", views.CreateGroupConversationView.as_view(), name="chat-create-group"),
    path("conversations/<uuid:conv_id>/", views.ConversationDetailView.as_view(), name="chat-detail"),
    path("conversations/<uuid:conv_id>/leave/", views.LeaveConversationView.as_view(), name="chat-leave"),
    path("conversations/<uuid:conv_id>/permissions/", views.UpdateGroupPermissionsView.as_view(), name="chat-permissions"),
    path("conversations/<uuid:conv_id>/members/", views.GroupMembersView.as_view(), name="chat-members"),
    path("conversations/<uuid:conv_id>/members/<uuid:user_id>/", views.UpdateMemberRoleView.as_view(), name="chat-member-role"),

    # ── Messages ──────────────────────────────────────────────────────────────
    path("conversations/<uuid:conv_id>/messages/", views.MessageListView.as_view(), name="chat-messages"),
    path("conversations/<uuid:conv_id>/read/", views.MarkReadView.as_view(), name="chat-mark-read"),
    path("conversations/<uuid:conv_id>/media/", views.SharedMediaView.as_view(), name="chat-shared-media"),
    path("conversations/<uuid:conv_id>/calls/", views.CallHistoryView.as_view(), name="chat-call-history"),
    path("messages/<uuid:msg_id>/", views.UpdateMessageStatusView.as_view(), name="chat-msg-status"),

    # ── Media ─────────────────────────────────────────────────────────────────
    path("media/", views.UploadMediaView.as_view(), name="chat-upload-media"),

    # ── Presence ──────────────────────────────────────────────────────────────
    path("presence/online/", views.OnlineUsersView.as_view(), name="chat-online"),
    path("presence/", views.UpdatePresenceView.as_view(), name="chat-presence"),

    # ── Calls ─────────────────────────────────────────────────────────────────
    path("calls/", views.InitiateCallView.as_view(), name="chat-call-init"),
    path("calls/<uuid:call_id>/", views.EndCallView.as_view(), name="chat-call-end"),

    # ── Utility ───────────────────────────────────────────────────────────────
    path("unread-count/", views.UnreadCountView.as_view(), name="chat-unread"),
    path("audit-logs/", views.AuditLogListView.as_view(), name="chat-audit"),
]