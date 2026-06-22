// Swahilipot — Executive Dashboard (live API data)
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
	BarChart3,
	TrendingUp,
	TrendingDown,
	Users,
	Activity,
	Radio,
	Award,
	Target,
	Globe,
	Shield,
	Clock,
	AlertTriangle,
	CheckCircle,
	XCircle,
	Wrench,
	FileText,
	DollarSign,
	Newspaper,
	Wifi,
	MessageSquare,
} from "lucide-react";
import {
	analyticsApi,
	financeApi,
	equipmentApi,
	fmReportApi,
	tasksApi,
} from "../../services/api";
import { useAuthStore } from "../../services/api";
import { format } from "date-fns";
import {
	AreaChart,
	Area,
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	LineChart,
	Line,
	PieChart,
	Pie,
	Cell,
} from "recharts";
import clsx from "clsx";

// ── Chart styling ──────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
	contentStyle: {
		background: "#1e2538",
		border: "1px solid #252d42",
		borderRadius: 8,
		fontSize: 12,
	},
	labelStyle: { color: "#94a3b8" },
	itemStyle: { color: "#f1f5f9" },
};

const COLORS = [
	"#3b63f5",
	"#22c55e",
	"#f59e0b",
	"#ef4444",
	"#8b5cf6",
	"#06b6d4",
];

const STATUS_COLORS: Record<string, string> = {
	Approved: "#22c55e",
	"In Progress": "#3b63f5",
	Pending: "#f59e0b",
	Overdue: "#ef4444",
	Submitted: "#06b6d4",
	Rejected: "#94a3b8",
};

// ── Small reusable components ──────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
	return (
		<div className={clsx("animate-pulse bg-slate-700/40 rounded", className)} />
	);
}

function AlertBanner({
	level,
	message,
	link,
}: {
	level: "critical" | "warning" | "info";
	message: string;
	link?: string;
}) {
	const navigate = useNavigate();
	const styles: Record<string, string> = {
		critical: "bg-red-500/10 border-red-500/40 text-red-300",
		warning: "bg-amber-500/10 border-amber-500/40 text-amber-300",
		info: "bg-blue-500/10 border-blue-500/40 text-blue-300",
	};
	const Icon =
		level === "critical"
			? XCircle
			: level === "warning"
				? AlertTriangle
				: CheckCircle;

	return (
		<div
			className={clsx(
				"flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium",
				styles[level],
				link && "cursor-pointer hover:opacity-80 transition-opacity",
			)}
			onClick={() => link && navigate(link)}>
			<Icon size={13} className="shrink-0" />
			{message}
		</div>
	);
}

function InsightBanner({
	severity,
	message,
}: {
	severity: string;
	message: string;
}) {
	const styles: Record<string, string> = {
		critical: "bg-red-500/10 border-red-500/30 text-red-300",
		warning: "bg-amber-500/10 border-amber-500/30 text-amber-300",
		success: "bg-green-500/10 border-green-500/30 text-green-300",
		info: "bg-blue-500/10 border-blue-500/30 text-blue-300",
	};
	return (
		<div
			className={clsx(
				"px-3 py-2 rounded-lg border text-xs",
				styles[severity] || styles.info,
			)}>
			{message}
		</div>
	);
}

interface KpiCardProps {
	label: string;
	value: string | number;
	trend?: string;
	up?: boolean;
	icon: React.ElementType;
	color: "blue" | "green" | "amber" | "red" | "purple" | "cyan";
	loading?: boolean;
}

function KpiCard({
	label,
	value,
	trend,
	up,
	icon: Icon,
	color,
	loading,
}: KpiCardProps) {
	const colorMap: Record<string, string> = {
		blue: "text-blue-400 bg-blue-500/10",
		green: "text-green-400 bg-green-500/10",
		amber: "text-amber-400 bg-amber-500/10",
		red: "text-red-400 bg-red-500/10",
		purple: "text-purple-400 bg-purple-500/10",
		cyan: "text-cyan-400 bg-cyan-500/10",
	};

	return (
		<div className="stat-card">
			<div
				className={clsx(
					"w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
					colorMap[color],
				)}>
				<Icon size={17} />
			</div>
			{loading ? (
				<>
					<Skeleton className="h-7 w-16 mt-1" />
					<Skeleton className="h-3 w-24 mt-1" />
				</>
			) : (
				<>
					<div className="stat-value">{value ?? "—"}</div>
					<div className="stat-label">{label}</div>
				</>
			)}
			{trend && !loading && (
				<div
					className={clsx(
						"flex items-center gap-1 text-[10px] font-medium mt-0.5",
						up ? "text-green-400" : "text-red-400",
					)}>
					{up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
					{trend}
				</div>
			)}
		</div>
	);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 mt-2">
			{children}
		</h2>
	);
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ExecutiveDashboard() {
	const { user } = useAuthStore();
	const navigate = useNavigate();

	// Primary dashboard endpoint — stats + charts + alerts + insights
	const { data: analytics, isLoading } = useQuery({
		queryKey: ["analytics-dashboard"],
		queryFn: () => analyticsApi.dashboard().then((r) => r.data),
		refetchInterval: 120_000,
	});

	// Finance: cash flow for revenue/expense chart
	const { data: cashFlow } = useQuery({
		queryKey: ["finance-cashflow-exec"],
		queryFn: () =>
			financeApi.cashFlow({ period: "monthly", months: 6 }).then((r) => r.data),
		staleTime: 300_000,
	});

	// Equipment stats for utilisation
	const { data: equipStats } = useQuery({
		queryKey: ["equipment-stats-exec"],
		queryFn: () => equipmentApi.stats().then((r) => r.data),
		staleTime: 300_000,
	});

	// FM stations list to show per-station status
	const { data: fmStations } = useQuery({
		queryKey: ["fm-stations-exec"],
		queryFn: () => fmReportApi.stations().then((r) => r.data),
		staleTime: 60_000,
	});

	// Tasks needing approval (submitted status, limit 10)
	const { data: pendingTasksData } = useQuery({
		queryKey: ["tasks-pending-exec"],
		queryFn: () =>
			tasksApi.list({ status: "submitted", page_size: 10 }).then((r) => r.data),
		staleTime: 60_000,
	});

	const stats = analytics?.stats || {};
	const charts = analytics?.charts || {};
	const alerts: any[] = analytics?.alerts || [];
	const insights: any[] = analytics?.insights || [];

	const pendingTasks: any[] = Array.isArray(pendingTasksData)
		? pendingTasksData
		: pendingTasksData?.results || [];

	// ── KPI definitions (all from stats) ──────────────────────────────────

	const kpis: KpiCardProps[] = [
		{
			label: "Active users",
			value: stats.active_users,
			icon: Users,
			color: "blue",
		},
		{
			label: "Active attachees",
			value: stats.active_attachees,
			icon: Award,
			color: "purple",
		},
		{
			label: "FM uptime (today)",
			value:
				stats.fm_uptime_percent != null ? `${stats.fm_uptime_percent}%` : "—",
			trend:
				stats.fm_active_outages > 0
					? `${stats.fm_active_outages} outage${stats.fm_active_outages > 1 ? "s" : ""}`
					: "All on air",
			up: stats.fm_active_outages === 0,
			icon: Radio,
			color: stats.fm_active_outages > 0 ? "red" : "green",
		},
		{
			label: "Task completion",
			value:
				stats.task_completion_rate != null
					? `${stats.task_completion_rate}%`
					: "—",
			trend: `${stats.tasks_overdue ?? 0} overdue`,
			up: (stats.tasks_overdue ?? 0) === 0,
			icon: Target,
			color: "green",
		},
		{
			label: "Equipment utilisation",
			value:
				stats.equipment_utilisation_pct != null
					? `${stats.equipment_utilisation_pct}%`
					: "—",
			trend: `${stats.equipment_under_repair ?? 0} in repair`,
			up: (stats.equipment_under_repair ?? 0) === 0,
			icon: Activity,
			color: "amber",
		},
		{
			label: "Attendance today",
			value:
				stats.attendance_rate_today != null
					? `${stats.attendance_rate_today}%`
					: "—",
			trend: `${stats.present_today ?? 0} present`,
			up: (stats.attendance_rate_today ?? 0) >= 80,
			icon: Users,
			color: (stats.attendance_rate_today ?? 0) >= 80 ? "green" : "red",
		},
		{
			label: "Certificates issued",
			value: stats.certificates_issued,
			icon: Award,
			color: "cyan",
		},
		{
			label: "News published",
			value: stats.news_published,
			trend: `${stats.news_published_today ?? 0} today`,
			up: true,
			icon: Newspaper,
			color: "blue",
		},
		{
			label: "Open feedback tickets",
			value: stats.tickets_open,
			trend: `${stats.ticket_resolution_rate ?? 0}% resolved`,
			up: (stats.ticket_resolution_rate ?? 0) >= 70,
			icon: MessageSquare,
			color: "amber",
		},
		{
			label: "Wi-Fi active grants",
			value: stats.wifi_active_grants,
			trend: `${stats.wifi_pending_grants ?? 0} pending`,
			up: true,
			icon: Wifi,
			color: "cyan",
		},
		{
			label: "MFA adoption",
			value:
				stats.mfa_adoption_pct != null ? `${stats.mfa_adoption_pct}%` : "—",
			trend: `${stats.mfa_enabled_count ?? 0} / ${stats.active_users ?? 0} users`,
			up: (stats.mfa_adoption_pct ?? 0) >= 80,
			icon: Shield,
			color: (stats.mfa_adoption_pct ?? 0) >= 80 ? "green" : "red",
		},
		{
			label: "API calls (30d)",
			value: stats.api_calls_30d,
			icon: Globe,
			color: "purple",
		},
	];

	// ── Task colour helper ─────────────────────────────────────────────────

	const priorityColor = (p: string) =>
		({
			critical: "text-red-400",
			high: "text-amber-400",
			medium: "text-blue-400",
			low: "text-slate-400",
		})[p] ?? "text-slate-400";

	// ── Render ─────────────────────────────────────────────────────────────

	return (
		<div className="space-y-6 animate-fade-in">
			{/* Header */}
			<div className="flex items-start justify-between flex-wrap gap-3">
				<div>
					<h1 className="page-title">Executive Overview</h1>
					<p className="page-subtitle">
						{format(new Date(), "EEEE, MMMM d yyyy")} ·{" "}
						{user?.organisation_name}
					</p>
				</div>
				<div className="flex gap-2 flex-wrap">
					<button
						onClick={() => navigate("/analytics")}
						className="btn-primary btn-sm">
						<BarChart3 size={14} /> Full Analytics
					</button>
					<button
						onClick={() => analyticsApi.export("pdf", "full", { days: 30 })}
						className="btn-secondary btn-sm">
						<FileText size={14} /> Export PDF
					</button>
				</div>
			</div>

			{/* Alerts from backend */}
			{alerts.length > 0 && (
				<div className="space-y-2">
					{alerts.map((a, i) => (
						<AlertBanner
							key={i}
							level={a.level}
							message={a.message}
							link={a.link}
						/>
					))}
				</div>
			)}

			{/* KPI grid */}
			<SectionTitle>Key performance indicators</SectionTitle>
			<div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
				{kpis.map((kpi) => (
					<KpiCard key={kpi.label} {...kpi} loading={isLoading} />
				))}
			</div>

			{/* AI insights */}
			{insights.length > 0 && (
				<>
					<SectionTitle>Automated insights</SectionTitle>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
						{insights.map((ins: any, i: number) => (
							<InsightBanner
								key={i}
								severity={ins.severity}
								message={ins.message}
							/>
						))}
					</div>
				</>
			)}

			{/* Charts row 1 — Attendance */}
			<SectionTitle>Attendance</SectionTitle>
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Attendance trend */}
				<div className="card">
					<h3 className="font-semibold text-white mb-4">
						Attendance trend — last 14 days
					</h3>
					{isLoading ? (
						<Skeleton className="h-52 w-full" />
					) : (
						<ResponsiveContainer width="100%" height={220}>
							<AreaChart data={charts.attendance_trend || []}>
								<defs>
									<linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor="#3b63f5" stopOpacity={0.3} />
										<stop offset="95%" stopColor="#3b63f5" stopOpacity={0} />
									</linearGradient>
								</defs>
								<CartesianGrid strokeDasharray="3 3" stroke="#252d42" />
								<XAxis
									dataKey="date"
									tick={{ fill: "#64748b", fontSize: 10 }}
									tickLine={false}
								/>
								<YAxis
									tick={{ fill: "#64748b", fontSize: 10 }}
									tickLine={false}
									axisLine={false}
								/>
								<Tooltip {...TOOLTIP_STYLE} />
								<Area
									type="monotone"
									dataKey="present"
									stroke="#3b63f5"
									fill="url(#aGrad)"
									strokeWidth={2}
									name="Present"
								/>
								<Area
									type="monotone"
									dataKey="absent"
									stroke="#ef4444"
									fill="none"
									strokeWidth={1.5}
									strokeDasharray="4 4"
									name="Absent"
								/>
								<Area
									type="monotone"
									dataKey="leave"
									stroke="#f59e0b"
									fill="none"
									strokeWidth={1.5}
									strokeDasharray="2 4"
									name="On Leave"
								/>
							</AreaChart>
						</ResponsiveContainer>
					)}
				</div>

				{/* Weekly cohort attendance */}
				<div className="card">
					<h3 className="font-semibold text-white mb-4">
						Weekly attendance rate
					</h3>
					{isLoading ? (
						<Skeleton className="h-52 w-full" />
					) : (
						<ResponsiveContainer width="100%" height={220}>
							<BarChart data={charts.weekly_cohort || []}>
								<CartesianGrid strokeDasharray="3 3" stroke="#252d42" />
								<XAxis
									dataKey="week"
									tick={{ fill: "#64748b", fontSize: 9 }}
									tickLine={false}
								/>
								<YAxis
									tick={{ fill: "#64748b", fontSize: 10 }}
									tickLine={false}
									axisLine={false}
									unit="%"
									domain={[0, 100]}
								/>
								<Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => `${v}%`} />
								<Bar
									dataKey="rate"
									fill="#3b63f5"
									radius={[4, 4, 0, 0]}
									name="Attendance %"
								/>
							</BarChart>
						</ResponsiveContainer>
					)}
				</div>
			</div>

			{/* Charts row 2 — Tasks */}
			<SectionTitle>Tasks</SectionTitle>
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Task status donut */}
				<div className="card">
					<h3 className="font-semibold text-white mb-4">
						Task status distribution
					</h3>
					{isLoading ? (
						<Skeleton className="h-44 w-full" />
					) : (
						<>
							<ResponsiveContainer width="100%" height={160}>
								<PieChart>
									<Pie
										data={charts.task_status || []}
										cx="50%"
										cy="50%"
										innerRadius={50}
										outerRadius={70}
										dataKey="value"
										nameKey="name">
										{(charts.task_status || []).map((s: any, i: number) => (
											<Cell
												key={i}
												fill={
													STATUS_COLORS[s.name] || COLORS[i % COLORS.length]
												}
											/>
										))}
									</Pie>
									<Tooltip {...TOOLTIP_STYLE} />
								</PieChart>
							</ResponsiveContainer>
							<div className="flex flex-wrap gap-2 justify-center mt-2">
								{(charts.task_status || []).map((s: any, i: number) => (
									<div
										key={i}
										className="flex items-center gap-1.5 text-xs text-slate-400">
										<span
											className="w-2 h-2 rounded-full"
											style={{
												background:
													STATUS_COLORS[s.name] || COLORS[i % COLORS.length],
											}}
										/>
										{s.name}:{" "}
										<span className="text-white font-medium">{s.value}</span>
									</div>
								))}
							</div>
						</>
					)}
				</div>

				{/* Task completion time by priority */}
				<div className="card">
					<h3 className="font-semibold text-white mb-4">
						Avg. completion time by priority (days)
					</h3>
					{isLoading ? (
						<Skeleton className="h-44 w-full" />
					) : (
						<ResponsiveContainer width="100%" height={200}>
							<BarChart data={charts.task_completion_time || []}>
								<CartesianGrid strokeDasharray="3 3" stroke="#252d42" />
								<XAxis
									dataKey="priority"
									tick={{ fill: "#64748b", fontSize: 10 }}
									tickLine={false}
								/>
								<YAxis
									tick={{ fill: "#64748b", fontSize: 10 }}
									tickLine={false}
									axisLine={false}
									unit="d"
								/>
								<Tooltip
									{...TOOLTIP_STYLE}
									formatter={(v: any) => `${v} days`}
								/>
								<Bar
									dataKey="avg_days"
									fill="#8b5cf6"
									radius={[4, 4, 0, 0]}
									name="Avg days"
								/>
							</BarChart>
						</ResponsiveContainer>
					)}
				</div>
			</div>

			{/* Charts row 3 — Equipment & FM */}
			<SectionTitle>Equipment & FM station</SectionTitle>
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Equipment by category */}
				<div className="card">
					<h3 className="font-semibold text-white mb-4">
						Equipment by category
					</h3>
					{isLoading ? (
						<Skeleton className="h-52 w-full" />
					) : (
						<ResponsiveContainer width="100%" height={220}>
							<BarChart data={(charts.equipment_by_cat || []).slice(0, 8)}>
								<CartesianGrid strokeDasharray="3 3" stroke="#252d42" />
								<XAxis
									dataKey="name"
									tick={{ fill: "#64748b", fontSize: 9 }}
									tickLine={false}
								/>
								<YAxis
									tick={{ fill: "#64748b", fontSize: 10 }}
									tickLine={false}
									axisLine={false}
								/>
								<Tooltip {...TOOLTIP_STYLE} />
								<Bar
									dataKey="available"
									fill="#22c55e"
									radius={[4, 4, 0, 0]}
									name="Available"
									stackId="a"
								/>
								<Bar
									dataKey="on_loan"
									fill="#3b63f5"
									radius={[0, 0, 0, 0]}
									name="On loan"
									stackId="a"
								/>
							</BarChart>
						</ResponsiveContainer>
					)}
					{/* Summary row from equipStats */}
					{equipStats && (
						<div className="flex gap-4 mt-3 text-xs text-slate-400 flex-wrap">
							<span>
								Total:{" "}
								<strong className="text-white">
									{equipStats.total_items ?? stats.equipment_total ?? "—"}
								</strong>
							</span>
							<span>
								Available:{" "}
								<strong className="text-green-400">
									{equipStats.available ?? stats.equipment_available ?? "—"}
								</strong>
							</span>
							<span>
								On loan:{" "}
								<strong className="text-blue-400">
									{equipStats.on_loan ?? stats.equipment_on_loan ?? "—"}
								</strong>
							</span>
							<span>
								In repair:{" "}
								<strong className="text-amber-400">
									{equipStats.under_repair ??
										stats.equipment_under_repair ??
										"—"}
								</strong>
							</span>
							<span>
								Overdue returns:{" "}
								<strong className="text-red-400">
									{stats.equipment_overdue ?? "—"}
								</strong>
							</span>
						</div>
					)}
				</div>

				{/* FM station uptime 30d */}
				<div className="card">
					<h3 className="font-semibold text-white mb-4">
						FM station uptime — 30 days
					</h3>
					{isLoading ? (
						<Skeleton className="h-52 w-full" />
					) : (
						<ResponsiveContainer width="100%" height={200}>
							<LineChart data={charts.fm_uptime_30d || []}>
								<CartesianGrid strokeDasharray="3 3" stroke="#252d42" />
								<XAxis
									dataKey="date"
									tick={{ fill: "#64748b", fontSize: 9 }}
									tickLine={false}
								/>
								<YAxis
									domain={[80, 100]}
									tick={{ fill: "#64748b", fontSize: 10 }}
									tickLine={false}
									axisLine={false}
									unit="%"
								/>
								<Tooltip
									{...TOOLTIP_STYLE}
									formatter={(v: any, _: any, p: any) => [
										`${v}%`,
										p.payload?.sla_breach ? "⚠ SLA breach" : "Uptime",
									]}
								/>
								{/* SLA reference line at 95% */}
								<Line
									type="monotone"
									dataKey="uptime"
									stroke="#22c55e"
									strokeWidth={2}
									dot={false}
									name="Uptime %"
								/>
							</LineChart>
						</ResponsiveContainer>
					)}
					{/* FM station statuses */}
					{fmStations && fmStations.length > 0 && (
						<div className="flex flex-wrap gap-3 mt-3">
							{fmStations.map((st: any) => (
								<div key={st.id} className="flex items-center gap-1.5 text-xs">
									<span
										className={clsx(
											"w-2 h-2 rounded-full",
											st.current_status === "on_air"
												? "bg-green-400"
												: "bg-red-400",
										)}
									/>
									<span className="text-slate-300">{st.name}</span>
									<span
										className={
											st.current_status === "on_air"
												? "text-green-400"
												: "text-red-400"
										}>
										{st.current_status === "on_air" ? "ON AIR" : "OFF AIR"}
									</span>
								</div>
							))}
						</div>
					)}
					<div className="flex gap-4 mt-2 text-xs text-slate-400">
						<span>
							30d uptime:{" "}
							<strong className="text-white">
								{stats.fm_uptime_30d_pct ?? "—"}%
							</strong>
						</span>
						<span>
							Outages (30d):{" "}
							<strong className="text-white">
								{stats.fm_outages_30d ?? "—"}
							</strong>
						</span>
						<span>
							Avg outage:{" "}
							<strong className="text-white">
								{Math.round(stats.fm_avg_outage_duration ?? 0)}min
							</strong>
						</span>
					</div>
				</div>
			</div>

			{/* Charts row 4 — People */}
			<SectionTitle>People & departments</SectionTitle>
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Department distribution */}
				<div className="card">
					<h3 className="font-semibold text-white mb-4">
						Department headcount
					</h3>
					{isLoading ? (
						<Skeleton className="h-52 w-full" />
					) : (
						<ResponsiveContainer width="100%" height={220}>
							<BarChart data={(charts.top_departments || []).slice(0, 8)}>
								<CartesianGrid strokeDasharray="3 3" stroke="#252d42" />
								<XAxis
									dataKey="name"
									tick={{ fill: "#64748b", fontSize: 9 }}
									tickLine={false}
								/>
								<YAxis
									tick={{ fill: "#64748b", fontSize: 10 }}
									tickLine={false}
									axisLine={false}
								/>
								<Tooltip {...TOOLTIP_STYLE} />
								<Bar
									dataKey="staff"
									fill="#3b63f5"
									radius={[0, 0, 0, 0]}
									name="Staff"
									stackId="a"
								/>
								<Bar
									dataKey="attachees"
									fill="#8b5cf6"
									radius={[4, 4, 0, 0]}
									name="Attachees"
									stackId="a"
								/>
							</BarChart>
						</ResponsiveContainer>
					)}
				</div>

				{/* User role breakdown */}
				<div className="card">
					<h3 className="font-semibold text-white mb-4">User role breakdown</h3>
					{isLoading ? (
						<Skeleton className="h-44 w-full" />
					) : (
						<>
							<ResponsiveContainer width="100%" height={160}>
								<PieChart>
									<Pie
										data={charts.user_roles || []}
										cx="50%"
										cy="50%"
										innerRadius={45}
										outerRadius={65}
										dataKey="value"
										nameKey="name">
										{(charts.user_roles || []).map((_: any, i: number) => (
											<Cell key={i} fill={COLORS[i % COLORS.length]} />
										))}
									</Pie>
									<Tooltip {...TOOLTIP_STYLE} />
								</PieChart>
							</ResponsiveContainer>
							<div className="flex flex-wrap gap-2 justify-center mt-2">
								{(charts.user_roles || []).map((r: any, i: number) => (
									<div
										key={i}
										className="flex items-center gap-1.5 text-xs text-slate-400">
										<span
											className="w-2 h-2 rounded-full"
											style={{ background: COLORS[i % COLORS.length] }}
										/>
										{r.name}:{" "}
										<span className="text-white font-medium">{r.value}</span>
									</div>
								))}
							</div>
						</>
					)}
				</div>
			</div>

			{/* Charts row 5 — Broadcast & System */}
			<SectionTitle>Broadcast & system activity</SectionTitle>
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* News by status */}
				<div className="card">
					<h3 className="font-semibold text-white mb-4">
						News stories by status
					</h3>
					{isLoading ? (
						<Skeleton className="h-44 w-full" />
					) : (
						<>
							<ResponsiveContainer width="100%" height={160}>
								<PieChart>
									<Pie
										data={charts.news_by_status || []}
										cx="50%"
										cy="50%"
										innerRadius={45}
										outerRadius={65}
										dataKey="value"
										nameKey="name">
										{(charts.news_by_status || []).map((_: any, i: number) => (
											<Cell key={i} fill={COLORS[i % COLORS.length]} />
										))}
									</Pie>
									<Tooltip {...TOOLTIP_STYLE} />
								</PieChart>
							</ResponsiveContainer>
							<div className="flex flex-wrap gap-3 justify-center mt-2">
								{(charts.news_by_status || []).map((s: any, i: number) => (
									<div
										key={i}
										className="flex items-center gap-1.5 text-xs text-slate-400">
										<span
											className="w-2 h-2 rounded-full"
											style={{ background: COLORS[i % COLORS.length] }}
										/>
										{s.name}:{" "}
										<span className="text-white font-medium">{s.value}</span>
									</div>
								))}
							</div>
							<div className="mt-3 text-xs text-slate-400 flex gap-4">
								<span>
									Total views:{" "}
									<strong className="text-white">
										{stats.news_total_views?.toLocaleString() ?? "—"}
									</strong>
								</span>
								<span>
									Avg word count:{" "}
									<strong className="text-white">
										{stats.news_avg_word_count ?? "—"}
									</strong>
								</span>
							</div>
						</>
					)}
				</div>

				{/* Audit timeline */}
				<div className="card">
					<h3 className="font-semibold text-white mb-4">
						System activity — last 14 days
					</h3>
					{isLoading ? (
						<Skeleton className="h-44 w-full" />
					) : (
						<ResponsiveContainer width="100%" height={200}>
							<AreaChart data={charts.audit_timeline || []}>
								<defs>
									<linearGradient id="auditGrad" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
										<stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
									</linearGradient>
								</defs>
								<CartesianGrid strokeDasharray="3 3" stroke="#252d42" />
								<XAxis
									dataKey="date"
									tick={{ fill: "#64748b", fontSize: 9 }}
									tickLine={false}
								/>
								<YAxis
									tick={{ fill: "#64748b", fontSize: 10 }}
									tickLine={false}
									axisLine={false}
								/>
								<Tooltip {...TOOLTIP_STYLE} />
								<Area
									type="monotone"
									dataKey="total"
									stroke="#06b6d4"
									fill="url(#auditGrad)"
									strokeWidth={2}
									name="API calls"
								/>
							</AreaChart>
						</ResponsiveContainer>
					)}
				</div>
			</div>

			{/* Tasks pending approval */}
			<SectionTitle>Tasks pending your review</SectionTitle>
			<div className="card">
				{pendingTasks.length === 0 ? (
					<p className="text-sm text-slate-400">No tasks awaiting review.</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="text-left text-xs text-slate-500 border-b border-slate-700/50">
									<th className="pb-2 pr-4">Task</th>
									<th className="pb-2 pr-4">Assigned to</th>
									<th className="pb-2 pr-4">Priority</th>
									<th className="pb-2 pr-4">Due date</th>
									<th className="pb-2">Action</th>
								</tr>
							</thead>
							<tbody>
								{pendingTasks.map((t: any) => (
									<tr
										key={t.id}
										className="border-b border-slate-700/30 last:border-0">
										<td className="py-2 pr-4 text-white font-medium">
											{t.title}
										</td>
										<td className="py-2 pr-4 text-slate-400">
											{t.assigned_to_name || t.assigned_to?.full_name || "—"}
										</td>
										<td
											className={clsx(
												"py-2 pr-4 font-medium text-xs uppercase",
												priorityColor(t.priority),
											)}>
											{t.priority}
										</td>
										<td className="py-2 pr-4 text-slate-400 text-xs">
											{t.due_date
												? format(new Date(t.due_date), "MMM d, yyyy")
												: "—"}
										</td>
										<td className="py-2">
											<button
												onClick={() => navigate(`/tasks/${t.id}`)}
												className="btn-secondary btn-xs text-xs px-2 py-0.5">
												Review
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>

			{/* Board reporting quick actions */}
			<SectionTitle>Board reporting & exports</SectionTitle>
			<div className="card">
				<div className="flex flex-wrap gap-3">
					{[
						{
							label: "Attendance Report",
							path: "/analytics/attendance",
							export: "attendance",
						},
						{
							label: "FM Uptime Report",
							path: "/fm-report",
							export: "fm-outages",
						},
						{
							label: "Equipment Report",
							path: "/equipment",
							export: "equipment",
						},
						{ label: "Internship KPIs", path: "/attachees", export: "users" },
						{
							label: "Full Analytics",
							path: "/analytics",
							export: "full-report",
						},
						{ label: "Audit Log", path: "/analytics/system", export: "audit" },
					].map(({ label, path, export: mod }) => (
						<div key={label} className="flex gap-1">
							<button
								onClick={() => navigate(path)}
								className="btn-secondary btn-sm">
								<BarChart3 size={12} /> {label}
							</button>
							<button
								onClick={() => analyticsApi.export("pdf", mod, { days: 30 })}
								className="btn-secondary btn-sm px-2"
								title={`Export ${label} as PDF`}>
								<FileText size={12} />
							</button>
						</div>
					))}
				</div>
			</div>

			{/* Secondary stats strip — subscriptions, maintenance */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
				<div className="stat-card">
					<Clock size={15} className="text-amber-400" />
					<div className="stat-value text-amber-400">
						{stats.subscriptions_expiring_7d ?? 0}
					</div>
					<div className="stat-label">Licences expiring (7d)</div>
				</div>
				<div className="stat-card">
					<Wrench size={15} className="text-orange-400" />
					<div className="stat-value text-orange-400">
						{stats.maintenance_open ?? 0}
					</div>
					<div className="stat-label">Open maintenance logs</div>
				</div>
				<div className="stat-card">
					<DollarSign size={15} className="text-green-400" />
					<div className="stat-value text-green-400">
						{stats.equipment_current_val
							? `KES ${(stats.equipment_current_val / 1000).toFixed(0)}K`
							: "—"}
					</div>
					<div className="stat-label">Equipment value (current)</div>
				</div>
				<div className="stat-card">
					<Activity size={15} className="text-blue-400" />
					<div className="stat-value">{stats.avg_response_ms ?? 0}ms</div>
					<div className="stat-label">Avg API response time</div>
				</div>
			</div>
		</div>
	);
}
