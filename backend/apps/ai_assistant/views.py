# backend/apps/ai_assistant/views.py
# ── Nexus AI Assistant — Django Views (OpenRouter Proxy) ──────────────────────

import os
import logging
from datetime import date

import requests
from django.core.cache import cache
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AIConversation, AIMessage
from .serializers import AIConversationSerializer, AIMessageSerializer

logger = logging.getLogger(__name__)
from decouple import config

# ── Config ────────────────────────────────────────────────────────────────────
OPENROUTER_URL     = "https://openrouter.ai/api/v1/chat/completions"
AI_MODEL           = config("OPENROUTER_MODEL",          default="nex-agi/nex-n2-pro:free")
AI_VISION_MODEL    = config("OPENROUTER_VISION_MODEL",   default="google/gemma-3-4b-it:free")
AI_VISION_FALLBACK = config("OPENROUTER_VISION_FALLBACK",default="google/gemma-3-12b-it:free")
MAX_TOKENS         = 1024
TEMPERATURE        = 0.7
MAX_HISTORY        = 20
DAILY_REQ_BUDGET   = 200
REQ_TIMEOUT        = 30
MAX_IMAGES_PER_MESSAGE = 4
MAX_REQUEST_BYTES  = 15 * 1024 * 1024  # 15 MB


# ── System prompt ─────────────────────────────────────────────────────────────
def get_system_prompt(user) -> str:
    from datetime import datetime
    today = datetime.now().strftime("%A, %d %B %Y")
    return (
        f"You are Nexus AI, the intelligent assistant embedded inside the Nexus Enterprise "
        f"Management System at {getattr(user, 'organisation_name', 'SwahiliPot Foundation') or 'SwahiliPot Foundation'}.\n\n"
        f"You assist {user.get_full_name()} "
        f"({getattr(user, 'role_display', getattr(user, 'role', 'Staff'))}"
        f"{f', {user.department_name}' if getattr(user, 'department_name', None) else ''}) with:\n"
        f"- Answering questions about the organisation, departments, and workflows\n"
        f"- Drafting communications, reports, and summaries\n"
        f"- Explaining platform features and navigation\n"
        f"- Analysing attendance, tasks, projects, and performance data when provided\n"
        f"- General work-related questions and research\n\n"
        f"Guidelines:\n"
        f"- Be concise, professional, and helpful\n"
        f"- Use the user's first name occasionally to personalise responses\n"
        f"- If asked about live data, explain you can see data the user shares but don't have direct system access\n"
        f"- Never fabricate specific data\n"
        f"- Format responses clearly using bullet points or numbered lists where appropriate\n"
        f"- If the user shares an image (screenshot, document, chart) describe and analyse it helpfully\n"
        f"- Today's date: {today}"
    )


# ── Daily budget ──────────────────────────────────────────────────────────────
def check_daily_budget(user_id: str) -> tuple[bool, int]:
    key  = f"ai_daily_{user_id}_{date.today()}"
    used = cache.get(key, 0)
    return used < DAILY_REQ_BUDGET, used


def increment_daily_budget(user_id: str):
    key  = f"ai_daily_{user_id}_{date.today()}"
    used = cache.get(key, 0)
    cache.set(key, used + 1, timeout=86400)


# ── OpenRouter helper ─────────────────────────────────────────────────────────
class OpenRouterCallError(Exception):
    def __init__(self, code: int, body, message: str | None = None):
        self.code    = code
        self.body    = body
        self.message = message
        super().__init__(message or f"OpenRouter error {code}")


def call_openrouter(api_key: str, model: str, messages: list, referer: str) -> dict:
    try:
        resp = requests.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type":  "application/json",
                "HTTP-Referer":  referer,
                "X-Title":       "Nexus AI Assistant",
            },
            json={
                "model":       model,
                "messages":    messages,
                "temperature": TEMPERATURE,
                "max_tokens":  MAX_TOKENS,
            },
            timeout=REQ_TIMEOUT,
        )
        resp.raise_for_status()
    except requests.Timeout:
        raise OpenRouterCallError(504, None, "AI service timed out. Please try again.")
    except requests.HTTPError as e:
        code = e.response.status_code if e.response else 500
        body = None
        try:
            body = e.response.json() if e.response is not None else None
        except Exception:
            body = e.response.text if e.response is not None else None

        message = None
        if isinstance(body, dict):
            inner = body.get("error", {})
            if isinstance(inner.get("code"), int):
                code = inner["code"]
            message = inner.get("message")

        logger.error("OpenRouter HTTP %s error (model=%s). Body: %s", code, model, body)
        raise OpenRouterCallError(code, body, message)
    except requests.RequestException as e:
        logger.error("OpenRouter request failed (model=%s): %s", model, e)
        raise OpenRouterCallError(502, None, "Could not reach AI service.")

    try:
        return resp.json()
    except Exception:
        logger.exception("Failed to parse OpenRouter response. Raw: %s", resp.text[:1000])
        raise OpenRouterCallError(502, {"raw": resp.text[:500]}, "Received an unexpected response from AI service.")


def is_model_unavailable_error(err: OpenRouterCallError) -> bool:
    if err.code == 404:
        return True
    if err.code == 400 and err.message and "not a valid model" in err.message.lower():
        return True
    return False


def _openrouter_error_response(err: OpenRouterCallError, has_images: bool, model: str) -> Response:
    code = err.code
    if code == 429:
        return Response({"error": "AI service is busy. Please try again in a moment."}, status=429)
    if code in (401, 403):
        logger.error("OpenRouter auth error — check OPENROUTER_API_KEY: %s", err.body)
        return Response({"error": "AI service configuration error."}, status=503)
    if is_model_unavailable_error(err):
        hint = (
            "The image analysis model is currently unavailable. Try again without an image, "
            "or contact your administrator to update OPENROUTER_VISION_MODEL in .env."
            if has_images else
            "The AI model is currently unavailable. Contact your administrator."
        )
        logger.error("Model '%s' unavailable (code=%s): %s", model, code, err.message or err.body)
        return Response({"error": hint}, status=503)
    if code == 400:
        logger.error("OpenRouter 400 (model=%s): %s", model, err.message or err.body)
        return Response({"error": err.message or "AI request was malformed. Please try again."}, status=502)
    if code == 504:
        return Response({"error": err.message or "AI service timed out. Please try again."}, status=504)
    logger.error("OpenRouter error %s (model=%s): %s", code, model, err.message or err.body)
    return Response({"error": err.message or f"AI service error ({code}). Please try again."}, status=502)


# ── Reply extraction ──────────────────────────────────────────────────────────
# Some vision/reasoning models return content=None and put text elsewhere
# (reasoning_details, tool_calls, or content as a list of blocks).
# This handles all known response shapes from OpenRouter free models.

def extract_reply(data: dict) -> str | None:
    choices = data.get("choices") or []
    for choice in choices:
        msg     = choice.get("message") or {}
        content = msg.get("content")

        # ── Shape 1: plain string ─────────────────────────────────────────
        if isinstance(content, str):
            text = content.strip()
            if text:
                return text

        # ── Shape 2: list of content blocks (multimodal response) ─────────
        elif isinstance(content, list):
            parts = [
                b.get("text", "")
                for b in content
                if isinstance(b, dict) and b.get("type") == "text"
            ]
            text = " ".join(filter(None, parts)).strip()
            if text:
                return text

        # ── Shape 3: content is None — check reasoning_details ────────────
        # Gemma and some other models use "thinking" mode and return the
        # visible reply inside reasoning_details when content is null.
        if content is None or not (isinstance(content, str) and content.strip()):
            reasoning = msg.get("reasoning_details") or msg.get("reasoning") or []
            if isinstance(reasoning, list):
                parts = []
                for r in reasoning:
                    if isinstance(r, dict):
                        parts.append(r.get("content") or r.get("text") or "")
                text = " ".join(filter(None, parts)).strip()
                if text:
                    return text

            # ── Shape 4: check tool_calls text content ────────────────────
            tool_calls = msg.get("tool_calls") or []
            for tc in tool_calls:
                if isinstance(tc, dict):
                    fn_args = (tc.get("function") or {}).get("arguments", "")
                    if fn_args:
                        return str(fn_args).strip()

    return None


# ── POST /api/v1/ai/chat/ ─────────────────────────────────────────────────────
class AIChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        api_key = config("OPENROUTER_API_KEY", default="")
        if not api_key:
            logger.error("OPENROUTER_API_KEY not set in environment")
            return Response(
                {"error": "AI service not configured. Contact your administrator."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        messages = request.data.get("messages", [])
        if not messages or not isinstance(messages, list):
            return Response({"error": "messages[] is required"}, status=400)

        if len(messages) > MAX_HISTORY + 5:
            return Response({"error": "Too many messages in request"}, status=400)

        # Request size guard
        try:
            request_size = len(request.body)
        except Exception:
            request_size = 0
        if request_size > MAX_REQUEST_BYTES:
            return Response(
                {"error": "Request too large. Try attaching fewer or smaller images."},
                status=413,
            )

        # Validate messages — content is string OR list of multimodal blocks
        has_images = False
        for m in messages:
            if not isinstance(m, dict):
                return Response({"error": "Invalid message format"}, status=400)
            if m.get("role") not in ("user", "assistant", "system"):
                return Response({"error": "Invalid message role"}, status=400)

            content = m.get("content", "")
            if isinstance(content, str):
                continue
            if not isinstance(content, list):
                return Response({"error": "Invalid message content"}, status=400)

            image_count = 0
            for block in content:
                if not isinstance(block, dict) or "type" not in block:
                    return Response({"error": "Invalid content block"}, status=400)
                if block["type"] == "text":
                    if not isinstance(block.get("text"), str):
                        return Response({"error": "Invalid text block"}, status=400)
                elif block["type"] == "image_url":
                    iu = block.get("image_url", {})
                    if not isinstance(iu, dict) or not isinstance(iu.get("url"), str):
                        return Response({"error": "Invalid image block"}, status=400)
                    if not iu["url"].startswith("data:image/"):
                        return Response({"error": "Images must be data URLs (data:image/...)"}, status=400)
                    image_count += 1
                    has_images = True
                else:
                    return Response({"error": f"Unsupported content block type: {block['type']}"}, status=400)
            if image_count > MAX_IMAGES_PER_MESSAGE:
                return Response({"error": f"Maximum {MAX_IMAGES_PER_MESSAGE} images per message."}, status=400)

        # Daily budget check
        within_budget, used = check_daily_budget(str(request.user.id))
        if not within_budget:
            return Response(
                {"error": f"Daily AI request limit reached ({DAILY_REQ_BUDGET}/day). Resets at midnight."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        # Build full message list — system prompt added server-side
        full_messages = [
            {"role": "system", "content": get_system_prompt(request.user)},
            *[
                {"role": m["role"], "content": m["content"]}
                for m in messages[-MAX_HISTORY:]
                if m.get("role") != "system"
            ],
        ]

        model_to_use = AI_VISION_MODEL if has_images else AI_MODEL
        referer      = request.headers.get("Origin", "https://nexus.swahilipot.org")

        # ── Call OpenRouter (with fallback retry for vision model) ────────
        data = None
        try:
            data = call_openrouter(api_key, model_to_use, full_messages, referer)
        except OpenRouterCallError as e:
            if has_images and is_model_unavailable_error(e) and model_to_use != AI_VISION_FALLBACK:
                logger.warning(
                    "Vision model '%s' unavailable (code=%s). Retrying with fallback '%s'.",
                    model_to_use, e.code, AI_VISION_FALLBACK,
                )
                model_to_use = AI_VISION_FALLBACK
                try:
                    data = call_openrouter(api_key, model_to_use, full_messages, referer)
                except OpenRouterCallError as e2:
                    return _openrouter_error_response(e2, has_images, model_to_use)
            else:
                return _openrouter_error_response(e, has_images, model_to_use)

        # ── Extract reply — handles None/list/reasoning content shapes ────
        try:
            reply = extract_reply(data)
        except Exception:
            logger.exception("extract_reply failed. Full response: %s", str(data)[:2000])
            return Response({"error": "Received an unexpected response from AI service."}, status=502)

        # ── If primary vision model gave empty content, try fallback ──────
        if not reply and has_images and model_to_use != AI_VISION_FALLBACK:
            logger.warning(
                "Empty reply from vision model '%s'. Retrying with fallback '%s'.",
                model_to_use, AI_VISION_FALLBACK,
            )
            model_to_use = AI_VISION_FALLBACK
            try:
                data2 = call_openrouter(api_key, model_to_use, full_messages, referer)
                reply = extract_reply(data2)
            except OpenRouterCallError:
                pass

        if not reply:
            logger.warning("Empty reply after all attempts. Full response: %s", str(data)[:2000])
            return Response({"error": "I couldn't generate a response. Please try again."}, status=502)

        increment_daily_budget(str(request.user.id))

        return Response({
            "reply":        reply,
            "model":        model_to_use,
            "usage":        data.get("usage", {}),
            "daily_used":   used + 1,
            "daily_budget": DAILY_REQ_BUDGET,
        })


# ── /api/v1/ai/conversations/ ─────────────────────────────────────────────────
class AIConversationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class   = AIConversationSerializer

    def get_queryset(self):
        return AIConversation.objects.filter(user=self.request.user).prefetch_related("messages")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=["delete"])
    def clear_all(self, request):
        self.get_queryset().delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    