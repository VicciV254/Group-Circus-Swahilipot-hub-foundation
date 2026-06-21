"""Nexus Notifications Service — Email, SMS, Push, WebSocket"""
import logging
from django.conf import settings
from django.core.mail import send_mail, EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone

logger = logging.getLogger('Nexus')


class NotificationService:

    @staticmethod
    def send_email(to_emails, subject, text_body, html_body=None):
        """Send email notification"""
        try:
            if isinstance(to_emails, str):
                to_emails = [to_emails]
            msg = EmailMultiAlternatives(
                subject=subject,
                body=text_body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=to_emails,
            )
            if html_body:
                msg.attach_alternative(html_body, 'text/html')
            msg.send()
            logger.info(f"Email sent to {to_emails}: {subject}")
            return True
        except Exception as e:
            logger.error(f"Email send failed: {e}")
            return False

    @staticmethod
    def send_sms(phone_numbers, message):
        """Send SMS via Africa's Talking"""
        try:
            if not settings.SMS_API_KEY:
                logger.warning("SMS not configured — skipping SMS send")
                return False

            import africastalking
            africastalking.initialize(settings.SMS_USERNAME, settings.SMS_API_KEY)
            sms = africastalking.SMS
            if isinstance(phone_numbers, str):
                phone_numbers = [phone_numbers]
            response = sms.send(message, phone_numbers, settings.SMS_SHORTCODE)
            logger.info(f"SMS sent to {phone_numbers}")
            return True
        except Exception as e:
            logger.error(f"SMS send failed: {e}")
            return False

    @staticmethod
    def send_push(user, title, body, data=None):
        """Send FCM push notification"""
        try:
            if not user.fcm_token or not settings.FCM_SERVER_KEY:
                return False
            import requests
            headers = {
                'Authorization': f'key={settings.FCM_SERVER_KEY}',
                'Content-Type': 'application/json',
            }
            payload = {
                'to': user.fcm_token,
                'notification': {'title': title, 'body': body},
                'data': data or {},
            }
            response = requests.post('https://fcm.googleapis.com/fcm/send', json=payload, headers=headers)
            return response.status_code == 200
        except Exception as e:
            logger.error(f"Push notification failed: {e}")
            return False

    @staticmethod
    def create_in_app_notification(user, title, body, notification_type, link=None, related_id=None):
        """Create in-app notification record"""
        try:
            from apps.notifications.models import Notification
            return Notification.objects.create(
                recipient=user,
                title=title,
                body=body,
                notification_type=notification_type,
                link=link or '',
                related_id=str(related_id) if related_id else '',
            )
        except Exception as e:
            logger.error(f"In-app notification failed: {e}")
            return None

    @classmethod
    def notify_user(cls, user, title, body, notification_type, email=True, sms=False, push=True, link=None):
        """Send notification via all configured channels"""
        cls.create_in_app_notification(user, title, body, notification_type, link)
        if email and user.notification_email:
            cls.send_email(user.email, title, body)
        if sms and user.notification_sms and user.phone:
            cls.send_sms(user.phone, f"{title}: {body}")
        if push and user.notification_push:
            cls.send_push(user, title, body)

    @classmethod
    def send_fm_down_alert(cls, station, outage, reported_by):
        """Critical FM down alert — notify all authorities immediately"""
        reporter_label = reported_by.get_full_name() if reported_by else "Auto-detected (heartbeat monitor)"

        title = f"🚨 CRITICAL: FM Station DOWN — {station.name} ({station.frequency})"
        body = (
            f"FM Station {station.name} at {station.frequency} MHz has gone OFF AIR.\n"
            f"Reported by: {reporter_label}\n"
            f"Time: {outage.down_at.strftime('%Y-%m-%d %H:%M:%S')}\n"
            f"Description: {outage.description or 'No description provided'}\n\n"
            f"Log in to Nexus to view details and coordinate restoration."
        )

        # Email all alert recipients
        emails = station.get_alert_emails()
        if emails:
            cls.send_email(emails, title, body)

        # SMS all alert phones
        phones = station.get_alert_phones()
        if phones:
            sms_body = f"Nexus ALERT: {station.name} FM DOWN at {outage.down_at.strftime('%H:%M')}. Reported by {reporter_label}."
            cls.send_sms(phones, sms_body)

        # Notify all broadcast staff in org
        try:
            from apps.accounts.models import User
            staff = User.objects.filter(
                organisation=station.organisation,
                role__in=['broadcast_admin', 'broadcast_staff', 'station_engineer'],
                is_active=True,
            )
            for user in staff:
                cls.create_in_app_notification(
                    user, title, body, 'fm_outage',
                    link=f'/fm-report/{station.id}'
                )
        except Exception as e:
            logger.error(f"FM down staff notification failed: {e}")

        return {'emails': emails, 'phones': phones}

    @classmethod
    def send_fm_restored_alert(cls, station, outage):
        title = f"✅ FM Station RESTORED — {station.name} ({station.frequency})"
        body = (
            f"FM Station {station.name} is back ON AIR.\n"
            f"Downtime: {outage.duration_minutes or 'unknown'} minutes\n"
            f"Restored: {outage.restored_at.strftime('%Y-%m-%d %H:%M:%S') if outage.restored_at else 'now'}"
        )
        emails = station.get_alert_emails()
        if emails:
            cls.send_email(emails, title, body)
        return {'emails': emails}

    @classmethod
    def send_emergency_alert(cls, alert, triggered_by):
        """System-wide emergency alert — hits all registered authority contacts"""
        from apps.accounts.models import User, Organisation

        title = f"🚨 EMERGENCY ALERT [{alert.severity.upper()}]: {alert.title}"
        body = (
            f"Organisation: {alert.organisation.name}\n"
            f"Type: {alert.get_alert_type_display()}\n"
            f"Severity: {alert.severity.upper()}\n"
            f"Triggered by: {triggered_by.get_full_name()} at {alert.created_at.strftime('%Y-%m-%d %H:%M:%S')}\n\n"
            f"Description:\n{alert.description}\n\n"
            f"Affected Systems: {', '.join(alert.affected_systems) if alert.affected_systems else 'Not specified'}\n\n"
            f"IMMEDIATE ACTION REQUIRED. Log in to Nexus to acknowledge and respond."
        )

        # Notify all admins and executives in the org
        admin_roles = ['system_admin', 'executive', 'hr_officer', 'broadcast_admin']
        admins = User.objects.filter(
            organisation=alert.organisation,
            role__in=admin_roles,
            is_active=True,
        )

        emails = list(admins.values_list('email', flat=True))
        phones = list(admins.exclude(phone='').values_list('phone', flat=True))

        # Add system emergency contacts
        emails += [e for e in settings.EMERGENCY_ALERT_EMAILS if e]
        phones += [p for p in settings.EMERGENCY_ALERT_PHONES if p]

        emails = list(set(emails))
        phones = list(set(phones))

        if emails:
            cls.send_email(emails, title, body)
        if phones:
            sms_msg = f"Nexus EMERGENCY: {alert.title} [{alert.severity.upper()}] — {triggered_by.get_full_name()}. Check email for details."
            cls.send_sms(phones, sms_msg)

        # In-app for all admins
        for user in admins:
            cls.create_in_app_notification(
                user, title, body, 'emergency_alert',
                link=f'/emergency-alerts/{alert.id}',
                related_id=alert.id
            )

        return {'emails': emails, 'phones': phones}

    @classmethod
    def send_geofence_violation_alert(cls, attachee, violation):
        """Alert when attachee leaves workplace without checking out"""
        from apps.accounts.models import User

        title = f"Geofence Violation — {attachee.get_full_name()}"
        body = (
            f"{attachee.get_full_name()} left the workplace perimeter without checking out.\n"
            f"Time: {violation.timestamp.strftime('%H:%M:%S')}\n"
            f"Location: {violation.latitude}, {violation.longitude}"
        )

        # Notify attachee
        cls.notify_user(attachee, title, body, 'geofence_violation', sms=True)

        # Notify supervisor
        try:
            from apps.attachees.models import SupervisorAssignment
            assignments = SupervisorAssignment.objects.filter(
                attachee=attachee, is_active=True
            ).select_related('supervisor')
            for assignment in assignments:
                cls.notify_user(assignment.supervisor, title, body, 'geofence_violation', sms=True)
        except Exception as e:
            logger.error(f"Supervisor geofence notification failed: {e}")

    @classmethod
    def send_subscription_expiry_alert(cls, subscription, days_until_expiry):
        """Alert when software subscription is about to expire"""
        from apps.accounts.models import User

        title = f"Software Subscription Expiring — {subscription.software_name}"
        body = (
            f"Licence for {subscription.software_name} expires in {days_until_expiry} day(s).\n"
            f"Total seats: {subscription.total_seats}\n"
            f"Allocated: {subscription.allocated_seats}\n"
            f"Annual cost: {subscription.renewal_cost}"
        )

        ict_staff = User.objects.filter(
            organisation=subscription.organisation,
            role__in=['ict', 'system_admin', 'broadcast_admin'],
            is_active=True,
        )
        for user in ict_staff:
            cls.notify_user(user, title, body, 'subscription_expiry')
            