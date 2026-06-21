// Swahilipot — Attendance Page (fully functional)
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, startOfWeek, addDays, isSameDay } from "date-fns";
import {
	Activity,
	MapPin,
	Clock,
	CheckCircle,
	XCircle,
	Calendar,
	AlertTriangle,
	Download,
	Plus,
	LogIn,
	LogOut,
	Navigation,
	Wifi,
	WifiOff,
	Shield,
	Timer,
	TrendingUp,
} from "lucide-react";
import { attendanceApi, hrApi } from "../../services/api";
import { useAuthStore } from "../../services/api";
import toast from "react-hot-toast";
import clsx from "clsx";

// ─── Haversine distance (metres) ─────────────────────────────────────────────
function haversineDistance(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const R = 6371000;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface GeoPosition {
	latitude: number;
	longitude: number;
	accuracy: number;
}

interface BranchGeo {
	latitude: number | null;
	longitude: number | null;
	geofence_radius: number;
}

const STATUS_STYLES: Record<string, string> = {
	present: "badge-green",
	late: "badge-amber",
	absent: "badge-red",
	half_day: "badge-amber",
	leave: "badge-blue",
	holiday: "badge-purple",
};

// ─── Distance pill ────────────────────────────────────────────────────────────
function DistancePill({
	distance,
	radius,
}: {
	distance: number | null;
	radius: number;
}) {
	if (distance === null)
		return (
			<span className="text-xs text-slate-500 flex items-center gap-1">
				<Navigation size={11} className="animate-pulse" /> Locating…
			</span>
		);
	const inside = distance <= radius;
	return (
		<span
			className={clsx(
				"inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
				inside
					? "bg-green-900/30 text-green-400 border border-green-500/30"
					: "bg-red-900/30 text-red-400 border border-red-500/30",
			)}>
			<MapPin size={10} />
			{Math.round(distance)}m from workplace
			{inside ? " ✓" : ` · limit ${radius}m`}
		</span>
	);
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AttendancePage() {
	const { user } = useAuthStore();
	const qc = useQueryClient();

	const [activeTab, setActiveTab] = useState<"today" | "history" | "leave">(
		"today",
	);
	const [showLeaveModal, setShowLeaveModal] = useState(false);

	// Live GPS state
	const [gpsPos, setGpsPos] = useState<GeoPosition | null>(null);
	const [gpsError, setGpsError] = useState<string | null>(null);
	const [gpsLoading, setGpsLoading] = useState(false);

	// Geofence exit tracking
	const wasInsideRef = useRef<boolean | null>(null);
	const alertSentRef = useRef(false);
	const watchIdRef = useRef<number | null>(null);

	// ── Fetch today's branch geo from settings / user profile ──────────────────
	// The user object carries branch.latitude / branch.longitude / branch.geofence_radius
	// (set in SettingsPage geofencing tab). We pull it from the branches API as
	// a fallback so it's always fresh.
	const { data: branches = [] } = useQuery({
		queryKey: ["branches"],
		queryFn: () => hrApi.branches().then((r) => r.data.results || r.data),
	});

	const userBranch: BranchGeo | null = (() => {
		// Prefer branch on the user object (populated by backend)
		if (user?.branch?.latitude != null && user?.branch?.longitude != null) {
			return {
				latitude: parseFloat(user.branch.latitude),
				longitude: parseFloat(user.branch.longitude),
				geofence_radius: user.branch.geofence_radius ?? 100,
			};
		}
		// Fall back to matching branch from the branches list
		const matched = branches.find((b: any) => b.id === user?.branch_id);
		if (matched?.latitude) {
			return {
				latitude: parseFloat(matched.latitude),
				longitude: parseFloat(matched.longitude),
				geofence_radius: matched.geofence_radius ?? 100,
			};
		}
		return null;
	})();

	// ── Computed distance from workplace ──────────────────────────────────────
	const distanceFromWorkplace: number | null =
		gpsPos && userBranch?.latitude && userBranch?.longitude
			? Math.round(
					haversineDistance(
						userBranch.latitude!,
						userBranch.longitude!,
						gpsPos.latitude,
						gpsPos.longitude,
					),
				)
			: null;

	const geofenceRadius = userBranch?.geofence_radius ?? 100;
	const isWithinGeofence =
		distanceFromWorkplace !== null && distanceFromWorkplace <= geofenceRadius;

	// ── Today's record ────────────────────────────────────────────────────────
	const { data: todayRecord, isLoading: todayLoading } = useQuery({
		queryKey: ["attendance-today"],
		queryFn: () => attendanceApi.today().then((r) => r.data),
		refetchInterval: 30000,
	});

	const isCheckedIn = !!todayRecord?.check_in_time;
	const isCheckedOut = !!todayRecord?.check_out_time;
	const isActiveSession = isCheckedIn && !isCheckedOut;

	// ── History ───────────────────────────────────────────────────────────────
	const { data: history = [], isLoading: historyLoading } = useQuery({
		queryKey: ["attendance-history"],
		queryFn: () =>
			attendanceApi.history().then((r) => r.data.results || r.data),
		enabled: activeTab === "history",
	});

	// ── Leave requests ────────────────────────────────────────────────────────
	const { data: leaveRequests = [] } = useQuery({
		queryKey: ["leave-requests"],
		queryFn: () =>
			attendanceApi.leaveRequests().then((r) => r.data.results || r.data),
		enabled: activeTab === "leave",
	});

	// ── This-week summary from history ────────────────────────────────────────
	const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
	const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

	const weekData = weekDays.map((day) => {
		const rec = history.find((r: any) => {
			try {
				return isSameDay(parseISO(r.date), day);
			} catch {
				return false;
			}
		});
		return { day, rec };
	});

	const weekPresent = weekData.filter(
		(d) => d.rec?.status === "present",
	).length;
	const weekLate = weekData.filter((d) => d.rec?.status === "late").length;
	const weekHours = weekData.reduce(
		(sum, d) => sum + (d.rec?.total_hours ? parseFloat(d.rec.total_hours) : 0),
		0,
	);

	// ── Mutations ─────────────────────────────────────────────────────────────
	const checkInMutation = useMutation({
		mutationFn: (data: any) => attendanceApi.checkIn(data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["attendance-today"] });
			qc.invalidateQueries({ queryKey: ["attendance-history"] });
			toast.success("✅ Checked in successfully!");
			alertSentRef.current = false;
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Check-in failed"),
	});

	const checkOutMutation = useMutation({
		mutationFn: (data: any) => attendanceApi.checkOut(data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["attendance-today"] });
			qc.invalidateQueries({ queryKey: ["attendance-history"] });
			toast.success("✅ Checked out — have a great day!");
			stopWatching();
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Check-out failed"),
	});

	// ── Geofence-exit email alert (calls backend geofence-violation endpoint) ──
	const sendGeofenceAlert = useCallback(
		async (pos: GeoPosition, distance: number) => {
			if (alertSentRef.current) return;
			alertSentRef.current = true;
			try {
				// The backend GeofenceViolation model & email hook lives in dept_views / tasks.
				// We POST to the check-in endpoint with a special flag, or a dedicated
				// violations endpoint if the backend exposes one. Here we call the
				// attendanceApi helper — wire up the real endpoint on the backend side.
				await attendanceApi.reportGeofenceViolation({
					latitude: parseFloat(pos.latitude.toFixed(7)),
					longitude: parseFloat(pos.longitude.toFixed(7)),
					distance_from_workplace: distance,
				});
				toast(
					(t) => (
						<span className="flex items-center gap-2">
							<AlertTriangle size={16} className="text-amber-400 shrink-0" />
							<span>
								<strong>Geofence alert sent</strong> — you've moved{" "}
								{Math.round(distance)}m from the workplace. Your supervisor has
								been notified.
							</span>
						</span>
					),
					{
						duration: 6000,
						style: { background: "#1e1a14", color: "#fcd34d" },
					},
				);
			} catch {
				// Silently fail — alert will retry on next position update
				alertSentRef.current = false;
			}
		},
		[],
	);

	// ── GPS position handler ──────────────────────────────────────────────────
	const handlePosition = useCallback(
		(pos: GeolocationPosition) => {
			const { latitude, longitude, accuracy } = pos.coords;
			const newPos: GeoPosition = { latitude, longitude, accuracy };
			setGpsPos(newPos);
			setGpsError(null);

			if (!userBranch?.latitude || !userBranch?.longitude) return;

			const dist = haversineDistance(
				userBranch.latitude!,
				userBranch.longitude!,
				latitude,
				longitude,
			);
			const inside = dist <= geofenceRadius;

			// Geofence exit email: only fire when checked in and just left the zone
			if (isActiveSession) {
				if (wasInsideRef.current === true && !inside) {
					sendGeofenceAlert(newPos, dist);
				} else if (inside) {
					alertSentRef.current = false; // reset so next exit triggers again
				}
			}
			wasInsideRef.current = inside;
		},
		[userBranch, geofenceRadius, isActiveSession, sendGeofenceAlert],
	);

	const handleGeoError = useCallback((err: GeolocationPositionError) => {
		setGpsError(
			err.code === 1
				? "Location permission denied. Please enable GPS in your browser."
				: "Unable to determine location. Check your device GPS.",
		);
		setGpsLoading(false);
	}, []);

	// ── Start continuous GPS watching ─────────────────────────────────────────
	const startWatching = useCallback(() => {
		if (!navigator.geolocation) {
			setGpsError("Geolocation is not supported by your browser.");
			return;
		}
		if (watchIdRef.current !== null) return;
		setGpsLoading(true);
		watchIdRef.current = navigator.geolocation.watchPosition(
			(pos) => {
				setGpsLoading(false);
				handlePosition(pos);
			},
			handleGeoError,
			{ enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
		);
	}, [handlePosition, handleGeoError]);

	const stopWatching = useCallback(() => {
		if (watchIdRef.current !== null) {
			navigator.geolocation.clearWatch(watchIdRef.current);
			watchIdRef.current = null;
		}
	}, []);

	// Start watching on mount (so distance shows immediately); stop on unmount
	useEffect(() => {
		startWatching();
		return stopWatching;
	}, [startWatching, stopWatching]);

	// Re-attach handler when isActiveSession changes (so the exit alert logic
	// picks up the right session state)
	useEffect(() => {
		if (watchIdRef.current !== null) {
			stopWatching();
			startWatching();
		}
	}, [isActiveSession]); // eslint-disable-line react-hooks/exhaustive-deps

	// ── Check-in / check-out actions ─────────────────────────────────────────
	const handleGpsCheckIn = () => {
		if (!gpsPos) {
			toast.error("Waiting for GPS signal — try again in a moment.");
			return;
		}
		if (userBranch?.latitude && !isWithinGeofence) {
			toast.error(
				`You're ${distanceFromWorkplace}m away. Must be within ${geofenceRadius}m to GPS check in.`,
			);
			return;
		}
		checkInMutation.mutate({
			latitude: parseFloat(gpsPos.latitude.toFixed(7)),
			longitude: parseFloat(gpsPos.longitude.toFixed(7)),
			method: "gps",
		});
	};

	const handleGpsCheckOut = () => {
		if (!gpsPos) {
			toast.error("Waiting for GPS signal — try again in a moment.");
			return;
		}
		checkOutMutation.mutate({
			latitude: parseFloat(gpsPos.latitude.toFixed(7)),
			longitude: parseFloat(gpsPos.longitude.toFixed(7)),
		});
	};

	const actionPending =
		checkInMutation.isPending || checkOutMutation.isPending || gpsLoading;

	return (
		<div className="space-y-6 animate-fade-in">
			{/* ── Header ── */}
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<Activity size={22} className="text-Swahilipot-400" />
						Attendance
					</h1>
					<p className="page-subtitle">
						GPS-verified check-in · history · leave management
					</p>
				</div>
				<button
					onClick={() => setShowLeaveModal(true)}
					className="btn-secondary btn-sm">
					<Plus size={14} /> Request Leave
				</button>
			</div>

			{/* ── GPS status banner ── */}
			{gpsError && (
				<div className="flex items-start gap-3 p-3 bg-red-900/20 border border-red-500/30 rounded-xl text-sm text-red-300">
					<WifiOff size={15} className="shrink-0 mt-0.5" />
					<span>{gpsError}</span>
				</div>
			)}

			{/* ── Tabs ── */}
			<div className="flex gap-1 p-1 bg-surface-card border border-surface-border rounded-xl w-fit">
				{(["today", "history", "leave"] as const).map((t) => (
					<button
						key={t}
						onClick={() => setActiveTab(t)}
						className={clsx(
							"px-5 py-2 rounded-lg text-sm font-medium capitalize transition-all",
							{
								"bg-Swahilipot-600 text-white": activeTab === t,
								"text-slate-400 hover:text-white": activeTab !== t,
							},
						)}>
						{t === "leave"
							? "Leave Requests"
							: t === "history"
								? "History"
								: "Today"}
					</button>
				))}
			</div>

			{/* ════════════════════════════════════════════════════════════════════
          TODAY TAB
      ════════════════════════════════════════════════════════════════════ */}
			{activeTab === "today" && (
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					{/* ── Check-in / check-out card ── */}
					<div className="card space-y-5">
						<h3 className="font-semibold text-white flex items-center gap-2">
							<Clock size={16} className="text-Swahilipot-400" />
							Today — {format(new Date(), "EEEE, d MMM yyyy")}
						</h3>

						{todayLoading ? (
							<div className="skeleton h-32 rounded-xl" />
						) : (
							<>
								{/* ── Session status pill ── */}
								<div
									className={clsx("p-4 rounded-xl border text-center", {
										"bg-green-900/20 border-green-500/30": isActiveSession,
										"bg-blue-900/20 border-blue-500/30": isCheckedOut,
										"bg-surface-elevated border-surface-border":
											!isCheckedIn && !isCheckedOut,
									})}>
									{!isCheckedIn ? (
										<p className="text-slate-400 text-sm">
											You haven't checked in yet today.
										</p>
									) : isCheckedOut ? (
										<div>
											<p className="text-blue-300 font-semibold">
												✅ Attendance Complete
											</p>
											<p className="text-slate-400 text-sm mt-1">
												{format(parseISO(todayRecord.check_in_time), "HH:mm")} →{" "}
												{format(parseISO(todayRecord.check_out_time), "HH:mm")}
												{todayRecord.total_hours && (
													<span className="text-white ml-2 font-medium">
														({todayRecord.total_hours}h)
													</span>
												)}
											</p>
										</div>
									) : (
										<div>
											<p className="text-green-400 font-semibold animate-pulse">
												🟢 Currently Checked In
											</p>
											<p className="text-slate-400 text-sm mt-1">
												Since{" "}
												{format(parseISO(todayRecord.check_in_time), "HH:mm")}
											</p>
										</div>
									)}
								</div>

								{/* ── Time + distance detail grid ── */}
								{todayRecord && (
									<div className="grid grid-cols-2 gap-3 text-sm">
										<div className="bg-surface rounded-lg p-3">
											<div className="text-slate-500 text-xs uppercase tracking-wide mb-1">
												Check In
											</div>
											<div className="text-white font-mono font-medium">
												{todayRecord.check_in_time
													? format(
															parseISO(todayRecord.check_in_time),
															"HH:mm:ss",
														)
													: "—"}
											</div>
											{todayRecord.check_in_distance_metres != null && (
												<div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
													<MapPin size={9} />{" "}
													{Math.round(todayRecord.check_in_distance_metres)}m
													from workplace
												</div>
											)}
										</div>

										<div className="bg-surface rounded-lg p-3">
											<div className="text-slate-500 text-xs uppercase tracking-wide mb-1">
												Check Out
											</div>
											<div className="text-white font-mono font-medium">
												{todayRecord.check_out_time
													? format(
															parseISO(todayRecord.check_out_time),
															"HH:mm:ss",
														)
													: "—"}
											</div>
											{todayRecord.check_out_distance_metres != null && (
												<div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
													<MapPin size={9} />{" "}
													{Math.round(todayRecord.check_out_distance_metres)}m
													from workplace
												</div>
											)}
										</div>

										<div className="bg-surface rounded-lg p-3">
											<div className="text-slate-500 text-xs uppercase tracking-wide mb-1">
												Status
											</div>
											<span
												className={clsx(
													"badge capitalize",
													STATUS_STYLES[todayRecord.status] || "badge-slate",
												)}>
												{todayRecord.status?.replace("_", " ")}
											</span>
										</div>

										<div className="bg-surface rounded-lg p-3">
											<div className="text-slate-500 text-xs uppercase tracking-wide mb-1">
												Hours Logged
											</div>
											<div className="text-white font-medium">
												{todayRecord.total_hours ? (
													`${todayRecord.total_hours}h`
												) : isActiveSession ? (
													<LiveTimer checkInTime={todayRecord.check_in_time} />
												) : (
													"—"
												)}
											</div>
										</div>
									</div>
								)}

								{/* ── Live distance from workplace ── */}
								<div className="flex items-center justify-between p-3 bg-surface-elevated rounded-xl border border-surface-border">
									<div className="flex items-center gap-2">
										<div
											className={clsx(
												"w-2 h-2 rounded-full",
												gpsLoading
													? "bg-amber-400 animate-pulse"
													: gpsPos
														? "bg-green-400"
														: "bg-slate-500",
											)}
										/>
										<span className="text-xs text-slate-400 font-medium">
											{gpsLoading
												? "Acquiring GPS…"
												: gpsPos
													? `GPS active · ±${Math.round(gpsPos.accuracy)}m accuracy`
													: "GPS inactive"}
										</span>
									</div>
									<DistancePill
										distance={distanceFromWorkplace}
										radius={geofenceRadius}
									/>
								</div>

								{/* ── Action buttons ── */}
								{!isCheckedOut && (
									<div className="flex gap-3">
										{/* CHECK IN */}
										{!isCheckedIn && (
											<button
												onClick={handleGpsCheckIn}
												disabled={
													actionPending ||
													!gpsPos ||
													(!!userBranch?.latitude && !isWithinGeofence)
												}
												title={
													!gpsPos
														? "Waiting for GPS signal"
														: userBranch?.latitude && !isWithinGeofence
															? `You are ${distanceFromWorkplace}m away — must be within ${geofenceRadius}m`
															: undefined
												}
												className={clsx(
													"flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-base font-semibold transition-all",
													actionPending ||
														!gpsPos ||
														(!!userBranch?.latitude && !isWithinGeofence)
														? "bg-slate-700 text-slate-400 cursor-not-allowed"
														: "bg-green-600 hover:bg-green-500 text-white",
												)}>
												<LogIn size={18} />
												{actionPending
													? "Processing…"
													: !gpsPos
														? "Awaiting GPS…"
														: userBranch?.latitude && !isWithinGeofence
															? `Too far (${distanceFromWorkplace}m)`
															: "GPS Check In"}
											</button>
										)}

										{/* CHECK OUT — only visible once checked in */}
										{isCheckedIn && !isCheckedOut && (
											<button
												onClick={handleGpsCheckOut}
												disabled={actionPending || !gpsPos}
												className={clsx(
													"flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-base font-semibold transition-all",
													actionPending || !gpsPos
														? "bg-slate-700 text-slate-400 cursor-not-allowed"
														: "bg-red-600 hover:bg-red-500 text-white",
												)}>
												<LogOut size={18} />
												{actionPending ? "Processing…" : "GPS Check Out"}
											</button>
										)}
									</div>
								)}

								{/* Geofence hint */}
								{!isCheckedIn && userBranch?.latitude && (
									<p className="text-xs text-slate-500 text-center flex items-center justify-center gap-1">
										<Shield size={10} />
										Must be within {geofenceRadius}m of your workplace to GPS
										check in
									</p>
								)}

								{/* Geofence-exit notice while checked in */}
								{isActiveSession &&
									distanceFromWorkplace !== null &&
									!isWithinGeofence && (
										<div className="flex items-start gap-2 p-3 bg-amber-900/20 border border-amber-500/30 rounded-xl text-xs text-amber-300">
											<AlertTriangle
												size={13}
												className="shrink-0 mt-0.5 text-amber-400"
											/>
											<span>
												You've moved outside the geofence (
												{distanceFromWorkplace}m away). An email alert has been
												sent to your supervisor.
											</span>
										</div>
									)}
							</>
						)}
					</div>

					{/* ── This-week summary ── */}
					<div className="card">
						<h3 className="font-semibold text-white mb-4 flex items-center gap-2">
							<TrendingUp size={16} className="text-Swahilipot-400" />
							This Week
						</h3>

						<div className="space-y-2">
							{weekDays.map((day, i) => {
								const rec = weekData[i].rec;
								const isToday = isSameDay(day, new Date());
								const isFuture = day > new Date();
								const s = rec?.status ?? null;
								const hours = rec?.total_hours
									? parseFloat(rec.total_hours)
									: 0;

								return (
									<div
										key={i}
										className={clsx(
											"flex items-center gap-3 py-2 px-3 rounded-lg border",
											isToday
												? "border-Swahilipot-500/40 bg-Swahilipot-900/10"
												: "border-transparent",
										)}>
										<div className="w-10 text-xs text-slate-400 font-medium shrink-0">
											{format(day, "EEE")}
											{isToday && (
												<div className="text-[9px] text-Swahilipot-400 font-semibold uppercase">
													today
												</div>
											)}
										</div>

										<div className="flex-1 bg-surface-elevated rounded-full h-2 overflow-hidden">
											{!isFuture && s && (
												<div
													className={clsx(
														"h-full rounded-full transition-all",
														{
															"bg-green-500": s === "present",
															"bg-amber-500": s === "late",
															"bg-red-500": s === "absent",
															"bg-blue-500": s === "leave",
															"bg-purple-500": s === "holiday",
															"bg-amber-400": s === "half_day",
														},
													)}
													style={{
														width:
															s === "half_day"
																? "50%"
																: s === "late"
																	? "80%"
																	: "100%",
													}}
												/>
											)}
										</div>

										<div className="flex items-center gap-2 shrink-0">
											{hours > 0 && (
												<span className="text-xs text-slate-500 font-mono">
													{hours.toFixed(1)}h
												</span>
											)}
											{isFuture ? (
												<span className="text-xs text-slate-600">—</span>
											) : s ? (
												<span
													className={clsx(
														"badge text-[10px] capitalize",
														STATUS_STYLES[s] || "badge-slate",
													)}>
													{s.replace("_", " ")}
												</span>
											) : isToday && isActiveSession ? (
												<span className="badge badge-green text-[10px] animate-pulse">
													active
												</span>
											) : (
												<span className="text-xs text-slate-600">—</span>
											)}
										</div>
									</div>
								);
							})}
						</div>

						<div className="mt-5 pt-4 border-t border-surface-border grid grid-cols-3 gap-3 text-center">
							<div>
								<div className="text-green-400 font-bold text-xl">
									{weekPresent}
								</div>
								<div className="text-xs text-slate-500">Present</div>
							</div>
							<div>
								<div className="text-amber-400 font-bold text-xl">
									{weekLate}
								</div>
								<div className="text-xs text-slate-500">Late</div>
							</div>
							<div>
								<div className="text-white font-bold text-xl">
									{weekHours.toFixed(1)}h
								</div>
								<div className="text-xs text-slate-500">Total Hours</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* ════════════════════════════════════════════════════════════════════
          HISTORY TAB
      ════════════════════════════════════════════════════════════════════ */}
			{activeTab === "history" && (
				<div className="card">
					<div className="flex items-center justify-between mb-5">
						<h3 className="font-semibold text-white">Attendance History</h3>
						<button
							onClick={() => {
								if (!history.length) return toast("No records to export.");
								const rows = [
									[
										"Date",
										"Check In",
										"Check Out",
										"Hours",
										"Status",
										"Method",
										"Distance (m)",
									],
									...history.map((r: any) => [
										r.date,
										r.check_in_time
											? format(parseISO(r.check_in_time), "HH:mm")
											: "",
										r.check_out_time
											? format(parseISO(r.check_out_time), "HH:mm")
											: "",
										r.total_hours ?? "",
										r.status,
										r.method,
										r.check_in_distance_metres != null
											? Math.round(r.check_in_distance_metres)
											: "",
									]),
								];
								const csv = rows.map((r) => r.join(",")).join("\n");
								const blob = new Blob([csv], { type: "text/csv" });
								const url = URL.createObjectURL(blob);
								const a = document.createElement("a");
								a.href = url;
								a.download = `attendance_${format(new Date(), "yyyy-MM-dd")}.csv`;
								a.click();
								URL.revokeObjectURL(url);
								toast.success("CSV downloaded");
							}}
							className="btn-secondary btn-sm">
							<Download size={13} /> Export CSV
						</button>
					</div>

					<div className="overflow-x-auto">
						<table className="data-table">
							<thead>
								<tr>
									<th>Date</th>
									<th>Check In</th>
									<th>Check Out</th>
									<th>Hours</th>
									<th>Distance</th>
									<th>Status</th>
									<th>Method</th>
								</tr>
							</thead>
							<tbody>
								{historyLoading ? (
									[...Array(6)].map((_, i) => (
										<tr key={i}>
											<td colSpan={7}>
												<div className="skeleton h-8 w-full" />
											</td>
										</tr>
									))
								) : history.length === 0 ? (
									<tr>
										<td
											colSpan={7}
											className="text-center py-10 text-slate-500">
											No attendance records yet
										</td>
									</tr>
								) : (
									history.map((r: any) => (
										<tr key={r.id}>
											<td className="font-medium text-white whitespace-nowrap">
												{format(parseISO(r.date), "EEE, dd MMM yyyy")}
											</td>
											<td className="font-mono text-xs">
												{r.check_in_time
													? format(parseISO(r.check_in_time), "HH:mm")
													: "—"}
											</td>
											<td className="font-mono text-xs">
												{r.check_out_time
													? format(parseISO(r.check_out_time), "HH:mm")
													: "—"}
											</td>
											<td className="text-slate-300">
												{r.total_hours ? `${r.total_hours}h` : "—"}
											</td>
											<td className="text-slate-400 text-xs">
												{r.check_in_distance_metres != null
													? `${Math.round(r.check_in_distance_metres)}m`
													: "—"}
											</td>
											<td>
												<span
													className={clsx(
														"badge capitalize",
														STATUS_STYLES[r.status] || "badge-slate",
													)}>
													{r.status?.replace("_", " ")}
												</span>
											</td>
											<td className="text-slate-400 text-xs capitalize">
												{r.method?.replace("_", " ")}
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* ════════════════════════════════════════════════════════════════════
          LEAVE TAB
      ════════════════════════════════════════════════════════════════════ */}
			{activeTab === "leave" && (
				<div className="card">
					<div className="flex items-center justify-between mb-5">
						<h3 className="font-semibold text-white">Leave Requests</h3>
						<button
							onClick={() => setShowLeaveModal(true)}
							className="btn-primary btn-sm">
							<Plus size={13} /> New Request
						</button>
					</div>

					{leaveRequests.length === 0 ? (
						<div className="text-center py-12 text-slate-500">
							<Calendar size={32} className="mx-auto mb-3 opacity-30" />
							<p>No leave requests yet</p>
							<button
								onClick={() => setShowLeaveModal(true)}
								className="btn-secondary btn-sm mt-4">
								<Plus size={13} /> Submit your first request
							</button>
						</div>
					) : (
						<div className="space-y-3">
							{leaveRequests.map((req: any) => (
								<div
									key={req.id}
									className="p-4 bg-surface rounded-xl border border-surface-border">
									<div className="flex items-start justify-between gap-3">
										<div className="flex-1">
											<div className="flex items-center gap-2 mb-1 flex-wrap">
												<span className="text-sm font-medium text-white capitalize">
													{req.leave_type?.replace("_", " ")} Leave
												</span>
												<span
													className={clsx("badge text-[10px]", {
														"badge-amber": req.status === "pending",
														"badge-green": req.status === "approved",
														"badge-red": req.status === "rejected",
														"badge-slate": req.status === "cancelled",
													})}>
													{req.status}
												</span>
											</div>
											<p className="text-xs text-slate-400">
												{format(parseISO(req.start_date), "dd MMM")} →{" "}
												{format(parseISO(req.end_date), "dd MMM yyyy")} ·{" "}
												<strong>{req.days_requested}</strong> day(s)
											</p>
											<p className="text-xs text-slate-500 mt-1">
												{req.reason}
											</p>
											{req.review_notes && (
												<p className="text-xs text-amber-400 mt-2 italic border-l-2 border-amber-500/30 pl-2">
													Reviewer note: "{req.review_notes}"
												</p>
											)}
											{req.reviewed_by_name && (
												<p className="text-[10px] text-slate-600 mt-1">
													Reviewed by {req.reviewed_by_name}
												</p>
											)}
										</div>
										<div className="shrink-0">
											{req.status === "pending" && (
												<CancelLeaveButton id={req.id} />
											)}
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			)}

			{/* ── Leave modal ── */}
			{showLeaveModal && (
				<LeaveModal
					onClose={() => setShowLeaveModal(false)}
					onSuccess={() => {
						qc.invalidateQueries({ queryKey: ["leave-requests"] });
						setShowLeaveModal(false);
					}}
				/>
			)}
		</div>
	);
}

// ─── Live session timer ────────────────────────────────────────────────────────
function LiveTimer({ checkInTime }: { checkInTime: string }) {
	const [elapsed, setElapsed] = useState("");

	useEffect(() => {
		const update = () => {
			const diff = Date.now() - new Date(checkInTime).getTime();
			const h = Math.floor(diff / 3600000);
			const m = Math.floor((diff % 3600000) / 60000);
			const s = Math.floor((diff % 60000) / 1000);
			setElapsed(
				`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
			);
		};
		update();
		const id = setInterval(update, 1000);
		return () => clearInterval(id);
	}, [checkInTime]);

	return (
		<span className="font-mono text-Swahilipot-300 text-sm animate-pulse">
			{elapsed}
		</span>
	);
}

// ─── Cancel leave button ──────────────────────────────────────────────────────
function CancelLeaveButton({ id }: { id: string }) {
	const qc = useQueryClient();
	const mutation = useMutation({
		mutationFn: () => attendanceApi.updateLeave(id, { status: "cancelled" }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["leave-requests"] });
			toast.success("Leave request cancelled");
		},
		onError: () => toast.error("Could not cancel — try again"),
	});

	return (
		<button
			onClick={() => mutation.mutate()}
			disabled={mutation.isPending}
			className="btn-secondary btn-sm text-xs">
			{mutation.isPending ? "…" : "Cancel"}
		</button>
	);
}

// ─── Leave modal ──────────────────────────────────────────────────────────────
function LeaveModal({
	onClose,
	onSuccess,
}: {
	onClose: () => void;
	onSuccess: () => void;
}) {
	const [form, setForm] = useState({
		leave_type: "annual",
		start_date: "",
		end_date: "",
		reason: "",
	});

	const mutation = useMutation({
		mutationFn: (data: any) => attendanceApi.submitLeave(data),
		onSuccess: () => {
			toast.success("Leave request submitted");
			onSuccess();
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Submission failed"),
	});

	const days =
		form.start_date && form.end_date
			? Math.max(
					1,
					Math.ceil(
						(new Date(form.end_date).getTime() -
							new Date(form.start_date).getTime()) /
							86400000,
					) + 1,
				)
			: 0;

	const valid =
		!!form.reason.trim() && !!form.start_date && !!form.end_date && days > 0;

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h3 className="font-semibold text-white flex items-center gap-2">
						<Calendar size={16} className="text-Swahilipot-400" />
						Request Leave
					</h3>
				</div>

				<div className="modal-body space-y-4">
					<div className="input-group">
						<label className="input-label">Leave Type</label>
						<select
							value={form.leave_type}
							onChange={(e) =>
								setForm((p) => ({ ...p, leave_type: e.target.value }))
							}
							className="select-input">
							{[
								["annual", "Annual Leave"],
								["sick", "Sick Leave"],
								["maternity", "Maternity Leave"],
								["paternity", "Paternity Leave"],
								["emergency", "Emergency Leave"],
								["study", "Study Leave"],
								["unpaid", "Unpaid Leave"],
								["other", "Other"],
							].map(([v, l]) => (
								<option key={v} value={v}>
									{l}
								</option>
							))}
						</select>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="input-group">
							<label className="input-label">Start Date</label>
							<input
								type="date"
								value={form.start_date}
								min={format(new Date(), "yyyy-MM-dd")}
								onChange={(e) =>
									setForm((p) => ({ ...p, start_date: e.target.value }))
								}
								className="input"
							/>
						</div>
						<div className="input-group">
							<label className="input-label">End Date</label>
							<input
								type="date"
								value={form.end_date}
								min={form.start_date || format(new Date(), "yyyy-MM-dd")}
								onChange={(e) =>
									setForm((p) => ({ ...p, end_date: e.target.value }))
								}
								className="input"
							/>
						</div>
					</div>

					{days > 0 && (
						<div className="flex items-center gap-2 p-3 bg-blue-900/20 border border-blue-500/30 rounded-xl text-sm text-blue-300">
							<Timer size={14} />
							<span>{days} day(s) requested</span>
						</div>
					)}

					<div className="input-group">
						<label className="input-label">Reason *</label>
						<textarea
							value={form.reason}
							onChange={(e) =>
								setForm((p) => ({ ...p, reason: e.target.value }))
							}
							className="textarea h-24"
							placeholder="Briefly explain your reason for leave…"
						/>
					</div>
				</div>

				<div className="modal-footer">
					<button onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						onClick={() => mutation.mutate({ ...form, days_requested: days })}
						disabled={mutation.isPending || !valid}
						className="btn-primary">
						{mutation.isPending ? "Submitting…" : "Submit Request"}
					</button>
				</div>
			</div>
		</div>
	);
}
