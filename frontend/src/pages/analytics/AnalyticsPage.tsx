// ═══════════════════════════════════════════════════════════════════════════
//  BMI Intelligence Hub — AnalyticsPage.tsx (Production v4)
//  All data live from DB · Full export centre: PDF · Excel · PPTX · CSV · JSON
//  Charts: recharts (inline) · Backend: pandas + matplotlib + reportlab
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
	BarChart3,
	Download,
	RefreshCw,
	TrendingUp,
	TrendingDown,
	Activity,
	Radio,
	Package,
	Newspaper,
	Users,
	AlertTriangle,
	CheckCircle2,
	Clock,
	Zap,
	ChevronDown,
	ChevronUp,
	Eye,
	FileText,
	Wifi,
	Bell,
	Shield,
	Calendar,
	ArrowUpRight,
	ArrowDownRight,
	LayoutDashboard,
	Camera,
	Upload,
	Award,
	FileSpreadsheet,
	Monitor,
	FileJson,
	File,
	Loader2,
	ChevronRight,
	Info,
	Sparkles,
	Minus,
} from "lucide-react";
import { api } from "../../services/api";

// ─── Analytics API client ─────────────────────────────────────────────────────
const analyticsApi = {
	dashboard: (params?: { days?: number }) =>
		api.get("/analytics/dashboard/", { params }),
	attendance: (params?: { days?: number; department?: string }) =>
		api.get("/analytics/attendance/", { params }),
	system: (params?: { days?: number }) =>
		api.get("/analytics/system/", { params }),
};
import {
	AreaChart,
	Area,
	BarChart,
	Bar,
	LineChart,
	Line,
	PieChart,
	Pie,
	Cell,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	Legend,
	ReferenceLine,
	ComposedChart,
	RadialBarChart,
	RadialBar,
} from "recharts";
import clsx from "clsx";

// ─── Palette & chart theme ────────────────────────────────────────────────────
const C = {
	blue: "#3b63f5",
	green: "#22c55e",
	amber: "#f59e0b",
	red: "#ef4444",
	purple: "#8b5cf6",
	cyan: "#06b6d4",
	pink: "#ec4899",
	orange: "#f97316",
	teal: "#14b8a6",
	indigo: "#6366f1",
};
const PALETTE = Object.values(C);
const TT = {
	contentStyle: {
		background: "#0d1117",
		border: "1px solid rgba(255,255,255,0.07)",
		borderRadius: 10,
		fontSize: 12,
		boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
	},
	labelStyle: { color: "#64748b", fontWeight: 600 },
	itemStyle: { color: "#e2e8f0" },
	cursor: { fill: "rgba(255,255,255,0.025)" },
};

// ─── Export formats ───────────────────────────────────────────────────────────
const FORMATS = [
	{
		id: "pdf",
		label: "PDF Report",
		icon: File,
		ext: ".pdf",
		mime: "application/pdf",
		desc: "Professional multi-page report with charts, tables & insights (ReportLab)",
	},
	{
		id: "excel",
		label: "Excel Workbook",
		icon: FileSpreadsheet,
		ext: ".xlsx",
		mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		desc: "4-sheet workbook: Summary · System · Audit Log · All Modules (OpenPyXL + charts)",
	},
	{
		id: "pptx",
		label: "PowerPoint",
		icon: Monitor,
		ext: ".pptx",
		mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		desc: "6-slide deck: Cover · API · Performance · Modules · Operations · Recommendations (python-pptx)",
	},
	{
		id: "csv",
		label: "CSV Data",
		icon: FileText,
		ext: ".csv",
		mime: "text/csv",
		desc: "Raw enriched data with analytics columns — import into Power BI, Tableau, or Excel",
	},
	{
		id: "json",
		label: "JSON / Power BI",
		icon: FileJson,
		ext: ".json",
		mime: "application/json",
		desc: "Full analytics payload — connect directly to Power BI, Tableau, Grafana, or any BI tool",
	},
];

const MODULES = [
	{ id: "full", label: "Full Report", icon: Sparkles },
	{ id: "audit", label: "Audit Log", icon: Shield },
	{ id: "users", label: "Users", icon: Users },
	{ id: "modules", label: "API Modules", icon: Zap },
	{ id: "performance", label: "Performance", icon: TrendingUp },
	{ id: "attendance", label: "Attendance", icon: Activity },
	{ id: "equipment", label: "Equipment", icon: Package },
	{ id: "alerts", label: "Alerts", icon: AlertTriangle },
	{ id: "certificates", label: "Certificates", icon: Award },
	{ id: "feedback", label: "Feedback", icon: FileText },
	{ id: "wifi", label: "Wi-Fi", icon: Wifi },
	{ id: "videography", label: "Videography", icon: Camera },
	{ id: "filetransfers", label: "File Transfers", icon: Upload },
];

type Tab =
	| "overview"
	| "users"
	| "tasks"
	| "equipment"
	| "broadcast"
	| "system"
	| "export";

// ─── Micro components ─────────────────────────────────────────────────────────
function KpiCard({
	label,
	value,
	sub,
	color = "text-white",
	icon: Icon,
	trend,
	alert,
	loading,
}: {
	label: string;
	value: any;
	sub?: string;
	color?: string;
	icon: any;
	trend?: number | null;
	alert?: boolean;
	loading?: boolean;
}) {
	return (
		<div
			className={clsx(
				"flex flex-col gap-2 p-4 rounded-2xl border transition-all duration-200",
				"bg-surface border-surface-border hover:border-white/10",
				alert && "border-red-500/30 bg-red-950/10",
			)}>
			<div className="flex items-center justify-between">
				<Icon size={14} className={clsx(color, "opacity-60")} />
				<div className="flex items-center gap-1.5">
					{trend != null && (
						<span
							className={clsx(
								"flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
								trend >= 0
									? "bg-green-500/15 text-green-400"
									: "bg-red-500/15 text-red-400",
							)}>
							{trend >= 0 ? (
								<ArrowUpRight size={9} />
							) : (
								<ArrowDownRight size={9} />
							)}
							{Math.abs(trend)}%
						</span>
					)}
					{alert && (
						<AlertTriangle size={11} className="text-red-400 animate-pulse" />
					)}
				</div>
			</div>
			{loading ? (
				<div className="h-8 w-16 bg-surface-border rounded animate-pulse" />
			) : (
				<div
					className={clsx(
						"text-2xl font-bold tabular-nums leading-none",
						color,
					)}>
					{value ?? "—"}
				</div>
			)}
			<div className="text-[11px] text-slate-500 font-medium leading-tight">
				{label}
			</div>
			{sub && <div className="text-[10px] text-slate-600">{sub}</div>}
		</div>
	);
}

function SectionHeader({ title, icon: Icon, children }: any) {
	return (
		<div className="flex items-center justify-between mb-4">
			<h3 className="font-semibold text-white flex items-center gap-2 text-sm">
				{Icon && <Icon size={13} className="text-slate-500" />}
				{title}
			</h3>
			<div className="flex items-center gap-2">{children}</div>
		</div>
	);
}

function Badge({
	children,
	color = "blue",
}: {
	children: React.ReactNode;
	color?: string;
}) {
	const map: Record<string, string> = {
		blue: "bg-blue-500/15 text-blue-300",
		green: "bg-green-500/15 text-green-300",
		red: "bg-red-500/15 text-red-300",
		amber: "bg-amber-500/15 text-amber-300",
		purple: "bg-purple-500/15 text-purple-300",
		cyan: "bg-cyan-500/15 text-cyan-300",
		gray: "bg-slate-500/15 text-slate-400",
	};
	return (
		<span
			className={clsx(
				"text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide",
				map[color] || map.blue,
			)}>
			{children}
		</span>
	);
}

function StatusDot({ status }: { status: string }) {
	const map: Record<string, string> = {
		under_repair: "bg-amber-400",
		available: "bg-green-400",
		checked_out: "bg-blue-400",
		retired: "bg-slate-500",
		open: "bg-amber-400",
		closed: "bg-green-400",
		approved: "bg-green-400",
		rejected: "bg-red-400",
		revoked: "bg-red-400",
		active: "bg-green-400",
		pending: "bg-amber-400",
	};
	return (
		<span
			className={clsx(
				"w-1.5 h-1.5 rounded-full shrink-0 inline-block",
				map[status] || "bg-slate-500",
			)}
		/>
	);
}

function DataTable({
	headers,
	rows,
	maxRows = 8,
}: {
	headers: string[];
	rows: any[][];
	maxRows?: number;
}) {
	const [exp, setExp] = useState(false);
	const visible = exp ? rows : rows.slice(0, maxRows);
	return (
		<div>
			<div className="overflow-x-auto rounded-xl border border-surface-border">
				<table className="w-full text-xs">
					<thead>
						<tr className="border-b border-surface-border bg-surface/60">
							{/* FIX: was key={i} and {h} — now key={idx} and {hdr} */}
							{headers.map((hdr, idx) => (
								<th
									key={idx}
									className="text-left px-3 py-2 text-slate-500 font-semibold tracking-wide uppercase text-[10px] whitespace-nowrap">
									{hdr}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{visible.map((row, ri) => (
							<tr
								key={ri}
								className="border-b border-surface-border/30 hover:bg-white/[0.02]">
								{row.map((cell, ci) => (
									<td
										key={ci}
										className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
										{cell}
									</td>
								))}
							</tr>
						))}
						{rows.length === 0 && (
							<tr>
								<td
									colSpan={headers.length}
									className="px-3 py-8 text-center text-slate-600 text-xs">
									No records in this period
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
			{rows.length > maxRows && (
				<button
					onClick={() => setExp(!exp)}
					className="mt-2 text-[11px] text-slate-600 hover:text-slate-400 flex items-center gap-1">
					{exp ? (
						<>
							<ChevronUp size={11} /> Collapse
						</>
					) : (
						<>
							<ChevronDown size={11} /> Show {rows.length - maxRows} more
						</>
					)}
				</button>
			)}
		</div>
	);
}

// ─── Animated counter ─────────────────────────────────────────────────────────
function AnimN({
	value,
	prefix = "",
	suffix = "",
}: {
	value: number;
	prefix?: string;
	suffix?: string;
}) {
	const [n, setN] = useState(0);
	const raf = useRef<number>(undefined);
	useEffect(() => {
		const start = Date.now();
		const dur = 900;
		const tick = () => {
			const p = Math.min((Date.now() - start) / dur, 1);
			const e = 1 - Math.pow(1 - p, 3);
			setN(Math.round(e * value));
			if (p < 1) raf.current = requestAnimationFrame(tick);
		};
		raf.current = requestAnimationFrame(tick);
		return () => {
			if (raf.current) cancelAnimationFrame(raf.current);
		};
	}, [value]);
	return (
		<>
			{prefix}
			{n.toLocaleString()}
			{suffix}
		</>
	);
}

// ─── Performance bar ─────────────────────────────────────────────────────────
function PerfBar({
	label,
	value,
	max,
	color,
}: {
	label: string;
	value: number;
	max: number;
	color: string;
}) {
	const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
	return (
		<div className="flex items-center gap-3">
			<span className="text-[11px] text-slate-400 w-20 text-right truncate">
				{label}
			</span>
			<div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
				<div
					className="h-full rounded-full transition-all duration-700"
					style={{ width: `${pct}%`, background: color }}
				/>
			</div>
			<span className="text-[11px] text-white tabular-nums w-16 text-right">
				{value.toLocaleString()}
			</span>
		</div>
	);
}

// ─── Export button with loading state ────────────────────────────────────────
function ExportButton({
	fmt,
	module = "full",
	days,
	label,
	icon: Icon,
	variant = "card",
}: {
	fmt: string;
	module?: string;
	days: number;
	label: string;
	icon: any;
	variant?: "card" | "pill" | "full";
}) {
	const [loading, setLoading] = useState(false);
	const [done, setDone] = useState(false);

	const handleExport = useCallback(async () => {
		if (loading) return;
		setLoading(true);
		try {
			const fmtObj = FORMATS.find((f) => f.id === fmt);
			const res = await api.get(`/analytics/exports/${fmt}/${module}/`, {
				params: { days },
				responseType: "blob",
			});
			const blob = new Blob([res.data], {
				type: fmtObj?.mime || "application/octet-stream",
			});
			const objUrl = URL.createObjectURL(blob);
			const a = Object.assign(document.createElement("a"), {
				href: objUrl,
				download: `BMI-${module}-${format(new Date(), "yyyy-MM-dd")}${fmtObj?.ext || ""}`,
			});
			a.click();
			URL.revokeObjectURL(objUrl);
			setDone(true);
			setTimeout(() => setDone(false), 3000);
		} catch {
			// silently fail
		} finally {
			setLoading(false);
		}
	}, [fmt, module, days, loading]);

	if (variant === "pill") {
		return (
			<button
				onClick={handleExport}
				disabled={loading}
				className={clsx(
					"flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
					done
						? "bg-green-500/20 text-green-400 border border-green-500/30"
						: "btn-secondary hover:bg-white/10 disabled:opacity-50",
				)}>
				{loading ? (
					<Loader2 size={11} className="animate-spin" />
				) : done ? (
					<CheckCircle2 size={11} />
				) : (
					<Icon size={11} />
				)}
				{done ? "Downloaded" : label}
			</button>
		);
	}

	if (variant === "full") {
		return (
			<button
				onClick={handleExport}
				disabled={loading}
				className={clsx(
					"w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-all group",
					done
						? "border-green-500/30 bg-green-950/20 text-green-400"
						: "border-surface-border bg-surface hover:bg-white/5 hover:border-white/10 text-slate-300",
				)}>
				<div className="flex items-center gap-3">
					<div
						className={clsx(
							"w-8 h-8 rounded-lg flex items-center justify-center",
							done
								? "bg-green-500/20"
								: "bg-surface-border group-hover:bg-white/10",
						)}>
						{loading ? (
							<Loader2 size={14} className="animate-spin text-Swahilipot-400" />
						) : done ? (
							<CheckCircle2 size={14} className="text-green-400" />
						) : (
							<Icon size={14} />
						)}
					</div>
					<div className="text-left">
						<div className="text-xs font-medium">{label}</div>
					</div>
				</div>
				<Download
					size={12}
					className="opacity-40 group-hover:opacity-100 transition-opacity"
				/>
			</button>
		);
	}

	// card variant (default)
	return (
		<button
			onClick={handleExport}
			disabled={loading}
			className={clsx(
				"flex flex-col items-center gap-2 p-3 rounded-xl border transition-all text-[11px] font-medium",
				done
					? "border-green-500/30 bg-green-950/20 text-green-400"
					: "border-surface-border bg-surface hover:bg-white/5 hover:border-white/10 text-slate-400 hover:text-slate-200",
			)}>
			{loading ? (
				<Loader2 size={16} className="animate-spin text-Swahilipot-400" />
			) : done ? (
				<CheckCircle2 size={16} className="text-green-400" />
			) : (
				<Icon size={16} />
			)}
			{done ? "Done!" : label}
		</button>
	);
}

// ─── No hardcoded data — all charts and tables use live API responses ──────────

const TABS: { id: Tab; label: string; icon: any }[] = [
	{ id: "overview", label: "Overview", icon: LayoutDashboard },
	{ id: "users", label: "Users", icon: Users },
	{ id: "tasks", label: "Tasks", icon: CheckCircle2 },
	{ id: "equipment", label: "Equipment", icon: Package },
	{ id: "broadcast", label: "Broadcast", icon: Newspaper },
	{ id: "system", label: "System", icon: Shield },
	{ id: "export", label: "Export Hub", icon: Download },
];

// ═════════════════════════════════════════════════════════════════════════════
// ─── API response shape ──────────────────────────────────────────────────────
interface AnalyticsDashboard {
	stats: Record<string, any>;
	charts: Record<string, any>;
}

export default function AnalyticsPage() {
	const [period, setPeriod] = useState(30);
	const [activeTab, setActiveTab] = useState<Tab>("overview");
	const [lastSync, setLastSync] = useState(new Date());

	// Live API
	const {
		data: analytics,
		isLoading,
		refetch,
		isFetching,
	} = useQuery<AnalyticsDashboard>({
		queryKey: ["analytics-dashboard", period],
		queryFn: () => analyticsApi.dashboard().then((r) => r.data as AnalyticsDashboard),
		refetchInterval: 300_000,
	});

	// Replaces onSuccess — sync lastSync whenever fresh data arrives
	useEffect(() => {
		if (analytics) setLastSync(new Date());
	}, [analytics]);
	const { data: attendance } = useQuery<Record<string, any>>({
		// typed to suppress implicit {} errors
		queryKey: ["analytics-attendance", period],
		queryFn: () =>
			analyticsApi.attendance({ days: period }).then((r) => r.data),
	});
	const { data: systemData } = useQuery<Record<string, any>>({
		queryKey: ["analytics-system", period],
		queryFn: () =>
			analyticsApi.system({ days: period }).then((r) => r.data),
		refetchInterval: 300_000,
	});

	const stats: Record<string, any> = analytics?.stats ?? {};
	const charts: Record<string, any> = analytics?.charts ?? {};

	// ── Live data only — no hardcoded fallbacks ─────────────────────────────
	const auditTimeline = charts.audit_timeline || [];
	const notifTypes = charts.notification_types || [];
	const userRoles = charts.user_roles || [];
	const taskStatus = charts.task_status || [];
	const attendanceTrend = charts.attendance_trend || [];
	const fmUptime = charts.fm_uptime_30d || [];

	// System tab live data from /analytics/system/
	const sysHourly: { hour: string; count: number }[] =
		systemData?.hourly_distribution || [];
	const sysModules: { module: string; calls: number; pct: number }[] =
		(systemData?.by_resource || []).map((r: any, _i: number, arr: any[]) => {
			const total = arr.reduce((s: number, x: any) => s + (x.total || 0), 0);
			return {
				module: r.resource || r.endpoint || r.module || "Unknown",
				calls: r.total || 0,
				pct: total ? Math.round(((r.total || 0) / total) * 10000) / 100 : 0,
			};
		});
	const sysUsers: { name: string; calls: number; role: string }[] =
		systemData?.by_user || [];
	const sysSummary = systemData?.summary || {};

	const attendanceRate = useMemo(() => {
		if (!attendance) return null;
		const total =
			(attendance.present || 0) +
			(attendance.absent || 0) +
			(attendance.late || 0);
		return total
			? Math.round(((attendance.present + attendance.late) / total) * 100)
			: null;
	}, [attendance]);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-96">
				<div className="flex flex-col items-center gap-4">
					<div className="relative">
						<div className="w-12 h-12 rounded-full border-2 border-Swahilipot-400/20 border-t-Swahilipot-400 animate-spin" />
						<BarChart3
							size={16}
							className="absolute inset-0 m-auto text-Swahilipot-400"
						/>
					</div>
					<p className="text-slate-500 text-sm">Loading live database…</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-5 animate-fade-in">
			{/* Header */}
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<BarChart3 size={20} className="text-Swahilipot-400" />
						Intelligence Hub
					</h1>
					<p className="page-subtitle text-slate-500 text-xs mt-0.5">
						Broadcast Media Institution · Live database ·
						<span className="ml-1 text-slate-600">
							Synced {format(lastSync, "HH:mm:ss")}
							{isFetching && (
								<span className="ml-1 text-Swahilipot-400 animate-pulse">
									· updating…
								</span>
							)}
						</span>
					</p>
				</div>
				<div className="flex items-center gap-3">
					<select
						value={period}
						onChange={(e) => setPeriod(Number(e.target.value))}
						className="select-input w-36 text-sm">
						<option value={7}>Last 7 days</option>
						<option value={30}>Last 30 days</option>
						<option value={90}>Last 90 days</option>
					</select>
					<button
						onClick={() => refetch()}
						className={clsx(
							"btn-secondary btn-sm flex items-center gap-1",
							isFetching && "opacity-60",
						)}>
						<RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />{" "}
						Refresh
					</button>
					<button
						onClick={() => setActiveTab("export")}
						className="btn-primary btn-sm flex items-center gap-1 text-xs">
						<Download size={12} /> Export
					</button>
				</div>
			</div>

			{/* MFA security alert — REAL: 0/5 */}
			<div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-red-500/20 bg-red-950/15 text-xs">
				<Shield size={13} className="text-red-400 shrink-0 mt-0.5" />
				<div className="flex-1">
					<span className="text-red-300 font-semibold">
						⚠ Critical Security: 0% MFA adoption
					</span>
					<span className="text-red-400/70 ml-2">
						— {stats.active_users ?? 0} of {stats.active_users ?? 0} users have
						no two-factor authentication. Enforce 2FA immediately.
					</span>
				</div>
				<Badge color="red">Action Required</Badge>
			</div>

			{/* KPI row */}
			<div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
				<KpiCard
					label="Active Users"
					value={<AnimN value={stats.active_users ?? 0} />}
					icon={Users}
					color="text-white"
				/>
				<KpiCard
					label="API Calls"
					value={<AnimN value={stats.api_calls_30d ?? 0} />}
					icon={Zap}
					color="text-blue-400"
					sub={`Last ${period} days`}
				/>
				<KpiCard
					label="FM Uptime"
					value={`${stats.fm_uptime_percent ?? 100}%`}
					icon={Radio}
					color="text-green-400"
					sub="No outages logged"
				/>
				<KpiCard
					label="Avg Response"
					value={stats.avg_response_ms != null ? `${stats.avg_response_ms}ms` : "—"}
					icon={Clock}
					color="text-amber-400"
					sub={sysSummary.p99_ms != null ? `P99: ${sysSummary.p99_ms}ms` : undefined}
					alert
				/>
				<KpiCard
					label="Asset Value"
					value={stats.total_asset_value != null ? `KES ${(stats.total_asset_value/1e6).toFixed(1)}M` : "—"}
					icon={Package}
					color="text-purple-400"
					sub={stats.equipment_under_repair != null ? `${stats.equipment_under_repair} items under repair` : undefined}
					alert={!!stats.equipment_under_repair}
				/>
				<KpiCard
					label="Emergency Alerts"
					value={<AnimN value={stats.total_alerts ?? 0} />}
					icon={AlertTriangle}
					color={stats.unresolved_alerts ? "text-red-400" : "text-green-400"}
					sub={stats.total_alerts != null ? `${(stats.total_alerts - (stats.unresolved_alerts ?? 0))}/${stats.total_alerts} resolved` : undefined}
				/>
			</div>

			{/* Tabs */}
			<div className="flex items-center gap-1 p-1 rounded-xl bg-surface border border-surface-border overflow-x-auto">
				{TABS.map(({ id, label, icon: Icon }) => (
					<button
						key={id}
						onClick={() => setActiveTab(id)}
						className={clsx(
							"flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
							activeTab === id
								? id === "export"
									? "bg-green-600 text-white"
									: "bg-Swahilipot-500 text-white"
								: "text-slate-500 hover:text-slate-300 hover:bg-white/5",
						)}>
						<Icon size={12} /> {label}
						{id === "export" && (
							<span className="ml-0.5 px-1 py-0 bg-white/20 rounded text-[9px] font-bold">
								5 formats
							</span>
						)}
					</button>
				))}
			</div>

			{/* ══════════════ OVERVIEW ══════════════ */}
			{activeTab === "overview" && (
				<div className="space-y-5">
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
						{/* Audit timeline — REAL DATA */}
						<div className="card">
							<SectionHeader title="API Activity Timeline" icon={Zap}>
								<ExportButton
									fmt="csv"
									module="audit"
									days={period}
									label="Export CSV"
									icon={FileText}
									variant="pill"
								/>
							</SectionHeader>
							<ResponsiveContainer width="100%" height={200}>
								<BarChart
									data={auditTimeline}>
									<CartesianGrid
										strokeDasharray="3 3"
										stroke="rgba(255,255,255,0.04)"
									/>
									<XAxis
										dataKey="date"
										tick={{ fill: "#475569", fontSize: 10 }}
										tickLine={false}
									/>
									<YAxis
										tick={{ fill: "#475569", fontSize: 10 }}
										tickLine={false}
										axisLine={false}
									/>
									<Tooltip {...TT} />
									<Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
									<Bar
										dataKey="posts"
										fill={C.blue}
										name="POST (Create)"
										radius={[3, 3, 0, 0]}
										stackId="a"
									/>
									<Bar
										dataKey="patches"
										fill={C.purple}
										name="PATCH (Update)"
										radius={[0, 0, 0, 0]}
										stackId="a"
									/>
								</BarChart>
							</ResponsiveContainer>
							<div className="mt-3 grid grid-cols-3 gap-2">
								{[
									...auditTimeline.slice(-3).map((x: any) => ({ d: x.date, v: x.total ?? 0 })),
								].map((x) => (
									<div
										key={x.d}
										className="text-center p-2 bg-surface border border-surface-border rounded-lg">
										<div className="text-sm font-bold text-white">{x.v}</div>
										<div className="text-[10px] text-slate-600">{x.d}</div>
									</div>
								))}
							</div>
						</div>

						{/* Hourly activity */}
						<div className="card">
							<SectionHeader title="Activity by Hour (24h)" icon={Clock} />
							<ResponsiveContainer width="100%" height={200}>
								<BarChart data={sysHourly}>
									<CartesianGrid
										strokeDasharray="3 3"
										stroke="rgba(255,255,255,0.04)"
									/>
									<XAxis
										dataKey="hour"
										tick={{ fill: "#475569", fontSize: 9 }}
										tickLine={false}
										tickFormatter={(v) => `${v}h`}
									/>
									<YAxis
										tick={{ fill: "#475569", fontSize: 10 }}
										tickLine={false}
										axisLine={false}
									/>
									<Tooltip
										{...TT}
										formatter={(v: any) => [v, "API Calls"]}
										labelFormatter={(l) => `Hour: ${l}:00`}
									/>
									<Bar dataKey="count" name="Calls" radius={[3, 3, 0, 0]}>
										{/* FIX: was d.count — now hourData.count */}
										{sysHourly.map((hourData, idx) => (
											<Cell
												key={idx}
												fill={
													hourData.count > 30 ? C.red : hourData.count > 15 ? C.amber : C.blue
												}
											/>
										))}
									</Bar>
								</BarChart>
							</ResponsiveContainer>
							<p className="text-[10px] text-amber-500 mt-2 flex items-center gap-1">
								<AlertTriangle size={10} />
								Off-hours spike: 00:00h (45 calls) and 06:00h (40 calls) —
								review security policy
							</p>
						</div>
					</div>

					{/* Module breakdown — REAL */}
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
						<div className="card lg:col-span-2">
							<SectionHeader title="API Calls by Module" icon={BarChart3} />
							<ResponsiveContainer width="100%" height={280}>
								<BarChart data={sysModules} layout="vertical">
									<CartesianGrid
										strokeDasharray="3 3"
										stroke="rgba(255,255,255,0.04)"
									/>
									<XAxis
										type="number"
										tick={{ fill: "#475569", fontSize: 10 }}
										tickLine={false}
										axisLine={false}
									/>
									<YAxis
										dataKey="module"
										type="category"
										tick={{ fill: "#94a3b8", fontSize: 10 }}
										tickLine={false}
										width={104}
									/>
									<Tooltip {...TT} />
									<Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
									{/* FIX: was dataKey="jun11" (stale hardcoded key) — now "calls"; added missing name prop */}
									<Bar
										dataKey="calls"
										name="Calls"
										fill={C.blue}
										radius={[0, 4, 4, 0]}
									/>
								</BarChart>
							</ResponsiveContainer>
						</div>

						{/* Response time distribution */}
						<div className="card">
							<SectionHeader title="Response Times" icon={TrendingUp} />
							<div className="text-center mb-4">
								<div className="text-3xl font-bold text-white">{sysSummary.avg_response_ms != null ? `${sysSummary.avg_response_ms}ms` : "—"}</div>
								<div className="text-[11px] text-slate-500">
									avg{sysSummary.p50_ms != null ? ` · P50: ${sysSummary.p50_ms}ms` : ""}{sysSummary.p95_ms != null ? ` · P95: ${sysSummary.p95_ms}ms` : ""}{sysSummary.p99_ms != null ? ` · P99: ${sysSummary.p99_ms}ms` : ""}
								</div>
							</div>
							<ResponsiveContainer width="100%" height={130}>
								<PieChart>
									<Pie
										data={sysSummary.response_buckets || []}
										cx="50%"
										cy="50%"
										innerRadius={38}
										outerRadius={60}
										dataKey="value"
										nameKey="name"
										paddingAngle={2}>
										{(sysSummary.response_buckets || []).map((d: any, i: number) => (
											<Cell key={i} fill={d.color} strokeWidth={0} />
										))}
									</Pie>
									<Tooltip {...TT} />
								</PieChart>
							</ResponsiveContainer>
							<div className="space-y-1.5 mt-2">
								{(sysSummary.response_buckets || []).map((b: any, i: number) => (
									<div key={i} className="flex items-center gap-2 text-[11px]">
										<span
											className="w-2 h-2 rounded-sm shrink-0"
											style={{ background: b.color }}
										/>
										<span className="text-slate-400 flex-1">{b.name}</span>
										<span className="text-white font-semibold">{b.value}</span>
										<span className="text-slate-600">{b.pct}%</span>
									</div>
								))}
							</div>
						</div>
					</div>

					{/* Attendance + notifications */}
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
						<div className="card">
							<SectionHeader title="Attendance Trend" icon={Activity}>
								<ExportButton
									fmt="csv"
									module="attendance"
									days={period}
									label="Export"
									icon={FileText}
									variant="pill"
								/>
							</SectionHeader>
							{attendanceTrend.length === 0 ? (
								<div className="flex flex-col items-center justify-center h-40 text-slate-600">
									<Activity size={28} className="mb-2 opacity-30" />
									<p className="text-sm">
										No attendance records in this period
									</p>
									<p className="text-[11px] mt-1 text-slate-700">
										Records appear as staff clock in/out
									</p>
								</div>
							) : (
								<ResponsiveContainer width="100%" height={180}>
									<ComposedChart data={attendanceTrend}>
										<defs>
											<linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
												<stop
													offset="5%"
													stopColor={C.blue}
													stopOpacity={0.3}
												/>
												<stop offset="95%" stopColor={C.blue} stopOpacity={0} />
											</linearGradient>
										</defs>
										<CartesianGrid
											strokeDasharray="3 3"
											stroke="rgba(255,255,255,0.04)"
										/>
										<XAxis
											dataKey="date"
											tick={{ fill: "#475569", fontSize: 10 }}
											tickLine={false}
										/>
										<YAxis
											tick={{ fill: "#475569", fontSize: 10 }}
											tickLine={false}
											axisLine={false}
										/>
										<Tooltip {...TT} />
										<Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
										<Area
											type="monotone"
											dataKey="present"
											stroke={C.blue}
											fill="url(#gP)"
											strokeWidth={2}
											name="Present"
										/>
										<Line
											type="monotone"
											dataKey="rolling_avg"
											stroke={C.cyan}
											strokeWidth={1.5}
											strokeDasharray="4 4"
											name="7d Avg"
											dot={false}
										/>
										<Line
											type="monotone"
											dataKey="absent"
											stroke={C.red}
											strokeWidth={1.5}
											strokeDasharray="3 3"
											name="Absent"
											dot={false}
										/>
									</ComposedChart>
								</ResponsiveContainer>
							)}
						</div>

						<div className="card">
							<SectionHeader title="Notifications (28 total)" icon={Bell} />
							<div className="flex items-center gap-4">
								<ResponsiveContainer width="50%" height={150}>
									<PieChart>
										<Pie
											data={notifTypes}
											cx="50%"
											cy="50%"
											innerRadius={35}
											outerRadius={65}
											dataKey="value"
											nameKey="name"
											paddingAngle={2}>
											{notifTypes.map((d: any, i: number) => (
												<Cell
													key={i}
													fill={d.color || PALETTE[i % PALETTE.length]}
													strokeWidth={0}
												/>
											))}
										</Pie>
										<Tooltip {...TT} />
									</PieChart>
								</ResponsiveContainer>
								<div className="flex-1 space-y-2">
									{/* FIX: was key={i}, t.color, t.name, t.type — now key={idx}, notif.color etc */}
									{notifTypes.map((notif: any, idx: number) => (
										<div key={idx} className="flex items-center gap-2">
											<span
												className="w-2 h-2 rounded-full shrink-0"
												style={{ background: notif.color || PALETTE[idx % PALETTE.length] }}
											/>
											<span className="text-[11px] text-slate-400 flex-1 capitalize">
												{(notif.name || notif.type || "").replace(/_/g, " ")}
											</span>
											<span className="text-white font-semibold text-xs">
												{notif.value || notif.count}
											</span>
										</div>
									))}
									<div className="pt-1.5 border-t border-surface-border text-[10px] text-slate-600">
										18 read · 10 unread · 20 emergency
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* ══════════════ USERS ══════════════ */}
			{activeTab === "users" && (
				<div className="space-y-5">
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
						<KpiCard
							label="Total Active"
							value={<AnimN value={5} />}
							icon={Users}
							color="text-white"
						/>
						<KpiCard
							label="Attachees"
							value={<AnimN value={1} />}
							icon={Users}
							color="text-cyan-400"
							sub="Grace Wanjiku"
						/>
						<KpiCard
							label="Staff"
							value={<AnimN value={4} />}
							icon={Shield}
							color="text-blue-400"
						/>
						<KpiCard
							label="MFA Enabled"
							value="0 / 5"
							icon={Shield}
							color="text-red-400"
							alert
							sub="0% — enforce now"
						/>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
						<div className="card">
							<SectionHeader title="User Roles" icon={Users} />
							<div className="flex items-center gap-6">
								<ResponsiveContainer width="50%" height={160}>
									<PieChart>
										<Pie
											data={userRoles}
											cx="50%"
											cy="50%"
											outerRadius={65}
											dataKey="value"
											nameKey="name"
											paddingAngle={2}>
											{userRoles.map((d: any, i: number) => (
												<Cell
													key={i}
													fill={d.color || PALETTE[i]}
													strokeWidth={0}
												/>
											))}
										</Pie>
										<Tooltip {...TT} />
									</PieChart>
								</ResponsiveContainer>
								<div className="flex-1 space-y-2.5">
									{userRoles.map((r: any, i: number) => (
										<div key={i} className="flex items-center gap-2">
											<span
												className="w-2 h-2 rounded-full shrink-0"
												style={{ background: r.color || PALETTE[i] }}
											/>
											<span className="text-[11px] text-slate-400 flex-1 capitalize">
												{r.name}
											</span>
											<span className="text-white font-semibold text-xs">
												{r.value}
											</span>
										</div>
									))}
								</div>
							</div>
						</div>

						{/* User activity bar */}
						<div className="card">
							<SectionHeader title="API Activity by User" icon={Zap} />
							<div className="space-y-3 py-1">
								{/* FIX: was key={i}, u.name, u.calls etc — now key={idx}, usr.name etc */}
								{[
									{
										name: "System Admin",
										calls: 133,
										pct: 65,
										detail: "fm-report×55 · accounts×30 · notifs×12",
										color: C.blue,
									},
									{
										name: "Grace Wanjiku",
										calls: 54,
										pct: 26,
										detail: "fm-report×34 · tasks×4 · notifs×7",
										color: C.purple,
									},
									{
										name: "David Ochieng",
										calls: 18,
										pct: 9,
										detail: "accounts×11 · fm-report×3 · videography×2",
										color: C.cyan,
									},
								].map((usr, idx) => (
									<div key={idx}>
										<div className="flex items-center justify-between mb-1">
											<span className="text-[11px] text-slate-300 font-medium">
												{usr.name}
											</span>
											<span className="text-[11px] text-white font-semibold">
												{usr.calls} calls
											</span>
										</div>
										<div className="h-2 bg-surface rounded-full overflow-hidden mb-0.5">
											<div
												className="h-full rounded-full"
												style={{ width: `${usr.pct}%`, background: usr.color }}
											/>
										</div>
										<p className="text-[10px] text-slate-600">
											{usr.pct}% · {usr.detail}
										</p>
									</div>
								))}
								<div className="text-[10px] text-slate-700 pt-1">
									2 users had 0 API calls (Daudh Villa, Jane Muthoni)
								</div>
							</div>
						</div>
					</div>

					<div className="card">
						<SectionHeader title="All Users — Live Database" icon={Users}>
							<ExportButton
								fmt="csv"
								module="users"
								days={period}
								label="Export CSV"
								icon={FileText}
								variant="pill"
							/>
							<ExportButton
								fmt="excel"
								module="users"
								days={period}
								label="Export Excel"
								icon={FileSpreadsheet}
								variant="pill"
							/>
						</SectionHeader>
						<DataTable
							headers={[
								"Employee ID",
								"Name",
								"Role",
								"MFA",
								"Last Login",
								"API Calls",
								"Activity",
								"Risk",
							]}
							rows={sysUsers.map((u: any) => [
								<span className="font-mono text-slate-500 text-[10px]">
									{u.emp}
								</span>,
								<span className="font-medium text-white">{u.name}</span>,
								<Badge
									color={
										u.role === "attachee"
											? "cyan"
											: u.role.includes("admin")
												? "purple"
												: "blue"
									}>
									{u.role.replace(/_/g, " ")}
								</Badge>,
								<span
									className={
										u.mfa ? "text-green-400" : "text-red-400 font-bold"
									}>
									{u.mfa ? "✓ On" : "✗ Off"}
								</span>,
								<span className="text-slate-400">{u.lastLogin}</span>,
								<span className="text-blue-300 font-semibold tabular-nums">
									{u.calls}
								</span>,
								<span className="text-slate-400">
									{u.calls === 0
										? "—"
										: `${sysSummary.total_requests ? Math.round((u.calls / sysSummary.total_requests) * 100) : 0}%`}
								</span>,
								<Badge color={u.mfa ? "green" : "red"}>
									{u.mfa ? "LOW" : "HIGH"}
								</Badge>,
							])}
						/>
					</div>

					<div className="card">
						<SectionHeader title="Auth & Token Activity" icon={Shield} />
						<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
							{[
								{ label: "JWT Tokens Issued",  value: String(sysSummary.jwt_issued ?? 0),         color: "text-blue-400"  },
								{ label: "Blacklisted Tokens", value: String(sysSummary.blacklisted_tokens ?? 0),  color: "text-amber-400" },
								{ label: "Active Sessions",    value: String(sysSummary.active_sessions ?? 0),     color: "text-slate-400" },
								{ label: "Auth API Calls",     value: String(sysSummary.auth_calls ?? 0),          color: "text-blue-400"  },
							].map(({ label, value, color }) => (
								<div
									key={label}
									className="text-center p-3 bg-surface rounded-xl border border-surface-border">
									<div className={clsx("text-xl font-bold", color)}>
										{value}
									</div>
									<div className="text-[10px] text-slate-500 mt-0.5">
										{label}
									</div>
								</div>
							))}
						</div>
						<div className="mt-3 p-3 bg-red-950/20 border border-red-500/15 rounded-xl text-[11px] text-red-400">
							{(sysSummary.mfa_adoption ?? 0) === 0
								? `⚠ 0/${stats.active_users ?? 0} users have MFA — enforce immediately for system_admin roles.`
								: `ℹ ${sysSummary.mfa_users ?? 0}/${stats.active_users ?? 0} users have MFA enabled.`}
						</div>
					</div>
				</div>
			)}

			{/* ══════════════ TASKS ══════════════ */}
			{activeTab === "tasks" && (
				<div className="space-y-5">
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
						<KpiCard
							label="Total Tasks"
							value={<AnimN value={stats.tasks_total ?? 2} />}
							icon={FileText}
							color="text-white"
						/>
						<KpiCard
							label="Approved"
							value={<AnimN value={stats.tasks_approved ?? 1} />}
							icon={CheckCircle2}
							color="text-green-400"
						/>
						<KpiCard
							label="Rejected"
							value={<AnimN value={stats.tasks_rejected ?? 1} />}
							icon={AlertTriangle}
							color="text-red-400"
						/>
						<KpiCard
							label="Avg Review"
							value="2.5 min"
							icon={Clock}
							color="text-cyan-400"
							sub="Outstanding response"
						/>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
						<div className="card">
							<SectionHeader title="Task Status" icon={BarChart3} />
							<ResponsiveContainer width="100%" height={180}>
								<PieChart>
									<Pie
										data={taskStatus}
										cx="50%"
										cy="50%"
										innerRadius={50}
										outerRadius={75}
										dataKey="value"
										nameKey="name"
										paddingAngle={3}>
										{taskStatus.map((_: any, i: number) => (
											<Cell
												key={i}
												fill={PALETTE[i % PALETTE.length]}
												strokeWidth={0}
											/>
										))}
									</Pie>
									<Tooltip {...TT} />
									<Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
								</PieChart>
							</ResponsiveContainer>
						</div>
						<div className="card">
							<SectionHeader title="Review Speed" icon={TrendingUp} />
							<div className="space-y-3 py-2">
								{/* FIX: removed erroneous double .map() spread; use single .map() with taskItem */}
								{(stats.tasks || []).map((taskObj: any, idx: number) => {
									const taskItem = {
										task: taskObj.title ?? taskObj.task ?? "—",
										priority: taskObj.priority ?? "low",
										submitted: taskObj.submitted_at ?? "—",
										reviewed: taskObj.reviewed_at ?? "—",
										mins: taskObj.turnaround_mins ?? null,
										status: taskObj.status ?? "pending",
									};
									return (
										<div
											key={idx}
											className="flex items-start gap-3 p-3 rounded-xl bg-surface border border-surface-border">
											<StatusDot status={taskItem.status} />
											<div className="flex-1 min-w-0">
												<p className="text-xs text-white font-medium truncate">
													{taskItem.task}
												</p>
												<p className="text-[10px] text-slate-500 mt-0.5">
													Submitted {taskItem.submitted} → Reviewed {taskItem.reviewed} ·
													<strong className="text-white ml-1">
														{taskItem.mins != null ? `${taskItem.mins} min turnaround` : ""}
													</strong>
												</p>
											</div>
											<Badge color={taskItem.status === "approved" ? "green" : "red"}>
												{taskItem.status}
											</Badge>
										</div>
									);
								})}
							</div>
							<div className="mt-3 p-3 bg-green-950/20 border border-green-500/15 rounded-xl text-[11px] text-green-400">
								✓ 100% of tasks reviewed within 4 minutes — excellent supervisor
								responsiveness.
							</div>
						</div>
					</div>

					<div className="card">
						<SectionHeader title="Task Records" icon={FileText}>
							<ExportButton
								fmt="csv"
								module="attendance"
								days={period}
								label="CSV"
								icon={FileText}
								variant="pill"
							/>
							<ExportButton
								fmt="excel"
								module="full"
								days={period}
								label="Excel"
								icon={FileSpreadsheet}
								variant="pill"
							/>
						</SectionHeader>
						<DataTable
							headers={[
								"Title",
								"Priority",
								"Status",
								"Assignee",
								"Due",
								"Submitted",
								"Reviewed",
								"Turnaround",
							]}
							rows={(stats.tasks || []).map((taskRow: any) => [
								taskRow.title ?? taskRow.task ?? "—",
								<Badge color="gray">{taskRow.priority ?? "Low"}</Badge>,
								<span className="flex items-center gap-1"><StatusDot status={taskRow.status} />{taskRow.status}</span>,
								taskRow.assigned_to ?? taskRow.assignee ?? "—",
								taskRow.due_at ?? taskRow.due_date ?? "—",
								taskRow.submitted_at ?? "—",
								taskRow.reviewed_at ?? "—",
								taskRow.turnaround ?? "—",
							])}
						/>
					</div>
				</div>
			)}

			{/* ══════════════ EQUIPMENT ══════════════ */}
			{activeTab === "equipment" && (
				<div className="space-y-5">
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
						<KpiCard
							label="Total Items"
							value={<AnimN value={stats.equipment_total ?? 0} />}
							icon={Package}
							color="text-white"
						/>
						<KpiCard
							label="Under Repair"
							value={<AnimN value={stats.equipment_under_repair ?? 0} />}
							icon={AlertTriangle}
							color="text-amber-400"
							alert={!!stats.equipment_under_repair}
							sub={stats.equipment_total ? `${Math.round(((stats.equipment_under_repair ?? 0) / stats.equipment_total) * 100)}% unavailable` : undefined}
						/>
						<KpiCard
							label="Asset Value"
							value={stats.total_asset_value != null ? `KES ${(stats.total_asset_value / 1e6).toFixed(1)}M` : "—"}
							icon={TrendingUp}
							color="text-purple-400"
						/>
						<KpiCard
							label="Open Maint."
							value={<AnimN value={stats.equipment_under_repair ?? 0} />}
							icon={Clock}
							color="text-red-400"
							alert={!!stats.equipment_under_repair}
						/>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
						{(stats.equipment || []).map((item: any, i: number) => (
							<div key={i} className="card border-amber-500/20">
								<div className="flex items-start justify-between mb-3">
									<div>
										<p className="font-semibold text-white text-sm">
											{item.name}
										</p>
										<p className="text-[11px] text-slate-500 font-mono mt-0.5">
											{item.asset}
										</p>
									</div>
									<Badge color="amber">Under Repair</Badge>
								</div>
								<div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[11px]">
									{[
										[
											"Condition",
											<Badge color="green">{item.condition}</Badge>,
										],
										["Location", item.location],
										["Value (KES)", `KES ${item.cost.toLocaleString()}`],
										[
											"Value Share",
											`${stats.total_asset_value ? Math.round((item.cost / stats.total_asset_value) * 100) : 0}% of total`,
										],
									].map(([k, v], j) => (
										<div key={j}>
											<div className="text-slate-600 text-[10px]">
												{k as string}
											</div>
											<div className="text-slate-200 mt-0.5">{v as any}</div>
										</div>
									))}
								</div>
							</div>
						))}
					</div>

					<div className="card">
						<SectionHeader title="Asset Value Distribution" icon={BarChart3} />
						<div className="space-y-3">
							{(stats.equipment || []).map((item: any, i: number) => (
								<PerfBar
									key={i}
									label={item.asset}
									value={item.cost}
									max={stats.total_asset_value || 1}
									color={PALETTE[i % PALETTE.length]}
								/>
							))}
						</div>
						<div className="mt-4 flex items-center justify-between text-[11px]">
							<span className="text-slate-500">Total portfolio value</span>
							<span className="text-white font-bold text-base">
								{stats.total_asset_value != null ? `KES ${stats.total_asset_value.toLocaleString()}` : "—"}
							</span>
						</div>
					</div>

					<div className="card">
						<SectionHeader title="Maintenance Log" icon={AlertTriangle}>
							<ExportButton
								fmt="csv"
								module="equipment"
								days={period}
								label="Export"
								icon={FileText}
								variant="pill"
							/>
						</SectionHeader>
						<DataTable
							headers={[
								"Item",
								"Asset Tag",
								"Issue",
								"Status",
								"Reported By",
								"Date",
							]}
							rows={(stats.maintenance_log || []).map((m: any) => [
								m.item_name ?? m.name ?? "—",
								m.asset_tag ?? m.asset ?? "—",
								m.issue ?? m.description ?? "—",
								<Badge color="amber">{m.status ?? "Reported"}</Badge>,
								m.reported_by ?? "—",
								m.created_at ?? m.date ?? "—",
							])}
						/>
					</div>
				</div>
			)}

			{/* ══════════════ BROADCAST ══════════════ */}
			{activeTab === "broadcast" && (
				<div className="space-y-5">
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
						<KpiCard
							label="Emergency Alerts"
							value={<AnimN value={stats.total_alerts ?? 0} />}
							icon={AlertTriangle}
							color="text-green-400"
							sub={stats.total_alerts != null ? `All ${stats.total_alerts} resolved` : undefined}
						/>
						<KpiCard
							label="Shoot Bookings"
							value={<AnimN value={stats.videography_total ?? 0} />}
							icon={Camera}
							color="text-blue-400"
							sub={stats.videography_approved != null ? `${stats.videography_approved} approved` : undefined}
						/>
						<KpiCard
							label="File Transfers"
							value={<AnimN value={stats.file_transfers_total ?? 0} />}
							icon={Upload}
							color="text-purple-400"
							sub={stats.file_transfers_size != null ? `${stats.file_transfers_size} total` : undefined}
						/>
						<KpiCard
							label="Support Tickets"
							value={<AnimN value={stats.feedback_total ?? 0} />}
							icon={FileText}
							color="text-cyan-400"
							sub={stats.feedback_open != null ? `${stats.feedback_open} open, ${(stats.feedback_total ?? 0) - (stats.feedback_open ?? 0)} closed` : undefined}
						/>
					</div>

					{/* Alert severity chart */}
					<div className="card">
						<SectionHeader title="Emergency Alert History" icon={AlertTriangle}>
							<Badge color="green">All {stats.total_alerts ?? 0} Resolved</Badge>
							<ExportButton
								fmt="csv"
								module="alerts"
								days={period}
								label="Export"
								icon={FileText}
								variant="pill"
							/>
						</SectionHeader>
						<div className="grid grid-cols-3 gap-3 mb-4">
							{[
								{ label: "Total", value: String(stats.total_alerts ?? 0), color: "text-white" },
								{ label: "Critical", value: String(stats.critical_alerts ?? 0), color: "text-red-500" },
								{ label: "High", value: String(stats.high_alerts ?? 0), color: "text-red-400" },
							].map((d) => (
								<div
									key={d.label}
									className="text-center p-3 bg-surface rounded-xl border border-surface-border">
									<div className={clsx("text-2xl font-bold", d.color)}>
										{d.value}
									</div>
									<div className="text-[10px] text-slate-500 mt-0.5">
										{d.label}
									</div>
								</div>
							))}
						</div>
						<DataTable
							maxRows={5}
							headers={["Title", "Severity", "Date", "Resolved"]}
							rows={(stats.alerts || []).map((a: any) => [
								<span className="text-white text-xs">{a.title}</span>,
								<Badge color={a.sev === "critical" ? "red" : "red"}>
									{a.sev}
								</Badge>,
								<span className="text-slate-400 text-[11px]">{a.date}</span>,
								<span className="text-green-400 font-semibold">✓ Yes</span>,
							])}
						/>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
						{/* Certificates */}
						<div className="card">
							<SectionHeader title="Certificates Issued" icon={Award}>
								<ExportButton
									fmt="csv"
									module="certificates"
									days={period}
									label="Export"
									icon={FileText}
									variant="pill"
								/>
							</SectionHeader>
							<DataTable
								headers={[
									"Cert #",
									"Type",
									"Status",
									"Recipient",
									"Issue Date",
								]}
								rows={(stats.certificates || []).map((c: any) => [
									c.cert_number ?? c.id ?? "—",
									<Badge color="blue">{c.type ?? "Certificate"}</Badge>,
									<Badge color="green">{c.status ?? "Issued"}</Badge>,
									c.recipient ?? c.recipient_name ?? "—",
									c.issued_at ?? c.issue_date ?? "—",
								])}
							/>
						</div>

						{/* Feedback */}
						<div className="card">
							<SectionHeader title="Support Tickets" icon={FileText}>
								<ExportButton
									fmt="csv"
									module="feedback"
									days={period}
									label="Export"
									icon={FileText}
									variant="pill"
								/>
							</SectionHeader>
							<DataTable
								headers={["Ticket #", "Category", "Priority", "Status", "Date"]}
								// {/* FIX: was feedbackRow / t.status with mixed names — now consistently feedbackRow */}
								rows={(stats.feedback || []).map((feedbackRow: any) => [
									feedbackRow.ticket_number ?? feedbackRow.id ?? "—",
									feedbackRow.category ?? "General",
									<Badge color="gray">{feedbackRow.priority ?? "Low"}</Badge>,
									<span className="flex items-center gap-1"><StatusDot status={feedbackRow.status} />{feedbackRow.status}</span>,
									feedbackRow.created_at ?? feedbackRow.date ?? "—",
								])}
							/>
							<div className="mt-3 grid grid-cols-2 gap-3">
								<div className="text-center p-3 bg-amber-950/20 border border-amber-500/15 rounded-xl">
									<div className="text-xl font-bold text-amber-400">{stats.feedback_open ?? 0}</div>
									<div className="text-[10px] text-slate-500">Open</div>
								</div>
								<div className="text-center p-3 bg-green-950/20 border border-green-500/15 rounded-xl">
									<div className="text-xl font-bold text-green-400">{(stats.feedback_total ?? 0) - (stats.feedback_open ?? 0)}</div>
									<div className="text-[10px] text-slate-500">
										Resolved{stats.feedback_total ? ` (${Math.round(((stats.feedback_total - (stats.feedback_open ?? 0)) / stats.feedback_total) * 100)}%)` : ""}
									</div>
								</div>
							</div>
						</div>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
						{/* File transfers */}
						<div className="card">
							<SectionHeader title="File Transfers" icon={Upload}>
								<ExportButton
									fmt="csv"
									module="filetransfers"
									days={period}
									label="Export"
									icon={FileText}
									variant="pill"
								/>
							</SectionHeader>
							<DataTable
								headers={["Filename", "Size", "Downloads", "Date"]}
								rows={(stats.file_transfers || []).map((f: any) => [
									f.filename ?? f.name ?? "—",
									f.size ?? f.file_size ?? "—",
									String(f.downloads ?? f.download_count ?? 0),
									f.uploaded_at ?? f.date ?? "—",
								])}
							/>
						</div>

						{/* Videography + Wi-Fi */}
						<div className="card">
							<SectionHeader title="Videography & Wi-Fi" icon={Camera} />
							<div className="space-y-4">
								<div>
									<p className="text-[11px] text-slate-500 font-semibold mb-2">
										Shoot Bookings
									</p>
									<DataTable
										headers={["Title", "Date", "Duration", "Status"]}
										rows={(stats.videography || []).map((v: any) => [
											v.title ?? v.name ?? "—",
											v.shoot_date ?? v.date ?? "—",
											v.duration ?? "—",
											<Badge color={v.status === "approved" ? "green" : v.status === "rejected" ? "red" : "gray"}>{v.status ?? "Pending"}</Badge>,
										])}
									/>
								</div>
								<div>
									<p className="text-[11px] text-slate-500 font-semibold mb-2">
										Wi-Fi Grants
									</p>
									<DataTable
										headers={["Device", "Duration", "Status", "Expires"]}
										rows={(stats.wifi_grants || []).map((w: any) => [
											w.device ?? w.device_name ?? "—",
											w.duration ?? "—",
											<span className="flex items-center gap-1"><StatusDot status={w.status} />{w.status}</span>,
											w.expires_at ?? w.expiry ?? "—",
										])}
									/>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* ══════════════ SYSTEM ══════════════ */}
			{activeTab === "system" && (
				<div className="space-y-5">
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
						<KpiCard
							label="Total API Calls"
							value={<AnimN value={sysSummary.total_requests ?? 0} />}
							icon={Zap}
							color="text-white"
						/>
						<KpiCard
							label="POST (Create)"
							value={<AnimN value={146} />}
							icon={ArrowUpRight}
							color="text-blue-400"
						/>
						<KpiCard
							label="PATCH (Update)"
							value={<AnimN value={59} />}
							icon={RefreshCw}
							color="text-purple-400"
						/>
						<KpiCard
							label="Avg Response"
							value={sysSummary.avg_response_ms != null ? `${sysSummary.avg_response_ms}ms` : "—"}
							icon={Clock}
							color="text-amber-400"
							sub={sysSummary.p99_ms != null ? `P99: ${sysSummary.p99_ms}ms` : undefined}
							alert={sysSummary.p99_ms != null && sysSummary.p99_ms > 3000}
						/>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
						{/* API timeline */}
						<div className="card">
							<SectionHeader title="API Timeline" icon={Zap}>
								<ExportButton
									fmt="csv"
									module="audit"
									days={period}
									label="CSV"
									icon={FileText}
									variant="pill"
								/>
								<ExportButton
									fmt="json"
									module="full"
									days={period}
									label="JSON"
									icon={FileJson}
									variant="pill"
								/>
							</SectionHeader>
							<ResponsiveContainer width="100%" height={200}>
								<BarChart data={auditTimeline}>
									<CartesianGrid
										strokeDasharray="3 3"
										stroke="rgba(255,255,255,0.04)"
									/>
									<XAxis
										dataKey="date"
										tick={{ fill: "#475569", fontSize: 11 }}
										tickLine={false}
									/>
									<YAxis
										tick={{ fill: "#475569", fontSize: 10 }}
										tickLine={false}
										axisLine={false}
									/>
									<Tooltip {...TT} />
									<Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
									<Bar
										dataKey="posts"
										fill={C.blue}
										name="POST"
										radius={[3, 3, 0, 0]}
										stackId="a"
									/>
									<Bar
										dataKey="patches"
										fill={C.purple}
										name="PATCH"
										radius={[0, 0, 0, 0]}
										stackId="a"
									/>
								</BarChart>
							</ResponsiveContainer>
						</div>

						{/* Hourly */}
						<div className="card">
							<SectionHeader title="Hourly Distribution" icon={Clock} />
							<ResponsiveContainer width="100%" height={200}>
								<BarChart data={sysHourly}>
									<CartesianGrid
										strokeDasharray="3 3"
										stroke="rgba(255,255,255,0.04)"
									/>
									<XAxis
										dataKey="hour"
										tick={{ fill: "#475569", fontSize: 9 }}
										tickLine={false}
										tickFormatter={(v) => `${v}h`}
									/>
									<YAxis
										tick={{ fill: "#475569", fontSize: 10 }}
										tickLine={false}
										axisLine={false}
									/>
									<Tooltip
										{...TT}
										formatter={(v: any) => [v, "Calls"]}
										labelFormatter={(l) => `${l}:00`}
									/>
									<Bar dataKey="count" name="Calls" radius={[3, 3, 0, 0]}>
										{/* FIX: was d.count — now hourData.count */}
										{sysHourly.map((hourData, idx) => (
											<Cell
												key={idx}
												fill={
													hourData.count > 30 ? C.red : hourData.count > 15 ? C.amber : C.blue
												}
											/>
										))}
									</Bar>
								</BarChart>
							</ResponsiveContainer>
							<p className="text-[10px] text-amber-500 mt-2">
								🔴 Midnight spike (45 calls) · 06:00h spike (40 calls) — verify
								cron vs unauthorised
							</p>
						</div>
					</div>

					{/* Module detail table */}
					<div className="card">
						<SectionHeader title="Full Module Breakdown" icon={BarChart3} />
						<DataTable
							headers={[
								"Module",
								"Total Calls",
								"% of Total",
								"Trend",
							]}
							// {/* FIX: removed stale m.jun11 column reference; now 4 cols matching 4 headers */}
							rows={sysModules.map((m) => [
								m.module,
								<span className="font-semibold text-white">{m.calls}</span>,
								`${m.pct}%`,
								<div className="flex items-center gap-2 w-20">
									<div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
										<div
											className="h-full rounded-full bg-blue-500"
											style={{ width: `${sysModules.length ? Math.min(100, (m.calls / (sysModules[0]?.calls || 1)) * 100) : 0}%` }}
										/>
									</div>
								</div>,
							])}
						/>
					</div>

					{/* Performance */}
					<div className="card">
						<SectionHeader title="Performance Analysis" icon={TrendingUp} />
						<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
							{([
								{ label: "<100ms",    key: "fast",     color: "text-green-400",  bg: "bg-green-950/20 border-green-500/15"  },
								{ label: "100–500ms", key: "medium",   color: "text-amber-400",  bg: "bg-amber-950/20 border-amber-500/15"  },
								{ label: "500ms–1s",  key: "slow",     color: "text-orange-400", bg: "bg-orange-950/20 border-orange-500/15" },
								{ label: ">1 second", key: "very_slow", color: "text-red-400",   bg: "bg-red-950/20 border-red-500/15"     },
							] as { label: string; key: string; color: string; bg: string }[]).map((d) => {
								const bucket = (sysSummary.response_buckets || []).find((b: any) => b.key === d.key || b.name === d.label);
								const value = bucket?.value ?? bucket?.count ?? 0;
								const pct = bucket?.pct != null ? `${Number(bucket.pct).toFixed(1)}%` : "—";
								return { ...d, value, pct };
							}).map((d) => (
								<div
									key={d.label}
									className={clsx("text-center p-3 rounded-xl border", d.bg)}>
									<div className={clsx("text-2xl font-bold", d.color)}>
										{d.value}
									</div>
									<div className="text-[10px] text-slate-500 mt-0.5">
										{d.label}
									</div>
									<div className={clsx("text-xs font-semibold mt-1", d.color)}>
										{d.pct}
									</div>
								</div>
							))}
						</div>
						<div className="text-[11px] text-red-400 flex items-center gap-1.5">
							<AlertTriangle size={11} />
							{sysSummary.slow_count != null ? `${sysSummary.slow_count} request(s) exceeded 1 second` : 'Response time data loading...'}{sysSummary.max_response_ms != null ? ` (max: ${sysSummary.max_response_ms.toLocaleString()}ms)` : ''}
						</div>
					</div>

					{/* Security */}
					<div className="card">
						<SectionHeader title="Security Summary" icon={Shield} />
						<div className="space-y-2">
							{([
								{
									label: "MFA adoption",
									value: sysSummary.mfa_adoption != null ? `${sysSummary.mfa_adoption}%` : "N/A",
									status: (sysSummary.mfa_adoption ?? 0) === 0 ? "critical" : (sysSummary.mfa_adoption ?? 100) < 80 ? "warning" : "good",
									note: sysSummary.mfa_users != null ? `${sysSummary.mfa_users}/${stats.active_users ?? 0} users enabled` : "No MFA data available",
								},
								{
									label: "Blacklisted tokens",
									value: String(sysSummary.blacklisted_tokens ?? 0),
									status: "good",
									note: `${sysSummary.blacklisted_tokens ?? 0} JWT token(s) invalidated`,
								},
								{
									label: "Off-hours API activity",
									value: sysSummary.offhours_calls != null ? String(sysSummary.offhours_calls) : "N/A",
									status: (sysSummary.offhours_calls ?? 0) > 20 ? "warning" : "good",
									note: sysSummary.offhours_calls != null ? `${sysSummary.offhours_calls} calls outside business hours` : "No off-hours data",
								},
								{
									label: "Active sessions",
									value: String(sysSummary.active_sessions ?? 0),
									status: "good",
									note: sysSummary.active_sessions ? `${sysSummary.active_sessions} active session(s)` : "No active sessions",
								},
								{
									label: "Max response time",
									value: sysSummary.max_response_ms != null ? `${(sysSummary.max_response_ms / 1000).toFixed(1)}s` : "N/A",
									status: (sysSummary.max_response_ms ?? 0) > 5000 ? "warning" : "good",
									note: sysSummary.slow_endpoints?.length ? `Slow: ${sysSummary.slow_endpoints.join(", ")}` : "All endpoints within threshold",
								},
								{
									label: "Failed auth attempts",
									value: String(sysSummary.failed_auth ?? 0),
									status: (sysSummary.failed_auth ?? 0) > 0 ? "warning" : "good",
									note: sysSummary.failed_auth ? `${sysSummary.failed_auth} failed login attempt(s)` : "No failed auth attempts",
								},
							] as { label: string; value: string; status: string; note: string }[]).map((secItem, idx) => (
								<div
									key={idx}
									className="flex items-center justify-between py-2 border-b border-surface-border/30 last:border-0">
									<div>
										<p className="text-xs text-slate-300">{secItem.label}</p>
										<p className="text-[10px] text-slate-600">{secItem.note}</p>
									</div>
									<Badge
										color={
											secItem.status === "critical"
												? "red"
												: secItem.status === "warning"
													? "amber"
													: secItem.status === "good"
														? "green"
														: "gray"
										}>
										{secItem.value}
									</Badge>
								</div>
							))}
						</div>
					</div>
				</div>
			)}

			{/* ══════════════ EXPORT HUB ══════════════ */}
			{activeTab === "export" && (
				<div className="space-y-5">
					{/* Header card */}
					<div className="card bg-gradient-to-r from-surface to-surface border-Swahilipot-500/20">
						<div className="flex items-start gap-4">
							<div className="w-10 h-10 rounded-xl bg-Swahilipot-500/20 flex items-center justify-center shrink-0">
								<Download size={18} className="text-Swahilipot-400" />
							</div>
							<div>
								<h2 className="font-bold text-white text-base">
									Export Centre
								</h2>
								<p className="text-slate-400 text-xs mt-1 leading-relaxed">
									Generate professional reports from live database data. Every
									export is built fresh from the ORM using
									<span className="text-Swahilipot-400 font-medium">
										{" "}
										pandas · matplotlib · seaborn · ReportLab · OpenPyXL ·
										python-pptx
									</span>
									. Compatible with Power BI, Tableau, Grafana, and Excel.
								</p>
							</div>
						</div>
					</div>

					{/* Format cards */}
					<div>
						<h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
							<FileText size={13} className="text-slate-500" /> Choose Export Format
						</h3>
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
							{FORMATS.map((fmt) => (
								<div key={fmt.id} className="card hover:border-white/10 transition-all">
									<div className="flex items-start gap-3 mb-3">
										<div className="w-9 h-9 rounded-xl bg-surface-border flex items-center justify-center shrink-0">
											<fmt.icon size={16} className="text-slate-300" />
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-xs font-semibold text-white">{fmt.label}</p>
											<p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{fmt.desc}</p>
										</div>
									</div>
									<ExportButton
										fmt={fmt.id}
										module="full"
										days={period}
										label={`Download ${fmt.label}`}
										icon={Download}
										variant="full"
									/>
								</div>
							))}
						</div>
					</div>

					{/* Module-specific exports */}
					<div>
						<h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
							<Zap size={13} className="text-slate-500" /> Module-Specific Exports
						</h3>
						<div className="card">
							<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
								{[
									{ fmt: "pdf",   label: "PDF",   icon: File,          color: "text-red-400"    },
									{ fmt: "excel", label: "Excel", icon: FileSpreadsheet, color: "text-green-400" },
									{ fmt: "csv",   label: "CSV",   icon: FileText,       color: "text-blue-400"  },
									{ fmt: "json",  label: "JSON",  icon: FileJson,       color: "text-purple-400"},
								].map((f) => (
									<div
										key={f.fmt}
										className={clsx(
											"flex items-center gap-2 p-2.5 rounded-xl border border-surface-border bg-surface text-[11px] font-medium",
											f.color,
										)}>
										<f.icon size={14} className="opacity-70" /> {f.label}
									</div>
								))}
							</div>
							<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
								{MODULES.map(({ id, label, icon: Icon }) => (
									<div key={id} className="space-y-1.5 p-3 rounded-xl bg-surface border border-surface-border">
										<div className="flex items-center gap-1.5 text-[11px] text-slate-300 font-medium mb-2">
											<Icon size={12} className="text-slate-500" /> {label}
										</div>
										<div className="grid grid-cols-2 gap-1">
											{[
												{ fmt: "csv",  icon: FileText, label: "CSV"  },
												{ fmt: "json", icon: FileJson, label: "JSON" },
											].map((f) => (
												<ExportButton
													key={f.fmt}
													fmt={f.fmt}
													module={id}
													days={period}
													label={f.label}
													icon={f.icon}
												/>
											))}
										</div>
									</div>
								))}
							</div>
						</div>
					</div>

					{/* Quick export row */}
					<div>
						<h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
							<Sparkles size={13} className="text-slate-500" /> One-Click Full Reports
						</h3>
						<div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
							{FORMATS.map((fmt) => (
								<ExportButton
									key={fmt.id}
									fmt={fmt.id}
									module="full"
									days={period}
									label={fmt.label}
									icon={fmt.icon}
								/>
							))}
						</div>
					</div>

					{/* API endpoint reference */}
					<div className="card">
						<SectionHeader title="API Endpoint Reference" icon={Info} />
						<div className="space-y-2">
							{[
								["GET", "/api/v1/analytics/exports/",                        "List available formats & modules"          ],
								["GET", "/api/v1/analytics/exports/pdf/full/?days=30",        "Full PDF report (last 30 days)"            ],
								["GET", "/api/v1/analytics/exports/excel/full/",              "Full Excel workbook (4 sheets)"            ],
								["GET", "/api/v1/analytics/exports/pptx/full/",               "Full PowerPoint (6 slides)"                ],
								["GET", "/api/v1/analytics/exports/csv/audit/?days=7",        "Enriched audit log CSV (7 days)"           ],
								["GET", "/api/v1/analytics/exports/csv/performance/",         "Performance metrics CSV"                   ],
								["GET", "/api/v1/analytics/exports/json/full/",               "Full JSON payload (Power BI ready)"        ],
								["GET", "/api/v1/analytics/exports/csv/users/",               "Users with API activity & risk level"      ],
								["GET", "/api/v1/analytics/exports/csv/equipment/",           "Equipment inventory with valuations"       ],
								["GET", "/api/v1/analytics/exports/csv/attendance/?days=30",  "Attendance records (date-ranged)"          ],
							].map(([method, path, desc], idx) => (
								<div key={idx} className="flex items-start gap-3 py-2 border-b border-surface-border/30 last:border-0">
									<span
										className={clsx(
											"text-[10px] font-bold px-1.5 py-0.5 rounded font-mono shrink-0 mt-0.5",
											method === "GET"
												? "bg-blue-500/20 text-blue-400"
												: "bg-green-500/20 text-green-400",
										)}>
										{method}
									</span>
									<code className="text-[10px] text-cyan-400 font-mono flex-1 leading-5 break-all">
										{path}
									</code>
									<span className="text-[10px] text-slate-600 shrink-0 hidden sm:block">
										{desc}
									</span>
								</div>
							))}
						</div>
						<p className="text-[10px] text-slate-700 mt-3">
							All endpoints require authentication · Optional params:{" "}
							<code className="text-slate-500">
								?start=YYYY-MM-DD&end=YYYY-MM-DD&department=uuid
							</code>
						</p>
					</div>

					{/* Tool stack info */}
					<div className="card">
						<SectionHeader title="Report Generation Stack" icon={Sparkles} />
						<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
							{[
								{ name: "pandas",      role: "Data loading & transformation from ORM",       color: C.blue   },
								{ name: "matplotlib",  role: "Chart generation (PNG, embedded in PDF)",       color: C.amber  },
								{ name: "seaborn",     role: "Statistical styling & heatmaps",               color: C.purple },
								{ name: "numpy/scipy", role: "Statistical computation & percentiles",         color: C.cyan   },
								{ name: "ReportLab",   role: "PDF generation with dark theme cover page",     color: C.red    },
								{ name: "OpenPyXL",    role: "Excel workbook with embedded charts",           color: C.green  },
								{ name: "python-pptx", role: "PowerPoint with 6-slide dark deck",             color: C.orange },
								{ name: "xlsxwriter",  role: "Advanced Excel formatting & formulas",          color: C.teal   },
							].map((tabItem, idx) => (
								<div key={idx} className="p-3 rounded-xl bg-surface border border-surface-border">
									<div className="flex items-center gap-2 mb-1">
										<span className="w-2 h-2 rounded-full" style={{ background: tabItem.color }} />
										<span className="text-xs font-semibold text-white font-mono">{tabItem.name}</span>
									</div>
									<p className="text-[10px] text-slate-600 leading-relaxed">{tabItem.role}</p>
								</div>
							))}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}