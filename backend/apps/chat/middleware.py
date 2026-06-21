"""
apps/chat/middleware.py

JWTAuthMiddleware — authenticates WebSocket connections using a JWT
passed as a query-string parameter: ws://host/ws/chat/?token=<access_token>

Your existing asgi.py already imports this:
    from apps.chat.middleware import JWTAuthMiddleware
"""
from urllib.parse import parse_qs
from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser


@database_sync_to_async
def get_user_from_token(token_key: str):
    try:
        from rest_framework_simplejwt.tokens import AccessToken
        from django.contrib.auth import get_user_model
        User = get_user_model()
        token = AccessToken(token_key)
        user_id = token["user_id"]
        return User.objects.get(id=user_id, is_active=True)
    except Exception:
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """
    Reads ?token=<jwt> from the WebSocket URL and authenticates the user.
    Sets scope["user"] so consumers can access request.user normally.
    """

    async def __call__(self, scope, receive, send):
        query_string = scope.get("query_string", b"").decode()
        params = parse_qs(query_string)
        token_list = params.get("token", [])

        if token_list:
            scope["user"] = await get_user_from_token(token_list[0])
        else:
            scope["user"] = AnonymousUser()

        return await super().__call__(scope, receive, send)
