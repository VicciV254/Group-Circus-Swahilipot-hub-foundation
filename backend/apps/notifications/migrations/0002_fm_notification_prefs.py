"""
Migration: add FM-broadcast notification preference fields to
apps.notifications.NotificationPreference.

Why here and not in apps.fm_report:
    NotificationPreference belongs to apps.notifications. FM Report is a
    tenant of that model, not its owner. Adding fields here keeps the
    single source of truth in the right app and avoids cross-app model
    imports in migrations.

Fields added
────────────
email_on_outage          – email me when a station goes off-air
sms_on_outage            – SMS me when a station goes off-air
email_on_restored        – email me when a station comes back on-air
sms_on_restored          – SMS me when a station comes back on-air
email_on_emergency_alert – email me when an emergency alert is triggered
sms_on_emergency_alert   – SMS me when an emergency alert is triggered
fm_minimum_severity      – suppress notifications below this severity level

All boolean fields default to False (opt-in), so existing users are not
unexpectedly enrolled. fm_minimum_severity defaults to 'low' (all alerts).
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    # Replace '0001_initial' with whatever your last notifications migration is.
    dependencies = [
        ('notifications', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='notificationpreference',
            name='email_on_outage',
            field=models.BooleanField(
                default=False,
                verbose_name='Email on FM outage',
                help_text='Send an email when a monitored FM station goes off-air.',
            ),
        ),
        migrations.AddField(
            model_name='notificationpreference',
            name='sms_on_outage',
            field=models.BooleanField(
                default=False,
                verbose_name='SMS on FM outage',
                help_text='Send an SMS when a monitored FM station goes off-air.',
            ),
        ),
        migrations.AddField(
            model_name='notificationpreference',
            name='email_on_restored',
            field=models.BooleanField(
                default=False,
                verbose_name='Email on FM restoration',
                help_text='Send an email when a monitored FM station is restored to air.',
            ),
        ),
        migrations.AddField(
            model_name='notificationpreference',
            name='sms_on_restored',
            field=models.BooleanField(
                default=False,
                verbose_name='SMS on FM restoration',
                help_text='Send an SMS when a monitored FM station is restored to air.',
            ),
        ),
        migrations.AddField(
            model_name='notificationpreference',
            name='email_on_emergency_alert',
            field=models.BooleanField(
                default=False,
                verbose_name='Email on emergency alert',
                help_text='Send an email when a system-wide emergency alert is triggered.',
            ),
        ),
        migrations.AddField(
            model_name='notificationpreference',
            name='sms_on_emergency_alert',
            field=models.BooleanField(
                default=False,
                verbose_name='SMS on emergency alert',
                help_text='Send an SMS when a system-wide emergency alert is triggered.',
            ),
        ),
        migrations.AddField(
            model_name='notificationpreference',
            name='fm_minimum_severity',
            field=models.CharField(
                max_length=20,
                default='low',
                verbose_name='Minimum FM alert severity',
                help_text=(
                    'Only send FM outage/alert notifications at or above this severity. '
                    'Choices: low, medium, high, critical.'
                ),
                choices=[
                    ('low',      'Low'),
                    ('medium',   'Medium'),
                    ('high',     'High'),
                    ('critical', 'Critical'),
                ],
            ),
        ),
    ]
