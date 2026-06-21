// Nexus — Certificates & Recommendation Letters
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
	Award,
	Download,
	Plus,
	QrCode,
	CheckCircle,
	Clock,
	Shield,
	Star,
	Search,
	X,
	ChevronRight,
	SlidersHorizontal,
	ArrowUpDown,
	Building2,
	Mail,
	FileX2,
	RotateCcw,
	Copy,
	Loader2,
	Lock,
	AtSign,
} from "lucide-react";
import { certificatesApi, usersApi } from "../../services/api";
import { useAuthStore } from "../../services/api";
import type { User } from "../../services/api";
import toast from "react-hot-toast";
import clsx from "clsx";

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: any }> =
	{
		completion: {
			label: "Certificate of Completion",
			color: "text-green-400 bg-green-500/10",
			icon: Award,
		},
		recommendation: {
			label: "Recommendation Letter",
			color: "text-blue-400 bg-blue-500/10",
			icon: Star,
		},
		achievement: {
			label: "Achievement Award",
			color: "text-amber-400 bg-amber-500/10",
			icon: Award,
		},
		participation: {
			label: "Participation Certificate",
			color: "text-purple-400 bg-purple-500/10",
			icon: Shield,
		},
	};

const STATUS_BADGE: Record<string, string> = {
	pending: "badge-amber",
	generated: "badge-blue",
	issued: "badge-green",
	revoked: "badge-red",
};

const SORT_OPTIONS = [
	{ value: "recent", label: "Most recent" },
	{ value: "name", label: "Name (A–Z)" },
	{ value: "count", label: "Most certificates" },
] as const;

function initials(name: string) {
	if (!name) return "?";
	const parts = name.trim().split(/\s+/);
	return (parts[0]?.[0] || "").concat(parts[1]?.[0] || "").toUpperCase();
}

export default function CertificatesPage() {
	const { user } = useAuthStore();
	const qc = useQueryClient();
	const isAdmin = [
		"hr_officer",
		"system_admin",
		"supervisor",
		"broadcast_admin",
	].includes(user?.role || "");
	const [showGenerateModal, setShowGenerateModal] = useState(false);
	const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(
		null,
	);

	// Filters
	const [search, setSearch] = useState("");
	const [typeFilter, setTypeFilter] = useState<string>("all");
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [deptFilter, setDeptFilter] = useState<string>("all");
	const [sortBy, setSortBy] =
		useState<(typeof SORT_OPTIONS)[number]["value"]>("recent");
	const [showFilters, setShowFilters] = useState(false);

	const { data: certsData, isLoading } = useQuery({
		queryKey: ["certificates"],
		queryFn: () => certificatesApi.list().then((r) => r.data),
	});

	const certs = Array.isArray(certsData)
		? certsData
		: Array.isArray(certsData?.results)
			? certsData.results
			: [];

	const handleDownload = async (id: string, certNumber: string) => {
		try {
			const res = await certificatesApi.download(id);
			const url = URL.createObjectURL(
				new Blob([res.data], { type: "application/pdf" }),
			);
			const a = document.createElement("a");
			a.href = url;
			a.download = `certificate-${certNumber}.pdf`;
			a.click();
			URL.revokeObjectURL(url);
		} catch {
			toast.error("Download failed");
		}
	};

	const copyVerifyLink = (code: string) => {
		const link = `${window.location.origin}/verify/${code}`;
		navigator.clipboard.writeText(link);
		toast.success("Verification link copied");
	};

	// ── Roster: group certificates by recipient (admin view) ──────────────────
	const departments = useMemo(() => {
		const set = new Set<string>();
		certs.forEach((c: any) => {
			const d = c.recipient_department || c.department;
			if (d) set.add(d);
		});
		return Array.from(set).sort();
	}, [certs]);

	const roster = useMemo(() => {
		const map = new Map<string, any>();
		certs.forEach((c: any) => {
			const id = c.recipient || c.recipient_id || c.recipient_name;
			if (!id) return;
			if (!map.has(id)) {
				map.set(id, {
					id,
					name: c.recipient_name || "Unknown",
					email: c.recipient_email || "",
					department: c.recipient_department || c.department || "",
					certificates: [],
				});
			}
			map.get(id).certificates.push(c);
		});
		return Array.from(map.values());
	}, [certs]);

	const filteredRoster = useMemo(() => {
		let list = roster.filter((person) => {
			const matchesSearch =
				!search ||
				person.name.toLowerCase().includes(search.toLowerCase()) ||
				person.email.toLowerCase().includes(search.toLowerCase());
			const matchesDept =
				deptFilter === "all" || person.department === deptFilter;
			const matchesType =
				typeFilter === "all" ||
				person.certificates.some((c: any) => c.certificate_type === typeFilter);
			const matchesStatus =
				statusFilter === "all" ||
				person.certificates.some((c: any) => c.status === statusFilter);
			return matchesSearch && matchesDept && matchesType && matchesStatus;
		});

		if (sortBy === "name") {
			list = [...list].sort((a, b) => a.name.localeCompare(b.name));
		} else if (sortBy === "count") {
			list = [...list].sort(
				(a, b) => b.certificates.length - a.certificates.length,
			);
		} else {
			list = [...list].sort((a, b) => {
				const da = a.certificates[0]?.created_at || "";
				const db = b.certificates[0]?.created_at || "";
				return db.localeCompare(da);
			});
		}
		return list;
	}, [roster, search, deptFilter, typeFilter, statusFilter, sortBy]);

	const selectedPerson = useMemo(
		() => roster.find((p) => p.id === selectedRecipientId) || null,
		[roster, selectedRecipientId],
	);

	const activeFilterCount = [
		typeFilter !== "all",
		statusFilter !== "all",
		deptFilter !== "all",
	].filter(Boolean).length;

	const clearFilters = () => {
		setTypeFilter("all");
		setStatusFilter("all");
		setDeptFilter("all");
	};

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<Award size={22} className="text-Nexus-400" /> Certificates &
						Letters
					</h1>
					<p className="page-subtitle">
						Auto-generated completion certificates and recommendation letters
						with QR verification
					</p>
				</div>
				{isAdmin && (
					<button
						onClick={() => setShowGenerateModal(true)}
						className="btn-primary">
						<Plus size={15} /> Generate Certificate
					</button>
				)}
			</div>

			{/* Summary */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
				{[
					{ label: "Total", value: certs.length, color: "text-white" },
					{
						label: "Issued",
						value: certs.filter((c: any) => c.status === "issued").length,
						color: "text-green-400",
					},
					{
						label: "Pending",
						value: certs.filter((c: any) => c.status === "pending").length,
						color: "text-amber-400",
					},
					{
						label: "Generated",
						value: certs.filter((c: any) => c.status === "generated").length,
						color: "text-blue-400",
					},
				].map(({ label, value, color }) => (
					<div key={label} className="stat-card">
						<div className={clsx("stat-value", color)}>{value}</div>
						<div className="stat-label">{label}</div>
					</div>
				))}
			</div>

			{isAdmin ? (
				<>
					{/* Search + filter bar */}
					<div className="card space-y-3">
						<div className="flex flex-col sm:flex-row gap-3">
							<div className="relative flex-1">
								<Search
									size={15}
									className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
								/>
								<input
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									placeholder="Search recipients by name or email..."
									className="input pl-9 w-full"
								/>
								{search && (
									<button
										onClick={() => setSearch("")}
										className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
										<X size={14} />
									</button>
								)}
							</div>

							<div className="relative">
								<select
									value={sortBy}
									onChange={(e) => setSortBy(e.target.value as any)}
									className="select-input pr-8">
									{SORT_OPTIONS.map((o) => (
										<option key={o.value} value={o.value}>
											{o.label}
										</option>
									))}
								</select>
								<ArrowUpDown
									size={12}
									className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
								/>
							</div>

							<button
								onClick={() => setShowFilters((s) => !s)}
								className={clsx(
									"btn-secondary relative",
									showFilters && "border-Nexus-500/50 text-Nexus-300",
								)}>
								<SlidersHorizontal size={14} /> Filters
								{activeFilterCount > 0 && (
									<span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-Nexus-500 text-[9px] font-bold flex items-center justify-center text-white">
										{activeFilterCount}
									</span>
								)}
							</button>
						</div>

						{showFilters && (
							<div className="flex flex-wrap items-center gap-3 pt-3 border-t border-surface-border/50">
								<div className="input-group !mb-0">
									<label className="input-label">Department</label>
									<select
										value={deptFilter}
										onChange={(e) => setDeptFilter(e.target.value)}
										className="select-input">
										<option value="all">All departments</option>
										{departments.map((d) => (
											<option key={d} value={d}>
												{d}
											</option>
										))}
										{departments.length === 0 && (
											<option disabled>No department data</option>
										)}
									</select>
								</div>
								<div className="input-group !mb-0">
									<label className="input-label">Certificate type</label>
									<select
										value={typeFilter}
										onChange={(e) => setTypeFilter(e.target.value)}
										className="select-input">
										<option value="all">All types</option>
										{Object.entries(TYPE_CONFIG).map(([v, { label }]) => (
											<option key={v} value={v}>
												{label}
											</option>
										))}
									</select>
								</div>
								<div className="input-group !mb-0">
									<label className="input-label">Status</label>
									<select
										value={statusFilter}
										onChange={(e) => setStatusFilter(e.target.value)}
										className="select-input">
										<option value="all">All statuses</option>
										{Object.keys(STATUS_BADGE).map((s) => (
											<option key={s} value={s}>
												{s[0].toUpperCase() + s.slice(1)}
											</option>
										))}
									</select>
								</div>
								{activeFilterCount > 0 && (
									<button
										onClick={clearFilters}
										className="text-xs text-slate-400 hover:text-white underline mt-5">
										Clear filters
									</button>
								)}
							</div>
						)}
					</div>

					{/* Recipient roster */}
					{isLoading ? (
						<div className="space-y-2">
							{[...Array(5)].map((_, i) => (
								<div key={i} className="skeleton h-16 rounded-xl" />
							))}
						</div>
					) : filteredRoster.length === 0 ? (
						<div className="card text-center py-16">
							<Search
								size={36}
								className="mx-auto text-slate-500 mb-3 opacity-30"
							/>
							<p className="text-slate-400">No recipients match your search</p>
							<p className="text-xs text-slate-500 mt-1">
								Try adjusting your filters or search term
							</p>
						</div>
					) : (
						<div className="card !p-0 overflow-hidden">
							<div className="px-4 py-2.5 border-b border-surface-border/50 flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-500">
								<span>Recipient</span>
								<span className="hidden sm:block">
									{filteredRoster.length} of {roster.length} people
								</span>
							</div>
							<div className="divide-y divide-surface-border/40">
								{filteredRoster.map((person) => {
									const latest = person.certificates[0];
									const issuedCount = person.certificates.filter(
										(c: any) => c.status === "issued",
									).length;
									return (
										<button
											key={person.id}
											onClick={() => setSelectedRecipientId(person.id)}
											className="w-full text-left px-4 py-3.5 flex items-center gap-4 hover:bg-surface/60 transition-colors group">
											<div className="w-10 h-10 rounded-full bg-Nexus-500/15 text-Nexus-300 flex items-center justify-center font-semibold text-xs shrink-0">
												{initials(person.name)}
											</div>
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2">
													<p className="text-sm font-medium text-white truncate">
														{person.name}
													</p>
													{issuedCount > 0 && (
														<span className="badge badge-green text-[9px]">
															{issuedCount} issued
														</span>
													)}
												</div>
												<div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
													{person.department && (
														<span className="flex items-center gap-1">
															<Building2 size={10} /> {person.department}
														</span>
													)}
													{latest?.created_at && (
														<span>
															Last issued{" "}
															{format(
																parseISO(latest.created_at),
																"dd MMM yyyy",
															)}
														</span>
													)}
												</div>
											</div>
											<div className="hidden sm:flex items-center gap-1.5">
												{Array.from(
													new Set(
														person.certificates.map(
															(c: any) => c.certificate_type,
														),
													),
												)
													.slice(0, 3)
													.map((t: any) => {
														const cfg =
															TYPE_CONFIG[t] || TYPE_CONFIG.completion;
														const Icon = cfg.icon;
														return (
															<span
																key={t}
																title={cfg.label}
																className={clsx(
																	"w-6 h-6 rounded-lg flex items-center justify-center",
																	cfg.color.split(" ")[1],
																)}>
																<Icon
																	size={12}
																	className={cfg.color.split(" ")[0]}
																/>
															</span>
														);
													})}
											</div>
											<span className="text-xs text-slate-500 shrink-0">
												{person.certificates.length} cert
												{person.certificates.length !== 1 ? "s" : ""}
											</span>
											<ChevronRight
												size={16}
												className="text-slate-600 group-hover:text-Nexus-400 transition-colors shrink-0"
											/>
										</button>
									);
								})}
							</div>
						</div>
					)}
				</>
			) : (
				// ── Non-admin: simple personal certificate grid ───────────────────
				<>
					{isLoading ? (
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							{[...Array(4)].map((_, i) => (
								<div key={i} className="skeleton h-48 rounded-xl" />
							))}
						</div>
					) : certs.length === 0 ? (
						<div className="card text-center py-16">
							<Award
								size={40}
								className="mx-auto text-slate-500 mb-3 opacity-30"
							/>
							<p className="text-slate-400">No certificates yet</p>
							<p className="text-xs text-slate-500 mt-2">
								Certificates are issued by your supervisor or HR officer upon
								successful completion.
							</p>
						</div>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							{certs.map((cert: any) => (
								<CertCard
									key={cert.id}
									cert={cert}
									onDownload={handleDownload}
									onCopyLink={copyVerifyLink}
								/>
							))}
						</div>
					)}
				</>
			)}

			{showGenerateModal && (
				<GenerateCertModal
					onClose={() => setShowGenerateModal(false)}
					onSuccess={() => {
						qc.invalidateQueries({ queryKey: ["certificates"] });
						setShowGenerateModal(false);
					}}
				/>
			)}

			{selectedPerson && (
				<RecipientDrawer
					person={selectedPerson}
					onClose={() => setSelectedRecipientId(null)}
					onDownload={handleDownload}
					onCopyLink={copyVerifyLink}
				/>
			)}
		</div>
	);
}

// ── Recipient drawer: all certificates for one person ─────────────────────────
function RecipientDrawer({ person, onClose, onDownload, onCopyLink }: any) {
	const issuedCount = person.certificates.filter(
		(c: any) => c.status === "issued",
	).length;
	const pendingCount = person.certificates.filter(
		(c: any) => c.status === "pending",
	).length;

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box max-w-2xl" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header flex items-center justify-between">
					<div className="flex items-center gap-3 min-w-0">
						<div className="w-11 h-11 rounded-full bg-Nexus-500/15 text-Nexus-300 flex items-center justify-center font-semibold text-sm shrink-0">
							{initials(person.name)}
						</div>
						<div className="min-w-0">
							<h3 className="font-semibold text-white text-sm truncate">
								{person.name}
							</h3>
							<div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
								{person.department && (
									<span className="flex items-center gap-1">
										<Building2 size={10} /> {person.department}
									</span>
								)}
								{person.email && (
									<span className="flex items-center gap-1 truncate">
										<Mail size={10} /> {person.email}
									</span>
								)}
							</div>
						</div>
					</div>
					<button
						onClick={onClose}
						className="text-slate-500 hover:text-white shrink-0">
						<X size={18} />
					</button>
				</div>

				<div className="modal-body space-y-4 max-h-[60vh] overflow-y-auto">
					<div className="flex items-center gap-2 text-xs">
						<span className="badge badge-slate">
							{person.certificates.length} total
						</span>
						{issuedCount > 0 && (
							<span className="badge badge-green">{issuedCount} issued</span>
						)}
						{pendingCount > 0 && (
							<span className="badge badge-amber">{pendingCount} pending</span>
						)}
					</div>

					<div className="space-y-2">
						{person.certificates.map((cert: any) => {
							const cfg =
								TYPE_CONFIG[cert.certificate_type] || TYPE_CONFIG.completion;
							const Icon = cfg.icon;
							return (
								<div
									key={cert.id}
									className="bg-surface rounded-xl p-3.5 flex items-center gap-3">
									<div
										className={clsx(
											"w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
											cfg.color.split(" ")[1],
										)}>
										<Icon size={18} className={cfg.color.split(" ")[0]} />
									</div>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<p className="text-sm font-medium text-white truncate">
												{cfg.label}
											</p>
											<span
												className={clsx(
													"badge text-[9px] shrink-0",
													STATUS_BADGE[cert.status] || "badge-slate",
												)}>
												{cert.status}
											</span>
										</div>
										<div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
											<span className="font-mono">
												{cert.certificate_number}
											</span>
											<span>
												{cert.issue_date
													? format(parseISO(cert.issue_date), "dd MMM yyyy")
													: "Issue date pending"}
											</span>
											{cert.signed_by_name && (
												<span>Signed by {cert.signed_by_name}</span>
											)}
										</div>
									</div>
									<div className="flex items-center gap-1.5 shrink-0">
										{(cert.status === "issued" ||
											cert.status === "generated") && (
											<button
												title="Download PDF"
												onClick={() =>
													onDownload(cert.id, cert.certificate_number)
												}
												className="btn-secondary btn-sm !px-2">
												<Download size={13} />
											</button>
										)}
										{cert.qr_verification_code && (
											<button
												title="Copy verification link"
												onClick={() => onCopyLink(cert.qr_verification_code)}
												className="btn-secondary btn-sm !px-2">
												<Copy size={13} />
											</button>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>

				<div className="modal-footer">
					<button onClick={onClose} className="btn-secondary">
						Close
					</button>
				</div>
			</div>
		</div>
	);
}

// ── Single certificate card (used in non-admin personal view) ─────────────────
function CertCard({ cert, onDownload, onCopyLink }: any) {
	const cfg = TYPE_CONFIG[cert.certificate_type] || TYPE_CONFIG.completion;
	const Icon = cfg.icon;
	return (
		<div className="card hover:border-Nexus-500/30 transition-all group">
			<div className="flex items-start gap-4 mb-4">
				<div
					className={clsx(
						"w-14 h-14 rounded-2xl flex items-center justify-center shrink-0",
						cfg.color.split(" ")[1],
					)}>
					<Icon size={24} className={cfg.color.split(" ")[0]} />
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-start justify-between gap-2">
						<h3 className="font-semibold text-white text-sm leading-tight">
							{cfg.label}
						</h3>
						<span
							className={clsx(
								"badge text-[10px] shrink-0",
								STATUS_BADGE[cert.status] || "badge-slate",
							)}>
							{cert.status}
						</span>
					</div>
					<p className="text-xs text-slate-400 mt-0.5">{cert.recipient_name}</p>
					<p className="text-[10px] font-mono text-slate-500 mt-1">
						{cert.certificate_number}
					</p>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-2 mb-4 text-xs">
				<div className="bg-surface rounded-lg p-2.5">
					<div className="text-slate-500 mb-0.5">Issue Date</div>
					<div className="text-white font-medium">
						{cert.issue_date
							? format(parseISO(cert.issue_date), "dd MMM yyyy")
							: "Pending"}
					</div>
				</div>
				<div className="bg-surface rounded-lg p-2.5">
					<div className="text-slate-500 mb-0.5">Signed By</div>
					<div className="text-white font-medium truncate">
						{cert.signed_by_name || "—"}
					</div>
				</div>
			</div>

			{cert.signed_by_title && (
				<p className="text-[10px] text-slate-500 mb-3">
					{cert.signed_by_title}
				</p>
			)}

			<div className="flex items-center gap-2 mt-auto pt-3 border-t border-surface-border/50">
				{cert.status === "issued" || cert.status === "generated" ? (
					<button
						onClick={() => onDownload(cert.id, cert.certificate_number)}
						className="btn-primary btn-sm flex-1 justify-center">
						<Download size={13} /> Download PDF
					</button>
				) : (
					<div className="flex items-center gap-1.5 text-xs text-amber-400">
						<Clock size={12} /> Processing...
					</div>
				)}

				{cert.qr_verification_code && (
					<button
						title="Verification QR Code"
						className="btn-secondary btn-sm"
						onClick={() => onCopyLink(cert.qr_verification_code)}>
						<QrCode size={13} />
					</button>
				)}
			</div>
		</div>
	);
}

function GenerateCertModal({ onClose, onSuccess }: any) {
	const { user } = useAuthStore();
	const [form, setForm] = useState({
		attachee_id: "",
		certificate_type: "completion",
		signed_by_name: user?.full_name || "",
		signed_by_title: user?.role_display || "",
	});
	const [selectedRecipient, setSelectedRecipient] = useState<User | null>(null);

	const mutation = useMutation({
		mutationFn: (data: any) => certificatesApi.generate(data),
		onSuccess: () => {
			toast.success("Certificate generated!");
			onSuccess();
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Generation failed"),
	});

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h3 className="font-semibold text-white flex items-center gap-2">
						<Award size={18} className="text-Nexus-400" /> Generate Certificate
					</h3>
				</div>
				<div className="modal-body space-y-4">
					<div className="input-group">
						<label className="input-label">Attachee / Recipient *</label>
						<RecipientCombobox
							selected={selectedRecipient}
							onSelect={(person) => {
								setSelectedRecipient(person);
								setForm((p) => ({ ...p, attachee_id: person?.id || "" }));
							}}
						/>
						<p className="text-[11px] text-slate-500 mt-1.5">
							Search by name, email, or user ID
						</p>
					</div>

					<div className="input-group">
						<label className="input-label">Certificate Type *</label>
						<select
							value={form.certificate_type}
							onChange={(e) =>
								setForm((p) => ({ ...p, certificate_type: e.target.value }))
							}
							className="select-input">
							{Object.entries(TYPE_CONFIG).map(([v, { label }]) => (
								<option key={v} value={v}>
									{label}
								</option>
							))}
						</select>
					</div>

					<div className="input-group">
						<label className="input-label">Signing Authority Name *</label>
						<div className="relative">
							<input
								value={form.signed_by_name}
								disabled
								readOnly
								className="input pr-9 opacity-80 cursor-not-allowed"
							/>
							<Lock
								size={13}
								className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
							/>
						</div>
						<p className="text-[11px] text-slate-500 mt-1.5">
							Auto-filled from your account — certificates are signed under your
							identity for accountability
						</p>
					</div>

					<div className="input-group">
						<label className="input-label">Signing Authority Title</label>
						<input
							value={form.signed_by_title}
							onChange={(e) =>
								setForm((p) => ({ ...p, signed_by_title: e.target.value }))
							}
							className="input"
							placeholder="e.g. Head of HR & Training"
						/>
					</div>
				</div>
				<div className="modal-footer">
					<button onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						disabled={
							!form.attachee_id || !form.signed_by_name || mutation.isPending
						}
						onClick={() => {
							mutation.mutate(form);
						}}
						className="btn-primary">
						{mutation.isPending ? "Generating..." : "Generate Certificate"}
					</button>
				</div>
			</div>
		</div>
	);
}

// ── Searchable recipient combobox ──────────────────────────────────────────────
// Looks up recipients by name, email, or user ID as the admin types.
// Adjust the endpoint/params in the query below to match your actual users API.
function useUserSearch(query: string) {
	return useQuery({
		queryKey: ["user-search", query],
		queryFn: async (): Promise<User[]> => {
			const res = await usersApi.list({ search: query, page_size: 8 });
			const data = res.data;
			const list: User[] = Array.isArray(data) ? data : data?.results || [];
			// Client-side safety net: some backends ignore unknown filter params
			// and return the full/paginated list instead of a filtered one, so we
			// narrow results here too in case ?search= isn't honored server-side.
			const q = query.trim().toLowerCase();
			if (!q) return list;
			return list.filter(
				(u) =>
					u.full_name?.toLowerCase().includes(q) ||
					u.email?.toLowerCase().includes(q) ||
					u.id?.toLowerCase().includes(q) ||
					u.employee_id?.toLowerCase().includes(q),
			);
		},
		enabled: query.trim().length >= 2,
		staleTime: 30_000,
	});
}

function RecipientCombobox({
	selected,
	onSelect,
}: {
	selected: User | null;
	onSelect: (person: User | null) => void;
}) {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const { data: results = [], isFetching } = useUserSearch(query);

	if (selected) {
		return (
			<div className="flex items-center gap-3 bg-surface border border-surface-border rounded-lg px-3 py-2.5">
				<div className="w-8 h-8 rounded-full bg-Nexus-500/15 text-Nexus-300 flex items-center justify-center text-[11px] font-semibold shrink-0">
					{initials(selected.full_name || "")}
				</div>
				<div className="flex-1 min-w-0">
					<p className="text-sm font-medium text-white truncate">
						{selected.full_name}
					</p>
					<p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
						{selected.email && (
							<>
								<AtSign size={10} /> {selected.email}
							</>
						)}
						{selected.id && (
							<span className="font-mono ml-1">#{selected.id}</span>
						)}
					</p>
				</div>
				<button
					onClick={() => {
						onSelect(null);
						setQuery("");
					}}
					className="text-slate-500 hover:text-white shrink-0"
					title="Change recipient">
					<X size={15} />
				</button>
			</div>
		);
	}

	return (
		<div className="relative">
			<div className="relative">
				<Search
					size={14}
					className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
				/>
				<input
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					onBlur={() => setTimeout(() => setOpen(false), 150)}
					className="input pl-9"
					placeholder="Search by name, email, or user ID..."
				/>
				{isFetching && (
					<Loader2
						size={14}
						className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 animate-spin"
					/>
				)}
			</div>

			{open && query.trim().length >= 2 && (
				<div className="absolute z-20 mt-1.5 w-full bg-[#151c2e] border border-surface-border rounded-xl shadow-xl max-h-64 overflow-y-auto">
					{isFetching ? (
						<div className="px-3 py-4 text-xs text-slate-500 text-center">
							Searching...
						</div>
					) : results.length === 0 ? (
						<div className="px-3 py-4 text-xs text-slate-500 text-center">
							No matching users found
						</div>
					) : (
						results.map((person: User) => (
							<button
								key={person.id}
								onMouseDown={(e) => e.preventDefault()}
								onClick={() => {
									onSelect(person);
									setOpen(false);
								}}
								className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-surface/80 transition-colors border-b border-surface-border/40 last:border-0">
								<div className="w-7 h-7 rounded-full bg-Nexus-500/15 text-Nexus-300 flex items-center justify-center text-[10px] font-semibold shrink-0">
									{initials(person.full_name || "")}
								</div>
								<div className="min-w-0 flex-1">
									<p className="text-xs font-medium text-white truncate">
										{person.full_name}
									</p>
									<p className="text-[10px] text-slate-500 truncate">
										{person.email}
										{person.id && (
											<span className="font-mono ml-1.5">#{person.id}</span>
										)}
									</p>
								</div>
								{person.role && (
									<span className="badge badge-slate text-[9px] shrink-0">
										{person.role}
									</span>
								)}
							</button>
						))
					)}
				</div>
			)}
		</div>
	);
}
