// Nexus — Notifications Centre
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
	Bell,
	CheckCheck,
	Radio,
	Package,
	ClipboardList,
	AlertTriangle,
	Star,
	Wifi,
	MessageSquare,
	Zap,
	Info,
	Eye,
	X,
} from "lucide-react";
import { notificationsApi } from "../../services/api";
import toast from "react-hot-toast";
import clsx from "clsx";

// ─────────────────────────────────────────────
// Type config
// ─────────────────────────────────────────────
const TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
	task_assigned: {
		icon: ClipboardList,
		color: "text-blue-400",
		bg: "bg-blue-500/10",
	},
	task_reviewed: {
		icon: ClipboardList,
		color: "text-green-400",
		bg: "bg-green-500/10",
	},
	task_overdue: {
		icon: ClipboardList,
		color: "text-red-400",
		bg: "bg-red-500/10",
	},
	fm_outage: { icon: Radio, color: "text-red-400", bg: "bg-red-500/10" },
	fm_restored: { icon: Radio, color: "text-green-400", bg: "bg-green-500/10" },
	emergency_alert: {
		icon: AlertTriangle,
		color: "text-red-400",
		bg: "bg-red-500/10",
	},
	checkout_update: {
		icon: Package,
		color: "text-amber-400",
		bg: "bg-amber-500/10",
	},
	evaluation_due: {
		icon: Star,
		color: "text-yellow-400",
		bg: "bg-yellow-500/10",
	},
	certificate_issued: {
		icon: Zap,
		color: "text-nexus-400",
		bg: "bg-nexus-500/10",
	},
	wifi_decision: { icon: Wifi, color: "text-cyan-400", bg: "bg-cyan-500/10" },
	ticket_update: {
		icon: MessageSquare,
		color: "text-purple-400",
		bg: "bg-purple-500/10",
	},
	geofence_violation: {
		icon: AlertTriangle,
		color: "text-amber-400",
		bg: "bg-amber-500/10",
	},
	reminder: { icon: Bell, color: "text-blue-400", bg: "bg-blue-500/10" },
	general: { icon: Info, color: "text-slate-400", bg: "bg-slate-500/10" },
};

// ─────────────────────────────────────────────
// Detail modal
// ─────────────────────────────────────────────
function NotificationDetailModal({ notification: n, onClose, onRead }: any) {
	const config = TYPE_CONFIG[n.notification_type] || TYPE_CONFIG.general;
	const Icon = config.icon;

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box max-w-lg" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<div className="flex items-center gap-3">
						<div
							className={clsx(
								"w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
								config.bg,
							)}>
							<Icon size={18} className={config.color} />
						</div>
						<div>
							<h3 className="font-semibold text-white text-sm leading-snug">
								{n.title}
							</h3>
							<span className="text-[10px] text-slate-500 capitalize">
								{(n.notification_type || "general").replace(/_/g, " ")}
							</span>
						</div>
					</div>
					<button
						onClick={onClose}
						className="text-slate-400 hover:text-white ml-4">
						<X size={16} />
					</button>
				</div>
				<div className="modal-body space-y-3">
					<p className="text-sm text-slate-300 leading-relaxed">{n.body}</p>
					{n.link && (
						<a href={n.link} className="text-xs text-nexus-400 hover:underline">
							View related item →
						</a>
					)}
					<p className="text-xs text-slate-600">
						{formatDistanceToNow(parseISO(n.created_at), { addSuffix: true })}
					</p>
				</div>
				<div className="modal-footer">
					<button onClick={onClose} className="btn-secondary">
						Close
					</button>
					{!n.is_read && (
						<button
							onClick={() => {
								onRead();
								onClose();
							}}
							className="btn-primary">
							<Eye size={13} /> Mark as read
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────
// Notification card
// ─────────────────────────────────────────────
function NotificationCard({ notification: n, onRead, onView, urgent }: any) {
	const config = TYPE_CONFIG[n.notification_type] || TYPE_CONFIG.general;
	const Icon = config.icon;
	const isRead = n.is_read ?? n.read;

	return (
		<div
			className={clsx(
				"flex items-start gap-3 p-4 rounded-xl border transition-all group",
				{
					"border-red-500/40 bg-red-900/10": urgent && !isRead,
					"border-nexus-500/20 bg-nexus-900/10": !urgent && !isRead,
					"border-surface-border bg-surface-card opacity-60": isRead,
				},
			)}>
			{/* Icon */}
			<div
				className={clsx(
					"w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
					config.bg,
				)}>
				<Icon size={16} className={config.color} />
			</div>

			{/* Body */}
			<div className="flex-1 min-w-0">
				<div className="flex items-start justify-between gap-2">
					<p
						className={clsx(
							"text-sm font-semibold leading-snug",
							isRead ? "text-slate-400" : "text-white",
						)}>
						{n.title}
					</p>
					{!isRead && (
						<div className="w-2 h-2 rounded-full bg-nexus-400 shrink-0 mt-1.5 flex-none" />
					)}
				</div>
				<p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
				<div className="flex items-center gap-3 mt-2">
					<span className="text-[10px] text-slate-600">
						{formatDistanceToNow(parseISO(n.created_at), { addSuffix: true })}
					</span>
					{n.notification_type && (
						<span className="text-[10px] text-slate-600 capitalize">
							{n.notification_type.replace(/_/g, " ")}
						</span>
					)}
				</div>
			</div>

			{/* Actions — always visible, not hover-only */}
			<div className="flex items-center gap-1 shrink-0 self-center">
				<button
					onClick={onView}
					title="View details"
					className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-elevated transition-colors">
					<Eye size={14} />
				</button>
				{!isRead && (
					<button
						onClick={onRead}
						title="Mark as read"
						className="p-1.5 rounded-lg text-slate-500 hover:text-nexus-400 hover:bg-nexus-500/10 transition-colors">
						<CheckCheck size={14} />
					</button>
				)}
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────
export default function NotificationsPage() {
	const qc = useQueryClient();
	const [filter, setFilter] = useState<"all" | "unread" | "urgent">("all");
	const [typeFilter, setTypeFilter] = useState("");
	const [selectedNotification, setSelectedNotification] = useState<any>(null);

	const { data: rawNotifications = [], isLoading } = useQuery({
		queryKey: ["notifications", filter, typeFilter],
		queryFn: () =>
			notificationsApi
				.list({
					unread: filter === "unread" ? "true" : undefined,
					urgent: filter === "urgent" ? "true" : undefined,
					type: typeFilter || undefined,
				})
				.then((r) => r.data.results ?? r.data),
		refetchInterval: 8_000, // was 30s
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});

	const { data: unreadCount = 0 } = useQuery({
		queryKey: ["unread-notifications"],
		queryFn: () => notificationsApi.unreadCount().then((r) => r.data.count),
		refetchInterval: 8_000, // was 30s
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});

	// Sort: unread first, then by date desc
	const notifications = [...rawNotifications].sort((a: any, b: any) => {
		const aRead = a.is_read ?? a.read ?? false;
		const bRead = b.is_read ?? b.read ?? false;
		if (aRead !== bRead) return aRead ? 1 : -1;
		return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
	});

	const urgent = notifications.filter((n: any) => n.is_urgent);

	const markReadMutation = useMutation({
		mutationFn: (id: string) => notificationsApi.markRead(id),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["notifications"] });
			qc.invalidateQueries({ queryKey: ["unread-notifications"] });
		},
	});

	const markAllMutation = useMutation({
		mutationFn: () => notificationsApi.markAllRead(),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["notifications"] });
			qc.invalidateQueries({ queryKey: ["unread-notifications"] });
			toast.success("All notifications marked as read");
		},
	});

	return (
		<div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
			{/* Header */}
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<Bell size={22} className="text-nexus-400" />
						Notifications
						{unreadCount > 0 && (
							<span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold">
								{unreadCount > 99 ? "99+" : unreadCount}
							</span>
						)}
					</h1>
					<p className="page-subtitle">
						All system alerts, updates, and reminders
					</p>
				</div>
				{unreadCount > 0 && (
					<button
						onClick={() => markAllMutation.mutate()}
						disabled={markAllMutation.isPending}
						className="btn-secondary btn-sm">
						<CheckCheck size={14} />
						{markAllMutation.isPending ? "Marking…" : "Mark All Read"}
					</button>
				)}
			</div>

			{/* Urgent strip */}
			{urgent.length > 0 && filter !== "urgent" && (
				<div className="space-y-2">
					{urgent.map((n: any) => (
						<NotificationCard
							key={n.id}
							notification={n}
							onRead={() => markReadMutation.mutate(n.id)}
							onView={() => setSelectedNotification(n)}
							urgent
						/>
					))}
				</div>
			)}

			{/* Filters */}
			<div className="flex flex-wrap gap-3 items-center">
				<div className="flex gap-1 p-1 bg-surface-card border border-surface-border rounded-xl">
					{(["all", "unread", "urgent"] as const).map((f) => (
						<button
							key={f}
							onClick={() => setFilter(f)}
							className={clsx(
								"px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all",
								{
									"bg-nexus-600 text-white": filter === f,
									"text-slate-400 hover:text-white": filter !== f,
								},
							)}>
							{f}
							{f === "unread" && unreadCount > 0 && (
								<span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-500/80 text-white text-[10px] font-bold">
									{unreadCount}
								</span>
							)}
						</button>
					))}
				</div>

				<select
					value={typeFilter}
					onChange={(e) => setTypeFilter(e.target.value)}
					className="select-input w-44 text-sm py-1.5">
					<option value="">All Types</option>
					<option value="task_assigned">Tasks</option>
					<option value="fm_outage">FM Alerts</option>
					<option value="emergency_alert">Emergency</option>
					<option value="checkout_update">Equipment</option>
					<option value="evaluation_due">Evaluations</option>
					<option value="reminder">Reminders</option>
					<option value="ticket_update">Tickets</option>
					<option value="wifi_decision">Wi-Fi</option>
					<option value="general">General</option>
				</select>

				{(filter !== "all" || typeFilter) && (
					<button
						onClick={() => {
							setFilter("all");
							setTypeFilter("");
						}}
						className="text-xs text-slate-500 hover:text-white flex items-center gap-1">
						<X size={12} /> Clear filters
					</button>
				)}
			</div>

			{/* Unread count label */}
			{notifications.length > 0 && (
				<p className="text-xs text-slate-600">
					{notifications.filter((n: any) => !(n.is_read ?? n.read)).length > 0
						? `${notifications.filter((n: any) => !(n.is_read ?? n.read)).length} unread · sorted first`
						: "All caught up"}
				</p>
			)}

			{/* Notification list */}
			<div className="space-y-2">
				{isLoading ? (
					[...Array(6)].map((_, i) => (
						<div key={i} className="skeleton h-20 rounded-xl" />
					))
				) : notifications.length === 0 ? (
					<div className="card text-center py-14">
						<Bell
							size={36}
							className="mx-auto text-slate-500 mb-3 opacity-30"
						/>
						<p className="text-slate-400">
							{filter === "unread"
								? "No unread notifications"
								: "No notifications yet"}
						</p>
					</div>
				) : (
					notifications.map((n: any) => (
						<NotificationCard
							key={n.id}
							notification={n}
							onRead={() => markReadMutation.mutate(n.id)}
							onView={() => setSelectedNotification(n)}
						/>
					))
				)}
			</div>

			{/* Detail modal */}
			{selectedNotification && (
				<NotificationDetailModal
					notification={selectedNotification}
					onClose={() => setSelectedNotification(null)}
					onRead={() => markReadMutation.mutate(selectedNotification.id)}
				/>
			)}
		</div>
	);
}
