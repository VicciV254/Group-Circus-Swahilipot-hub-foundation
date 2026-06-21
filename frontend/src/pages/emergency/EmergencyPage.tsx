// Nexus FM — Emergency Alerts Page (Comprehensive)
// Covers: stats bar · active-alert banner · alert cards with expandable detail
// · trigger modal · acknowledge · resolve-with-notes modal · acknowledgement
// breakdown · notification delivery breakdown · audit log tab with filters
// · notification preferences tab with toggle grid and test-send

import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
	type LucideIcon,
	Siren,
	AlertTriangle,
	CheckCircle,
	Bell,
	Shield,
	Radio,
	Zap,
	Server,
	Flame,
	Database,
	Info,
	WifiOff,
	RefreshCw,
	ChevronDown,
	ChevronUp,
	Filter,
	ClipboardList,
	Settings,
	Phone,
	Mail,
	Clock,
	X,
	AlertCircle,
	Send,
	Eye,
} from "lucide-react";
import { api, emergencyApi } from "../../services/api";
import { useAuthStore } from "../../services/api";
import toast from "react-hot-toast";
import clsx from "clsx";

// ─── Types ─────────────────────────────────────────────────────────────────

type AlertSeverity = "low" | "medium" | "high" | "critical";
type PageTab = "active" | "all" | "audit" | "preferences";

interface Acknowledgement {
	user: string;
	user_name: string | null;
	acknowledged_at: string;
}

interface EmergencyAlertDTO {
	id: string;
	alert_type: string;
	title: string;
	description: string;
	severity: AlertSeverity;
	affected_systems: string[];
	notified_emails: string[];
	notified_phones: string[];
	notification_errors: string[];
	acknowledged_count: number;
	acknowledgements: Acknowledgement[];
	resolved: boolean;
	resolved_at: string | null;
	resolved_by_name: string | null;
	resolution_notes: string;
	triggered_by_name: string | null;
	created_at: string;
}

interface AuditLogEntryDTO {
	id: string;
	action: string;
	action_display: string;
	actor_name: string | null;
	target_repr: string;
	metadata: Record<string, unknown>;
	created_at: string;
}

interface NotificationPrefDTO {
	id: string;
	email_on_outage: boolean;
	sms_on_outage: boolean;
	email_on_restored: boolean;
	sms_on_restored: boolean;
	email_on_emergency_alert: boolean;
	sms_on_emergency_alert: boolean;
	fm_minimum_severity: string;
	phone_number: string;
}

interface TriggerForm {
	alert_type: string;
	title: string;
	description: string;
	severity: AlertSeverity;
	affected_systems: string[];
}

// ─── Config ────────────────────────────────────────────────────────────────

const ALERT_TYPE_CONFIG: Record<
	string,
	{ icon: LucideIcon; label: string; iconClass: string }
> = {
	fm_outage: {
		icon: Radio,
		label: "FM Station Outage",
		iconClass: "text-purple-400",
	},
	system_down: {
		icon: Server,
		label: "System Down",
		iconClass: "text-red-400",
	},
	security_breach: {
		icon: Shield,
		label: "Security Breach",
		iconClass: "text-orange-400",
	},
	infrastructure: {
		icon: Zap,
		label: "Infrastructure Failure",
		iconClass: "text-yellow-400",
	},
	data_breach: {
		icon: Database,
		label: "Data Breach",
		iconClass: "text-pink-400",
	},
	fire: { icon: Flame, label: "Fire / Evacuation", iconClass: "text-red-500" },
	emergency: {
		icon: AlertTriangle,
		label: "General Emergency",
		iconClass: "text-amber-400",
	},
	other: { icon: Info, label: "Other", iconClass: "text-slate-400" },
};

const SEV_BADGE: Record<AlertSeverity, string> = {
	low: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
	medium: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
	high: "bg-red-500/20 text-red-300 border border-red-500/30",
	critical: "bg-red-600/30 text-red-200 border border-red-500/50",
};

const SEV_LEFT_BORDER: Record<AlertSeverity, string> = {
	low: "border-l-blue-400",
	medium: "border-l-amber-400",
	high: "border-l-red-500",
	critical: "border-l-red-600",
};

const SEV_WEIGHT: Record<AlertSeverity, number> = {
	critical: 4,
	high: 3,
	medium: 2,
	low: 1,
};

const SYSTEMS = [
	"FM Station",
	"Website",
	"Broadcast Network",
	"Internal Systems",
	"Power",
	"Internet",
	"Studio Equipment",
	"Security Systems",
	"All Systems",
];

const SEVERITY_OPTIONS: AlertSeverity[] = ["low", "medium", "high", "critical"];

const ALERTS_QUERY_KEY = ["emergency-alerts"] as const;
const AUDIT_QUERY_KEY = ["fm-audit-log"] as const;
const PREFS_QUERY_KEY = ["fm-notification-prefs"] as const;

// ─── Helpers ───────────────────────────────────────────────────────────────

function normaliseAlerts(data: unknown): EmergencyAlertDTO[] {
	if (!data) return [];
	if (Array.isArray(data)) return data;
	if (typeof data === "object" && Array.isArray((data as any).results))
		return (data as any).results;
	return [];
}

function errMsg(e: any, fallback: string): string {
	return e?.response?.data?.detail || e?.message || fallback;
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function EmergencyPage() {
	const { user } = useAuthStore();
	const isAdmin =
		user?.role === "system_admin" || user?.role === "broadcast_admin";
	const qc = useQueryClient();

	const [tab, setTab] = useState<PageTab>("active");
	const [showTrigger, setShowTrigger] = useState(false);
	const [resolveTarget, setResolveTarget] = useState<EmergencyAlertDTO | null>(
		null,
	);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [pendingAckId, setPendingAckId] = useState<string | null>(null);
	const [filterSev, setFilterSev] = useState<AlertSeverity | "">("");
	const [filterType, setFilterType] = useState("");
	const [showFilters, setShowFilters] = useState(false);

	// ── Alerts ────────────────────────────────────────────────────────────
	const {
		data: rawAlerts,
		isLoading,
		isError,
		error,
		refetch,
		isFetching,
	} = useQuery({
		queryKey: ALERTS_QUERY_KEY,
		queryFn: () => emergencyApi.list().then((r) => r.data),
		refetchInterval: 10_000,
		refetchOnWindowFocus: true,
		retry: 2,
	});

	const alerts = useMemo(() => normaliseAlerts(rawAlerts), [rawAlerts]);
	const activeAlerts = useMemo(
		() => alerts.filter((a) => !a.resolved),
		[alerts],
	);

	const displayed = useMemo(() => {
		let list = tab === "active" ? activeAlerts : alerts;
		if (filterSev) list = list.filter((a) => a.severity === filterSev);
		if (filterType) list = list.filter((a) => a.alert_type === filterType);
		return [...list].sort(
			(a, b) => SEV_WEIGHT[b.severity] - SEV_WEIGHT[a.severity],
		);
	}, [tab, alerts, activeAlerts, filterSev, filterType]);

	const stats = useMemo(
		() => ({
			total: alerts.length,
			active: activeAlerts.length,
			critical: alerts.filter((a) => a.severity === "critical").length,
			resolved: alerts.filter((a) => a.resolved).length,
		}),
		[alerts, activeAlerts],
	);

	// ── Acknowledge mutation ───────────────────────────────────────────────
	const ackMutation = useMutation({
		mutationFn: (id: string) =>
			emergencyApi
				.acknowledge(id)
				.then((r) => ({ id, data: r.data as EmergencyAlertDTO })),

		onMutate: async (id) => {
			setPendingAckId(id);
			await qc.cancelQueries({ queryKey: ALERTS_QUERY_KEY });
			const previous = qc.getQueryData<unknown>(ALERTS_QUERY_KEY);
			qc.setQueryData(ALERTS_QUERY_KEY, (old: unknown) =>
				normaliseAlerts(old).map((a) =>
					a.id === id
						? { ...a, acknowledged_count: a.acknowledged_count + 1 }
						: a,
				),
			);
			return { previous };
		},
		onSuccess: ({ id, data }) => {
			qc.setQueryData(ALERTS_QUERY_KEY, (old: unknown) =>
				normaliseAlerts(old).map((a) => (a.id === id ? { ...a, ...data } : a)),
			);
			toast.success("Alert acknowledged");
		},
		onError: (e: any, _id, ctx) => {
			if (ctx?.previous !== undefined)
				qc.setQueryData(ALERTS_QUERY_KEY, ctx.previous);
			toast.error(errMsg(e, "Failed to acknowledge alert"));
		},
		onSettled: () => setPendingAckId(null),
	});

	// ── Resolve mutation (PATCH /emergency-alert/<id>/) ───────────────────
	const resolveMutation = useMutation({
		mutationFn: ({ id, notes }: { id: string; notes: string }) =>
			emergencyApi
				.resolve(id, { resolved: true, resolution_notes: notes })
				.then((r) => ({ id, data: r.data as EmergencyAlertDTO })),
		onSuccess: ({ id, data }) => {
			qc.setQueryData(ALERTS_QUERY_KEY, (old: unknown) =>
				normaliseAlerts(old).map((a) => (a.id === id ? { ...a, ...data } : a)),
			);
			toast.success("Alert marked as resolved");
			setResolveTarget(null);
		},
		onError: (e: any) => toast.error(errMsg(e, "Failed to resolve alert")),
	});

	const handleToggleExpand = useCallback(
		(id: string) => setExpandedId((prev) => (prev === id ? null : id)),
		[],
	);

	return (
		<div className="space-y-6 animate-fade-in">
			{/* ── Page Header ──────────────────────────────────────────────── */}
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<Siren size={22} className="text-red-400" aria-hidden />
						Emergency Alerts
						{activeAlerts.length > 0 && (
							<span
								role="status"
								className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold animate-pulse">
								{activeAlerts.length} ACTIVE
							</span>
						)}
					</h1>
					<p className="page-subtitle">
						System-wide emergency alerts · acknowledgements · resolution
						tracking
					</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={() => refetch()}
						disabled={isFetching}
						aria-label="Refresh alerts"
						className="btn-secondary btn-sm">
						<RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
					</button>
					{isAdmin && (
						<button
							onClick={() => setShowTrigger(true)}
							className="emergency-btn btn-lg">
							<Siren size={18} />
							SEND EMERGENCY ALERT
						</button>
					)}
				</div>
			</div>

			{/* ── Error banner ─────────────────────────────────────────────── */}
			{isError && (
				<div className="p-4 rounded-xl border border-red-500/40 bg-red-900/10 flex items-center gap-3">
					<WifiOff size={20} className="text-red-400 shrink-0" />
					<div className="flex-1">
						<span className="font-semibold text-red-400 text-sm block">
							Couldn't load emergency alerts
						</span>
						<span className="text-xs text-slate-400">
							{errMsg(error, "Check your connection and try again.")}
						</span>
					</div>
					<button onClick={() => refetch()} className="btn-secondary btn-sm">
						Retry
					</button>
				</div>
			)}

			{/* ── Stats bar ────────────────────────────────────────────────── */}
			{!isLoading && alerts.length > 0 && (
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
					<StatCard
						label="Total Alerts"
						value={stats.total}
						accent="text-slate-300"
					/>
					<StatCard
						label="Active"
						value={stats.active}
						accent="text-red-400"
						pulse={stats.active > 0}
						dimBg={stats.active > 0}
					/>
					<StatCard
						label="Critical"
						value={stats.critical}
						accent="text-red-300"
						pulse={stats.critical > 0}
						dimBg={stats.critical > 0}
					/>
					<StatCard
						label="Resolved"
						value={stats.resolved}
						accent="text-green-400"
					/>
				</div>
			)}

			{/* ── Active-alert banner ──────────────────────────────────────── */}
			{activeAlerts.length > 0 && (
				<div className="p-4 rounded-xl border border-red-500/50 bg-red-900/20 animate-glow-pulse">
					<div className="flex items-center gap-3 mb-3">
						<Siren size={20} className="text-red-400 animate-bounce" />
						<span className="font-bold text-red-400 text-lg">
							{activeAlerts.length} Active Emergency Alert
							{activeAlerts.length > 1 ? "s" : ""}
						</span>
					</div>
					<div className="space-y-2">
						{activeAlerts.map((a) => {
							const cfg =
								ALERT_TYPE_CONFIG[a.alert_type] ?? ALERT_TYPE_CONFIG.other;
							return (
								<div
									key={a.id}
									className="flex items-center justify-between p-3 bg-red-900/30 rounded-lg gap-3 flex-wrap">
									<div className="flex items-center gap-2 min-w-0">
										<cfg.icon size={14} className={cfg.iconClass} />
										<span className="font-semibold text-white text-sm truncate">
											{a.title}
										</span>
										<span
											className={clsx(
												"px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
												SEV_BADGE[a.severity],
											)}>
											{a.severity}
										</span>
									</div>
									<div className="flex items-center gap-2 shrink-0">
										<span className="text-xs text-slate-400">
											{formatDistanceToNow(parseISO(a.created_at), {
												addSuffix: true,
											})}
										</span>
										{isAdmin && (
											<>
												<button
													onClick={() => ackMutation.mutate(a.id)}
													disabled={pendingAckId === a.id}
													className="btn-secondary btn-sm text-xs">
													{pendingAckId === a.id ? (
														<Spinner />
													) : (
														<CheckCircle size={12} />
													)}
													Acknowledge
												</button>
												<button
													onClick={() => setResolveTarget(a)}
													className="btn-secondary btn-sm text-xs border-green-500/40 text-green-400 hover:border-green-500">
													<CheckCircle size={12} />
													Resolve
												</button>
											</>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* ── All-clear banner ─────────────────────────────────────────── */}
			{!isError &&
				activeAlerts.length === 0 &&
				!isLoading &&
				alerts.length > 0 && (
					<div className="p-4 rounded-xl border border-green-500/40 bg-green-900/10 flex items-center gap-3">
						<CheckCircle size={20} className="text-green-400 shrink-0" />
						<span className="font-semibold text-green-400 text-sm">
							All alerts resolved — no active emergencies
						</span>
					</div>
				)}

			{/* ── Tabs ─────────────────────────────────────────────────────── */}
			<div className="flex items-center justify-between gap-3 flex-wrap">
				<div
					role="tablist"
					className="flex gap-1 p-1 bg-surface-card border border-surface-border rounded-xl w-fit flex-wrap">
					{(
						[
							{
								key: "active",
								label: `Active (${activeAlerts.length})`,
								Icon: Siren,
							},
							{
								key: "all",
								label: `History (${alerts.length})`,
								Icon: ClipboardList,
							},
							{ key: "audit", label: "Audit Log", Icon: Eye },
							{ key: "preferences", label: "My Notifications", Icon: Settings },
						] as const
					).map(({ key, label, Icon }) => (
						<button
							key={key}
							role="tab"
							aria-selected={tab === key}
							onClick={() => setTab(key)}
							className={clsx(
								"flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
								tab === key
									? "bg-nexus-600 text-white"
									: "text-slate-400 hover:text-white",
							)}>
							<Icon size={13} />
							{label}
						</button>
					))}
				</div>

				{(tab === "active" || tab === "all") && (
					<button
						onClick={() => setShowFilters((p) => !p)}
						className={clsx(
							"flex items-center gap-1.5 btn-secondary btn-sm",
							showFilters && "bg-nexus-600/20 border-nexus-500/50",
						)}>
						<Filter size={13} />
						Filters
						{(filterSev || filterType) && (
							<span className="w-1.5 h-1.5 rounded-full bg-nexus-400" />
						)}
					</button>
				)}
			</div>

			{/* ── Filter panel ─────────────────────────────────────────────── */}
			{showFilters && (tab === "active" || tab === "all") && (
				<div className="card p-4 space-y-3">
					<div className="flex items-center justify-between">
						<span className="text-sm font-medium text-slate-300">
							Filter alerts
						</span>
						{(filterSev || filterType) && (
							<button
								onClick={() => {
									setFilterSev("");
									setFilterType("");
								}}
								className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
								<X size={11} /> Clear filters
							</button>
						)}
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="input-group">
							<label className="input-label">Severity</label>
							<select
								value={filterSev}
								onChange={(e) =>
									setFilterSev(e.target.value as AlertSeverity | "")
								}
								className="select-input">
								<option value="">All severities</option>
								{SEVERITY_OPTIONS.map((s) => (
									<option key={s} value={s}>
										{s.charAt(0).toUpperCase() + s.slice(1)}
									</option>
								))}
							</select>
						</div>
						<div className="input-group">
							<label className="input-label">Alert Type</label>
							<select
								value={filterType}
								onChange={(e) => setFilterType(e.target.value)}
								className="select-input">
								<option value="">All types</option>
								{Object.entries(ALERT_TYPE_CONFIG).map(([v, { label }]) => (
									<option key={v} value={v}>
										{label}
									</option>
								))}
							</select>
						</div>
					</div>
				</div>
			)}

			{/* ── Alert cards ──────────────────────────────────────────────── */}
			{(tab === "active" || tab === "all") && (
				<div className="space-y-4">
					{isLoading ? (
						[...Array(3)].map((_, i) => (
							<div key={i} className="skeleton h-40 rounded-xl" />
						))
					) : isError ? null : displayed.length === 0 ? (
						<div className="card text-center py-14">
							<CheckCircle
								size={36}
								className="mx-auto text-green-400 mb-3 opacity-50"
							/>
							<p className="text-slate-400">
								{filterSev || filterType
									? "No alerts match the current filters"
									: tab === "active"
										? "No active emergencies — all systems operational"
										: "No alerts found"}
							</p>
						</div>
					) : (
						displayed.map((alert) => (
							<AlertCard
								key={alert.id}
								alert={alert}
								isAdmin={isAdmin}
								isPendingAck={pendingAckId === alert.id}
								isExpanded={expandedId === alert.id}
								onToggleExpand={() => handleToggleExpand(alert.id)}
								onAcknowledge={() => ackMutation.mutate(alert.id)}
								onResolve={() => setResolveTarget(alert)}
							/>
						))
					)}
				</div>
			)}

			{/* ── Audit log tab ─────────────────────────────────────────────── */}
			{tab === "audit" && <AuditLogPanel />}

			{/* ── Notification prefs tab ───────────────────────────────────── */}
			{tab === "preferences" && <NotificationPrefsPanel />}

			{/* ── Modals ────────────────────────────────────────────────────── */}
			{showTrigger && (
				<TriggerAlertModal
					onClose={() => setShowTrigger(false)}
					onSuccess={() => {
						qc.invalidateQueries({ queryKey: ALERTS_QUERY_KEY });
						setShowTrigger(false);
					}}
				/>
			)}
			{resolveTarget && (
				<ResolveAlertModal
					alert={resolveTarget}
					isPending={resolveMutation.isPending}
					onClose={() => setResolveTarget(null)}
					onConfirm={(notes) =>
						resolveMutation.mutate({ id: resolveTarget.id, notes })
					}
				/>
			)}
		</div>
	);
}

// ─── StatCard ──────────────────────────────────────────────────────────────

function StatCard({
	label,
	value,
	accent,
	pulse = false,
	dimBg = false,
}: {
	label: string;
	value: number;
	accent: string;
	pulse?: boolean;
	dimBg?: boolean;
}) {
	return (
		<div
			className={clsx(
				"card py-3 px-4 border",
				dimBg ? "border-red-500/30 bg-red-900/10" : "border-surface-border",
			)}>
			<div
				className={clsx(
					"text-2xl font-bold font-display",
					accent,
					pulse && "animate-pulse",
				)}>
				{value}
			</div>
			<div className="text-xs text-slate-500 mt-0.5">{label}</div>
		</div>
	);
}

// ─── Spinner ───────────────────────────────────────────────────────────────

function Spinner({ size = 12 }: { size?: number }) {
	return (
		<span
			style={{ width: size, height: size }}
			className="border-2 border-current/30 border-t-current rounded-full animate-spin inline-block"
		/>
	);
}

// ─── AlertCard ─────────────────────────────────────────────────────────────

function AlertCard({
	alert,
	isAdmin,
	isPendingAck,
	isExpanded,
	onToggleExpand,
	onAcknowledge,
	onResolve,
}: {
	alert: EmergencyAlertDTO;
	isAdmin: boolean;
	isPendingAck: boolean;
	isExpanded: boolean;
	onToggleExpand: () => void;
	onAcknowledge: () => void;
	onResolve: () => void;
}) {
	const cfg = ALERT_TYPE_CONFIG[alert.alert_type] ?? ALERT_TYPE_CONFIG.other;
	const Icon = cfg.icon;
	const resolved = alert.resolved;

	return (
		<div
			className={clsx(
				"card border-l-4 transition-all duration-300",
				resolved
					? "border-l-green-500 opacity-70"
					: SEV_LEFT_BORDER[alert.severity],
			)}>
			{/* Header row */}
			<div className="flex items-start gap-4">
				<div
					className={clsx(
						"w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
						resolved ? "bg-green-500/15" : "bg-red-500/15",
					)}>
					<Icon
						size={20}
						className={resolved ? "text-green-400" : cfg.iconClass}
					/>
				</div>

				<div className="flex-1 min-w-0">
					{/* Title + meta */}
					<div className="flex items-start justify-between gap-3 flex-wrap">
						<div className="min-w-0">
							<h3 className="font-semibold text-white">{alert.title}</h3>
							<div className="flex items-center gap-2 mt-1 flex-wrap">
								<span className="text-xs text-slate-400">{cfg.label}</span>
								<span
									className={clsx(
										"px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
										SEV_BADGE[alert.severity],
									)}>
									{alert.severity}
								</span>
								{resolved ? (
									<span className="px-1.5 py-0.5 rounded text-[10px] bg-green-500/20 text-green-300 border border-green-500/30">
										Resolved
									</span>
								) : (
									<span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse">
										Active
									</span>
								)}
							</div>
						</div>
						<div className="text-right text-xs text-slate-500 shrink-0">
							<div>
								{format(parseISO(alert.created_at), "dd MMM yyyy, HH:mm")}
							</div>
							<div className="mt-0.5">
								by {alert.triggered_by_name || "System"}
							</div>
							<div className="mt-0.5 text-slate-600">
								{formatDistanceToNow(parseISO(alert.created_at), {
									addSuffix: true,
								})}
							</div>
						</div>
					</div>

					{/* Description */}
					<p className="text-sm text-slate-300 mt-2 leading-relaxed">
						{alert.description}
					</p>

					{/* Affected systems */}
					{alert.affected_systems?.length > 0 && (
						<div className="flex flex-wrap gap-1.5 mt-2">
							{alert.affected_systems.map((sys) => (
								<span
									key={sys}
									className="px-2 py-0.5 rounded-md text-[10px] bg-slate-700/60 text-slate-300 border border-slate-600/40">
									{sys}
								</span>
							))}
						</div>
					)}

					{/* Notification-error warning */}
					{alert.notification_errors?.length > 0 && (
						<div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
							<AlertCircle size={11} />
							{alert.notification_errors.length} notification
							{alert.notification_errors.length !== 1 ? "s" : ""} failed to send
						</div>
					)}

					{/* Footer: delivery summary + toggle + actions */}
					<div className="flex items-center gap-4 mt-3 pt-3 border-t border-surface-border/50 flex-wrap">
						<div className="flex items-center gap-1.5 text-xs text-slate-500">
							<Mail size={11} />
							{alert.notified_emails?.length || 0} email
							{alert.notified_emails?.length !== 1 ? "s" : ""}
						</div>
						<div className="flex items-center gap-1.5 text-xs text-slate-500">
							<Phone size={11} />
							{alert.notified_phones?.length || 0} SMS
						</div>
						<div className="flex items-center gap-1.5 text-xs text-slate-500">
							<CheckCircle size={11} />
							{alert.acknowledged_count} ack
							{alert.acknowledged_count !== 1 ? "s" : ""}
						</div>

						<button
							onClick={onToggleExpand}
							className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors">
							{isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
							{isExpanded ? "Less" : "Details"}
						</button>
					</div>

					{/* Admin action buttons */}
					{!resolved && isAdmin && (
						<div className="flex items-center gap-2 mt-3 flex-wrap">
							<button
								onClick={onAcknowledge}
								disabled={isPendingAck}
								className="btn-secondary btn-sm text-xs">
								{isPendingAck ? (
									<Spinner size={12} />
								) : (
									<CheckCircle size={12} />
								)}
								Acknowledge
							</button>
							<button
								onClick={onResolve}
								className="btn-secondary btn-sm text-xs border-green-500/40 text-green-400 hover:border-green-500">
								<CheckCircle size={12} />
								Resolve with Notes
							</button>
						</div>
					)}
				</div>
			</div>

			{/* ── Expanded detail ─────────────────────────────────────────── */}
			{isExpanded && (
				<div className="mt-4 pt-4 border-t border-surface-border/50 space-y-5 animate-fade-in">
					{/* Acknowledgements list */}
					<section>
						<SectionHeading
							icon={<CheckCircle size={11} />}
							label={`Acknowledgements (${alert.acknowledgements?.length || 0})`}
						/>
						{alert.acknowledgements?.length > 0 ? (
							<div className="space-y-1.5 mt-2">
								{alert.acknowledgements.map((ack, i) => (
									<div
										key={i}
										className="flex items-center justify-between text-xs bg-slate-800/40 rounded-lg px-3 py-2">
										<span className="font-medium text-slate-300">
											{ack.user_name || "Unknown"}
										</span>
										<span className="text-slate-500">
											{format(
												parseISO(ack.acknowledged_at),
												"dd MMM yyyy, HH:mm",
											)}
										</span>
									</div>
								))}
							</div>
						) : (
							<p className="text-xs text-slate-600 italic mt-2">
								No acknowledgements yet.
							</p>
						)}
					</section>

					{/* Notification delivery breakdown */}
					<section>
						<SectionHeading
							icon={<Bell size={11} />}
							label="Notification Delivery"
						/>
						<div className="grid grid-cols-2 gap-3 mt-2 text-xs">
							<div className="bg-slate-800/40 rounded-lg p-3">
								<div className="text-slate-500 mb-1.5 flex items-center gap-1">
									<Mail size={10} /> Emails sent to
								</div>
								{alert.notified_emails?.length > 0 ? (
									alert.notified_emails.map((e, i) => (
										<div key={i} className="text-slate-300 truncate">
											{e}
										</div>
									))
								) : (
									<div className="text-slate-600 italic">None</div>
								)}
							</div>
							<div className="bg-slate-800/40 rounded-lg p-3">
								<div className="text-slate-500 mb-1.5 flex items-center gap-1">
									<Phone size={10} /> SMS sent to
								</div>
								{alert.notified_phones?.length > 0 ? (
									alert.notified_phones.map((p, i) => (
										<div key={i} className="text-slate-300">
											{p}
										</div>
									))
								) : (
									<div className="text-slate-600 italic">None</div>
								)}
							</div>
						</div>

						{alert.notification_errors?.length > 0 && (
							<div className="mt-2 p-3 bg-amber-900/20 rounded-lg border border-amber-500/20">
								<div className="text-xs text-amber-400 font-semibold mb-1">
									Delivery Errors
								</div>
								{alert.notification_errors.map((err, i) => (
									<div key={i} className="text-xs text-slate-400">
										{err}
									</div>
								))}
							</div>
						)}
					</section>

					{/* Resolution block (only when resolved) */}
					{resolved && (
						<section>
							<SectionHeading
								icon={<CheckCircle size={11} />}
								label="Resolution"
							/>
							<div className="mt-2 p-3 bg-green-900/20 rounded-lg border border-green-500/20">
								{alert.resolution_notes ? (
									<p className="text-xs text-slate-300">
										{alert.resolution_notes}
									</p>
								) : (
									<p className="text-xs text-slate-600 italic">
										No resolution notes provided.
									</p>
								)}
								{alert.resolved_at && (
									<div className="text-[10px] text-slate-500 mt-1.5">
										Resolved
										{alert.resolved_by_name
											? ` by ${alert.resolved_by_name}`
											: ""}{" "}
										at{" "}
										{format(parseISO(alert.resolved_at), "dd MMM yyyy, HH:mm")}
									</div>
								)}
							</div>
						</section>
					)}
				</div>
			)}
		</div>
	);
}

// ─── SectionHeading ────────────────────────────────────────────────────────

function SectionHeading({ icon, label }: { icon: ReactNode; label: string }) {
	return (
		<div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
			{icon}
			{label}
		</div>
	);
}

// ─── TriggerAlertModal ─────────────────────────────────────────────────────

function TriggerAlertModal({
	onClose,
	onSuccess,
}: {
	onClose: () => void;
	onSuccess: () => void;
}) {
	const [form, setForm] = useState<TriggerForm>({
		alert_type: "emergency",
		title: "",
		description: "",
		severity: "high",
		affected_systems: [],
	});
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

	const mutation = useMutation({
		mutationFn: (data: TriggerForm) => emergencyApi.trigger(data),
		onSuccess: () => {
			toast.success("🚨 Emergency alert dispatched!", { duration: 6000 });
			onSuccess();
		},
		onError: (e: any) => {
			const apiErrors = e?.response?.data;
			if (apiErrors && typeof apiErrors === "object") {
				const flat: Record<string, string> = {};
				for (const [field, msgs] of Object.entries(apiErrors)) {
					flat[field] = Array.isArray(msgs) ? msgs.join(" ") : String(msgs);
				}
				setFieldErrors(flat);
			}
			toast.error(errMsg(e, "Failed to dispatch alert"));
		},
	});

	const toggleSystem = (sys: string) =>
		setForm((p) => ({
			...p,
			affected_systems: p.affected_systems.includes(sys)
				? p.affected_systems.filter((s) => s !== sys)
				: [...p.affected_systems, sys],
		}));

	const titleValid = form.title.trim().length >= 5;
	const descValid = form.description.trim().length >= 10;
	const canSubmit = titleValid && descValid && !mutation.isPending;

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="trigger-alert-title"
				className="modal-box max-w-lg"
				onClick={(e) => e.stopPropagation()}>
				<div className="modal-header bg-red-950/40 border-b border-red-500/30">
					<h3
						id="trigger-alert-title"
						className="text-xl font-display font-bold text-red-400 flex items-center gap-2">
						<Siren size={22} className="animate-bounce" /> Send Emergency Alert
					</h3>
				</div>

				<div className="modal-body space-y-4">
					{/* Warning */}
					<div className="flex items-start gap-3 p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-sm">
						<AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
						<div>
							<div className="font-semibold text-red-300">
								This immediately notifies all admins and emergency contacts via
								email and SMS.
							</div>
							<div className="text-xs mt-0.5 text-red-400">
								Use only for genuine emergencies.
							</div>
						</div>
					</div>

					{/* Alert type + severity */}
					<div className="grid grid-cols-2 gap-4">
						<div className="input-group">
							<label className="input-label">Alert Type</label>
							<select
								value={form.alert_type}
								onChange={(e) =>
									setForm((p) => ({ ...p, alert_type: e.target.value }))
								}
								className="select-input">
								{Object.entries(ALERT_TYPE_CONFIG).map(([v, { label }]) => (
									<option key={v} value={v}>
										{label}
									</option>
								))}
							</select>
						</div>
						<div className="input-group">
							<label className="input-label">Severity</label>
							<select
								value={form.severity}
								onChange={(e) =>
									setForm((p) => ({
										...p,
										severity: e.target.value as AlertSeverity,
									}))
								}
								className={clsx("select-input", {
									"border-red-500 text-red-400": form.severity === "critical",
									"border-amber-500": form.severity === "high",
								})}>
								<option value="low">Low</option>
								<option value="medium">Medium</option>
								<option value="high">High</option>
								<option value="critical">🔴 CRITICAL</option>
							</select>
						</div>
					</div>

					{/* Title */}
					<div className="input-group">
						<label className="input-label">
							Alert Title <span className="text-red-400">*</span>
							<span className="text-slate-600 font-normal ml-1 text-[10px]">
								min 5 chars
							</span>
						</label>
						<input
							value={form.title}
							onChange={(e) =>
								setForm((p) => ({ ...p, title: e.target.value }))
							}
							maxLength={200}
							placeholder="Brief, clear description of the emergency"
							className={clsx(
								"input",
								!titleValid && form.title.length > 0 && "border-red-500/60",
							)}
						/>
						{fieldErrors.title && (
							<p className="text-xs text-red-400 mt-1">{fieldErrors.title}</p>
						)}
					</div>

					{/* Description */}
					<div className="input-group">
						<label className="input-label">
							Full Description <span className="text-red-400">*</span>
							<span className="text-slate-600 font-normal ml-1 text-[10px]">
								min 10 chars
							</span>
						</label>
						<textarea
							value={form.description}
							onChange={(e) =>
								setForm((p) => ({ ...p, description: e.target.value }))
							}
							rows={4}
							className={clsx(
								"textarea",
								!descValid &&
									form.description.length > 0 &&
									"border-red-500/60",
							)}
							placeholder="Describe the situation, current status, and what immediate action is needed..."
						/>
						{fieldErrors.description && (
							<p className="text-xs text-red-400 mt-1">
								{fieldErrors.description}
							</p>
						)}
					</div>

					{/* Affected systems */}
					<div className="input-group">
						<label className="input-label">Affected Systems</label>
						<div className="flex flex-wrap gap-2 mt-1">
							{SYSTEMS.map((sys) => (
								<button
									key={sys}
									type="button"
									onClick={() => toggleSystem(sys)}
									className={clsx(
										"px-2.5 py-1 rounded-lg text-xs border transition-all",
										form.affected_systems.includes(sys)
											? "bg-red-900/40 border-red-500/40 text-red-300"
											: "border-surface-border text-slate-400 hover:border-slate-500",
									)}>
									{sys}
								</button>
							))}
						</div>
					</div>
				</div>

				<div className="modal-footer bg-red-950/20">
					<button onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						disabled={!canSubmit}
						onClick={() => mutation.mutate(form)}
						className="emergency-btn btn-lg px-8">
						{mutation.isPending ? (
							<span className="flex items-center gap-2">
								<Spinner size={16} /> Dispatching...
							</span>
						) : (
							<span className="flex items-center gap-2">
								<Bell size={16} /> DISPATCH ALERT
							</span>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── ResolveAlertModal ─────────────────────────────────────────────────────

function ResolveAlertModal({
	alert,
	isPending,
	onClose,
	onConfirm,
}: {
	alert: EmergencyAlertDTO;
	isPending: boolean;
	onClose: () => void;
	onConfirm: (notes: string) => void;
}) {
	const [notes, setNotes] = useState("");

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="resolve-alert-title"
				className="modal-box max-w-md"
				onClick={(e) => e.stopPropagation()}>
				<div className="modal-header border-b border-green-500/30">
					<h3
						id="resolve-alert-title"
						className="text-lg font-bold text-green-400 flex items-center gap-2">
						<CheckCircle size={20} /> Resolve Emergency Alert
					</h3>
				</div>

				<div className="modal-body space-y-4">
					{/* Alert summary */}
					<div className="p-3 rounded-lg bg-slate-800/60 border border-surface-border">
						<div className="font-semibold text-white text-sm">
							{alert.title}
						</div>
						<div className="flex items-center gap-2 mt-1">
							<span
								className={clsx(
									"px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
									SEV_BADGE[alert.severity],
								)}>
								{alert.severity}
							</span>
							<span className="text-xs text-slate-400">
								{ALERT_TYPE_CONFIG[alert.alert_type]?.label ?? "Alert"}
							</span>
						</div>
						<p className="text-xs text-slate-400 mt-2 line-clamp-2">
							{alert.description}
						</p>
					</div>

					{/* Resolution notes */}
					<div className="input-group">
						<label className="input-label">
							Resolution Notes
							<span className="text-slate-500 font-normal ml-1 text-[10px]">
								optional — recommended for audit trail
							</span>
						</label>
						<textarea
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							rows={4}
							className="textarea"
							placeholder="Describe what was done, root cause, and actions taken to prevent recurrence..."
							maxLength={2000}
						/>
						<div className="text-[10px] text-slate-600 mt-1 text-right">
							{notes.length}/2000
						</div>
					</div>

					{/* Info note */}
					<div className="flex items-start gap-1.5 text-xs text-slate-500">
						<Info size={11} className="shrink-0 mt-0.5" />
						This marks the alert as resolved for your entire organisation. All
						acknowledgements are preserved in the audit log.
					</div>
				</div>

				<div className="modal-footer">
					<button onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						onClick={() => onConfirm(notes)}
						disabled={isPending}
						className="btn-primary bg-green-600 hover:bg-green-500 border-green-500 btn-lg">
						{isPending ? (
							<span className="flex items-center gap-2">
								<Spinner size={16} /> Resolving...
							</span>
						) : (
							<span className="flex items-center gap-2">
								<CheckCircle size={15} /> Confirm Resolved
							</span>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── AuditLogPanel ─────────────────────────────────────────────────────────

const AUDIT_ACTION_OPTIONS = [
	{ value: "alert_triggered", label: "Alert Triggered" },
	{ value: "alert_acknowledged", label: "Alert Acknowledged" },
	{ value: "alert_resolved", label: "Alert Resolved" },
	{ value: "outage_reported", label: "Outage Reported" },
	{ value: "outage_restored", label: "Outage Restored" },
	{ value: "station_created", label: "Station Created" },
	{ value: "station_updated", label: "Station Updated" },
	{ value: "station_deleted", label: "Station Deactivated" },
	{ value: "schedule_updated", label: "Schedule Updated" },
	{ value: "notification_prefs_updated", label: "Notification Prefs Updated" },
	{ value: "role_changed", label: "Role Changed" },
];

const AUDIT_BADGE: Record<string, string> = {
	alert_triggered: "bg-red-500/20 text-red-300 border border-red-500/30",
	alert_acknowledged:
		"bg-amber-500/20 text-amber-300 border border-amber-500/30",
	alert_resolved: "bg-green-500/20 text-green-300 border border-green-500/30",
	outage_reported:
		"bg-purple-500/20 text-purple-300 border border-purple-500/30",
	outage_restored: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
	station_created: "bg-teal-500/20 text-teal-300 border border-teal-500/30",
	station_updated: "bg-slate-500/20 text-slate-300 border border-slate-500/30",
	station_deleted: "bg-red-800/30 text-red-400 border border-red-700/40",
	notification_prefs_updated:
		"bg-indigo-500/20 text-indigo-300 border border-indigo-500/30",
	role_changed: "bg-pink-500/20 text-pink-300 border border-pink-500/30",
	schedule_updated: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30",
};

function AuditLogPanel() {
	const [filterAction, setFilterAction] = useState("");
	const [filterStart, setFilterStart] = useState("");
	const [filterEnd, setFilterEnd] = useState("");

	const queryKey = [...AUDIT_QUERY_KEY, filterAction, filterStart, filterEnd];

	const { data, isLoading, isError, refetch } = useQuery({
		queryKey,
		queryFn: () => {
			const params: Record<string, string> = {};
			if (filterAction) params.action = filterAction;
			if (filterStart) params.start = filterStart;
			if (filterEnd) params.end = filterEnd;
			return api.get("/fm-report/audit-log/", { params }).then((r) => r.data);
		},
		staleTime: 30_000,
		select: (raw: any) => {
			if (Array.isArray(raw)) return raw as AuditLogEntryDTO[];
			if (Array.isArray(raw?.results)) return raw.results as AuditLogEntryDTO[];
			return [] as AuditLogEntryDTO[];
		},
	});

	const entries = data ?? [];

	return (
		<div className="space-y-4">
			{/* Filter bar */}
			<div className="card p-4">
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
					<div className="input-group">
						<label className="input-label">Action</label>
						<select
							value={filterAction}
							onChange={(e) => setFilterAction(e.target.value)}
							className="select-input">
							<option value="">All actions</option>
							{AUDIT_ACTION_OPTIONS.map(({ value, label }) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
					</div>
					<div className="input-group">
						<label className="input-label">From</label>
						<input
							type="date"
							value={filterStart}
							onChange={(e) => setFilterStart(e.target.value)}
							className="input"
						/>
					</div>
					<div className="input-group">
						<label className="input-label">To</label>
						<input
							type="date"
							value={filterEnd}
							onChange={(e) => setFilterEnd(e.target.value)}
							className="input"
						/>
					</div>
				</div>
				{(filterAction || filterStart || filterEnd) && (
					<button
						onClick={() => {
							setFilterAction("");
							setFilterStart("");
							setFilterEnd("");
						}}
						className="mt-2 text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
						<X size={11} /> Clear filters
					</button>
				)}
			</div>

			{/* Entries */}
			{isLoading ? (
				[...Array(6)].map((_, i) => (
					<div key={i} className="skeleton h-14 rounded-lg" />
				))
			) : isError ? (
				<div className="card text-center py-10">
					<WifiOff size={28} className="mx-auto text-red-400 mb-2 opacity-60" />
					<p className="text-slate-400 text-sm">Failed to load audit log.</p>
					<button
						onClick={() => refetch()}
						className="btn-secondary btn-sm mt-3">
						Retry
					</button>
				</div>
			) : entries.length === 0 ? (
				<div className="card text-center py-10">
					<ClipboardList size={28} className="mx-auto text-slate-600 mb-2" />
					<p className="text-slate-500 text-sm">No audit entries found.</p>
				</div>
			) : (
				<div className="card divide-y divide-surface-border/50">
					{entries.map((entry) => (
						<div
							key={entry.id}
							className="flex items-start gap-3 py-3 px-4 text-sm hover:bg-slate-800/20 transition-colors">
							<Clock size={13} className="text-slate-600 shrink-0 mt-0.5" />
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2 flex-wrap">
									<span
										className={clsx(
											"px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase",
											AUDIT_BADGE[entry.action] ??
												"bg-slate-700/60 text-slate-300",
										)}>
										{entry.action_display || entry.action}
									</span>
									{entry.target_repr && (
										<span className="text-slate-300 truncate">
											{entry.target_repr}
										</span>
									)}
								</div>
								<div className="text-xs text-slate-500 mt-0.5">
									by {entry.actor_name || "System"}
								</div>
								{/* Metadata snippets for role changes, outage severity, etc. */}
								{Object.keys(entry.metadata ?? {}).length > 0 && (
									<div className="flex gap-2 mt-1 flex-wrap">
										{Object.entries(entry.metadata).map(([k, v]) => (
											<span
												key={k}
												className="text-[10px] text-slate-600 bg-slate-800/60 rounded px-1.5 py-0.5">
												{k}: {String(v)}
											</span>
										))}
									</div>
								)}
							</div>
							<div className="text-xs text-slate-600 shrink-0 text-right">
								<div>{format(parseISO(entry.created_at), "dd MMM yyyy")}</div>
								<div>{format(parseISO(entry.created_at), "HH:mm")}</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

// ─── NotificationPrefsPanel ────────────────────────────────────────────────

type PrefBoolKey = keyof Pick<
	NotificationPrefDTO,
	| "email_on_outage"
	| "sms_on_outage"
	| "email_on_restored"
	| "sms_on_restored"
	| "email_on_emergency_alert"
	| "sms_on_emergency_alert"
>;

function NotificationPrefsPanel() {
	const qc = useQueryClient();

	const {
		data: savedPrefs,
		isLoading,
		isError,
	} = useQuery<NotificationPrefDTO>({
		queryKey: PREFS_QUERY_KEY,
		queryFn: () =>
			api
				.get("/fm-report/notification-preferences/")
				.then((r) => r.data as NotificationPrefDTO),
	});

	// Local overlay — only the fields the user has changed
	const [draft, setDraft] = useState<
		Partial<NotificationPrefDTO & { phone_number: string }>
	>({});
	const [testChannel, setTestChannel] = useState<"email" | "sms" | null>(null);

	// Merge saved + draft for display
	const prefs: NotificationPrefDTO | null = savedPrefs
		? { ...savedPrefs, ...draft }
		: null;

	const hasChanges = Object.keys(draft).length > 0;

	const saveMutation = useMutation({
		mutationFn: (payload: typeof draft) =>
			api
				.patch("/fm-report/notification-preferences/", payload)
				.then((r) => r.data as NotificationPrefDTO),
		onSuccess: (updated: NotificationPrefDTO) => {
			qc.setQueryData(PREFS_QUERY_KEY, updated);
			setDraft({});
			toast.success("Notification preferences saved");
		},
		onError: (e: any) => {
			const msg =
				e?.phone_number?.[0] ||
				e?.non_field_errors?.[0] ||
				e?.detail ||
				"Failed to save preferences";
			toast.error(msg);
		},
	});

	const testMutation = useMutation({
		mutationFn: (channel: "email" | "sms") =>
			api
				.post("/fm-report/notification-preferences/test-send/", { channel })
				.then((r) => r.data),
		onSuccess: (_: unknown, channel: "email" | "sms") => {
			toast.success(`Test ${channel} sent!`);
			setTestChannel(null);
		},
		onError: (e: any) => {
			toast.error(
				e?.detail || "Test send failed — check server email/SMS configuration.",
			);
			setTestChannel(null);
		},
	});

	const toggleBool = (key: PrefBoolKey) =>
		setDraft((p) => ({
			...p,
			[key]: !(prefs as any)?.[key],
		}));

	const smsEnabled =
		prefs?.sms_on_outage ||
		prefs?.sms_on_restored ||
		prefs?.sms_on_emergency_alert;

	if (isLoading) return <div className="skeleton h-72 rounded-xl" />;

	if (isError || !prefs)
		return (
			<div className="card text-center py-10">
				<WifiOff size={28} className="mx-auto text-red-400 mb-2" />
				<p className="text-sm text-slate-400">
					Failed to load notification preferences.
				</p>
			</div>
		);

	return (
		<div className="space-y-4 max-w-2xl">
			<div className="card p-5 space-y-5">
				<div className="flex items-center justify-between">
					<h3 className="font-semibold text-white flex items-center gap-2">
						<Bell size={16} className="text-nexus-400" />
						FM Alert Notification Settings
					</h3>
					<span className="text-xs text-slate-500">
						Applies to your account only
					</span>
				</div>

				{/* Phone number */}
				<div className="input-group">
					<label className="input-label flex items-center gap-1.5">
						<Phone size={12} /> Phone Number
						<span className="text-slate-500 font-normal text-[10px]">
							(required for SMS alerts)
						</span>
					</label>
					<input
						type="tel"
						value={draft.phone_number ?? prefs.phone_number ?? ""}
						onChange={(e) =>
							setDraft((p) => ({ ...p, phone_number: e.target.value }))
						}
						placeholder="+254712345678"
						className={clsx(
							"input",
							smsEnabled && !prefs.phone_number && "border-amber-500/60",
						)}
					/>
					{smsEnabled && !prefs.phone_number && (
						<p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
							<AlertCircle size={11} />
							Add a phone number to receive SMS alerts.
						</p>
					)}
					<p className="text-[10px] text-slate-600 mt-1">
						E.164 format — e.g. +254712345678
					</p>
				</div>

				{/* Minimum severity */}
				<div className="input-group">
					<label className="input-label">Minimum Severity to Notify</label>
					<select
						value={
							draft.fm_minimum_severity ?? prefs.fm_minimum_severity ?? "low"
						}
						onChange={(e) =>
							setDraft((p) => ({ ...p, fm_minimum_severity: e.target.value }))
						}
						className="select-input">
						<option value="low">Low and above (all alerts)</option>
						<option value="medium">Medium and above</option>
						<option value="high">High and above</option>
						<option value="critical">Critical only</option>
					</select>
				</div>

				{/* Toggle grid */}
				<div>
					<div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
						Notify me when…
					</div>
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
						<PrefGroup
							title="Station Outage"
							description="When a station goes off-air"
							emailKey="email_on_outage"
							smsKey="sms_on_outage"
							prefs={prefs}
							onToggle={toggleBool}
						/>
						<PrefGroup
							title="Station Restored"
							description="When a station comes back on-air"
							emailKey="email_on_restored"
							smsKey="sms_on_restored"
							prefs={prefs}
							onToggle={toggleBool}
						/>
						<PrefGroup
							title="Emergency Alert"
							description="When an emergency alert is triggered"
							emailKey="email_on_emergency_alert"
							smsKey="sms_on_emergency_alert"
							prefs={prefs}
							onToggle={toggleBool}
						/>
					</div>
				</div>

				{/* Action row */}
				<div className="flex items-center justify-between pt-3 border-t border-surface-border/50 flex-wrap gap-3">
					<div className="flex items-center gap-2">
						{/* Test email */}
						<button
							onClick={() => {
								setTestChannel("email");
								testMutation.mutate("email");
							}}
							disabled={testMutation.isPending && testChannel === "email"}
							className="btn-secondary btn-sm text-xs flex items-center gap-1.5">
							{testMutation.isPending && testChannel === "email" ? (
								<Spinner size={12} />
							) : (
								<Send size={11} />
							)}
							Test Email
						</button>

						{/* Test SMS */}
						<button
							onClick={() => {
								setTestChannel("sms");
								testMutation.mutate("sms");
							}}
							disabled={
								(testMutation.isPending && testChannel === "sms") ||
								!prefs.phone_number
							}
							title={
								!prefs.phone_number
									? "Add a phone number first"
									: "Send a test SMS"
							}
							className={clsx(
								"btn-secondary btn-sm text-xs flex items-center gap-1.5",
								!prefs.phone_number && "opacity-50 cursor-not-allowed",
							)}>
							{testMutation.isPending && testChannel === "sms" ? (
								<Spinner size={12} />
							) : (
								<Phone size={11} />
							)}
							Test SMS
						</button>
					</div>

					{/* Save */}
					<button
						onClick={() => saveMutation.mutate(draft)}
						disabled={!hasChanges || saveMutation.isPending}
						className={clsx(
							"btn-primary btn-sm",
							(!hasChanges || saveMutation.isPending) && "opacity-60",
						)}>
						{saveMutation.isPending ? (
							<span className="flex items-center gap-2">
								<Spinner size={12} /> Saving…
							</span>
						) : (
							"Save Preferences"
						)}
					</button>
				</div>
			</div>

			{/* Info callout */}
			<div className="flex items-start gap-2 text-xs text-slate-500 px-1">
				<Info size={12} className="shrink-0 mt-0.5" />
				<span>
					These settings control which FM-related events trigger a notification
					to{" "}
					<span className="text-slate-300">
						{useAuthStore.getState().user?.email}
					</span>
					. Emergency alerts from your organisation are always sent to all
					broadcast admins regardless of this setting — these toggles only
					control supplementary personal notifications.
				</span>
			</div>
		</div>
	);
}

// ─── PrefGroup ─────────────────────────────────────────────────────────────

function PrefGroup({
	title,
	description,
	emailKey,
	smsKey,
	prefs,
	onToggle,
}: {
	title: string;
	description: string;
	emailKey: PrefBoolKey;
	smsKey: PrefBoolKey;
	prefs: NotificationPrefDTO;
	onToggle: (key: PrefBoolKey) => void;
}) {
	return (
		<div className="bg-slate-800/40 rounded-xl p-4 border border-surface-border/40 space-y-3">
			<div>
				<div className="text-xs font-semibold text-slate-200">{title}</div>
				<div className="text-[10px] text-slate-500 mt-0.5">{description}</div>
			</div>
			<div className="space-y-2">
				<ToggleRow
					label="Email"
					icon={<Mail size={11} />}
					enabled={prefs[emailKey]}
					onToggle={() => onToggle(emailKey)}
				/>
				<ToggleRow
					label="SMS"
					icon={<Phone size={11} />}
					enabled={prefs[smsKey]}
					onToggle={() => onToggle(smsKey)}
				/>
			</div>
		</div>
	);
}

// ─── ToggleRow ─────────────────────────────────────────────────────────────

function ToggleRow({
	label,
	icon,
	enabled,
	onToggle,
}: {
	label: string;
	icon: ReactNode;
	enabled: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors">
			<span className="flex items-center gap-1.5">
				{icon} {label}
			</span>
			{/* Simple pill toggle — no lucide dep on ToggleLeft/ToggleRight */}
			<span
				className={clsx(
					"relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
					enabled ? "bg-nexus-500" : "bg-slate-700",
				)}>
				<span
					className={clsx(
						"inline-block h-3 w-3 rounded-full bg-white shadow transition-transform",
						enabled ? "translate-x-3.5" : "translate-x-0.5",
					)}
				/>
			</span>
		</button>
	);
}
