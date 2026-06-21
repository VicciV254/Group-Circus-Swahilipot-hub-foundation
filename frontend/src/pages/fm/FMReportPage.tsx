// pages/fm/FMReportPage.tsx
// Nexus FM — Broadcast Operations Center
//
// One operational surface for FM transmitter monitoring:
//   • Emergency Alerts — org-wide incident broadcast + acknowledgement
//   • Stations         — live status grid, manual down/restore, CRUD (admin)
//   • Outage History   — filterable log with CSV/PDF export
//   • Stream Health     — on-demand live-stream reachability check
//
// Backend: apps/fm_report (urls.py / views.py). Keep DTOs in sync with
// services/fmReportApi.ts if the serializers change shape.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
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
	Activity,
	Plus,
	Pencil,
	Trash2,
	Download,
	FileText,
	Wifi,
	Clock,
	PlayCircle,
	Calendar,
	Map as MapIcon,
	BarChart3,
	History,
	Settings as SettingsIcon,
} from "lucide-react";
import { useAuthStore } from "../../services/api";
import {
	fmReportApi,
	type FMStation,
	type FMOutage,
	type EmergencyAlertDTO,
	type OutageSeverity,
	type AlertSeverity,
	type OutageFilters,
} from "../../services/Fmreportapi";
import {
	LivePlayerTab,
	ScheduleTab,
	MapTab,
	AnalyticsTab,
	ActivityTab,
	SettingsTab,
	PlayerProvider,
	MiniPlayerBar,
	usePlayer,
} from "./Fmopsextratabs";
import {
	SEVERITY_STYLES,
	errorMessage,
	fieldErrorsFrom,
	StatCard,
	EmptyState,
	ErrorBanner,
	Spinner,
	Field,
	Modal,
	ScrollFadeRow,
} from "./Fmshared";
import toast from "react-hot-toast";
import clsx from "clsx";

// ─── SHARED CONFIG ───────────────────────────────────────────────────────────

const ALERT_TYPE_CONFIG: Record<string, { icon: any; label: string }> = {
	fm_outage: { icon: Radio, label: "FM Station Outage" },
	system_down: { icon: Server, label: "System Down" },
	security_breach: { icon: Shield, label: "Security Breach" },
	infrastructure: { icon: Zap, label: "Infrastructure Failure" },
	data_breach: { icon: Database, label: "Data Breach" },
	fire: { icon: Flame, label: "Fire / Evacuation" },
	emergency: { icon: AlertTriangle, label: "General Emergency" },
	other: { icon: Info, label: "Other" },
};

type TabKey =
	| "alerts"
	| "stations"
	| "outages"
	| "stream"
	| "player"
	| "schedule"
	| "map"
	| "analytics"
	| "activity"
	| "settings";

const TABS: { key: TabKey; label: string; icon: any }[] = [
	{ key: "alerts", label: "Emergency Alerts", icon: Siren },
	{ key: "stations", label: "Stations", icon: Radio },
	{ key: "player", label: "Live Player", icon: PlayCircle },
	{ key: "schedule", label: "Schedule", icon: Calendar },
	{ key: "outages", label: "Outage History", icon: Clock },
	{ key: "stream", label: "Stream Health", icon: Activity },
	{ key: "map", label: "Station Map", icon: MapIcon },
	{ key: "analytics", label: "Analytics", icon: BarChart3 },
	{ key: "activity", label: "Activity Log", icon: History },
	{ key: "settings", label: "Settings", icon: SettingsIcon },
];

// ─── PAGE ────────────────────────────────────────────────────────────────────
// The live-radio engine (audio element, analyser, volume, favorites, sleep
// timer) lives in PlayerProvider so playback survives switching tabs — the
// MiniPlayerBar it renders stays visible no matter which section is open.

export default function FmOpsPage() {
	return (
		<PlayerProvider>
			<FmOpsPageInner />
		</PlayerProvider>
	);
}

function FmOpsPageInner() {
	const { user } = useAuthStore();
	const isAdmin =
		user?.role === "system_admin" || user?.role === "broadcast_admin";
	const [tab, setTab] = useState<TabKey>("alerts");
	const { stream } = usePlayer();

	// Active-alert + active-outage counts feed the tab badges so problems are
	// visible no matter which tab you're currently looking at.
	const { data: alerts } = useQuery({
		queryKey: ["emergency-alerts"],
		queryFn: () => fmReportApi.listAlerts().then((r) => r.data),
		refetchInterval: 10_000,
	});
	const { data: stationsPage } = useQuery({
		queryKey: ["fm-stations"],
		queryFn: () => fmReportApi.listStations().then((r) => r.data),
		refetchInterval: 30_000,
	});

	const activeAlertCount = (alerts || []).filter((a) => !a.resolved).length;
	const stations = stationsPage?.results || [];
	const onAirCount = stations.filter(
		(s) => s.current_status === "on_air",
	).length;
	const downStationCount = stations.filter(
		(s) => s.current_status === "off_air",
	).length;
	const avgUptime = stations.length
		? Math.round(
				(stations.reduce((sum, s) => sum + s.uptime_percent_today, 0) /
					stations.length) *
					10,
			) / 10
		: null;

	// Keep the active tab scrolled into view inside the (now contained)
	// scrollable tab strip whenever it changes.
	useEffect(() => {
		document
			.getElementById(`fm-tab-${tab}`)
			?.scrollIntoView({
				behavior: "smooth",
				inline: "center",
				block: "nearest",
			});
	}, [tab]);

	return (
		<div className={clsx("space-y-6 animate-fade-in", stream && "pb-24")}>
			<div className="page-header flex-wrap gap-3">
				<div className="min-w-0">
					<h1 className="page-title flex items-center gap-2">
						<Radio
							size={22}
							className="text-nexus-400 shrink-0"
							aria-hidden="true"
						/>
						<span className="truncate">Broadcast Operations Center</span>
					</h1>
					<p className="page-subtitle">
						FM transmitter monitoring, outage tracking, and emergency
						communications
					</p>
				</div>
				<LiveClock />
			</div>

			{/* At-a-glance system status — the "mission control" strip */}
			<div className="flex flex-wrap items-center gap-2">
				<HeaderChip
					icon={Siren}
					label="active alerts"
					value={activeAlertCount}
					tone={activeAlertCount > 0 ? "red" : "green"}
				/>
				<HeaderChip
					icon={Wifi}
					label="on air"
					value={onAirCount}
					tone="green"
				/>
				<HeaderChip
					icon={WifiOff}
					label="off air"
					value={downStationCount}
					tone={downStationCount > 0 ? "red" : "slate"}
				/>
				{avgUptime !== null && (
					<HeaderChip
						icon={Activity}
						label="avg uptime today"
						value={`${avgUptime}%`}
						tone={avgUptime >= 99 ? "green" : avgUptime >= 95 ? "amber" : "red"}
					/>
				)}
			</div>

			<nav
				role="tablist"
				aria-label="Operations sections"
				className="bg-surface-card border border-surface-border rounded-xl p-1 w-full">
				<ScrollFadeRow>
					{TABS.map((t) => {
						const Icon = t.icon;
						const badge =
							t.key === "alerts" && activeAlertCount > 0
								? activeAlertCount
								: t.key === "stations" && downStationCount > 0
									? downStationCount
									: null;
						return (
							<button
								id={`fm-tab-${t.key}`}
								key={t.key}
								role="tab"
								aria-selected={tab === t.key}
								aria-label={t.label}
								title={t.label}
								onClick={() => setTab(t.key)}
								className={clsx(
									"shrink-0 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap",
									tab === t.key
										? "bg-nexus-600 text-white shadow-sm"
										: "text-slate-400 hover:text-white hover:bg-white/5",
								)}>
								<Icon size={15} className="shrink-0" />
								<span className="hidden sm:inline">{t.label}</span>
								{badge !== null && (
									<span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
										{badge}
									</span>
								)}
							</button>
						);
					})}
				</ScrollFadeRow>
			</nav>

			{tab === "alerts" && <AlertsTab isAdmin={isAdmin} stations={stations} />}
			{tab === "stations" && <StationsTab isAdmin={isAdmin} />}
			{tab === "player" && <LivePlayerTab stations={stations} />}
			{tab === "schedule" && (
				<ScheduleTab stations={stations} isAdmin={isAdmin} />
			)}
			{tab === "outages" && <OutagesTab stations={stations} />}
			{tab === "stream" && <StreamHealthTab stations={stations} />}
			{tab === "map" && <MapTab stations={stations} />}
			{tab === "analytics" && <AnalyticsTab stations={stations} />}
			{tab === "activity" && <ActivityTab />}
			{tab === "settings" && <SettingsTab isAdmin={isAdmin} />}

			<MiniPlayerBar />
		</div>
	);
}

function LiveClock() {
	const [now, setNow] = useState(new Date());
	useEffect(() => {
		const id = window.setInterval(() => setNow(new Date()), 1000);
		return () => window.clearInterval(id);
	}, []);
	return (
		<div className="hidden md:flex flex-col items-end shrink-0 text-right">
			<span className="text-sm font-semibold text-white tabular-nums">
				{format(now, "HH:mm:ss")}
			</span>
			<span className="text-[11px] text-slate-500">
				{format(now, "EEE, dd MMM yyyy")}
			</span>
		</div>
	);
}

function HeaderChip({
	icon: Icon,
	label,
	value,
	tone,
}: {
	icon: any;
	label: string;
	value: number | string;
	tone: "green" | "red" | "slate" | "amber" | "blue";
}) {
	return (
		<div
			className={clsx(
				"inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-lg border text-xs",
				{
					"bg-green-500/10 border-green-500/30": tone === "green",
					"bg-red-500/10 border-red-500/30": tone === "red",
					"bg-slate-500/10 border-slate-500/30": tone === "slate",
					"bg-amber-500/10 border-amber-500/30": tone === "amber",
					"bg-blue-500/10 border-blue-500/30": tone === "blue",
				},
			)}>
			<span
				className={clsx("w-6 h-6 rounded-md flex items-center justify-center", {
					"bg-green-500/20 text-green-300": tone === "green",
					"bg-red-500/20 text-red-300": tone === "red",
					"bg-slate-500/20 text-slate-300": tone === "slate",
					"bg-amber-500/20 text-amber-300": tone === "amber",
					"bg-blue-500/20 text-blue-300": tone === "blue",
				})}>
				<Icon size={12} />
			</span>
			<span className="text-white font-semibold">{value}</span>
			<span className="text-slate-500">{label}</span>
		</div>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 1 — EMERGENCY ALERTS
// ═══════════════════════════════════════════════════════════════════════════

function AlertsTab({
	isAdmin,
	stations,
}: {
	isAdmin: boolean;
	stations: FMStation[];
}) {
	const qc = useQueryClient();
	const [showTriggerModal, setShowTriggerModal] = useState(false);
	const [filter, setFilter] = useState<"active" | "all">("active");
	const [pendingId, setPendingId] = useState<string | null>(null);

	const QK = ["emergency-alerts"] as const;

	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: QK,
		queryFn: () => fmReportApi.listAlerts().then((r) => r.data),
		refetchInterval: 10_000,
		retry: 2,
	});

	const alerts = data || [];
	const activeAlerts = useMemo(
		() => alerts.filter((a) => !a.resolved),
		[alerts],
	);
	const displayed = filter === "active" ? activeAlerts : alerts;

	const acknowledgeMutation = useMutation({
		mutationFn: (id: string) =>
			fmReportApi.acknowledgeAlert(id).then((r) => ({ id, data: r.data })),
		onMutate: async (id: string) => {
			setPendingId(id);
			await qc.cancelQueries({ queryKey: QK });
			const previous = qc.getQueryData<EmergencyAlertDTO[]>(QK);
			qc.setQueryData<EmergencyAlertDTO[]>(QK, (old) =>
				(old || []).map((a) =>
					a.id === id
						? {
								...a,
								resolved: true,
								acknowledged_count: a.acknowledged_count + 1,
							}
						: a,
				),
			);
			return { previous };
		},
		onSuccess: ({ id, data }) => {
			qc.setQueryData<EmergencyAlertDTO[]>(QK, (old) =>
				(old || []).map((a) => (a.id === id ? { ...a, ...data } : a)),
			);
			toast.success("Alert acknowledged");
		},
		onError: (e, _id, context) => {
			if (context?.previous) qc.setQueryData(QK, context.previous);
			toast.error(errorMessage(e, "Failed to acknowledge alert"));
		},
		onSettled: () => setPendingId(null),
	});

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between flex-wrap gap-3">
				<div className="flex items-center gap-2">
					{activeAlerts.length > 0 && (
						<span className="inline-flex items-center px-2.5 py-1 rounded-full bg-red-500 text-white text-xs font-bold animate-pulse">
							{activeAlerts.length} ACTIVE
						</span>
					)}
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
							onClick={() => setShowTriggerModal(true)}
							className="emergency-btn btn-lg">
							<Siren size={18} /> SEND EMERGENCY ALERT
						</button>
					)}
				</div>
			</div>

			{isError && (
				<ErrorBanner
					message={errorMessage(error, "Couldn't load alerts.")}
					onRetry={refetch}
				/>
			)}

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
						{activeAlerts.map((a) => (
							<div
								key={a.id}
								className="flex items-center justify-between p-3 bg-red-900/30 rounded-lg">
								<div>
									<span className="font-semibold text-white text-sm">
										{a.title}
									</span>
									<span
										className={clsx(
											"ml-2 badge uppercase text-[10px]",
											SEVERITY_STYLES[a.severity],
										)}>
										{a.severity}
									</span>
								</div>
								{isAdmin && (
									<button
										onClick={() => acknowledgeMutation.mutate(a.id)}
										disabled={pendingId === a.id}
										className="btn-secondary btn-sm text-xs">
										{pendingId === a.id ? (
											<Spinner />
										) : (
											<CheckCircle size={12} />
										)}{" "}
										Acknowledge
									</button>
								)}
							</div>
						))}
					</div>
				</div>
			)}

			{!isError &&
				activeAlerts.length === 0 &&
				!isLoading &&
				alerts.length > 0 && (
					<div className="p-4 rounded-xl border border-green-500/40 bg-green-900/10 flex items-center gap-3">
						<CheckCircle size={20} className="text-green-400 shrink-0" />
						<span className="font-semibold text-green-400 text-sm">
							All alerts acknowledged — no active emergencies
						</span>
					</div>
				)}

			<div
				role="tablist"
				className="flex gap-1 p-1 bg-surface-card border border-surface-border rounded-xl w-fit">
				<button
					role="tab"
					aria-selected={filter === "active"}
					onClick={() => setFilter("active")}
					className={clsx(
						"px-5 py-2 rounded-lg text-sm font-medium transition-all",
						{
							"bg-nexus-600 text-white": filter === "active",
							"text-slate-400 hover:text-white": filter !== "active",
						},
					)}>
					Active ({activeAlerts.length})
				</button>
				<button
					role="tab"
					aria-selected={filter === "all"}
					onClick={() => setFilter("all")}
					className={clsx(
						"px-5 py-2 rounded-lg text-sm font-medium transition-all",
						{
							"bg-nexus-600 text-white": filter === "all",
							"text-slate-400 hover:text-white": filter !== "all",
						},
					)}>
					All History ({alerts.length})
				</button>
			</div>

			<div className="space-y-4">
				{isLoading ? (
					[...Array(3)].map((_, i) => (
						<div key={i} className="skeleton h-40 rounded-xl" />
					))
				) : isError ? null : displayed.length === 0 ? (
					<EmptyState
						icon={CheckCircle}
						message={
							filter === "active"
								? "No active emergencies — all systems operational"
								: "No alerts found"
						}
					/>
				) : (
					displayed.map((alert) => (
						<AlertCard
							key={alert.id}
							alert={alert}
							isAdmin={isAdmin}
							isPending={pendingId === alert.id}
							onAcknowledge={() => acknowledgeMutation.mutate(alert.id)}
						/>
					))
				)}
			</div>

			{showTriggerModal && (
				<TriggerAlertModal
					stations={stations}
					onClose={() => setShowTriggerModal(false)}
					onSuccess={() => {
						qc.invalidateQueries({ queryKey: QK });
						setShowTriggerModal(false);
					}}
				/>
			)}
		</div>
	);
}

function AlertCard({
	alert,
	isAdmin,
	isPending,
	onAcknowledge,
}: {
	alert: EmergencyAlertDTO;
	isAdmin: boolean;
	isPending: boolean;
	onAcknowledge: () => void;
}) {
	const cfg = ALERT_TYPE_CONFIG[alert.alert_type] || ALERT_TYPE_CONFIG.other;
	const Icon = cfg.icon;
	const resolved = alert.resolved;

	return (
		<div
			className={clsx("card border-l-4 transition-all duration-300", {
				"border-l-red-500":
					!resolved &&
					(alert.severity === "critical" || alert.severity === "high"),
				"border-l-amber-500": !resolved && alert.severity === "medium",
				"border-l-blue-500": !resolved && alert.severity === "low",
				"border-l-green-500": resolved,
				"opacity-60": resolved,
			})}>
			<div className="flex items-start gap-4">
				<div
					className={clsx(
						"w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
						resolved ? "bg-green-500/15" : "bg-red-500/15",
					)}>
					<Icon
						size={20}
						className={resolved ? "text-green-400" : "text-red-400"}
					/>
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-start justify-between gap-3 flex-wrap">
						<div>
							<h3 className="font-semibold text-white">{alert.title}</h3>
							<div className="flex items-center gap-2 mt-1 flex-wrap">
								<span className="text-xs text-slate-400">{cfg.label}</span>
								<span
									className={clsx(
										"badge uppercase text-[10px]",
										SEVERITY_STYLES[alert.severity],
									)}>
									{alert.severity}
								</span>
								{resolved ? (
									<span className="badge-green text-[10px]">Resolved</span>
								) : (
									<span className="badge-red text-[10px] animate-pulse">
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
						</div>
					</div>

					<p className="text-sm text-slate-300 mt-2 leading-relaxed">
						{alert.description}
					</p>

					{alert.affected_systems?.length > 0 && (
						<div className="flex flex-wrap gap-1.5 mt-2">
							{alert.affected_systems.map((sys) => (
								<span key={sys} className="badge-slate text-[10px]">
									{sys}
								</span>
							))}
						</div>
					)}

					{alert.notification_errors?.length > 0 && (
						<div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
							<AlertTriangle size={11} />
							{alert.notification_errors.length} notification
							{alert.notification_errors.length !== 1 ? "s" : ""} failed to send
						</div>
					)}

					<div className="flex items-center gap-4 mt-3 pt-3 border-t border-surface-border/50 flex-wrap">
						<div className="flex items-center gap-1.5 text-xs text-slate-500">
							<Bell size={11} />
							Notified: {alert.notified_emails?.length || 0} email
							{alert.notified_emails?.length !== 1 ? "s" : ""},{" "}
							{alert.notified_phones?.length || 0} SMS
						</div>
						<div className="flex items-center gap-1.5 text-xs text-slate-500">
							<CheckCircle size={11} />
							{alert.acknowledged_count} acknowledgement
							{alert.acknowledged_count !== 1 ? "s" : ""}
						</div>
						{alert.acknowledgements?.length > 0 && (
							<div className="text-xs text-slate-500">
								{alert.acknowledgements
									.slice(0, 3)
									.map((a) => a.user_name)
									.filter(Boolean)
									.join(", ")}
								{alert.acknowledgements.length > 3
									? ` +${alert.acknowledgements.length - 3} more`
									: ""}
							</div>
						)}
						{!resolved && isAdmin && (
							<button
								onClick={onAcknowledge}
								disabled={isPending}
								className="ml-auto btn-secondary btn-sm text-xs">
								{isPending ? <Spinner /> : <CheckCircle size={12} />}{" "}
								Acknowledge
							</button>
						)}
					</div>

					{alert.resolution_notes && (
						<div className="mt-3 p-3 bg-green-900/20 rounded-lg border border-green-500/20">
							<div className="text-xs text-green-400 font-semibold mb-1">
								Resolution Notes
							</div>
							<p className="text-xs text-slate-300">{alert.resolution_notes}</p>
							{alert.resolved_at && (
								<div className="text-[10px] text-slate-500 mt-1">
									Resolved{" "}
									{alert.resolved_by_name
										? `by ${alert.resolved_by_name} `
										: ""}
									at {format(parseISO(alert.resolved_at), "dd MMM yyyy, HH:mm")}
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

interface TriggerForm {
	alert_type: string;
	title: string;
	description: string;
	severity: AlertSeverity;
	affected_systems: string[];
	related_station: string | null;
}

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

function TriggerAlertModal({
	stations,
	onClose,
	onSuccess,
}: {
	stations: FMStation[];
	onClose: () => void;
	onSuccess: () => void;
}) {
	const [form, setForm] = useState<TriggerForm>({
		alert_type: "emergency",
		title: "",
		description: "",
		severity: "high",
		affected_systems: [],
		related_station: null,
	});
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

	const mutation = useMutation({
		mutationFn: (data: TriggerForm) => fmReportApi.triggerAlert(data),
		onSuccess: () => {
			toast.success("🚨 Emergency alert dispatched!", { duration: 6000 });
			onSuccess();
		},
		onError: (e) => {
			setFieldErrors(fieldErrorsFrom(e));
			toast.error(errorMessage(e, "Failed to dispatch alert"));
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
	const descriptionValid = form.description.trim().length >= 10;
	const canSubmit = titleValid && descriptionValid && !mutation.isPending;

	return (
		<Modal onClose={onClose} labelledBy="trigger-alert-title">
			<div className="modal-header bg-red-950/40 border-b border-red-500/30">
				<h3
					id="trigger-alert-title"
					className="text-xl font-display font-bold text-red-400 flex items-center gap-2">
					<Siren size={22} className="animate-bounce" /> Send Emergency Alert
				</h3>
			</div>
			<div className="modal-body space-y-4">
				<div className="alert alert-danger">
					<AlertTriangle size={15} className="shrink-0" />
					<div>
						<div className="font-semibold text-sm">
							This immediately notifies all admins and emergency contacts via
							email and SMS.
						</div>
						<div className="text-xs mt-0.5 text-red-300">
							Use only for genuine emergencies.
						</div>
					</div>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

				{form.alert_type === "fm_outage" && stations.length > 0 && (
					<div className="input-group">
						<label className="input-label">Related Station (optional)</label>
						<select
							value={form.related_station || ""}
							onChange={(e) =>
								setForm((p) => ({
									...p,
									related_station: e.target.value || null,
								}))
							}
							className="select-input">
							<option value="">None</option>
							{stations.map((s) => (
								<option key={s.id} value={s.id}>
									{s.name} ({s.frequency})
								</option>
							))}
						</select>
					</div>
				)}

				<div className="input-group">
					<label className="input-label">Alert Title *</label>
					<input
						value={form.title}
						onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
						maxLength={200}
						placeholder="Brief, clear description of the emergency"
						className="input"
					/>
					{fieldErrors.title && (
						<p className="text-xs text-red-400 mt-1">{fieldErrors.title}</p>
					)}
				</div>

				<div className="input-group">
					<label className="input-label">Full Description *</label>
					<textarea
						value={form.description}
						onChange={(e) =>
							setForm((p) => ({ ...p, description: e.target.value }))
						}
						rows={4}
						className="textarea"
						placeholder="Describe the situation, current status, and what immediate action is needed..."
					/>
					{fieldErrors.description && (
						<p className="text-xs text-red-400 mt-1">
							{fieldErrors.description}
						</p>
					)}
				</div>

				<div className="input-group">
					<label className="input-label">Affected Systems</label>
					<div className="flex flex-wrap gap-2 mt-1">
						{SYSTEMS.map((sys) => (
							<button
								key={sys}
								type="button"
								onClick={() => toggleSystem(sys)}
								className={clsx("btn btn-sm border text-xs", {
									"bg-red-900/40 border-red-500/40 text-red-300":
										form.affected_systems.includes(sys),
									"border-surface-border text-slate-400 hover:border-slate-500":
										!form.affected_systems.includes(sys),
								})}>
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
							<Spinner light /> Dispatching...
						</span>
					) : (
						<span className="flex items-center gap-2">
							<Bell size={16} /> DISPATCH ALERT
						</span>
					)}
				</button>
			</div>
		</Modal>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 2 — STATIONS
// ═══════════════════════════════════════════════════════════════════════════

function StationsTab({ isAdmin }: { isAdmin: boolean }) {
	const qc = useQueryClient();
	const QK = ["fm-stations"] as const;
	const [showFormModal, setShowFormModal] = useState<
		"create" | FMStation | null
	>(null);
	const [downModalStation, setDownModalStation] = useState<FMStation | null>(
		null,
	);
	const [restoreModalStation, setRestoreModalStation] =
		useState<FMStation | null>(null);

	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: QK,
		queryFn: () => fmReportApi.listStations().then((r) => r.data),
		refetchInterval: 30_000,
	});

	const stations = data?.results || [];
	const onAir = stations.filter((s) => s.current_status === "on_air").length;
	const offAir = stations.filter((s) => s.current_status === "off_air").length;

	const deleteMutation = useMutation({
		mutationFn: (id: string) => fmReportApi.deleteStation(id),
		onSuccess: () => {
			toast.success("Station removed");
			qc.invalidateQueries({ queryKey: QK });
		},
		onError: (e) => toast.error(errorMessage(e, "Failed to remove station")),
	});

	return (
		<div className="space-y-6">
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<StatCard
					icon={Radio}
					label="Total Stations"
					value={stations.length}
					tone="slate"
				/>
				<StatCard icon={Wifi} label="On Air" value={onAir} tone="green" />
				<StatCard
					icon={WifiOff}
					label="Off Air"
					value={offAir}
					tone={offAir > 0 ? "red" : "slate"}
				/>
			</div>

			<div className="flex items-center justify-between flex-wrap gap-3">
				<h2 className="font-semibold text-white">Station Status</h2>
				<div className="flex items-center gap-2">
					<button
						onClick={() => refetch()}
						disabled={isFetching}
						className="btn-secondary btn-sm">
						<RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
					</button>
					{isAdmin && (
						<button
							onClick={() => setShowFormModal("create")}
							className="btn-primary btn-sm">
							<Plus size={14} /> Add Station
						</button>
					)}
				</div>
			</div>

			{isError && (
				<ErrorBanner
					message={errorMessage(error, "Couldn't load stations.")}
					onRetry={refetch}
				/>
			)}

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{isLoading ? (
					[...Array(3)].map((_, i) => (
						<div key={i} className="skeleton h-48 rounded-xl" />
					))
				) : stations.length === 0 ? (
					<div className="md:col-span-2 lg:col-span-3">
						<EmptyState icon={Radio} message="No stations configured yet" />
					</div>
				) : (
					stations.map((station) => (
						<StationCard
							key={station.id}
							station={station}
							isAdmin={isAdmin}
							onReportDown={() => setDownModalStation(station)}
							onReportRestored={() => setRestoreModalStation(station)}
							onEdit={() => setShowFormModal(station)}
							onDelete={() => {
								if (
									confirm(
										`Remove ${station.name}? This deactivates the station; history is kept.`,
									)
								) {
									deleteMutation.mutate(station.id);
								}
							}}
						/>
					))
				)}
			</div>

			{showFormModal && (
				<StationFormModal
					station={showFormModal === "create" ? null : showFormModal}
					onClose={() => setShowFormModal(null)}
					onSuccess={() => {
						qc.invalidateQueries({ queryKey: QK });
						setShowFormModal(null);
					}}
				/>
			)}
			{downModalStation && (
				<ReportDownModal
					station={downModalStation}
					onClose={() => setDownModalStation(null)}
					onSuccess={() => {
						qc.invalidateQueries({ queryKey: QK });
						setDownModalStation(null);
					}}
				/>
			)}
			{restoreModalStation && (
				<ReportRestoredModal
					station={restoreModalStation}
					onClose={() => setRestoreModalStation(null)}
					onSuccess={() => {
						qc.invalidateQueries({ queryKey: QK });
						setRestoreModalStation(null);
					}}
				/>
			)}
		</div>
	);
}

function StationCard({
	station,
	isAdmin,
	onReportDown,
	onReportRestored,
	onEdit,
	onDelete,
}: {
	station: FMStation;
	isAdmin: boolean;
	onReportDown: () => void;
	onReportRestored: () => void;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const isOnAir = station.current_status === "on_air";
	const isOffAir = station.current_status === "off_air";

	return (
		<div
			className={clsx("card border-l-4", {
				"border-l-green-500": isOnAir,
				"border-l-red-500": isOffAir,
				"border-l-slate-500": !isOnAir && !isOffAir,
			})}>
			<div className="flex items-start justify-between gap-2">
				<div>
					<h3 className="font-semibold text-white">{station.name}</h3>
					<p className="text-xs text-slate-400">
						{station.frequency}
						{station.location ? ` · ${station.location}` : ""}
					</p>
				</div>
				<span
					className={clsx(
						"badge uppercase text-[10px] flex items-center gap-1",
						{
							"badge-green": isOnAir,
							"badge-red": isOffAir,
							"badge-slate": !isOnAir && !isOffAir,
						},
					)}>
					{isOnAir ? <Wifi size={10} /> : <WifiOff size={10} />}
					{station.current_status.replace("_", " ")}
				</span>
			</div>

			<div className="mt-3 grid grid-cols-2 gap-2 text-xs">
				<div className="bg-surface-card/60 rounded-lg p-2">
					<div className="text-slate-500">Uptime today</div>
					<div className="text-white font-semibold">
						{station.uptime_percent_today}%
					</div>
				</div>
				<div className="bg-surface-card/60 rounded-lg p-2">
					<div className="text-slate-500">Status for</div>
					<div className="text-white font-semibold">
						{station.time_since_change || "—"}
					</div>
				</div>
			</div>

			{station.heartbeat_overdue && (
				<div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
					<AlertTriangle size={11} /> Heartbeat overdue
				</div>
			)}

			{station.active_outage && (
				<div className="mt-2 p-2 bg-red-900/20 rounded-lg border border-red-500/20 text-xs text-red-300">
					Down since{" "}
					{format(parseISO(station.active_outage.down_at), "dd MMM, HH:mm")}
					{station.active_outage.description &&
						` — ${station.active_outage.description}`}
				</div>
			)}

			{isAdmin && (
				<div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-border/50">
					{isOffAir ? (
						<button
							onClick={onReportRestored}
							className="btn-secondary btn-sm text-xs flex-1">
							<CheckCircle size={12} /> Mark Restored
						</button>
					) : (
						<button
							onClick={onReportDown}
							className="btn-secondary btn-sm text-xs flex-1 text-red-400">
							<WifiOff size={12} /> Report Down
						</button>
					)}
					<button
						onClick={onEdit}
						aria-label={`Edit ${station.name}`}
						className="btn-secondary btn-sm px-2">
						<Pencil size={12} />
					</button>
					<button
						onClick={onDelete}
						aria-label={`Remove ${station.name}`}
						className="btn-secondary btn-sm px-2 text-red-400">
						<Trash2 size={12} />
					</button>
				</div>
			)}
		</div>
	);
}

function StationFormModal({
	station,
	onClose,
	onSuccess,
}: {
	station: FMStation | null;
	onClose: () => void;
	onSuccess: () => void;
}) {
	const isEdit = !!station;
	const [form, setForm] = useState({
		name: station?.name || "",
		frequency: station?.frequency || "",
		location: station?.location || "",
		stream_url: station?.stream_url || "",
		heartbeat_url: station?.heartbeat_url || "",
		heartbeat_timeout_minutes: station?.heartbeat_timeout_minutes || 5,
		alert_emails: (station?.alert_emails || []).join(", "),
		alert_phones: (station?.alert_phones || []).join(", "),
	});
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

	const mutation = useMutation({
		mutationFn: () => {
			const payload = {
				...form,
				alert_emails: form.alert_emails
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
				alert_phones: form.alert_phones
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
			};
			return isEdit
				? fmReportApi.updateStation(station!.id, payload)
				: fmReportApi.createStation(payload);
		},
		onSuccess: () => {
			toast.success(isEdit ? "Station updated" : "Station added");
			onSuccess();
		},
		onError: (e) => {
			setFieldErrors(fieldErrorsFrom(e));
			toast.error(errorMessage(e, "Failed to save station"));
		},
	});

	const canSubmit =
		form.name.trim().length > 0 &&
		form.frequency.trim().length > 0 &&
		!mutation.isPending;

	return (
		<Modal onClose={onClose} labelledBy="station-form-title">
			<div className="modal-header">
				<h3
					id="station-form-title"
					className="text-xl font-display font-bold text-white">
					{isEdit ? `Edit ${station!.name}` : "Add Station"}
				</h3>
			</div>
			<div className="modal-body space-y-4">
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<Field label="Station Name *" error={fieldErrors.name}>
						<input
							value={form.name}
							onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
							className="input"
							placeholder="e.g. Swahilipot FM"
						/>
					</Field>
					<Field label="Frequency *" error={fieldErrors.frequency}>
						<input
							value={form.frequency}
							onChange={(e) =>
								setForm((p) => ({ ...p, frequency: e.target.value }))
							}
							className="input"
							placeholder="e.g. 88.3 FM"
						/>
					</Field>
				</div>
				<Field label="Location" error={fieldErrors.location}>
					<input
						value={form.location}
						onChange={(e) =>
							setForm((p) => ({ ...p, location: e.target.value }))
						}
						className="input"
						placeholder="e.g. Mombasa, Kenya"
					/>
				</Field>
				<Field label="Live Stream URL" error={fieldErrors.stream_url}>
					<input
						value={form.stream_url}
						onChange={(e) =>
							setForm((p) => ({ ...p, stream_url: e.target.value }))
						}
						className="input"
						placeholder="https://..."
					/>
				</Field>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<Field label="Heartbeat URL" error={fieldErrors.heartbeat_url}>
						<input
							value={form.heartbeat_url}
							onChange={(e) =>
								setForm((p) => ({ ...p, heartbeat_url: e.target.value }))
							}
							className="input"
							placeholder="Optional"
						/>
					</Field>
					<Field
						label="Heartbeat Timeout (min)"
						error={fieldErrors.heartbeat_timeout_minutes}>
						<input
							type="number"
							min={1}
							max={1440}
							value={form.heartbeat_timeout_minutes}
							onChange={(e) =>
								setForm((p) => ({
									...p,
									heartbeat_timeout_minutes: Number(e.target.value),
								}))
							}
							className="input"
						/>
					</Field>
				</div>
				<Field
					label="Alert Emails"
					hint="Comma-separated"
					error={fieldErrors.alert_emails}>
					<input
						value={form.alert_emails}
						onChange={(e) =>
							setForm((p) => ({ ...p, alert_emails: e.target.value }))
						}
						className="input"
						placeholder="ops@example.com, lead@example.com"
					/>
				</Field>
				<Field
					label="Alert Phones"
					hint="Comma-separated, E.164 format"
					error={fieldErrors.alert_phones}>
					<input
						value={form.alert_phones}
						onChange={(e) =>
							setForm((p) => ({ ...p, alert_phones: e.target.value }))
						}
						className="input"
						placeholder="+254712345678"
					/>
				</Field>
			</div>
			<div className="modal-footer">
				<button onClick={onClose} className="btn-secondary">
					Cancel
				</button>
				<button
					disabled={!canSubmit}
					onClick={() => mutation.mutate()}
					className="btn-primary px-8">
					{mutation.isPending ? (
						<Spinner light />
					) : isEdit ? (
						"Save Changes"
					) : (
						"Add Station"
					)}
				</button>
			</div>
		</Modal>
	);
}

function ReportDownModal({
	station,
	onClose,
	onSuccess,
}: {
	station: FMStation;
	onClose: () => void;
	onSuccess: () => void;
}) {
	const [description, setDescription] = useState("");
	const [severity, setSeverity] = useState<OutageSeverity>("moderate");

	const mutation = useMutation({
		mutationFn: () =>
			fmReportApi.reportDown(station.id, { description, severity }),
		onSuccess: () => {
			toast.success(`${station.name} marked off-air`);
			onSuccess();
		},
		onError: (e) => toast.error(errorMessage(e, "Failed to report outage")),
	});

	return (
		<Modal onClose={onClose} labelledBy="report-down-title">
			<div className="modal-header bg-red-950/40 border-b border-red-500/30">
				<h3
					id="report-down-title"
					className="text-xl font-display font-bold text-red-400 flex items-center gap-2">
					<WifiOff size={20} /> Report {station.name} Down
				</h3>
			</div>
			<div className="modal-body space-y-4">
				<Field label="Severity">
					<select
						value={severity}
						onChange={(e) => setSeverity(e.target.value as OutageSeverity)}
						className="select-input">
						<option value="minor">Minor</option>
						<option value="moderate">Moderate</option>
						<option value="critical">Critical</option>
					</select>
				</Field>
				<Field label="Description">
					<textarea
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						rows={3}
						className="textarea"
						placeholder="What happened? (optional)"
					/>
				</Field>
			</div>
			<div className="modal-footer bg-red-950/20">
				<button onClick={onClose} className="btn-secondary">
					Cancel
				</button>
				<button
					disabled={mutation.isPending}
					onClick={() => mutation.mutate()}
					className="emergency-btn px-8">
					{mutation.isPending ? <Spinner light /> : "Report Down"}
				</button>
			</div>
		</Modal>
	);
}

function ReportRestoredModal({
	station,
	onClose,
	onSuccess,
}: {
	station: FMStation;
	onClose: () => void;
	onSuccess: () => void;
}) {
	const [notes, setNotes] = useState("");

	const mutation = useMutation({
		mutationFn: () =>
			fmReportApi.reportRestored(station.id, { resolution_notes: notes }),
		onSuccess: () => {
			toast.success(`${station.name} marked on-air`);
			onSuccess();
		},
		onError: (e) =>
			toast.error(errorMessage(e, "Failed to mark station restored")),
	});

	return (
		<Modal onClose={onClose} labelledBy="report-restored-title">
			<div className="modal-header bg-green-950/30 border-b border-green-500/30">
				<h3
					id="report-restored-title"
					className="text-xl font-display font-bold text-green-400 flex items-center gap-2">
					<CheckCircle size={20} /> Mark {station.name} Restored
				</h3>
			</div>
			<div className="modal-body space-y-4">
				<Field label="Resolution Notes">
					<textarea
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						rows={3}
						className="textarea"
						placeholder="What fixed it? (optional)"
					/>
				</Field>
			</div>
			<div className="modal-footer">
				<button onClick={onClose} className="btn-secondary">
					Cancel
				</button>
				<button
					disabled={mutation.isPending}
					onClick={() => mutation.mutate()}
					className="btn-primary px-8">
					{mutation.isPending ? <Spinner light /> : "Mark Restored"}
				</button>
			</div>
		</Modal>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 3 — OUTAGE HISTORY
// ═══════════════════════════════════════════════════════════════════════════

function OutagesTab({ stations }: { stations: FMStation[] }) {
	const [filters, setFilters] = useState<OutageFilters>({});
	const [page, setPage] = useState(1);

	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: ["fm-outages", filters, page],
		queryFn: () =>
			fmReportApi.listOutages({ ...filters, page }).then((r) => r.data),
	});

	const outages = data?.results || [];
	const hasNext = !!data?.next;
	const hasPrev = !!data?.previous;

	const updateFilter = (patch: Partial<OutageFilters>) => {
		setFilters((p) => ({ ...p, ...patch }));
		setPage(1);
	};

	return (
		<div className="space-y-6">
			<div className="card">
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
					<Field label="From">
						<input
							type="date"
							value={filters.start || ""}
							onChange={(e) =>
								updateFilter({ start: e.target.value || undefined })
							}
							className="input"
						/>
					</Field>
					<Field label="To">
						<input
							type="date"
							value={filters.end || ""}
							onChange={(e) =>
								updateFilter({ end: e.target.value || undefined })
							}
							className="input"
						/>
					</Field>
					<Field label="Severity">
						<select
							value={filters.severity || ""}
							onChange={(e) =>
								updateFilter({
									severity: (e.target.value || undefined) as OutageSeverity,
								})
							}
							className="select-input">
							<option value="">All</option>
							<option value="minor">Minor</option>
							<option value="moderate">Moderate</option>
							<option value="critical">Critical</option>
						</select>
					</Field>
					<Field label="Station">
						<select
							value={filters.station || ""}
							onChange={(e) =>
								updateFilter({ station: e.target.value || undefined })
							}
							className="select-input">
							<option value="">All stations</option>
							{stations.map((s) => (
								<option key={s.id} value={s.id}>
									{s.name}
								</option>
							))}
						</select>
					</Field>
					<div className="flex items-end gap-2">
						<a
							href={fmReportApi.exportOutagesUrl("csv", filters)}
							target="_blank"
							rel="noopener noreferrer"
							className="btn-secondary btn-sm flex-1">
							<Download size={13} /> CSV
						</a>
						<a
							href={fmReportApi.exportOutagesUrl("pdf", filters)}
							target="_blank"
							rel="noopener noreferrer"
							className="btn-secondary btn-sm flex-1">
							<FileText size={13} /> PDF
						</a>
					</div>
				</div>
			</div>

			{isError && (
				<ErrorBanner
					message={errorMessage(error, "Couldn't load outage history.")}
					onRetry={refetch}
				/>
			)}

			<div className="card overflow-x-auto">
				<table className="w-full text-sm">
					<thead>
						<tr className="text-left text-xs text-slate-500 uppercase border-b border-surface-border">
							<th className="py-2 pr-4">Station</th>
							<th className="py-2 pr-4">Down At</th>
							<th className="py-2 pr-4">Restored At</th>
							<th className="py-2 pr-4">Duration</th>
							<th className="py-2 pr-4">Severity</th>
							<th className="py-2 pr-4">Reported By</th>
							<th className="py-2">Notes</th>
						</tr>
					</thead>
					<tbody>
						{isLoading ? (
							[...Array(5)].map((_, i) => (
								<tr key={i}>
									<td colSpan={7} className="py-3">
										<div className="skeleton h-6 rounded" />
									</td>
								</tr>
							))
						) : outages.length === 0 ? (
							<tr>
								<td colSpan={7} className="py-10 text-center text-slate-500">
									No outages match these filters
								</td>
							</tr>
						) : (
							outages.map((o) => <OutageRow key={o.id} outage={o} />)
						)}
					</tbody>
				</table>
			</div>

			{(hasNext || hasPrev) && (
				<div className="flex items-center justify-between">
					<button
						disabled={!hasPrev || isFetching}
						onClick={() => setPage((p) => p - 1)}
						className="btn-secondary btn-sm">
						Previous
					</button>
					<span className="text-xs text-slate-500">Page {page}</span>
					<button
						disabled={!hasNext || isFetching}
						onClick={() => setPage((p) => p + 1)}
						className="btn-secondary btn-sm">
						Next
					</button>
				</div>
			)}
		</div>
	);
}

function OutageRow({ outage }: { outage: FMOutage }) {
	return (
		<tr className="border-b border-surface-border/50 last:border-0">
			<td className="py-2.5 pr-4 text-white font-medium">
				{outage.station_name}
			</td>
			<td className="py-2.5 pr-4 text-slate-300">
				{format(parseISO(outage.down_at), "dd MMM yyyy, HH:mm")}
			</td>
			<td className="py-2.5 pr-4">
				{outage.restored_at ? (
					<span className="text-slate-300">
						{format(parseISO(outage.restored_at), "dd MMM yyyy, HH:mm")}
					</span>
				) : (
					<span className="badge-red text-[10px]">ONGOING</span>
				)}
			</td>
			<td className="py-2.5 pr-4 text-slate-300">
				{outage.duration_minutes !== null ? `${outage.duration_minutes}m` : "—"}
			</td>
			<td className="py-2.5 pr-4">
				<span
					className={clsx(
						"badge uppercase text-[10px]",
						SEVERITY_STYLES[outage.severity],
					)}>
					{outage.severity}
				</span>
			</td>
			<td className="py-2.5 pr-4 text-slate-400">
				{outage.auto_detected
					? "Auto-detected"
					: outage.reported_by_name || "—"}
			</td>
			<td
				className="py-2.5 text-slate-400 max-w-xs truncate"
				title={outage.resolution_notes || outage.description}>
				{outage.resolution_notes || outage.description || "—"}
			</td>
		</tr>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 4 — STREAM HEALTH
// ═══════════════════════════════════════════════════════════════════════════

function StreamHealthTab({ stations }: { stations: FMStation[] }) {
	const streamable = stations.filter((s) => s.stream_url);
	const [selected, setSelected] = useState<string | undefined>(
		streamable[0]?.id,
	);

	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: ["fm-stream-status", selected],
		queryFn: () => fmReportApi.streamStatus(selected).then((r) => r.data),
		enabled: !!selected,
		refetchInterval: 30_000,
	});

	if (streamable.length === 0) {
		return (
			<EmptyState
				icon={Activity}
				message="No stations have a live stream URL configured"
			/>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3 flex-wrap">
				<select
					value={selected}
					onChange={(e) => setSelected(e.target.value)}
					className="select-input w-fit">
					{streamable.map((s) => (
						<option key={s.id} value={s.id}>
							{s.name} ({s.frequency})
						</option>
					))}
				</select>
				<button
					onClick={() => refetch()}
					disabled={isFetching}
					className="btn-secondary btn-sm">
					<RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />{" "}
					Check Now
				</button>
			</div>

			{isError && (
				<ErrorBanner
					message={errorMessage(error, "Couldn't check stream status.")}
					onRetry={refetch}
				/>
			)}

			{isLoading ? (
				<div className="skeleton h-40 rounded-xl" />
			) : data ? (
				<div
					className={clsx(
						"card border-l-4",
						data.live ? "border-l-green-500" : "border-l-red-500",
					)}>
					<div className="flex items-center gap-4">
						<div
							className={clsx(
								"w-14 h-14 rounded-2xl flex items-center justify-center",
								data.live ? "bg-green-500/15" : "bg-red-500/15",
							)}>
							{data.live ? (
								<Wifi size={26} className="text-green-400" />
							) : (
								<WifiOff size={26} className="text-red-400" />
							)}
						</div>
						<div>
							<div className="text-lg font-semibold text-white">
								{data.live ? "Stream is live" : "Stream is unreachable"}
							</div>
							<div className="text-sm text-slate-400">{data.station}</div>
						</div>
					</div>
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-xs">
						<div className="bg-surface-card/60 rounded-lg p-3">
							<div className="text-slate-500">Response time</div>
							<div className="text-white font-semibold">
								{data.response_ms}ms
							</div>
						</div>
						<div className="bg-surface-card/60 rounded-lg p-3">
							<div className="text-slate-500">Checked at</div>
							<div className="text-white font-semibold">
								{format(parseISO(data.checked_at), "HH:mm:ss")}
							</div>
						</div>
						<div className="bg-surface-card/60 rounded-lg p-3 truncate">
							<div className="text-slate-500">Stream URL</div>
							<a
								href={data.stream_url}
								target="_blank"
								rel="noopener noreferrer"
								className="text-nexus-400 hover:underline truncate block">
								{data.stream_url}
							</a>
						</div>
					</div>
					{data.error && (
						<div className="mt-3 p-2.5 bg-red-900/20 rounded-lg border border-red-500/20 text-xs text-red-300">
							{data.error}
						</div>
					)}
				</div>
			) : null}
		</div>
	);
}
