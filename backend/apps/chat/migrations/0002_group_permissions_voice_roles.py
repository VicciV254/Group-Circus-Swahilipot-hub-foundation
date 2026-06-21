"""
apps/chat/migrations/0002_group_permissions_voice_roles.py
Adds: send_permission, avatar, member role/can_send/is_muted,
      voice media type, reply_to on Message, duration on ChatMedia
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("chat", "0001_initial"),
    ]

    operations = [
        # Conversation: send_permission + avatar
        migrations.AddField(
            model_name="conversation",
            name="send_permission",
            field=models.CharField(
                choices=[
                    ("all", "All Members"),
                    ("admins_only", "Admins Only"),
                    ("selected", "Selected Members"),
                ],
                default="all",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="conversation",
            name="avatar",
            field=models.ImageField(blank=True, null=True, upload_to="chat/groups/"),
        ),

        # ConversationMember: role, can_send, is_muted
        migrations.AddField(
            model_name="conversationmember",
            name="role",
            field=models.CharField(
                choices=[
                    ("admin", "Admin"),
                    ("moderator", "Moderator"),
                    ("member", "Member"),
                ],
                default="member",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="conversationmember",
            name="can_send",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="conversationmember",
            name="is_muted",
            field=models.BooleanField(default=False),
        ),

        # ChatMedia: voice type + duration
        migrations.AlterField(
            model_name="chatmedia",
            name="media_type",
            field=models.CharField(
                choices=[
                    ("image", "Image"),
                    ("video", "Video"),
                    ("audio", "Audio"),
                    ("voice", "Voice Message"),
                    ("document", "Document"),
                ],
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="chatmedia",
            name="duration",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),

        # Message: reply_to
        migrations.AddField(
            model_name="message",
            name="reply_to",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="replies",
                to="chat.message",
            ),
        ),

        # NOTE: UserPresence.updated_at is NOT added here — it was already
        # created in 0001_initial.py's CreateModel. Adding it again caused:
        # django.db.utils.ProgrammingError: column "updated_at" of relation
        # "chat_userpresence" already exists
    ]
