// ActiveCallOverlay — Floating call UI shown during voice/video calls
import { Phone, Video, PhoneOff, Mic, MicOff, VideoOff } from "lucide-react";
import { useChatStore } from "../../stores/chatStore";
import { useChatApi } from "../../hooks/useChatApi";
import { useState } from "react";
import clsx from "clsx";

export function ActiveCallOverlay() {
	const { activeCall, callStatus, conversations } = useChatStore();
	const { endCall } = useChatApi();
	const [isMuted, setIsMuted] = useState(false);
	const [isVideoOff, setIsVideoOff] = useState(false);

	if (!activeCall) return null;

	const otherConv = conversations.find(
		(c) =>
			c.type === "direct" &&
			c.participants.some(
				(p) =>
					p.id === activeCall.recipientId || p.id === activeCall.initiatorId,
			),
	);
	const otherUser = otherConv?.participants[0];

	const getInitials = (name: string) =>
		name
			?.split(" ")
			.map((w) => w[0])
			.join("")
			.slice(0, 2)
			.toUpperCase() || "?";

	const statusLabels: Record<string, string> = {
		ringing: "Calling…",
		connected: "Connected",
		ended: "Call ended",
		missed: "Missed",
		declined: "Declined",
	};

	return (
		<div
			style={{
				right: "max(1.5rem, env(safe-area-inset-right))",
			}}
			className="fixed top-16 z-[60] w-64 max-w-[calc(100vw-2rem)] bg-surface-card border border-surface-border rounded-2xl shadow-elevated overflow-hidden animate-slide-up">
			{/* Header */}
			<div className="bg-gradient-to-br from-Swahilipot-600/30 to-purple-600/20 px-4 py-4 border-b border-surface-border">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-gradient-Nexus flex items-center justify-center text-sm font-bold text-white shrink-0">
						{otherUser ? getInitials(otherUser.name) : "?"}
					</div>
					<div>
						<p className="text-sm font-semibold text-white">
							{otherUser?.name || "Unknown"}
						</p>
						<p
							className={clsx(
								"text-[11px] font-medium",
								callStatus === "connected"
									? "text-green-400"
									: "text-amber-400",
							)}>
							{callStatus ? statusLabels[callStatus] : "Connecting…"}
						</p>
					</div>
					<div className="ml-auto">
						{activeCall.type === "voice" ? (
							<Phone size={16} className="text-Swahilipot-400" />
						) : (
							<Video size={16} className="text-Swahilipot-400" />
						)}
					</div>
				</div>

				{/* Ringing animation */}
				{callStatus === "ringing" && (
					<div className="flex justify-center mt-3 gap-1">
						{[0, 1, 2, 3].map((i) => (
							<span
								key={i}
								className="w-1.5 h-1.5 bg-Swahilipot-400 rounded-full animate-bounce"
								style={{ animationDelay: `${i * 0.15}s` }}
							/>
						))}
					</div>
				)}
			</div>

			{/* Controls */}
			<div className="flex items-center justify-center gap-3 p-4">
				{/* Mute */}
				<button
					onClick={() => setIsMuted(!isMuted)}
					className={clsx(
						"w-10 h-10 rounded-full flex items-center justify-center transition-all",
						isMuted
							? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
							: "bg-surface-elevated text-slate-400 hover:text-white border border-surface-border",
					)}
					title={isMuted ? "Unmute" : "Mute"}>
					{isMuted ? <MicOff size={16} /> : <Mic size={16} />}
				</button>

				{/* End call */}
				<button
					onClick={() => activeCall && endCall(activeCall.id)}
					className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-glow-red transition-all hover:scale-105 active:scale-95"
					title="End call">
					<PhoneOff size={18} />
				</button>

				{/* Video toggle (video calls only) */}
				{activeCall.type === "video" && (
					<button
						onClick={() => setIsVideoOff(!isVideoOff)}
						className={clsx(
							"w-10 h-10 rounded-full flex items-center justify-center transition-all",
							isVideoOff
								? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
								: "bg-surface-elevated text-slate-400 hover:text-white border border-surface-border",
						)}
						title={isVideoOff ? "Turn video on" : "Turn video off"}>
						{isVideoOff ? <VideoOff size={16} /> : <Video size={16} />}
					</button>
				)}
			</div>
		</div>
	);
}
