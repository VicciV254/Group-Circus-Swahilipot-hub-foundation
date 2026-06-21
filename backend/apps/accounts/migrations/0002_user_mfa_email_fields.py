"""
Migration: Add email OTP fields to accounts.User
Run: python manage.py migrate accounts
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        # Replace with your actual last migration name
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='mfa_email_code',
            field=models.CharField(blank=True, max_length=6, default=''),
        ),
        migrations.AddField(
            model_name='user',
            name='mfa_email_code_expires',
            field=models.DateTimeField(null=True, blank=True),
        ),
    ]