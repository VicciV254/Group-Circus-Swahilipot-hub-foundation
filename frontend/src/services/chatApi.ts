// Nexus Chat API — All chat-related backend endpoints
// Mirrors the existing api.ts pattern (axios + JWT)
// baseURL is "http://127.0.0.1:8000/api/v1" so paths start with /chat/
import { api } from "./api";

export const chatApi = {
	// ── Conversations ─────────────────────────────────────────────────────────
	conversations: (params?: any) => api.get("/chat/conversations/", { params }),
	conversation: (id: string) => api.get(`/chat/conversations/${id}/`),
	createDirectConversation: (recipientId: string) =>
		api.post("/chat/conversations/direct/", { recipient_id: recipientId }),
	createGroup: (data: {
		name: string;
		description?: string;
		participant_ids: string[];
	}) => api.post("/chat/conversations/groups/", data),
	updateGroup: (id: string, data: any) =>
		api.patch(`/chat/conversations/${id}/`, data),
	leaveGroup: (id: string) => api.post(`/chat/conversations/${id}/leave/`),

	// ── Messages ──────────────────────────────────────────────────────────────
	messages: (conversationId: string, params?: any) =>
		api.get(`/chat/conversations/${conversationId}/messages/`, { params }),
	sendMessage: (
		conversationId: string,
		data: { content: string; media_ids?: string[] },
	) => api.post(`/chat/conversations/${conversationId}/messages/`, data),
	markRead: (conversationId: string) =>
		api.post(`/chat/conversations/${conversationId}/read/`),
	messageStatus: (messageId: string, status: string) =>
		api.patch(`/chat/messages/${messageId}/`, { status }),

	// ── Media ─────────────────────────────────────────────────────────────────
	uploadMedia: (file: File, conversationId: string) => {
		const form = new FormData();
		form.append("file", file);
		form.append("conversation_id", conversationId);
		return api.post("/chat/media/", form, {
			headers: { "Content-Type": "multipart/form-data" },
		});
	},
	sharedMedia: (conversationId: string) =>
		api.get(`/chat/conversations/${conversationId}/media/`),

	// ── Presence ──────────────────────────────────────────────────────────────
	onlineUsers: () => api.get("/chat/presence/online/"),
	updatePresence: (status: "online" | "away" | "offline") =>
		api.post("/chat/presence/", { status }),

	// ── Calls ─────────────────────────────────────────────────────────────────
	initiateCall: (data: {
		recipient_id: string;
		type: "voice" | "video";
		conversation_id: string;
	}) => api.post("/chat/calls/", data),
	endCall: (callId: string, data: { status: string; duration?: number }) =>
		api.patch(`/chat/calls/${callId}/`, data),
	callHistory: (conversationId: string) =>
		api.get(`/chat/conversations/${conversationId}/calls/`),

	// ── Admin ─────────────────────────────────────────────────────────────────
	auditLogs: (params?: any) => api.get("/chat/audit-logs/", { params }),
	unreadCount: () => api.get("/chat/unread-count/"),
};

// ── WebSocket helper ──────────────────────────────────────────────────────────
export class ChatWebSocket {
	private ws: WebSocket | null = null;
	private url: string;
	private token: string;
	private handlers: Map<string, ((data: any) => void)[]> = new Map();
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private shouldReconnect = true;

	constructor(baseWsUrl: string, token: string) {
		this.url = baseWsUrl;
		this.token = token;
	}

	connect() {
		try {
			this.ws = new WebSocket(`${this.url}?token=${this.token}`);

			this.ws.onopen = () => {
				console.log("[ChatWS] connected");
			};

			this.ws.onmessage = (e) => {
				try {
					const data = JSON.parse(e.data);
					this.emit(data.type, data.payload);
				} catch {}
			};

			this.ws.onerror = (e) => {
				console.error("[ChatWS] error", e);
			};

			this.ws.onclose = (e) => {
				console.log("[ChatWS] closed", e.code);
				// code 4001 = JWT auth failed — never retry, token is bad
				if (this.shouldReconnect && e.code !== 4001) {
					this.reconnectTimer = setTimeout(() => this.connect(), 3000);
				}
			};
		} catch (e) {
			console.error("[ChatWS] failed to open", e);
		}
	}

	on(event: string, handler: (data: any) => void) {
		if (!this.handlers.has(event)) this.handlers.set(event, []);
		this.handlers.get(event)!.push(handler);
	}

	emit(event: string, data: any) {
		this.handlers.get(event)?.forEach((h) => h(data));
	}

	send(type: string, payload: any) {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify({ type, payload }));
		}
	}

	sendTyping(conversationId: string, isTyping: boolean) {
		this.send("typing", {
			conversation_id: conversationId,
			is_typing: isTyping,
		});
	}

	disconnect() {
		this.shouldReconnect = false;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.ws?.close();
	}
}
