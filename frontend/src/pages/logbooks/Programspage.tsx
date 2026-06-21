// Nexus — Programs (Production)
// Program (admin creates: name + description)
//   → 3 auto-created Cohorts (sequential activation, scheduled or manual)
//     → Departments (activate/deactivate per cohort; activation enrolls
//       all attachees in that dept + emails them + creates their Logbooks)
//       → Logbooks (per-attachee; reuses the existing entry/review UI)
//
// Sequencing rule (strict, no override):
//   Cohort 1 → 2 → 3. A cohort can only activate once the previous cohort
//   has fully closed. If "auto" scheduling is used, the activation date
//   only takes effect when the previous cohort is already closed —
//   otherwise it sits in a "Ready" (pending) state until that happens.
//
// Entry lock rule: an attachee can only create/edit *today's* entry.
// At 00:00 the entry for the day that just ended is auto-submitted
// (empty if nothing was written) and becomes read-only to the attachee.
// Once a supervisor reviews (approve/deapprove/etc.) an entry, it is
// permanently locked from further editing by anyone but the supervisor's
// own comment/rating fields.

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isToday, isPast, isFuture } from "date-fns";
import {
	GraduationCap,
	Plus,
	ChevronRight,
	Building2,
	Users,
	CalendarDays,
	Lock,
	Unlock,
	CheckCircle2,
	Circle,
	Clock3,
	Mail,
	X,
	Info,
	ShieldCheck,
	BookOpen,
	ArrowLeft,
	Settings2,
	AlertTriangle,
} from "lucide-react";
import { programsApi, useAuthStore } from "../../services/api";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import clsx from "clsx";

// ─────────────────────────────────────────────────────────
// Roles allowed to administer programs (mirrors SUPERVISOR_ROLES,
// but program/cohort/department admin actions are admin-tier only)
// ─────────────────────────────────────────────────────────

const PROGRAM_ADMIN_ROLES = new Set([
	"hr_officer",
	"system_admin",
	"broadcast_admin",
]);
const SUPERVISOR_ROLES = new Set([
	"supervisor",
	"department_leader",
	"hr_officer",
	"system_admin",
	"broadcast_admin",
]);

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function fmtDate(d?: string | null) {
	return d ? format(parseISO(d), "dd MMM yyyy") : "—";
}

function getErrorMessage(e: any, fallback = "Something went wrong"): string {
	const data = e?.response?.data;
	if (!data) return fallback;
	const flatten = (val: any): string | null => {
		if (val == null) return null;
		if (typeof val === "string") return val;
		if (Array.isArray(val)) return val.map(flatten).filter(Boolean).join(" ");
		if (typeof val === "object")
			return Object.entries(val)
				.map(([k, v]) => {
					const m = flatten(v);
					return m ? `${k}: ${m}` : null;
				})
				.filter(Boolean)
				.join(" · ");
		return String(val);
	};
	return (
		(data.detail !== undefined ? flatten(data.detail) : null) ||
		flatten(data) ||
		fallback
	);
}

// ─────────────────────────────────────────────────────────
// Types (mirrors the new backend serializers)
// ─────────────────────────────────────────────────────────

type CohortStatus = "pending" | "ready" | "open" | "closed";

interface Program {
	id: string;
	name: string;
	description: string;
	start_date: string;
	end_date: string;
	cohort_count: number;
	active_cohort_label: string | null; // e.g. "Cohort 2"
	total_attachees: number;
	created_at: string;
}

interface DepartmentActivation {
	id: string;
	department: { id: string; name: string };
	supervisor: { id: string; full_name: string; email: string } | null;
	is_active: boolean;
	activated_at: string | null;
	attachee_count: number;
	logbooks_created: boolean;
	email_sent: boolean;
}

interface Cohort {
	id: string;
	program: string;
	label: string; // "Cohort 1" / "Cohort 2" / "Cohort 3"
	sequence: 1 | 2 | 3;
	start_date: string;
	end_date: string;
	activation_date: string; // scheduled date it should open
	status: CohortStatus; // pending | ready | open | closed
	can_activate: boolean; // computed server-side from sequencing rule
	departments: DepartmentActivation[];
}

// ─────────────────────────────────────────────────────────
// Status badge for cohorts
// ─────────────────────────────────────────────────────────

const COHORT_STATUS_META: Record<
	CohortStatus,
	{ label: string; cls: string; icon: JSX.Element }
> = {
	pending: {
		label: "Pending",
		cls: "badge-slate",
		icon: <Circle size={11} />,
	},
	ready: {
		label: "Ready to activate",
		cls: "badge-yellow",
		icon: <Clock3 size={11} />,
	},
	open: {
		label: "Open",
		cls: "badge-green",
		icon: <Unlock size={11} />,
	},
	closed: {
		label: "Closed",
		cls: "badge-red",
		icon: <Lock size={11} />,
	},
};

// ─────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────

export default function ProgramsPage() {
	const { user } = useAuthStore();
	const qc = useQueryClient();
	const isAdmin = PROGRAM_ADMIN_ROLES.has(user?.role || "");
	const isSupervisor = SUPERVISOR_ROLES.has(user?.role || "");

	const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
	const [selectedCohort, setSelectedCohort] = useState<Cohort | null>(null);
	const [selectedDept, setSelectedDept] = useState<DepartmentActivation | null>(
		null,
	);
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [confirmDeactivate, setConfirmDeactivate] =
		useState<DepartmentActivation | null>(null);

	// ── Programs list ──────────────────────────────────────

	const { data: programsData, isLoading: programsLoading } = useQuery({
		queryKey: ["programs"],
		queryFn: () => programsApi.list().then((r) => r.data),
	});
	const programs: Program[] = Array.isArray(programsData)
		? programsData
		: Array.isArray(programsData?.results)
			? programsData.results
			: [];

	// ── Cohorts for selected program ───────────────────────

	const { data: cohortsData, isLoading: cohortsLoading } = useQuery({
		queryKey: ["program-cohorts", selectedProgram?.id],
		queryFn: () => programsApi.cohorts(selectedProgram!.id).then((r) => r.data),
		enabled: !!selectedProgram,
		// Cohort state can change purely by date (auto-activation), so poll.
		refetchInterval: 60_000,
	});
	const cohorts: Cohort[] = Array.isArray(cohortsData) ? cohortsData : [];

	// Keep selectedCohort in sync with fresh cohort data after refetch
	const liveSelectedCohort = useMemo(
		() => cohorts.find((c) => c.id === selectedCohort?.id) || selectedCohort,
		[cohorts, selectedCohort],
	);

	// ── Mutations ──────────────────────────────────────────

	const createProgramMutation = useMutation({
		mutationFn: (data: any) => programsApi.create(data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["programs"] });
			setShowCreateModal(false);
			toast.success("Program created — 3 cohorts generated automatically.");
		},
		onError: (e: any) =>
			toast.error(getErrorMessage(e, "Failed to create program")),
	});

	const activateDeptMutation = useMutation({
		mutationFn: ({
			cohortId,
			deptActivationId,
		}: {
			cohortId: string;
			deptActivationId: string;
		}) =>
			programsApi.activateDepartment(
				selectedProgram!.id,
				cohortId,
				deptActivationId,
			),
		onSuccess: (_res, vars) => {
			qc.invalidateQueries({
				queryKey: ["program-cohorts", selectedProgram?.id],
			});
			toast.success("Department activated — logbooks created and emails sent.");
		},
		onError: (e: any) =>
			toast.error(getErrorMessage(e, "Failed to activate department")),
	});

	const deactivateDeptMutation = useMutation({
		mutationFn: ({
			cohortId,
			deptActivationId,
		}: {
			cohortId: string;
			deptActivationId: string;
		}) =>
			programsApi.deactivateDepartment(
				selectedProgram!.id,
				cohortId,
				deptActivationId,
			),
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: ["program-cohorts", selectedProgram?.id],
			});
			setConfirmDeactivate(null);
			toast.success("Department deactivated.");
		},
		onError: (e: any) =>
			toast.error(getErrorMessage(e, "Failed to deactivate department")),
	});

	// ── Breadcrumb ──────────────────────────────────────────

	function resetToPrograms() {
		setSelectedProgram(null);
		setSelectedCohort(null);
		setSelectedDept(null);
	}
	function resetToCohorts() {
		setSelectedCohort(null);
		setSelectedDept(null);
	}

	const Breadcrumb = () => (
		<div className="flex items-center gap-2 text-sm text-slate-400 flex-wrap">
			<button onClick={resetToPrograms} className="btn-secondary btn-sm">
				<ArrowLeft size={13} /> Programs
			</button>
			{selectedProgram && (
				<>
					<ChevronRight size={14} />
					<button
						onClick={resetToCohorts}
						className={clsx(
							"hover:text-white transition-colors",
							!selectedCohort && "text-white font-medium",
						)}>
						{selectedProgram.name}
					</button>
				</>
			)}
			{selectedCohort && (
				<>
					<ChevronRight size={14} />
					<button
						onClick={() => setSelectedDept(null)}
						className={clsx(
							"hover:text-white transition-colors",
							!selectedDept && "text-white font-medium",
						)}>
						{selectedCohort.label}
					</button>
				</>
			)}
			{selectedDept && (
				<>
					<ChevronRight size={14} />
					<span className="text-white font-medium">
						{selectedDept.department.name}
					</span>
				</>
			)}
		</div>
	);

	// ─────────────────────────────────────────────────────────
	// Render
	// ─────────────────────────────────────────────────────────

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<GraduationCap size={22} className="text-Nexus-400" />
						Programs
					</h1>
					<p className="page-subtitle">
						Attachment programs · cohort scheduling · department activation
					</p>
				</div>
				<div className="flex items-center gap-2">
					{!selectedProgram && isAdmin && (
						<button
							onClick={() => setShowCreateModal(true)}
							className="btn-primary">
							<Plus size={14} /> New Program
						</button>
					)}
				</div>
			</div>

			{selectedProgram && <Breadcrumb />}

			{/* ── Level 1: Program list ── */}
			{!selectedProgram && (
				<ProgramGrid
					programs={programs}
					loading={programsLoading}
					isAdmin={isAdmin}
					onOpen={setSelectedProgram}
					onCreate={() => setShowCreateModal(true)}
				/>
			)}

			{/* ── Level 2: Cohorts within a program ── */}
			{selectedProgram && !selectedCohort && (
				<CohortGrid
					program={selectedProgram}
					cohorts={cohorts}
					loading={cohortsLoading}
					onOpen={setSelectedCohort}
				/>
			)}

			{/* ── Level 3: Departments within a cohort ── */}
			{liveSelectedCohort && !selectedDept && (
				<DepartmentGrid
					cohort={liveSelectedCohort}
					isAdmin={isAdmin}
					onActivate={(dept) =>
						activateDeptMutation.mutate({
							cohortId: liveSelectedCohort.id,
							deptActivationId: dept.id,
						})
					}
					onRequestDeactivate={(dept) => setConfirmDeactivate(dept)}
					onOpenDept={setSelectedDept}
					activatePending={activateDeptMutation.isPending}
				/>
			)}

			{/* ── Level 4: Logbooks within an activated department ── */}
			{selectedDept && liveSelectedCohort && (
				<DepartmentLogbooks
					program={selectedProgram!}
					cohort={liveSelectedCohort}
					dept={selectedDept}
					isSupervisor={isSupervisor}
				/>
			)}

			{/* ── Modals ── */}
			{showCreateModal && isAdmin && (
				<CreateProgramModal
					onClose={() => setShowCreateModal(false)}
					onCreate={(data) => createProgramMutation.mutate(data)}
					isPending={createProgramMutation.isPending}
				/>
			)}

			{confirmDeactivate && (
				<ConfirmDeactivateModal
					dept={confirmDeactivate}
					onClose={() => setConfirmDeactivate(null)}
					onConfirm={() =>
						deactivateDeptMutation.mutate({
							cohortId: liveSelectedCohort!.id,
							deptActivationId: confirmDeactivate.id,
						})
					}
					isPending={deactivateDeptMutation.isPending}
				/>
			)}
		</div>
	);
}

// ─────────────────────────────────────────────────────────
// ProgramGrid
// ─────────────────────────────────────────────────────────

function ProgramGrid({
	programs,
	loading,
	isAdmin,
	onOpen,
	onCreate,
}: {
	programs: Program[];
	loading: boolean;
	isAdmin: boolean;
	onOpen: (p: Program) => void;
	onCreate: () => void;
}) {
	if (loading) {
		return (
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{[...Array(3)].map((_, i) => (
					<div key={i} className="skeleton h-44 rounded-xl" />
				))}
			</div>
		);
	}

	if (programs.length === 0) {
		return (
			<div className="card text-center py-14">
				<GraduationCap
					size={36}
					className="mx-auto text-slate-600 mb-3 opacity-40"
				/>
				<p className="text-slate-400">No programs yet.</p>
				{isAdmin && (
					<button onClick={onCreate} className="btn-primary mt-4 mx-auto">
						<Plus size={14} /> Create Program
					</button>
				)}
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
			{programs.map((p) => (
				<div key={p.id} className="card-hover" onClick={() => onOpen(p)}>
					<div className="flex items-start justify-between mb-3">
						<GraduationCap size={20} className="text-Nexus-400" />
						{p.active_cohort_label ? (
							<span className="badge badge-green">
								{p.active_cohort_label} open
							</span>
						) : (
							<span className="badge badge-slate">No active cohort</span>
						)}
					</div>
					<h3 className="font-semibold text-white leading-tight">{p.name}</h3>
					{p.description && (
						<p className="text-xs text-slate-400 mt-1 line-clamp-2">
							{p.description}
						</p>
					)}
					<p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
						<CalendarDays size={12} /> {fmtDate(p.start_date)} —{" "}
						{fmtDate(p.end_date)}
					</p>
					<div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-border/50">
						<span className="text-xs text-slate-500 flex items-center gap-1">
							<Users size={12} /> {p.total_attachees} attachee
							{p.total_attachees === 1 ? "" : "s"}
						</span>
						<ChevronRight size={14} className="text-slate-600" />
					</div>
				</div>
			))}
		</div>
	);
}

// ─────────────────────────────────────────────────────────
// CohortGrid — shows the 3 auto-created cohorts, sequencing visualised
// ─────────────────────────────────────────────────────────

function CohortGrid({
	program,
	cohorts,
	loading,
	onOpen,
}: {
	program: Program;
	cohorts: Cohort[];
	loading: boolean;
	onOpen: (c: Cohort) => void;
}) {
	if (loading) {
		return (
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
				{[...Array(3)].map((_, i) => (
					<div key={i} className="skeleton h-48 rounded-xl" />
				))}
			</div>
		);
	}

	const sorted = [...cohorts].sort((a, b) => a.sequence - b.sequence);

	return (
		<div className="space-y-4">
			<div className="card border-l-4 border-l-Nexus-500 flex items-start gap-2">
				<Info size={16} className="text-Nexus-400 mt-0.5 shrink-0" />
				<p className="text-sm text-slate-300">
					Cohorts activate strictly in sequence. A cohort only becomes available
					to activate once the previous one has fully closed — even if its
					scheduled date has already arrived, it will wait in{" "}
					<span className="text-yellow-400">Ready</span> state.
				</p>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
				{sorted.map((c, idx) => {
					const meta = COHORT_STATUS_META[c.status];
					const isOpen = c.status === "open";
					return (
						<div
							key={c.id}
							className={clsx(
								"card-hover relative",
								isOpen && "ring-1 ring-Nexus-500/40",
							)}
							onClick={() => onOpen(c)}>
							<div className="flex items-start justify-between mb-3">
								<span className="text-2xl font-bold text-slate-600">
									{String(c.sequence).padStart(2, "0")}
								</span>
								<span
									className={clsx("badge flex items-center gap-1", meta.cls)}>
									{meta.icon} {meta.label}
								</span>
							</div>
							<h3 className="font-semibold text-white">{c.label}</h3>
							<p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
								<CalendarDays size={12} /> {fmtDate(c.start_date)} —{" "}
								{fmtDate(c.end_date)}
							</p>
							<p className="text-xs text-slate-500 mt-1">
								Scheduled activation: {fmtDate(c.activation_date)}
							</p>
							<div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-border/50">
								<span className="text-xs text-slate-500">
									{c.departments?.filter((d) => d.is_active).length || 0} dept
									{(c.departments?.filter((d) => d.is_active).length || 0) === 1
										? ""
										: "s"}{" "}
									active
								</span>
								<ChevronRight size={14} className="text-slate-600" />
							</div>
							{/* Connector to next cohort */}
							{idx < sorted.length - 1 && (
								<div className="hidden sm:block absolute top-1/2 -right-4 w-4 h-px bg-surface-border" />
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────
// DepartmentGrid — activate/deactivate per department within a cohort
// ─────────────────────────────────────────────────────────

function DepartmentGrid({
	cohort,
	isAdmin,
	onActivate,
	onRequestDeactivate,
	onOpenDept,
	activatePending,
}: {
	cohort: Cohort;
	isAdmin: boolean;
	onActivate: (d: DepartmentActivation) => void;
	onRequestDeactivate: (d: DepartmentActivation) => void;
	onOpenDept: (d: DepartmentActivation) => void;
	activatePending: boolean;
}) {
	const cohortIsOpen = cohort.status === "open";

	return (
		<div className="space-y-4">
			{!cohortIsOpen && (
				<div className="card border-l-4 border-l-yellow-500 flex items-start gap-2">
					<AlertTriangle
						size={16}
						className="text-yellow-400 mt-0.5 shrink-0"
					/>
					<p className="text-sm text-slate-300">
						{cohort.status === "ready"
							? "This cohort's activation date has arrived, but it's waiting for the previous cohort to close before it can open."
							: cohort.status === "closed"
								? "This cohort is closed. Departments can no longer be activated."
								: "This cohort hasn't started yet."}
					</p>
				</div>
			)}

			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{cohort.departments.map((d) => (
					<div key={d.id} className="card">
						<div className="flex items-start justify-between mb-3">
							<Building2 size={20} className="text-Nexus-400" />
							<span
								className={clsx(
									"badge",
									d.is_active ? "badge-green" : "badge-slate",
								)}>
								{d.is_active ? "Active" : "Inactive"}
							</span>
						</div>
						<h3 className="font-semibold text-white">{d.department.name}</h3>
						<p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
							<Users size={12} /> {d.attachee_count} attachee
							{d.attachee_count === 1 ? "" : "s"}
						</p>
						{d.supervisor && (
							<p className="text-xs text-slate-500 mt-1">
								Supervisor: {d.supervisor.full_name}
							</p>
						)}
						{d.is_active && d.email_sent && (
							<p className="text-xs text-green-400 mt-1 flex items-center gap-1">
								<Mail size={11} /> Attachees notified
							</p>
						)}

						<div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-border/50">
							{d.is_active ? (
								<>
									<button
										onClick={() => onOpenDept(d)}
										className="btn-secondary btn-sm flex-1">
										<BookOpen size={13} /> View Logbooks
									</button>
									{isAdmin && (
										<button
											onClick={() => onRequestDeactivate(d)}
											className="btn-secondary btn-sm"
											title="Deactivate department">
											<Lock size={13} />
										</button>
									)}
								</>
							) : (
								isAdmin && (
									<button
										onClick={() => onActivate(d)}
										disabled={!cohortIsOpen || activatePending}
										className="btn-primary btn-sm flex-1 disabled:opacity-50 disabled:cursor-not-allowed">
										<Unlock size={13} />
										{activatePending ? "Activating…" : "Activate"}
									</button>
								)
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────
// DepartmentLogbooks — attachee list with progress, inside a department
// ─────────────────────────────────────────────────────────

interface DeptLogbook {
	id: string;
	attachee: { id: string; full_name: string; email: string };
	department: string;
	start_date: string;
	end_date: string;
	completion_percentage: number;
	total_entries: number;
	approved_entries: number;
	locked_entries: number; // entries already reviewed & locked
	today_entry_status:
		| "draft"
		| "submitted"
		| "approved"
		| "rejected"
		| "revision_requested"
		| "auto_submitted"
		| null;
}

function DepartmentLogbooks({
	program,
	cohort,
	dept,
	isSupervisor,
}: {
	program: Program;
	cohort: Cohort;
	dept: DepartmentActivation;
	isSupervisor: boolean;
}) {
	const { data, isLoading } = useQuery({
		queryKey: ["department-logbooks", cohort.id, dept.id],
		queryFn: () =>
			programsApi
				.departmentLogbooks(program.id, cohort.id, dept.id)
				.then((r) => r.data),
	});

	const logbooks: DeptLogbook[] = Array.isArray(data)
		? data
		: Array.isArray(data?.results)
			? data.results
			: [];

	return (
		<div className="space-y-4">
			<div className="card border-l-4 border-l-Nexus-500 flex items-start gap-2">
				<ShieldCheck size={16} className="text-Nexus-400 mt-0.5 shrink-0" />
				<p className="text-sm text-slate-300">
					Each attachee can only edit today's entry. At midnight it auto-submits
					— empty if nothing was written — and locks. Once a supervisor reviews
					an entry, it can no longer be edited by anyone.
				</p>
			</div>

			{isLoading ? (
				<div className="space-y-3">
					{[...Array(3)].map((_, i) => (
						<div key={i} className="skeleton h-24 rounded-xl" />
					))}
				</div>
			) : logbooks.length === 0 ? (
				<div className="card text-center py-14">
					<Users size={32} className="mx-auto text-slate-600 mb-3 opacity-40" />
					<p className="text-slate-400">
						No attachees enrolled in this department yet.
					</p>
				</div>
			) : (
				<div className="space-y-3">
					{logbooks.map((lb) => (
						<AttacheeLogbookRow
							key={lb.id}
							lb={lb}
							isSupervisor={isSupervisor}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function AttacheeLogbookRow({
	lb,
	isSupervisor,
}: {
	lb: DeptLogbook;
	isSupervisor: boolean;
}) {
	// NOTE: clicking through opens the existing entry-review experience
	// (EntryModal / SignatureModal / AuditModal etc. from LogbooksPage),
	// scoped to this attachee's logbook id. Wired up once the backend
	// for this layer exists — see logbooksApi.entries(lb.id) reuse.
	return (
		<div className="card-hover flex items-center gap-4">
			<div className="w-10 h-10 rounded-full bg-Nexus-500/10 flex items-center justify-center text-Nexus-400 font-semibold shrink-0">
				{lb.attachee.full_name?.[0]?.toUpperCase() || "?"}
			</div>
			<div className="flex-1 min-w-0">
				<p className="font-medium text-white text-sm truncate">
					{lb.attachee.full_name}
				</p>
				<p className="text-xs text-slate-500">
					{lb.department} · {fmtDate(lb.start_date)} — {fmtDate(lb.end_date)}
				</p>
				<div className="w-full bg-slate-800 rounded-full h-1 mt-2">
					<div
						className="h-1 rounded-full bg-Nexus-500"
						style={{ width: `${Math.min(lb.completion_percentage, 100)}%` }}
					/>
				</div>
			</div>
			<div className="text-right shrink-0">
				<p className="text-xs text-slate-400">
					{lb.completion_percentage}% complete
				</p>
				<p className="text-[11px] text-slate-500 mt-0.5">
					{lb.approved_entries}/{lb.total_entries} approved
				</p>
				{lb.locked_entries > 0 && (
					<p className="text-[10px] text-slate-600 mt-0.5 flex items-center justify-end gap-0.5">
						<Lock size={9} /> {lb.locked_entries} locked
					</p>
				)}
			</div>
			<ChevronRight size={16} className="text-slate-600 shrink-0" />
		</div>
	);
}

// ─────────────────────────────────────────────────────────
// CreateProgramModal — admin enters ONLY name + description (+ dates
// for cohort scheduling, which can be auto-split or manual per cohort)
// ─────────────────────────────────────────────────────────

function CreateProgramModal({
	onClose,
	onCreate,
	isPending,
}: {
	onClose: () => void;
	onCreate: (data: any) => void;
	isPending: boolean;
}) {
	const [scheduleMode, setScheduleMode] = useState<"auto" | "manual">("auto");
	const { register, handleSubmit, watch } = useForm({
		defaultValues: {
			name: "",
			description: "",
			start_date: "",
			end_date: "",
			cohort1_start: "",
			cohort1_end: "",
			cohort2_start: "",
			cohort2_end: "",
			cohort3_start: "",
			cohort3_end: "",
		},
	});

	function submit(d: any) {
		const payload: any = {
			name: d.name,
			description: d.description,
			start_date: d.start_date,
			end_date: d.end_date,
			cohort_schedule_mode: scheduleMode,
		};
		if (scheduleMode === "manual") {
			payload.cohorts = [
				{ start_date: d.cohort1_start, end_date: d.cohort1_end },
				{ start_date: d.cohort2_start, end_date: d.cohort2_end },
				{ start_date: d.cohort3_start, end_date: d.cohort3_end },
			];
		}
		onCreate(payload);
	}

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box max-w-lg" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h3 className="font-semibold text-white">Create Program</h3>
					<button onClick={onClose} className="text-slate-400 hover:text-white">
						<X size={18} />
					</button>
				</div>
				<form onSubmit={handleSubmit(submit)}>
					<div className="modal-body space-y-4">
						<div className="input-group">
							<label className="input-label">Program name *</label>
							<input
								{...register("name", { required: true })}
								className="input"
								placeholder="e.g. 2026 Industrial Attachment"
							/>
						</div>
						<div className="input-group">
							<label className="input-label">Description</label>
							<textarea
								{...register("description")}
								rows={2}
								className="textarea"
								placeholder="Brief description of the program…"
							/>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div className="input-group">
								<label className="input-label">Program start date *</label>
								<input
									type="date"
									{...register("start_date", { required: true })}
									className="input"
								/>
							</div>
							<div className="input-group">
								<label className="input-label">Program end date *</label>
								<input
									type="date"
									{...register("end_date", { required: true })}
									className="input"
								/>
							</div>
						</div>

						<div className="input-group">
							<label className="input-label">Cohort scheduling</label>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={() => setScheduleMode("auto")}
									className={clsx(
										"flex-1 px-3 py-2 rounded-lg border text-sm transition-colors",
										scheduleMode === "auto"
											? "border-Nexus-500 bg-Nexus-500/10 text-white"
											: "border-surface-border text-slate-400 hover:border-slate-600",
									)}>
									<Settings2 size={13} className="inline mr-1" /> Auto-split
									into 3
								</button>
								<button
									type="button"
									onClick={() => setScheduleMode("manual")}
									className={clsx(
										"flex-1 px-3 py-2 rounded-lg border text-sm transition-colors",
										scheduleMode === "manual"
											? "border-Nexus-500 bg-Nexus-500/10 text-white"
											: "border-surface-border text-slate-400 hover:border-slate-600",
									)}>
									<CalendarDays size={13} className="inline mr-1" /> Set
									manually
								</button>
							</div>
							<p className="text-xs text-slate-500 mt-1.5">
								{scheduleMode === "auto"
									? "The program period will be split into 3 equal cohort periods automatically. Cohort 1 activates on the program start date; 2 and 3 activate on their scheduled dates only once the previous cohort has closed."
									: "Set each cohort's own start/end date below. Sequencing (1 → 2 → 3, each waiting for the previous to close) still applies regardless of dates."}
							</p>
						</div>

						{scheduleMode === "manual" && (
							<div className="space-y-3 p-3 rounded-lg bg-surface border border-surface-border">
								{[1, 2, 3].map((n) => (
									<div key={n} className="grid grid-cols-2 gap-3">
										<div className="input-group">
											<label className="input-label text-xs">
												Cohort {n} start
											</label>
											<input
												type="date"
												{...register(`cohort${n}_start` as any, {
													required: scheduleMode === "manual",
												})}
												className="input py-1.5 text-sm"
											/>
										</div>
										<div className="input-group">
											<label className="input-label text-xs">
												Cohort {n} end
											</label>
											<input
												type="date"
												{...register(`cohort${n}_end` as any, {
													required: scheduleMode === "manual",
												})}
												className="input py-1.5 text-sm"
											/>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
					<div className="modal-footer">
						<button type="button" onClick={onClose} className="btn-secondary">
							Cancel
						</button>
						<button type="submit" className="btn-primary" disabled={isPending}>
							{isPending ? "Creating…" : "Create Program"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────
// ConfirmDeactivateModal
// ─────────────────────────────────────────────────────────

function ConfirmDeactivateModal({
	dept,
	onClose,
	onConfirm,
	isPending,
}: {
	dept: DepartmentActivation;
	onClose: () => void;
	onConfirm: () => void;
	isPending: boolean;
}) {
	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box max-w-sm" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h3 className="font-semibold text-white">Deactivate Department</h3>
					<button onClick={onClose} className="text-slate-400 hover:text-white">
						<X size={18} />
					</button>
				</div>
				<div className="modal-body">
					<div className="flex items-start gap-2">
						<AlertTriangle
							size={18}
							className="text-yellow-400 mt-0.5 shrink-0"
						/>
						<p className="text-sm text-slate-300">
							Deactivating{" "}
							<span className="text-white font-medium">
								{dept.department.name}
							</span>{" "}
							will hide its logbooks from attachees. Existing entries and
							reviews are kept, not deleted.
						</p>
					</div>
				</div>
				<div className="modal-footer">
					<button onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						onClick={onConfirm}
						disabled={isPending}
						className="btn-primary bg-red-600 hover:bg-red-500">
						{isPending ? "Deactivating…" : "Deactivate"}
					</button>
				</div>
			</div>
		</div>
	);
}
