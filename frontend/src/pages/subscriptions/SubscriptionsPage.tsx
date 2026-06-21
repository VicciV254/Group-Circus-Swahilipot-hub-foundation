// Nexus — Software Subscriptions
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { subscriptionsApi } from "../../services/api";
import { useAuthStore } from "../../services/api";
import toast from "react-hot-toast";
import clsx from "clsx";
import {
	AlertTriangle,
	Calendar,
	CheckCircle,
	Plus,
	RefreshCw,
	Shield,
	Users,
} from "lucide-react";

export default function SubscriptionsPage() {
	const { user } = useAuthStore();
	const qc = useQueryClient();
	const isAdmin = ["broadcast_admin", "ict", "system_admin"].includes(
		user?.role || "",
	);

	const { data: subsData, isLoading } = useQuery({
		queryKey: ["subscriptions"],
		queryFn: () => subscriptionsApi.list().then((r) => r.data),
		refetchInterval: 120000,
	});

	const subs = Array.isArray(subsData)
		? subsData
		: Array.isArray(subsData?.results)
			? subsData.results
			: [];

	const { data: seatRequestsData } = useQuery({
		queryKey: ["seat-requests"],
		queryFn: () => subscriptionsApi.seatRequests().then((r) => r.data),
		enabled: isAdmin,
	});

	const seatRequests = Array.isArray(seatRequestsData)
		? seatRequestsData
		: Array.isArray(seatRequestsData?.results)
			? seatRequestsData.results
			: [];

	const [showAddModal, setShowAddModal] = useState(false);
	const [requestModal, setRequestModal] = useState<any>(null);

	const expiring = subs.filter(
		(s: any) => s.days_until_expiry <= 7 && s.days_until_expiry >= 0,
	);
	const expired = subs.filter((s: any) => s.status === "expired");

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<Shield size={22} className="text-Nexus-400" />
						Software Subscriptions
					</h1>
					<p className="page-subtitle">
						Manage Adobe, Lightroom, and other software licences with seat
						allocation
					</p>
				</div>
				{isAdmin && (
					<button onClick={() => setShowAddModal(true)} className="btn-primary">
						<Plus size={15} />
						Add Licence
					</button>
				)}
			</div>

			{expiring.length > 0 && (
				<div className="alert alert-warning">
					<AlertTriangle size={15} className="shrink-0" />
					<span>
						<strong>
							{expiring.length} licence{expiring.length > 1 ? "s" : ""} expiring
							within 7 days.
						</strong>{" "}
						Renew immediately to avoid disruption.
					</span>
				</div>
			)}

			<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
				{[
					{ label: "Total Licences", value: subs.length, color: "text-white" },
					{
						label: "Active",
						value: subs.filter((s: any) => s.status === "active").length,
						color: "text-green-400",
					},
					{
						label: "Expiring Soon",
						value: expiring.length,
						color: "text-amber-400",
					},
					{ label: "Expired", value: expired.length, color: "text-red-400" },
				].map(({ label, value, color }) => (
					<div key={label} className="stat-card">
						<div className={clsx("stat-value", color)}>{value}</div>
						<div className="stat-label">{label}</div>
					</div>
				))}
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
				{isLoading
					? [...Array(6)].map((_, i) => (
							<div key={i} className="skeleton h-52 rounded-xl" />
						))
					: subs.map((sub: any) => (
							<div
								key={sub.id}
								className={clsx(
									"card hover:border-Nexus-500/30 transition-all",
									{
										"border-amber-500/30":
											sub.days_until_expiry <= 7 && sub.days_until_expiry >= 0,
										"border-red-500/30": sub.status === "expired",
									},
								)}>
								<div className="flex items-start justify-between mb-3">
									<div>
										<h3 className="font-semibold text-white">
											{sub.software_name}
										</h3>
										<p className="text-xs text-slate-400">{sub.vendor}</p>
									</div>
									<span
										className={clsx("badge text-[10px]", {
											"badge-green": sub.status === "active",
											"badge-amber": sub.status === "expiring_soon",
											"badge-red": sub.status === "expired",
											"badge-slate": sub.status === "cancelled",
										})}>
										{sub.status}
									</span>
								</div>
								<div className="grid grid-cols-2 gap-2 text-xs mb-3">
									<div className="bg-surface rounded-lg p-2">
										<div className="text-slate-500 mb-0.5">Seats</div>
										<div className="text-white font-medium">
											{sub.allocated_seats} / {sub.total_seats}
										</div>
									</div>
									<div className="bg-surface rounded-lg p-2">
										<div className="text-slate-500 mb-0.5">Available</div>
										<div
											className={clsx(
												"font-medium",
												sub.available_seats > 0
													? "text-green-400"
													: "text-red-400",
											)}>
											{sub.available_seats}
										</div>
									</div>
								</div>
								<div className="h-1.5 bg-surface-elevated rounded-full overflow-hidden mb-3">
									<div
										className="h-full bg-Nexus-500 rounded-full"
										style={{
											width: `${(sub.allocated_seats / sub.total_seats) * 100}%`,
										}}
									/>
								</div>
								<div className="flex items-center justify-between text-xs">
									<span
										className={clsx({
											"text-red-400 font-semibold": sub.days_until_expiry <= 7,
											"text-amber-400":
												sub.days_until_expiry <= 30 &&
												sub.days_until_expiry > 7,
											"text-slate-400": sub.days_until_expiry > 30,
										})}>
										{sub.days_until_expiry > 0
											? `Expires in ${sub.days_until_expiry}d`
											: "Expired"}
									</span>
									{!isAdmin && sub.available_seats > 0 && (
										<button
											onClick={() => setRequestModal(sub)}
											className="btn-primary btn-sm text-xs">
											Request Access
										</button>
									)}
								</div>
							</div>
						))}
			</div>

			{requestModal && (
				<RequestSeatModal
					sub={requestModal}
					onClose={() => setRequestModal(null)}
					onSuccess={() => {
						qc.invalidateQueries({ queryKey: ["subscriptions"] });
						setRequestModal(null);
					}}
				/>
			)}
		</div>
	);
}

function RequestSeatModal({ sub, onClose, onSuccess }: any) {
	const [purpose, setPurpose] = useState("");
	const mutation = useMutation({
		mutationFn: (data: any) =>
			import("../../services/api").then((m) =>
				m.subscriptionsApi.requestSeat(sub.id, data),
			),
		onSuccess: () => {
			toast.success("Access request submitted!");
			onSuccess();
		},
		onError: (e: any) => toast.error(e.response?.data?.detail || "Failed"),
	});
	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box max-w-md" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h3 className="font-semibold text-white">
						Request Access — {sub.software_name}
					</h3>
				</div>
				<div className="modal-body space-y-4">
					<div className="card bg-surface/60">
						<div className="text-slate-400 text-sm">
							Available seats:{" "}
							<span className="text-white font-medium">
								{sub.available_seats} / {sub.total_seats}
							</span>
						</div>
					</div>
					<div className="input-group">
						<label className="input-label">
							Purpose / Why do you need access? *
						</label>
						<textarea
							value={purpose}
							onChange={(e) => setPurpose(e.target.value)}
							rows={3}
							className="textarea"
							placeholder="Explain how you will use this software..."
						/>
					</div>
				</div>
				<div className="modal-footer">
					<button onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						disabled={!purpose.trim() || mutation.isPending}
						onClick={() => mutation.mutate({ purpose })}
						className="btn-primary">
						{mutation.isPending ? "Submitting..." : "Submit Request"}
					</button>
				</div>
			</div>
		</div>
	);
}
