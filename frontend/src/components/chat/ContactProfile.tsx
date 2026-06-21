// ContactProfile — Right panel: role, dept, email, shared media
import { useState } from "react";
import { X, FileText, Image, Film, Music, ExternalLink } from "lucide-react";
import { useChatStore, type Participant } from "../../stores/chatStore";
import clsx from "clsx";

interface Props {
	participant: Participant;
	conversationId: string;
	onClose: () => void;
}

const DEMO_SHARED_MEDIA = [
	{
		id: "sm1",
		type: "document" as const,
		name: "Q2_Report.pdf",
		size: 412000,
		sharedAt: "2 days ago",
		url: "#",
	},
	{
		id: "sm2",
		type: "image" as const,
		name: "equipment_photo.jpg",
		size: 1240000,
		sharedAt: "3 days ago",
		url: "#",
	},
	{
		id: "sm3",
		type: "document" as const,
		name: "bulletin_draft.docx",
		size: 87000,
		sharedAt: "Last week",
		url: "#",
	},
	{
		id: "sm4",
		type: "image" as const,
		name: "studio_setup.png",
		size: 2100000,
		sharedAt: "Last week",
		url: "#",
	},
];

const typeIcons: Record<string, any> = {
	document: FileText,
	image: Image,
	video: Film,
	audio: Music,
};

const typeColors: Record<string, string> = {
	document: "text-amber-400 bg-amber-500/10",
	image: "text-blue-400 bg-blue-500/10",
	video: "text-purple-400 bg-purple-500/10",
	audio: "text-green-400 bg-green-500/10",
};

export function ContactProfile({
	participant,
	conversationId,
	onClose,
}: Props) {
	const [activeMediaTab, setActiveMediaTab] = useState<
		"all" | "images" | "docs"
	>("all");
	const { messages } = useChatStore();

	// Gather shared media from conversation messages
	const threadMsgs = messages[conversationId] || [];
	const sharedFromThread = threadMsgs
		.flatMap((m) => m.media || [])
		.map((m) => ({ ...m, sharedAt: "Recently", url: m.url || "#" }));

	const allMedia = [...sharedFromThread, ...DEMO_SHARED_MEDIA];
	const filteredMedia = allMedia.filter((m) => {
		if (activeMediaTab === "images") return m.type === "image";
		if (activeMediaTab === "docs") return m.type === "document";
		return true;
	});

	const getInitials = (name: string) =>
		name
			.split(" ")
			.map((w) => w[0])
			.join("")
			.slice(0, 2)
			.toUpperCase();

	const formatSize = (bytes: number) => {
		if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
		return `${Math.round(bytes / 1024)} KB`;
	};

	return (
		<div className="flex flex-col h-full bg-surface-card">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
				<span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
					Profile
				</span>
				<button onClick={onClose} className="btn-ghost btn-icon p-1">
					<X size={14} />
				</button>
			</div>

			<div className="flex-1 overflow-y-auto">
				{/* Avatar + name */}
				<div className="flex flex-col items-center py-6 px-4 border-b border-surface-border gap-3">
					<div className="relative">
						<div className="w-16 h-16 rounded-2xl bg-gradient-Nexus flex items-center justify-center text-xl font-bold text-white shadow-glow-blue">
							{getInitials(participant.name)}
						</div>
						<span
							className={clsx(
								"absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-surface-card",
								participant.isOnline ? "bg-green-500" : "bg-slate-600",
							)}
						/>
					</div>
					<div className="text-center">
						<h3 className="text-sm font-bold text-white">{participant.name}</h3>
						<p className="text-xs text-Swahilipot-400 font-medium mt-0.5">
							{participant.role}
						</p>
					</div>
					<div
						className={clsx(
							"badge text-xs",
							participant.isOnline ? "badge-green" : "badge-slate",
						)}>
						{participant.isOnline ? "● Online" : "● Offline"}
					</div>
				</div>

				{/* Info fields - role, dept, email only (no DOB/phone per spec) */}
				<div className="px-4 py-4 space-y-3 border-b border-surface-border">
					<InfoRow label="Role" value={participant.role} />
					{participant.department && (
						<InfoRow label="Department" value={participant.department} />
					)}
					<InfoRow label="Email" value={participant.email} isEmail />
				</div>

				{/* Shared Media */}
				<div className="px-4 py-4">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-3">
						Shared Media
					</p>

					{/* Media tabs */}
					<div className="flex gap-1 mb-3">
						{(["all", "images", "docs"] as const).map((tab) => (
							<button
								key={tab}
								onClick={() => setActiveMediaTab(tab)}
								className={clsx(
									"px-2.5 py-1 text-[11px] rounded-lg font-medium transition-all capitalize",
									activeMediaTab === tab
										? "bg-Swahilipot-600/20 text-Swahilipot-400 border border-Swahilipot-500/30"
										: "text-slate-500 hover:text-slate-300",
								)}>
								{tab === "all"
									? "All Files"
									: tab === "images"
										? "Images"
										: "Docs"}
							</button>
						))}
					</div>

					{/* Media list */}
					<div className="space-y-2">
						{filteredMedia.length === 0 ? (
							<p className="text-xs text-slate-600 text-center py-4">
								No files shared yet
							</p>
						) : (
							filteredMedia.map((item) => {
								const Icon = typeIcons[item.type] || FileText;
								const color = typeColors[item.type] || typeColors.document;
								return (
									<div
										key={item.id}
										className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-surface-elevated transition-colors group cursor-pointer">
										<div
											className={clsx(
												"w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
												color,
											)}>
											<Icon size={14} />
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-xs text-slate-200 truncate">
												{item.name}
											</p>
											<p className="text-[10px] text-slate-600">
												{formatSize(item.size)} · {item.sharedAt}
											</p>
										</div>
										<a
											href={item.url}
											className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-slate-500 hover:text-slate-300 transition-all"
											title="Download">
											<ExternalLink size={12} />
										</a>
									</div>
								);
							})
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

function InfoRow({
	label,
	value,
	isEmail,
}: {
	label: string;
	value: string;
	isEmail?: boolean;
}) {
	return (
		<div>
			<p className="text-[10px] text-slate-600 uppercase tracking-wide mb-0.5">
				{label}
			</p>
			{isEmail ? (
				<a
					href={`mailto:${value}`}
					className="text-xs text-Swahilipot-400 hover:underline truncate block">
					{value}
				</a>
			) : (
				<p className="text-xs text-slate-300 truncate">{value}</p>
			)}
		</div>
	);
}
