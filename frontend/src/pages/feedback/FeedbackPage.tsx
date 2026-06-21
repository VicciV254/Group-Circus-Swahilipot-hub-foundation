// Nexus — Feedback & Complaints Ticketing (Production)
import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, formatDistanceToNow, isPast } from "date-fns";
import {
	MessageSquare,
	Plus,
	Search,
	Filter,
	CheckCircle,
	Clock,
	AlertCircle,
	ChevronRight,
	BarChart3,
	Paperclip,
	Send,
	Trash2,
	Edit3,
	Download,
	RefreshCw,
	Star,
	Users,
	ShieldAlert,
	TrendingUp,
	Tag,
	User,
	ChevronDown,
	X,
	AlertTriangle,
	FileText,
	Lock,
	Unlock,
	Eye,
	EyeOff,
	CalendarClock,
	Activity,
	SlidersHorizontal,
	ArrowUpDown,
} from "lucide-react";
import { feedbackApi } from "../../services/api";
import { useAuthStore } from "../../services/api";
import { useForm, Controller } from "react-hook-form";
import toast from "react-hot-toast";
import clsx from "clsx";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
	string,
	{ label: string; badge: string; icon: React.ReactNode }
> = {
	open: {
		label: "Open",
		badge: "badge-red",
		icon: <AlertCircle size={14} className="text-red-400" />,
	},
	in_progress: {
		label: "In Progress",
		badge: "badge-amber",
		icon: <Clock size={14} className="text-amber-400" />,
	},
	resolved: {
		label: "Resolved",
		badge: "badge-green",
		icon: <CheckCircle size={14} className="text-green-400" />,
	},
	closed: {
		label: "Closed",
		badge: "badge-slate",
		icon: <X size={14} className="text-slate-400" />,
	},
};

const PRIORITY_CONFIG: Record<
	string,
	{ label: string; color: string; dot: string }
> = {
	low: { label: "Low", color: "text-slate-400", dot: "bg-slate-400" },
	medium: { label: "Medium", color: "text-blue-400", dot: "bg-blue-400" },
	high: { label: "High", color: "text-amber-400", dot: "bg-amber-400" },
	urgent: { label: "Urgent", color: "text-red-400", dot: "bg-red-400" },
};

const CATEGORIES = [
	"Equipment",
	"Wi-Fi",
	"Scheduling",
	"Facilities",
	"Staff",
	"Software",
	"Broadcast",
	"Other",
];

const SLA_HOURS: Record<string, number> = {
	low: 72,
	medium: 48,
	high: 24,
	urgent: 4,
};

const ADMIN_ROLES = new Set([
	"system_admin",
	"broadcast_admin",
	"hr_officer",
	"ict",
	"operations",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = [
	"image/jpeg",
	"image/png",
	"image/gif",
	"application/pdf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"text/plain",
	"application/zip",
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function slaStatus(ticket: any) {
	if (!ticket.sla_due_at || ["resolved", "closed"].includes(ticket.status))
		return null;
	const due = parseISO(ticket.sla_due_at);
	const now = new Date();
	const hoursLeft = (due.getTime() - now.getTime()) / 3600000;
	if (ticket.is_sla_breached || isPast(due)) return "breached";
	if (hoursLeft < 4) return "critical";
	if (hoursLeft < 12) return "warning";
	return "ok";
}

function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function StarRating({
	value,
	onChange,
}: {
	value: number;
	onChange?: (v: number) => void;
}) {
	const [hover, setHover] = useState(0);
	return (
		<div className="flex gap-1">
			{[1, 2, 3, 4, 5].map((n) => (
				<button
					key={n}
					type="button"
					disabled={!onChange}
					onClick={() => onChange?.(n)}
					onMouseEnter={() => onChange && setHover(n)}
					onMouseLeave={() => onChange && setHover(0)}
					className={clsx(
						"transition-colors",
						onChange ? "cursor-pointer" : "cursor-default",
					)}>
					<Star
						size={16}
						className={clsx(
							(hover || value) >= n
								? "text-amber-400 fill-amber-400"
								: "text-slate-600",
						)}
					/>
				</button>
			))}
		</div>
	);
}

function SLABadge({ ticket }: { ticket: any }) {
	const s = slaStatus(ticket);
	if (!s || s === "ok") return null;
	const configs = {
		breached: {
			label: "SLA Breached",
			cls: "text-red-400 bg-red-500/10 border-red-500/20",
		},
		critical: {
			label: "SLA Critical",
			cls: "text-red-400 bg-red-500/10 border-red-500/20",
		},
		warning: {
			label: "SLA Warning",
			cls: "text-amber-400 bg-amber-500/10 border-amber-500/20",
		},
	};
	const cfg = configs[s as keyof typeof configs];
	return (
		<span
			className={clsx(
				"inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border",
				cfg.cls,
			)}>
			<AlertTriangle size={10} />
			{cfg.label}
		</span>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

type TabType = "tickets" | "stats";
type SortField =
	| "-created_at"
	| "created_at"
	| "-updated_at"
	| "updated_at"
	| "priority"
	| "-priority"
	| "sla_due_at"
	| "-sla_due_at";

export default function FeedbackPage() {
	const { user } = useAuthStore();
	const qc = useQueryClient();
	const isAdmin = ADMIN_ROLES.has(user?.role || "");

	const [activeTab, setActiveTab] = useState<TabType>("tickets");
	const [showNewModal, setShowNewModal] = useState(false);
	const [selectedTicket, setSelectedTicket] = useState<any>(null);

	// Filters
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState("");
	const [priorityFilter, setPriorityFilter] = useState("");
	const [categoryFilter, setCategoryFilter] = useState("");
	const [assignedFilter, setAssignedFilter] = useState("");
	const [slaFilter, setSlaFilter] = useState("");
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [sort, setSort] = useState<SortField>("-created_at");
	const [showFilters, setShowFilters] = useState(false);

	const queryParams = {
		search: search || undefined,
		status: statusFilter || undefined,
		priority: priorityFilter || undefined,
		category: categoryFilter || undefined,
		assigned_to: assignedFilter || undefined,
		sla_breached: slaFilter === "breached" ? "true" : undefined,
		date_from: dateFrom || undefined,
		date_to: dateTo || undefined,
		sort,
	};

	const {
		data: ticketsData,
		isLoading,
		isFetching,
		refetch,
	} = useQuery({
		queryKey: ["feedback", queryParams],
		queryFn: () => feedbackApi.list(queryParams).then((r) => r.data),
		refetchInterval: 60000,
	});

	const tickets: any[] = Array.isArray(ticketsData)
		? ticketsData
		: Array.isArray(ticketsData?.results)
			? ticketsData.results
			: [];

	const { data: stats } = useQuery({
		queryKey: ["feedback-stats"],
		queryFn: () => feedbackApi.stats().then((r) => r.data),
		enabled: activeTab === "stats" && isAdmin,
	});

	const updateMutation = useMutation({
		mutationFn: ({ id, data }: any) => feedbackApi.update(id, data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["feedback"] });
			toast.success("Ticket updated");
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Update failed"),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => feedbackApi.delete(id),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["feedback"] });
			setSelectedTicket(null);
			toast.success("Ticket deleted");
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Delete failed"),
	});

	const bulkUpdateMutation = useMutation({
		mutationFn: ({ ids, data }: any) => feedbackApi.bulkUpdate({ ids, data }),
		onSuccess: (_, vars) => {
			qc.invalidateQueries({ queryKey: ["feedback"] });
			setSelectedIds([]);
			toast.success(`${vars.ids.length} tickets updated`);
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Bulk update failed"),
	});

	// Multi-select
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [bulkAction, setBulkAction] = useState("");

	const toggleSelect = (id: string) =>
		setSelectedIds((prev) =>
			prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
		);
	const toggleSelectAll = () =>
		setSelectedIds(
			selectedIds.length === tickets.length ? [] : tickets.map((t) => t.id),
		);

	const applyBulkAction = () => {
		if (!bulkAction || !selectedIds.length) return;
		const [field, value] = bulkAction.split(":");
		bulkUpdateMutation.mutate({ ids: selectedIds, data: { [field]: value } });
		setBulkAction("");
	};

	const activeFilterCount = [
		statusFilter,
		priorityFilter,
		categoryFilter,
		assignedFilter,
		slaFilter,
		dateFrom,
		dateTo,
	].filter(Boolean).length;

	const clearFilters = () => {
		setStatusFilter("");
		setPriorityFilter("");
		setCategoryFilter("");
		setAssignedFilter("");
		setSlaFilter("");
		setDateFrom("");
		setDateTo("");
	};

	// Derived counts
	const counts = {
		open: tickets.filter((t) => t.status === "open").length,
		in_progress: tickets.filter((t) => t.status === "in_progress").length,
		resolved: tickets.filter((t) => t.status === "resolved").length,
		total: tickets.length,
		sla_breached: tickets.filter(
			(t) => t.is_sla_breached || slaStatus(t) === "breached",
		).length,
	};

	return (
		<div className="space-y-6 animate-fade-in">
			{/* ── Header ─────────────────────────────────────────────────── */}
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<MessageSquare size={22} className="text-Swahilipot-400" />
						Feedback & Complaints
					</h1>
					<p className="page-subtitle">
						Structured ticketing for institutional complaints, suggestions, and
						feedback
					</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={() => refetch()}
						disabled={isFetching}
						className="btn-secondary p-2"
						title="Refresh">
						<RefreshCw
							size={15}
							className={clsx(isFetching && "animate-spin")}
						/>
					</button>
					{isAdmin && (
						<button
							onClick={() => feedbackApi.export(queryParams)}
							className="btn-secondary flex items-center gap-1.5 text-sm">
							<Download size={14} /> Export
						</button>
					)}
					<button onClick={() => setShowNewModal(true)} className="btn-primary">
						<Plus size={15} /> New Ticket
					</button>
				</div>
			</div>

			{/* ── Tabs (admin gets stats tab) ─────────────────────────────── */}
			{isAdmin && (
				<div className="flex border-b border-surface-border gap-6">
					{(["tickets", "stats"] as TabType[]).map((tab) => (
						<button
							key={tab}
							onClick={() => setActiveTab(tab)}
							className={clsx(
								"pb-3 text-sm font-medium capitalize transition-colors border-b-2 -mb-px",
								activeTab === tab
									? "border-Swahilipot-400 text-white"
									: "border-transparent text-slate-400 hover:text-slate-200",
							)}>
							{tab === "stats" ? (
								<span className="flex items-center gap-1.5">
									<BarChart3 size={14} /> Analytics
								</span>
							) : (
								<span className="flex items-center gap-1.5">
									<MessageSquare size={14} /> Tickets
								</span>
							)}
						</button>
					))}
				</div>
			)}

			{activeTab === "stats" && isAdmin ? (
				<StatsPanel stats={stats} />
			) : (
				<>
					{/* ── Summary cards ────────────────────────────────────── */}
					<div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
						{[
							{
								label: "Open",
								value: counts.open,
								color: "text-red-400",
								filter: "open",
							},
							{
								label: "In Progress",
								value: counts.in_progress,
								color: "text-amber-400",
								filter: "in_progress",
							},
							{
								label: "Resolved",
								value: counts.resolved,
								color: "text-green-400",
								filter: "resolved",
							},
							{
								label: "Total",
								value: counts.total,
								color: "text-white",
								filter: "",
							},
							{
								label: "SLA Breached",
								value: counts.sla_breached,
								color: "text-red-400",
								filter: null,
							},
						].map(({ label, value, color, filter }) => (
							<button
								key={label}
								onClick={() =>
									filter !== null && setStatusFilter(filter ?? statusFilter)
								}
								className={clsx(
									"stat-card text-left transition-all",
									filter !== null &&
										"hover:border-Swahilipot-500/40 cursor-pointer",
									filter === statusFilter &&
										filter !== null &&
										"border-Swahilipot-500/50",
								)}>
								<div className={clsx("stat-value", color)}>{value}</div>
								<div className="stat-label">{label}</div>
							</button>
						))}
					</div>

					{/* ── Search & Filters ─────────────────────────────────── */}
					<div className="space-y-3">
						<div className="flex flex-wrap gap-2">
							<div className="relative flex-1 min-w-48">
								<Search
									size={14}
									className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
								/>
								<input
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									placeholder="Search by title, description, ticket #, submitter..."
									className="input pl-9 py-2 w-full"
								/>
								{search && (
									<button
										onClick={() => setSearch("")}
										className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
										<X size={13} />
									</button>
								)}
							</div>

							<select
								value={sort}
								onChange={(e) => setSort(e.target.value as SortField)}
								className="select-input w-44">
								<option value="-created_at">Newest first</option>
								<option value="created_at">Oldest first</option>
								<option value="-updated_at">Recently updated</option>
								<option value="sla_due_at">SLA due (soonest)</option>
								<option value="-priority">Priority (high→low)</option>
							</select>

							<button
								onClick={() => setShowFilters(!showFilters)}
								className={clsx(
									"btn-secondary flex items-center gap-1.5 text-sm relative",
									showFilters && "bg-surface-hover",
								)}>
								<SlidersHorizontal size={14} />
								Filters
								{activeFilterCount > 0 && (
									<span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-Swahilipot-500 text-white text-[9px] flex items-center justify-center">
										{activeFilterCount}
									</span>
								)}
							</button>

							{activeFilterCount > 0 && (
								<button
									onClick={clearFilters}
									className="btn-secondary text-sm text-slate-400">
									<X size={13} /> Clear
								</button>
							)}
						</div>

						{showFilters && (
							<div className="card grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in">
								<div className="input-group">
									<label className="input-label">Status</label>
									<select
										value={statusFilter}
										onChange={(e) => setStatusFilter(e.target.value)}
										className="select-input">
										<option value="">All</option>
										{Object.entries(STATUS_CONFIG).map(([v, c]) => (
											<option key={v} value={v}>
												{c.label}
											</option>
										))}
									</select>
								</div>
								<div className="input-group">
									<label className="input-label">Priority</label>
									<select
										value={priorityFilter}
										onChange={(e) => setPriorityFilter(e.target.value)}
										className="select-input">
										<option value="">All</option>
										{Object.entries(PRIORITY_CONFIG).map(([v, c]) => (
											<option key={v} value={v}>
												{c.label}
											</option>
										))}
									</select>
								</div>
								<div className="input-group">
									<label className="input-label">Category</label>
									<select
										value={categoryFilter}
										onChange={(e) => setCategoryFilter(e.target.value)}
										className="select-input">
										<option value="">All</option>
										{CATEGORIES.map((c) => (
											<option key={c} value={c}>
												{c}
											</option>
										))}
									</select>
								</div>
								{isAdmin && (
									<div className="input-group">
										<label className="input-label">Assigned</label>
										<select
											value={assignedFilter}
											onChange={(e) => setAssignedFilter(e.target.value)}
											className="select-input">
											<option value="">All</option>
											<option value="me">Assigned to me</option>
											<option value="unassigned">Unassigned</option>
										</select>
									</div>
								)}
								<div className="input-group">
									<label className="input-label">SLA</label>
									<select
										value={slaFilter}
										onChange={(e) => setSlaFilter(e.target.value)}
										className="select-input">
										<option value="">All</option>
										<option value="breached">Breached only</option>
									</select>
								</div>
								<div className="input-group">
									<label className="input-label">From date</label>
									<input
										type="date"
										value={dateFrom}
										onChange={(e) => setDateFrom(e.target.value)}
										className="input py-1.5"
									/>
								</div>
								<div className="input-group">
									<label className="input-label">To date</label>
									<input
										type="date"
										value={dateTo}
										onChange={(e) => setDateTo(e.target.value)}
										className="input py-1.5"
									/>
								</div>
							</div>
						)}
					</div>

					{/* ── Bulk actions (admin) ─────────────────────────────── */}
					{isAdmin && selectedIds.length > 0 && (
						<div className="flex items-center gap-3 px-4 py-2.5 bg-Swahilipot-900/30 border border-Swahilipot-500/30 rounded-xl animate-fade-in">
							<span className="text-sm text-Swahilipot-300 font-medium">
								{selectedIds.length} selected
							</span>
							<select
								value={bulkAction}
								onChange={(e) => setBulkAction(e.target.value)}
								className="select-input text-sm py-1 flex-1 max-w-48">
								<option value="">Bulk action…</option>
								<option value="status:in_progress">→ Mark In Progress</option>
								<option value="status:resolved">→ Mark Resolved</option>
								<option value="status:closed">→ Mark Closed</option>
								<option value="priority:urgent">→ Set Urgent</option>
								<option value="priority:high">→ Set High</option>
								<option value="priority:medium">→ Set Medium</option>
							</select>
							<button
								disabled={!bulkAction || bulkUpdateMutation.isPending}
								onClick={applyBulkAction}
								className="btn-primary text-sm py-1.5">
								Apply
							</button>
							<button
								onClick={() => setSelectedIds([])}
								className="btn-secondary text-sm py-1.5">
								Cancel
							</button>
						</div>
					)}

					{/* ── Ticket list ─────────────────────────────────────── */}
					<div className="space-y-2">
						{isAdmin && tickets.length > 0 && (
							<div className="flex items-center gap-2 px-1 pb-1">
								<input
									type="checkbox"
									checked={
										selectedIds.length === tickets.length && tickets.length > 0
									}
									onChange={toggleSelectAll}
									className="rounded border-slate-600 bg-surface text-Swahilipot-500"
								/>
								<span className="text-xs text-slate-500">Select all</span>
							</div>
						)}

						{isLoading ? (
							[...Array(5)].map((_, i) => (
								<div key={i} className="skeleton h-24 rounded-xl" />
							))
						) : tickets.length === 0 ? (
							<div className="card text-center py-16">
								<MessageSquare
									size={36}
									className="mx-auto text-slate-500 mb-3 opacity-20"
								/>
								<p className="text-slate-400 mb-1">No tickets found</p>
								<p className="text-xs text-slate-600">
									{activeFilterCount > 0
										? "Try adjusting your filters"
										: "Submit a ticket to get started"}
								</p>
							</div>
						) : (
							tickets.map((ticket: any) => (
								<TicketRow
									key={ticket.id}
									ticket={ticket}
									isAdmin={isAdmin}
									selected={selectedIds.includes(ticket.id)}
									onSelect={() => toggleSelect(ticket.id)}
									onClick={() => setSelectedTicket(ticket)}
								/>
							))
						)}
					</div>
				</>
			)}

			{/* ── Modals ──────────────────────────────────────────────── */}
			{showNewModal && (
				<NewTicketModal
					onClose={() => setShowNewModal(false)}
					onSuccess={() => {
						qc.invalidateQueries({ queryKey: ["feedback"], exact: false });
						setShowNewModal(false);
					}}
				/>
			)}

			{selectedTicket && (
				<TicketDetailModal
					ticketId={selectedTicket.id}
					isAdmin={isAdmin}
					currentUser={user}
					onClose={() => setSelectedTicket(null)}
					onUpdate={(data: any) =>
						updateMutation.mutate({ id: selectedTicket.id, data })
					}
					onDelete={() => {
						if (
							confirm(
								`Delete ticket ${selectedTicket.ticket_number}? This cannot be undone.`,
							)
						) {
							deleteMutation.mutate(selectedTicket.id);
						}
					}}
					isPending={updateMutation.isPending}
					isDeleting={deleteMutation.isPending}
				/>
			)}
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticket Row
// ─────────────────────────────────────────────────────────────────────────────

function TicketRow({ ticket: t, isAdmin, selected, onSelect, onClick }: any) {
	const slaSt = slaStatus(t);
	const cfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.open;
	const pri = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;

	return (
		<div
			className={clsx(
				"card-hover group flex items-start gap-3 transition-all",
				selected && "border-Swahilipot-500/40 bg-Swahilipot-900/10",
			)}>
			{isAdmin && (
				<input
					type="checkbox"
					checked={selected}
					onChange={onSelect}
					onClick={(e) => e.stopPropagation()}
					className="mt-1 rounded border-slate-600 bg-surface text-Swahilipot-500 shrink-0"
				/>
			)}

			<div
				onClick={onClick}
				className={clsx(
					"flex items-start gap-3 flex-1 min-w-0 cursor-pointer",
				)}>
				{/* Status icon */}
				<div
					className={clsx(
						"w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
						t.status === "open" && "bg-red-500/10",
						t.status === "in_progress" && "bg-amber-500/10",
						t.status === "resolved" && "bg-green-500/10",
						t.status === "closed" && "bg-slate-500/10",
					)}>
					{cfg.icon}
				</div>

				<div className="flex-1 min-w-0">
					{/* Title row */}
					<div className="flex items-center gap-2 flex-wrap">
						<span className="font-medium text-white text-sm group-hover:text-Swahilipot-400 transition-colors truncate">
							{t.ticket_number} — {t.title}
						</span>
						<span className={clsx("badge text-[10px]", cfg.badge)}>
							{cfg.label}
						</span>
						{t.priority && (
							<span
								className={clsx(
									"flex items-center gap-1 text-[10px] font-medium",
									pri.color,
								)}>
								<span className={clsx("w-1.5 h-1.5 rounded-full", pri.dot)} />
								{pri.label}
							</span>
						)}
						<SLABadge ticket={t} />
						{t.comment_count > 0 && (
							<span className="flex items-center gap-0.5 text-[10px] text-slate-500">
								<MessageSquare size={10} /> {t.comment_count}
							</span>
						)}
					</div>

					{/* Meta row */}
					<div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500 flex-wrap">
						{t.category && (
							<span className="badge-slate text-[10px]">{t.category}</span>
						)}
						{t.submitted_by_name && <span>By {t.submitted_by_name}</span>}
						{t.assigned_to_name && (
							<span className="flex items-center gap-0.5 text-Swahilipot-400/70">
								<User size={9} /> {t.assigned_to_name}
							</span>
						)}
						<span title={format(parseISO(t.created_at), "dd MMM yyyy, HH:mm")}>
							{formatDistanceToNow(parseISO(t.created_at), { addSuffix: true })}
						</span>
						{t.sla_due_at && !["resolved", "closed"].includes(t.status) && (
							<span
								className={clsx(
									"flex items-center gap-0.5",
									slaSt === "breached" || slaSt === "critical"
										? "text-red-400"
										: slaSt === "warning"
											? "text-amber-400"
											: "text-slate-500",
								)}>
								<CalendarClock size={9} />
								SLA{" "}
								{isPast(parseISO(t.sla_due_at))
									? "overdue"
									: `due ${formatDistanceToNow(parseISO(t.sla_due_at), { addSuffix: true })}`}
							</span>
						)}
					</div>
				</div>

				<ChevronRight
					size={14}
					className="text-slate-600 group-hover:text-slate-400 transition-colors shrink-0 mt-1"
				/>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// New Ticket Modal
// ─────────────────────────────────────────────────────────────────────────────

function NewTicketModal({ onClose, onSuccess }: any) {
	const {
		register,
		handleSubmit,
		watch,
		formState: { errors },
	} = useForm({
		defaultValues: {
			category: "",
			priority: "medium",
			title: "",
			description: "",
		},
	});
	const [attachments, setAttachments] = useState<File[]>([]);
	const fileRef = useRef<HTMLInputElement>(null);

	const mutation = useMutation({
		mutationFn: async (data: any) => {
			const fd = new FormData();
			Object.entries(data).forEach(([k, v]) => fd.append(k, v as string));
			attachments.forEach((f) => fd.append("files", f));
			return feedbackApi.submit(fd);
		},
		onSuccess: () => {
			toast.success("Ticket submitted. You'll be notified of updates.");
			onSuccess();
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Submission failed"),
	});

	const descVal = watch("description") || "";

	const handleFiles = (files: FileList | null) => {
		if (!files) return;
		const valid: File[] = [];
		Array.from(files).forEach((f) => {
			if (f.size > MAX_FILE_SIZE) {
				toast.error(`${f.name} exceeds 10 MB`);
				return;
			}
			if (!ALLOWED_TYPES.includes(f.type)) {
				toast.error(`${f.name} type not allowed`);
				return;
			}
			valid.push(f);
		});
		setAttachments((prev) => [...prev, ...valid]);
	};

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box max-w-xl" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h3 className="font-semibold text-white">Submit New Ticket</h3>
					<button
						onClick={onClose}
						className="text-slate-500 hover:text-slate-300">
						<X size={16} />
					</button>
				</div>

				<form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
					<div className="modal-body space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div className="input-group">
								<label className="input-label">Category *</label>
								<select
									{...register("category", {
										required: "Category is required",
									})}
									className="select-input">
									<option value="">Select…</option>
									{CATEGORIES.map((c) => (
										<option key={c} value={c}>
											{c}
										</option>
									))}
								</select>
								{errors.category && (
									<p className="text-red-400 text-xs mt-1">
										{errors.category.message as string}
									</p>
								)}
							</div>
							<div className="input-group">
								<label className="input-label">Priority</label>
								<select {...register("priority")} className="select-input">
									{Object.entries(PRIORITY_CONFIG).map(([v, c]) => (
										<option key={v} value={v}>
											{c.label} (SLA: {SLA_HOURS[v]}h)
										</option>
									))}
								</select>
							</div>
						</div>

						<div className="input-group">
							<label className="input-label">Title *</label>
							<input
								{...register("title", {
									required: "Title is required",
									maxLength: { value: 255, message: "Max 255 chars" },
								})}
								className="input"
								placeholder="Brief description of the issue"
							/>
							{errors.title && (
								<p className="text-red-400 text-xs mt-1">
									{errors.title.message as string}
								</p>
							)}
						</div>

						<div className="input-group">
							<label className="input-label">Full Description *</label>
							<textarea
								{...register("description", {
									required: "Description is required",
									minLength: { value: 20, message: "At least 20 characters" },
								})}
								rows={5}
								className="textarea"
								placeholder="Describe the issue in detail — when it started, how it affects you, steps to reproduce…"
							/>
							<div className="flex justify-between mt-1">
								{errors.description ? (
									<p className="text-red-400 text-xs">
										{errors.description.message as string}
									</p>
								) : (
									<span />
								)}
								<span className="text-xs text-slate-600">
									{descVal.length} chars
								</span>
							</div>
						</div>

						{/* Attachments */}
						<div className="input-group">
							<label className="input-label">Attachments (optional)</label>
							<div
								className="border border-dashed border-slate-700 rounded-xl p-4 text-center cursor-pointer hover:border-slate-500 transition-colors"
								onClick={() => fileRef.current?.click()}
								onDragOver={(e) => e.preventDefault()}
								onDrop={(e) => {
									e.preventDefault();
									handleFiles(e.dataTransfer.files);
								}}>
								<Paperclip size={18} className="mx-auto text-slate-500 mb-1" />
								<p className="text-xs text-slate-500">
									Click or drag files here
								</p>
								<p className="text-[10px] text-slate-600 mt-0.5">
									PDF, images, Word, ZIP — max 10 MB each
								</p>
								<input
									ref={fileRef}
									type="file"
									multiple
									hidden
									onChange={(e) => handleFiles(e.target.files)}
								/>
							</div>
							{attachments.length > 0 && (
								<div className="mt-2 space-y-1">
									{attachments.map((f, i) => (
										<div
											key={i}
											className="flex items-center justify-between text-xs text-slate-400 bg-surface rounded-lg px-3 py-1.5">
											<span className="truncate">{f.name}</span>
											<div className="flex items-center gap-2 shrink-0 ml-2">
												<span className="text-slate-600">
													{formatBytes(f.size)}
												</span>
												<button
													type="button"
													onClick={() =>
														setAttachments((p) => p.filter((_, j) => j !== i))
													}>
													<X
														size={12}
														className="text-slate-500 hover:text-red-400"
													/>
												</button>
											</div>
										</div>
									))}
								</div>
							)}
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
							{mutation.isPending ? "Submitting…" : "Submit Ticket"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticket Detail Modal (full detail fetch)
// ─────────────────────────────────────────────────────────────────────────────

type DetailTab = "details" | "comments" | "attachments" | "audit";

function TicketDetailModal({
	ticketId,
	isAdmin,
	currentUser,
	onClose,
	onUpdate,
	onDelete,
	isPending,
	isDeleting,
}: any) {
	const [detailTab, setDetailTab] = useState<DetailTab>("details");
	const [response, setResponse] = useState("");
	const [newStatus, setNewStatus] = useState("");
	const [newPriority, setNewPriority] = useState("");
	const [assignTo, setAssignTo] = useState("");
	const [satisfactionRating, setSatisfactionRating] = useState(0);
	const [satisfactionComment, setSatisfactionComment] = useState("");
	const [newComment, setNewComment] = useState("");
	const [isInternalComment, setIsInternalComment] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);
	const qc = useQueryClient();

	const { data: t, isLoading } = useQuery({
		queryKey: ["feedback-detail", ticketId],
		queryFn: () => feedbackApi.get(ticketId).then((r) => r.data),
		staleTime: 30000,
	});

	// Sync local state once ticket loads
	const [initialized, setInitialized] = useState(false);
	if (t && !initialized) {
		setResponse(t.admin_response || "");
		setNewStatus(t.status);
		setNewPriority(t.priority);
		setSatisfactionRating(t.satisfaction_rating || 0);
		setSatisfactionComment(t.satisfaction_comment || "");
		setInitialized(true);
	}

	const commentMutation = useMutation({
		mutationFn: (data: any) => feedbackApi.addComment(ticketId, data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["feedback-detail", ticketId] });
			qc.invalidateQueries({ queryKey: ["feedback"] });
			setNewComment("");
			toast.success("Comment added");
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Failed to add comment"),
	});

	const deleteCommentMutation = useMutation({
		mutationFn: (commentId: string) =>
			feedbackApi.deleteComment(ticketId, commentId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["feedback-detail", ticketId] });
			toast.success("Comment deleted");
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Failed to delete comment"),
	});

	const uploadMutation = useMutation({
		mutationFn: (file: File) => {
			const fd = new FormData();
			fd.append("file", file);
			fd.append("ticket", ticketId);
			return feedbackApi.uploadAttachment(ticketId, fd);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["feedback-detail", ticketId] });
			toast.success("File uploaded");
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Upload failed"),
	});

	const deleteAttachmentMutation = useMutation({
		mutationFn: (attId: string) =>
			feedbackApi.deleteAttachment(ticketId, attId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["feedback-detail", ticketId] });
			toast.success("Attachment removed");
		},
	});

	const handleSubmitUpdate = () => {
		const data: any = {};
		if (isAdmin) {
			if (newStatus !== t?.status) data.status = newStatus;
			if (newPriority !== t?.priority) data.priority = newPriority;
			if (response !== t?.admin_response) data.admin_response = response;
		} else {
			// submitter rating
			if (satisfactionRating) {
				data.satisfaction_rating = satisfactionRating;
				data.satisfaction_comment = satisfactionComment;
			}
		}
		if (Object.keys(data).length === 0) {
			toast("No changes to save.");
			return;
		}
		onUpdate(data);
		qc.invalidateQueries({ queryKey: ["feedback-detail", ticketId] });
	};

	const submitComment = () => {
		if (!newComment.trim()) return;
		commentMutation.mutate({
			body: newComment,
			is_internal: isInternalComment,
		});
	};

	const handleFileUpload = (files: FileList | null) => {
		if (!files) return;
		Array.from(files).forEach((f) => {
			if (f.size > MAX_FILE_SIZE) {
				toast.error(`${f.name} too large`);
				return;
			}
			uploadMutation.mutate(f);
		});
	};

	if (isLoading || !t) {
		return (
			<div className="modal-backdrop" onClick={onClose}>
				<div
					className="modal-box max-w-2xl flex items-center justify-center py-20"
					onClick={(e) => e.stopPropagation()}>
					<div className="animate-spin rounded-full w-8 h-8 border-2 border-Swahilipot-500 border-t-transparent" />
				</div>
			</div>
		);
	}

	const cfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.open;
	const pri = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
	const slaSt = slaStatus(t);
	const isSubmitter =
		t.submitted_by === currentUser?.id ||
		t.submitted_by_name?.includes(currentUser?.email || "");
	const canRate =
		isSubmitter &&
		["resolved", "closed"].includes(t.status) &&
		!t.satisfaction_rating;
	const visibleComments = isAdmin
		? t.comments || []
		: (t.comments || []).filter((c: any) => !c.is_internal);

	const detailTabs: { key: DetailTab; label: string; count?: number }[] = [
		{ key: "details", label: "Details" },
		{ key: "comments", label: "Comments", count: visibleComments.length },
		{
			key: "attachments",
			label: "Attachments",
			count: (t.attachments || []).length,
		},
		...(isAdmin
			? [
					{
						key: "audit" as DetailTab,
						label: "Audit Log",
						count: (t.audit_logs || []).length,
					},
				]
			: []),
	];

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div
				className="modal-box max-w-2xl max-h-[90vh] flex flex-col"
				onClick={(e) => e.stopPropagation()}>
				{/* Header */}
				<div className="modal-header shrink-0">
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 flex-wrap">
							<h3 className="font-semibold text-white truncate">
								{t.ticket_number} — {t.title}
							</h3>
							<span className={clsx("badge text-[10px]", cfg.badge)}>
								{cfg.label}
							</span>
							<span
								className={clsx(
									"flex items-center gap-1 text-[10px] font-medium",
									pri.color,
								)}>
								<span className={clsx("w-1.5 h-1.5 rounded-full", pri.dot)} />
								{pri.label}
							</span>
							<SLABadge ticket={t} />
						</div>
						<div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500 flex-wrap">
							{t.category && (
								<span className="badge-slate text-[10px]">{t.category}</span>
							)}
							<span>By {t.submitted_by_name}</span>
							{t.assigned_to_name && (
								<span className="flex items-center gap-0.5 text-Swahilipot-400/70">
									<User size={9} /> {t.assigned_to_name}
								</span>
							)}
							<span>
								{format(parseISO(t.created_at), "dd MMM yyyy, HH:mm")}
							</span>
							{t.resolved_at && (
								<span className="text-green-400">
									Resolved{" "}
									{formatDistanceToNow(parseISO(t.resolved_at), {
										addSuffix: true,
									})}
								</span>
							)}
						</div>
					</div>
					<div className="flex items-center gap-2 shrink-0">
						{isAdmin && (
							<button
								onClick={() => {
									if (confirm(`Delete ${t.ticket_number}?`)) onDelete();
								}}
								disabled={isDeleting}
								className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
								title="Delete ticket">
								<Trash2 size={14} />
							</button>
						)}
						<button
							onClick={onClose}
							className="p-1.5 text-slate-500 hover:text-slate-300">
							<X size={16} />
						</button>
					</div>
				</div>

				{/* Sub-tabs */}
				<div className="flex border-b border-surface-border gap-4 px-5 shrink-0">
					{detailTabs.map(({ key, label, count }) => (
						<button
							key={key}
							onClick={() => setDetailTab(key)}
							className={clsx(
								"pb-2.5 text-xs font-medium transition-colors border-b-2 -mb-px",
								detailTab === key
									? "border-Swahilipot-400 text-white"
									: "border-transparent text-slate-400 hover:text-slate-200",
							)}>
							{label}
							{count !== undefined && count > 0 && (
								<span className="ml-1 text-slate-600">({count})</span>
							)}
						</button>
					))}
				</div>

				{/* Body */}
				<div className="modal-body flex-1 overflow-y-auto space-y-4">
					{/* ── Details tab ─── */}
					{detailTab === "details" && (
						<>
							<div className="bg-surface rounded-xl p-4">
								<div className="text-xs text-slate-500 mb-2">
									Submitted by {t.submitted_by_name} ·{" "}
									{format(parseISO(t.created_at), "dd MMM yyyy, HH:mm")}
									{t.updated_at !== t.created_at && (
										<span className="ml-2">
											· Updated{" "}
											{formatDistanceToNow(parseISO(t.updated_at), {
												addSuffix: true,
											})}
										</span>
									)}
								</div>
								<p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
									{t.description}
								</p>
							</div>

							{/* SLA info */}
							{t.sla_due_at && (
								<div
									className={clsx(
										"rounded-xl p-3 border text-xs flex items-center gap-2",
										slaSt === "breached"
											? "bg-red-500/10 border-red-500/20 text-red-300"
											: slaSt === "critical"
												? "bg-red-500/10 border-red-500/20 text-red-300"
												: slaSt === "warning"
													? "bg-amber-500/10 border-amber-500/20 text-amber-300"
													: "bg-surface border-surface-border text-slate-400",
									)}>
									<CalendarClock size={14} />
									<span>
										SLA due:{" "}
										{format(parseISO(t.sla_due_at), "dd MMM yyyy, HH:mm")}
									</span>
									{t.resolved_at && t.time_to_resolve_seconds && (
										<span className="ml-auto text-green-400">
											Resolved in {Math.round(t.time_to_resolve_seconds / 3600)}
											h
										</span>
									)}
								</div>
							)}

							{/* Admin response */}
							{t.admin_response && (
								<div className="bg-Swahilipot-900/20 rounded-xl p-4 border border-Swahilipot-500/20">
									<div className="text-xs text-Swahilipot-400 mb-1 font-medium">
										Admin Response
									</div>
									<p className="text-sm text-slate-200 whitespace-pre-wrap">
										{t.admin_response}
									</p>
								</div>
							)}

							{/* Satisfaction rating (submitter on resolved ticket) */}
							{t.satisfaction_rating ? (
								<div className="bg-surface rounded-xl p-3 border border-surface-border">
									<div className="text-xs text-slate-500 mb-1">
										Satisfaction Rating
									</div>
									<StarRating value={t.satisfaction_rating} />
									{t.satisfaction_comment && (
										<p className="text-xs text-slate-400 mt-1">
											{t.satisfaction_comment}
										</p>
									)}
								</div>
							) : canRate ? (
								<div className="bg-surface rounded-xl p-4 border border-surface-border space-y-2">
									<p className="text-sm text-slate-300 font-medium">
										Rate your experience
									</p>
									<StarRating
										value={satisfactionRating}
										onChange={setSatisfactionRating}
									/>
									<textarea
										value={satisfactionComment}
										onChange={(e) => setSatisfactionComment(e.target.value)}
										rows={2}
										className="textarea text-sm"
										placeholder="Any additional feedback?"
									/>
								</div>
							) : null}

							{/* Admin controls */}
							{isAdmin && (
								<div className="space-y-3 border-t border-surface-border pt-4">
									<div className="grid grid-cols-2 gap-3">
										<div className="input-group">
											<label className="input-label">Status</label>
											<select
												value={newStatus}
												onChange={(e) => setNewStatus(e.target.value)}
												className="select-input">
												{Object.entries(STATUS_CONFIG).map(([v, c]) => (
													<option key={v} value={v}>
														{c.label}
													</option>
												))}
											</select>
										</div>
										<div className="input-group">
											<label className="input-label">Priority</label>
											<select
												value={newPriority}
												onChange={(e) => setNewPriority(e.target.value)}
												className="select-input">
												{Object.entries(PRIORITY_CONFIG).map(([v, c]) => (
													<option key={v} value={v}>
														{c.label}
													</option>
												))}
											</select>
										</div>
									</div>
									<div className="input-group">
										<label className="input-label">
											Response / Resolution Notes
										</label>
										<textarea
											value={response}
											onChange={(e) => setResponse(e.target.value)}
											rows={4}
											className="textarea"
											placeholder="Provide a response or resolution details…"
										/>
									</div>
								</div>
							)}
						</>
					)}

					{/* ── Comments tab ─── */}
					{detailTab === "comments" && (
						<div className="space-y-3">
							{visibleComments.length === 0 ? (
								<div className="text-center py-8 text-slate-500 text-sm">
									No comments yet
								</div>
							) : (
								visibleComments.map((c: any) => (
									<div
										key={c.id}
										className={clsx(
											"rounded-xl p-3.5 border",
											c.is_internal
												? "bg-amber-500/5 border-amber-500/20"
												: "bg-surface border-surface-border",
										)}>
										<div className="flex items-center justify-between mb-1.5">
											<div className="flex items-center gap-2">
												<span className="text-xs font-medium text-slate-300">
													{c.author_name}
												</span>
												{c.is_internal && (
													<span className="flex items-center gap-0.5 text-[10px] text-amber-400">
														<Lock size={9} /> Internal
													</span>
												)}
												{c.is_edited && (
													<span className="text-[10px] text-slate-600">
														(edited)
													</span>
												)}
											</div>
											<div className="flex items-center gap-2">
												<span className="text-[10px] text-slate-600">
													{formatDistanceToNow(parseISO(c.created_at), {
														addSuffix: true,
													})}
												</span>
												{(isAdmin || c.author === currentUser?.id) && (
													<button
														onClick={() => {
															if (confirm("Delete this comment?"))
																deleteCommentMutation.mutate(c.id);
														}}
														className="text-slate-600 hover:text-red-400 transition-colors">
														<Trash2 size={11} />
													</button>
												)}
											</div>
										</div>
										<p className="text-sm text-slate-300 whitespace-pre-wrap">
											{c.body}
										</p>
									</div>
								))
							)}

							{/* New comment */}
							<div className="border-t border-surface-border pt-3 space-y-2">
								<textarea
									value={newComment}
									onChange={(e) => setNewComment(e.target.value)}
									rows={3}
									className="textarea text-sm"
									placeholder="Add a comment…"
									onKeyDown={(e) => {
										if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
											submitComment();
									}}
								/>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										{isAdmin && (
											<label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
												<input
													type="checkbox"
													checked={isInternalComment}
													onChange={(e) =>
														setIsInternalComment(e.target.checked)
													}
													className="rounded border-slate-600 bg-surface text-amber-500"
												/>
												<Lock size={11} className="text-amber-400/70" />
												Internal note
											</label>
										)}
									</div>
									<button
										onClick={submitComment}
										disabled={!newComment.trim() || commentMutation.isPending}
										className="btn-primary text-sm py-1.5 flex items-center gap-1.5">
										<Send size={12} />
										{commentMutation.isPending ? "Sending…" : "Send"}
									</button>
								</div>
							</div>
						</div>
					)}

					{/* ── Attachments tab ─── */}
					{detailTab === "attachments" && (
						<div className="space-y-3">
							{(t.attachments || []).length === 0 ? (
								<div className="text-center py-8 text-slate-500 text-sm">
									No attachments
								</div>
							) : (
								(t.attachments || []).map((att: any) => (
									<div
										key={att.id}
										className="flex items-center gap-3 bg-surface rounded-xl px-4 py-3 border border-surface-border">
										<FileText size={16} className="text-slate-400 shrink-0" />
										<div className="flex-1 min-w-0">
											<p className="text-sm text-slate-300 truncate">
												{att.filename}
											</p>
											<p className="text-[10px] text-slate-600">
												{formatBytes(att.file_size)} · {att.uploaded_by_name}
											</p>
										</div>
										<div className="flex items-center gap-2 shrink-0">
											<a
												href={att.file}
												target="_blank"
												rel="noreferrer"
												className="p-1.5 text-slate-500 hover:text-slate-300">
												<Download size={14} />
											</a>
											{(isAdmin || att.uploaded_by === currentUser?.id) && (
												<button
													onClick={() => {
														if (confirm("Remove attachment?"))
															deleteAttachmentMutation.mutate(att.id);
													}}
													className="p-1.5 text-slate-600 hover:text-red-400 transition-colors">
													<Trash2 size={14} />
												</button>
											)}
										</div>
									</div>
								))
							)}

							{/* Upload */}
							<div
								className="border border-dashed border-slate-700 rounded-xl p-4 text-center cursor-pointer hover:border-slate-500 transition-colors"
								onClick={() => fileRef.current?.click()}
								onDragOver={(e) => e.preventDefault()}
								onDrop={(e) => {
									e.preventDefault();
									handleFileUpload(e.dataTransfer.files);
								}}>
								{uploadMutation.isPending ? (
									<div className="animate-spin rounded-full w-5 h-5 border-2 border-Swahilipot-500 border-t-transparent mx-auto" />
								) : (
									<>
										<Paperclip
											size={16}
											className="mx-auto text-slate-500 mb-1"
										/>
										<p className="text-xs text-slate-500">Upload attachment</p>
									</>
								)}
								<input
									ref={fileRef}
									type="file"
									multiple
									hidden
									onChange={(e) => handleFileUpload(e.target.files)}
								/>
							</div>
						</div>
					)}

					{/* ── Audit log tab (admin) ─── */}
					{detailTab === "audit" && isAdmin && (
						<div className="space-y-2">
							{(t.audit_logs || []).length === 0 ? (
								<div className="text-center py-8 text-slate-500 text-sm">
									No audit entries
								</div>
							) : (
								[...(t.audit_logs || [])].reverse().map((log: any) => (
									<div key={log.id} className="flex gap-3 text-xs">
										<div className="flex flex-col items-center shrink-0">
											<div className="w-1.5 h-1.5 rounded-full bg-Swahilipot-500 mt-1" />
											<div className="w-px flex-1 bg-surface-border" />
										</div>
										<div className="pb-3 flex-1">
											<div className="flex items-center gap-2 flex-wrap">
												<span className="font-medium text-slate-300">
													{log.actor_name}
												</span>
												<span className="badge-slate text-[10px]">
													{log.action.replace(/_/g, " ")}
												</span>
												<span className="text-slate-600">
													{formatDistanceToNow(parseISO(log.created_at), {
														addSuffix: true,
													})}
												</span>
											</div>
											{(log.old_value || log.new_value) && (
												<div className="mt-1 text-slate-500">
													{log.old_value && (
														<span className="line-through mr-2">
															{log.old_value}
														</span>
													)}
													{log.new_value && (
														<span className="text-slate-300">
															{log.new_value}
														</span>
													)}
												</div>
											)}
											{log.note && (
												<p className="mt-0.5 text-slate-600">{log.note}</p>
											)}
										</div>
									</div>
								))
							)}
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="modal-footer shrink-0">
					<button onClick={onClose} className="btn-secondary">
						Close
					</button>
					{(isAdmin || canRate) && (
						<button
							disabled={isPending}
							onClick={handleSubmitUpdate}
							className="btn-primary">
							{isPending ? "Saving…" : "Save Changes"}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats / Analytics Panel
// ─────────────────────────────────────────────────────────────────────────────

function StatsPanel({ stats: s }: { stats: any }) {
	if (!s)
		return (
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
				{[...Array(8)].map((_, i) => (
					<div key={i} className="skeleton h-24 rounded-xl" />
				))}
			</div>
		);

	return (
		<div className="space-y-6">
			{/* KPI row */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
				{[
					{ label: "Total Tickets", value: s.total, color: "text-white" },
					{ label: "Open", value: s.open, color: "text-red-400" },
					{
						label: "SLA Breached",
						value: s.sla_breached,
						color: "text-red-400",
					},
					{
						label: "SLA At Risk",
						value: s.sla_at_risk,
						color: "text-amber-400",
					},
					{ label: "Resolved", value: s.resolved, color: "text-green-400" },
					{
						label: "Unassigned Open",
						value: s.unassigned,
						color: "text-amber-400",
					},
					{
						label: "Avg Resolution",
						value: s.avg_resolution_hours ? `${s.avg_resolution_hours}h` : "—",
						color: "text-blue-400",
					},
					{
						label: "Avg Satisfaction",
						value: s.avg_satisfaction ? `${s.avg_satisfaction}/5` : "—",
						color: "text-amber-400",
					},
				].map(({ label, value, color }) => (
					<div key={label} className="stat-card">
						<div className={clsx("stat-value", color)}>{value}</div>
						<div className="stat-label">{label}</div>
					</div>
				))}
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
				{/* By category */}
				<div className="card">
					<h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-1.5">
						<Tag size={14} className="text-Swahilipot-400" /> By Category
					</h4>
					<div className="space-y-2">
						{(s.by_category || []).map((row: any) => {
							const pct = s.total ? Math.round((row.count / s.total) * 100) : 0;
							return (
								<div key={row.category}>
									<div className="flex justify-between text-xs text-slate-400 mb-1">
										<span>{row.category}</span>
										<span>
											{row.count} ({pct}%)
										</span>
									</div>
									<div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
										<div
											className="h-full bg-Swahilipot-500 rounded-full transition-all"
											style={{ width: `${pct}%` }}
										/>
									</div>
								</div>
							);
						})}
					</div>
				</div>

				{/* By status */}
				<div className="card">
					<h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-1.5">
						<Activity size={14} className="text-Swahilipot-400" /> By Status
					</h4>
					<div className="space-y-2">
						{(s.by_status || []).map((row: any) => {
							const cfg = STATUS_CONFIG[row.status] || STATUS_CONFIG.open;
							const pct = s.total ? Math.round((row.count / s.total) * 100) : 0;
							return (
								<div key={row.status} className="flex items-center gap-2">
									{cfg.icon}
									<div className="flex-1">
										<div className="flex justify-between text-xs text-slate-400 mb-1">
											<span>{cfg.label}</span>
											<span>{row.count}</span>
										</div>
										<div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
											<div
												className={clsx(
													"h-full rounded-full transition-all",
													row.status === "open"
														? "bg-red-400"
														: row.status === "in_progress"
															? "bg-amber-400"
															: row.status === "resolved"
																? "bg-green-400"
																: "bg-slate-500",
												)}
												style={{ width: `${pct}%` }}
											/>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				</div>

				{/* By priority */}
				<div className="card">
					<h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-1.5">
						<ShieldAlert size={14} className="text-Swahilipot-400" /> By
						Priority
					</h4>
					<div className="space-y-2">
						{(s.by_priority || []).map((row: any) => {
							const pri =
								PRIORITY_CONFIG[row.priority] || PRIORITY_CONFIG.medium;
							const pct = s.total ? Math.round((row.count / s.total) * 100) : 0;
							return (
								<div key={row.priority} className="flex items-center gap-2">
									<span
										className={clsx("w-2 h-2 rounded-full shrink-0", pri.dot)}
									/>
									<div className="flex-1">
										<div className="flex justify-between text-xs text-slate-400 mb-1">
											<span>{pri.label}</span>
											<span>{row.count}</span>
										</div>
										<div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
											<div
												className={clsx(
													"h-full rounded-full transition-all",
													pri.dot,
												)}
												style={{ width: `${pct}%` }}
											/>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</div>

			{/* Daily volume (last 30 days) */}
			{s.daily_volume?.length > 0 && (
				<div className="card">
					<h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-1.5">
						<TrendingUp size={14} className="text-Swahilipot-400" /> Daily
						Volume — Last 30 Days
					</h4>
					<div className="flex items-end gap-1 h-24">
						{(s.daily_volume || []).map((d: any) => {
							const max = Math.max(...s.daily_volume.map((x: any) => x.count));
							const pct = max > 0 ? (d.count / max) * 100 : 0;
							return (
								<div
									key={d.day}
									className="flex-1 flex flex-col items-center gap-1 group relative">
									<div className="absolute bottom-6 -translate-x-1/2 left-1/2 bg-surface-hover text-xs text-slate-300 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
										{d.day}: {d.count}
									</div>
									<div
										className="w-full bg-Swahilipot-500/60 hover:bg-Swahilipot-500 rounded-sm transition-all"
										style={{ height: `${Math.max(pct, 4)}%` }}
									/>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* Top assignees */}
			{s.top_assignees?.length > 0 && (
				<div className="card">
					<h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-1.5">
						<Users size={14} className="text-Swahilipot-400" /> Top Assignees
					</h4>
					<div className="space-y-2">
						{s.top_assignees.map((a: any, i: number) => {
							const name =
								[a.assigned_to__first_name, a.assigned_to__last_name]
									.filter(Boolean)
									.join(" ") || a.assigned_to__email;
							return (
								<div key={i} className="flex items-center gap-3 text-sm">
									<span className="text-slate-600 text-xs w-5 text-right">
										{i + 1}.
									</span>
									<span className="text-slate-300 flex-1">{name}</span>
									<span className="text-slate-500 text-xs">
										{a.count} tickets
									</span>
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
