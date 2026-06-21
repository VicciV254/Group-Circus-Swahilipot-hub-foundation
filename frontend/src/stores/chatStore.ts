// Nexus Chat Store — Zustand state wired to the real Django backend
// Replaces the demo-data version. Drop this file in at the same path.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { chatApi, ChatWebSocket } from "../services/chatApi";

export type MessageStatus = "sending" | "sent" | "delivered" | "seen";
export type MediaType = "image" | "video" | "audio" | "document";
export type CallStatus =
	| "ringing"
	| "connected"
	| "ended"
	| "missed"
	| "declined";

export interface MediaAttachment {
	id: string;
	type: MediaType;
	url: string;
	name: string;
	size: number;
	thumbnailUrl?: string;
	mimeType: string;
}

export interface CallRecord {
	id: string;
	type: "voice" | "video";
	status: CallStatus;
	initiatorId: string;
	recipientId: string;
	startedAt: string;
	endedAt?: string;
	duration?: number;
}

export interface Message {
	id: string;
	conversationId: string;
	senderId: string;
	senderName: string;
	senderAvatar?: string;
	content: string;
	timestamp: string;
	status: MessageStatus;
	media?: MediaAttachment[];
	callRecord?: CallRecord;
	replyTo?: string;
	isSystem?: boolean;
}

export interface Participant {
	id: string;
	name: string;
	role: string;
	department?: string;
	email: string;
	avatar?: string;
	isOnline: boolean;
	lastSeen?: string;
}

export interface Conversation {
	id: string;
	type: "direct" | "group";
	name?: string;
	participants: Participant[];
	lastMessage?: {
		content: string;
		timestamp: string;
		senderName: string;
	};
	unreadCount: number;
	createdAt: string;
	createdBy?: string;
	avatar?: string;
	description?: string;
}

export interface AuditLog {
	id: string;
	action: "group_created" | "group_creation_denied";
	performedBy: string;
	performedByName: string;
	timestamp: string;
	groupName?: string;
	reason?: string;
}

interface ChatState {
	// Panel state
	isChatOpen: boolean;
	isExpanded: boolean;
	activeConversationId: string | null;
	activeTab: "groups" | "direct";

	// Loading states
	isLoadingConversations: boolean;
	isLoadingMessages: Record<string, boolean>;

	// Data
	conversations: Conversation[];
	messages: Record<string, Message[]>;
	onlineUsers: Record<string, boolean>;
	typingUsers: Record<string, Record<string, boolean>>;
	auditLogs: AuditLog[];

	// Active call
	activeCall: CallRecord | null;
	callStatus: CallStatus | null;

	// WebSocket
	_ws: ChatWebSocket | null;

	// Actions — UI
	toggleChat: () => void;
	toggleExpanded: () => void;
	setActiveConversation: (id: string | null) => void;
	setActiveTab: (tab: "groups" | "direct") => void;

	// Actions — API
	loadConversations: () => Promise<void>;
	loadMessages: (conversationId: string) => Promise<void>;
	sendMessage: (
		conversationId: string,
		senderId: string,
		senderName: string,
		content: string,
		media?: MediaAttachment[],
	) => Promise<Message>;
	getOrCreateConversation: (
		currentUser: Participant,
		otherUser: Participant,
	) => Promise<string>;
	createGroup: (
		name: string,
		description: string,
		creatorId: string,
		creatorName: string,
		creatorRole: string,
		participants: Participant[],
	) => Promise<{ success: boolean; error?: string; groupId?: string }>;
	markConversationRead: (conversationId: string) => Promise<void>;

	// Actions — local / WS
	addMessage: (message: Message) => void;
	updateMessageStatus: (
		conversationId: string,
		messageId: string,
		status: MessageStatus,
	) => void;
	setTyping: (
		conversationId: string,
		userId: string,
		isTyping: boolean,
	) => void;
	setUserOnline: (userId: string, isOnline: boolean) => void;
	startCall: (
		type: "voice" | "video",
		initiatorId: string,
		recipientId: string,
		conversationId: string,
	) => Promise<void>;
	endCall: (status: CallStatus) => Promise<void>;
	getTotalUnread: () => number;

	// WebSocket lifecycle
	connectWS: (token: string) => void;
	disconnectWS: () => void;
}

const now = () => new Date().toISOString();

// ── Map API response → Conversation type ──────────────────────────────────────
function mapConversation(raw: any): Conversation {
	return {
		id: String(raw.id),
		type: raw.type,
		name: raw.name ?? undefined,
		description: raw.description ?? undefined,
		participants: (raw.participants ?? []).map((p: any) => ({
			id: String(p.id),
			name: p.name,
			role: p.role ?? "",
			department: p.department ?? undefined,
			email: p.email,
			isOnline: Boolean(p.isOnline),
			lastSeen: p.lastSeen ?? undefined,
		})),
		lastMessage: raw.lastMessage
			? {
					content: raw.lastMessage.content,
					timestamp: raw.lastMessage.timestamp,
					senderName: raw.lastMessage.senderName,
				}
			: undefined,
		unreadCount: raw.unreadCount ?? 0,
		createdAt: raw.updated_at ?? raw.createdAt ?? now(),
		createdBy: raw.created_by ? String(raw.created_by) : undefined,
	};
}

// ── Map API response → Message type ──────────────────────────────────────────
function mapMessage(raw: any, conversationId: string): Message {
	return {
		id: String(raw.id),
		conversationId,
		senderId: String(raw.senderId ?? raw.sender_id),
		senderName: raw.senderName ?? raw.sender_name ?? "Unknown",
		content: raw.content ?? "",
		timestamp: raw.timestamp ?? raw.created_at,
		status: (raw.status as MessageStatus) ?? "sent",
		isSystem: Boolean(raw.isSystem ?? raw.is_system),
		media: Array.isArray(raw.media)
			? raw.media.map((m: any) => ({
					id: String(m.id),
					type: m.type as MediaType,
					url: m.url,
					name: m.name,
					size: m.size ?? 0,
					mimeType: m.mime_type ?? m.mimeType ?? "",
				}))
			: undefined,
		callRecord: raw.callRecord
			? {
					id: String(raw.callRecord.id),
					type: raw.callRecord.type,
					status: raw.callRecord.status,
					initiatorId: String(raw.callRecord.initiatorId),
					recipientId: String(raw.callRecord.recipientId),
					startedAt: raw.callRecord.started_at ?? now(),
					duration: raw.callRecord.duration ?? undefined,
				}
			: undefined,
	};
}

export const useChatStore = create<ChatState>()(
	persist(
		(set, get) => ({
			// ── Initial state ────────────────────────────────────────────────────
			isChatOpen: false,
			isExpanded: false,
			activeConversationId: null,
			activeTab: "groups",
			isLoadingConversations: false,
			isLoadingMessages: {},
			conversations: [],
			messages: {},
			onlineUsers: {},
			typingUsers: {},
			auditLogs: [],
			activeCall: null,
			callStatus: null,
			_ws: null,

			// ── UI actions ───────────────────────────────────────────────────────
			toggleChat: () =>
				set((s) => ({
					isChatOpen: !s.isChatOpen,
					activeConversationId: s.isChatOpen ? null : s.activeConversationId,
				})),
			toggleExpanded: () => set((s) => ({ isExpanded: !s.isExpanded })),
			setActiveConversation: (id) => set({ activeConversationId: id }),
			setActiveTab: (tab) => set({ activeTab: tab }),

			// ── Load conversations from API ──────────────────────────────────────
			loadConversations: async () => {
				set({ isLoadingConversations: true });
				try {
					const res = await chatApi.conversations();
					const convs: Conversation[] = (res.data ?? []).map(mapConversation);
					set({ conversations: convs });

					// Also fetch online users
					try {
						const presRes = await chatApi.onlineUsers();
						const online: Record<string, boolean> = {};
						(presRes.data ?? []).forEach((u: any) => {
							online[String(u.id)] = true;
						});
						set({ onlineUsers: online });
					} catch {
						// presence is non-critical
					}
				} catch (err) {
					console.error("[chatStore] loadConversations failed:", err);
				} finally {
					set({ isLoadingConversations: false });
				}
			},

			// ── Load messages for a conversation ────────────────────────────────
			loadMessages: async (conversationId) => {
				set((s) => ({
					isLoadingMessages: { ...s.isLoadingMessages, [conversationId]: true },
				}));
				try {
					const res = await chatApi.messages(conversationId);
					const msgs: Message[] = (res.data?.results ?? res.data ?? []).map(
						(m: any) => mapMessage(m, conversationId),
					);
					set((s) => ({
						messages: { ...s.messages, [conversationId]: msgs },
					}));
				} catch (err) {
					console.error("[chatStore] loadMessages failed:", err);
				} finally {
					set((s) => ({
						isLoadingMessages: {
							...s.isLoadingMessages,
							[conversationId]: false,
						},
					}));
				}
			},

			// ── Add a message locally (optimistic / WS push) ─────────────────────
			addMessage: (message) => {
				set((s) => {
					const existing = s.messages[message.conversationId] || [];
					// Avoid duplicates (WS echo after REST POST)
					if (existing.some((m) => m.id === message.id)) return {};
					const conversations = s.conversations.map((c) =>
						c.id === message.conversationId
							? {
									...c,
									lastMessage: {
										content: message.content,
										timestamp: message.timestamp,
										senderName: message.senderName,
									},
									unreadCount:
										message.senderId !== "current-user" &&
										s.activeConversationId !== message.conversationId
											? c.unreadCount + 1
											: c.unreadCount,
								}
							: c,
					);
					return {
						messages: {
							...s.messages,
							[message.conversationId]: [...existing, message],
						},
						conversations,
					};
				});
			},

			updateMessageStatus: (conversationId, messageId, status) => {
				set((s) => ({
					messages: {
						...s.messages,
						[conversationId]: (s.messages[conversationId] || []).map((m) =>
							m.id === messageId ? { ...m, status } : m,
						),
					},
				}));
			},

			// ── Send message — optimistic then confirm with API ──────────────────
			sendMessage: async (
				conversationId,
				senderId,
				senderName,
				content,
				media,
			) => {
				const tempId = `temp-${Date.now()}-${Math.random()
					.toString(36)
					.slice(2)}`;
				const optimistic: Message = {
					id: tempId,
					conversationId,
					senderId,
					senderName,
					content,
					timestamp: now(),
					status: "sending",
					media,
				};
				get().addMessage(optimistic);

				try {
					// Upload media first if any local files provided
					let mediaIds: string[] = [];
					if (media && media.length > 0) {
						const uploads = await Promise.all(
							media
								.filter((m) => m.url.startsWith("blob:"))
								.map(async (m) => {
									const blob = await fetch(m.url).then((r) => r.blob());
									const file = new File([blob], m.name, { type: m.mimeType });
									const up = await chatApi.uploadMedia(file, conversationId);
									return String(up.data.id);
								}),
						);
						mediaIds = uploads;
					}

					const res = await chatApi.sendMessage(conversationId, {
						content,
						media_ids: mediaIds,
					});
					const confirmed = mapMessage(res.data, conversationId);

					// Replace temp message with confirmed one
					set((s) => ({
						messages: {
							...s.messages,
							[conversationId]: (s.messages[conversationId] || []).map((m) =>
								m.id === tempId ? confirmed : m,
							),
						},
					}));
					return confirmed;
				} catch (err) {
					// Mark as failed (keep as 'sending' so user sees it didn't go)
					console.error("[chatStore] sendMessage failed:", err);
					return optimistic;
				}
			},

			// ── Get or create a DM conversation via API ──────────────────────────
			getOrCreateConversation: async (currentUser, otherUser) => {
				const state = get();
				// Check local cache first
				const existing = state.conversations.find(
					(c) =>
						c.type === "direct" &&
						c.participants.some((p) => p.id === otherUser.id),
				);
				if (existing) return existing.id;

				try {
					const res = await chatApi.createDirectConversation(otherUser.id);
					const conv = mapConversation(res.data);
					set((s) => {
						if (s.conversations.some((c) => c.id === conv.id)) return {};
						return { conversations: [conv, ...s.conversations] };
					});
					return conv.id;
				} catch (err) {
					console.error("[chatStore] createDirectConversation failed:", err);
					// Fallback: create locally so UI doesn't break
					const fallbackId = `conv-dm-${Date.now()}`;
					const fallback: Conversation = {
						id: fallbackId,
						type: "direct",
						participants: [otherUser],
						unreadCount: 0,
						createdAt: now(),
					};
					set((s) => ({ conversations: [fallback, ...s.conversations] }));
					return fallbackId;
				}
			},

			// ── Create group via API (admin only, enforced on backend) ───────────
			createGroup: async (
				name,
				description,
				creatorId,
				creatorName,
				creatorRole,
				participants,
			) => {
				// Client-side role guard (backend also enforces this)
				const allowed = [
					"system_admin",
					"broadcast_admin",
					"hr_officer",
					"executive",
				].includes(creatorRole);
				if (!allowed) {
					return { success: false, error: "Only admins can create groups." };
				}

				try {
					const res = await chatApi.createGroup({
						name,
						description,
						participant_ids: participants.map((p) => p.id),
					});
					const conv = mapConversation(res.data);
					set((s) => ({ conversations: [conv, ...s.conversations] }));
					return { success: true, groupId: conv.id };
				} catch (err: any) {
					const msg = err?.response?.data?.detail ?? "Failed to create group.";
					return { success: false, error: msg };
				}
			},

			// ── Mark conversation read via API ───────────────────────────────────
			markConversationRead: async (conversationId) => {
				set((s) => ({
					conversations: s.conversations.map((c) =>
						c.id === conversationId ? { ...c, unreadCount: 0 } : c,
					),
					messages: {
						...s.messages,
						[conversationId]: (s.messages[conversationId] || []).map((m) =>
							m.senderId !== "current-user"
								? { ...m, status: "seen" as MessageStatus }
								: m,
						),
					},
				}));
				try {
					await chatApi.markRead(conversationId);
				} catch {
					// Non-critical — local state already updated
				}
			},

			// ── Typing / presence (local, driven by WS) ──────────────────────────
			setTyping: (conversationId, userId, isTyping) => {
				set((s) => ({
					typingUsers: {
						...s.typingUsers,
						[conversationId]: {
							...(s.typingUsers[conversationId] || {}),
							[userId]: isTyping,
						},
					},
				}));
			},

			setUserOnline: (userId, isOnline) => {
				set((s) => ({ onlineUsers: { ...s.onlineUsers, [userId]: isOnline } }));
			},

			// ── Calls ─────────────────────────────────────────────────────────────
			startCall: async (type, initiatorId, recipientId, conversationId) => {
				const optimisticCall: CallRecord = {
					id: `call-${Date.now()}`,
					type,
					status: "ringing",
					initiatorId,
					recipientId,
					startedAt: now(),
				};
				set({ activeCall: optimisticCall, callStatus: "ringing" });

				try {
					const res = await chatApi.initiateCall({
						recipient_id: recipientId,
						type,
						conversation_id: conversationId,
					});
					const serverCall: CallRecord = {
						id: String(res.data.id),
						type: res.data.type,
						status: res.data.status,
						initiatorId: String(res.data.initiatorId),
						recipientId: String(res.data.recipientId),
						startedAt: res.data.started_at,
					};
					set({ activeCall: serverCall, callStatus: "ringing" });
				} catch (err) {
					console.error("[chatStore] initiateCall failed:", err);
					// Keep optimistic call so UI doesn't break
				}
			},

			endCall: async (status) => {
				const state = get();
				if (!state.activeCall) return;

				const endedAt = now();
				const duration = Math.round(
					(new Date(endedAt).getTime() -
						new Date(state.activeCall.startedAt).getTime()) /
						1000,
				);

				// Find which conversation this call belongs to
				const convId = state.conversations.find(
					(c) =>
						c.type === "direct" &&
						c.participants.some(
							(p) =>
								p.id === state.activeCall!.recipientId ||
								p.id === state.activeCall!.initiatorId,
						),
				)?.id;

				// Add call bubble to messages
				if (convId) {
					const callMsg: Message = {
						id: `msg-call-${Date.now()}`,
						conversationId: convId,
						senderId: state.activeCall.initiatorId,
						senderName: "You",
						content: "",
						timestamp: endedAt,
						status: "seen",
						callRecord: { ...state.activeCall, status, endedAt, duration },
					};
					get().addMessage(callMsg);
				}

				// Tell backend
				try {
					await chatApi.endCall(state.activeCall.id, { status, duration });
				} catch {
					// Non-critical
				}

				set({ activeCall: null, callStatus: null });
			},

			getTotalUnread: () =>
				get().conversations.reduce((sum, c) => sum + c.unreadCount, 0),

			// ── WebSocket lifecycle ───────────────────────────────────────────────
			connectWS: (token: string) => {
				// Don't double-connect
				if (get()._ws) return;

				// In dev, Django runs on :8000 separately from Vite (:5173).
				// In production (nginx), WS is proxied from the same host.
				const wsBase =
					import.meta.env.VITE_WS_URL ??
					(import.meta.env.DEV
						? "ws://127.0.0.1:8000/ws/chat"
						: `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/chat`);

				const ws = new ChatWebSocket(wsBase, token);

				ws.on("message", (payload: any) => {
					const convId = String(
						payload.conversation_id ?? payload.conversationId,
					);
					const msg = mapMessage(payload, convId);
					get().addMessage(msg);
				});

				ws.on("typing", (payload: any) => {
					get().setTyping(
						String(payload.conversation_id),
						String(payload.user_id),
						Boolean(payload.is_typing),
					);
				});

				ws.on("presence", (payload: any) => {
					get().setUserOnline(
						String(payload.user_id),
						Boolean(payload.is_online),
					);
					// Refresh online status in participants
					set((s) => ({
						conversations: s.conversations.map((c) => ({
							...c,
							participants: c.participants.map((p) =>
								p.id === String(payload.user_id)
									? { ...p, isOnline: Boolean(payload.is_online) }
									: p,
							),
						})),
					}));
				});

				ws.on("call_invite", (payload: any) => {
					// Incoming call — set as active call
					const call: CallRecord = {
						id: String(payload.id),
						type: payload.type,
						status: "ringing",
						initiatorId: String(payload.initiatorId),
						recipientId: String(payload.recipientId),
						startedAt: payload.started_at ?? now(),
					};
					set({ activeCall: call, callStatus: "ringing" });
				});

				ws.on("call_status", (payload: any) => {
					set((s) =>
						s.activeCall?.id === String(payload.call_id)
							? {
									callStatus: payload.status as CallStatus,
									activeCall: { ...s.activeCall!, status: payload.status },
								}
							: {},
					);
				});

				ws.connect();
				set({ _ws: ws });
			},

			disconnectWS: () => {
				const ws = get()._ws;
				if (ws) {
					ws.disconnect();
					set({ _ws: null });
				}
			},
		}),
		{
			name: "nexus-chat-store",
			partialize: (s) => ({
				conversations: s.conversations,
				auditLogs: s.auditLogs,
				isChatOpen: s.isChatOpen,
			}),
		},
	),
);
