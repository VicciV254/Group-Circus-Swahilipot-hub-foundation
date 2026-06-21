"""Nexus Core — Custom exception handler"""
from django.utils import timezone
from rest_framework.views import exception_handler
from rest_framework.response import Response


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None:
        response.data = {
            'error':      True,
            'status_code': response.status_code,
            'detail':     response.data.get('detail', response.data)
                          if isinstance(response.data, dict) else response.data,
            'timestamp':  timezone.now().isoformat(),
        }
    return response