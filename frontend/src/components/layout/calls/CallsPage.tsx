// NEXUS — Call Recording System Page
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
	Phone,
	Play,
	Search,
	Download,
	Mic2,
	AlertTriangle,
	BarChart3,
	Clock,
} from "lucide-react";
import { callsApi } from "../../../services/api";
import { useAuthStore } from "../../../services/api";
import clsx from "clsx";

export default function CallsPage() {
	const { user } = useAuthStore();
	const [search, setSearch] = useState("");
	const [activeTab, setActiveTab] = useState<
		"recordings" | "hardware" | "stats"
	>("recordings");

	const { data: callsRaw, isLoading } = useQuery({
		queryKey: ["calls"],
		queryFn: () => callsApi.list().then((r) => r.data),
		refetchInterval: 60000,
	});

	const { data: hardwareRaw } = useQuery({
		queryKey: ["calls-hardware"],
		queryFn: () => callsApi.hardware().then((r) => r.data),
		enabled: activeTab === "hardware",
	});

	const { data: statsRaw } = useQuery({
		queryKey: ["calls-stats"],
		queryFn: () => callsApi.stats().then((r) => r.data),
		enabled: activeTab === "stats",
	});

	const calls = Array.isArray(callsRaw) ? callsRaw : (callsRaw?.results ?? []);
	const hardware = Array.isArray(hardwareRaw)
		? hardwareRaw
		: (hardwareRaw?.results ?? []);
	const stats = statsRaw ?? {};

	const filtered = calls.filter(
		(c: any) =>
			!search ||
			c.operator_name?.toLowerCase().includes(search.toLowerCase()) ||
			c.studio?.toLowerCase().includes(search.toLowerCase()),
	);

	const totalCalls = calls.length;
	const avgDuration =
		calls.length > 0
			? Math.round(
					calls.reduce(
						(s: number, c: any) => s + (c.duration_seconds || 0),
						0,
					) /
						calls.length /
						60,
				)
			: 0;

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<Phone size={22} className="text-nexus-400" /> Call Recording System
					</h1>
					<p className="page-subtitle">
						On-air call metadata · audio playback · hardware fault tracking
					</p>
				</div>
			</div>

			{/* Stats row */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
				{[
					{ label: "Total Calls", value: totalCalls, color: "text-white" },
					{
						label: "Avg Duration",
						value: avgDuration + " min",
						color: "text-blue-400",
					},
					{
						label: "Hardware Faults",
						value: hardware.filter((h: any) => h.status === "faulty").length,
						color: "text-red-400",
					},
					{
						label: "Recordings",
						value: calls.filter((c: any) => c.audio_file).length,
						color: "text-green-400",
					},
				].map(({ label, value, color }) => (
					<div key={label} className="stat-card">
						<div className={clsx("stat-value", color)}>{value}</div>
						<div className="stat-label">{label}</div>
					</div>
				))}
			</div>

			{/* Tabs */}
			<div className="flex gap-1 p-1 bg-surface-card border border-surface-border rounded-xl w-fit">
				{(["recordings", "hardware", "stats"] as const).map((tab) => (
					<button
						key={tab}
						onClick={() => setActiveTab(tab)}
						className={clsx(
							"px-5 py-2 rounded-lg text-sm font-medium capitalize transition-all",
							{
								"bg-nexus-600 text-white": activeTab === tab,
								"text-slate-400 hover:text-white": activeTab !== tab,
							},
						)}>
						{tab}
					</button>
				))}
			</div>

			{/* ── RECORDINGS ── */}
			{activeTab === "recordings" && (
				<div className="card">
					<div className="flex flex-wrap gap-3 mb-5">
						<div className="relative flex-1 min-w-[200px]">
							<Search
								size={13}
								className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
							/>
							<input
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search by operator or studio..."
								className="input pl-8 py-2"
							/>
						</div>
						<button className="btn-secondary btn-sm shrink-0">
							<Download size={13} /> Export
						</button>
					</div>

					{isLoading ? (
						[...Array(6)].map((_, i) => (
							<div key={i} className="skeleton h-14 rounded-xl mb-2" />
						))
					) : filtered.length === 0 ? (
						<div className="text-center py-12 text-slate-500">
							<Phone size={32} className="mx-auto mb-3 opacity-30" />
							<p>No call recordings found</p>
							<p className="text-xs mt-1">
								Recordings appear here when your VoIP system logs calls
							</p>
						</div>
					) : (
						<div className="overflow-x-auto -mx-1">
							<table className="data-table min-w-[640px]">
								<thead>
									<tr>
										<th>Date & Time</th>
										<th>Studio</th>
										<th>Operator</th>
										<th>Duration</th>
										<th>Type</th>
										<th>Recording</th>
									</tr>
								</thead>
								<tbody>
									{filtered.map((call: any) => (
										<tr key={call.id}>
											<td className="font-mono text-xs text-slate-300">
												{call.timestamp
													? format(
															parseISO(call.timestamp),
															"dd MMM yyyy, HH:mm:ss",
														)
													: "—"}
											</td>
											<td className="text-white font-medium text-sm">
												{call.studio || "—"}
											</td>
											<td className="text-slate-400 text-sm">
												{call.operator_name || "—"}
											</td>
											<td className="text-slate-300 text-sm">
												{call.duration_seconds
													? Math.floor(call.duration_seconds / 60) +
														"m " +
														(call.duration_seconds % 60) +
														"s"
													: "—"}
											</td>
											<td>
												<span
													className={clsx("badge text-[10px]", {
														"badge-red": call.call_type === "on_air",
														"badge-blue": call.call_type === "internal",
														"badge-slate": !call.call_type,
													})}>
													{call.call_type?.replace("_", " ") || "unknown"}
												</span>
											</td>
											<td>
												{call.audio_file ? (
													<button
														className="btn-secondary btn-sm p-1.5"
														title="Play recording">
														<Play size={12} />
													</button>
												) : (
													<span className="text-xs text-slate-600">
														No recording
													</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}

			{/* ── HARDWARE ── */}
			{activeTab === "hardware" && (
				<div className="space-y-4">
					<div className="card">
						<div className="flex items-center justify-between mb-5">
							<h3 className="font-semibold text-white flex items-center gap-2">
								<Mic2 size={15} className="text-nexus-400" /> Headsets &
								Hardware Status
							</h3>
							<button className="btn-secondary btn-sm" onClick={() => {}}>
								<AlertTriangle size={13} /> Report Fault
							</button>
						</div>
						{hardware.length === 0 ? (
							<div className="text-center py-10 text-slate-500">
								<Mic2 size={28} className="mx-auto mb-2 opacity-30" />
								<p>No hardware tracked yet</p>
								<p className="text-xs mt-1">
									Add headsets and studio equipment to track their status
								</p>
							</div>
						) : (
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
								{hardware.map((item: any) => (
									<div
										key={item.id}
										className={clsx("p-4 rounded-xl border", {
											"border-red-500/30 bg-red-900/10":
												item.status === "faulty",
											"border-green-500/30 bg-green-900/10":
												item.status === "working",
											"border-surface-border bg-surface": !item.status,
										})}>
										<div className="flex items-start justify-between mb-2">
											<div className="font-medium text-white text-sm">
												{item.name || item.device_name}
											</div>
											<span
												className={clsx("badge text-[10px]", {
													"badge-green": item.status === "working",
													"badge-red": item.status === "faulty",
													"badge-amber": item.status === "maintenance",
													"badge-slate": !item.status,
												})}>
												{item.status || "unknown"}
											</span>
										</div>
										<div className="text-xs text-slate-500">
											{item.studio || item.location || "—"}
										</div>
										{item.fault_description && (
											<div className="mt-2 text-xs text-red-400 bg-red-900/20 rounded p-2">
												{item.fault_description}
											</div>
										)}
										{item.last_reported && (
											<div className="text-[10px] text-slate-600 mt-2">
												Last report:{" "}
												{format(parseISO(item.last_reported), "dd MMM, HH:mm")}
											</div>
										)}
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			)}

			{/* ── STATS ── */}
			{activeTab === "stats" && (
				<div className="space-y-5">
					<div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
						{[
							{
								label: "Calls This Week",
								value: stats.calls_this_week ?? "—",
								color: "text-white",
							},
							{
								label: "Calls This Month",
								value: stats.calls_this_month ?? "—",
								color: "text-nexus-400",
							},
							{
								label: "Avg Duration",
								value: stats.avg_duration ?? avgDuration + " min",
								color: "text-blue-400",
							},
							{
								label: "On-Air Calls",
								value: stats.on_air_calls ?? "—",
								color: "text-red-400",
							},
							{
								label: "Internal Calls",
								value: stats.internal_calls ?? "—",
								color: "text-amber-400",
							},
							{
								label: "Total Recordings",
								value:
									stats.total_recordings ??
									calls.filter((c: any) => c.audio_file).length,
								color: "text-green-400",
							},
						].map(({ label, value, color }) => (
							<div key={label} className="stat-card">
								<div className={clsx("stat-value", color)}>{value}</div>
								<div className="stat-label">{label}</div>
							</div>
						))}
					</div>

					{/* Call volume by studio */}
					{stats.by_studio && Object.keys(stats.by_studio).length > 0 && (
						<div className="card">
							<h3 className="font-semibold text-white mb-4">
								Call Volume by Studio
							</h3>
							<div className="space-y-3">
								{Object.entries(stats.by_studio).map(([studio, count]: any) => (
									<div key={studio} className="flex items-center gap-3">
										<div className="w-24 text-sm text-slate-400 truncate">
											{studio}
										</div>
										<div className="flex-1 h-4 bg-surface-elevated rounded-full overflow-hidden">
											<div
												className="h-full bg-nexus-500 rounded-full"
												style={{
													width:
														Math.min(
															100,
															Math.round(
																(count /
																	(Math.max(
																		...Object.values(stats.by_studio as any),
																	) || 1)) *
																	100,
															),
														) + "%",
												}}
											/>
										</div>
										<div className="w-10 text-right text-sm font-medium text-white">
											{count}
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					{!stats.by_studio && (
						<div className="card text-center py-10 text-slate-500">
							<BarChart3 size={28} className="mx-auto mb-2 opacity-30" />
							<p>Call statistics will appear here once calls are logged</p>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
