import os
from pathlib import Path

# Load .env before Django setup
BASE_DIR = Path(__file__).resolve().parent.parent
env_file = BASE_DIR / ".env"

if env_file.exists():
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key not in os.environ:
                os.environ[key] = value

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "Nexus.settings")

from django.core.asgi import get_asgi_application
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter
from apps.chat.middleware import JWTAuthMiddleware
from apps.chat.routing import websocket_urlpatterns

try:
    from core.ws_routing import websocket_urlpatterns as core_ws
    all_ws = websocket_urlpatterns + core_ws
except ImportError:
    all_ws = websocket_urlpatterns

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    # Removed AllowedHostsOriginValidator — it rejects localhost:5173 in dev.
    "websocket": JWTAuthMiddleware(URLRouter(all_ws)),
})