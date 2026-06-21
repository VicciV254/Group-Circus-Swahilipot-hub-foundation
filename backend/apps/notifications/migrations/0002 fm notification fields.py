"""
Adds FM-broadcast-specific notification toggle fields onto the existing
NotificationPreference model in this app, instead of introducing a second,
duplicate model in apps.fm_report.

The model already has a blanket `fm_notifications` boolean (per-type on/off
switch, alongside task_notifications, attendance_notifications, etc) — that
field is untouched and still works as the master switch the rest of the app
already checks. These new fields add finer-grained event-level toggles on
top of it, used only by the FM ops page's own settings tab.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='notificationpreference',
            name='email_on_outage',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='notificationpreference',
            name='sms_on_outage',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='notificationpreference',
            name='email_on_restored',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='notificationpreference',
            name='sms_on_restored',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='notificationpreference',
            name='email_on_emergency_alert',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='notificationpreference',
            name='sms_on_emergency_alert',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='notificationpreference',
            name='fm_minimum_severity',
            field=models.CharField(
                max_length=20,
                choices=[('low', 'Low'), ('medium', 'Medium'), ('high', 'High'), ('critical', 'Critical')],
                default='low',
                help_text='Suppress FM-related notifications below this severity.',
            ),
        ),
    ]
