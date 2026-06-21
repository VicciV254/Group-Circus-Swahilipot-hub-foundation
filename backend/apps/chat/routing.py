"""
apps/chat/routing.py

Exports websocket_urlpatterns — already imported by your asgi.py:
    from apps.chat.routing import websocket_urlpatterns
"""
from django.urls import re_path
from .consumers import ChatConsumer

websocket_urlpatterns = [
    re_path(r"^ws/chat/?$", ChatConsumer.as_asgi()),

]
