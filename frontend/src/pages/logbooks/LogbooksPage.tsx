// Nexus — Daily Logbooks (Production)
// Full feature set: list → entries → detail modal, supervisor review,
// digital signature pad, attachments, threaded comments, audit log,
// PDF export, stats summary, mood/rating pickers, filters, pagination.

import {
	useState,
	useRef,
	useCallback,
	useEffect,
	MouseEvent,
	ChangeEvent,
} from "react";
import {
	useQuery,
	useMutation,
	useQueryClient,
	useInfiniteQuery,
} from "@tanstack/react-query";
import { format, parseISO, differenceInDays, isWithinInterval } from "date-fns";
import {
	BookOpen,
	Plus,
	CheckCircle,
	Clock,
	Edit3,
	ChevronRight,
	AlertCircle,
	X,
	Upload,
	Download,
	Paperclip,
	MessageSquare,
	BarChart2,
	Shield,
	Eye,
	Pen,
	ThumbsUp,
	ThumbsDown,
	RefreshCcw,
	ChevronDown,
	Star,
	History,
	FileText,
	Smile,
	Frown,
	Meh,
	Filter,
	Search,
	CheckSquare,
	Trash2,
	Send,
	RotateCcw,
	Info,
} from "lucide-react";
import { logbooksApi, usersApi, useAuthStore } from "../../services/api";
import { useForm, Controller } from "react-hook-form";
import toast from "react-hot-toast";
import clsx from "clsx";

// ─────────────────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────────────────

const SUPERVISOR_ROLES = new Set([
	"supervisor",
	"department_leader",
	"hr_officer",
	"system_admin",
	"broadcast_admin",
]);

const STATUS_STYLES: Record<string, string> = {
	draft: "badge-slate",
	submitted: "badge-blue",
	approved: "badge-green",
	rejected: "badge-red",
	revision_requested: "badge-yellow",
};

const STATUS_LABELS: Record<string, string> = {
	draft: "Draft",
	submitted: "Submitted",
	approved: "Approved",
	rejected: "Rejected",
	revision_requested: "Revision Requested",
};

const MOOD_MAP: Record<
	number,
	{ label: string; icon: JSX.Element; color: string }
> = {
	1: { label: "Very Poor", icon: <Frown size={14} />, color: "text-red-400" },
	2: { label: "Poor", icon: <Frown size={14} />, color: "text-orange-400" },
	3: { label: "Neutral", icon: <Meh size={14} />, color: "text-yellow-400" },
	4: { label: "Good", icon: <Smile size={14} />, color: "text-emerald-400" },
	5: { label: "Excellent", icon: <Smile size={14} />, color: "text-green-400" },
};

function fmtDate(d?: string | null) {
	return d ? format(parseISO(d), "dd MMM yyyy") : "—";
}
function fmtDateTime(d?: string | null) {
	return d ? format(parseISO(d), "dd MMM yyyy, HH:mm") : "—";
}

/**
 * Safely extracts a human-readable string from any DRF error response shape.
 * Handles:
 *   { detail: "string" }
 *   { detail: { field: ["msg"] } }              ← serializer field errors
 *   { detail: { field: "msg" } }
 *   { field: ["msg"], other_field: ["msg"] }     ← no "detail" wrapper at all
 *   { non_field_errors: ["msg"] }
 *   plain string / array / anything else
 * Never returns an object — always a string, so it's always safe to render.
 */
function getErrorMessage(e: any, fallback = "Something went wrong"): string {
	const data = e?.response?.data;
	if (!data) return fallback;

	const flatten = (val: any): string | null => {
		if (val == null) return null;
		if (typeof val === "string") return val;
		if (Array.isArray(val)) {
			return val
				.map((v) => flatten(v))
				.filter(Boolean)
				.join(" ");
		}
		if (typeof val === "object") {
			return Object.entries(val)
				.map(([key, msgs]) => {
					const msg = flatten(msgs);
					return msg ? `${key}: ${msg}` : null;
				})
				.filter(Boolean)
				.join(" · ");
		}
		return String(val);
	};

	// Prefer "detail" if present, otherwise flatten the whole payload
	const fromDetail = data.detail !== undefined ? flatten(data.detail) : null;
	const message = fromDetail || flatten(data);
	return message || fallback;
}

function StarRating({
	value,
	onChange,
	readOnly = false,
	size = 16,
}: {
	value: number | null;
	onChange?: (v: number) => void;
	readOnly?: boolean;
	size?: number;
}) {
	return (
		<div className="flex gap-0.5">
			{[1, 2, 3, 4, 5].map((n) => (
				<Star
					key={n}
					size={size}
					className={clsx(
						"transition-colors",
						n <= (value ?? 0)
							? "text-yellow-400 fill-yellow-400"
							: "text-slate-600",
						!readOnly && "cursor-pointer hover:text-yellow-300",
					)}
					onClick={() => !readOnly && onChange?.(n)}
				/>
			))}
		</div>
	);
}

function MoodPicker({
	value,
	onChange,
	readOnly = false,
}: {
	value: number | null;
	onChange?: (v: number) => void;
	readOnly?: boolean;
}) {
	return (
		<div className="flex gap-2">
			{([1, 2, 3, 4, 5] as const).map((n) => {
				const m = MOOD_MAP[n];
				return (
					<button
						key={n}
						type="button"
						disabled={readOnly}
						onClick={() => !readOnly && onChange?.(n)}
						className={clsx(
							"flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg border text-xs transition-all",
							value === n
								? "border-Nexus-500 bg-Nexus-500/10 " + m.color
								: "border-surface-border text-slate-500 hover:border-slate-600",
							readOnly && "cursor-default",
						)}>
						<span className={value === n ? m.color : ""}>{m.icon}</span>
						<span>{m.label}</span>
					</button>
				);
			})}
		</div>
	);
}

// ─────────────────────────────────────────────────────────
// Types (mirrors backend serializers)
// ─────────────────────────────────────────────────────────

interface UserMin {
	id: string;
	full_name: string;
	email: string;
	role: string;
	avatar: string | null;
}

interface Attachment {
	id: string;
	original_name: string;
	file_size: number;
	content_type: string;
	is_image: boolean;
	url: string;
	uploaded_at: string;
}

interface Comment {
	id: string;
	body: string;
	author: UserMin;
	parent: string | null;
	replies: Comment[];
	created_at: string;
	edited: boolean;
	can_edit: boolean;
	can_delete: boolean;
}

interface AuditLog {
	id: string;
	action: string;
	actor: UserMin;
	detail: Record<string, unknown>;
	timestamp: string;
}

interface LogbookEntry {
	id: string;
	logbook: string;
	date: string;
	activities: string;
	skills_acquired: string;
	challenges: string;
	reflection: string;
	location: string;
	reporting_time: string | null;
	closing_time: string | null;
	hours_worked: number | null;
	mood_rating: number | null;
	status: string;
	submitted_at: string | null;
	reviewed_at: string | null;
	reviewed_by: UserMin | null;
	supervisor_comments: string;
	supervisor_rating: number | null;
	intern_acknowledged: boolean;
	intern_acknowledged_at: string | null;
	attachments: Attachment[];
	comments: Comment[];
	audit_logs: AuditLog[];
	attachment_count: number;
	comment_count: number;
	can_edit: boolean;
	can_review: boolean;
	created_at: string;
	updated_at: string;
}

interface Logbook {
	id: string;
	title: string;
	description: string;
	intern: UserMin;
	supervisor: UserMin | null;
	start_date: string;
	end_date: string;
	final_submitted: boolean;
	final_submitted_at: string | null;
	final_approved: boolean;
	final_approved_at: string | null;
	overall_rating: number | null;
	total_entries: number;
	submitted_entries: number;
	approved_entries: number;
	completion_percentage: number;
	intern_signed_at: string | null;
	supervisor_signed_at: string | null;
	created_at: string;
}

// ─────────────────────────────────────────────────────────
// Tabs for entry detail
// ─────────────────────────────────────────────────────────

type EntryTab = "details" | "attachments" | "comments" | "audit";

// ─────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────

export default function LogbooksPage() {
	const { user } = useAuthStore();
	const qc = useQueryClient();
	const isSupervisor = SUPERVISOR_ROLES.has(user?.role || "");

	// View state
	const [selectedLogbook, setSelectedLogbook] = useState<Logbook | null>(null);
	const [showEntryModal, setShowEntryModal] = useState(false);
	const [selectedEntry, setSelectedEntry] = useState<LogbookEntry | null>(null);
	const [showLogbookModal, setShowLogbookModal] = useState(false);
	const [showSignatureModal, setShowSignatureModal] = useState(false);
	const [showSummaryModal, setShowSummaryModal] = useState(false);
	const [showAuditModal, setShowAuditModal] = useState(false);

	// Filters
	const [entrySearch, setEntrySearch] = useState("");
	const [statusFilter, setStatusFilter] = useState("all");

	// ── Logbooks list ──────────────────────────────────────

	const { data: logbooksData, isLoading: logbooksLoading } = useQuery({
		queryKey: ["logbooks"],
		queryFn: () => logbooksApi.list().then((r) => r.data),
	});

	const logbooks: Logbook[] = Array.isArray(logbooksData)
		? logbooksData
		: Array.isArray(logbooksData?.results)
			? logbooksData.results
			: [];

	// ── Entries list ───────────────────────────────────────

	const { data: entriesData, isLoading: entriesLoading } = useQuery({
		queryKey: ["logbook-entries", selectedLogbook?.id],
		queryFn: () => logbooksApi.entries(selectedLogbook!.id).then((r) => r.data),
		enabled: !!selectedLogbook,
	});

	const allEntries: LogbookEntry[] = Array.isArray(entriesData)
		? entriesData
		: Array.isArray(entriesData?.results)
			? entriesData.results
			: [];

	const entries = allEntries.filter((e) => {
		const matchStatus = statusFilter === "all" || e.status === statusFilter;
		const matchSearch =
			!entrySearch ||
			e.activities.toLowerCase().includes(entrySearch.toLowerCase()) ||
			e.date.includes(entrySearch);
		return matchStatus && matchSearch;
	});

	// ── Summary ────────────────────────────────────────────

	const { data: summary } = useQuery({
		queryKey: ["logbook-summary", selectedLogbook?.id],
		queryFn: () => logbooksApi.summary(selectedLogbook!.id).then((r) => r.data),
		enabled: !!selectedLogbook,
	});

	// ── Mutations ──────────────────────────────────────────

	const createEntryMutation = useMutation({
		mutationFn: (data: any) => logbooksApi.addEntry(selectedLogbook!.id, data),
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: ["logbook-entries", selectedLogbook?.id],
			});
			qc.invalidateQueries({
				queryKey: ["logbook-summary", selectedLogbook?.id],
			});
			setShowEntryModal(false);
			setSelectedEntry(null);
			toast.success("Entry saved!");
		},
		onError: (e: any) =>
			toast.error(getErrorMessage(e, "Failed to save entry")),
	});

	const updateEntryMutation = useMutation({
		mutationFn: ({ id, data }: { id: string; data: any }) =>
			logbooksApi.updateEntry(selectedLogbook!.id, id, data),
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: ["logbook-entries", selectedLogbook?.id],
			});
			setShowEntryModal(false);
			setSelectedEntry(null);
			toast.success("Entry updated!");
		},
		onError: (e: any) =>
			toast.error(getErrorMessage(e, "Failed to update entry")),
	});

	const submitEntryMutation = useMutation({
		mutationFn: (entryId: string) =>
			logbooksApi.submitEntry(selectedLogbook!.id, entryId),
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: ["logbook-entries", selectedLogbook?.id],
			});
			toast.success("Entry submitted for review!");
		},
		onError: (e: any) => toast.error(getErrorMessage(e, "Failed to submit")),
	});

	const approveEntryMutation = useMutation({
		mutationFn: ({ id, data }: { id: string; data: any }) =>
			logbooksApi.approveEntry(selectedLogbook!.id, id, data),
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: ["logbook-entries", selectedLogbook?.id],
			});
			setShowEntryModal(false);
			toast.success("Entry approved!");
		},
		onError: (e: any) => toast.error(getErrorMessage(e, "Failed to approve")),
	});

	const rejectEntryMutation = useMutation({
		mutationFn: ({ id, data }: { id: string; data: any }) =>
			logbooksApi.rejectEntry(selectedLogbook!.id, id, data),
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: ["logbook-entries", selectedLogbook?.id],
			});
			setShowEntryModal(false);
			toast.success("Entry rejected.");
		},
		onError: (e: any) => toast.error(getErrorMessage(e, "Failed to reject")),
	});

	const revisionMutation = useMutation({
		mutationFn: ({ id, data }: { id: string; data: any }) =>
			logbooksApi.requestRevision(selectedLogbook!.id, id, data),
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: ["logbook-entries", selectedLogbook?.id],
			});
			setShowEntryModal(false);
			toast.success("Revision requested.");
		},
		onError: (e: any) =>
			toast.error(getErrorMessage(e, "Failed to request revision")),
	});

	const submitLogbookMutation = useMutation({
		mutationFn: (lbId: string) => logbooksApi.submitLogbook(lbId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["logbooks"] });
			toast.success("Logbook submitted for final review!");
		},
		onError: (e: any) =>
			toast.error(getErrorMessage(e, "Failed to submit logbook")),
	});

	const approveLogbookMutation = useMutation({
		mutationFn: ({ id, data }: { id: string; data: any }) =>
			logbooksApi.approveLogbook(id, data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["logbooks"] });
			toast.success("Logbook approved!");
		},
		onError: (e: any) =>
			toast.error(getErrorMessage(e, "Failed to approve logbook")),
	});

	const exportMutation = useMutation({
		mutationFn: (lbId: string) => logbooksApi.export(lbId),
		onSuccess: (res) => {
			const url = window.URL.createObjectURL(new Blob([res.data]));
			const a = document.createElement("a");
			a.href = url;
			a.download = `logbook_${selectedLogbook?.id}.pdf`;
			a.click();
			window.URL.revokeObjectURL(url);
		},
		onError: () => toast.error("Export failed"),
	});

	// ── Handlers ───────────────────────────────────────────

	function openNewEntry() {
		setSelectedEntry(null);
		setShowEntryModal(true);
	}

	function openEntry(e: LogbookEntry) {
		setSelectedEntry(e);
		setShowEntryModal(true);
	}

	function handleEntrySave(data: any) {
		if (selectedEntry && selectedEntry.can_edit) {
			// Intern editing their own draft/rejected/revision-requested entry
			updateEntryMutation.mutate({ id: selectedEntry.id, data });
		} else if (!selectedEntry) {
			// Brand new entry
			createEntryMutation.mutate(data);
		} else if (selectedEntry && isSupervisor) {
			// Supervisor saving comments/rating on an entry that isn't in the
			// formal "submitted, awaiting review" state (e.g. already approved,
			// rejected, or still draft). The backend's CanEditEntry permission
			// explicitly allows supervisors to PATCH any entry for this purpose.
			updateEntryMutation.mutate({ id: selectedEntry.id, data });
		}
	}

	function handleApprove(data: any) {
		if (selectedEntry)
			approveEntryMutation.mutate({ id: selectedEntry.id, data });
	}

	function handleReject(data: any) {
		if (selectedEntry)
			rejectEntryMutation.mutate({ id: selectedEntry.id, data });
	}

	function handleRevision(data: any) {
		if (selectedEntry) revisionMutation.mutate({ id: selectedEntry.id, data });
	}

	// ─────────────────────────────────────────────────────────
	// Stats bar
	// ─────────────────────────────────────────────────────────

	const statsBar =
		selectedLogbook && summary ? (
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
				{[
					{
						label: "Total",
						value: summary.total_entries,
						color: "text-blue-400",
					},
					{
						label: "Approved",
						value: summary.entries_by_status?.approved ?? 0,
						color: "text-green-400",
					},
					{
						label: "Pending",
						value: summary.entries_by_status?.submitted ?? 0,
						color: "text-yellow-400",
					},
					{
						label: "Completion",
						value: `${summary.completion_percentage}%`,
						color: "text-Nexus-400",
					},
				].map((s) => (
					<div key={s.label} className="card py-3 text-center">
						<p className={clsx("text-xl font-bold", s.color)}>{s.value}</p>
						<p className="text-[11px] text-slate-500 mt-0.5">{s.label}</p>
					</div>
				))}
			</div>
		) : null;

	// ─────────────────────────────────────────────────────────
	// Progress bar
	// ─────────────────────────────────────────────────────────

	const ProgressBar = ({ pct }: { pct: number }) => (
		<div className="w-full bg-slate-800 rounded-full h-1.5 mt-2">
			<div
				className="h-1.5 rounded-full bg-Nexus-500 transition-all"
				style={{ width: `${Math.min(pct, 100)}%` }}
			/>
		</div>
	);

	// ─────────────────────────────────────────────────────────
	// Render
	// ─────────────────────────────────────────────────────────

	return (
		<div className="space-y-6 animate-fade-in">
			{/* Page header */}
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<BookOpen size={22} className="text-Nexus-400" />
						Logbooks
					</h1>
					<p className="page-subtitle">
						Daily activity entries · supervisor review · digital signatures
					</p>
				</div>
				<div className="flex items-center gap-2">
					{/* Create logbook (supervisors/HR) */}
					{isSupervisor && (
						<button
							onClick={() => setShowLogbookModal(true)}
							className="btn-secondary btn-sm">
							<Plus size={13} /> New Logbook
						</button>
					)}
					{/* Add entry (interns inside a logbook) */}
					{selectedLogbook &&
						!isSupervisor &&
						!selectedLogbook.final_submitted && (
							<button onClick={openNewEntry} className="btn-primary">
								<Plus size={14} /> Add Entry
							</button>
						)}
					{/* Actions inside a selected logbook */}
					{selectedLogbook && (
						<>
							<button
								onClick={() => exportMutation.mutate(selectedLogbook.id)}
								disabled={exportMutation.isPending}
								className="btn-secondary btn-sm"
								title="Export PDF">
								<Download size={14} />
							</button>
							<button
								onClick={() => setShowSummaryModal(true)}
								className="btn-secondary btn-sm"
								title="Progress summary">
								<BarChart2 size={14} />
							</button>
							<button
								onClick={() => setShowAuditModal(true)}
								className="btn-secondary btn-sm"
								title="Audit trail">
								<History size={14} />
							</button>
							{/* Signature (intern + supervisor) */}
							<button
								onClick={() => setShowSignatureModal(true)}
								className="btn-secondary btn-sm"
								title="Digital signature">
								<Pen size={14} />
							</button>
						</>
					)}
				</div>
			</div>

			{/* ── Logbook list ── */}
			{!selectedLogbook ? (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{logbooksLoading ? (
						[...Array(3)].map((_, i) => (
							<div key={i} className="skeleton h-40 rounded-xl" />
						))
					) : logbooks.length === 0 ? (
						<div className="col-span-3 card text-center py-14">
							<BookOpen
								size={36}
								className="mx-auto text-slate-600 mb-3 opacity-40"
							/>
							<p className="text-slate-400">No logbooks found.</p>
							{isSupervisor && (
								<button
									onClick={() => setShowLogbookModal(true)}
									className="btn-primary mt-4 mx-auto">
									<Plus size={14} /> Create Logbook
								</button>
							)}
						</div>
					) : (
						logbooks.map((lb) => (
							<LogbookCard
								key={lb.id}
								lb={lb}
								isSupervisor={isSupervisor}
								onClick={() => setSelectedLogbook(lb)}
								onApprove={(data) =>
									approveLogbookMutation.mutate({ id: lb.id, data })
								}
								onFinalSubmit={() => submitLogbookMutation.mutate(lb.id)}
							/>
						))
					)}
				</div>
			) : (
				/* ── Entry list ── */
				<div className="space-y-4">
					{/* Breadcrumb + back */}
					<div className="flex items-center gap-2 text-sm text-slate-400">
						<button
							onClick={() => {
								setSelectedLogbook(null);
								setEntrySearch("");
								setStatusFilter("all");
							}}
							className="btn-secondary btn-sm">
							← All Logbooks
						</button>
						<ChevronRight size={14} />
						<span className="text-white font-medium">
							{selectedLogbook.title}
						</span>
					</div>

					{/* Final submit banner (intern) */}
					{!isSupervisor &&
						!selectedLogbook.final_submitted &&
						allEntries.filter((e) =>
							["submitted", "approved"].includes(e.status),
						).length > 0 && (
							<div className="card border-l-4 border-l-Nexus-500 flex items-center justify-between gap-4">
								<div className="flex items-start gap-2">
									<Info size={16} className="text-Nexus-400 mt-0.5 shrink-0" />
									<p className="text-sm text-slate-300">
										Ready to finalise? Submit your logbook for final supervisor
										approval.
									</p>
								</div>
								<button
									className="btn-primary btn-sm shrink-0"
									disabled={submitLogbookMutation.isPending}
									onClick={() =>
										submitLogbookMutation.mutate(selectedLogbook.id)
									}>
									{submitLogbookMutation.isPending
										? "Submitting…"
										: "Final Submit"}
								</button>
							</div>
						)}

					{/* Final approve banner (supervisor) */}
					{isSupervisor &&
						selectedLogbook.final_submitted &&
						!selectedLogbook.final_approved && (
							<div className="card border-l-4 border-l-green-500 flex items-center justify-between gap-4">
								<div className="flex items-start gap-2">
									<CheckCircle
										size={16}
										className="text-green-400 mt-0.5 shrink-0"
									/>
									<p className="text-sm text-slate-300">
										Intern has submitted this logbook for final approval.
									</p>
								</div>
								<button
									className="btn-primary btn-sm shrink-0 bg-green-600 hover:bg-green-500"
									onClick={() =>
										approveLogbookMutation.mutate({
											id: selectedLogbook.id,
											data: {},
										})
									}
									disabled={approveLogbookMutation.isPending}>
									Final Approve
								</button>
							</div>
						)}

					{/* Stats */}
					{statsBar}

					{/* Filters */}
					<div className="flex flex-wrap items-center gap-2">
						<div className="relative flex-1 min-w-[180px]">
							<Search
								size={14}
								className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
							/>
							<input
								value={entrySearch}
								onChange={(e) => setEntrySearch(e.target.value)}
								placeholder="Search entries…"
								className="input pl-8 py-1.5 text-sm"
							/>
						</div>
						<select
							value={statusFilter}
							onChange={(e) => setStatusFilter(e.target.value)}
							className="input text-sm py-1.5 w-auto">
							<option value="all">All statuses</option>
							{Object.entries(STATUS_LABELS).map(([k, v]) => (
								<option key={k} value={k}>
									{v}
								</option>
							))}
						</select>
					</div>

					{/* Entry cards */}
					<div className="card">
						<div className="flex items-center justify-between mb-5">
							<div>
								<h3 className="font-semibold text-white">
									{selectedLogbook.title}
								</h3>
								<p className="text-xs text-slate-400 mt-0.5">
									{fmtDate(selectedLogbook.start_date)} —{" "}
									{fmtDate(selectedLogbook.end_date)}
								</p>
							</div>
							{!isSupervisor && !selectedLogbook.final_submitted && (
								<button onClick={openNewEntry} className="btn-primary btn-sm">
									<Plus size={13} /> Add Entry
								</button>
							)}
						</div>

						{entriesLoading ? (
							[...Array(4)].map((_, i) => (
								<div key={i} className="skeleton h-20 rounded-xl mb-3" />
							))
						) : entries.length === 0 ? (
							<div className="text-center py-10 text-slate-500">
								<BookOpen size={28} className="mx-auto mb-2 opacity-30" />
								<p>No entries found.</p>
							</div>
						) : (
							<div className="space-y-2">
								{entries.map((entry) => (
									<EntryCard
										key={entry.id}
										entry={entry}
										isSupervisor={isSupervisor}
										onOpen={() => openEntry(entry)}
										onQuickSubmit={() => submitEntryMutation.mutate(entry.id)}
									/>
								))}
							</div>
						)}
					</div>
				</div>
			)}

			{/* ── Modals ── */}
			{showEntryModal && selectedLogbook && (
				<EntryModal
					entry={selectedEntry}
					logbook={selectedLogbook}
					isSupervisor={isSupervisor}
					onClose={() => {
						setShowEntryModal(false);
						setSelectedEntry(null);
					}}
					onSave={handleEntrySave}
					onApprove={handleApprove}
					onReject={handleReject}
					onRevision={handleRevision}
					onQuickSubmit={
						selectedEntry
							? () => submitEntryMutation.mutate(selectedEntry.id)
							: undefined
					}
					isPending={
						createEntryMutation.isPending ||
						updateEntryMutation.isPending ||
						approveEntryMutation.isPending ||
						rejectEntryMutation.isPending ||
						revisionMutation.isPending
					}
					logbookId={selectedLogbook.id}
				/>
			)}

			{showSignatureModal && selectedLogbook && (
				<SignatureModal
					logbook={selectedLogbook}
					isSupervisor={isSupervisor}
					onClose={() => setShowSignatureModal(false)}
					onSaved={() => {
						qc.invalidateQueries({ queryKey: ["logbooks"] });
						setShowSignatureModal(false);
						toast.success("Signature saved.");
					}}
				/>
			)}

			{showSummaryModal && selectedLogbook && summary && (
				<SummaryModal
					logbook={selectedLogbook}
					summary={summary}
					onClose={() => setShowSummaryModal(false)}
				/>
			)}

			{showAuditModal && selectedLogbook && (
				<AuditModal
					logbookId={selectedLogbook.id}
					onClose={() => setShowAuditModal(false)}
				/>
			)}

			{showLogbookModal && isSupervisor && (
				<CreateLogbookModal
					onClose={() => setShowLogbookModal(false)}
					onCreated={() => {
						qc.invalidateQueries({ queryKey: ["logbooks"] });
						setShowLogbookModal(false);
						toast.success("Logbook created!");
					}}
				/>
			)}
		</div>
	);
}

// ─────────────────────────────────────────────────────────
// LogbookCard
// ─────────────────────────────────────────────────────────

function LogbookCard({
	lb,
	isSupervisor,
	onClick,
	onApprove,
	onFinalSubmit,
}: {
	lb: Logbook;
	isSupervisor: boolean;
	onClick: () => void;
	onApprove: (data: any) => void;
	onFinalSubmit: () => void;
}) {
	return (
		<div className="card-hover" onClick={onClick}>
			<div className="flex items-start justify-between mb-3">
				<BookOpen size={20} className="text-Nexus-400" />
				<span
					className={clsx(
						"badge",
						lb.final_approved
							? "badge-green"
							: lb.final_submitted
								? "badge-blue"
								: "badge-slate",
					)}>
					{lb.final_approved
						? "Approved"
						: lb.final_submitted
							? "Under Review"
							: "Active"}
				</span>
			</div>
			<h3 className="font-semibold text-white leading-tight">{lb.title}</h3>
			{isSupervisor && (
				<p className="text-xs text-Nexus-400 mt-0.5">{lb.intern?.full_name}</p>
			)}
			<p className="text-xs text-slate-400 mt-1">
				{fmtDate(lb.start_date)} — {fmtDate(lb.end_date)}
			</p>

			{/* Progress */}
			<div className="mt-3">
				<div className="flex justify-between text-xs text-slate-500 mb-0.5">
					<span>{lb.approved_entries} approved</span>
					<span>{lb.completion_percentage}%</span>
				</div>
				<div className="w-full bg-slate-800 rounded-full h-1">
					<div
						className="h-1 rounded-full bg-Nexus-500"
						style={{ width: `${lb.completion_percentage}%` }}
					/>
				</div>
			</div>

			{/* Rating */}
			{lb.overall_rating && (
				<div className="mt-2">
					<StarRating value={lb.overall_rating} readOnly size={13} />
				</div>
			)}

			<div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-border/50">
				<span className="text-xs text-slate-500">
					{lb.total_entries} entr{lb.total_entries === 1 ? "y" : "ies"}
				</span>
				<ChevronRight size={14} className="text-slate-600" />
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────
// EntryCard
// ─────────────────────────────────────────────────────────

function EntryCard({
	entry,
	isSupervisor,
	onOpen,
	onQuickSubmit,
}: {
	entry: LogbookEntry;
	isSupervisor: boolean;
	onOpen: () => void;
	onQuickSubmit: () => void;
}) {
	const mood = entry.mood_rating ? MOOD_MAP[entry.mood_rating] : null;

	return (
		<div
			className="p-4 bg-surface rounded-xl border border-surface-border hover:border-Nexus-500/30 cursor-pointer transition-all"
			onClick={onOpen}>
			<div className="flex items-start justify-between gap-3">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 mb-1.5 flex-wrap">
						<span className="font-medium text-white text-sm">
							{format(parseISO(entry.date), "EEEE, dd MMMM yyyy")}
						</span>
						<span
							className={clsx(
								"badge text-[10px]",
								STATUS_STYLES[entry.status] || "badge-slate",
							)}>
							{STATUS_LABELS[entry.status]}
						</span>
						{entry.hours_worked && (
							<span className="text-[10px] text-slate-500 flex items-center gap-0.5">
								<Clock size={10} /> {entry.hours_worked}h
							</span>
						)}
						{mood && (
							<span
								className={clsx(
									"flex items-center gap-0.5 text-[10px]",
									mood.color,
								)}>
								{mood.icon} {mood.label}
							</span>
						)}
					</div>
					<p className="text-xs text-slate-400 line-clamp-2">
						{entry.activities}
					</p>
					{/* Supervisor comment badge */}
					{entry.supervisor_comments && (
						<div className="mt-1.5 flex items-start gap-1 text-xs text-blue-400">
							<MessageSquare size={10} className="mt-0.5 shrink-0" />
							<span className="line-clamp-1">{entry.supervisor_comments}</span>
						</div>
					)}
					{/* Unacknowledged feedback badge */}
					{!isSupervisor &&
						entry.supervisor_comments &&
						!entry.intern_acknowledged && (
							<span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
								New feedback — tap to acknowledge
							</span>
						)}
				</div>
				<div className="flex flex-col items-end gap-2 shrink-0">
					{/* Attachments / comments counts */}
					<div className="flex items-center gap-2 text-slate-600 text-[10px]">
						{entry.attachment_count > 0 && (
							<span className="flex items-center gap-0.5">
								<Paperclip size={10} /> {entry.attachment_count}
							</span>
						)}
						{entry.comment_count > 0 && (
							<span className="flex items-center gap-0.5">
								<MessageSquare size={10} /> {entry.comment_count}
							</span>
						)}
					</div>
					{/* Quick submit for draft entries (intern) */}
					{!isSupervisor && entry.status === "draft" && (
						<button
							className="btn-secondary btn-xs"
							onClick={(ev) => {
								ev.stopPropagation();
								onQuickSubmit();
							}}>
							<Send size={10} /> Submit
						</button>
					)}
					{/* Quick approve badge for supervisor */}
					{isSupervisor && entry.can_review && (
						<span className="text-[10px] text-yellow-400 flex items-center gap-0.5">
							<AlertCircle size={10} /> Needs review
						</span>
					)}
					{/* Supervisor rating */}
					{entry.supervisor_rating && (
						<StarRating value={entry.supervisor_rating} readOnly size={11} />
					)}
				</div>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────
// EntryModal — full detail
// ─────────────────────────────────────────────────────────

function EntryModal({
	entry,
	logbook,
	isSupervisor,
	onClose,
	onSave,
	onApprove,
	onReject,
	onRevision,
	onQuickSubmit,
	isPending,
	logbookId,
}: {
	entry: LogbookEntry | null;
	logbook: Logbook;
	isSupervisor: boolean;
	onClose: () => void;
	onSave: (d: any) => void;
	onApprove: (d: any) => void;
	onReject: (d: any) => void;
	onRevision: (d: any) => void;
	onQuickSubmit?: () => void;
	isPending: boolean;
	logbookId: string;
}) {
	const qc = useQueryClient();
	const [tab, setTab] = useState<EntryTab>("details");
	const [supervisorRating, setSupervisorRating] = useState<number | null>(
		entry?.supervisor_rating ?? null,
	);
	const [moodRating, setMoodRating] = useState<number | null>(
		entry?.mood_rating ?? null,
	);

	// The entry passed in may come from the LIST view (LogbookEntryListSerializer),
	// which has no attachments/comments/audit_logs arrays — only counts. Fetch the
	// full detail record so the Files/Comments/History tabs always have real data,
	// and merge it over the list-shaped entry so nothing is ever undefined.
	const { data: detailData } = useQuery({
		queryKey: ["logbook-entry-detail", logbookId, entry?.id],
		queryFn: () =>
			logbooksApi.getEntry(logbookId, entry!.id).then((r) => r.data),
		enabled: !!entry?.id,
	});

	const fullEntry: LogbookEntry | null = entry
		? {
				...entry,
				...(detailData ?? {}),
				attachments: detailData?.attachments ?? entry.attachments ?? [],
				comments: detailData?.comments ?? entry.comments ?? [],
				audit_logs: detailData?.audit_logs ?? entry.audit_logs ?? [],
			}
		: null;

	const { register, handleSubmit, watch, setValue } = useForm({
		defaultValues: {
			date: entry?.date ?? format(new Date(), "yyyy-MM-dd"),
			activities: entry?.activities ?? "",
			skills_acquired: entry?.skills_acquired ?? "",
			challenges: entry?.challenges ?? "",
			reflection: entry?.reflection ?? "",
			location: entry?.location ?? "",
			reporting_time: entry?.reporting_time ?? "",
			closing_time: entry?.closing_time ?? "",
			supervisor_comments: entry?.supervisor_comments ?? "",
		},
	});

	const isViewing = !!entry && !entry.can_edit && !isSupervisor;
	const isEditingEntry = !entry || entry.can_edit;
	const canReview = !!entry && isSupervisor && entry.can_review;

	// Acknowledge mutation
	const acknowledgeMutation = useMutation({
		mutationFn: () => logbooksApi.acknowledgeEntry(logbookId, entry!.id),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["logbook-entries", logbookId] });
			toast.success("Feedback acknowledged.");
		},
	});

	function buildPayload(data: any, submitNow = false) {
		return {
			...data,
			mood_rating: moodRating,
			supervisor_rating: supervisorRating,
			submit: submitNow,
		};
	}

	const TABS: { id: EntryTab; label: string; icon: JSX.Element }[] = [
		{ id: "details", label: "Details", icon: <FileText size={13} /> },
		{
			id: "attachments",
			label: `Files${fullEntry?.attachment_count ? ` (${fullEntry.attachment_count})` : ""}`,
			icon: <Paperclip size={13} />,
		},
		{
			id: "comments",
			label: `Comments${fullEntry?.comment_count ? ` (${fullEntry.comment_count})` : ""}`,
			icon: <MessageSquare size={13} />,
		},
		...(entry
			? [
					{
						id: "audit" as EntryTab,
						label: "History",
						icon: <History size={13} />,
					},
				]
			: []),
	];

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div
				className="modal-box max-w-3xl h-[90vh] flex flex-col"
				onClick={(e) => e.stopPropagation()}>
				{/* Header */}
				<div className="modal-header flex items-center justify-between">
					<h3 className="font-semibold text-white">
						{!entry
							? "New Logbook Entry"
							: isViewing
								? "View Entry"
								: canReview
									? "Review Entry"
									: "Edit Entry"}
					</h3>
					<div className="flex items-center gap-2">
						{entry && (
							<span
								className={clsx(
									"badge text-[11px]",
									STATUS_STYLES[entry.status],
								)}>
								{STATUS_LABELS[entry.status]}
							</span>
						)}
						<button
							onClick={onClose}
							className="text-slate-400 hover:text-white">
							<X size={18} />
						</button>
					</div>
				</div>

				{/* Tabs */}
				<div className="flex border-b border-surface-border px-6 gap-1">
					{TABS.map((t) => (
						<button
							key={t.id}
							onClick={() => setTab(t.id)}
							className={clsx(
								"flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 -mb-px transition-colors",
								tab === t.id
									? "border-Nexus-500 text-Nexus-400"
									: "border-transparent text-slate-500 hover:text-slate-300",
							)}>
							{t.icon} {t.label}
						</button>
					))}
				</div>

				{/* Unacknowledged feedback alert */}
				{entry &&
					!isSupervisor &&
					entry.supervisor_comments &&
					!entry.intern_acknowledged && (
						<div className="mx-6 mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-start justify-between gap-3">
							<div>
								<p className="text-xs font-medium text-yellow-400 mb-0.5">
									Supervisor feedback
								</p>
								<p className="text-xs text-slate-300">
									{entry.supervisor_comments}
								</p>
							</div>
							<button
								className="btn-secondary btn-xs shrink-0"
								onClick={() => acknowledgeMutation.mutate()}
								disabled={acknowledgeMutation.isPending}>
								Acknowledge
							</button>
						</div>
					)}

				{/* Body */}
				<div className="flex-1 overflow-y-auto">
					{tab === "details" && (
						<form
							id="entry-form"
							onSubmit={handleSubmit((d) => onSave(buildPayload(d)))}>
							<div className="modal-body space-y-4 pb-0">
								{/* Date + location row */}
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
									<div className="input-group">
										<label className="input-label">Date *</label>
										<input
											type="date"
											{...register("date", { required: true })}
											className="input"
											disabled={!!entry}
											min={logbook.start_date}
											max={logbook.end_date}
										/>
									</div>
									<div className="input-group">
										<label className="input-label">Location / Department</label>
										<input
											{...register("location")}
											className="input"
											placeholder="e.g. Finance Office"
											disabled={isViewing || (!!entry && !entry.can_edit)}
										/>
									</div>
								</div>

								{/* Times */}
								<div className="grid grid-cols-2 gap-4">
									<div className="input-group">
										<label className="input-label">Reporting Time</label>
										<input
											type="time"
											{...register("reporting_time")}
											className="input"
											disabled={isViewing || (!!entry && !entry.can_edit)}
										/>
									</div>
									<div className="input-group">
										<label className="input-label">Closing Time</label>
										<input
											type="time"
											{...register("closing_time")}
											className="input"
											disabled={isViewing || (!!entry && !entry.can_edit)}
										/>
									</div>
								</div>

								{/* Mood (intern only) */}
								{!isSupervisor && (
									<div className="input-group">
										<label className="input-label">How was your day?</label>
										<MoodPicker
											value={moodRating}
											onChange={setMoodRating}
											readOnly={isViewing || (!!entry && !entry.can_edit)}
										/>
									</div>
								)}

								{/* Activities */}
								<div className="input-group">
									<label className="input-label">
										Activities & Tasks Completed *
									</label>
									<textarea
										{...register("activities", { required: true })}
										rows={5}
										className="textarea"
										placeholder="Describe your activities in detail…"
										disabled={
											isViewing ||
											(isSupervisor && !canReview && !!entry) ||
											(!!entry && !entry.can_edit && !isSupervisor)
										}
									/>
								</div>

								<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
									<div className="input-group">
										<label className="input-label">Skills Acquired</label>
										<textarea
											{...register("skills_acquired")}
											rows={3}
											className="textarea"
											placeholder="New skills or knowledge gained…"
											disabled={
												isViewing ||
												(!!entry && !entry.can_edit && !isSupervisor)
											}
										/>
									</div>
									<div className="input-group">
										<label className="input-label">Challenges Faced</label>
										<textarea
											{...register("challenges")}
											rows={3}
											className="textarea"
											placeholder="Any difficulties or challenges?"
											disabled={
												isViewing ||
												(!!entry && !entry.can_edit && !isSupervisor)
											}
										/>
									</div>
								</div>

								<div className="input-group">
									<label className="input-label">Reflection</label>
									<textarea
										{...register("reflection")}
										rows={3}
										className="textarea"
										placeholder="Overall reflection for the day…"
										disabled={
											isViewing || (!!entry && !entry.can_edit && !isSupervisor)
										}
									/>
								</div>

								{/* Supervisor review section */}
								{(isSupervisor || entry?.supervisor_comments) && (
									<div className="border-t border-surface-border pt-4 space-y-3">
										<p className="text-xs font-medium text-Nexus-400 flex items-center gap-1">
											<Shield size={12} /> Supervisor Review
										</p>
										<div className="input-group">
											<label className="input-label">Comments / Feedback</label>
											<textarea
												{...register("supervisor_comments")}
												rows={3}
												className="textarea"
												placeholder="Add feedback for the intern…"
												disabled={!isSupervisor}
											/>
										</div>
										<div className="input-group">
											<label className="input-label">Rating</label>
											<StarRating
												value={supervisorRating}
												onChange={setSupervisorRating}
												readOnly={!isSupervisor}
											/>
										</div>
										{entry?.reviewed_by && (
											<p className="text-[11px] text-slate-500">
												Reviewed by {entry.reviewed_by.full_name} ·{" "}
												{fmtDateTime(entry.reviewed_at)}
											</p>
										)}
									</div>
								)}
							</div>
						</form>
					)}

					{tab === "attachments" && fullEntry && (
						<AttachmentsTab
							entry={fullEntry}
							logbookId={logbookId}
							canUpload={fullEntry.can_edit || isSupervisor}
						/>
					)}

					{tab === "comments" && fullEntry && (
						<CommentsTab entry={fullEntry} logbookId={logbookId} />
					)}

					{tab === "audit" && fullEntry && (
						<AuditTab entry={fullEntry} logbookId={logbookId} />
					)}
				</div>

				{/* Footer */}
				{tab === "details" && (
					<div className="modal-footer flex-wrap gap-2">
						<button type="button" onClick={onClose} className="btn-secondary">
							{isViewing ? "Close" : "Cancel"}
						</button>

						{/* Intern actions */}
						{!isSupervisor && isEditingEntry && (
							<>
								<button
									type="submit"
									form="entry-form"
									className="btn-secondary"
									disabled={isPending}
									onClick={() => setValue("_submit" as any, false)}>
									Save Draft
								</button>
								<button
									type="button"
									className="btn-primary"
									disabled={isPending}
									onClick={handleSubmit((d) => onSave(buildPayload(d, true)))}>
									{isPending ? "Saving…" : "Submit for Review"}
								</button>
							</>
						)}

						{/* Quick-submit draft from view */}
						{!isSupervisor &&
							entry?.status === "draft" &&
							!entry?.can_edit &&
							onQuickSubmit && (
								<button
									type="button"
									className="btn-primary"
									onClick={onQuickSubmit}>
									<Send size={13} /> Submit for Review
								</button>
							)}

						{/* Supervisor review actions */}
						{canReview && (
							<>
								<button
									type="button"
									className="btn-secondary text-yellow-400 border-yellow-500/30"
									disabled={isPending}
									onClick={handleSubmit((d) =>
										onRevision({
											supervisor_comments: d.supervisor_comments,
											supervisor_rating: supervisorRating,
										}),
									)}>
									<RotateCcw size={13} /> Request Revision
								</button>
								<button
									type="button"
									className="btn-secondary text-red-400 border-red-500/30"
									disabled={isPending}
									onClick={handleSubmit((d) =>
										onReject({
											supervisor_comments: d.supervisor_comments,
											supervisor_rating: supervisorRating,
										}),
									)}>
									<ThumbsDown size={13} /> Reject
								</button>
								<button
									type="button"
									className="btn-primary bg-green-600 hover:bg-green-500"
									disabled={isPending}
									onClick={handleSubmit((d) =>
										onApprove({
											supervisor_comments: d.supervisor_comments,
											supervisor_rating: supervisorRating,
										}),
									)}>
									<ThumbsUp size={13} />
									{isPending ? "Saving…" : "Approve"}
								</button>
							</>
						)}

						{/* Supervisor update comments on non-submitted entries */}
						{isSupervisor && entry && !entry.can_review && (
							<>
								{entry.status === "draft" && (
									<span className="text-xs text-slate-500 flex items-center gap-1.5 mr-auto">
										<Info size={12} />
										Waiting for intern to submit this entry before it can be
										reviewed.
									</span>
								)}
								{(entry.status === "approved" ||
									entry.status === "rejected" ||
									entry.status === "revision_requested") && (
									<span className="text-xs text-slate-500 flex items-center gap-1.5 mr-auto">
										<Info size={12} />
										This entry has already been reviewed
										{entry.reviewed_at
											? ` on ${fmtDate(entry.reviewed_at)}`
											: ""}
										.
									</span>
								)}
								<button
									type="submit"
									form="entry-form"
									className="btn-primary"
									disabled={isPending}>
									{isPending ? "Saving…" : "Save Comments"}
								</button>
							</>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────
// AttachmentsTab
// ─────────────────────────────────────────────────────────

function AttachmentsTab({
	entry,
	logbookId,
	canUpload,
}: {
	entry: LogbookEntry;
	logbookId: string;
	canUpload: boolean;
}) {
	const qc = useQueryClient();
	const fileRef = useRef<HTMLInputElement>(null);

	const uploadMutation = useMutation({
		mutationFn: (file: File) => {
			const fd = new FormData();
			fd.append("file", file);
			return logbooksApi.uploadAttachment(logbookId, entry.id, fd);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["logbook-entries", logbookId] });
			toast.success("File uploaded.");
		},
		onError: () => toast.error("Upload failed."),
	});

	const deleteMutation = useMutation({
		mutationFn: (attId: string) =>
			logbooksApi.deleteAttachment(logbookId, entry.id, attId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["logbook-entries", logbookId] });
			toast.success("File removed.");
		},
	});

	function handleFiles(e: ChangeEvent<HTMLInputElement>) {
		Array.from(e.target.files ?? []).forEach((f) => uploadMutation.mutate(f));
		e.target.value = "";
	}

	return (
		<div className="p-6 space-y-4">
			{canUpload && (
				<div>
					<input
						ref={fileRef}
						type="file"
						multiple
						className="hidden"
						onChange={handleFiles}
					/>
					<button
						onClick={() => fileRef.current?.click()}
						className="btn-secondary btn-sm"
						disabled={uploadMutation.isPending}>
						<Upload size={13} />
						{uploadMutation.isPending ? "Uploading…" : "Upload Files"}
					</button>
				</div>
			)}
			{(entry.attachments?.length ?? 0) === 0 ? (
				<p className="text-slate-500 text-sm">No attachments yet.</p>
			) : (
				<div className="space-y-2">
					{entry.attachments.map((att) => (
						<div
							key={att.id}
							className="flex items-center justify-between p-3 rounded-lg bg-surface border border-surface-border">
							<div className="flex items-center gap-2 min-w-0">
								<Paperclip size={14} className="text-slate-500 shrink-0" />
								<div className="min-w-0">
									<p className="text-sm text-white truncate">
										{att.original_name}
									</p>
									<p className="text-[10px] text-slate-500">
										{(att.file_size / 1024).toFixed(1)} KB · {att.content_type}
									</p>
								</div>
							</div>
							<div className="flex items-center gap-2 shrink-0">
								<a
									href={att.url}
									target="_blank"
									rel="noreferrer"
									className="btn-secondary btn-xs">
									<Eye size={11} />
								</a>
								{canUpload && (
									<button
										className="btn-secondary btn-xs text-red-400"
										onClick={() => deleteMutation.mutate(att.id)}
										disabled={deleteMutation.isPending}>
										<Trash2 size={11} />
									</button>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

// ─────────────────────────────────────────────────────────
// CommentsTab
// ─────────────────────────────────────────────────────────

function CommentsTab({
	entry,
	logbookId,
}: {
	entry: LogbookEntry;
	logbookId: string;
}) {
	const qc = useQueryClient();
	const [body, setBody] = useState("");

	const addMutation = useMutation({
		mutationFn: (b: string) =>
			logbooksApi.addComment(logbookId, entry.id, { body: b }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["logbook-entries", logbookId] });
			setBody("");
		},
		onError: () => toast.error("Failed to post comment."),
	});

	const deleteMutation = useMutation({
		mutationFn: (commentId: string) => logbooksApi.deleteComment(commentId),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ["logbook-entries", logbookId] }),
	});

	return (
		<div className="p-6 space-y-4">
			{(entry.comments?.length ?? 0) === 0 && (
				<p className="text-slate-500 text-sm">No comments yet.</p>
			)}
			<div className="space-y-3">
				{(entry.comments ?? []).map((c) => (
					<CommentItem
						key={c.id}
						comment={c}
						onDelete={() => deleteMutation.mutate(c.id)}
						onReply={(replyBody) =>
							logbooksApi
								.addComment(logbookId, entry.id, {
									body: replyBody,
									parent: c.id,
								})
								.then(() =>
									qc.invalidateQueries({
										queryKey: ["logbook-entries", logbookId],
									}),
								)
						}
					/>
				))}
			</div>
			{/* New comment box */}
			<div className="flex gap-2 pt-2 border-t border-surface-border">
				<textarea
					value={body}
					onChange={(e) => setBody(e.target.value)}
					rows={2}
					className="textarea flex-1 text-sm"
					placeholder="Write a comment…"
				/>
				<button
					className="btn-primary btn-sm self-end"
					disabled={!body.trim() || addMutation.isPending}
					onClick={() => addMutation.mutate(body.trim())}>
					<Send size={13} />
				</button>
			</div>
		</div>
	);
}

function CommentItem({
	comment,
	onDelete,
	onReply,
}: {
	comment: Comment;
	onDelete: () => void;
	onReply: (b: string) => void;
}) {
	const [replying, setReplying] = useState(false);
	const [replyBody, setReplyBody] = useState("");

	return (
		<div className="text-sm">
			<div className="p-3 rounded-lg bg-surface border border-surface-border">
				<div className="flex items-start justify-between gap-2">
					<div className="flex items-center gap-1.5 mb-1">
						<span className="font-medium text-white text-xs">
							{comment.author.full_name}
						</span>
						<span className="text-[10px] text-slate-500">
							{fmtDateTime(comment.created_at)}
						</span>
						{comment.edited && (
							<span className="text-[10px] text-slate-600">(edited)</span>
						)}
					</div>
					<div className="flex items-center gap-1 shrink-0">
						{comment.can_delete && (
							<button
								onClick={onDelete}
								className="text-slate-600 hover:text-red-400 transition-colors">
								<Trash2 size={11} />
							</button>
						)}
					</div>
				</div>
				<p className="text-slate-300 text-xs">{comment.body}</p>
				<button
					className="text-[10px] text-slate-500 hover:text-Nexus-400 mt-1"
					onClick={() => setReplying(!replying)}>
					Reply
				</button>
			</div>
			{/* Replies */}
			{comment.replies.length > 0 && (
				<div className="ml-6 mt-1 space-y-1">
					{comment.replies.map((r) => (
						<div
							key={r.id}
							className="p-2.5 rounded-lg bg-surface border border-surface-border">
							<span className="font-medium text-white text-xs">
								{r.author.full_name}
							</span>{" "}
							<span className="text-[10px] text-slate-500">
								{fmtDateTime(r.created_at)}
							</span>
							<p className="text-slate-300 text-xs mt-0.5">{r.body}</p>
						</div>
					))}
				</div>
			)}
			{replying && (
				<div className="ml-6 mt-1 flex gap-2">
					<input
						value={replyBody}
						onChange={(e) => setReplyBody(e.target.value)}
						className="input flex-1 text-xs py-1.5"
						placeholder="Write a reply…"
					/>
					<button
						className="btn-primary btn-xs"
						onClick={() => {
							if (replyBody.trim()) {
								onReply(replyBody.trim());
								setReplyBody("");
								setReplying(false);
							}
						}}>
						<Send size={10} />
					</button>
				</div>
			)}
		</div>
	);
}

// ─────────────────────────────────────────────────────────
// AuditTab
// ─────────────────────────────────────────────────────────

function AuditTab({
	entry,
	logbookId,
}: {
	entry: LogbookEntry;
	logbookId: string;
}) {
	return (
		<div className="p-6 space-y-3">
			{(entry.audit_logs?.length ?? 0) === 0 ? (
				<p className="text-slate-500 text-sm">No history yet.</p>
			) : (
				(entry.audit_logs ?? []).map((log) => (
					<div key={log.id} className="flex gap-3 text-xs">
						<div className="w-1 self-stretch bg-surface-border rounded-full shrink-0" />
						<div>
							<p className="text-white">
								<span className="font-medium">{log.actor?.full_name}</span>{" "}
								<span className="text-slate-400">
									{log.action.replace(/_/g, " ")}
								</span>
							</p>
							<p className="text-slate-500">{fmtDateTime(log.timestamp)}</p>
						</div>
					</div>
				))
			)}
		</div>
	);
}

// ─────────────────────────────────────────────────────────
// SignatureModal — HTML5 Canvas pad
// ─────────────────────────────────────────────────────────

function SignatureModal({
	logbook,
	isSupervisor,
	onClose,
	onSaved,
}: {
	logbook: Logbook;
	isSupervisor: boolean;
	onClose: () => void;
	onSaved: () => void;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const drawing = useRef(false);
	const [hasStrokes, setHasStrokes] = useState(false);

	const saveMutation = useMutation({
		mutationFn: (dataUrl: string) =>
			logbooksApi.sign(logbook.id, { signature: dataUrl }),
		onSuccess: onSaved,
		onError: () => toast.error("Failed to save signature."),
	});

	const getCanvas = () => canvasRef.current!;
	const getCtx = () => getCanvas().getContext("2d")!;

	function startDraw(e: MouseEvent<HTMLCanvasElement>) {
		drawing.current = true;
		const ctx = getCtx();
		const r = getCanvas().getBoundingClientRect();
		ctx.beginPath();
		ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
	}

	function draw(e: MouseEvent<HTMLCanvasElement>) {
		if (!drawing.current) return;
		const ctx = getCtx();
		const r = getCanvas().getBoundingClientRect();
		ctx.lineTo(e.clientX - r.left, e.clientY - r.top);
		ctx.strokeStyle = "#7c6ff7";
		ctx.lineWidth = 2;
		ctx.lineCap = "round";
		ctx.stroke();
		setHasStrokes(true);
	}

	function endDraw() {
		drawing.current = false;
	}

	function clear() {
		const canvas = getCanvas();
		getCtx().clearRect(0, 0, canvas.width, canvas.height);
		setHasStrokes(false);
	}

	function save() {
		const dataUrl = getCanvas().toDataURL("image/png");
		saveMutation.mutate(dataUrl);
	}

	const mySignedAt = isSupervisor
		? logbook.supervisor_signed_at
		: logbook.intern_signed_at;

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box max-w-lg" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h3 className="font-semibold text-white">Digital Signature</h3>
					<button onClick={onClose} className="text-slate-400 hover:text-white">
						<X size={18} />
					</button>
				</div>
				<div className="modal-body space-y-4">
					{mySignedAt ? (
						<div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
							<CheckCircle size={24} className="text-green-400 mx-auto mb-1" />
							<p className="text-sm text-green-400 font-medium">
								You signed this logbook
							</p>
							<p className="text-xs text-slate-400 mt-0.5">
								{fmtDateTime(mySignedAt)}
							</p>
							<p className="text-xs text-slate-500 mt-2">
								To update your signature, draw below and save again.
							</p>
						</div>
					) : (
						<p className="text-sm text-slate-400">
							{isSupervisor
								? "Sign below to confirm your review of this logbook."
								: "Sign below to confirm the authenticity of your logbook entries."}
						</p>
					)}

					<div>
						<p className="input-label mb-1">
							{isSupervisor ? "Supervisor Signature" : "Intern Signature"}
						</p>
						<canvas
							ref={canvasRef}
							width={480}
							height={160}
							className="w-full rounded-lg border border-surface-border bg-slate-900 cursor-crosshair touch-none"
							onMouseDown={startDraw}
							onMouseMove={draw}
							onMouseUp={endDraw}
							onMouseLeave={endDraw}
						/>
					</div>

					{/* Existing signatures indicator */}
					<div className="grid grid-cols-2 gap-3 text-xs">
						<div
							className={clsx(
								"p-2 rounded-lg border text-center",
								logbook.intern_signed_at
									? "border-green-500/30 bg-green-500/5 text-green-400"
									: "border-surface-border text-slate-500",
							)}>
							<Pen size={12} className="mx-auto mb-0.5" />
							Intern {logbook.intern_signed_at ? "✓ Signed" : "— Pending"}
						</div>
						<div
							className={clsx(
								"p-2 rounded-lg border text-center",
								logbook.supervisor_signed_at
									? "border-green-500/30 bg-green-500/5 text-green-400"
									: "border-surface-border text-slate-500",
							)}>
							<Shield size={12} className="mx-auto mb-0.5" />
							Supervisor{" "}
							{logbook.supervisor_signed_at ? "✓ Signed" : "— Pending"}
						</div>
					</div>
				</div>
				<div className="modal-footer">
					<button onClick={clear} className="btn-secondary">
						Clear
					</button>
					<button onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						onClick={save}
						disabled={!hasStrokes || saveMutation.isPending}
						className="btn-primary">
						{saveMutation.isPending ? "Saving…" : "Save Signature"}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────
// SummaryModal
// ─────────────────────────────────────────────────────────

function SummaryModal({
	logbook,
	summary,
	onClose,
}: {
	logbook: Logbook;
	summary: any;
	onClose: () => void;
}) {
	const byStatus = summary.entries_by_status ?? {};
	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box max-w-lg" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h3 className="font-semibold text-white">Progress Summary</h3>
					<button onClick={onClose} className="text-slate-400 hover:text-white">
						<X size={18} />
					</button>
				</div>
				<div className="modal-body space-y-5">
					{/* Overall progress */}
					<div>
						<div className="flex justify-between text-sm mb-1">
							<span className="text-slate-400">Overall Completion</span>
							<span className="text-white font-semibold">
								{summary.completion_percentage}%
							</span>
						</div>
						<div className="w-full bg-slate-800 rounded-full h-2">
							<div
								className="h-2 rounded-full bg-Nexus-500 transition-all"
								style={{ width: `${summary.completion_percentage}%` }}
							/>
						</div>
					</div>

					{/* Status breakdown */}
					<div className="grid grid-cols-2 gap-3">
						{Object.entries(STATUS_LABELS).map(([k, label]) => (
							<div
								key={k}
								className="p-3 rounded-lg bg-surface border border-surface-border">
								<p className="text-xl font-bold text-white">
									{byStatus[k] ?? 0}
								</p>
								<p className="text-xs text-slate-500 mt-0.5">{label}</p>
							</div>
						))}
					</div>

					{/* Overall rating */}
					{logbook.overall_rating && (
						<div>
							<p className="text-xs text-slate-400 mb-1">Supervisor Rating</p>
							<StarRating value={logbook.overall_rating} readOnly />
						</div>
					)}

					{/* Signatures status */}
					<div className="grid grid-cols-2 gap-3 text-xs">
						<div
							className={clsx(
								"p-2.5 rounded-lg border text-center",
								logbook.intern_signed_at
									? "border-green-500/30 text-green-400"
									: "border-surface-border text-slate-500",
							)}>
							<Pen size={12} className="mx-auto mb-1" />
							Intern Signature
							<br />
							{logbook.intern_signed_at
								? fmtDate(logbook.intern_signed_at)
								: "Pending"}
						</div>
						<div
							className={clsx(
								"p-2.5 rounded-lg border text-center",
								logbook.supervisor_signed_at
									? "border-green-500/30 text-green-400"
									: "border-surface-border text-slate-500",
							)}>
							<Shield size={12} className="mx-auto mb-1" />
							Supervisor Signature
							<br />
							{logbook.supervisor_signed_at
								? fmtDate(logbook.supervisor_signed_at)
								: "Pending"}
						</div>
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

// ─────────────────────────────────────────────────────────
// AuditModal (logbook-level)
// ─────────────────────────────────────────────────────────

function AuditModal({
	logbookId,
	onClose,
}: {
	logbookId: string;
	onClose: () => void;
}) {
	const { data, isLoading } = useQuery({
		queryKey: ["logbook-audit", logbookId],
		queryFn: () => logbooksApi.audit(logbookId).then((r) => r.data),
	});
	const logs: AuditLog[] = Array.isArray(data) ? data : [];

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div
				className="modal-box max-w-lg h-[75vh] flex flex-col"
				onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h3 className="font-semibold text-white flex items-center gap-2">
						<History size={16} /> Audit Trail
					</h3>
					<button onClick={onClose} className="text-slate-400 hover:text-white">
						<X size={18} />
					</button>
				</div>
				<div className="flex-1 overflow-y-auto modal-body space-y-3">
					{isLoading ? (
						[...Array(5)].map((_, i) => (
							<div key={i} className="skeleton h-10 rounded-lg" />
						))
					) : logs.length === 0 ? (
						<p className="text-slate-500 text-sm">No audit logs yet.</p>
					) : (
						logs.map((log) => (
							<div key={log.id} className="flex gap-3 text-xs items-start">
								<div className="w-1.5 h-1.5 rounded-full bg-Nexus-500 mt-1.5 shrink-0" />
								<div>
									<p className="text-white">
										<span className="font-medium">{log.actor?.full_name}</span>{" "}
										<span className="text-slate-400 capitalize">
											{log.action.replace(/_/g, " ")}
										</span>
									</p>
									<p className="text-slate-500">{fmtDateTime(log.timestamp)}</p>
								</div>
							</div>
						))
					)}
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

// ─────────────────────────────────────────────────────────
// UserSelect — searchable dropdown over real accounts.User records
// ─────────────────────────────────────────────────────────

interface UserOption {
	id: string;
	full_name: string;
	email: string;
	role: string;
	department_name?: string;
}

function UserSelect({
	value,
	onChange,
	role,
	placeholder = "Search by name or email…",
	disabled = false,
}: {
	value: string | null;
	onChange: (id: string, user?: UserOption) => void;
	/** Optional role filter, e.g. "attachee" or "supervisor" */
	role?: string;
	placeholder?: string;
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const wrapRef = useRef<HTMLDivElement>(null);

	const { data, isLoading } = useQuery({
		queryKey: ["users-select", role],
		queryFn: () =>
			usersApi.list(role ? { role } : undefined).then((r) => r.data),
	});

	const users: UserOption[] = Array.isArray(data)
		? data
		: Array.isArray(data?.results)
			? data.results
			: [];

	const filtered = users.filter((u) => {
		if (!search) return true;
		const q = search.toLowerCase();
		return (
			u.full_name?.toLowerCase().includes(q) ||
			u.email?.toLowerCase().includes(q)
		);
	});

	const selected = users.find((u) => u.id === value);

	useEffect(() => {
		function handleClickOutside(e: globalThis.MouseEvent) {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	return (
		<div className="relative" ref={wrapRef}>
			<button
				type="button"
				disabled={disabled}
				onClick={() => setOpen((o) => !o)}
				className={clsx(
					"input flex items-center justify-between w-full text-left",
					disabled && "opacity-60 cursor-not-allowed",
				)}>
				{selected ? (
					<span className="flex items-center gap-2 truncate">
						<span className="text-white">{selected.full_name}</span>
						<span className="text-slate-500 text-xs truncate">
							{selected.email}
						</span>
					</span>
				) : (
					<span className="text-slate-500">{placeholder}</span>
				)}
				<ChevronDown
					size={14}
					className={clsx(
						"text-slate-500 transition-transform shrink-0 ml-2",
						open && "rotate-180",
					)}
				/>
			</button>

			{open && !disabled && (
				<div className="absolute z-50 mt-1 w-full rounded-lg border border-surface-border bg-surface shadow-xl max-h-64 overflow-hidden flex flex-col">
					<div className="p-2 border-b border-surface-border">
						<div className="relative">
							<Search
								size={13}
								className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
							/>
							<input
								autoFocus
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search by name or email…"
								className="input pl-7 py-1.5 text-sm w-full"
							/>
						</div>
					</div>
					<div className="overflow-y-auto">
						{isLoading ? (
							<div className="p-4 text-center text-xs text-slate-500">
								Loading users…
							</div>
						) : filtered.length === 0 ? (
							<div className="p-4 text-center text-xs text-slate-500">
								No matching users found.
							</div>
						) : (
							filtered.map((u) => (
								<button
									key={u.id}
									type="button"
									onClick={() => {
										onChange(u.id, u);
										setOpen(false);
										setSearch("");
									}}
									className={clsx(
										"w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-Nexus-500/10 transition-colors",
										u.id === value && "bg-Nexus-500/10",
									)}>
									<span className="min-w-0">
										<span className="block text-sm text-white truncate">
											{u.full_name}
										</span>
										<span className="block text-xs text-slate-500 truncate">
											{u.email}
											{u.department_name ? `  ·  ${u.department_name}` : ""}
										</span>
									</span>
									{u.id === value && (
										<CheckCircle
											size={14}
											className="text-Nexus-400 shrink-0"
										/>
									)}
								</button>
							))
						)}
					</div>
				</div>
			)}
		</div>
	);
}

// ─────────────────────────────────────────────────────────
// CreateLogbookModal (supervisor/HR)
// ─────────────────────────────────────────────────────────

function CreateLogbookModal({
	onClose,
	onCreated,
}: {
	onClose: () => void;
	onCreated: () => void;
}) {
	const { register, handleSubmit, control } = useForm({
		defaultValues: {
			title: "",
			description: "",
			intern: "",
			supervisor: "",
			start_date: "",
			end_date: "",
		},
	});

	const createMutation = useMutation({
		mutationFn: (data: any) => logbooksApi.create(data),
		onSuccess: onCreated,
		onError: (e: any) =>
			toast.error(getErrorMessage(e, "Failed to create logbook")),
	});

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box max-w-lg" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h3 className="font-semibold text-white">Create Logbook</h3>
					<button onClick={onClose} className="text-slate-400 hover:text-white">
						<X size={18} />
					</button>
				</div>
				<form onSubmit={handleSubmit((d) => createMutation.mutate(d))}>
					<div className="modal-body space-y-4">
						<div className="input-group">
							<label className="input-label">Title *</label>
							<input
								{...register("title", { required: true })}
								className="input"
								placeholder="e.g. IT Attachment – June 2025"
							/>
						</div>
						<div className="input-group">
							<label className="input-label">Description</label>
							<textarea
								{...register("description")}
								rows={2}
								className="textarea"
								placeholder="Brief description of the attachment period…"
							/>
						</div>

						{/* Intern dropdown — select from real accounts.User records */}
						<div className="input-group">
							<label className="input-label">Intern / Attachee *</label>
							<Controller
								name="intern"
								control={control}
								rules={{ required: true }}
								render={({ field }) => (
									<UserSelect
										value={field.value}
										onChange={(id) => field.onChange(id)}
										role="attachee"
										placeholder="Select an intern…"
									/>
								)}
							/>
						</div>

						{/* Supervisor dropdown */}
						<div className="input-group">
							<label className="input-label">Supervisor</label>
							<Controller
								name="supervisor"
								control={control}
								render={({ field }) => (
									<UserSelect
										value={field.value}
										onChange={(id) => field.onChange(id)}
										role="supervisor"
										placeholder="Select a supervisor…"
									/>
								)}
							/>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div className="input-group">
								<label className="input-label">Start Date *</label>
								<input
									type="date"
									{...register("start_date", { required: true })}
									className="input"
								/>
							</div>
							<div className="input-group">
								<label className="input-label">End Date *</label>
								<input
									type="date"
									{...register("end_date", { required: true })}
									className="input"
								/>
							</div>
						</div>
					</div>
					<div className="modal-footer">
						<button type="button" onClick={onClose} className="btn-secondary">
							Cancel
						</button>
						<button
							type="submit"
							className="btn-primary"
							disabled={createMutation.isPending}>
							{createMutation.isPending ? "Creating…" : "Create Logbook"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
