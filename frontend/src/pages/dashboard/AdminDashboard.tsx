// Nexus Admin Dashboard — Live cross-module overview
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
	LayoutDashboard,
	Package,
	MessageSquare,
	Radio,
	Shield,
	Briefcase,
	Newspaper,
	Users,
	Activity,
	AlertTriangle,
	TrendingUp,
	TrendingDown,
	Clock,
	CheckCircle,
	XCircle,
	RefreshCw,
	Zap,
	BarChart3,
	Calendar,
	DollarSign,
	Wifi,
	FolderUp,
	Camera,
	ArrowRight,
	Eye,
} from "lucide-react";
import { adminDashboardApi, fmReportApi } from "../../services/api";
import { useAuthStore } from "../../services/api";
import { format } from "date-fns";
import {
	AreaChart,
	Area,
	BarChart,
	Bar,
	PieChart,
	Pie,
	Cell,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	Legend,
} from "recharts";
import clsx from "clsx";

const CHART_COLORS = [
	"#3b63f5",
	"#22c55e",
	"#f59e0b",
	"#ef4444",
	"#8b5cf6",
	"#06b6d4",
];

const Nexus_TOOLTIP_STYLE = {
	contentStyle: {
		background: "#1e2538",
		border: "1px solid #252d42",
		borderRadius: 8,
		fontSize: 12,
	},
	labelStyle: { color: "#94a3b8" },
	itemStyle: { color: "#f1f5f9" },
};

export default function AdminDashboard() {
	const navigate = useNavigate();
	const { user } = useAuthStore();

	const { data: overview, isLoading } = useQuery({
		queryKey: ["admin-overview"],
		queryFn: () => adminDashboardApi.overview().then((r) => r.data),
		refetchInterval: 60000,
	});

	const { data: alerts = [] } = useQuery({
		queryKey: ["admin-alerts"],
		queryFn: () => adminDashboardApi.alerts().then((r) => r.data),
		refetchInterval: 30000,
	});

	const { data: activityData } = useQuery({
		queryKey: ["admin-activity"],
		queryFn: () => adminDashboardApi.recentActivity().then((r) => r.data),
		refetchInterval: 60000,
	});


	const recentActivity = Array.isArray(activityData)
		? activityData
		: Array.isArray(activityData?.results)
			? activityData.results
			: Array.isArray(activityData?.activity)
				? activityData.activity
				: [];

	const { data: fmStations = [] } = useQuery({
		queryKey: ["fm-stations"],
		queryFn: () => fmReportApi.stations().then((r) => r.data),
		refetchInterval: 30000,
	});

	if (isLoading) return <DashboardSkeleton />;

	const stats = overview?.stats || {};
	const charts = overview?.charts || {};

	return (
		<div className="space-y-6 animate-fade-in">
			{/* Header */}
			<div className="flex items-start justify-between">
				<div>
					<h1 className="page-title">
						Good {getGreeting()}, {user?.first_name} 
					</h1>
					<p className="page-subtitle">
						{format(new Date(), "EEEE, MMMM d yyyy")} ·{" "}
						{user?.organisation_name}
					</p>
				</div>
				<div className="flex items-center gap-3">
					<button
						onClick={() => window.location.reload()}
						className="btn-secondary btn-sm">
						<RefreshCw size={13} /> Refresh
					</button>
					<button
						onClick={() => navigate("/analytics")}
						className="btn-primary btn-sm">
						<BarChart3 size={13} /> Full Analytics
					</button>
				</div>
			</div>

			{/* Alert Feed */}
			{alerts.length > 0 && (
				<div className="space-y-2">
					{alerts.slice(0, 4).map((alert: any, i: number) => (
						<AlertBanner key={i} alert={alert} onNavigate={navigate} />
					))}
				</div>
			)}

			{/* FM Station quick status */}
			{fmStations.length > 0 && (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{fmStations.map((station: any) => (
						<FMStatusMini
							key={station.id}
							station={station}
							onClick={() => navigate("/fm-report")}
						/>
					))}
				</div>
			)}

			{/* Stat cards */}
			<div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
				<StatCard
					icon={Package}
					label="Equipment on Loan"
					value={stats.equipment_on_loan ?? "—"}
					sub={`${stats.equipment_overdue ?? 0} overdue`}
					subColor={
						stats.equipment_overdue > 0 ? "text-red-400" : "text-slate-500"
					}
					onClick={() => navigate("/equipment")}
					color="blue"
				/>
				<StatCard
					icon={MessageSquare}
					label="Open Tickets"
					value={stats.open_tickets ?? "—"}
					sub={`${stats.resolved_today ?? 0} resolved today`}
					onClick={() => navigate("/feedback")}
					color="amber"
				/>
				<StatCard
					icon={Radio}
					label="FM Uptime Today"
					value={
						stats.fm_uptime_percent != null
							? `${stats.fm_uptime_percent}%`
							: "—"
					}
					sub={
						stats.fm_active_outages > 0
							? `${stats.fm_active_outages} active outage`
							: "All stations OK"
					}
					subColor={
						stats.fm_active_outages > 0 ? "text-red-400" : "text-green-400"
					}
					onClick={() => navigate("/fm-report")}
					color={stats.fm_active_outages > 0 ? "red" : "green"}
				/>
				<StatCard
					icon={Shield}
					label="Expiring Licences"
					value={stats.subscriptions_expiring_7d ?? "—"}
					sub="within 7 days"
					subColor={
						stats.subscriptions_expiring_7d > 0
							? "text-amber-400"
							: "text-slate-500"
					}
					onClick={() => navigate("/subscriptions")}
					color="purple"
				/>
				<StatCard
					icon={Briefcase}
					label="Projects Pending"
					value={stats.projects_pending_review ?? "—"}
					sub="awaiting review"
					onClick={() => navigate("/projects")}
					color="cyan"
				/>
				<StatCard
					icon={Newspaper}
					label="News Published"
					value={stats.news_published_today ?? "—"}
					sub="stories today"
					onClick={() => navigate("/news")}
					color="green"
				/>
			</div>

			{/* Second row stats */}
			<div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
				<StatCard
					icon={Users}
					label="Active Attachees"
					value={stats.active_attachees ?? "—"}
					onClick={() => navigate("/attachees")}
					color="blue"
				/>
				<StatCard
					icon={Activity}
					label="Present Today"
					value={stats.present_today ?? "—"}
					onClick={() => navigate("/attendance")}
					color="green"
				/>
				<StatCard
					icon={Clock}
					label="On Leave"
					value={stats.on_leave_today ?? "—"}
					onClick={() => navigate("/attendance")}
					color="amber"
				/>
				<StatCard
					icon={CheckCircle}
					label="Tasks Completed"
					value={stats.tasks_completed_today ?? "—"}
					onClick={() => navigate("/tasks")}
					color="green"
				/>
				<StatCard
					icon={XCircle}
					label="Overdue Tasks"
					value={stats.tasks_overdue ?? "—"}
					onClick={() => navigate("/tasks")}
					subColor={stats.tasks_overdue > 0 ? "text-red-400" : "text-slate-500"}
					color="red"
				/>
				<StatCard
					icon={Wifi}
					label="Wi-Fi Active"
					value={stats.wifi_active_grants ?? "—"}
					onClick={() => navigate("/wifi")}
					color="cyan"
				/>
			</div>

			{/* Charts row */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Attendance trend */}
				<div className="card lg:col-span-2">
					<div className="flex items-center justify-between mb-5">
						<h3 className="font-semibold text-white">
							Attendance Trend (Last 14 Days)
						</h3>
						<button
							onClick={() => navigate("/analytics")}
							className="btn-ghost btn-sm">
							View all <ArrowRight size={12} />
						</button>
					</div>
					<ResponsiveContainer width="100%" height={200}>
						<AreaChart data={charts.attendance_trend || mockAttendanceTrend}>
							<defs>
								<linearGradient id="presentGrad" x1="0" y1="0" x2="0" y2="1">
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
							<Tooltip {...Nexus_TOOLTIP_STYLE} />
							<Area
								type="monotone"
								dataKey="present"
								stroke="#3b63f5"
								fill="url(#presentGrad)"
								strokeWidth={2}
								name="Present"
							/>
							<Area
								type="monotone"
								dataKey="absent"
								stroke="#ef4444"
								fill="none"
								strokeWidth={1.5}
								strokeDasharray="3 3"
								name="Absent"
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>

				{/* Task status pie */}
				<div className="card">
					<h3 className="font-semibold text-white mb-5">
						Task Status Distribution
					</h3>
					<ResponsiveContainer width="100%" height={160}>
						<PieChart>
							<Pie
								data={charts.task_status || mockTaskStatus}
								cx="50%"
								cy="50%"
								innerRadius={45}
								outerRadius={70}
								dataKey="value"
								nameKey="name">
								{(charts.task_status || mockTaskStatus).map(
									(_: any, i: number) => (
										<Cell
											key={i}
											fill={CHART_COLORS[i % CHART_COLORS.length]}
										/>
									),
								)}
							</Pie>
							<Tooltip {...Nexus_TOOLTIP_STYLE} />
						</PieChart>
					</ResponsiveContainer>
					<div className="grid grid-cols-2 gap-1.5 mt-2">
						{(charts.task_status || mockTaskStatus).map((s: any, i: number) => (
							<div
								key={i}
								className="flex items-center gap-1.5 text-xs text-slate-400">
								<span
									className="w-2 h-2 rounded-full shrink-0"
									style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
								/>
								{s.name}:{" "}
								<span className="text-white font-medium">{s.value}</span>
							</div>
						))}
					</div>
				</div>
			</div>

			{/* Module quick nav + Activity feed */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Quick nav tiles */}
				<div className="card">
					<h3 className="font-semibold text-white mb-4">Quick Navigation</h3>
					<div className="grid grid-cols-3 gap-3">
						{QUICK_NAV.map(({ label, icon: Icon, path, color }) => (
							<button
								key={label}
								onClick={() => navigate(path)}
								className="flex flex-col items-center gap-2 p-3 rounded-xl bg-surface hover:bg-surface-elevated border border-surface-border hover:border-Nexus-500/30 transition-all group">
								<div
									className={clsx(
										"p-2 rounded-lg transition-colors",
										`bg-${color}-500/10 group-hover:bg-${color}-500/20`,
									)}>
									<Icon size={16} className={`text-${color}-400`} />
								</div>
								<span className="text-[10px] text-slate-400 group-hover:text-slate-300 text-center leading-tight">
									{label}
								</span>
							</button>
						))}
					</div>
				</div>

				{/* Recent activity */}
				<div className="card lg:col-span-2">
					<div className="flex items-center justify-between mb-4">
						<h3 className="font-semibold text-white">Recent Activity</h3>
						<span className="text-xs text-slate-500">Last 10 actions</span>
					</div>
					<div className="space-y-2 max-h-72 overflow-y-auto scroll-area pr-1">
						{recentActivity.length === 0 ? (
							<p className="text-slate-500 text-sm text-center py-8">
								No recent activity
							</p>
						) : (
							recentActivity.map((act: any, i: number) => (
								<div
									key={i}
									className="flex items-start gap-3 py-2 border-b border-surface-border/50 last:border-0">
									<div className="w-7 h-7 rounded-full bg-Nexus-600/20 flex items-center justify-center shrink-0 mt-0.5">
										<span className="text-[10px] text-Nexus-400 font-bold">
											{act.user_name
												?.split(" ")
												.map((n: string) => n[0])
												.join("")
												.slice(0, 2)}
										</span>
									</div>
									<div className="flex-1 min-w-0">
										<p className="text-sm text-slate-300 leading-snug">
											<span className="text-white font-medium">
												{act.user_name}
											</span>{" "}
											{act.action}
											{act.resource && (
												<span className="text-Nexus-400"> {act.resource}</span>
											)}
										</p>
										<p className="text-[10px] text-slate-500 mt-0.5">
											{format(new Date(act.timestamp), "HH:mm · dd MMM")}
										</p>
									</div>
								</div>
							))
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatCard({
	icon: Icon,
	label,
	value,
	sub,
	subColor = "text-slate-500",
	onClick,
	color = "blue",
}: any) {
	const colorMap: Record<string, string> = {
		blue: "text-blue-400 bg-blue-500/10",
		green: "text-green-400 bg-green-500/10",
		amber: "text-amber-400 bg-amber-500/10",
		red: "text-red-400 bg-red-500/10",
		purple: "text-purple-400 bg-purple-500/10",
		cyan: "text-cyan-400 bg-cyan-500/10",
	};
	return (
		<button
			onClick={onClick}
			className="stat-card text-left hover:border-Nexus-500/30 hover:shadow-glow-blue transition-all group">
			<div
				className={clsx(
					"w-9 h-9 rounded-lg flex items-center justify-center",
					colorMap[color] || colorMap.blue,
				)}>
				<Icon size={17} />
			</div>
			<div>
				<div className="stat-value group-hover:text-Nexus-400 transition-colors">
					{value}
				</div>
				<div className="stat-label">{label}</div>
				{sub && (
					<div className={clsx("text-[10px] mt-0.5", subColor)}>{sub}</div>
				)}
			</div>
		</button>
	);
}

function FMStatusMini({ station, onClick }: any) {
	const isOn = station.current_status === "on_air";
	const isOff = station.current_status === "off_air";
	return (
		<button
			onClick={onClick}
			className={clsx(
				"flex items-center gap-3 p-3 rounded-xl border transition-all",
				{
					"border-green-500/30 bg-green-900/10 hover:bg-green-900/20": isOn,
					"border-red-500/40 bg-red-900/10 hover:bg-red-900/20 animate-pulse-slow":
						isOff,
					"border-surface-border bg-surface-card": !isOn && !isOff,
				},
			)}>
			<div
				className={clsx("w-2.5 h-2.5 rounded-full", {
					"bg-green-400 shadow-glow-green": isOn,
					"bg-red-400 shadow-glow-red": isOff,
					"bg-slate-500": !isOn && !isOff,
				})}
			/>
			<div className="text-left">
				<div className="text-sm font-semibold text-white">{station.name}</div>
				<div className="text-xs text-slate-400">{station.frequency} MHz</div>
			</div>
			<div
				className={clsx("ml-auto text-xs font-bold tracking-wide", {
					"text-green-400": isOn,
					"text-red-400": isOff,
					"text-slate-500": !isOn && !isOff,
				})}>
				{isOn ? "ON AIR" : isOff ? "OFF AIR" : "UNKNOWN"}
			</div>
		</button>
	);
}

function AlertBanner({ alert, onNavigate }: any) {
	const colorMap: Record<string, string> = {
		overdue_equipment: "alert-warning",
		licence_expiring: "alert-warning",
		fm_outage: "alert-danger",
		unresolved_ticket: "alert-warning",
		emergency: "alert-danger",
	};
	const iconMap: Record<string, React.ElementType> = {
		overdue_equipment: Package,
		licence_expiring: Shield,
		fm_outage: Radio,
		unresolved_ticket: MessageSquare,
		emergency: AlertTriangle,
	};
	const AlertIcon = iconMap[alert.type] || AlertTriangle;
	return (
		<div
			className={clsx(
				"alert cursor-pointer hover:opacity-90 transition-opacity",
				colorMap[alert.type] || "alert-warning",
			)}
			onClick={() => onNavigate(alert.link || "/dashboard")}>
			<AlertIcon size={15} className="shrink-0 mt-0.5" />
			<span className="flex-1 text-sm">{alert.message}</span>
			<ArrowRight size={13} className="shrink-0 opacity-60" />
		</div>
	);
}

function DashboardSkeleton() {
	return (
		<div className="space-y-6 animate-pulse">
			<div className="skeleton h-8 w-64 rounded-lg" />
			<div className="grid grid-cols-6 gap-4">
				{[...Array(6)].map((_, i) => (
					<div key={i} className="skeleton h-28 rounded-xl" />
				))}
			</div>
			<div className="grid grid-cols-3 gap-6">
				{[...Array(3)].map((_, i) => (
					<div key={i} className="skeleton h-48 rounded-xl" />
				))}
			</div>
		</div>
	);
}

function getGreeting() {
	const h = new Date().getHours();
	if (h < 12) return "morning";
	if (h < 18) return "afternoon";
	return "evening";
}

const QUICK_NAV = [
	{ label: "Equipment", icon: Package, path: "/equipment", color: "blue" },
	{ label: "FM Report", icon: Radio, path: "/fm-report", color: "red" },
	{ label: "News", icon: Newspaper, path: "/news", color: "green" },
	{ label: "Radio", icon: Activity, path: "/radio", color: "purple" },
	{ label: "Tickets", icon: MessageSquare, path: "/feedback", color: "amber" },
	{ label: "Wi-Fi", icon: Wifi, path: "/wifi", color: "cyan" },
	{ label: "Transfers", icon: FolderUp, path: "/file-transfer", color: "blue" },
	{ label: "Attendance", icon: Calendar, path: "/attendance", color: "green" },
	{ label: "Analytics", icon: BarChart3, path: "/analytics", color: "purple" },
];

const mockAttendanceTrend = Array.from({ length: 14 }, (_, i) => ({
	date: format(new Date(Date.now() - (13 - i) * 86400000), "MM/dd"),
	present: Math.floor(Math.random() * 30) + 60,
	absent: Math.floor(Math.random() * 10) + 2,
}));

const mockTaskStatus = [
	{ name: "Approved", value: 45 },
	{ name: "In Progress", value: 28 },
	{ name: "Pending", value: 17 },
	{ name: "Overdue", value: 8 },
	{ name: "Rejected", value: 4 },
];
