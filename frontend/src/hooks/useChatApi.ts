// useChatApi — connects Zustand store to the real Django backend
// Drop this hook into any component that needs live data.
// It replaces all demo seed data once mounted.
import { useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useChatStore } from "../stores/chatStore";
import { chatApi, ChatWebSocket } from "../services/chatApi";
import { useAuthStore } from "../services/api";
import toast from "react-hot-toast";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: map Django response shape → Zustand store shape
// ─────────────────────────────────────────────────────────────────────────────

function mapParticipant(p: any) {
	return {
		id: String(p.id),
		name: p.full_name,
		role: p.role_display || p.role,
		department: p.department_name,
		email: p.email,
		avatar: p.profile_photo,
		isOnline: p.is_online ?? false,
		lastSeen: p.last_seen,
	};
}

function mapMessage(m: any) {
	return {
		id: String(m.id),
		conversationId: String(m.conversation),
		senderId: String(m.sender?.id),
		senderName: m.sender?.full_name ?? "Unknown",
		senderAvatar: m.sender?.profile_photo,
		content: m.content,
		timestamp: m.created_at,
		status: m.status,
		isSystem: m.is_system,
		media: (m.media || []).map((med: any) => ({
			id: String(med.id),
			type: med.type,
			url: med.url,
			name: med.name,
			size: med.size,
			thumbnailUrl: med.thumbnail_url,
			mimeType: med.mime_type,
		})),
	};
}

function mapConversation(c: any, currentUserId: string) {
	const participants = (c.participants || []).map((cp: any) =>
		mapParticipant(cp.user || cp),
	);
	// For direct conversations, use other_user
	const directParticipants = c.other_user
		? [mapParticipant(c.other_user)]
		: participants.filter((p: any) => p.id !== currentUserId);

	return {
		id: String(c.id),
		type: c.type,
		name: c.name || undefined,
		description: c.description,
		participants: c.type === "direct" ? directParticipants : participants,
		unreadCount: c.unread_count ?? 0,
		createdAt: c.created_at,
		createdBy: c.created_by?.id ? String(c.created_by.id) : undefined,
		lastMessage: c.last_message
			? {
					id: String(c.last_message.id || "last"),
					conversationId: String(c.id),
					senderId: String(c.last_message.sender_id),
					senderName: c.last_message.sender_name,
					content: c.last_message.content,
					timestamp: c.last_message.timestamp,
					status: c.last_message.status,
				}
			: undefined,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Main hook
// ─────────────────────────────────────────────────────────────────────────────

export function useChatApi() {
	const { user, accessToken } = useAuthStore();
	const store = useChatStore();
	const qc = useQueryClient();
	const wsRef = useRef<ChatWebSocket | null>(null);
	const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>(
		{},
	);

	const currentUserId = String(user?.id || "");

	// ── 1. Fetch conversations on mount ────────────────────────────────────────
	const { data: conversationsData } = useQuery({
		queryKey: ["chat-conversations"],
		queryFn: () => chatApi.conversations().then((r) => r.data),
		enabled: !!user,
		refetchInterval: 30000,
	});

	useEffect(() => {
		if (!conversationsData) return;
		const mapped = conversationsData.map((c: any) =>
			mapConversation(c, currentUserId),
		);
		// Replace store conversations with live data
		useChatStore.setState({ conversations: mapped });
	}, [conversationsData]);

	// ── 2. Fetch messages when a conversation is opened ───────────────────────
	const { activeConversationId } = store;

	const { data: messagesData } = useQuery({
		queryKey: ["chat-messages", activeConversationId],
		queryFn: () =>
			chatApi.messages(activeConversationId!).then((r) => r.data.results),
		enabled: !!activeConversationId,
	});

	useEffect(() => {
		if (!messagesData || !activeConversationId) return;
		const mapped = (messagesData.results ?? messagesData).map(mapMessage);
		useChatStore.setState((s) => ({
			messages: { ...s.messages, [activeConversationId]: mapped },
		}));
	}, [messagesData, activeConversationId]);

	// ── 3. Send message ────────────────────────────────────────────────────────
	const sendMessageMutation = useMutation({
		mutationFn: ({
			conversationId,
			content,
			mediaIds,
		}: {
			conversationId: string;
			content: string;
			mediaIds?: string[];
		}) => chatApi.sendMessage(conversationId, { content, media_ids: mediaIds }),

		onSuccess: (response, variables) => {
			const msg = mapMessage({
				...response.data,
				conversation: variables.conversationId,
			});
			store.addMessage(msg);
			qc.invalidateQueries({ queryKey: ["chat-conversations"] });
		},
		onError: () => toast.error("Failed to send message"),
	});

	// ── 4. Upload media ────────────────────────────────────────────────────────
	const uploadMediaMutation = useMutation({
		mutationFn: ({
			file,
			conversationId,
		}: {
			file: File;
			conversationId: string;
		}) => chatApi.uploadMedia(file, conversationId),
		onError: () => toast.error("Failed to upload file"),
	});

	// ── 5. Start / get DM ─────────────────────────────────────────────────────
	const startDMMutation = useMutation({
		mutationFn: (recipientId: string) =>
			chatApi.createDirectConversation(recipientId),
		onSuccess: (response) => {
			const conv = mapConversation(response.data, currentUserId);
			useChatStore.setState((s) => {
				const exists = s.conversations.find((c) => c.id === conv.id);
				return {
					conversations: exists ? s.conversations : [conv, ...s.conversations],
					activeConversationId: conv.id,
				};
			});
		},
		onError: () => toast.error("Could not open conversation"),
	});

	// ── 6. Create group ────────────────────────────────────────────────────────
	const createGroupMutation = useMutation({
		mutationFn: (data: {
			name: string;
			description: string;
			participant_ids: string[];
		}) => chatApi.createGroup(data),
		onSuccess: (response) => {
			const conv = mapConversation(response.data, currentUserId);
			useChatStore.setState((s) => ({
				conversations: [conv, ...s.conversations],
				activeConversationId: conv.id,
			}));
			toast.success(`Group ${conv.name} created!`);
			qc.invalidateQueries({ queryKey: ["chat-conversations"] });
		},
		onError: (error: any) => {
			const msg = error?.response?.data?.detail || "Failed to create group";
			toast.error(msg);
		},
	});

	// ── 7. Mark conversation read ──────────────────────────────────────────────
	const markReadMutation = useMutation({
		mutationFn: (conversationId: string) => chatApi.markRead(conversationId),
		onSuccess: (_, conversationId) => {
			store.markConversationRead(conversationId);
			qc.invalidateQueries({ queryKey: ["chat-conversations"] });
		},
	});

	// ── 8. Initiate call ───────────────────────────────────────────────────────
	const initiateCallMutation = useMutation({
		mutationFn: (data: {
			recipient_id: string;
			type: "voice" | "video";
			conversation_id: string;
		}) => chatApi.initiateCall(data),
		onSuccess: (response) => {
			const call = response.data;
			useChatStore.setState({
				activeCall: {
					id: String(call.id),
					type: call.type,
					status: call.status,
					initiatorId: String(call.initiator?.id || currentUserId),
					recipientId: String(call.recipient?.id),
					startedAt: call.started_at,
				},
				callStatus: "ringing",
			});
		},
		onError: () => toast.error("Could not initiate call"),
	});

	// ── 9. End call ────────────────────────────────────────────────────────────
	const endCallMutation = useMutation({
		mutationFn: ({ callId, status }: { callId: string; status: string }) =>
			chatApi.endCall(callId, { status }),
		onSuccess: () => {
			store.endCall("ended");
			qc.invalidateQueries({
				queryKey: ["chat-messages", activeConversationId],
			});
		},
	});

	// ── 10. WebSocket — real-time events ──────────────────────────────────────
	useEffect(() => {
		if (!user || !accessToken) return;

		const wsUrl =
			(import.meta.env.VITE_WS_URL || "ws://localhost:8000") + "/ws/chat/";
		const ws = new ChatWebSocket(wsUrl, accessToken);
		wsRef.current = ws;
		ws.connect();

		// New message
		ws.on("message", (payload: any) => {
			const msg = mapMessage(payload);
			store.addMessage(msg);
			qc.invalidateQueries({ queryKey: ["chat-conversations"] });
		});

		// Typing indicator
		ws.on("typing", (payload: any) => {
			const { conversation_id, user_id, is_typing } = payload;
			store.setTyping(conversation_id, user_id, is_typing);
			// Auto-clear after 3s in case disconnect event is missed
			if (is_typing) {
				const key = `${conversation_id}:${user_id}`;
				clearTimeout(typingTimers.current[key]);
				typingTimers.current[key] = setTimeout(() => {
					store.setTyping(conversation_id, user_id, false);
				}, 3000);
			}
		});

		// Presence
		ws.on("presence", (payload: any) => {
			store.setUserOnline(String(payload.user_id), payload.status === "online");
		});

		// Message seen
		ws.on("message_seen", (payload: any) => {
			qc.invalidateQueries({
				queryKey: ["chat-messages", payload.conversation_id],
			});
		});

		// Incoming call
		ws.on("call_invite", (payload: any) => {
			useChatStore.setState({
				activeCall: {
					id: String(payload.id),
					type: payload.type,
					status: "ringing",
					initiatorId: String(payload.initiator?.id),
					recipientId: currentUserId,
					startedAt: payload.started_at,
				},
				callStatus: "ringing",
			});
			toast(
				`📞 Incoming ${payload.type} call from ${payload.initiator?.full_name}`,
				{
					duration: 10000,
				},
			);
		});

		return () => {
			ws.disconnect();
			wsRef.current = null;
		};
	}, [user?.id, accessToken]);

	// ── 11. Typing — send to WebSocket ────────────────────────────────────────
	const sendTyping = useCallback(
		(conversationId: string, isTyping: boolean) => {
			wsRef.current?.sendTyping(conversationId, isTyping);
		},
		[],
	);

	// ── 12. Update presence on visibility change ──────────────────────────────
	useEffect(() => {
		const handleVisibility = () => {
			const status = document.visibilityState === "visible" ? "online" : "away";
			chatApi.updatePresence(status).catch(() => {});
			wsRef.current?.send("presence", { status });
		};
		document.addEventListener("visibilitychange", handleVisibility);
		// Set online on mount
		chatApi.updatePresence("online").catch(() => {});
		return () => {
			document.removeEventListener("visibilitychange", handleVisibility);
			chatApi.updatePresence("offline").catch(() => {});
		};
	}, [user?.id]);

	return {
		// Mutations the UI calls directly
		sendMessage: sendMessageMutation.mutate,
		uploadMedia: uploadMediaMutation.mutateAsync,
		startDM: (recipientId: string) => startDMMutation.mutate(recipientId),
		createGroup: createGroupMutation.mutate,
		markRead: (id: string) => markReadMutation.mutate(id),
		initiateCall: initiateCallMutation.mutate,
		endCall: (callId: string) =>
			endCallMutation.mutate({ callId, status: "ended" }),
		sendTyping,

		// Loading states
		isSending: sendMessageMutation.isPending,
		isUploading: uploadMediaMutation.isPending,
		isCreatingGroup: createGroupMutation.isPending,
	};
}
