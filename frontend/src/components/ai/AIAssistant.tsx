// ── Nexus AI Assistant ─────────────────────────────────────────────────────────
// Matches the Nexus Chat system's exact conventions (ChatPanel.tsx pattern):
// fixed bottom-0, z-40, same width/height proportions, same ConvRow-style list.
//
// Positioning is delegated to useFloatingDock() (hooks/useFloatingDock.ts),
// which docks this panel to the left of whatever space the Messaging panel
// currently occupies — so the two floating panels never overlap, regardless
// of which is open/expanded, or stack full-screen on mobile instead.
//
// Two exports:
//   - AITopbarButton  → small icon button for the topbar (next to ChatTopbarButton)
//   - AIPanel         → floating chat panel (rendered once, near ChatPanel)
//
// Usage in AppLayout.tsx:
//   import { AITopbarButton, AIPanel } from "../ai/AIAssistant";
//   <ChatTopbarButton />
//   <AITopbarButton />          ← add next to it in the topbar
//   <ChatPanel />
//   <AIPanel />                  ← add next to it, outside <header>

import React, {
	useRef,
	useEffect,
	useState,
	useCallback,
	KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
	Sparkles,
	X,
	Send,
	Plus,
	Square,
	Paperclip,
	ImageOff,
	Maximize2,
	Minus,
	MessageSquare,
	RotateCcw,
} from "lucide-react";
import { useAIAssistant } from "../../hooks/useAIAssistant";
import { useFloatingDock } from "../../hooks/Usefloatingdock";
import { useAuthStore } from "../../services/api";
import { fileToCompressedDataUrl } from "../../services/aiService";
import {
	MAX_IMAGES_PER_MESSAGE,
	MAX_IMAGE_SIZE_BYTES,
	ACCEPTED_IMAGE_TYPES,
} from "../../types/ai";
import type { AIMessageImage } from "../../types/ai";
import clsx from "clsx";

// ── Suggestion chips ─────────────────────────────────────────────────────────
const SUGGESTIONS = [
	"Summarise today's attendance",
	"Draft a department update email",
	"What tasks are overdue?",
	"Explain the internship workflow",
];

// ── Shared open state via tiny module-level event bus ────────────────────────
type Listener = () => void;
const listeners = new Set<Listener>();
let _isOpen = false;

function setOpen(value: boolean) {
	_isOpen = value;
	listeners.forEach((l) => l());
}
function useSharedOpen() {
	const [open, setLocal] = useState(_isOpen);
	useEffect(() => {
		const fn = () => setLocal(_isOpen);
		listeners.add(fn);
		return () => {
			listeners.delete(fn);
		};
	}, []);
	return open;
}

// ── Topbar button — matches ChatTopbarButton's exact style ───────────────────
export const AITopbarButton: React.FC = () => {
	const isOpen = useSharedOpen();
	return (
		<button
			onClick={() => setOpen(!isOpen)}
			className="relative btn-icon btn-secondary"
			title="Nexus AI Assistant"
			aria-label="Toggle AI Assistant">
			<Sparkles size={16} className={isOpen ? "text-Swahilipot-400" : ""} />
		</button>
	);
};

// ── Typing dots ───────────────────────────────────────────────────────────────
const TypingDots: React.FC = () => (
	<div className="flex items-center gap-1 py-1">
		{[0, 1, 2].map((i) => (
			<span
				key={i}
				className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce"
				style={{ animationDelay: `${i * 0.15}s`, animationDuration: "1.2s" }}
			/>
		))}
	</div>
);

// ── Conversation row — mirrors ChatPanel's ConvRow exactly ────────────────────
function ConvRow({
	title,
	subtitle,
	time,
	isActive,
	onClick,
}: {
	title: string;
	subtitle: string;
	time: string;
	isActive: boolean;
	onClick: () => void;
}) {
	return (
		<div
			onClick={onClick}
			className={clsx(
				"flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
				isActive ? "bg-white/8" : "hover:bg-white/5",
			)}>
			<div className="w-10 h-10 rounded-full bg-gradient-Nexus flex items-center justify-center text-sm font-semibold text-white shrink-0">
				<Sparkles size={15} />
			</div>
			<div className="flex-1 min-w-0">
				<div className="flex items-center justify-between mb-0.5">
					<span className="text-sm font-medium text-slate-200 truncate">
						{title}
					</span>
					<span className="text-[11px] text-slate-500 shrink-0 ml-1">
						{time}
					</span>
				</div>
				<p className="text-[12px] text-slate-400 truncate">{subtitle}</p>
			</div>
		</div>
	);
}

// ── Floating panel ────────────────────────────────────────────────────────────
export const AIPanel: React.FC = () => {
	const isOpen = useSharedOpen();
	const user = useAuthStore((s) => s.user);

	const {
		conversations,
		activeConversation,
		status,
		error,
		startNew,
		selectConversation,
		sendMessage,
		retryMessage,
		clearError,
		cancelRequest,
	} = useAIAssistant();

	const [isExpanded, setIsExpanded] = useState(false);
	const [input, setInput] = useState("");
	const [pendingImages, setPendingImages] = useState<AIMessageImage[]>([]);
	const [imageError, setImageError] = useState<string | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const endRef = useRef<HTMLDivElement>(null);

	// Coordinates with the Messaging panel so the two floating widgets never
	// overlap, on any screen size or combination of expand states.
	const { isMobile, rightOffset, requestExpand, requestOpenExclusive } =
		useFloatingDock("ai", {
			isOpen,
			isExpanded,
			close: () => setOpen(false),
			collapse: () => setIsExpanded(false),
		});

	useEffect(() => {
		if (isOpen) requestOpenExclusive();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen]);

	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [activeConversation?.messages, status]);

	useEffect(() => {
		if (isOpen && activeConversation)
			setTimeout(() => inputRef.current?.focus(), 80);
	}, [isOpen, activeConversation]);

	const handleInput = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			setInput(e.target.value);
			if (inputRef.current) {
				inputRef.current.style.height = "auto";
				inputRef.current.style.height =
					Math.min(inputRef.current.scrollHeight, 110) + "px";
			}
		},
		[],
	);

	// ── Image handling ──────────────────────────────────────────────────────────
	const addImages = useCallback(
		async (files: FileList | File[]) => {
			setImageError(null);
			const fileArr = Array.from(files);
			const remaining = MAX_IMAGES_PER_MESSAGE - pendingImages.length;
			if (remaining <= 0) {
				setImageError(
					`You can attach up to ${MAX_IMAGES_PER_MESSAGE} images per message.`,
				);
				return;
			}
			const toProcess = fileArr.slice(0, remaining);
			if (fileArr.length > remaining) {
				setImageError(
					`Only ${remaining} more image${remaining === 1 ? "" : "s"} can be added.`,
				);
			}
			for (const file of toProcess) {
				if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
					setImageError(`"${file.name}" isn't a supported image type.`);
					continue;
				}
				if (file.size > MAX_IMAGE_SIZE_BYTES) {
					setImageError(
						`"${file.name}" is too large (max ${Math.round(MAX_IMAGE_SIZE_BYTES / 1024 / 1024)}MB).`,
					);
					continue;
				}
				try {
					const dataUrl = await fileToCompressedDataUrl(file);
					setPendingImages((prev) => [
						...prev,
						{ id: crypto.randomUUID(), dataUrl, name: file.name },
					]);
				} catch {
					setImageError(`Could not process "${file.name}".`);
				}
			}
		},
		[pendingImages.length],
	);

	const removeImage = useCallback((id: string) => {
		setPendingImages((prev) => prev.filter((img) => img.id !== id));
	}, []);

	const handleFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			if (e.target.files?.length) addImages(e.target.files);
			e.target.value = "";
		},
		[addImages],
	);

	const handlePaste = useCallback(
		(e: React.ClipboardEvent) => {
			const items = Array.from(e.clipboardData.items);
			const imageFiles = items
				.filter((item) => item.type.startsWith("image/"))
				.map((item) => item.getAsFile())
				.filter((f): f is File => f !== null);
			if (imageFiles.length > 0) {
				e.preventDefault();
				addImages(imageFiles);
			}
		},
		[addImages],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setIsDragging(false);
			if (e.dataTransfer.files?.length) {
				const imageFiles = Array.from(e.dataTransfer.files).filter((f) =>
					f.type.startsWith("image/"),
				);
				if (imageFiles.length > 0) addImages(imageFiles);
			}
		},
		[addImages],
	);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(true);
	}, []);
	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
	}, []);

	const handleSend = useCallback(async () => {
		const text = input.trim();
		if ((!text && pendingImages.length === 0) || status === "thinking") return;
		const imagesToSend = pendingImages;
		setInput("");
		setPendingImages([]);
		setImageError(null);
		if (inputRef.current) inputRef.current.style.height = "auto";
		await sendMessage(text, imagesToSend);
		inputRef.current?.focus();
	}, [input, pendingImages, sendMessage, status]);

	const handleKey = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSend();
			}
		},
		[handleSend],
	);

	const isThinking = status === "thinking";
	const canSend =
		(input.trim().length > 0 || pendingImages.length > 0) && !isThinking;
	const initials =
		`${user?.first_name?.[0] ?? ""}${user?.last_name?.[0] ?? ""}`.toUpperCase();

	const fmtTime = (d: Date) =>
		new Date(d).toLocaleTimeString("en-KE", {
			hour: "2-digit",
			minute: "2-digit",
		});
	const fmtListTime = (d: Date) => {
		const now = new Date();
		const diffMin = Math.round((now.getTime() - new Date(d).getTime()) / 60000);
		if (diffMin < 1) return "now";
		if (diffMin < 60) return `${diffMin}m`;
		if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h`;
		return new Date(d).toLocaleDateString([], {
			month: "short",
			day: "numeric",
		});
	};

	// ── Collapsed trigger — only render if AppLayout doesn't already show
	// AITopbarButton. We rely solely on the topbar button to toggle, so when
	// closed this component renders nothing (no second floating bubble).
	if (!isOpen) return null;

	const showList = !activeConversation;

	return createPortal(
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
				"fixed z-40 flex flex-col bg-surface-card border border-surface-border",
				"shadow-elevated overflow-hidden transition-all duration-300",
				isMobile
					? "inset-0 w-full h-full rounded-none"
					: clsx(
							"bottom-0 rounded-t-xl",
							isExpanded
								? "w-[min(760px,calc(100vw-3rem))] h-[82vh]"
								: "w-[340px] h-[500px]",
						),
			)}
			role="dialog"
			aria-label="Nexus AI Assistant"
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}>
			{/* Drag overlay */}
			{isDragging && (
				<div
					className="absolute inset-0 z-50 bg-Swahilipot-600/10 border-2 border-dashed border-Swahilipot-500/50
                         flex items-center justify-center backdrop-blur-sm pointer-events-none">
					<div className="flex flex-col items-center gap-2 text-Swahilipot-400">
						<Paperclip size={24} />
						<p className="text-xs font-medium">Drop images to attach</p>
					</div>
				</div>
			)}

			{/* ── Topbar — matches ChatPanel's topbar exactly ── */}
			<div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-border shrink-0">
				<button
					onClick={startNew}
					className="font-semibold text-white text-sm hover:text-Swahilipot-400 transition-colors flex items-center gap-2">
					<Sparkles size={14} className="text-Swahilipot-400" />
					Nexus AI
				</button>
				<div className="flex items-center gap-0.5">
					{isThinking && (
						<button
							onClick={cancelRequest}
							title="Stop generating"
							className="p-1.5 rounded text-red-400 hover:text-red-300 hover:bg-surface-elevated transition-colors">
							<Square size={13} fill="currentColor" />
						</button>
					)}
					<button
						onClick={startNew}
						title="New chat"
						className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-surface-elevated transition-colors">
						<Plus size={15} />
					</button>
					{!isMobile && (
						<button
							onClick={() => {
								if (!isExpanded) requestExpand();
								setIsExpanded(!isExpanded);
							}}
							title={isExpanded ? "Collapse" : "Expand"}
							className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-surface-elevated transition-colors">
							{isExpanded ? <Minus size={15} /> : <Maximize2 size={15} />}
						</button>
					)}
					<button
						onClick={() => setOpen(false)}
						title="Close"
						className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-surface-elevated transition-colors">
						<X size={15} />
					</button>
				</div>
			</div>

			{/* ── Body ── */}
			<div className="flex flex-1 min-h-0">
				{/* Left: conversation list (only shown standalone when collapsed + no active conv,
            or as a sidebar when expanded) */}
				{(isExpanded || showList) && (
					<div
						className={clsx(
							"flex flex-col",
							isExpanded
								? "w-[260px] shrink-0 border-r border-surface-border"
								: "flex-1",
							!isExpanded && activeConversation ? "hidden" : "flex",
						)}>
						<div className="flex-1 overflow-y-auto">
							{conversations.length === 0 ? (
								<div className="flex flex-col items-center justify-center h-full py-10 px-4 text-center">
									<div className="w-12 h-12 rounded-xl bg-gradient-Nexus flex items-center justify-center mb-3">
										<Sparkles size={20} className="text-white" />
									</div>
									<p className="text-sm font-medium text-slate-300">
										No conversations yet
									</p>
									<p className="text-xs text-slate-500 mt-1">
										Start chatting with Nexus AI
									</p>
								</div>
							) : (
								conversations.map((c) => (
									<ConvRow
										key={c.id}
										title={c.title}
										subtitle={
											c.messages[c.messages.length - 1]?.content ||
											"No messages"
										}
										time={fmtListTime(c.updatedAt)}
										isActive={c.id === activeConversation?.id}
										onClick={() => selectConversation(c.id)}
									/>
								))
							)}
						</div>
					</div>
				)}

				{/* Right: active thread */}
				{(isExpanded || activeConversation) && (
					<div
						className={clsx(
							"flex flex-col",
							isExpanded ? "flex-1 min-w-0" : "flex-1",
						)}>
						{/* Messages */}
						<div
							className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
							role="log"
							aria-live="polite">
							{!activeConversation ? (
								<div className="h-full flex flex-col items-center justify-center text-center gap-2.5 px-5">
									<div className="w-11 h-11 rounded-xl bg-gradient-Nexus flex items-center justify-center mb-1">
										<Sparkles size={20} className="text-white" />
									</div>
									<p className="text-sm font-medium text-white">
										Hi{user ? `, ${user.first_name}` : ""}! I'm Nexus AI
									</p>
									<p className="text-xs text-slate-500 max-w-xs leading-relaxed">
										Ask me anything, draft emails, analyse data, or attach a
										screenshot.
									</p>
									<div className="flex flex-wrap gap-1.5 justify-center mt-2">
										{SUGGESTIONS.map((s) => (
											<button
												key={s}
												onClick={() => sendMessage(s)}
												disabled={isThinking}
												className="px-3 py-1.5 rounded-full text-[11px] text-Swahilipot-400
                                   bg-Swahilipot-600/10 border border-Swahilipot-500/25
                                   hover:bg-Swahilipot-600/20 transition-colors disabled:opacity-40">
												{s}
											</button>
										))}
									</div>
								</div>
							) : (
								<>
									{activeConversation.messages.map((msg) => {
										const isUser = msg.role === "user";
										const isFailed = !!msg.failed;
										return (
											<div
												key={msg.id}
												className={`flex gap-2 items-end ${isUser ? "flex-row-reverse" : ""}`}>
												<div
													className={clsx(
														"w-7 h-7 min-w-[28px] rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
														isUser
															? "bg-gradient-Nexus text-white"
															: "bg-surface-elevated text-slate-400",
													)}>
													{isUser ? initials : <Sparkles size={13} />}
												</div>
												<div
													className={clsx(
														"flex flex-col gap-1",
														isUser ? "items-end" : "items-start",
														"max-w-[78%]",
													)}>
													<div
														className={clsx(
															"px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap break-words",
															isFailed
																? "bg-red-950/40 border border-red-500/40 text-slate-200 rounded-br-md"
																: isUser
																	? "bg-gradient-Nexus text-white rounded-br-md"
																	: "bg-surface-elevated border border-surface-border text-slate-200 rounded-bl-md",
														)}>
														{msg.images && msg.images.length > 0 && (
															<div
																className={`flex flex-wrap gap-1.5 ${msg.content ? "mb-2" : ""}`}>
																{msg.images.map((img) =>
																	img.dataUrl ? (
																		<img
																			key={img.id}
																			src={img.dataUrl}
																			alt={img.name}
																			className="w-16 h-16 object-cover rounded-lg border border-white/15"
																		/>
																	) : (
																		<div
																			key={img.id}
																			className="w-16 h-16 rounded-lg border border-white/15 bg-black/20
                                      flex flex-col items-center justify-center gap-1 text-white/50">
																			<ImageOff size={14} />
																		</div>
																	),
																)}
															</div>
														)}
														{msg.content}
														<div
															className={`text-[10px] mt-1 opacity-50 text-right ${isUser && !isFailed ? "text-white" : "text-slate-400"}`}>
															{fmtTime(msg.timestamp)}
														</div>
													</div>
													{isFailed && (
														<button
															onClick={() => retryMessage(msg.id)}
															disabled={isThinking}
															className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300
                                         disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-1">
															<RotateCcw size={11} />
															Failed to send · Retry
														</button>
													)}
												</div>
											</div>
										);
									})}
									{isThinking && (
										<div className="flex gap-2 items-end">
											<div className="w-7 h-7 min-w-[28px] rounded-full bg-surface-elevated text-slate-400 flex items-center justify-center shrink-0">
												<Sparkles size={13} />
											</div>
											<div className="bg-surface-elevated border border-surface-border rounded-2xl rounded-bl-md px-3.5 py-2.5">
												<TypingDots />
											</div>
										</div>
									)}
								</>
							)}
							<div ref={endRef} />
						</div>

						{/* Errors */}
						{error && (
							<div className="mx-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-900/20 border border-red-500/30 text-red-400 text-xs shrink-0">
								<span className="flex-1">{error}</span>
								<button
									onClick={clearError}
									className="text-red-400 hover:text-red-300 text-base leading-none">
									×
								</button>
							</div>
						)}
						{imageError && (
							<div className="mx-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-500/30 text-amber-400 text-xs shrink-0">
								<span className="flex-1">{imageError}</span>
								<button
									onClick={() => setImageError(null)}
									className="text-amber-400 hover:text-amber-300 text-base leading-none">
									×
								</button>
							</div>
						)}

						{/* Pending image previews */}
						{pendingImages.length > 0 && (
							<div className="flex gap-2 px-3 pt-2 pb-1 flex-wrap shrink-0">
								{pendingImages.map((img) => (
									<div key={img.id} className="relative group">
										<img
											src={img.dataUrl}
											alt={img.name}
											className="w-12 h-12 object-cover rounded-lg border border-surface-border"
										/>
										<button
											onClick={() => removeImage(img.id)}
											className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white
                                 flex items-center justify-center shadow-md opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
											<X size={11} />
										</button>
									</div>
								))}
							</div>
						)}

						{/* Input */}
						<div className="flex items-end gap-2 px-3 py-2.5 border-t border-surface-border shrink-0">
							<input
								ref={fileInputRef}
								type="file"
								accept={ACCEPTED_IMAGE_TYPES.join(",")}
								multiple
								onChange={handleFileSelect}
								className="hidden"
								aria-hidden="true"
							/>
							<button
								onClick={() => fileInputRef.current?.click()}
								disabled={
									isThinking || pendingImages.length >= MAX_IMAGES_PER_MESSAGE
								}
								title="Attach image"
								className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center transition-colors
                           text-slate-400 hover:text-Swahilipot-400 hover:bg-surface-elevated disabled:opacity-40">
								<Paperclip size={15} />
							</button>
							<textarea
								ref={inputRef}
								value={input}
								onChange={handleInput}
								onKeyDown={handleKey}
								onPaste={handlePaste}
								placeholder="Ask Nexus AI…"
								rows={1}
								disabled={isThinking}
								aria-label="Message input"
								className="flex-1 resize-none rounded-xl border border-surface-border bg-surface-elevated
                           text-white placeholder:text-slate-500 text-[13px] px-3 py-2
                           min-h-[36px] max-h-[110px] leading-relaxed outline-none
                           focus:border-Swahilipot-500/50 focus:ring-2 focus:ring-Swahilipot-500/15
                           disabled:opacity-60 transition-colors"
							/>
							<button
								onClick={handleSend}
								disabled={!canSend}
								aria-label="Send"
								className={clsx(
									"w-9 h-9 shrink-0 rounded-xl flex items-center justify-center transition-all",
									canSend
										? "bg-gradient-Nexus text-white shadow-glow-blue hover:opacity-90"
										: "bg-surface-elevated text-slate-600 cursor-not-allowed",
								)}>
								<Send size={14} />
							</button>
						</div>
					</div>
				)}
			</div>
		</div>,
		document.body,
	);
};

export default AIPanel;
