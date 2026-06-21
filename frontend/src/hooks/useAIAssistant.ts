// ── Nexus AI Assistant — React Hook ──────────────────────────────────────────
// Manages all conversation state, persistence, and API calls.
// All AI requests go through your Django backend — no key in the frontend.

import { useState, useCallback, useRef, useEffect } from "react";
import {
	sendChatMessage,
	generateTitle,
	loadConversations,
	saveConversations,
} from "../services/aiService";
import { useAuthStore } from "../services/api";
import type {
	AIConversation,
	AIMessage,
	AIMessageImage,
	AIAssistantStatus,
	OpenRouterMessage,
	OpenRouterContentBlock,
} from "../types/ai";

// Use built-in browser crypto API — no uuid package needed
const uuidv4 = (): string => crypto.randomUUID();

export interface UseAIAssistantReturn {
	// State
	conversations: AIConversation[];
	activeConversation: AIConversation | null;
	status: AIAssistantStatus;
	error: string | null;
	isOpen: boolean;

	// Actions
	open: () => void;
	close: () => void;
	toggle: () => void;
	startNew: () => void;
	selectConversation: (id: string) => void;
	deleteConversation: (id: string) => void;
	sendMessage: (content: string, images?: AIMessageImage[]) => Promise<void>;
	retryMessage: (messageId: string) => Promise<void>;
	clearError: () => void;
	cancelRequest: () => void;
}

export function useAIAssistant(): UseAIAssistantReturn {
	const user = useAuthStore((s) => s.user);

	const [conversations, setConversations] = useState<AIConversation[]>(() =>
		user ? loadConversations(user.id) : [],
	);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [status, setStatus] = useState<AIAssistantStatus>("idle");
	const [error, setError] = useState<string | null>(null);
	const [isOpen, setIsOpen] = useState(false);

	const abortRef = useRef<AbortController | null>(null);

	// Persist on every change
	useEffect(() => {
		if (user) saveConversations(user.id, conversations);
	}, [conversations, user]);

	const activeConversation =
		conversations.find((c) => c.id === activeId) ?? null;

	// ── UI controls ─────────────────────────────────────────────────────────────
	const open = useCallback(() => setIsOpen(true), []);
	const close = useCallback(() => setIsOpen(false), []);
	const toggle = useCallback(() => setIsOpen((v) => !v), []);

	const startNew = useCallback(() => {
		setActiveId(null);
		setError(null);
		setStatus("idle");
	}, []);

	const selectConversation = useCallback((id: string) => {
		setActiveId(id);
		setError(null);
	}, []);

	const deleteConversation = useCallback(
		(id: string) => {
			setConversations((prev) => prev.filter((c) => c.id !== id));
			if (activeId === id) setActiveId(null);
		},
		[activeId],
	);

	const clearError = useCallback(() => {
		setError(null);
		setStatus("idle");
	}, []);

	const cancelRequest = useCallback(() => {
		abortRef.current?.abort();
		setStatus("idle");
	}, []);

	// ── Send message ─────────────────────────────────────────────────────────────
	const sendMessage = useCallback(
		async (content: string, images?: AIMessageImage[]) => {
			const trimmedContent = content.trim();
			const hasImages = images && images.length > 0;
			if ((!trimmedContent && !hasImages) || status === "thinking") return;
			if (!user) {
				setError("Not authenticated.");
				return;
			}

			abortRef.current?.abort();
			abortRef.current = new AbortController();

			setStatus("thinking");
			setError(null);

			const userMsg: AIMessage = {
				id: uuidv4(),
				role: "user",
				content: trimmedContent,
				images: hasImages ? images : undefined,
				timestamp: new Date(),
			};

			let targetId = activeId;

			// Create new conversation if needed
			if (!targetId) {
				const newConv: AIConversation = {
					id: uuidv4(),
					title: generateTitle(trimmedContent || "Image attached"),
					messages: [userMsg],
					createdAt: new Date(),
					updatedAt: new Date(),
				};
				targetId = newConv.id;
				setConversations((prev) => [newConv, ...prev]);
				setActiveId(targetId);
			} else {
				setConversations((prev) =>
					prev.map((c) =>
						c.id === targetId
							? {
									...c,
									messages: [...c.messages, userMsg],
									updatedAt: new Date(),
								}
							: c,
					),
				);
			}

			const convId = targetId;

			// Build message array — NO system prompt sent from frontend.
			// Django builds the system prompt server-side from the JWT user.
			//
			// For multimodal messages (with images), content becomes an array of
			// blocks: [{type:"text", text:"..."}, {type:"image_url", image_url:{url:"data:..."}}]
			// OpenRouter/OpenAI-compatible APIs accept this format for vision models.
			const toApiMessage = (m: {
				role: string;
				content: string;
				images?: AIMessageImage[];
			}): OpenRouterMessage => {
				if (m.images && m.images.length > 0) {
					const blocks: OpenRouterContentBlock[] = [];
					if (m.content) blocks.push({ type: "text", text: m.content });
					for (const img of m.images) {
						blocks.push({ type: "image_url", image_url: { url: img.dataUrl } });
					}
					return { role: m.role as "user" | "assistant", content: blocks };
				}
				return { role: m.role as "user" | "assistant", content: m.content };
			};

			const conv = conversations.find((c) => c.id === convId);
			const history: OpenRouterMessage[] = [
				...(conv?.messages ?? []).map(toApiMessage),
				toApiMessage({
					role: "user",
					content: trimmedContent,
					images: hasImages ? images : undefined,
				}),
			];

			try {
				const reply = await sendChatMessage(history, abortRef.current.signal);

				const assistantMsg: AIMessage = {
					id: uuidv4(),
					role: "assistant",
					content: reply,
					timestamp: new Date(),
				};

				setConversations((prev) =>
					prev.map((c) =>
						c.id === convId
							? {
									...c,
									messages: [...c.messages, assistantMsg],
									updatedAt: new Date(),
								}
							: c,
					),
				);
				setStatus("idle");
			} catch (err: any) {
				if (err.name === "AbortError") {
					// User cancelled — keep the message but mark it failed so they can retry,
					// rather than silently discarding what they typed.
					setConversations((prev) =>
						prev.map((c) =>
							c.id === convId
								? {
										...c,
										messages: c.messages.map((m) =>
											m.id === userMsg.id ? { ...m, failed: true } : m,
										),
									}
								: c,
						),
					);
					setStatus("idle");
					return;
				}

				// Mark the message as failed instead of deleting it — the user's typed
				// text and attached images are preserved, with a Retry option shown.
				setConversations((prev) =>
					prev.map((c) =>
						c.id === convId
							? {
									...c,
									messages: c.messages.map((m) =>
										m.id === userMsg.id ? { ...m, failed: true } : m,
									),
								}
							: c,
					),
				);

				setError(err.message || "Something went wrong. Please try again.");
				setStatus("error");
			}
		},
		[activeId, conversations, status, user],
	);

	// ── Retry a failed message ───────────────────────────────────────────────────
	// Re-sends the same content/images without creating a duplicate —
	// removes the failed copy first, then calls sendMessage again.
	const retryMessage = useCallback(
		async (messageId: string) => {
			if (!activeId) return;
			const conv = conversations.find((c) => c.id === activeId);
			const msg = conv?.messages.find((m) => m.id === messageId);
			if (!msg) return;

			// Remove the failed message (and anything after it, in case of partial state)
			setConversations((prev) =>
				prev.map((c) =>
					c.id === activeId
						? { ...c, messages: c.messages.filter((m) => m.id !== messageId) }
						: c,
				),
			);

			await sendMessage(msg.content, msg.images);
		},
		[activeId, conversations, sendMessage],
	);

	return {
		conversations,
		activeConversation,
		status,
		error,
		isOpen,
		open,
		close,
		toggle,
		startNew,
		selectConversation,
		deleteConversation,
		sendMessage,
		retryMessage,
		clearError,
		cancelRequest,
	};
}
