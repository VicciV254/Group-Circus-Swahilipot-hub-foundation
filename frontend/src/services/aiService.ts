// ── Nexus AI Assistant — Service Layer ────────────────────────────────────────
// All AI calls go through YOUR Django backend.
// The OpenRouter API key lives ONLY in backend/.env — never in the browser.
//
// Flow:
//   Frontend → POST /api/v1/ai/chat/   (your Django REST API, JWT-authenticated)
//   Django   → POST https://openrouter.ai/api/v1/chat/completions (key from .env)
//   Django   → returns { reply, usage, daily_used, daily_budget }

import { api } from "./api"; // your existing axios instance with JWT interceptor
import type { AIConversation, OpenRouterMessage } from "../types/ai";

const MAX_HISTORY = 20;

// ── Chat API ──────────────────────────────────────────────────────────────────
export const aiApi = {
	// Send messages — system prompt is built server-side from the JWT user
	chat: (messages: OpenRouterMessage[]) =>
		api.post<{
			reply: string;
			model: string;
			usage?: Record<string, number>;
			daily_used: number;
			daily_budget: number;
		}>("/ai/chat/", { messages: messages.slice(-MAX_HISTORY) }),

	// Saved conversations (optional — for cross-device sync)
	conversations: (params?: any) => api.get("/ai/conversations/", { params }),
	conversation: (id: string) => api.get(`/ai/conversations/${id}/`),
	saveConversation: (data: {
		title: string;
		messages: OpenRouterMessage[];
		conversation_id?: string;
	}) => api.post("/ai/conversations/", data),
	deleteConversation: (id: string) => api.delete(`/ai/conversations/${id}/`),
};

// ── Call Django backend with retry on rate limit ─────────────────────────────
// Retries are silent — caller (the hook) just awaits the final reply.
const RETRY_DELAYS = [3000, 8000, 15000];
const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendChatMessage(
	messages: OpenRouterMessage[],
	signal?: AbortSignal,
): Promise<string> {
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		try {
			const res = await aiApi.chat(messages);
			return res.data.reply;
		} catch (err: any) {
			if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

			const status = err?.response?.status;
			const isRateLimit = status === 429;

			if (isRateLimit && attempt < MAX_RETRIES - 1) {
				await sleep(RETRY_DELAYS[attempt]);
				continue;
			}

			// Map backend errors to friendly messages
			if (status === 503) {
				throw new Error(
					"AI service is not configured. Contact your administrator.",
				);
			}
			if (status === 429) {
				throw new Error(
					"I'm handling too many requests right now. Please try again shortly.",
				);
			}
			if (status === 401) {
				throw new Error("Your session has expired. Please log in again.");
			}
			if (status === 404) {
				console.error(
					"[Nexus AI] 404 — /api/v1/ai/chat/ not found. Check urls.py include path.",
					err,
				);
				throw new Error(
					"AI endpoint not found (404). Check backend route configuration.",
				);
			}
			if (!status) {
				console.error(
					"[Nexus AI] Network error — request never reached the backend:",
					err,
				);
				throw new Error(
					"Could not reach the server. Check your network connection.",
				);
			}

			console.error(
				"[Nexus AI] Unexpected error:",
				status,
				err?.response?.data,
				err,
			);
			throw new Error(
				err?.response?.data?.error ||
					`Something went wrong (${status}). Please try again.`,
			);
		}
	}
	throw new Error("Something went wrong. Please try again.");
}

// ── Title generator ───────────────────────────────────────────────────────────
export function generateTitle(firstMessage: string): string {
	const clean = firstMessage.trim().replace(/\s+/g, " ");
	return clean.length > 44 ? clean.slice(0, 44) + "…" : clean;
}

// ── Image helpers ──────────────────────────────────────────────────────────────
// Converts a File to a compressed base64 data URL (resized to max 1280px,
// re-encoded as JPEG ~80% quality) to keep payloads small for the API
// and for localStorage persistence.

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.8;

export function fileToCompressedDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error("Failed to read file"));
		reader.onload = () => {
			const img = new Image();
			img.onerror = () => reject(new Error("Failed to load image"));
			img.onload = () => {
				let { width, height } = img;

				if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
					if (width > height) {
						height = Math.round((height * MAX_DIMENSION) / width);
						width = MAX_DIMENSION;
					} else {
						width = Math.round((width * MAX_DIMENSION) / height);
						height = MAX_DIMENSION;
					}
				}

				const canvas = document.createElement("canvas");
				canvas.width = width;
				canvas.height = height;
				const ctx = canvas.getContext("2d");
				if (!ctx) {
					reject(new Error("Canvas not supported"));
					return;
				}

				ctx.drawImage(img, 0, 0, width, height);

				// GIFs lose animation on canvas re-encode — keep original for those
				const isGif = file.type === "image/gif";
				const dataUrl = isGif
					? (reader.result as string)
					: canvas.toDataURL("image/jpeg", JPEG_QUALITY);

				resolve(dataUrl);
			};
			img.src = reader.result as string;
		};
		reader.readAsDataURL(file);
	});
}

// ── Conversation persistence (localStorage per user) ─────────────────────────
const STORAGE_KEY = (userId: string) => `nexus_ai_${userId}`;
const MAX_STORED = 50;

export function loadConversations(userId: string): AIConversation[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY(userId));
		if (!raw) return [];
		const parsed = JSON.parse(raw) as AIConversation[];
		return parsed.map((c) => ({
			...c,
			createdAt: new Date(c.createdAt),
			updatedAt: new Date(c.updatedAt),
			messages: c.messages.map((m) => ({
				...m,
				timestamp: new Date(m.timestamp),
			})),
		}));
	} catch {
		return [];
	}
}

export function saveConversations(
	userId: string,
	convs: AIConversation[],
): void {
	const trimmed = [...convs]
		.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
		.slice(0, MAX_STORED);

	try {
		localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(trimmed));
	} catch {
		// Quota exceeded (likely due to base64 images) — retry without image data,
		// keeping a placeholder so the UI still shows "Image attached".
		try {
			const stripped = trimmed.map((c) => ({
				...c,
				messages: c.messages.map((m) =>
					m.images?.length
						? { ...m, images: m.images.map((img) => ({ ...img, dataUrl: "" })) }
						: m,
				),
			}));
			localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(stripped));
		} catch {
			/* still over quota — give up silently, conversation stays in memory only */
		}
	}
}
