// ChatPanel — LinkedIn-style messaging panel
// Full production implementation matching LinkedIn UI screenshots
import { useEffect, useRef, useState } from "react";
import {
	MessageSquare,
	X,
	Minus,
	Maximize2,
	MoreHorizontal,
	Search,
	Send,
	Paperclip,
	Mic,
	MicOff,
	Phone,
	Video,
	FileText,
	Loader2,
	Edit,
	Users,
	Settings,
	VolumeX,
	ChevronLeft,
	Check,
	CheckCheck,
	Clock,
	Filter,
	Volume2,
	MailOpen,
	Mail,
	Trash2,
} from "lucide-react";
import {
	useChatStore,
	type Conversation,
	type Message,
} from "../../stores/chatStore";
import { useAuthStore } from "../../services/api";
import { chatApi } from "../../services/chatApi";
import { useFloatingDock } from "../../hooks/Usefloatingdock";
import clsx from "clsx";

// ── Helpers ───────────────────────────────────────────────────────────────────
const getInitials = (name: string) =>
	(name || "?")
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0].toUpperCase())
		.join("");

const fmtTime = (iso?: string) => {
	if (!iso) return "";
	const d = new Date(iso),
		now = new Date();
	const m = Math.floor((now.getTime() - d.getTime()) / 60000);
	if (m < 1) return "now";
	if (m < 60) return `${m}m`;
	if (m < 1440) return `${Math.floor(m / 60)}h`;
	if (m < 10080) return d.toLocaleDateString([], { weekday: "short" });
	return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

const fmtClock = (iso: string) =>
	new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const fmtSecs = (s: number) =>
	`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

type FilterType =
	| "focused"
	| "other"
	| "unread"
	| "archived"
	| "starred"
	| "spam";

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({
	name,
	isOnline,
	size = "md",
}: {
	name: string;
	isOnline?: boolean;
	size?: "xs" | "sm" | "md" | "lg";
}) {
	const sz = {
		xs: "w-6 h-6 text-[10px]",
		sm: "w-8 h-8 text-xs",
		md: "w-10 h-10 text-sm",
		lg: "w-14 h-14 text-xl",
	}[size];
	const dot = {
		xs: "w-2 h-2",
		sm: "w-2.5 h-2.5",
		md: "w-3 h-3",
		lg: "w-3.5 h-3.5",
	}[size];
	return (
		<div className="relative shrink-0">
			<div
				className={clsx(
					sz,
					"rounded-full bg-gradient-to-br from-Swahilipot-600 to-purple-700 flex items-center justify-center font-semibold text-white",
				)}>
				{getInitials(name)}
			</div>
			{isOnline !== undefined && (
				<span
					className={clsx(
						dot,
						"absolute bottom-0 right-0 rounded-full border-2 border-surface-card",
						isOnline ? "bg-green-500" : "bg-slate-600",
					)}
				/>
			)}
		</div>
	);
}

// ── Message status icon ───────────────────────────────────────────────────────
function MsgStatus({ status }: { status?: Message["status"] }) {
	if (status === "sending")
		return <Clock size={10} className="text-slate-600" />;
	if (status === "sent") return <Check size={10} className="text-slate-400" />;
	if (status === "delivered")
		return <CheckCheck size={10} className="text-slate-400" />;
	if (status === "seen")
		return <CheckCheck size={10} className="text-blue-400" />;
	return null;
}

// ── ConvRow ───────────────────────────────────────────────────────────────────
function ConvRow({
	conv,
	isActive,
	showCheckbox,
	isChecked,
	onCheck,
	onClick,
	onlineUsers,
}: {
	conv: Conversation;
	isActive: boolean;
	showCheckbox: boolean;
	isChecked: boolean;
	onCheck: () => void;
	onClick: () => void;
	onlineUsers: Record<string, boolean>;
}) {
	const other = conv.type === "direct" ? conv.participants[0] : null;
	const name =
		conv.type === "group" ? conv.name || "Group" : other?.name || "Unknown";
	const isOnline = other
		? (onlineUsers[other.id] ?? other.isOnline)
		: undefined;

	return (
		<div
			onClick={onClick}
			className={clsx(
				"flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
				isActive ? "bg-white/8" : "hover:bg-white/5",
			)}>
			{showCheckbox && (
				<div
					onClick={(e) => {
						e.stopPropagation();
						onCheck();
					}}
					className={clsx(
						"w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-all",
						isChecked ? "bg-blue-600 border-blue-600" : "border-slate-500",
					)}>
					{isChecked && <Check size={9} className="text-white" />}
				</div>
			)}
			<Avatar
				name={name}
				isOnline={conv.type === "direct" ? isOnline : undefined}
				size="md"
			/>
			<div className="flex-1 min-w-0">
				<div className="flex items-center justify-between mb-0.5">
					<span
						className={clsx(
							"text-sm truncate",
							conv.unreadCount > 0
								? "font-bold text-white"
								: "font-medium text-slate-200",
						)}>
						{name}
					</span>
					<span className="text-[11px] text-slate-500 shrink-0 ml-1">
						{fmtTime(conv.lastMessage?.timestamp)}
					</span>
				</div>
				<div className="flex items-center justify-between gap-2">
					<p className="text-[12px] text-slate-400 truncate">
						{conv.lastMessage?.senderName === "You" ? (
							<span className="text-slate-300">You: </span>
						) : null}
						{conv.lastMessage?.content || (
							<span className="italic">No messages yet</span>
						)}
					</p>
					{conv.unreadCount > 0 && (
						<span className="min-w-[18px] px-1 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
							{conv.unreadCount > 99 ? "99+" : conv.unreadCount}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}

// ── Manage panel ──────────────────────────────────────────────────────────────
function ManagePanel({
	conversations,
	onBack,
	onlineUsers,
}: {
	conversations: Conversation[];
	onBack: () => void;
	onlineUsers: Record<string, boolean>;
}) {
	const [checked, setChecked] = useState<Set<string>>(new Set());
	const toggle = (id: string) =>
		setChecked((p) => {
			const n = new Set(p);
			n.has(id) ? n.delete(id) : n.add(id);
			return n;
		});
	const allChecked =
		checked.size === conversations.length && conversations.length > 0;

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
				<button onClick={onBack} className="text-slate-400 hover:text-white">
					<X size={16} />
				</button>
				<span className="text-sm font-semibold text-white">
					{checked.size > 0
						? `${checked.size} Selected`
						: "Manage conversations"}
				</span>
				<button
					onClick={() =>
						setChecked(
							allChecked ? new Set() : new Set(conversations.map((c) => c.id)),
						)
					}
					className="text-xs text-blue-400 hover:text-blue-300">
					{allChecked ? "Deselect all" : "Select all"}
				</button>
			</div>

			{checked.size > 0 && (
				<div className="flex items-center gap-2 px-4 py-2 border-b border-surface-border bg-surface-elevated">
					<button className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-2 py-1 rounded-lg hover:bg-surface-muted transition-colors">
						<MailOpen size={12} /> Mark read
					</button>
					<button className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-2 py-1 rounded-lg hover:bg-surface-muted transition-colors">
						<Mail size={12} /> Mark unread
					</button>
					<div className="flex-1" />
					<button className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-lg hover:bg-surface-muted transition-colors">
						<Trash2 size={12} /> Delete
					</button>
				</div>
			)}

			<div className="flex-1 overflow-y-auto">
				{conversations.map((conv) => (
					<ConvRow
						key={conv.id}
						conv={conv}
						isActive={false}
						showCheckbox={true}
						isChecked={checked.has(conv.id)}
						onCheck={() => toggle(conv.id)}
						onClick={() => toggle(conv.id)}
						onlineUsers={onlineUsers}
					/>
				))}
				{conversations.length === 0 && (
					<p className="text-center text-slate-500 text-sm py-10">
						No conversations
					</p>
				)}
			</div>
		</div>
	);
}

// ── Settings panel ────────────────────────────────────────────────────────────
function SettingsPanel({ onBack }: { onBack: () => void }) {
	const [openNew, setOpenNew] = useState(true);
	const [sound, setSound] = useState(true);
	const Toggle = ({ on, toggle }: { on: boolean; toggle: () => void }) => (
		<button
			onClick={toggle}
			className={clsx(
				"relative w-10 h-5 rounded-full transition-colors",
				on ? "bg-green-500" : "bg-slate-600",
			)}>
			<span
				className={clsx(
					"absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow",
					on ? "left-5" : "left-0.5",
				)}
			/>
		</button>
	);
	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border shrink-0">
				<button onClick={onBack} className="text-slate-400 hover:text-white">
					<X size={16} />
				</button>
				<span className="text-sm font-semibold text-white">
					Messaging settings
				</span>
			</div>
			<div className="flex-1 overflow-y-auto divide-y divide-surface-border">
				<div className="flex items-center justify-between px-4 py-4">
					<div>
						<p className="text-sm text-slate-200">Always open new messages</p>
						<p className="text-[11px] text-slate-500 mt-0.5">
							New conversations open automatically
						</p>
					</div>
					<Toggle on={openNew} toggle={() => setOpenNew(!openNew)} />
				</div>
				<div className="flex items-center justify-between px-4 py-4">
					<div>
						<p className="text-sm text-slate-200">
							Play sound for new messages
						</p>
						<p className="text-[11px] text-slate-500 mt-0.5">
							Audio alert when a message arrives
						</p>
					</div>
					<Toggle on={sound} toggle={() => setSound(!sound)} />
				</div>
				<div className="px-4 py-4">
					<p className="text-sm text-slate-200 mb-0.5">
						Focused Inbox settings
					</p>
					<button className="text-sm text-blue-400 hover:text-blue-300">
						Update settings →
					</button>
				</div>
				<div className="px-4 py-4">
					<p className="text-sm text-slate-200 mb-0.5">
						Active status settings
					</p>
					<button className="text-sm text-blue-400 hover:text-blue-300">
						Update settings →
					</button>
				</div>
			</div>
		</div>
	);
}

// ── New message panel ─────────────────────────────────────────────────────────
function NewMsgPanel({
	onBack,
	onStart,
}: {
	onBack: () => void;
	onStart: (userId: string, name: string) => void;
}) {
	const [q, setQ] = useState("");
	const [users, setUsers] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		(async () => {
			setLoading(true);
			try {
				const r = await fetch("/api/v1/chat/users/", {
					headers: {
						Authorization: `Bearer ${useAuthStore.getState().accessToken}`,
					},
				});
				if (r.ok) {
					setUsers(await r.json());
					return;
				}
			} catch {}
			try {
				const r = await chatApi.onlineUsers();
				setUsers(r.data || []);
			} catch {
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	const list = q
		? users.filter(
				(u) =>
					u.name?.toLowerCase().includes(q.toLowerCase()) ||
					u.email?.toLowerCase().includes(q.toLowerCase()),
			)
		: users;

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
				<button onClick={onBack} className="text-slate-400 hover:text-white">
					<X size={16} />
				</button>
				<span className="text-sm font-semibold text-white">New message</span>
				<div className="w-6" />
			</div>
			<div className="px-3 py-2 border-b border-surface-border">
				<div className="flex items-center gap-2 bg-surface-elevated rounded-full px-3 py-1.5">
					<Search size={13} className="text-slate-500 shrink-0" />
					<input
						autoFocus
						value={q}
						onChange={(e) => setQ(e.target.value)}
						placeholder="Type a name or multiple names"
						className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none"
					/>
				</div>
			</div>
			<div className="flex-1 overflow-y-auto">
				{loading ? (
					<div className="flex justify-center py-8">
						<Loader2 size={18} className="animate-spin text-slate-500" />
					</div>
				) : (
					<>
						<p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
							{q ? "Results" : "Suggested"}
						</p>
						{list.slice(0, q ? 50 : 10).map((u) => (
							<button
								key={u.id}
								onClick={() => onStart(u.id, u.name)}
								className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left">
								<Avatar name={u.name} isOnline={u.isOnline} size="sm" />
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium text-slate-200 truncate">
										{u.name}
									</p>
									<p className="text-[11px] text-slate-500 truncate">
										{u.role}
									</p>
								</div>
								{u.isOnline && (
									<span className="text-[10px] text-green-500 shrink-0">
										● Online
									</span>
								)}
							</button>
						))}
						{list.length === 0 && q && (
							<p className="text-center text-slate-500 text-sm py-8">
								No results for "{q}"
							</p>
						)}
					</>
				)}
			</div>
		</div>
	);
}

// ── Thread panel ──────────────────────────────────────────────────────────────
function ThreadPanel({
	conv,
	onBack,
	onClose,
}: {
	conv: Conversation;
	onBack: () => void;
	onClose: () => void;
}) {
	const { user } = useAuthStore();
	const {
		sendMessage,
		loadMessages,
		markConversationRead,
		typingUsers,
		setTyping,
		startCall,
		activeCall,
		endCall,
		_ws,
	} = useChatStore();

	// Fine-grained selectors so the component re-renders when THIS
	// conversation's messages or loading state change (not the whole object)
	const threadMsgs = useChatStore((s) => s.messages[conv.id] || []);
	const isLoading = useChatStore(
		(s) => s.isLoadingMessages?.[conv.id] ?? false,
	);

	const [input, setInput] = useState("");
	const [isTypingLocal, setIsTypingLocal] = useState(false);
	const [isRecording, setIsRecording] = useState(false);
	const [recSecs, setRecSecs] = useState(0);
	const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(
		null,
	);

	const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const recTimer = useRef<ReturnType<typeof setInterval>>(undefined);
	const bottomRef = useRef<HTMLDivElement>(null);
	const fileRef = useRef<HTMLInputElement>(null);

	const uid = String(user?.id || "");
	const other = conv.type === "direct" ? conv.participants[0] : null;
	const convName =
		conv.type === "group" ? conv.name || "Group" : other?.name || "Unknown";
	const isOnline = other?.isOnline ?? false;

	const typingNames = Object.entries(typingUsers[conv.id] || {})
		.filter(([id, t]) => t && id !== uid)
		.map(
			([id]) =>
				conv.participants.find((p) => p.id === id)?.name?.split(" ")[0] ||
				"Someone",
		);

	useEffect(() => {
		loadMessages(conv.id); // always fetch fresh from API
		markConversationRead(conv.id);
	}, [conv.id]);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [threadMsgs.length, typingNames.length]);

	// Group consecutive messages by sender
	const groups: Message[][] = [];
	threadMsgs.forEach((msg) => {
		const last = groups[groups.length - 1];
		if (last && last[0].senderId === msg.senderId && !msg.isSystem)
			last.push(msg);
		else groups.push([msg]);
	});

	const handleSend = async () => {
		const text = input.trim();
		if (!text) return;
		setInput("");
		clearTyping();
		await sendMessage(conv.id, uid, user?.full_name || "You", text);
	};

	const clearTyping = () => {
		clearTimeout(typingTimer.current);
		setIsTypingLocal(false);
		setTyping(conv.id, uid, false);
		_ws?.sendTyping(conv.id, false);
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setInput(e.target.value);
		if (!isTypingLocal) {
			setIsTypingLocal(true);
			setTyping(conv.id, uid, true);
			_ws?.sendTyping(conv.id, true);
		}
		clearTimeout(typingTimer.current);
		typingTimer.current = setTimeout(clearTyping, 2000);
	};

	const startRecording = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const mr = new MediaRecorder(stream);
			const chunks: Blob[] = [];
			mr.ondataavailable = (e) => chunks.push(e.data);
			mr.onstop = async () => {
				stream.getTracks().forEach((t) => t.stop());
				const blob = new Blob(chunks, { type: "audio/webm" });
				const file = new File([blob], `voice-${Date.now()}.webm`, {
					type: "audio/webm",
				});
				const form = new FormData();
				form.append("file", file);
				form.append("conversation_id", conv.id);
				form.append("is_voice", "true");
				form.append("duration", String(recSecs));
				try {
					const res = await fetch("/api/v1/chat/media/", {
						method: "POST",
						headers: {
							Authorization: `Bearer ${useAuthStore.getState().accessToken}`,
						},
						body: form,
					});
					if (res.ok) {
						const m = await res.json();
						await sendMessage(conv.id, uid, user?.full_name || "You", "", [
							{
								id: m.id,
								type: "voice",
								url: m.url,
								name: m.name,
								size: m.size,
								mimeType: "audio/webm",
							},
						]);
					}
				} catch (err) {
					console.error("Voice upload failed", err);
				}
			};
			mr.start();
			setMediaRecorder(mr);
			setIsRecording(true);
			setRecSecs(0);
			recTimer.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
		} catch {
			console.error("Mic denied");
		}
	};

	const stopRecording = () => {
		mediaRecorder?.stop();
		setMediaRecorder(null);
		setIsRecording(false);
		clearInterval(recTimer.current);
	};

	const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const type = file.type.startsWith("image/")
			? "image"
			: file.type.startsWith("video/")
				? "video"
				: file.type.startsWith("audio/")
					? "audio"
					: "document";
		await sendMessage(conv.id, uid, user?.full_name || "You", "", [
			{
				id: `local-${Date.now()}`,
				type,
				url: URL.createObjectURL(file),
				name: file.name,
				size: file.size,
				mimeType: file.type,
			},
		]);
		e.target.value = "";
	};

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-surface-border shrink-0">
				<button
					onClick={onBack}
					className="text-slate-400 hover:text-white p-1 rounded lg:hidden">
					<ChevronLeft size={16} />
				</button>
				<Avatar
					name={convName}
					isOnline={conv.type === "direct" ? isOnline : undefined}
					size="sm"
				/>
				<div className="flex-1 min-w-0">
					<p className="text-sm font-semibold text-white truncate">
						{convName}
					</p>
					{conv.type === "direct" && other && (
						<p className="text-[11px] text-slate-500 truncate">
							{[other.role, other.department].filter(Boolean).join(" · ")}
						</p>
					)}
					{conv.type === "group" && (
						<p className="text-[11px] text-slate-500">
							{conv.participants.length} members
						</p>
					)}
				</div>
				{conv.type === "direct" && (
					<div className="flex items-center gap-0.5">
						<button
							onClick={() =>
								other && startCall("voice", uid, other.id, conv.id)
							}
							disabled={!!activeCall}
							className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-surface-elevated disabled:opacity-30 transition-colors">
							<Phone size={14} />
						</button>
						<button
							onClick={() =>
								other && startCall("video", uid, other.id, conv.id)
							}
							disabled={!!activeCall}
							className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-surface-elevated disabled:opacity-30 transition-colors">
							<Video size={14} />
						</button>
					</div>
				)}
				<button
					onClick={onClose}
					className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-surface-elevated">
					<X size={14} />
				</button>
			</div>

			{/* DM profile strip */}
			{conv.type === "direct" && other && (
				<div className="flex flex-col items-center py-5 px-4 border-b border-surface-border">
					<Avatar name={other.name} isOnline={isOnline} size="lg" />
					<p className="text-[15px] font-bold text-white mt-2">{other.name}</p>
					{other.role && (
						<p className="text-[12px] text-Swahilipot-400 mt-0.5">
							{other.role}
						</p>
					)}
					{other.department && (
						<p className="text-[11px] text-slate-500">{other.department}</p>
					)}
					{other.email && (
						<p className="text-[11px] text-slate-500">{other.email}</p>
					)}
					<span
						className={clsx(
							"mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-medium",
							isOnline
								? "bg-green-500/15 text-green-400"
								: "bg-slate-700 text-slate-400",
						)}>
						{isOnline ? "● Online" : "● Offline"}
					</span>
				</div>
			)}

			{/* Messages */}
			<div className="flex-1 overflow-y-auto px-3 py-3">
				{isLoading ? (
					<div className="flex justify-center py-8">
						<Loader2 size={18} className="animate-spin text-slate-500" />
					</div>
				) : threadMsgs.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-full py-6">
						<MessageSquare size={28} className="text-slate-600 mb-2" />
						<p className="text-sm text-slate-500">
							Say hello to {convName.split(" ")[0]}
						</p>
					</div>
				) : (
					<div className="space-y-1">
						{groups.map((group, gi) => {
							const isMine = group[0].senderId === uid;
							if (group[0].isSystem)
								return (
									<div key={gi} className="flex justify-center my-3">
										<span className="text-[11px] text-slate-500 bg-surface-elevated px-3 py-1 rounded-full border border-surface-border">
											{group[0].content}
										</span>
									</div>
								);
							return (
								<div
									key={gi}
									className={clsx(
										"flex gap-2 mt-3",
										isMine ? "flex-row-reverse" : "flex-row",
									)}>
									{!isMine && <Avatar name={group[0].senderName} size="xs" />}
									<div
										className={clsx(
											"flex flex-col gap-0.5 max-w-[78%]",
											isMine ? "items-end" : "items-start",
										)}>
										{!isMine && conv.type === "group" && (
											<span className="text-[11px] font-medium text-Swahilipot-400 px-1">
												{group[0].senderName}
											</span>
										)}
										{group.map((msg, mi) => (
											<div key={msg.id} className="w-full">
												{/* Voice message */}
												{msg.media?.some((m) => m.type === "voice") && (
													<div
														className={clsx(
															"flex items-center gap-2 px-3 py-2 rounded-2xl border max-w-[200px]",
															isMine
																? "bg-blue-600/20 border-blue-500/30"
																: "bg-surface-elevated border-surface-border",
														)}>
														<Volume2
															size={14}
															className="text-blue-400 shrink-0"
														/>
														<div className="flex-1 h-1 bg-slate-600 rounded-full">
															<div className="h-full bg-blue-400 rounded-full w-1/3" />
														</div>
														<span className="text-[10px] text-slate-400">
															0:00
														</span>
													</div>
												)}
												{/* Other media */}
												{msg.media
													?.filter((m) => m.type !== "voice")
													.map((m) => (
														<div key={m.id} className="mb-1">
															{m.type === "image" ? (
																<img
																	src={m.url}
																	alt={m.name}
																	className="rounded-xl max-w-[200px] max-h-[180px] object-cover"
																/>
															) : (
																<a
																	href={m.url}
																	target="_blank"
																	rel="noopener noreferrer"
																	className="flex items-center gap-2 bg-surface-elevated border border-surface-border rounded-xl px-3 py-2 hover:bg-surface-muted">
																	<FileText
																		size={14}
																		className="text-blue-400 shrink-0"
																	/>
																	<span className="text-xs text-slate-200 truncate max-w-[140px]">
																		{m.name}
																	</span>
																</a>
															)}
														</div>
													))}
												{/* Text */}
												{msg.content && (
													<div
														className={clsx(
															"px-3.5 py-2 rounded-2xl text-sm leading-relaxed",
															isMine
																? "bg-blue-600 text-white rounded-tr-sm"
																: "bg-surface-elevated text-slate-100 border border-surface-border rounded-tl-sm",
														)}>
														{msg.content}
													</div>
												)}
												{/* Timestamp + tick */}
												{mi === group.length - 1 && (
													<div
														className={clsx(
															"flex items-center gap-1 mt-0.5 px-0.5",
															isMine ? "flex-row-reverse" : "flex-row",
														)}>
														<span className="text-[10px] text-slate-600">
															{fmtClock(msg.timestamp)}
														</span>
														{isMine && <MsgStatus status={msg.status} />}
													</div>
												)}
											</div>
										))}
									</div>
								</div>
							);
						})}
					</div>
				)}
				{typingNames.length > 0 && (
					<div className="flex items-center gap-2 px-1 mt-2">
						<div className="flex gap-0.5">
							{[0, 1, 2].map((i) => (
								<span
									key={i}
									className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"
									style={{ animationDelay: `${i * 0.15}s` }}
								/>
							))}
						</div>
						<span className="text-[11px] text-slate-500 italic">
							{typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"}{" "}
							typing…
						</span>
					</div>
				)}
				<div ref={bottomRef} />
			</div>

			{/* Input area */}
			<div className="px-3 py-2.5 border-t border-surface-border shrink-0">
				<input
					type="file"
					ref={fileRef}
					onChange={handleFile}
					className="hidden"
					accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xlsx,.xls"
				/>

				{isRecording ? (
					<div className="flex items-center gap-3 bg-surface-elevated border border-red-500/30 rounded-full px-4 py-2">
						<span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
						<span className="text-sm text-slate-300 flex-1 font-mono">
							{fmtSecs(recSecs)}
						</span>
						<button
							onClick={stopRecording}
							className="text-red-400 hover:text-red-300 transition-colors"
							title="Stop recording">
							<MicOff size={16} />
						</button>
					</div>
				) : (
					<div className="flex items-center gap-2 bg-surface-elevated border border-surface-border rounded-full px-3 py-1.5 focus-within:border-blue-500/50 transition-colors">
						<button
							onClick={() => fileRef.current?.click()}
							className="text-slate-500 hover:text-slate-300 p-1 rounded-full transition-colors shrink-0"
							title="Attach file">
							<Paperclip size={15} />
						</button>
						<input
							value={input}
							onChange={handleInputChange}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									handleSend();
								}
							}}
							placeholder="Write a message…"
							className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none min-w-0"
						/>
						{input.trim() ? (
							<button
								onClick={handleSend}
								className="w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-colors shrink-0">
								<Send size={13} />
							</button>
						) : (
							<button
								onClick={startRecording}
								className="text-slate-500 hover:text-slate-300 p-1 rounded-full transition-colors shrink-0"
								title="Voice message">
								<Mic size={15} />
							</button>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

// ── Main ChatPanel ────────────────────────────────────────────────────────────
type View = "list" | "thread" | "new_msg" | "manage" | "settings";

export default function ChatPanel() {
	const { user } = useAuthStore();
	const {
		isChatOpen,
		toggleChat,
		getTotalUnread,
		conversations,
		loadConversations,
		isLoadingConversations,
		markConversationRead,
		getOrCreateConversation,
		setActiveConversation,
		onlineUsers,
		connectWS,
		disconnectWS,
	} = useChatStore();

	const [view, setView] = useState<View>("list");
	const [activeConvId, setActiveConvId] = useState<string | null>(null);
	const [filter, setFilter] = useState<FilterType>("focused");
	const [search, setSearch] = useState("");
	const [isExpanded, setIsExpanded] = useState(false);
	const [showDots, setShowDots] = useState(false);
	const [showFilterMenu, setShowFilterMenu] = useState(false);

	const dotsRef = useRef<HTMLDivElement>(null);
	const filterRef = useRef<HTMLDivElement>(null);
	const wsConnected = useRef(false);
	const totalUnread = getTotalUnread();

	// Coordinates with the AI Assistant panel so the two floating widgets
	// never overlap, on any screen size or combination of expand states.
	const { isMobile, rightOffset, requestExpand, requestOpenExclusive } =
		useFloatingDock("chat", {
			isOpen: isChatOpen,
			isExpanded,
			close: () => isChatOpen && toggleChat(),
			collapse: () => setIsExpanded(false),
			closedFootprintPx: 56, // the round FAB shown while closed
		});

	useEffect(() => {
		if (isChatOpen) requestOpenExclusive();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isChatOpen]);

	useEffect(() => {
		if (!isChatOpen) return;
		loadConversations();
		chatApi.updatePresence("online").catch(() => {});
		if (!wsConnected.current) {
			const token = useAuthStore.getState().accessToken;
			if (token) {
				connectWS(token);
				wsConnected.current = true;
			}
		}
		return () => {
			chatApi.updatePresence("away").catch(() => {});
		};
	}, [isChatOpen]);

	useEffect(() => {
		return () => {
			disconnectWS();
			wsConnected.current = false;
		};
	}, []);

	useEffect(() => {
		const fn = (e: MouseEvent) => {
			if (dotsRef.current && !dotsRef.current.contains(e.target as Node))
				setShowDots(false);
			if (filterRef.current && !filterRef.current.contains(e.target as Node))
				setShowFilterMenu(false);
		};
		document.addEventListener("mousedown", fn);
		return () => document.removeEventListener("mousedown", fn);
	}, []);

	const activeConv = conversations.find((c) => c.id === activeConvId) || null;

	const filteredConvs = conversations.filter((conv) => {
		if (search) {
			const nm = conv.type === "group" ? conv.name : conv.participants[0]?.name;
			if (!nm?.toLowerCase().includes(search.toLowerCase())) return false;
		}
		if (filter === "unread") return conv.unreadCount > 0;
		return true;
	});

	const goConv = (id: string) => {
		setActiveConvId(id);
		setActiveConversation(id);
		markConversationRead(id);
		setView("thread");
	};

	const handleStart = async (userId: string, name: string) => {
		const me = {
			id: String(user?.id),
			name: user?.full_name || user?.email || "",
			role: user?.role || "",
			email: user?.email || "",
			isOnline: true,
		};
		const convId = await getOrCreateConversation(me, {
			id: userId,
			name,
			role: "",
			email: "",
			isOnline: false,
		});
		if (convId) {
			await loadConversations();
			setActiveConvId(convId);
			setActiveConversation(convId);
			setView("thread");
		}
	};

	if (!isChatOpen) {
		return (
			<button
				onClick={toggleChat}
				className="fixed z-40 w-14 h-14 rounded-full bg-Swahilipot-600 hover:bg-Swahilipot-700 text-white flex items-center justify-center shadow-glow-blue transition-all hover:scale-105 active:scale-95"
				style={{
					right: "max(1.5rem, env(safe-area-inset-right))",
					bottom: "max(1.5rem, env(safe-area-inset-bottom))",
				}}>
				<MessageSquare size={22} />
				{totalUnread > 0 && (
					<span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
						{totalUnread > 99 ? "99+" : totalUnread}
					</span>
				)}
			</button>
		);
	}

	const showList =
		view === "list" ||
		view === "manage" ||
		view === "settings" ||
		view === "new_msg";
	const showThread = activeConv && (view === "thread" || isExpanded);

	return (
		<div
			style={
				isMobile
					? undefined
					: {
							right: rightOffset,
							bottom: "max(0px, env(safe-area-inset-bottom))",
						}
			}
			className={clsx(
				"fixed z-40 flex flex-col bg-surface-card border border-surface-border shadow-elevated overflow-hidden transition-all duration-300",
				isMobile
					? "inset-0 w-full h-full rounded-none"
					: clsx(
							"rounded-t-xl",
							isExpanded
								? "w-[min(760px,calc(100vw-3rem))] h-[82vh]"
								: "w-[340px] h-[500px]",
						),
			)}>
			{/* ── Topbar ── */}
			<div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-border shrink-0">
				<button
					onClick={() => {
						setView("list");
						setActiveConvId(null);
					}}
					className="font-semibold text-white text-sm hover:text-blue-400 transition-colors flex items-center gap-2">
					Messaging
					{totalUnread > 0 && (
						<span className="min-w-[18px] px-1 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
							{totalUnread}
						</span>
					)}
				</button>
				<div className="flex items-center gap-0.5">
					{/* New message */}
					<button
						onClick={() => setView("new_msg")}
						title="New message"
						className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-surface-elevated transition-colors">
						<Edit size={15} />
					</button>

					{/* ··· menu */}
					<div className="relative" ref={dotsRef}>
						<button
							onClick={() => setShowDots(!showDots)}
							className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-surface-elevated transition-colors">
							<MoreHorizontal size={15} />
						</button>
						{showDots && (
							<div className="absolute right-0 top-full mt-1 w-52 bg-surface-elevated border border-surface-border rounded-xl shadow-elevated z-50 py-1">
								<button
									onClick={() => {
										setView("manage");
										setShowDots(false);
									}}
									className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-left">
									<Users size={14} /> Manage conversations
								</button>
								<button
									onClick={() => {
										setView("settings");
										setShowDots(false);
									}}
									className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-left">
									<Settings size={14} /> Messaging settings
								</button>
								<button
									onClick={() => {
										chatApi.updatePresence("away").catch(() => {});
										setShowDots(false);
									}}
									className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-left">
									<VolumeX size={14} /> Set away message
								</button>
							</div>
						)}
					</div>

					{/* Expand */}
					{!isMobile && (
						<button
							onClick={() => {
								if (!isExpanded) requestExpand();
								setIsExpanded(!isExpanded);
							}}
							className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-surface-elevated transition-colors">
							{isExpanded ? <Minus size={15} /> : <Maximize2 size={15} />}
						</button>
					)}

					{/* Close */}
					<button
						onClick={toggleChat}
						className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-surface-elevated transition-colors">
						<X size={15} />
					</button>
				</div>
			</div>

			{/* ── Body ── */}
			<div className="flex flex-1 min-h-0">
				{/* Left: list / manage / settings / new_msg */}
				<div
					className={clsx(
						"flex flex-col",
						isExpanded
							? "w-[300px] shrink-0 border-r border-surface-border"
							: "flex-1",
						view === "thread" && !isExpanded ? "hidden" : "flex",
					)}>
					{/* LIST view */}
					{view === "list" && (
						<>
							{/* Search + filter */}
							<div className="px-3 py-2 border-b border-surface-border">
								<div className="relative">
									<Search
										size={13}
										className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
									/>
									<input
										value={search}
										onChange={(e) => setSearch(e.target.value)}
										placeholder="Search messages"
										className="w-full pl-8 pr-8 py-1.5 bg-surface-elevated border border-surface-border rounded-full text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500/50 transition-colors"
									/>
									<div
										className="absolute right-2.5 top-1/2 -translate-y-1/2"
										ref={filterRef}>
										<button
											onClick={() => setShowFilterMenu(!showFilterMenu)}
											className={clsx(
												"transition-colors",
												showFilterMenu
													? "text-blue-400"
													: "text-slate-500 hover:text-slate-300",
											)}>
											<Filter size={13} />
										</button>
										{showFilterMenu && (
											<div className="absolute right-0 top-full mt-1 w-36 bg-surface-elevated border border-surface-border rounded-xl shadow-elevated z-50 py-1">
												{(
													[
														["unread", "Unread"],
														["archived", "Archived"],
														["starred", "Starred"],
														["spam", "Spam"],
													] as [FilterType, string][]
												).map(([val, label]) => (
													<button
														key={val}
														onClick={() => {
															setFilter(filter === val ? "focused" : val);
															setShowFilterMenu(false);
														}}
														className={clsx(
															"w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
															filter === val
																? "text-blue-400"
																: "text-slate-300 hover:text-white hover:bg-white/5",
														)}>
														{filter === val && (
															<Check size={11} className="shrink-0" />
														)}
														<span className={filter !== val ? "ml-4" : ""}>
															{label}
														</span>
													</button>
												))}
											</div>
										)}
									</div>
								</div>
							</div>

							{/* Focused / Other tabs */}
							<div className="flex border-b border-surface-border shrink-0">
								{(["focused", "other"] as const).map((tab) => (
									<button
										key={tab}
										onClick={() => setFilter(tab)}
										className={clsx(
											"flex-1 py-2 text-sm font-medium capitalize transition-colors border-b-2",
											filter === tab
												? "text-white border-white"
												: "text-slate-500 border-transparent hover:text-slate-300",
										)}>
										{tab.charAt(0).toUpperCase() + tab.slice(1)}
									</button>
								))}
							</div>

							{/* Conv list */}
							<div className="flex-1 overflow-y-auto">
								{isLoadingConversations ? (
									<div className="flex justify-center py-8">
										<Loader2
											size={18}
											className="animate-spin text-slate-500"
										/>
									</div>
								) : filteredConvs.length === 0 ? (
									<div className="flex flex-col items-center justify-center h-full py-10 px-4 text-center">
										{filter === "other" ? (
											<>
												<div className="w-16 h-16 rounded-full bg-surface-elevated flex items-center justify-center mb-3">
													<MessageSquare size={24} className="text-slate-600" />
												</div>
												<p className="text-sm font-medium text-slate-300">
													No messages yet
												</p>
												<p className="text-xs text-slate-500 mt-1">
													Reach out and start a conversation to advance your
													career
												</p>
												<button
													onClick={() => setView("new_msg")}
													className="mt-4 px-5 py-1.5 border border-slate-500 rounded-full text-sm text-slate-300 hover:border-slate-300 hover:text-white transition-colors">
													Send a message
												</button>
											</>
										) : (
											<>
												<MessageSquare
													size={24}
													className="text-slate-600 mb-2"
												/>
												<p className="text-sm text-slate-500">
													No conversations yet
												</p>
												<button
													onClick={() => setView("new_msg")}
													className="mt-2 text-sm text-blue-400 hover:text-blue-300">
													Start one
												</button>
											</>
										)}
									</div>
								) : (
									filteredConvs.map((conv) => (
										<ConvRow
											key={conv.id}
											conv={conv}
											isActive={conv.id === activeConvId}
											showCheckbox={false}
											isChecked={false}
											onCheck={() => {}}
											onClick={() => goConv(conv.id)}
											onlineUsers={onlineUsers}
										/>
									))
								)}
							</div>
						</>
					)}

					{view === "manage" && (
						<ManagePanel
							conversations={conversations}
							onBack={() => setView("list")}
							onlineUsers={onlineUsers}
						/>
					)}

					{view === "settings" && (
						<SettingsPanel onBack={() => setView("list")} />
					)}

					{view === "new_msg" && (
						<NewMsgPanel onBack={() => setView("list")} onStart={handleStart} />
					)}
				</div>

				{/* Right: thread */}
				{showThread && (
					<div
						className={clsx(
							"flex flex-col",
							isExpanded ? "flex-1 min-w-0" : "flex-1",
						)}>
						<ThreadPanel
							conv={activeConv}
							onBack={() => setView("list")}
							onClose={toggleChat}
						/>
					</div>
				)}

				{/* Expanded empty state */}
				{isExpanded && !activeConv && (
					<div className="flex-1 flex flex-col items-center justify-center text-center px-8">
						<MessageSquare size={36} className="text-slate-600 mb-3" />
						<p className="text-sm font-medium text-slate-400">
							Select a conversation
						</p>
						<p className="text-xs text-slate-500 mt-1">or start a new one</p>
					</div>
				)}
			</div>
		</div>
	);
}
