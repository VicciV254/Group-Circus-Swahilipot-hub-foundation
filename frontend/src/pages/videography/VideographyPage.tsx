// NEXUS — Videography Booking Page
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { format, parseISO } from "date-fns";
import {
	Camera,
	Plus,
	Search,
	Eye,
	CheckCircle,
	XCircle,
	Upload,
	Play,
	Download,
	Calendar,
	Film,
	Clock,
} from "lucide-react";
import { videographyApi, equipmentApi } from "../../services/api";
import { useAuthStore } from "../../services/api";
import toast from "react-hot-toast";
import clsx from "clsx";

const STATUS_STYLES: Record<string, string> = {
	pending: "badge-amber",
	approved: "badge-green",
	declined: "badge-red",
	completed: "badge-blue",
	cancelled: "badge-slate",
};

export default function VideographyPage() {
	const { user } = useAuthStore();
	const qc = useQueryClient();
	const isAdmin = [
		"broadcast_admin",
		"broadcast_staff",
		"videographer",
		"system_admin",
	].includes(user?.role || "");
	const [activeTab, setActiveTab] = useState<"bookings" | "footage">(
		"bookings",
	);
	const [showBookingModal, setShowBookingModal] = useState(false);
	const [selectedBooking, setSelectedBooking] = useState<any>(null);
	const [search, setSearch] = useState("");

	const { data: bookingsRaw, isLoading } = useQuery({
		queryKey: ["videography-bookings"],
		queryFn: () => videographyApi.bookings().then((r) => r.data),
		refetchInterval: 60000,
	});

	const { data: footageRaw, isLoading: footageLoading } = useQuery({
		queryKey: ["videography-footage"],
		queryFn: () => videographyApi.footage().then((r) => r.data),
		enabled: activeTab === "footage",
	});

	const { data: equipmentRaw } = useQuery({
		queryKey: ["equipment"],
		queryFn: () =>
			equipmentApi.list({ status: "available" }).then((r) => r.data),
	});

	const bookings = Array.isArray(bookingsRaw)
		? bookingsRaw
		: (bookingsRaw?.results ?? []);
	const footage = Array.isArray(footageRaw)
		? footageRaw
		: (footageRaw?.results ?? []);
	const equipment = Array.isArray(equipmentRaw)
		? equipmentRaw
		: (equipmentRaw?.results ?? []);

	const approveMutation = useMutation({
		mutationFn: ({ id, action }: any) => videographyApi.approve(id, { action }),
		onSuccess: (_, { action }) => {
			qc.invalidateQueries({ queryKey: ["videography-bookings"] });
			toast.success(`Booking ${action}d`);
		},
		onError: () => toast.error("Action failed"),
	});

	const filtered = bookings.filter(
		(b: any) =>
			!search ||
			b.title?.toLowerCase().includes(search.toLowerCase()) ||
			b.requested_by_name?.toLowerCase().includes(search.toLowerCase()),
	);

	const stats = {
		total: bookings.length,
		pending: bookings.filter((b: any) => b.status === "pending").length,
		approved: bookings.filter((b: any) => b.status === "approved").length,
		completed: bookings.filter((b: any) => b.status === "completed").length,
	};

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<Camera size={22} className="text-nexus-400" /> Videography
					</h1>
					<p className="page-subtitle">
						Shoot bookings · production briefs · equipment reservation · footage
						archive
					</p>
				</div>
				<button
					onClick={() => setShowBookingModal(true)}
					className="btn-primary">
					<Plus size={15} /> Book a Shoot
				</button>
			</div>

			{/* Stats */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
				{[
					{ label: "Total Bookings", value: stats.total, color: "text-white" },
					{ label: "Pending", value: stats.pending, color: "text-amber-400" },
					{ label: "Approved", value: stats.approved, color: "text-green-400" },
					{
						label: "Completed",
						value: stats.completed,
						color: "text-blue-400",
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
				{(["bookings", "footage"] as const).map((tab) => (
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

			{/* ── BOOKINGS ── */}
			{activeTab === "bookings" && (
				<div className="card">
					<div className="flex gap-3 mb-5">
						<div className="relative flex-1">
							<Search
								size={13}
								className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
							/>
							<input
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search bookings..."
								className="input pl-8 py-2"
							/>
						</div>
					</div>

					{isLoading ? (
						[...Array(5)].map((_, i) => (
							<div key={i} className="skeleton h-16 rounded-xl mb-2" />
						))
					) : filtered.length === 0 ? (
						<div className="text-center py-12 text-slate-500">
							<Camera size={32} className="mx-auto mb-3 opacity-30" />
							<p>No bookings found</p>
							<button
								onClick={() => setShowBookingModal(true)}
								className="btn-primary btn-sm mt-3">
								<Plus size={13} /> Book a Shoot
							</button>
						</div>
					) : (
						<div className="space-y-3">
							{filtered.map((booking: any) => (
								<div
									key={booking.id}
									className="p-4 bg-surface rounded-xl border border-surface-border hover:border-nexus-500/30 transition-all cursor-pointer"
									onClick={() => setSelectedBooking(booking)}>
									<div className="flex items-start justify-between gap-4">
										<div className="flex items-start gap-3">
											<div
												className={clsx(
													"w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
													{
														"bg-amber-500/10": booking.status === "pending",
														"bg-green-500/10": booking.status === "approved",
														"bg-blue-500/10": booking.status === "completed",
														"bg-red-500/10": booking.status === "declined",
													},
												)}>
												<Camera
													size={16}
													className={clsx({
														"text-amber-400": booking.status === "pending",
														"text-green-400": booking.status === "approved",
														"text-blue-400": booking.status === "completed",
														"text-red-400": booking.status === "declined",
													})}
												/>
											</div>
											<div>
												<div className="font-medium text-white text-sm">
													{booking.title || "Untitled Shoot"}
												</div>
												<div className="text-xs text-slate-400 mt-0.5">
													Requested by {booking.requested_by_name || "—"} ·{" "}
													{booking.shoot_date
														? format(
																parseISO(booking.shoot_date),
																"dd MMM yyyy",
															)
														: "—"}
												</div>
												{booking.location && (
													<div className="text-xs text-slate-500 mt-0.5">
														📍 {booking.location}
													</div>
												)}
											</div>
										</div>
										<div className="flex items-center gap-2 shrink-0">
											<span
												className={clsx(
													"badge text-[10px]",
													STATUS_STYLES[booking.status] || "badge-slate",
												)}>
												{booking.status}
											</span>
											{isAdmin && booking.status === "pending" && (
												<div
													className="flex gap-1.5"
													onClick={(e) => e.stopPropagation()}>
													<button
														onClick={() =>
															approveMutation.mutate({
																id: booking.id,
																action: "approve",
															})
														}
														className="btn-success btn-sm p-1.5">
														<CheckCircle size={12} />
													</button>
													<button
														onClick={() =>
															approveMutation.mutate({
																id: booking.id,
																action: "decline",
															})
														}
														className="btn-danger btn-sm p-1.5">
														<XCircle size={12} />
													</button>
												</div>
											)}
										</div>
									</div>
									{booking.production_brief && (
										<p className="text-xs text-slate-400 mt-2 ml-13 line-clamp-2 pl-13">
											{booking.production_brief}
										</p>
									)}
								</div>
							))}
						</div>
					)}
				</div>
			)}

			{/* ── FOOTAGE ── */}
			{activeTab === "footage" && (
				<div className="card">
					<div className="flex items-center justify-between mb-5">
						<h3 className="font-semibold text-white">Footage Archive</h3>
					</div>
					{footageLoading ? (
						<div className="skeleton h-32 rounded-xl" />
					) : footage.length === 0 ? (
						<div className="text-center py-12 text-slate-500">
							<Film size={32} className="mx-auto mb-3 opacity-30" />
							<p>No footage archived yet</p>
						</div>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{footage.map((item: any) => (
								<div
									key={item.id}
									className="bg-surface rounded-xl border border-surface-border overflow-hidden">
									<div className="h-32 bg-surface-elevated flex items-center justify-center">
										<Film size={28} className="text-slate-600" />
									</div>
									<div className="p-3">
										<div className="font-medium text-white text-sm truncate">
											{item.filename || item.title}
										</div>
										<div className="text-xs text-slate-500 mt-0.5">
											{item.file_size_mb && item.file_size_mb + " MB · "}
											{item.created_at &&
												format(parseISO(item.created_at), "dd MMM yyyy")}
										</div>
										<div className="flex gap-2 mt-3">
											<button className="btn-secondary btn-sm flex-1 justify-center text-xs">
												<Play size={11} /> Preview
											</button>
											<button className="btn-secondary btn-sm p-1.5">
												<Download size={12} />
											</button>
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			)}

			{/* Booking Modal */}
			{showBookingModal && (
				<BookingModal
					equipment={equipment}
					onClose={() => setShowBookingModal(false)}
					onSuccess={() => {
						qc.invalidateQueries({ queryKey: ["videography-bookings"] });
						setShowBookingModal(false);
					}}
				/>
			)}

			{/* Detail Modal */}
			{selectedBooking && (
				<BookingDetailModal
					booking={selectedBooking}
					isAdmin={isAdmin}
					onClose={() => setSelectedBooking(null)}
					onApprove={(action: string) => {
						approveMutation.mutate({ id: selectedBooking.id, action });
						setSelectedBooking(null);
					}}
				/>
			)}
		</div>
	);
}

function BookingModal({ equipment, onClose, onSuccess }: any) {
	const { register, handleSubmit } = useForm();
	const mutation = useMutation({
		mutationFn: (data: any) => videographyApi.create(data),
		onSuccess: () => {
			toast.success("Shoot booking submitted!");
			onSuccess();
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Booking failed"),
	});
	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box max-w-2xl" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h3 className="font-semibold text-white flex items-center gap-2">
						<Camera size={16} className="text-nexus-400" /> Book a Shoot
					</h3>
				</div>
				<form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
					<div className="modal-body space-y-4">
						<div className="input-group">
							<label className="input-label">Project Title *</label>
							<input
								{...register("title", { required: true })}
								className="input"
								placeholder="e.g. Evening News B-Roll"
							/>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div className="input-group">
								<label className="input-label">Shoot Date *</label>
								<input
									type="date"
									{...register("shoot_date", { required: true })}
									className="input"
									min={format(new Date(), "yyyy-MM-dd")}
								/>
							</div>
							<div className="input-group">
								<label className="input-label">Duration (hours)</label>
								<input
									type="number"
									{...register("duration_hours")}
									className="input"
									placeholder="2"
									min={1}
									max={12}
								/>
							</div>
						</div>
						<div className="input-group">
							<label className="input-label">Location</label>
							<input
								{...register("location")}
								className="input"
								placeholder="e.g. Uhuru Park, Nairobi"
							/>
						</div>
						<div className="input-group">
							<label className="input-label">Production Brief *</label>
							<textarea
								{...register("production_brief", { required: true })}
								rows={4}
								className="textarea"
								placeholder="Describe the project purpose, output type, target audience, and any special requirements..."
							/>
						</div>
						<div className="input-group">
							<label className="input-label">Equipment Required</label>
							<div className="grid grid-cols-2 gap-2 mt-1 max-h-40 overflow-y-auto pr-1">
								{equipment.slice(0, 20).map((item: any) => (
									<label
										key={item.id}
										className="flex items-center gap-2 p-2 bg-surface rounded-lg cursor-pointer hover:bg-surface-elevated transition-colors text-sm text-slate-300">
										<input
											type="checkbox"
											value={item.id}
											{...register("equipment_list")}
											className="rounded"
										/>
										<span className="truncate">{item.name}</span>
										<span className="text-xs text-slate-500 shrink-0">
											{item.asset_tag}
										</span>
									</label>
								))}
								{equipment.length === 0 && (
									<p className="text-slate-500 text-sm col-span-2">
										No equipment available
									</p>
								)}
							</div>
						</div>
					</div>
					<div className="modal-footer">
						<button type="button" onClick={onClose} className="btn-secondary">
							Cancel
						</button>
						<button
							type="submit"
							disabled={mutation.isPending}
							className="btn-primary">
							{mutation.isPending ? "Submitting..." : "Submit Booking"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

function BookingDetailModal({ booking, isAdmin, onClose, onApprove }: any) {
	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box max-w-lg" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<div>
						<h3 className="font-semibold text-white">
							{booking.title || "Shoot Booking"}
						</h3>
						<span
							className={clsx(
								"badge text-[10px] mt-1",
								STATUS_STYLES[booking.status] || "badge-slate",
							)}>
							{booking.status}
						</span>
					</div>
				</div>
				<div className="modal-body space-y-4">
					<div className="grid grid-cols-2 gap-3 text-sm">
						{[
							["Requested By", booking.requested_by_name || "—"],
							[
								"Shoot Date",
								booking.shoot_date
									? format(parseISO(booking.shoot_date), "dd MMM yyyy")
									: "—",
							],
							[
								"Duration",
								booking.duration_hours ? booking.duration_hours + "h" : "—",
							],
							["Location", booking.location || "—"],
						].map(([label, value]) => (
							<div key={label} className="bg-surface rounded-lg p-3">
								<div className="text-slate-500 text-xs mb-0.5">{label}</div>
								<div className="text-white font-medium">{value}</div>
							</div>
						))}
					</div>
					{booking.production_brief && (
						<div className="bg-surface rounded-xl p-4">
							<div className="text-xs text-slate-400 uppercase tracking-wide mb-2">
								Production Brief
							</div>
							<p className="text-sm text-slate-200 leading-relaxed">
								{booking.production_brief}
							</p>
						</div>
					)}
				</div>
				<div className="modal-footer">
					<button onClick={onClose} className="btn-secondary">
						Close
					</button>
					{isAdmin && booking.status === "pending" && (
						<>
							<button
								onClick={() => onApprove("decline")}
								className="btn-danger">
								<XCircle size={14} /> Decline
							</button>
							<button
								onClick={() => onApprove("approve")}
								className="btn-success">
								<CheckCircle size={14} /> Approve
							</button>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
