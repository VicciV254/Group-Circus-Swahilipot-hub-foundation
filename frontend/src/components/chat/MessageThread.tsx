// MessageThread — Center panel: message bubbles, input, media, calls
// Updated: calls real API for send, load, typing via WebSocket
import { useState, useRef, useEffect, useCallback } from "react";
import {
	Phone,
	Video,
	Info,
	Paperclip,
	Send,
	Image,
	FileText,
	Music,
	Film,
	Check,
	CheckCheck,
	Clock,
	Mic,
	PhoneCall,
	PhoneMissed,
	PhoneOff,
	Loader2,
	RefreshCw,
} from "lucide-react";
import {
	useChatStore,
	type Message,
	type MediaAttachment,
} from "../../stores/chatStore";
import { useAuthStore } from "../../services/api";
import { chatApi } from "../../services/chatApi";
import clsx from "clsx";

interface Props {
	conversationId: string;
	onProfileClick: () => void;
}

const MEDIA_ICONS: Record<string, any> = {
	image: Image,
	video: Film,
	audio: Music,
	document: FileText,
};

function MessageStatusIcon({ status }: { status: Message["status"] }) {
	if (status === "sending")
		return <Clock size={10} className="text-slate-600" />;
	if (status === "sent") return <Check size={10} className="text-slate-500" />;
	if (status === "delivered")
		return <CheckCheck size={10} className="text-slate-500" />;
	if (status === "seen")
		return <CheckCheck size={10} className="text-Swahilipot-500" />;
	return null;
}

function MediaPreview({ media }: { media: MediaAttachment }) {
	const Icon = MEDIA_ICONS[media.type] || FileText;
	const sizeKB = Math.round(media.size / 1024);
	if (media.type === "image") {
		return (
			<div className="rounded-lg overflow-hidden border border-surface-border max-w-[200px]">
				<div className="bg-surface-muted flex items-center justify-center h-28 relative">
					{media.url && !media.url.startsWith("#") ? (
						<img
							src={media.url}
							alt={media.name}
							className="object-cover w-full h-full"
						/>
					) : (
						<Image size={24} className="text-slate-500" />
					)}
					<span className="absolute bottom-1 left-1 text-[10px] text-slate-400 bg-black/50 px-1 rounded">
						{media.name}
					</span>
				</div>
			</div>
		);
	}
	return (
		<a
			href={media.url}
			target="_blank"
			rel="noopener noreferrer"
			className="flex items-center gap-2.5 bg-surface-muted/60 rounded-lg px-3 py-2 border border-surface-border max-w-[220px] hover:bg-surface-elevated transition-colors">
			<div className="w-8 h-8 rounded-lg bg-Swahilipot-600/20 flex items-center justify-center shrink-0">
				<Icon size={14} className="text-Swahilipot-400" />
			</div>
			<div className="min-w-0">
				<p className="text-xs text-slate-200 truncate">{media.name}</p>
				<p className="text-[10px] text-slate-500">{sizeKB} KB</p>
			</div>
		</a>
	);
}

function CallBubble({
	call,
	isMine,
}: {
	call: NonNullable<Message["callRecord"]>;
	isMine: boolean;
}) {
	const icons: Record<string, any> = {
		ringing: PhoneCall,
		connected: PhoneCall,
		ended: call.type === "voice" ? Phone : Video,
		missed: PhoneMissed,
		declined: PhoneOff,
	};
	const Icon = icons[call.status] || Phone;
	const colors: Record<string, string> = {
		ended: "text-slate-400",
		missed: "text-red-400",
		declined: "text-red-400",
		connected: "text-green-400",
		ringing: "text-amber-400",
	};
	const formatDuration = (s?: number) => {
		if (!s) return "";
		const m = Math.floor(s / 60),
			sec = s % 60;
		return `${m}:${String(sec).padStart(2, "0")}`;
	};
	return (
		<div
			className={clsx(
				"flex items-center gap-2.5 px-3 py-2 rounded-lg border",
				isMine
					? "bg-Swahilipot-600/10 border-Swahilipot-500/20"
					: "bg-surface-muted border-surface-border",
			)}>
			<Icon size={16} className={colors[call.status]} />
			<div>
				<p className="text-xs font-medium text-slate-200">
					{call.type === "voice" ? "Voice Call" : "Video Call"}
				</p>
				<p className="text-[10px] text-slate-500">
					{call.status === "missed"
						? "Missed"
						: call.status === "declined"
							? "Declined"
							: call.duration
								? formatDuration(call.duration)
								: call.status}
				</p>
			</div>
		</div>
	);
}

function TypingIndicator({ names }: { names: string[] }) {
	if (!names.length) return null;
	const label =
		names.length === 1
			? `${names[0]} is typing…`
			: `${names.join(", ")} are typing…`;
	return (
		<div className="flex items-center gap-2 px-4 py-1">
			<div className="flex gap-0.5">
				{[0, 1, 2].map((i) => (
					<span
						key={i}
						className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"
						style={{ animationDelay: `${i * 0.15}s` }}
					/>
				))}
			</div>
			<span className="text-[11px] text-slate-500 italic">{label}</span>
		</div>
	);
}

export function MessageThread({ conversationId, onProfileClick }: Props) {
	const { user } = useAuthStore();
	const {
		conversations,
		typingUsers,
		onlineUsers,
		isLoadingMessages,
		sendMessage,
		setTyping,
		startCall,
		activeCall,
		markConversationRead,
		loadMessages,
		_ws,
	} = useChatStore();

	// Fine-grained selectors — component re-renders when THIS conversation's
	// messages change, not every time any message in the store changes
	const threadMessages = useChatStore((s) => s.messages[conversationId] || []);
	const isLoading = useChatStore(
		(s) => s.isLoadingMessages[conversationId] ?? false,
	);

	const [inputText, setInputText] = useState("");
	const [isTypingLocal, setIsTypingLocal] = useState(false);
	const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const bottomRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const currentUserId = user?.id ? String(user.id) : "current-user";
	const conversation = conversations.find((c) => c.id === conversationId);

	const typingInConv = typingUsers[conversationId] || {};
	const typingNames = Object.entries(typingInConv)
		.filter(([uid, typing]) => typing && uid !== currentUserId)
		.map(([uid]) => {
			const p = conversation?.participants.find((p) => p.id === uid);
			return p ? p.name.split(" ")[0] : uid;
		});

	const otherParticipant =
		conversation?.type === "direct" ? conversation.participants[0] : null;
	const isOtherOnline = otherParticipant
		? (onlineUsers[otherParticipant.id] ?? otherParticipant.isOnline)
		: false;

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [threadMessages.length, typingNames.length]);

	useEffect(() => {
		loadMessages(conversationId);
		markConversationRead(conversationId);
	}, [conversationId]);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setInputText(e.target.value);
		if (!isTypingLocal) {
			setIsTypingLocal(true);
			setTyping(conversationId, currentUserId, true);
			// Send via WebSocket
			_ws?.sendTyping(conversationId, true);
		}
		clearTimeout(typingTimer.current);
		typingTimer.current = setTimeout(() => {
			setIsTypingLocal(false);
			setTyping(conversationId, currentUserId, false);
			_ws?.sendTyping(conversationId, false);
		}, 2000);
	};

	const handleSend = async () => {
		const text = inputText.trim();
		if (!text) return;
		setInputText("");
		setIsTypingLocal(false);
		setTyping(conversationId, currentUserId, false);
		clearTimeout(typingTimer.current);
		await sendMessage(
			conversationId,
			currentUserId,
			user?.full_name || "You",
			text,
		);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const type = file.type.startsWith("image/")
			? "image"
			: file.type.startsWith("video/")
				? "video"
				: file.type.startsWith("audio/")
					? "audio"
					: "document";
		const media: MediaAttachment = {
			id: `media-${Date.now()}`,
			type,
			url: URL.createObjectURL(file),
			name: file.name,
			size: file.size,
			mimeType: file.type,
		};
		await sendMessage(
			conversationId,
			currentUserId,
			user?.full_name || "You",
			"",
			[media],
		);
		e.target.value = "";
	};

	const handleCall = (type: "voice" | "video") => {
		if (!otherParticipant || activeCall) return;
		startCall(type, currentUserId, otherParticipant.id, conversationId);
	};

	const getInitials = (name: string) =>
		name
			.split(" ")
			.map((w) => w[0])
			.join("")
			.slice(0, 2)
			.toUpperCase();

	const groupMessages = (msgs: Message[]) => {
		const groups: Message[][] = [];
		msgs.forEach((msg) => {
			const last = groups[groups.length - 1];
			if (last && last[0].senderId === msg.senderId && !msg.isSystem) {
				last.push(msg);
			} else {
				groups.push([msg]);
			}
		});
		return groups;
	};

	const formatTime = (iso: string) =>
		new Date(iso).toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});

	const groupedMessages = groupMessages(threadMessages);

	return (
		<div className="flex flex-col flex-1 min-h-0">
			{/* ── Header ── */}
			<div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border bg-surface-card shrink-0">
				{conversation?.type === "direct" && otherParticipant ? (
					<>
						<div className="relative shrink-0">
							<div className="w-8 h-8 rounded-full bg-gradient-Nexus flex items-center justify-center text-xs font-bold text-white">
								{getInitials(otherParticipant.name)}
							</div>
							<span
								className={clsx(
									"absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-card",
									isOtherOnline ? "bg-green-500" : "bg-slate-600",
								)}
							/>
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-sm font-semibold text-white truncate">
								{otherParticipant.name}
							</p>
							<p className="text-[10px] text-slate-500">
								{isOtherOnline ? (
									<span className="text-green-500">● Online</span>
								) : (
									<span>
										{otherParticipant.lastSeen
											? `Last seen ${otherParticipant.lastSeen}`
											: "Offline"}
									</span>
								)}
							</p>
						</div>
						<button
							onClick={() => handleCall("voice")}
							disabled={!!activeCall}
							className="btn-secondary btn-icon disabled:opacity-40"
							title="Voice call">
							<Phone size={14} />
						</button>
						<button
							onClick={() => handleCall("video")}
							disabled={!!activeCall}
							className="btn-secondary btn-icon disabled:opacity-40"
							title="Video call">
							<Video size={14} />
						</button>
						<button
							onClick={onProfileClick}
							className="btn-ghost btn-icon"
							title="Profile">
							<Info size={14} />
						</button>
					</>
				) : (
					<>
						<div className="w-8 h-8 rounded-xl bg-surface-muted flex items-center justify-center">
							<span className="text-slate-400 text-sm font-bold">#</span>
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-sm font-semibold text-white truncate">
								{conversation?.name}
							</p>
							<p className="text-[10px] text-slate-500">
								{conversation?.participants.length} members
							</p>
						</div>
						<button
							onClick={() => loadMessages(conversationId)}
							className="btn-ghost btn-icon"
							title="Refresh">
							<RefreshCw size={14} />
						</button>
						<button
							onClick={onProfileClick}
							className="btn-ghost btn-icon"
							title="Group info">
							<Info size={14} />
						</button>
					</>
				)}
			</div>

			{/* ── Messages ── */}
			<div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
				{isLoading ? (
					<div className="flex justify-center items-center h-full">
						<Loader2 size={24} className="animate-spin text-slate-500" />
					</div>
				) : threadMessages.length === 0 ? (
					<div className="flex justify-center items-center h-full text-slate-600 text-sm">
						No messages yet. Say hello!
					</div>
				) : (
					groupedMessages.map((group, gi) => {
						const isMine = group[0].senderId === currentUserId;
						const isSystem = group[0].isSystem;

						if (isSystem) {
							return (
								<div key={gi} className="flex justify-center">
									<span className="text-[11px] text-slate-600 bg-surface-elevated px-3 py-1 rounded-full border border-surface-border">
										{group[0].content}
									</span>
								</div>
							);
						}

						return (
							<div
								key={gi}
								className={clsx(
									"flex gap-2.5",
									isMine ? "flex-row-reverse" : "flex-row",
								)}>
								{!isMine && (
									<div className="w-7 h-7 rounded-full bg-gradient-Nexus flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-1">
										{getInitials(group[0].senderName)}
									</div>
								)}

								<div
									className={clsx(
										"flex flex-col gap-1 max-w-[75%]",
										isMine ? "items-end" : "items-start",
									)}>
									{!isMine && conversation?.type === "group" && (
										<span className="text-[11px] font-medium text-Swahilipot-400 px-1">
											{group[0].senderName}
										</span>
									)}

									{group.map((msg, mi) => (
										<div key={msg.id}>
											{msg.callRecord && (
												<CallBubble call={msg.callRecord} isMine={isMine} />
											)}
											{msg.media?.map((m) => (
												<div key={m.id} className="mb-1">
													<MediaPreview media={m} />
												</div>
											))}
											{msg.content && (
												<div
													className={clsx(
														"px-3.5 py-2 rounded-2xl text-sm leading-relaxed",
														isMine
															? "bg-Swahilipot-600 text-white rounded-tr-sm"
															: "bg-surface-elevated text-slate-200 border border-surface-border rounded-tl-sm",
													)}>
													{msg.content}
												</div>
											)}
											{mi === group.length - 1 && (
												<div
													className={clsx(
														"flex items-center gap-1 mt-0.5 px-1",
														isMine ? "flex-row-reverse" : "flex-row",
													)}>
													<span className="text-[10px] text-slate-600">
														{formatTime(msg.timestamp)}
													</span>
													{isMine && <MessageStatusIcon status={msg.status} />}
												</div>
											)}
										</div>
									))}
								</div>
							</div>
						);
					})
				)}

				<TypingIndicator names={typingNames} />
				<div ref={bottomRef} />
			</div>

			{/* ── Input ── */}
			<div className="px-3 py-3 border-t border-surface-border bg-surface-card shrink-0">
				<div className="flex items-center gap-2 bg-surface-elevated border border-surface-border rounded-xl px-3 py-2">
					<input
						type="file"
						ref={fileInputRef}
						onChange={handleFileAttach}
						className="hidden"
						accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
					/>
					<button
						onClick={() => fileInputRef.current?.click()}
						className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-surface-muted"
						title="Attach file">
						<Paperclip size={16} />
					</button>
					<input
						value={inputText}
						onChange={handleInputChange}
						onKeyDown={handleKeyDown}
						placeholder="Type a message…"
						className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-600 outline-none"
					/>
					<button
						onClick={handleSend}
						disabled={!inputText.trim()}
						className={clsx(
							"w-8 h-8 rounded-lg flex items-center justify-center transition-all",
							inputText.trim()
								? "bg-Swahilipot-600 text-white hover:bg-Swahilipot-700"
								: "text-slate-600 cursor-not-allowed",
						)}>
						<Send size={14} />
					</button>
				</div>
			</div>
		</div>
	);
}
