// Nexus — Radio Schedule Page  (upgraded)
// • Create Slot modal mirrors Moodle-style "New event" form:
//     – Event title, Date, Description (rich-text via contenteditable),
//       Location, Duration (Without duration / Until / Duration in minutes),
//       Repeat this event / Repeat weekly count
//     – Live conflict check: if the selected time overlaps an existing slot
//       the banner turns red and the Submit button is disabled
// • Calendar cell click:
//     – Empty cell → opens Create Slot pre-filled with that date/time
//     – Occupied cell → opens Slot Detail modal with full info,
//       Cancel (delete) and Edit buttons
//     – Edit mode: every field becomes editable, button switches to "Update"
// • Submit Show Plan flow preserved
import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	format,
	parseISO,
	startOfWeek,
	addDays,
	isWithinInterval,
	areIntervalsOverlapping,
	addMinutes,
} from "date-fns";
import {
	Radio,
	Plus,
	ChevronLeft,
	ChevronRight,
	Mic2,
	AlertCircle,
	X,
	Edit2,
	Trash2,
	Save,
	Clock,
	MapPin,
	RefreshCw,
	CheckCircle2,
	XCircle,
	AlignLeft,
	Bell,
	CalendarPlus,
} from "lucide-react";
import { radioApi } from "../../services/api";
import { useAuthStore } from "../../services/api";
import toast from "react-hot-toast";
import clsx from "clsx";

// ─── Google Calendar URL builder ─────────────────────────────────────────────
function buildGCalUrl(slot: {
	show_name: string;
	start_datetime: string;
	end_datetime: string;
	description?: string;
	location?: string;
}): string {
	const fmt = (iso: string) =>
		new Date(iso)
			.toISOString()
			.replace(/[-:]/g, "")
			.replace(/\.\d{3}/, "");
	const p = new URLSearchParams({
		action: "TEMPLATE",
		text: slot.show_name,
		dates: `${fmt(slot.start_datetime)}/${fmt(slot.end_datetime)}`,
		details: slot.description || "",
		location: slot.location || "",
	});
	return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

// ─── Notify backend to send email + return gcal URL ─────────────────────────
async function sendSlotNotification(
	slot: any,
	presenterUserId: string,
	action: "created" | "updated" | "cancelled",
): Promise<void> {
	try {
		await radioApi.notifySlot({
			slot,
			presenter_user_id: presenterUserId,
			action,
		});
	} catch (err) {
		console.warn("Slot notification could not be sent:", err);
	}
}

// ─── colour map ──────────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
	news: "bg-red-500/20 text-red-300 border-red-500/30",
	music: "bg-blue-500/20 text-blue-300 border-blue-500/30",
	talk: "bg-purple-500/20 text-purple-300 border-purple-500/30",
	sport: "bg-green-500/20 text-green-300 border-green-500/30",
	drama: "bg-amber-500/20 text-amber-300 border-amber-500/30",
	education: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
	other: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

// ─── helpers ─────────────────────────────────────────────────────────────────
function toLocalDatetimeValue(date: Date) {
	return format(date, "yyyy-MM-dd'T'HH:mm");
}

function detectConflict(
	slots: any[],
	start: string,
	end: string,
	excludeId?: string,
): any | null {
	if (!start || !end) return null;
	const s = new Date(start);
	const e = new Date(end);
	if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return null;
	return (
		slots.find((slot: any) => {
			if (excludeId && slot.id === excludeId) return false;
			try {
				return areIntervalsOverlapping(
					{ start: s, end: e },
					{
						start: parseISO(slot.start_datetime),
						end: parseISO(slot.end_datetime),
					},
					{ inclusive: false },
				);
			} catch {
				return false;
			}
		}) || null
	);
}

// ─────────────────────────────────────────────────────────────────────────────
export default function RadioPage() {
	const { user } = useAuthStore();
	const qc = useQueryClient();

	// ── Reminder polling: two-tier alerts (60 min early-warning + 15 min urgent) ──
	// Tracks fired alerts per slot per tier so each fires exactly once per session.
	const firedAlerts = useRef<Map<string, Set<"early" | "urgent">>>(new Map());

	useEffect(() => {
		// Request browser notification permission once on mount
		if ("Notification" in window && Notification.permission === "default") {
			Notification.requestPermission();
		}

		const fireAlert = (slot: any, tier: "early" | "urgent") => {
			const gcalUrl: string = slot.gcal_url || buildGCalUrl(slot);
			const isUrgent = tier === "urgent";
			const label = isUrgent
				? `🔴 ON AIR IN ${slot.minutes_away} MIN — ${slot.show_name}`
				: `⏰ Reminder: "${slot.show_name}" in ${slot.minutes_away} min`;

			// In-app toast — urgent ones stay until dismissed
			toast(
				(t) => (
					<div className="flex flex-col gap-2 text-sm">
						<span
							className={
								isUrgent ? "font-bold text-red-300" : "font-semibold text-white"
							}>
							{label}
						</span>
						{slot.location && (
							<span className="text-xs text-slate-400 flex items-center gap-1">
								<MapPin size={10} /> {slot.location}
							</span>
						)}
						<div className="flex gap-2 mt-1">
							<a
								href={gcalUrl}
								target="_blank"
								rel="noreferrer"
								onClick={() => toast.dismiss(t.id)}
								className="text-xs text-blue-400 underline flex items-center gap-1">
								<CalendarPlus size={11} /> Add to Calendar
							</a>
							<button
								onClick={() => toast.dismiss(t.id)}
								className="text-xs text-slate-400 underline">
								Dismiss
							</button>
						</div>
					</div>
				),
				{
					duration: isUrgent ? Infinity : 30_000,
					style: {
						background: isUrgent ? "#2d0a0a" : "#1e2538",
						color: "#f1f5f9",
						border: isUrgent ? "1px solid #ef4444" : "1px solid #3b63f5",
						borderRadius: "12px",
					},
					icon: (
						<Bell
							size={16}
							className={isUrgent ? "text-red-400" : "text-blue-400"}
						/>
					),
				},
			);

			// Browser notification
			if ("Notification" in window && Notification.permission === "granted") {
				const n = new Notification(
					isUrgent
						? "🔴 Nexus Radio — Going Live Soon!"
						: "Nexus Radio Reminder",
					{
						body: isUrgent
							? `${slot.show_name} starts in ${slot.minutes_away} minutes. Head to ${slot.location || "the studio"}.`
							: `${slot.show_name} is on air in ${slot.minutes_away} minutes.`,
						icon: "/favicon.ico",
						requireInteraction: isUrgent,
					},
				);
				n.onclick = () => window.open(gcalUrl, "_blank");
			}
		};

		const poll = async () => {
			try {
				// Fetch all slots within 65 min so we never miss the 60-min threshold
				const { data } = await radioApi.upcomingReminders(65);
				for (const slot of data.results ?? []) {
					const tiers =
						firedAlerts.current.get(slot.id) ?? new Set<"early" | "urgent">();

					// Urgent alert: ≤15 min away
					if (slot.minutes_away <= 15 && !tiers.has("urgent")) {
						tiers.add("urgent");
						firedAlerts.current.set(slot.id, tiers);
						fireAlert(slot, "urgent");
					}
					// Early-warning alert: 16–65 min away
					else if (slot.minutes_away > 15 && !tiers.has("early")) {
						tiers.add("early");
						firedAlerts.current.set(slot.id, tiers);
						fireAlert(slot, "early");
					}
				}
			} catch {
				// silently swallow polling errors
			}
		};

		poll(); // run immediately on mount
		const interval = setInterval(poll, 60_000); // poll every 60 s
		return () => clearInterval(interval);
	}, []);

	const isAdmin = [
		"broadcast_admin",
		"broadcast_staff",
		"system_admin",
	].includes(user?.role || "");
	const isPresenter = user?.role === "presenter";

	const [weekStart, setWeekStart] = useState(() =>
		startOfWeek(new Date(), { weekStartsOn: 1 }),
	);

	// modal state
	const [createModal, setCreateModal] = useState<{
		open: boolean;
		prefillStart?: string;
	}>({ open: false });
	const [detailModal, setDetailModal] = useState<{ slot: any } | null>(null);
	const [showPlanModal, setShowPlanModal] = useState<any>(null);

	const weekEnd = addDays(weekStart, 6);

	const { data: slots = [], isLoading } = useQuery({
		queryKey: ["radio-schedule", weekStart],
		queryFn: () =>
			radioApi
				.schedule({
					start: format(weekStart, "yyyy-MM-dd"),
					end: format(weekEnd, "yyyy-MM-dd"),
				})
				.then((r) => r.data.results || r.data),
		refetchInterval: 60_000,
	});

	const { data: mySlots = [] } = useQuery({
		queryKey: ["my-radio-schedule"],
		queryFn: () => radioApi.mySchedule().then((r) => r.data),
		enabled: isPresenter,
	});

	const submitPlanMutation = useMutation({
		mutationFn: ({ id, show_plan }: any) =>
			radioApi.submitShowPlan(id, { show_plan }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["radio-schedule"] });
			setShowPlanModal(null);
			toast.success("Show plan submitted!");
		},
	});

	const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
	const HOURS = Array.from({ length: 19 }, (_, i) => i + 5); // 05–23

	const getSlotsForDayHour = (day: Date, hour: number) =>
		(slots as any[]).filter((s: any) => {
			try {
				const d = parseISO(s.start_datetime);
				return (
					format(d, "yyyy-MM-dd") === format(day, "yyyy-MM-dd") &&
					d.getHours() === hour
				);
			} catch {
				return false;
			}
		});

	const handleCellClick = (e: React.MouseEvent, day: Date, hour: number) => {
		if (!isAdmin) return;
		e.stopPropagation();
		const daySlots = getSlotsForDayHour(day, hour);
		if (daySlots.length > 0) {
			// show detail for the first slot in this cell
			setTimeout(() => setDetailModal({ slot: daySlots[0] }), 0);
		} else {
			const dt = new Date(day);
			dt.setHours(hour, 0, 0, 0);
			setTimeout(
				() =>
					setCreateModal({
						open: true,
						prefillStart: toLocalDatetimeValue(dt),
					}),
				0,
			);
		}
	};

	return (
		<div className="space-y-6 animate-fade-in">
			{/* ── Header ─────────────────────────────────────────────────────── */}
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<Radio size={22} className="text-Swahilipot-400" />
						Radio Schedule
					</h1>
					<p className="page-subtitle">
						Conflict-free broadcast scheduling and presenter portal
					</p>
				</div>
				{isAdmin && (
					<button
						onClick={() => setCreateModal({ open: true })}
						className="btn-primary">
						<Plus size={15} />
						Create Slot
					</button>
				)}
			</div>

			{/* ── Presenter upcoming slots ────────────────────────────────────── */}
			{isPresenter && (mySlots as any[]).length > 0 && (
				<div className="card border-Swahilipot-500/20">
					<h3 className="font-semibold text-white mb-3 flex items-center gap-2">
						<Mic2 size={15} className="text-Swahilipot-400" /> My Upcoming Slots
					</h3>
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
						{(mySlots as any[]).slice(0, 3).map((slot: any) => (
							<div
								key={slot.id}
								onClick={() => setDetailModal({ slot })}
								className="p-3 bg-surface rounded-xl border border-surface-border cursor-pointer hover:border-Swahilipot-500/40 transition-colors">
								<div className="font-medium text-white text-sm">
									{slot.show_name}
								</div>
								<div className="text-xs text-slate-400 mt-0.5">
									{format(parseISO(slot.start_datetime), "EEE dd MMM, HH:mm")} —{" "}
									{format(parseISO(slot.end_datetime), "HH:mm")}
								</div>
								<div className="text-xs text-slate-500">
									{slot.frequency_name}
								</div>
								<div className="flex items-center justify-between mt-2">
									{!slot.show_plan ? (
										<span className="badge-amber text-[10px] flex items-center gap-1">
											<AlertCircle size={9} /> Plan needed
										</span>
									) : (
										<span className="badge-green text-[10px]">
											Plan submitted
										</span>
									)}
									<div className="flex items-center gap-1.5">
										<a
											href={buildGCalUrl(slot)}
											target="_blank"
											rel="noreferrer"
											onClick={(e) => e.stopPropagation()}
											title="Add to Google Calendar"
											className="text-slate-400 hover:text-blue-400 transition-colors">
											<CalendarPlus size={13} />
										</a>
										{!slot.show_plan && (
											<button
												onClick={(e) => {
													e.stopPropagation();
													setShowPlanModal(slot);
												}}
												className="btn-primary btn-sm text-xs">
												Submit Plan
											</button>
										)}
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* ── Week navigation ─────────────────────────────────────────────── */}
			<div className="flex items-center justify-between">
				<button
					onClick={() => setWeekStart((d) => addDays(d, -7))}
					className="btn-secondary btn-sm">
					<ChevronLeft size={14} />
				</button>
				<span className="text-sm font-semibold text-white">
					{format(weekStart, "dd MMM")} — {format(weekEnd, "dd MMM yyyy")}
				</span>
				<button
					onClick={() => setWeekStart((d) => addDays(d, 7))}
					className="btn-secondary btn-sm">
					<ChevronRight size={14} />
				</button>
			</div>

			{/* ── Weekly grid ─────────────────────────────────────────────────── */}
			<div className="card overflow-x-auto">
				<div
					className="grid min-w-[700px]"
					style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
					{/* Header row */}
					<div className="py-2" />
					{days.map((day) => {
						const isToday =
							format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
						return (
							<div
								key={day.toISOString()}
								className={clsx(
									"py-2 px-2 text-center border-l border-surface-border",
									isToday && "bg-Swahilipot-600/10",
								)}>
								<div className="text-xs text-slate-400 uppercase tracking-wide">
									{format(day, "EEE")}
								</div>
								<div
									className={clsx("text-sm font-bold mt-0.5", {
										"text-Swahilipot-400": isToday,
										"text-white": !isToday,
									})}>
									{format(day, "d")}
								</div>
							</div>
						);
					})}

					{/* Hour rows */}
					{HOURS.map((hour) => (
						<div key={hour} className="contents">
							<div className="py-3 pr-2 text-right text-[10px] text-slate-600 border-t border-surface-border/30">
								{hour.toString().padStart(2, "0")}:00
							</div>
							{days.map((day) => {
								const cellSlots = getSlotsForDayHour(day, hour);
								const hasSlots = cellSlots.length > 0;
								return (
									<div
										key={day.toISOString() + hour}
										onClick={(e) => handleCellClick(e, day, hour)}
										className={clsx(
											"border-t border-l border-surface-border/30 min-h-[40px] p-0.5 transition-colors",
											isAdmin &&
												!hasSlots &&
												"cursor-pointer hover:bg-Swahilipot-600/5",
											isAdmin && hasSlots && "cursor-pointer",
										)}>
										{cellSlots.map((slot: any) => (
											<button
												key={slot.id}
												onClick={(e) => {
													e.stopPropagation();
													setDetailModal({ slot });
												}}
												className={clsx(
													"w-full text-left p-1.5 rounded text-[10px] border font-medium leading-tight mb-0.5 hover:opacity-80 transition-opacity",
													TYPE_COLORS[slot.show_type] || TYPE_COLORS.other,
												)}>
												<div className="truncate font-semibold">
													{slot.show_name}
												</div>
												<div className="opacity-70">
													{format(parseISO(slot.start_datetime), "HH:mm")}–
													{format(parseISO(slot.end_datetime), "HH:mm")}
												</div>
												<div className="opacity-60 truncate">
													{slot.presenter_name}
												</div>
												{!slot.show_plan && (
													<div className="text-amber-400 opacity-90">
														⚠ No plan
													</div>
												)}
											</button>
										))}
									</div>
								);
							})}
						</div>
					))}
				</div>
			</div>

			{/* ── Slot detail modal ───────────────────────────────────────────── */}
			{detailModal && (
				<SlotDetailModal
					slot={detailModal.slot}
					allSlots={slots as any[]}
					isAdmin={isAdmin}
					isPresenter={isPresenter}
					currentUser={user}
					onClose={() => setDetailModal(null)}
					onDeleted={() => {
						qc.invalidateQueries({ queryKey: ["radio-schedule"] });
						setDetailModal(null);
					}}
					onUpdated={() => {
						qc.invalidateQueries({ queryKey: ["radio-schedule"] });
						setDetailModal(null);
					}}
					onSubmitPlan={(slot: any) => {
						setDetailModal(null);
						setShowPlanModal(slot);
					}}
				/>
			)}

			{/* ── Submit show plan modal ──────────────────────────────────────── */}
			{showPlanModal && (
				<div className="modal-backdrop" onClick={() => setShowPlanModal(null)}>
					<div className="modal-box" onClick={(e) => e.stopPropagation()}>
						<div className="modal-header">
							<h3 className="font-semibold text-white">
								Submit Show Plan — {showPlanModal.show_name}
							</h3>
						</div>
						<ShowPlanForm
							slot={showPlanModal}
							onSubmit={(plan: string) =>
								submitPlanMutation.mutate({
									id: showPlanModal.id,
									show_plan: plan,
								})
							}
							isPending={submitPlanMutation.isPending}
							onClose={() => setShowPlanModal(null)}
						/>
					</div>
				</div>
			)}

			{/* ── Create slot modal ───────────────────────────────────────────── */}
			{createModal.open && (
				<CreateSlotModal
					prefillStart={createModal.prefillStart}
					allSlots={slots as any[]}
					onClose={() => setCreateModal({ open: false })}
					onSuccess={() => {
						qc.invalidateQueries({ queryKey: ["radio-schedule"] });
						setCreateModal({ open: false });
					}}
				/>
			)}
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Slot Detail Modal — view / edit / cancel (delete)
// ─────────────────────────────────────────────────────────────────────────────
function SlotDetailModal({
	slot: initialSlot,
	allSlots,
	isAdmin,
	isPresenter,
	currentUser,
	onClose,
	onDeleted,
	onUpdated,
	onSubmitPlan,
}: any) {
	const [isEditing, setIsEditing] = useState(false);
	const [form, setForm] = useState({
		show_name: initialSlot.show_name || "",
		frequency: initialSlot.frequency || "",
		frequency_name: initialSlot.frequency_name || "",
		show_type: initialSlot.show_type || "other",
		start_datetime: initialSlot.start_datetime
			? toLocalDatetimeValue(parseISO(initialSlot.start_datetime))
			: "",
		end_datetime: initialSlot.end_datetime
			? toLocalDatetimeValue(parseISO(initialSlot.end_datetime))
			: "",
		presenter: initialSlot.presenter || "",
		presenter_name: initialSlot.presenter_name || "",
		notes: initialSlot.notes || "",
		status: initialSlot.status || "scheduled",
	});

	const conflict = useMemo(
		() =>
			isEditing
				? detectConflict(
						allSlots,
						form.start_datetime,
						form.end_datetime,
						initialSlot.id,
					)
				: null,
		[form.start_datetime, form.end_datetime, isEditing],
	);

	const updateMutation = useMutation({
		mutationFn: (data: any) => radioApi.updateSlot(initialSlot.id, data),
		onSuccess: (_, variables: any) => {
			toast.success("Slot updated!");
			// Notify the presenter about the updated slot
			const presenterId = variables.presenter || initialSlot.presenter;
			if (presenterId) {
				const gcalUrl = buildGCalUrl({
					show_name: variables.show_name || initialSlot.show_name,
					start_datetime: variables.start_datetime,
					end_datetime: variables.end_datetime,
					location: variables.location || initialSlot.location,
				});
				toast(
					(t) => (
						<div className="flex flex-col gap-1 text-sm">
							<span className="text-white font-medium">
								📧 Update alert sent to presenter
							</span>
							<a
								href={gcalUrl}
								target="_blank"
								rel="noreferrer"
								onClick={() => toast.dismiss(t.id)}
								className="text-blue-400 underline text-xs flex items-center gap-1">
								<CalendarPlus size={11} /> Add to Google Calendar
							</a>
						</div>
					),
					{
						duration: 8000,
						style: {
							background: "#1e2538",
							color: "#f1f5f9",
							border: "1px solid #252d42",
							borderRadius: "12px",
						},
					},
				);
				sendSlotNotification(
					{ ...initialSlot, ...variables },
					presenterId,
					"updated",
				);
			}
			onUpdated();
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Update failed"),
	});

	const deleteMutation = useMutation({
		mutationFn: () => radioApi.deleteSlot(initialSlot.id),
		onSuccess: () => {
			toast.success("Slot cancelled.");
			// Notify presenter of cancellation
			if (initialSlot.presenter) {
				sendSlotNotification(
					initialSlot,
					initialSlot.presenter,
					"cancelled" as any,
				);
			}
			onDeleted();
		},
		onError: () => toast.error("Failed to cancel slot"),
	});

	const handleUpdate = () => {
		if (conflict) return;
		updateMutation.mutate({
			...form,
			start_datetime: new Date(form.start_datetime).toISOString(),
			end_datetime: new Date(form.end_datetime).toISOString(),
		});
	};

	const [confirmDelete, setConfirmDelete] = useState(false);

	const slot = initialSlot;

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div
				className="modal-box max-w-lg w-full"
				onClick={(e) => e.stopPropagation()}>
				{/* Header */}
				<div className="modal-header">
					<div className="flex items-start gap-3 flex-1 min-w-0">
						<div className="min-w-0">
							{isEditing ? (
								<input
									value={form.show_name}
									onChange={(e) =>
										setForm((f) => ({ ...f, show_name: e.target.value }))
									}
									className="input text-base font-semibold text-white w-full"
								/>
							) : (
								<h3 className="font-semibold text-white text-base truncate">
									{slot.show_name}
								</h3>
							)}
							<p className="text-xs text-slate-400 mt-0.5">
								{slot.frequency_name}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2 shrink-0">
						{isEditing ? (
							<select
								value={form.show_type}
								onChange={(e) =>
									setForm((f) => ({ ...f, show_type: e.target.value }))
								}
								className="select-input text-xs py-1">
								{Object.keys(TYPE_COLORS).map((t) => (
									<option key={t} value={t}>
										{t}
									</option>
								))}
							</select>
						) : (
							<span
								className={clsx(
									"badge capitalize",
									TYPE_COLORS[slot.show_type] || "",
								)}>
								{slot.show_type}
							</span>
						)}
						<button
							onClick={onClose}
							className="text-slate-400 hover:text-white transition-colors">
							<X size={18} />
						</button>
					</div>
				</div>

				{/* Conflict banner (edit mode) */}
				{isEditing && conflict && (
					<div className="mx-4 mt-3 rounded-lg bg-red-500/15 border border-red-500/40 px-4 py-2.5 flex items-center gap-2 text-sm text-red-300">
						<XCircle size={15} className="shrink-0" />
						<span>
							Time conflict with <strong>{conflict.show_name}</strong> (
							{format(parseISO(conflict.start_datetime), "HH:mm")}–
							{format(parseISO(conflict.end_datetime), "HH:mm")}). Adjust the
							times to proceed.
						</span>
					</div>
				)}

				<div className="modal-body space-y-4">
					{/* Time row */}
					<div className="grid grid-cols-2 gap-3 text-sm">
						<div className="bg-surface rounded-lg p-3">
							<div className="text-slate-500 text-xs mb-1 flex items-center gap-1">
								<Clock size={10} /> Start
							</div>
							{isEditing ? (
								<input
									type="datetime-local"
									value={form.start_datetime}
									onChange={(e) =>
										setForm((f) => ({ ...f, start_datetime: e.target.value }))
									}
									className="input text-xs py-1"
								/>
							) : (
								<div className="text-white">
									{format(parseISO(slot.start_datetime), "dd MMM yyyy, HH:mm")}
								</div>
							)}
						</div>
						<div className="bg-surface rounded-lg p-3">
							<div className="text-slate-500 text-xs mb-1 flex items-center gap-1">
								<Clock size={10} /> End
							</div>
							{isEditing ? (
								<input
									type="datetime-local"
									value={form.end_datetime}
									onChange={(e) =>
										setForm((f) => ({ ...f, end_datetime: e.target.value }))
									}
									className="input text-xs py-1"
								/>
							) : (
								<div className="text-white">
									{format(parseISO(slot.end_datetime), "HH:mm")}
								</div>
							)}
						</div>
					</div>

					{/* Presenter & Status */}
					<div className="grid grid-cols-2 gap-3 text-sm">
						<div className="bg-surface rounded-lg p-3">
							<div className="text-slate-500 text-xs mb-1 flex items-center gap-1">
								<Mic2 size={10} /> Presenter
							</div>
							{isEditing ? (
								<input
									value={form.presenter_name}
									onChange={(e) =>
										setForm((f) => ({ ...f, presenter_name: e.target.value }))
									}
									className="input text-xs py-1"
									placeholder="Name"
								/>
							) : (
								<div className="text-white">{slot.presenter_name}</div>
							)}
						</div>
						<div className="bg-surface rounded-lg p-3">
							<div className="text-slate-500 text-xs mb-1">Status</div>
							{isEditing ? (
								<select
									value={form.status}
									onChange={(e) =>
										setForm((f) => ({ ...f, status: e.target.value }))
									}
									className="select-input text-xs py-1">
									<option value="scheduled">Scheduled</option>
									<option value="live">Live</option>
									<option value="completed">Completed</option>
									<option value="cancelled">Cancelled</option>
								</select>
							) : (
								<div
									className={clsx("capitalize font-medium", {
										"text-green-400": slot.status === "live",
										"text-amber-400": slot.status === "scheduled",
										"text-red-400": slot.status === "cancelled",
										"text-slate-400": slot.status === "completed",
									})}>
									{slot.status}
								</div>
							)}
						</div>
					</div>

					{/* Notes */}
					<div className="bg-surface rounded-lg p-3 text-sm">
						<div className="text-slate-500 text-xs mb-1 flex items-center gap-1">
							<AlignLeft size={10} /> Notes
						</div>
						{isEditing ? (
							<textarea
								value={form.notes}
								onChange={(e) =>
									setForm((f) => ({ ...f, notes: e.target.value }))
								}
								rows={3}
								className="textarea text-xs"
								placeholder="Internal notes…"
							/>
						) : (
							<p className="text-slate-300 text-xs leading-relaxed">
								{slot.notes || (
									<span className="text-slate-600 italic">No notes.</span>
								)}
							</p>
						)}
					</div>

					{/* Show plan */}
					{slot.show_plan ? (
						<div className="bg-surface rounded-xl p-4">
							<div className="text-xs text-slate-400 uppercase tracking-wide mb-2">
								Show Plan
							</div>
							<p className="text-sm text-slate-200 leading-relaxed">
								{slot.show_plan}
							</p>
						</div>
					) : (
						<div className="alert alert-warning">
							<AlertCircle size={14} />
							<span>No show plan submitted yet.</span>
						</div>
					)}

					{/* Confirm delete prompt */}
					{confirmDelete && (
						<div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-sm">
							<p className="text-red-300 font-medium mb-3">
								Cancel this broadcast slot? This cannot be undone.
							</p>
							<div className="flex gap-2">
								<button
									onClick={() => deleteMutation.mutate()}
									disabled={deleteMutation.isPending}
									className="btn-danger btn-sm flex-1">
									{deleteMutation.isPending
										? "Cancelling…"
										: "Yes, cancel slot"}
								</button>
								<button
									onClick={() => setConfirmDelete(false)}
									className="btn-secondary btn-sm flex-1">
									Keep it
								</button>
							</div>
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="modal-footer">
					{/* Left-side actions */}
					<div className="flex gap-2">
						{isAdmin && !confirmDelete && !isEditing && (
							<button
								onClick={() => setConfirmDelete(true)}
								className="btn-secondary text-red-400 hover:text-red-300 flex items-center gap-1.5">
								<Trash2 size={14} /> Cancel Slot
							</button>
						)}
						{isAdmin && !isEditing && (
							<button
								onClick={() => setIsEditing(true)}
								className="btn-secondary flex items-center gap-1.5">
								<Edit2 size={14} /> Edit
							</button>
						)}
					</div>

					{/* Right-side actions */}
					<div className="flex gap-2">
						{/* Google Calendar link — view mode only */}
						{!isEditing && (
							<a
								href={buildGCalUrl({
									show_name: slot.show_name,
									start_datetime: slot.start_datetime,
									end_datetime: slot.end_datetime,
									location: slot.location,
									description: slot.notes,
								})}
								target="_blank"
								rel="noreferrer"
								className="btn-secondary flex items-center gap-1.5 text-blue-400 hover:text-blue-300">
								<CalendarPlus size={14} /> Add to Calendar
							</a>
						)}
						<button onClick={onClose} className="btn-secondary">
							Close
						</button>
						{isEditing && (
							<>
								<button
									onClick={() => {
										setIsEditing(false);
										// reset form
										setForm({
											show_name: initialSlot.show_name || "",
											frequency: initialSlot.frequency || "",
											frequency_name: initialSlot.frequency_name || "",
											show_type: initialSlot.show_type || "other",
											start_datetime: initialSlot.start_datetime
												? toLocalDatetimeValue(
														parseISO(initialSlot.start_datetime),
													)
												: "",
											end_datetime: initialSlot.end_datetime
												? toLocalDatetimeValue(
														parseISO(initialSlot.end_datetime),
													)
												: "",
											presenter: initialSlot.presenter || "",
											presenter_name: initialSlot.presenter_name || "",
											notes: initialSlot.notes || "",
											status: initialSlot.status || "scheduled",
										});
									}}
									className="btn-secondary">
									Discard
								</button>
								<button
									onClick={handleUpdate}
									disabled={!!conflict || updateMutation.isPending}
									className="btn-primary flex items-center gap-1.5">
									<Save size={14} />
									{updateMutation.isPending ? "Saving…" : "Update"}
								</button>
							</>
						)}
						{!isEditing &&
							isPresenter &&
							slot.presenter === currentUser?.id &&
							!slot.show_plan && (
								<button
									onClick={() => onSubmitPlan(slot)}
									className="btn-primary">
									Submit Show Plan
								</button>
							)}
					</div>
				</div>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Slot Modal — Moodle-style "New event" form
// ─────────────────────────────────────────────────────────────────────────────
type DurationMode = "none" | "until" | "minutes";

function CreateSlotModal({
	prefillStart,
	allSlots,
	onClose,
	onSuccess,
}: {
	prefillStart?: string;
	allSlots: any[];
	onClose: () => void;
	onSuccess: () => void;
}) {
	const { data: frequencies = [] } = useQuery({
		queryKey: ["radio-frequencies"],
		queryFn: () =>
			radioApi.frequencies().then((r) => r.data?.results ?? r.data ?? []),
	});
	const { data: shows = [] } = useQuery({
		queryKey: ["radio-shows"],
		queryFn: () =>
			radioApi.shows().then((r) => r.data?.results ?? r.data ?? []),
	});

	// form fields
	const [title, setTitle] = useState("");
	const [frequency, setFrequency] = useState("");
	const [show, setShow] = useState("");
	const [showType, setShowType] = useState("other");
	const [startDt, setStartDt] = useState(prefillStart || "");
	const [durationMode, setDurationMode] = useState<DurationMode>("none");
	const [untilDt, setUntilDt] = useState(prefillStart || "");
	const [durationMins, setDurationMins] = useState(60);
	const [repeatWeekly, setRepeatWeekly] = useState(false);
	const [repeatCount, setRepeatCount] = useState(1);
	const [location, setLocation] = useState("");
	const [description, setDescription] = useState("");
	const [presenter, setPresenter] = useState("");

	// compute effective end_datetime
	const endDt = useMemo(() => {
		if (durationMode === "until") return untilDt;
		if (durationMode === "minutes" && startDt) {
			const s = new Date(startDt);
			if (!isNaN(s.getTime()))
				return toLocalDatetimeValue(addMinutes(s, durationMins));
		}
		return "";
	}, [durationMode, untilDt, startDt, durationMins]);

	// conflict detection
	const conflict = useMemo(
		() => detectConflict(allSlots, startDt, endDt),
		[startDt, endDt, allSlots],
	);

	const hasConflict = !!conflict;
	const canSubmit =
		title.trim() && frequency && show && startDt && endDt && !hasConflict;

	const mutation = useMutation({
		mutationFn: (data: any) => radioApi.createSlot(data),
		onSuccess: (_, variables: any) => {
			toast.success("Slot created!");
			// Email + calendar alert for the assigned presenter
			if (variables.presenter) {
				const gcalUrl = buildGCalUrl({
					show_name: variables.show_name,
					start_datetime: variables.start_datetime,
					end_datetime: variables.end_datetime,
					description: variables.description,
					location: variables.location,
				});
				toast(
					(t) => (
						<div className="flex flex-col gap-1 text-sm">
							<span className="text-white font-medium">
								📧 Email alert sent to presenter
							</span>
							<a
								href={gcalUrl}
								target="_blank"
								rel="noreferrer"
								onClick={() => toast.dismiss(t.id)}
								className="text-blue-400 underline text-xs flex items-center gap-1">
								<CalendarPlus size={11} /> Add to Google Calendar
							</a>
						</div>
					),
					{
						duration: 8000,
						style: {
							background: "#1e2538",
							color: "#f1f5f9",
							border: "1px solid #252d42",
							borderRadius: "12px",
						},
					},
				);
				sendSlotNotification(variables, variables.presenter, "created");
			}
			onSuccess();
		},
		onError: (e: any) =>
			toast.error(
				e.response?.data?.detail ||
					"Slot creation failed — check for conflicts",
			),
	});

	const handleSubmit = () => {
		if (!canSubmit) return;
		mutation.mutate({
			show_name: title,
			frequency,
			show,
			show_type: showType,
			start_datetime: new Date(startDt).toISOString(),
			end_datetime: new Date(endDt).toISOString(),
			presenter,
			location,
			description,
			repeat_weekly: repeatWeekly,
			repeat_count: repeatWeekly ? repeatCount : 1,
		});
	};

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div
				className="modal-box max-w-xl w-full"
				onClick={(e) => e.stopPropagation()}>
				{/* Header */}
				<div className="modal-header">
					<h3 className="font-semibold text-white text-base flex items-center gap-2">
						<Radio size={16} className="text-Swahilipot-400" />
						New Radio Slot
					</h3>
					<button
						onClick={onClose}
						className="text-slate-400 hover:text-white transition-colors">
						<X size={18} />
					</button>
				</div>

				<div className="modal-body space-y-5">
					{/* Conflict / info banner — colors are hardcoded so they never
					    change when the user switches light/dark theme */}
					<div
						style={
							hasConflict
								? {
										background: "rgba(220,38,38,0.12)",
										border: "1px solid rgba(220,38,38,0.45)",
										color: "#b91c1c",
									}
								: {
										background: "rgba(37,99,235,0.10)",
										border: "1px solid rgba(37,99,235,0.40)",
										color: "#1d4ed8",
									}
						}
						className="rounded-lg px-4 py-2.5 flex items-center gap-2 text-sm transition-colors duration-300">
						{hasConflict ? (
							<>
								<XCircle size={15} className="shrink-0" />
								<span>
									Unable to create — time overlaps with{" "}
									<strong>{conflict!.show_name}</strong> (
									{format(parseISO(conflict!.start_datetime), "HH:mm")}–
									{format(parseISO(conflict!.end_datetime), "HH:mm")}). Adjust
									the start or duration.
								</span>
							</>
						) : (
							<>
								<CheckCircle2 size={15} className="shrink-0" />
								<span>
									The system will automatically check for scheduling conflicts.
								</span>
							</>
						)}
					</div>

					{/* Event title */}
					<div className="input-group">
						<label className="input-label">
							Event title <span className="text-red-400">*</span>
						</label>
						<input
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							className="input"
							placeholder="e.g. Morning Drive Show"
						/>
					</div>

					{/* Frequency + Show */}
					<div className="grid grid-cols-2 gap-4">
						<div className="input-group">
							<label className="input-label">
								Frequency <span className="text-red-400">*</span>
							</label>
							<select
								value={frequency}
								onChange={(e) => setFrequency(e.target.value)}
								className="select-input">
								<option value="">Select…</option>
								{(Array.isArray(frequencies) ? frequencies : []).map(
									(f: any) => (
										<option key={f.id} value={f.id}>
											{f.name} ({f.frequency_mhz} MHz)
										</option>
									),
								)}
							</select>
						</div>
						<div className="input-group">
							<label className="input-label">
								Show <span className="text-red-400">*</span>
							</label>
							<select
								value={show}
								onChange={(e) => setShow(e.target.value)}
								className="select-input">
								<option value="">Select…</option>
								{(Array.isArray(shows) ? shows : []).map((s: any) => (
									<option key={s.id} value={s.id}>
										{s.name}
									</option>
								))}
							</select>
						</div>
					</div>

					{/* Show type */}
					<div className="input-group">
						<label className="input-label">Show type</label>
						<select
							value={showType}
							onChange={(e) => setShowType(e.target.value)}
							className="select-input">
							{Object.keys(TYPE_COLORS).map((t) => (
								<option key={t} value={t}>
									{t.charAt(0).toUpperCase() + t.slice(1)}
								</option>
							))}
						</select>
					</div>

					{/* Date — Start */}
					<div className="input-group">
						<label className="input-label">
							Start <span className="text-red-400">*</span>
						</label>
						<input
							type="datetime-local"
							value={startDt}
							onChange={(e) => setStartDt(e.target.value)}
							className="input"
						/>
					</div>

					{/* Duration */}
					<div className="input-group space-y-2">
						<label className="input-label">Duration</label>
						<div className="space-y-2">
							{/* Without duration */}
							<label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
								<input
									type="radio"
									name="durMode"
									checked={durationMode === "none"}
									onChange={() => setDurationMode("none")}
									className="accent-Swahilipot-400"
								/>
								Without duration
							</label>

							{/* Until */}
							<label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
								<input
									type="radio"
									name="durMode"
									checked={durationMode === "until"}
									onChange={() => setDurationMode("until")}
									className="accent-Swahilipot-400"
								/>
								Until
							</label>
							{durationMode === "until" && (
								<div className="ml-6">
									<input
										type="datetime-local"
										value={untilDt}
										onChange={(e) => setUntilDt(e.target.value)}
										className="input"
									/>
								</div>
							)}

							{/* Duration in minutes */}
							<label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
								<input
									type="radio"
									name="durMode"
									checked={durationMode === "minutes"}
									onChange={() => setDurationMode("minutes")}
									className="accent-Swahilipot-400"
								/>
								Duration in minutes
							</label>
							{durationMode === "minutes" && (
								<div className="ml-6">
									<input
										type="number"
										min={5}
										max={480}
										value={durationMins}
										onChange={(e) => setDurationMins(Number(e.target.value))}
										className="input w-32"
									/>
								</div>
							)}
						</div>
					</div>

					{/* Location */}
					<div className="input-group">
						<label className="input-label flex items-center gap-1">
							<MapPin size={11} /> Location
						</label>
						<input
							value={location}
							onChange={(e) => setLocation(e.target.value)}
							className="input"
							placeholder="Studio A, OB Van…"
						/>
					</div>

					{/* Description */}
					<div className="input-group">
						<label className="input-label flex items-center gap-1">
							<AlignLeft size={11} /> Description
						</label>
						<textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={3}
							className="textarea"
							placeholder="Topics, guests, content notes…"
						/>
					</div>

					{/* Presenter */}
					<div className="input-group">
						<label className="input-label">
							Presenter User ID <span className="text-red-400">*</span>
						</label>
						<input
							value={presenter}
							onChange={(e) => setPresenter(e.target.value)}
							className="input"
							placeholder="User ID"
						/>
					</div>

					{/* Repeat */}
					<div className="space-y-2">
						<label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
							<input
								type="checkbox"
								checked={repeatWeekly}
								onChange={(e) => setRepeatWeekly(e.target.checked)}
								className="accent-Swahilipot-400 rounded"
							/>
							<RefreshCw size={13} className="text-slate-400" />
							Repeat this event
						</label>
						{repeatWeekly && (
							<div className="ml-6 flex items-center gap-3 text-sm text-slate-300">
								<span>Repeat weekly, creating altogether</span>
								<input
									type="number"
									min={1}
									max={52}
									value={repeatCount}
									onChange={(e) => setRepeatCount(Number(e.target.value))}
									className="input w-20 text-center"
								/>
								<span>occurrence{repeatCount !== 1 ? "s" : ""}</span>
							</div>
						)}
					</div>

					{/* Required note */}
					{(!title.trim() || !frequency || !show || !startDt || !endDt) && (
						<p className="text-xs text-red-400 flex items-center gap-1">
							<AlertCircle size={11} /> Required fields must be filled.
						</p>
					)}
				</div>

				{/* Footer */}
				<div className="modal-footer">
					<button onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						onClick={handleSubmit}
						disabled={!canSubmit || mutation.isPending}
						className={clsx(
							"btn-primary",
							(!canSubmit || mutation.isPending) &&
								"opacity-50 cursor-not-allowed",
						)}>
						{mutation.isPending ? "Saving…" : "Save"}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Show Plan Form
// ─────────────────────────────────────────────────────────────────────────────
function ShowPlanForm({ slot, onSubmit, isPending, onClose }: any) {
	const [plan, setPlan] = useState(slot.show_plan || "");
	return (
		<>
			<div className="modal-body space-y-4">
				<div className="card bg-surface/60 text-sm">
					<div className="text-slate-400">
						Show: <span className="text-white">{slot.show_name}</span>
					</div>
					<div className="text-slate-400">
						Time:{" "}
						<span className="text-white">
							{format(parseISO(slot.start_datetime), "dd MMM, HH:mm")} —{" "}
							{format(parseISO(slot.end_datetime), "HH:mm")}
						</span>
					</div>
				</div>
				<div className="input-group">
					<label className="input-label">
						Show Plan — Topics, Guests, Content Notes{" "}
						<span className="text-red-400">*</span>
					</label>
					<textarea
						value={plan}
						onChange={(e) => setPlan(e.target.value)}
						rows={6}
						className="textarea"
						placeholder="Outline your topics, any guests, music selections, news segments, etc…"
					/>
				</div>
			</div>
			<div className="modal-footer">
				<button onClick={onClose} className="btn-secondary">
					Cancel
				</button>
				<button
					disabled={!plan.trim() || isPending}
					onClick={() => onSubmit(plan)}
					className="btn-primary">
					{isPending ? "Submitting…" : "Submit Plan"}
				</button>
			</div>
		</>
	);
}
