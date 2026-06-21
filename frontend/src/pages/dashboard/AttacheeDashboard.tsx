// Nexus — Attachee Dashboard
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
	Activity,
	ClipboardList,
	BookOpen,
	Star,
	Award,
	Calendar,
	TrendingUp,
	Clock,
	CheckCircle,
	AlertTriangle,
	ChevronRight,
	Target,
	Zap,
} from "lucide-react";

import {
	tasksApi,
	attendanceApi,
	logbooksApi,
	evaluationsApi,
} from "../../services/api";
import { useAuthStore } from "../../services/api";
import clsx from "clsx";

export default function AttacheeDashboard() {
	const navigate = useNavigate();
	const { user } = useAuthStore();

	const { data: tasksData } = useQuery({
		queryKey: ["tasks"],
		queryFn: () => tasksApi.list({ limit: 10 }).then((r) => r.data),
		refetchInterval: 60000,
	});

	const tasks = Array.isArray(tasksData)
		? tasksData
		: Array.isArray(tasksData?.results)
			? tasksData.results
			: [];

	const { data: todayAttendance } = useQuery({
		queryKey: ["attendance-today"],
		queryFn: () =>
			attendanceApi
				.today()
				.then((r) => r.data)
				.catch(() => null),
		refetchInterval: 30000,
	});

	const { data: logbooks = [] } = useQuery({
		queryKey: ["logbooks"],
		queryFn: () => logbooksApi.list().then((r) => r.data.results || r.data),
	});

	const { data: evaluations = [] } = useQuery({
		queryKey: ["evaluations"],
		queryFn: () => evaluationsApi.list().then((r) => r.data.results || r.data),
	});

	const pendingTasks = tasks.filter((t: any) => t.status === "pending");
	const overdueTasks = tasks.filter((t: any) => t.is_overdue);
	const completedTasks = tasks.filter((t: any) => t.status === "approved");
	const inProgressTasks = tasks.filter((t: any) => t.status === "in_progress");

	const isCheckedIn = !!todayAttendance?.check_in_time;
	const isCheckedOut = !!todayAttendance?.check_out_time;

	const latestEval = evaluations[0];

	return (
		<div className="space-y-6 animate-fade-in">
			{/* Header */}
			<div>
				<h1 className="page-title">
					Good {getGreeting()}, {user?.first_name} 
				</h1>
				<p className="page-subtitle">
					{format(new Date(), "EEEE, MMMM d yyyy")} ·{" "}
					{user?.department_name || user?.organisation_name}
				</p>
			</div>

			{/* Overdue alert */}
			{overdueTasks.length > 0 && (
				<div
					className="alert alert-danger cursor-pointer"
					onClick={() => navigate("/tasks")}>
					<AlertTriangle size={15} className="shrink-0" />
					<span>
						<strong>
							{overdueTasks.length} overdue task
							{overdueTasks.length > 1 ? "s" : ""}
						</strong>{" "}
						— please complete immediately.
					</span>
					<ChevronRight size={14} className="ml-auto shrink-0" />
				</div>
			)}

			{/* Attendance strip */}
			<div
				onClick={() => navigate("/attendance")}
				className={clsx(
					"flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all hover:scale-[1.01]",
					{
						"bg-green-900/20 border-green-500/30": isCheckedIn && !isCheckedOut,
						"bg-surface-card border-surface-border":
							!isCheckedIn || isCheckedOut,
					},
				)}>
				<div className="flex items-center gap-3">
					<div
						className={clsx("w-3 h-3 rounded-full", {
							"bg-green-400 animate-pulse": isCheckedIn && !isCheckedOut,
							"bg-slate-500": !isCheckedIn || isCheckedOut,
						})}
					/>
					<div>
						<div
							className={clsx("font-semibold text-sm", {
								"text-green-400": isCheckedIn && !isCheckedOut,
								"text-white": !isCheckedIn || isCheckedOut,
							})}>
							{!isCheckedIn
								? "Not Checked In"
								: isCheckedOut
									? "Attendance Complete"
									: "Currently Checked In"}
						</div>
						<div className="text-xs text-slate-500">
							{isCheckedIn
								? `Since ${format(new Date(todayAttendance.check_in_time), "HH:mm")}`
								: "Tap to check in with GPS"}
						</div>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{!isCheckedIn && (
						<span className="btn-success btn-sm text-xs">Check In</span>
					)}
					<ChevronRight size={15} className="text-slate-500" />
				</div>
			</div>

			{/* KPI cards */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
				<KpiCard
					icon={ClipboardList}
					label="Tasks Assigned"
					value={tasks.length}
					sub={`${pendingTasks.length} pending`}
					subColor={
						pendingTasks.length > 0 ? "text-amber-400" : "text-slate-500"
					}
					onClick={() => navigate("/tasks")}
					color="blue"
				/>
				<KpiCard
					icon={CheckCircle}
					label="Tasks Completed"
					value={completedTasks.length}
					sub={`${inProgressTasks.length} in progress`}
					onClick={() => navigate("/tasks")}
					color="green"
				/>
				<KpiCard
					icon={BookOpen}
					label="Logbook Entries"
					value={logbooks[0]?.entry_count || 0}
					sub="this attachment"
					onClick={() => navigate("/logbooks")}
					color="purple"
				/>
				<KpiCard
					icon={Star}
					label="Latest Score"
					value={latestEval?.percentage ? `${latestEval.percentage}%` : "—"}
					sub={latestEval?.template?.evaluation_type || "No evaluations yet"}
					onClick={() => navigate("/evaluations")}
					color="amber"
				/>
			</div>

			{/* Main content */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Upcoming tasks */}
				<div className="card lg:col-span-2">
					<div className="flex items-center justify-between mb-4">
						<h3 className="font-semibold text-white flex items-center gap-2">
							<ClipboardList size={16} className="text-Nexus-400" /> My Tasks
						</h3>
						<button
							onClick={() => navigate("/tasks")}
							className="btn-ghost btn-sm text-xs">
							View all <ChevronRight size={12} />
						</button>
					</div>

					{tasks.length === 0 ? (
						<div className="text-center py-8">
							<ClipboardList
								size={28}
								className="mx-auto text-slate-500 mb-2 opacity-30"
							/>
							<p className="text-slate-500 text-sm">No tasks assigned yet</p>
						</div>
					) : (
						<div className="space-y-2">
							{tasks.slice(0, 6).map((task: any) => (
								<div
									key={task.id}
									onClick={() => navigate("/tasks")}
									className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-surface-border hover:border-Nexus-500/30 cursor-pointer transition-all group">
									<div
										className={clsx("w-2 h-2 rounded-full shrink-0", {
											"bg-red-400": task.is_overdue,
											"bg-green-400": task.status === "approved",
											"bg-blue-400": task.status === "in_progress",
											"bg-amber-400": task.status === "pending",
											"bg-slate-500": task.status === "submitted",
										})}
									/>
									<div className="flex-1 min-w-0">
										<div className="text-sm font-medium text-white truncate group-hover:text-Nexus-400 transition-colors">
											{task.title}
										</div>
										<div className="text-xs text-slate-500">
											Due{" "}
											{task.due_date
												? format(new Date(task.due_date), "dd MMM, HH:mm")
												: "—"}
										</div>
									</div>
									<span
										className={clsx("text-[10px] badge capitalize shrink-0", {
											"badge-red":
												task.is_overdue || task.status === "rejected",
											"badge-green": task.status === "approved",
											"badge-blue":
												task.status === "in_progress" ||
												task.status === "submitted",
											"badge-amber": task.status === "pending",
											"badge-slate": task.status === "reviewed",
										})}>
										{task.is_overdue
											? "overdue"
											: task.status?.replace("_", " ")}
									</span>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Quick actions + Progress */}
				<div className="space-y-4">
					{/* Progress ring placeholder */}
					<div className="card">
						<h3 className="font-semibold text-white mb-4 flex items-center gap-2">
							<Target size={15} className="text-Nexus-400" /> Attachment
							Progress
						</h3>
						<div className="flex items-center gap-4">
							<div className="relative w-20 h-20 shrink-0">
								<svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
									<circle
										cx="18"
										cy="18"
										r="15.9"
										fill="none"
										stroke="#252d42"
										strokeWidth="2.5"
									/>
									<circle
										cx="18"
										cy="18"
										r="15.9"
										fill="none"
										stroke="#3b63f5"
										strokeWidth="2.5"
										strokeDasharray="68 32"
										strokeLinecap="round"
									/>
								</svg>
								<div className="absolute inset-0 flex items-center justify-center">
									<span className="text-sm font-bold text-white">68%</span>
								</div>
							</div>
							<div className="space-y-1.5 flex-1">
								<div className="flex justify-between text-xs">
									<span className="text-slate-400">Days Done</span>
									<span className="text-white font-medium">34 / 50</span>
								</div>
								<div className="flex justify-between text-xs">
									<span className="text-slate-400">Tasks</span>
									<span className="text-white font-medium">
										{completedTasks.length} / {tasks.length}
									</span>
								</div>
								<div className="flex justify-between text-xs">
									<span className="text-slate-400">Logbook</span>
									<span className="text-white font-medium">
										{logbooks[0]?.entry_count || 0} entries
									</span>
								</div>
							</div>
						</div>
					</div>

					{/* Quick actions */}
					<div className="card">
						<h3 className="font-semibold text-white mb-3 flex items-center gap-2">
							<Zap size={15} className="text-Nexus-400" /> Quick Actions
						</h3>
						<div className="space-y-2">
							{[
								{
									label: "Check In / Out",
									path: "/attendance",
									icon: Activity,
									color: "text-green-400",
								},
								{
									label: "Write Logbook Entry",
									path: "/logbooks",
									icon: BookOpen,
									color: "text-blue-400",
								},
								{
									label: "View My Tasks",
									path: "/tasks",
									icon: ClipboardList,
									color: "text-amber-400",
								},
								{
									label: "Request Leave",
									path: "/attendance",
									icon: Calendar,
									color: "text-purple-400",
								},
								{
									label: "View Evaluations",
									path: "/evaluations",
									icon: Star,
									color: "text-yellow-400",
								},
								{
									label: "Download Certificate",
									path: "/certificates",
									icon: Award,
									color: "text-Nexus-400",
								},
							].map(({ label, path, icon: Icon, color }) => (
								<button
									key={label}
									onClick={() => navigate(path)}
									className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg bg-surface border border-surface-border hover:border-Nexus-500/30 hover:bg-surface-elevated transition-all text-left group">
									<Icon size={14} className={clsx(color, "shrink-0")} />
									<span className="text-sm text-slate-300 group-hover:text-white transition-colors">
										{label}
									</span>
									<ChevronRight
										size={12}
										className="ml-auto text-slate-600 group-hover:text-slate-400"
									/>
								</button>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function KpiCard({
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
		purple: "text-purple-400 bg-purple-500/10",
	};
	return (
		<button
			onClick={onClick}
			className="stat-card text-left hover:border-Nexus-500/30 hover:shadow-glow-blue transition-all group">
			<div
				className={clsx(
					"w-9 h-9 rounded-lg flex items-center justify-center",
					colorMap[color],
				)}>
				<Icon size={17} />
			</div>
			<div className="stat-value group-hover:text-Nexus-400 transition-colors">
				{value}
			</div>
			<div className="stat-label">{label}</div>
			{sub && <div className={clsx("text-[10px] mt-0.5", subColor)}>{sub}</div>}
		</button>
	);
}

function getGreeting() {
	const h = new Date().getHours();
	if (h < 12) return "morning";
	if (h < 18) return "afternoon";
	return "evening";
}
