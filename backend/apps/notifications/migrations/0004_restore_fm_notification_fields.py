# Restores the FM-broadcast notification preference fields that were
# accidentally removed by 0003_remove_notificationpreference_*.
#
# History:
#   0002 fm notification fields  — added email_on_outage, sms_on_outage,
#                                   email_on_restored, sms_on_restored,
#                                   email_on_emergency_alert, sms_on_emergency_alert,
#                                   fm_minimum_severity
#   0003_remove_...              — removed all of the above (unintentionally)
#   0004 (this file)             — re-adds them so the NotificationPreferenceSerializer
#                                  and the FM ops notification-preferences endpoint work

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0003_remove_notificationpreference_email_on_emergency_alert_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='notificationpreference',
            name='email_on_outage',
            field=models.BooleanField(
                default=True,
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
                default=True,
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
                default=True,
                verbose_name='Email on emergency alert',
                help_text='Send an email when a system-wide emergency alert is triggered.',
            ),
        ),
        migrations.AddField(
            model_name='notificationpreference',
            name='sms_on_emergency_alert',
            field=models.BooleanField(
                default=True,
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
                choices=[
                    ('low',      'Low'),
                    ('medium',   'Medium'),
                    ('high',     'High'),
                    ('critical', 'Critical'),
                ],
                help_text='Suppress FM-related notifications below this severity.',
            ),
        ),
    ]
