// Nexus — Department Attendance Dashboard
// For roles: supervisor | department_leader | hr_officer | system_admin
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import {
	Users,
	UserX,
	Clock,
	TrendingUp,
	TrendingDown,
	AlertTriangle,
	ShieldOff,
	Send,
	BarChart2,
	CheckCircle,
	XCircle,
	Calendar,
	RefreshCw,
	ChevronDown,
	ChevronUp,
	Eye,
	Building2,
	Zap,
	UserCheck,
	FileWarning,
	Activity,
} from "lucide-react";
import { useAuthStore, api, deptApi } from "../../services/api";
import toast from "react-hot-toast";
import clsx from "clsx";
import {
	LineChart,
	Line,
	BarChart,
	Bar,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
	Legend,
	CartesianGrid,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────
type MemberStat = {
	user_id: string;
	name: string;
	email: string;
	role: string;
	department: string;
	branch: string;
	present: number;
	absent: number;
	late: number;
	half_day: number;
	on_leave: number;
	total_workdays: number;
	attendance_rate: number;
	absent_dates: string[];
	late_dates: string[];
	needs_absent_warning: boolean;
	needs_absent_deactivation: boolean;
	needs_late_warning: boolean;
	needs_late_deactivation: boolean;
};

type TrendDay = {
	date: string;
	present: number;
	absent: number;
	late: number;
	on_leave: number;
};

const STATUS_DOT: Record<string, string> = {
	present: "bg-green-500",
	late: "bg-amber-500",
	absent: "bg-red-500",
	on_leave: "bg-blue-500",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
	icon: Icon,
	label,
	value,
	sub,
	color = "text-white",
}: any) {
	return (
		<div className="card flex items-start gap-4">
			<div
				className={clsx("p-2.5 rounded-xl", {
					"bg-green-500/15": color === "text-green-400",
					"bg-amber-500/15": color === "text-amber-400",
					"bg-red-500/15": color === "text-red-400",
					"bg-blue-500/15": color === "text-blue-400",
					"bg-purple-500/15": color === "text-purple-400",
					"bg-slate-500/15": color === "text-white",
				})}>
				<Icon size={18} className={color} />
			</div>
			<div>
				<div className={clsx("text-2xl font-bold", color)}>{value}</div>
				<div className="text-xs text-slate-400 mt-0.5">{label}</div>
				{sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
			</div>
		</div>
	);
}

function RiskBadge({ member }: { member: MemberStat }) {
	if (member.needs_absent_deactivation || member.needs_late_deactivation)
		return <span className="badge badge-red text-[10px]">⚠ Deactivate</span>;
	if (member.needs_absent_warning || member.needs_late_warning)
		return <span className="badge badge-amber text-[10px]">⚠ Warn</span>;
	return <span className="badge badge-green text-[10px]">✓ OK</span>;
}

function AttendanceBar({ rate }: { rate: number }) {
	return (
		<div className="flex items-center gap-2 w-full">
			<div className="flex-1 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
				<div
					className={clsx("h-full rounded-full transition-all", {
						"bg-green-500": rate >= 80,
						"bg-amber-500": rate >= 60 && rate < 80,
						"bg-red-500": rate < 60,
					})}
					style={{ width: `${rate}%` }}
				/>
			</div>
			<span
				className={clsx("text-xs font-medium tabular-nums", {
					"text-green-400": rate >= 80,
					"text-amber-400": rate >= 60 && rate < 80,
					"text-red-400": rate < 60,
				})}>
				{rate}%
			</span>
		</div>
	);
}

// ── Action Buttons ────────────────────────────────────────────────────────────
function MemberActions({
	member,
	onAction,
}: {
	member: MemberStat;
	onAction: () => void;
}) {
	const qc = useQueryClient();

	const warnMutation = useMutation({
		mutationFn: (data: { reason: string; message?: string }) =>
			deptApi.warn(member.user_id, data),
		onSuccess: (res) => {
			toast.success(
				`Warning sent to ${member.name} via ${res.data.sent_via.join(", ") || "system"}`,
			);
			onAction();
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Failed to send warning"),
	});

	const deactivateMutation = useMutation({
		mutationFn: (data: { reason: string }) =>
			deptApi.deactivate(member.user_id, data),
		onSuccess: () => {
			toast.success(`${member.name}'s account has been deactivated.`);
			qc.invalidateQueries({ queryKey: ["dept-members"] });
			qc.invalidateQueries({ queryKey: ["dept-overview"] });
			onAction();
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Failed to deactivate"),
	});

	const handleWarn = (reason: "attendance" | "lateness") => {
		if (!confirm(`Send a formal ${reason} warning to ${member.name}?`)) return;
		warnMutation.mutate({ reason });
	};

	const handleDeactivate = () => {
		const reason = prompt(
			`Enter reason for deactivating ${member.name}'s account:`,
			"Repeated attendance policy violations.",
		);
		if (!reason) return;
		deactivateMutation.mutate({ reason });
	};

	return (
		<div className="flex items-center gap-1.5 flex-wrap">
			{(member.needs_absent_warning || member.needs_absent_deactivation) && (
				<button
					onClick={() => handleWarn("attendance")}
					disabled={warnMutation.isPending}
					className="btn-warning btn-xs flex items-center gap-1"
					title="Send attendance warning">
					<Send size={11} /> Absence Warn
				</button>
			)}
			{(member.needs_late_warning || member.needs_late_deactivation) && (
				<button
					onClick={() => handleWarn("lateness")}
					disabled={warnMutation.isPending}
					className="btn-warning btn-xs flex items-center gap-1"
					title="Send lateness warning">
					<Clock size={11} /> Late Warn
				</button>
			)}
			{(member.needs_absent_deactivation || member.needs_late_deactivation) && (
				<button
					onClick={handleDeactivate}
					disabled={deactivateMutation.isPending}
					className="btn-danger btn-xs flex items-center gap-1"
					title="Deactivate account">
					<ShieldOff size={11} /> Deactivate
				</button>
			)}
		</div>
	);
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function DeptDashboardPage() {
	const { user } = useAuthStore();
	const qc = useQueryClient();
	const [activeTab, setActiveTab] = useState<
		"overview" | "members" | "absentees" | "late" | "trends"
	>("overview");
	const [period, setPeriod] = useState(30);
	const [expandedMember, setExpandedMember] = useState<string | null>(null);
	const [showAutoEnforce, setShowAutoEnforce] = useState(false);

	// ── Queries ──────────────────────────────────────────────────────────────
	const {
		data: overview,
		isLoading: overviewLoading,
		refetch: refetchOverview,
	} = useQuery({
		queryKey: ["dept-overview"],
		queryFn: () => deptApi.overview().then((r) => r.data),
		refetchInterval: 60000,
	});

	const { data: todaySnapshot, isLoading: todayLoading } = useQuery({
		queryKey: ["dept-today"],
		queryFn: () => deptApi.today().then((r) => r.data),
		refetchInterval: 30000,
	});

	const { data: membersData, isLoading: membersLoading } = useQuery({
		queryKey: ["dept-members", period],
		queryFn: () => deptApi.members(period).then((r) => r.data),
		enabled: activeTab === "members" || activeTab === "overview",
	});

	const { data: absenteesData, isLoading: absenteesLoading } = useQuery({
		queryKey: ["dept-absentees", period],
		queryFn: () => deptApi.absentees(1, period).then((r) => r.data),
		enabled: activeTab === "absentees",
	});

	const { data: lateData, isLoading: lateLoading } = useQuery({
		queryKey: ["dept-late", period],
		queryFn: () => deptApi.lateComers(1, period).then((r) => r.data),
		enabled: activeTab === "late",
	});

	const { data: trendsData, isLoading: trendsLoading } = useQuery({
		queryKey: ["dept-trends", period],
		queryFn: () => deptApi.trends(period).then((r) => r.data),
		enabled: activeTab === "trends" || activeTab === "overview",
	});

	const autoEnforceMutation = useMutation({
		mutationFn: (dryRun: boolean) => deptApi.autoEnforce(dryRun),
		onSuccess: (res) => {
			const d = res.data;
			toast.success(
				`Auto-enforce complete: ${d.actions.warned_count} warned, ` +
					`${d.actions.deactivated_count} deactivated${d.dry_run ? " (dry run)" : ""}.`,
			);
			qc.invalidateQueries({ queryKey: ["dept-overview"] });
			qc.invalidateQueries({ queryKey: ["dept-members"] });
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Auto-enforce failed"),
	});

	const members: MemberStat[] = membersData?.members || [];
	const trend: TrendDay[] = trendsData?.trend || [];
	const trendChartData = trend.map((d) => ({
		...d,
		date: format(parseISO(d.date), "dd MMM"),
	}));

	// Risk counts from members list
	const membersNeedAction = useMemo(
		() =>
			members.filter(
				(m) =>
					m.needs_absent_warning ||
					m.needs_late_warning ||
					m.needs_absent_deactivation ||
					m.needs_late_deactivation,
			),
		[members],
	);

	const tabs = [
		{ key: "overview", label: "Overview", icon: Activity },
		{ key: "members", label: "Members", icon: Users },
		{ key: "absentees", label: "Absentees", icon: UserX },
		{ key: "late", label: "Late Comers", icon: Clock },
		{ key: "trends", label: "Trends", icon: BarChart2 },
	] as const;

	return (
		<div className="space-y-6 animate-fade-in">
			{/* Header */}
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<Building2 size={22} className="text-Swahilipot-400" />
						Department Dashboard
					</h1>
					<p className="page-subtitle">
						{overview?.department?.name || "Your Department"} ·{" "}
						{overview?.branch?.name || "Branch"} · Last {period} days
					</p>
				</div>
				<div className="flex items-center gap-2">
					<select
						value={period}
						onChange={(e) => setPeriod(Number(e.target.value))}
						className="select-input text-sm py-1.5 px-3 w-32">
						<option value={7}>7 days</option>
						<option value={14}>14 days</option>
						<option value={30}>30 days</option>
						<option value={60}>60 days</option>
						<option value={90}>90 days</option>
					</select>
					<button
						onClick={() => refetchOverview()}
						className="btn-secondary btn-sm"
						title="Refresh">
						<RefreshCw size={13} />
					</button>
					{user?.role !== "supervisor" && (
						<button
							onClick={() => setShowAutoEnforce(true)}
							className="btn-warning btn-sm flex items-center gap-1.5">
							<Zap size={13} /> Auto-Enforce
						</button>
					)}
				</div>
			</div>

			{/* Tabs */}
			<div className="flex gap-1 p-1 bg-surface-card border border-surface-border rounded-xl w-fit flex-wrap">
				{tabs.map(({ key, label, icon: Icon }) => (
					<button
						key={key}
						onClick={() => setActiveTab(key)}
						className={clsx(
							"px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-all",
							activeTab === key
								? "bg-Swahilipot-600 text-white"
								: "text-slate-400 hover:text-white",
						)}>
						<Icon size={13} /> {label}
						{key === "members" && membersNeedAction.length > 0 && (
							<span className="ml-1 text-[10px] bg-amber-500 text-black rounded-full px-1.5 font-bold">
								{membersNeedAction.length}
							</span>
						)}
					</button>
				))}
			</div>

			{/* ── OVERVIEW TAB ────────────────────────────────────────────────────── */}
			{activeTab === "overview" && (
				<div className="space-y-6">
					{/* Stat cards */}
					<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
						<StatCard
							icon={Users}
							label="Dept Members"
							value={
								overviewLoading ? "—" : overview?.department?.total_members
							}
							sub={`${overview?.branch?.name || ""} branch: ${overview?.branch?.total_members ?? "—"} total`}
							color="text-white"
						/>
						<StatCard
							icon={UserCheck}
							label="Present Today"
							value={overviewLoading ? "—" : overview?.today?.present}
							sub={`${overview?.today?.checked_in ?? 0} checked in`}
							color="text-green-400"
						/>
						<StatCard
							icon={Clock}
							label="Late Today"
							value={overviewLoading ? "—" : overview?.today?.late}
							color="text-amber-400"
						/>
						<StatCard
							icon={UserX}
							label="Absent Today"
							value={overviewLoading ? "—" : overview?.today?.absent}
							color="text-red-400"
						/>
					</div>

					{/* Alert cards */}
					{overview?.alerts && (
						<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
							{overview.alerts.pending_leaves > 0 && (
								<div className="card border-l-4 border-blue-500 flex items-start gap-3">
									<Calendar size={18} className="text-blue-400 mt-0.5" />
									<div>
										<div className="text-white font-semibold">
											{overview.alerts.pending_leaves} Pending Leaves
										</div>
										<div className="text-xs text-slate-400 mt-0.5">
											Awaiting your review
										</div>
									</div>
								</div>
							)}
							{overview.alerts.members_needing_warning > 0 && (
								<div className="card border-l-4 border-amber-500 flex items-start gap-3">
									<FileWarning size={18} className="text-amber-400 mt-0.5" />
									<div>
										<div className="text-white font-semibold">
											{overview.alerts.members_needing_warning} Need Warning
										</div>
										<div className="text-xs text-slate-400 mt-0.5">
											Attendance/lateness threshold exceeded
										</div>
									</div>
								</div>
							)}
							{overview.alerts.members_needing_deactivation > 0 && (
								<div className="card border-l-4 border-red-500 flex items-start gap-3">
									<ShieldOff size={18} className="text-red-400 mt-0.5" />
									<div>
										<div className="text-white font-semibold">
											{overview.alerts.members_needing_deactivation} Need
											Deactivation
										</div>
										<div className="text-xs text-slate-400 mt-0.5">
											Critical policy violations
										</div>
									</div>
								</div>
							)}
						</div>
					)}

					{/* Today's snapshot */}
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<div className="card">
							<h3 className="font-semibold text-white mb-4 flex items-center gap-2">
								<Activity size={16} className="text-Swahilipot-400" />
								Today's Snapshot — {format(new Date(), "EEE, dd MMM")}
							</h3>
							{todayLoading ? (
								<div className="skeleton h-48 rounded-xl" />
							) : (
								<div className="space-y-2">
									{/* Present */}
									{todaySnapshot?.present?.slice(0, 5).map((p: any) => (
										<div
											key={p.id}
											className="flex items-center gap-3 py-1.5 border-b border-surface-border/40 last:border-0">
											<div
												className={clsx(
													"w-2 h-2 rounded-full flex-shrink-0",
													STATUS_DOT[p.status] || "bg-green-500",
												)}
											/>
											<div className="flex-1 min-w-0">
												<div className="text-sm text-white truncate">
													{p.name}
												</div>
												<div className="text-xs text-slate-500">{p.role}</div>
											</div>
											<div className="text-xs text-slate-400 text-right">
												{p.check_in && (
													<span className="text-green-400">{p.check_in}</span>
												)}
												{p.still_in && (
													<span className="ml-1 text-green-300 animate-pulse">
														●
													</span>
												)}
											</div>
										</div>
									))}
									{(todaySnapshot?.present?.length || 0) > 5 && (
										<div className="text-xs text-slate-500 text-center pt-1">
											+{todaySnapshot.present.length - 5} more present
										</div>
									)}
									{todaySnapshot?.absent?.length > 0 && (
										<div className="mt-3 pt-3 border-t border-surface-border/50">
											<div className="text-xs text-slate-500 uppercase tracking-wide mb-2">
												Not checked in
											</div>
											{todaySnapshot.absent.slice(0, 4).map((p: any) => (
												<div
													key={p.id}
													className="flex items-center gap-2 py-1">
													<div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
													<span className="text-sm text-slate-300">
														{p.name}
													</span>
													<span className="text-xs text-slate-500">
														{p.role}
													</span>
												</div>
											))}
											{todaySnapshot.absent.length > 4 && (
												<div className="text-xs text-slate-500 mt-1">
													+{todaySnapshot.absent.length - 4} more absent
												</div>
											)}
										</div>
									)}
								</div>
							)}
						</div>

						{/* Mini trend chart */}
						<div className="card">
							<h3 className="font-semibold text-white mb-4 flex items-center gap-2">
								<TrendingUp size={16} className="text-Swahilipot-400" />
								Attendance Trend — Last {period} Days
							</h3>
							{trendsLoading ? (
								<div className="skeleton h-48 rounded-xl" />
							) : (
								<ResponsiveContainer width="100%" height={180}>
									<LineChart data={trendChartData.slice(-14)}>
										<CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
										<XAxis
											dataKey="date"
											tick={{ fontSize: 10, fill: "#64748b" }}
											interval="preserveStartEnd"
										/>
										<YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
										<Tooltip
											contentStyle={{
												background: "#0f172a",
												border: "1px solid #1e293b",
												borderRadius: 8,
											}}
											labelStyle={{ color: "#94a3b8" }}
										/>
										<Line
											type="monotone"
											dataKey="present"
											stroke="#22c55e"
											strokeWidth={2}
											dot={false}
											name="Present"
										/>
										<Line
											type="monotone"
											dataKey="absent"
											stroke="#ef4444"
											strokeWidth={2}
											dot={false}
											name="Absent"
										/>
										<Line
											type="monotone"
											dataKey="late"
											stroke="#f59e0b"
											strokeWidth={1.5}
											dot={false}
											name="Late"
											strokeDasharray="4 2"
										/>
									</LineChart>
								</ResponsiveContainer>
							)}
							{trendsData?.summary && (
								<div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-surface-border">
									<div className="text-center">
										<div className="text-green-400 font-bold">
											{trendsData.summary.avg_present_rate}%
										</div>
										<div className="text-xs text-slate-500">Avg Present</div>
									</div>
									<div className="text-center">
										<div className="text-red-400 font-bold">
											{trendsData.summary.avg_absent_rate}%
										</div>
										<div className="text-xs text-slate-500">Avg Absent</div>
									</div>
									<div className="text-center">
										<div className="text-amber-400 font-bold">
											{trendsData.summary.avg_late_rate}%
										</div>
										<div className="text-xs text-slate-500">Late Rate</div>
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			)}

			{/* ── MEMBERS TAB ─────────────────────────────────────────────────────── */}
			{activeTab === "members" && (
				<div className="card">
					<div className="flex items-center justify-between mb-5">
						<h3 className="font-semibold text-white flex items-center gap-2">
							<Users size={16} className="text-Swahilipot-400" />
							All Members — {membersData?.period?.start} →{" "}
							{membersData?.period?.end}
						</h3>
						<div className="flex items-center gap-2">
							{membersNeedAction.length > 0 && (
								<span className="badge badge-amber">
									{membersNeedAction.length} need action
								</span>
							)}
						</div>
					</div>
					{membersLoading ? (
						<div className="space-y-2">
							{[...Array(5)].map((_, i) => (
								<div key={i} className="skeleton h-16 rounded-xl" />
							))}
						</div>
					) : members.length === 0 ? (
						<div className="text-center py-12 text-slate-500">
							<Users size={32} className="mx-auto mb-3 opacity-30" />
							<p>No members found in your department.</p>
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="data-table">
								<thead>
									<tr>
										<th>Member</th>
										<th>Present</th>
										<th>Absent</th>
										<th>Late</th>
										<th>Leave</th>
										<th>Rate</th>
										<th>Risk</th>
										<th>Actions</th>
									</tr>
								</thead>
								<tbody>
									{members.map((m) => (
										<>
											<tr
												key={m.user_id}
												className={clsx("cursor-pointer", {
													"bg-red-900/10":
														m.needs_absent_deactivation ||
														m.needs_late_deactivation,
													"bg-amber-900/5":
														(m.needs_absent_warning || m.needs_late_warning) &&
														!m.needs_absent_deactivation &&
														!m.needs_late_deactivation,
												})}
												onClick={() =>
													setExpandedMember(
														expandedMember === m.user_id ? null : m.user_id,
													)
												}>
												<td>
													<div className="font-medium text-white text-sm">
														{m.name}
													</div>
													<div className="text-xs text-slate-500">{m.role}</div>
												</td>
												<td className="text-green-400 font-medium">
													{m.present}
												</td>
												<td
													className={clsx(
														"font-medium",
														m.absent >= 3 ? "text-red-400" : "text-slate-300",
													)}>
													{m.absent}
												</td>
												<td
													className={clsx(
														"font-medium",
														m.late >= 3 ? "text-amber-400" : "text-slate-300",
													)}>
													{m.late}
												</td>
												<td className="text-blue-400">{m.on_leave}</td>
												<td className="min-w-[100px]">
													<AttendanceBar rate={m.attendance_rate} />
												</td>
												<td>
													<RiskBadge member={m} />
												</td>
												<td onClick={(e) => e.stopPropagation()}>
													<MemberActions
														member={m}
														onAction={() =>
															qc.invalidateQueries({
																queryKey: ["dept-members"],
															})
														}
													/>
												</td>
											</tr>
											{expandedMember === m.user_id && (
												<tr key={`${m.user_id}-expand`}>
													<td colSpan={8} className="bg-surface-elevated p-4">
														<div className="grid grid-cols-2 gap-4">
															<div>
																<div className="text-xs text-slate-500 uppercase tracking-wide mb-2">
																	Absent Dates ({m.absent_dates.length})
																</div>
																<div className="flex flex-wrap gap-1">
																	{m.absent_dates.length === 0 ? (
																		<span className="text-xs text-slate-600">
																			None
																		</span>
																	) : (
																		m.absent_dates.map((d) => (
																			<span
																				key={d}
																				className="text-xs bg-red-900/30 text-red-300 border border-red-800/40 px-2 py-0.5 rounded">
																				{format(parseISO(d), "dd MMM")}
																			</span>
																		))
																	)}
																</div>
															</div>
															<div>
																<div className="text-xs text-slate-500 uppercase tracking-wide mb-2">
																	Late Dates ({m.late_dates.length})
																</div>
																<div className="flex flex-wrap gap-1">
																	{m.late_dates.length === 0 ? (
																		<span className="text-xs text-slate-600">
																			None
																		</span>
																	) : (
																		m.late_dates.map((d) => (
																			<span
																				key={d}
																				className="text-xs bg-amber-900/30 text-amber-300 border border-amber-800/40 px-2 py-0.5 rounded">
																				{format(parseISO(d), "dd MMM")}
																			</span>
																		))
																	)}
																</div>
															</div>
														</div>
														<div className="mt-3 grid grid-cols-4 gap-3 text-center">
															<div className="bg-surface rounded-lg p-2">
																<div className="text-green-400 font-bold">
																	{m.present}
																</div>
																<div className="text-xs text-slate-500">
																	Present
																</div>
															</div>
															<div className="bg-surface rounded-lg p-2">
																<div className="text-amber-400 font-bold">
																	{m.late}
																</div>
																<div className="text-xs text-slate-500">
																	Late
																</div>
															</div>
															<div className="bg-surface rounded-lg p-2">
																<div className="text-red-400 font-bold">
																	{m.absent}
																</div>
																<div className="text-xs text-slate-500">
																	Absent
																</div>
															</div>
															<div className="bg-surface rounded-lg p-2">
																<div className="text-blue-400 font-bold">
																	{m.on_leave}
																</div>
																<div className="text-xs text-slate-500">
																	On Leave
																</div>
															</div>
														</div>
													</td>
												</tr>
											)}
										</>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}

			{/* ── ABSENTEES TAB ───────────────────────────────────────────────────── */}
			{activeTab === "absentees" && (
				<div className="space-y-4">
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
						<StatCard
							icon={UserX}
							label="With 1+ Absences"
							value={absenteesData?.count ?? "—"}
							color="text-red-400"
						/>
						<StatCard
							icon={AlertTriangle}
							label="Warn Threshold"
							value={`${absenteesData?.thresholds?.warn_at ?? 3}+ days`}
							sub="Warning triggered"
							color="text-amber-400"
						/>
						<StatCard
							icon={ShieldOff}
							label="Deactivate Threshold"
							value={`${absenteesData?.thresholds?.deactivate_at ?? 5}+ days`}
							sub="Auto-deactivate"
							color="text-red-400"
						/>
						<StatCard
							icon={Calendar}
							label="Period"
							value={`${period}d`}
							sub={`${absenteesData?.period?.start} → ${absenteesData?.period?.end}`}
							color="text-white"
						/>
					</div>
					<div className="card">
						<div className="flex items-center justify-between mb-5">
							<h3 className="font-semibold text-white flex items-center gap-2">
								<UserX size={16} className="text-red-400" /> Absent Members
							</h3>
						</div>
						{absenteesLoading ? (
							<div className="space-y-2">
								{[...Array(4)].map((_, i) => (
									<div key={i} className="skeleton h-20 rounded-xl" />
								))}
							</div>
						) : (absenteesData?.absentees || []).length === 0 ? (
							<div className="text-center py-12 text-slate-500">
								<CheckCircle
									size={32}
									className="mx-auto mb-3 text-green-500 opacity-50"
								/>
								<p>No absentees found. Great attendance!</p>
							</div>
						) : (
							<div className="space-y-3">
								{(absenteesData?.absentees || []).map((m: MemberStat) => (
									<div
										key={m.user_id}
										className={clsx(
											"p-4 rounded-xl border transition-all",
											m.needs_absent_deactivation
												? "bg-red-900/15 border-red-800/40"
												: m.needs_absent_warning
													? "bg-amber-900/10 border-amber-800/30"
													: "bg-surface border-surface-border",
										)}>
										<div className="flex items-start justify-between gap-3 flex-wrap">
											<div className="flex-1">
												<div className="flex items-center gap-2 flex-wrap">
													<span className="text-white font-medium">
														{m.name}
													</span>
													<RiskBadge member={m} />
												</div>
												<div className="text-xs text-slate-500 mt-0.5">
													{m.role} · {m.department}
												</div>
												<div className="mt-2 flex items-center gap-4 text-sm">
													<span className="text-red-400 font-bold">
														{m.absent} absences
													</span>
													<span className="text-slate-500">
														/ {m.total_workdays} workdays
													</span>
													<AttendanceBar rate={m.attendance_rate} />
												</div>
												<div className="flex flex-wrap gap-1 mt-2">
													{m.absent_dates.map((d) => (
														<span
															key={d}
															className="text-xs bg-red-900/30 text-red-300 border border-red-800/40 px-2 py-0.5 rounded">
															{format(parseISO(d), "dd MMM")}
														</span>
													))}
												</div>
											</div>
											<MemberActions
												member={m}
												onAction={() =>
													qc.invalidateQueries({ queryKey: ["dept-absentees"] })
												}
											/>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			)}

			{/* ── LATE COMERS TAB ─────────────────────────────────────────────────── */}
			{activeTab === "late" && (
				<div className="space-y-4">
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
						<StatCard
							icon={Clock}
							label="Late This Period"
							value={lateData?.count ?? "—"}
							color="text-amber-400"
						/>
						<StatCard
							icon={AlertTriangle}
							label="Warn At"
							value={`${lateData?.thresholds?.warn_at ?? 3}+ times`}
							sub="Warning sent"
							color="text-amber-400"
						/>
						<StatCard
							icon={ShieldOff}
							label="Deactivate At"
							value={`${lateData?.thresholds?.deactivate_at ?? 10}+ times`}
							sub="Account suspended"
							color="text-red-400"
						/>
						<StatCard
							icon={Calendar}
							label="Period"
							value={`${period}d`}
							color="text-white"
						/>
					</div>
					<div className="card">
						<h3 className="font-semibold text-white mb-5 flex items-center gap-2">
							<Clock size={16} className="text-amber-400" /> Late Comers
						</h3>
						{lateLoading ? (
							<div className="space-y-2">
								{[...Array(4)].map((_, i) => (
									<div key={i} className="skeleton h-20 rounded-xl" />
								))}
							</div>
						) : (lateData?.late_comers || []).length === 0 ? (
							<div className="text-center py-12 text-slate-500">
								<CheckCircle
									size={32}
									className="mx-auto mb-3 text-green-500 opacity-50"
								/>
								<p>No late arrivals in this period.</p>
							</div>
						) : (
							<div className="space-y-3">
								{(lateData?.late_comers || []).map((m: MemberStat) => (
									<div
										key={m.user_id}
										className={clsx(
											"p-4 rounded-xl border",
											m.needs_late_deactivation
												? "bg-red-900/15 border-red-800/40"
												: m.needs_late_warning
													? "bg-amber-900/10 border-amber-800/30"
													: "bg-surface border-surface-border",
										)}>
										<div className="flex items-start justify-between gap-3 flex-wrap">
											<div className="flex-1">
												<div className="flex items-center gap-2 flex-wrap">
													<span className="text-white font-medium">
														{m.name}
													</span>
													<RiskBadge member={m} />
												</div>
												<div className="text-xs text-slate-500 mt-0.5">
													{m.role} · {m.department}
												</div>
												<div className="mt-2 flex items-center gap-4 text-sm">
													<span className="text-amber-400 font-bold">
														{m.late}× late
													</span>
													<span className="text-slate-400">
														{m.present} total present days
													</span>
												</div>
												<div className="flex flex-wrap gap-1 mt-2">
													{m.late_dates.map((d) => (
														<span
															key={d}
															className="text-xs bg-amber-900/30 text-amber-300 border border-amber-800/40 px-2 py-0.5 rounded">
															{format(parseISO(d), "dd MMM")}
														</span>
													))}
												</div>
											</div>
											<MemberActions
												member={m}
												onAction={() =>
													qc.invalidateQueries({ queryKey: ["dept-late"] })
												}
											/>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			)}

			{/* ── TRENDS TAB ──────────────────────────────────────────────────────── */}
			{activeTab === "trends" && (
				<div className="space-y-6">
					{trendsData?.summary && (
						<div className="grid grid-cols-3 gap-4">
							<StatCard
								icon={UserCheck}
								label="Avg Attendance Rate"
								value={`${trendsData.summary.avg_present_rate}%`}
								color="text-green-400"
							/>
							<StatCard
								icon={UserX}
								label="Avg Absence Rate"
								value={`${trendsData.summary.avg_absent_rate}%`}
								color="text-red-400"
							/>
							<StatCard
								icon={Clock}
								label="Late Check-in Rate"
								value={`${trendsData.summary.avg_late_rate}%`}
								color="text-amber-400"
							/>
						</div>
					)}
					<div className="card">
						<h3 className="font-semibold text-white mb-4 flex items-center gap-2">
							<TrendingUp size={16} className="text-Swahilipot-400" /> Daily
							Trend
						</h3>
						{trendsLoading ? (
							<div className="skeleton h-64 rounded-xl" />
						) : (
							<ResponsiveContainer width="100%" height={260}>
								<BarChart data={trendChartData} barSize={6}>
									<CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
									<XAxis
										dataKey="date"
										tick={{ fontSize: 10, fill: "#64748b" }}
										interval={Math.floor(trendChartData.length / 8)}
									/>
									<YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
									<Tooltip
										contentStyle={{
											background: "#0f172a",
											border: "1px solid #1e293b",
											borderRadius: 8,
										}}
										labelStyle={{ color: "#94a3b8" }}
									/>
									<Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
									<Bar
										dataKey="present"
										fill="#22c55e"
										name="Present"
										radius={[2, 2, 0, 0]}
									/>
									<Bar
										dataKey="absent"
										fill="#ef4444"
										name="Absent"
										radius={[2, 2, 0, 0]}
									/>
									<Bar
										dataKey="late"
										fill="#f59e0b"
										name="Late"
										radius={[2, 2, 0, 0]}
									/>
									<Bar
										dataKey="on_leave"
										fill="#3b82f6"
										name="On Leave"
										radius={[2, 2, 0, 0]}
									/>
								</BarChart>
							</ResponsiveContainer>
						)}
					</div>
					<div className="card">
						<h3 className="font-semibold text-white mb-4 flex items-center gap-2">
							<Activity size={16} className="text-Swahilipot-400" /> Attendance
							Rate Over Time
						</h3>
						{trendsLoading ? (
							<div className="skeleton h-48 rounded-xl" />
						) : (
							<ResponsiveContainer width="100%" height={200}>
								<LineChart
									data={trendChartData.map((d) => ({
										...d,
										rate: trendsData?.total_members
											? Math.round((d.present / trendsData.total_members) * 100)
											: 0,
									}))}>
									<CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
									<XAxis
										dataKey="date"
										tick={{ fontSize: 10, fill: "#64748b" }}
										interval={Math.floor(trendChartData.length / 8)}
									/>
									<YAxis
										domain={[0, 100]}
										tick={{ fontSize: 10, fill: "#64748b" }}
										unit="%"
									/>
									<Tooltip
										contentStyle={{
											background: "#0f172a",
											border: "1px solid #1e293b",
											borderRadius: 8,
										}}
										formatter={(v: any) => [`${v}%`, "Attendance Rate"]}
									/>
									<Line
										type="monotone"
										dataKey="rate"
										stroke="#818cf8"
										strokeWidth={2.5}
										dot={false}
										name="Attendance %"
									/>
								</LineChart>
							</ResponsiveContainer>
						)}
					</div>
				</div>
			)}

			{/* ── AUTO-ENFORCE MODAL ───────────────────────────────────────────────── */}
			{showAutoEnforce && (
				<div
					className="modal-backdrop"
					onClick={() => setShowAutoEnforce(false)}>
					<div className="modal-box" onClick={(e) => e.stopPropagation()}>
						<div className="modal-header">
							<h3 className="font-semibold text-white flex items-center gap-2">
								<Zap size={16} className="text-amber-400" /> Auto-Enforce
								Attendance Rules
							</h3>
						</div>
						<div className="modal-body space-y-4">
							<div className="p-4 bg-amber-900/20 border border-amber-700/40 rounded-xl">
								<p className="text-sm text-amber-300 font-medium">
									What this does:
								</p>
								<ul className="mt-2 space-y-1.5 text-xs text-slate-300">
									<li className="flex items-start gap-2">
										<AlertTriangle
											size={12}
											className="text-amber-400 mt-0.5 flex-shrink-0"
										/>{" "}
										Sends warnings to members with 3+ absences or 3+ late
										check-ins (last 30 days)
									</li>
									<li className="flex items-start gap-2">
										<ShieldOff
											size={12}
											className="text-red-400 mt-0.5 flex-shrink-0"
										/>{" "}
										Deactivates accounts of members with 5+ unexcused absences
										or 10+ late check-ins
									</li>
									<li className="flex items-start gap-2">
										<CheckCircle
											size={12}
											className="text-green-400 mt-0.5 flex-shrink-0"
										/>{" "}
										Members on approved leave are excluded from calculations
									</li>
								</ul>
							</div>
							<p className="text-sm text-slate-400">
								Run a <strong className="text-white">dry run</strong> first to
								see what would happen without taking action.
							</p>
						</div>
						<div className="modal-footer">
							<button
								onClick={() => setShowAutoEnforce(false)}
								className="btn-secondary">
								Cancel
							</button>
							<button
								onClick={() => {
									autoEnforceMutation.mutate(true);
									setShowAutoEnforce(false);
								}}
								disabled={autoEnforceMutation.isPending}
								className="btn-secondary">
								<Eye size={14} /> Dry Run
							</button>
							<button
								onClick={() => {
									if (
										confirm(
											"This will send warnings and deactivate accounts. Continue?",
										)
									) {
										autoEnforceMutation.mutate(false);
										setShowAutoEnforce(false);
									}
								}}
								disabled={autoEnforceMutation.isPending}
								className="btn-danger">
								<Zap size={14} /> Run Now
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

