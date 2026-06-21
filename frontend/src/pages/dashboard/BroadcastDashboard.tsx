// Nexus Broadcast Dashboard
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
	Radio,
	Package,
	Newspaper,
	Camera,
	Calendar,
	AlertTriangle,
	CheckCircle,
	XCircle,
	Clock,
	Zap,
	Activity,
} from "lucide-react";
import {
	fmReportApi,
	equipmentApi,
	newsApi,
	radioApi,
} from "../../services/api";
import { useAuthStore } from "../../services/api";
import { format } from "date-fns";
import clsx from "clsx";

export default function BroadcastDashboard() {
	const navigate = useNavigate();
	const { user } = useAuthStore();

	const { data: fmStationsData } = useQuery({
		queryKey: ["fm-stations"],
		queryFn: () => fmReportApi.stations().then((r) => r.data),
		refetchInterval: 15000,
	});

	const fmStations = Array.isArray(fmStationsData)
		? fmStationsData
		: Array.isArray(fmStationsData?.results)
			? fmStationsData.results
			: [];

	const { data: eqStats } = useQuery({
		queryKey: ["equipment-stats"],
		queryFn: () => equipmentApi.stats().then((r) => r.data),
		refetchInterval: 60000,
	});

	const { data: mySchedule = [] } = useQuery({
		queryKey: ["my-radio-schedule"],
		queryFn: () => radioApi.mySchedule().then((r) => r.data),
		enabled: user?.role === "presenter",
	});

	const { data: recentNews = [] } = useQuery({
		queryKey: ["recent-news"],
		queryFn: () =>
			newsApi.list({ limit: 5 }).then((r) => r.data.results || r.data),
		refetchInterval: 120000,
	});

	return (
		<div className="space-y-6 animate-fade-in">
			<div>
				<h1 className="page-title">Welcome back, {user?.first_name} 📻</h1>
				<p className="page-subtitle">
					{format(new Date(), "EEEE, MMMM d yyyy")} · Broadcast Operations
				</p>
			</div>

			{/* FM Station Status - large, prominent */}
			<div>
				<h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">
					Live Station Status
				</h2>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{fmStations.length === 0 ? (
						<div className="card col-span-3 text-center py-8 text-slate-500">
							No stations configured
						</div>
					) : (
						fmStations.map((station: any) => {
							const isOn = station.current_status === "on_air";
							const isOff = station.current_status === "off_air";
							return (
								<button
									key={station.id}
									onClick={() => navigate("/fm-report")}
									className={clsx(
										"card text-left transition-all hover:scale-[1.02]",
										{
											"border-green-500/40 shadow-glow-green": isOn,
											"border-red-500/40 shadow-glow-red animate-pulse-slow":
												isOff,
										},
									)}>
									<div className="flex items-center gap-3 mb-3">
										<div
											className={clsx("w-3 h-3 rounded-full", {
												"bg-green-400": isOn,
												"bg-red-400": isOff,
												"bg-slate-500": !isOn && !isOff,
											})}
										/>
										<span
											className={clsx(
												"text-lg font-display font-bold tracking-wide",
												{
													"text-green-400": isOn,
													"text-red-400": isOff,
													"text-slate-400": !isOn && !isOff,
												},
											)}>
											{isOn ? "ON AIR" : isOff ? "OFF AIR" : "UNKNOWN"}
										</span>
									</div>
									<div className="text-white font-semibold">{station.name}</div>
									<div className="text-slate-400 text-sm">
										{station.frequency} MHz
									</div>
									{station.time_since_change && (
										<div className="text-xs text-slate-500 mt-1">
											{isOn ? "On air for" : "Down for"}{" "}
											{station.time_since_change}
										</div>
									)}
									<div className="mt-3 text-xs">
										<span className="text-slate-500">Uptime today: </span>
										<span
											className={clsx("font-bold", {
												"text-green-400": station.uptime_percent_today >= 95,
												"text-amber-400": station.uptime_percent_today >= 80,
												"text-red-400": station.uptime_percent_today < 80,
											})}>
											{station.uptime_percent_today}%
										</span>
									</div>
								</button>
							);
						})
					)}
				</div>
			</div>

			{/* Quick stats */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
				<div
					className="stat-card cursor-pointer hover:border-Nexus-500/30 transition-all"
					onClick={() => navigate("/equipment")}>
					<Package size={20} className="text-blue-400" />
					<div className="stat-value">{eqStats?.available ?? "—"}</div>
					<div className="stat-label">Equipment Available</div>
				</div>
				<div
					className="stat-card cursor-pointer"
					onClick={() => navigate("/equipment")}>
					<Activity size={20} className="text-amber-400" />
					<div className="stat-value text-amber-400">
						{eqStats?.checked_out ?? "—"}
					</div>
					<div className="stat-label">Currently Checked Out</div>
				</div>
				<div
					className="stat-card cursor-pointer"
					onClick={() => navigate("/news")}>
					<Newspaper size={20} className="text-green-400" />
					<div className="stat-value text-green-400">
						{recentNews.filter((n: any) => n.status === "published").length}
					</div>
					<div className="stat-label">Published Today</div>
				</div>
				<div
					className="stat-card cursor-pointer"
					onClick={() => navigate("/radio")}>
					<Radio size={20} className="text-purple-400" />
					<div className="stat-value text-purple-400">{mySchedule.length}</div>
					<div className="stat-label">My Upcoming Slots</div>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* My upcoming schedule */}
				{user?.role === "presenter" && (
					<div className="card">
						<div className="flex items-center justify-between mb-4">
							<h3 className="font-semibold text-white flex items-center gap-2">
								<Calendar size={16} className="text-Nexus-400" /> My Schedule
							</h3>
							<button
								onClick={() => navigate("/radio")}
								className="btn-ghost btn-sm text-xs">
								View all
							</button>
						</div>
						{mySchedule.length === 0 ? (
							<p className="text-slate-500 text-sm text-center py-6">
								No upcoming slots scheduled
							</p>
						) : (
							<div className="space-y-2">
								{mySchedule.slice(0, 5).map((slot: any) => (
									<div
										key={slot.id}
										className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-surface-border">
										<div className="w-2 h-8 rounded-full bg-Nexus-600" />
										<div className="flex-1">
											<div className="text-sm font-medium text-white">
												{slot.show_name}
											</div>
											<div className="text-xs text-slate-400">
												{format(
													new Date(slot.start_datetime),
													"EEE dd MMM, HH:mm",
												)}{" "}
												— {format(new Date(slot.end_datetime), "HH:mm")}
											</div>
											<div className="text-xs text-slate-500">
												{slot.frequency_name}
											</div>
										</div>
										{!slot.show_plan && (
											<span className="badge-amber text-[10px]">
												Plan needed
											</span>
										)}
									</div>
								))}
							</div>
						)}
					</div>
				)}

				{/* Recent news */}
				<div className="card">
					<div className="flex items-center justify-between mb-4">
						<h3 className="font-semibold text-white flex items-center gap-2">
							<Newspaper size={16} className="text-Nexus-400" /> Recent Stories
						</h3>
						<button
							onClick={() => navigate("/news")}
							className="btn-ghost btn-sm text-xs">
							View all
						</button>
					</div>
					{recentNews.length === 0 ? (
						<p className="text-slate-500 text-sm text-center py-6">
							No stories yet
						</p>
					) : (
						<div className="space-y-2">
							{recentNews.map((story: any) => (
								<div
									key={story.id}
									className="flex items-start gap-3 p-3 bg-surface rounded-lg border border-surface-border">
									<span
										className={clsx("badge text-[10px] shrink-0 mt-0.5", {
											"badge-green": story.status === "published",
											"badge-amber": story.status === "submitted",
											"badge-blue": story.status === "under_review",
											"badge-slate": story.status === "draft",
										})}>
										{story.status}
									</span>
									<div className="flex-1 min-w-0">
										<div className="text-sm text-white font-medium truncate">
											{story.title}
										</div>
										<div className="text-xs text-slate-500">
											{story.author_name} · {story.word_count}w
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Quick actions */}
			<div className="card">
				<h3 className="font-semibold text-white mb-4">Quick Actions</h3>
				<div className="flex flex-wrap gap-3">
					<button onClick={() => navigate("/fm-report")} className="btn-danger">
						<Radio size={15} /> FM Station Monitor
					</button>
					<button
						onClick={() => navigate("/equipment")}
						className="btn-secondary">
						<Package size={15} /> Request Equipment
					</button>
					<button onClick={() => navigate("/news")} className="btn-secondary">
						<Newspaper size={15} /> Write News Story
					</button>
					<button onClick={() => navigate("/radio")} className="btn-secondary">
						<Calendar size={15} /> View Radio Schedule
					</button>
					<button
						onClick={() => navigate("/file-transfer")}
						className="btn-secondary">
						<Zap size={15} /> Transfer Files
					</button>
					<button
						onClick={() => navigate("/feedback")}
						className="btn-secondary">
						<AlertTriangle size={15} /> Submit Complaint
					</button>
				</div>
			</div>
		</div>
	);
}
