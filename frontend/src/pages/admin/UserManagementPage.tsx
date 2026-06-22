// NEXUS — User Management Page (Comprehensive)
import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import {
	Shield,
	Plus,
	Search,
	Eye,
	Edit3,
	UserX,
	UserCheck,
	Upload,
	RefreshCw,
	Download,
	Key,
	Smartphone,
	Lock,
	Unlock,
	UserMinus,
	ChevronDown,
	ChevronUp,
	MoreHorizontal,
	CheckSquare,
	Square,
	Filter,
	X,
	AlertTriangle,
	Send,
	Users,
	Activity,
	LogOut,
	Settings,
	Copy,
	Trash2,
	ShieldOff,
	ShieldCheck,
	Clock,
	ArrowUpDown,
	SlidersHorizontal,
	Mail,
	Phone,
	Building2,
	Briefcase,
	CalendarDays,
	Globe,
} from "lucide-react";
import { usersApi, hrApi } from "../../services/api";
import { useAuthStore } from "../../services/api";
import toast from "react-hot-toast";
import clsx from "clsx";

// ── Constants ──────────────────────────────────────────────────────────────

const ROLES = [
	{
		value: "system_admin",
		label: "System Administrator",
		color: "badge-purple",
	},
	{ value: "hr_officer", label: "HR Officer", color: "badge-green" },
	{ value: "executive", label: "Executive", color: "badge-blue" },
	{ value: "data_analyst", label: "Data Analyst", color: "badge-indigo" },
	{ value: "finance", label: "Finance Officer", color: "badge-amber" },
	{ value: "procurement", label: "Procurement Officer", color: "badge-amber" },
	{ value: "ict", label: "ICT / IT Staff", color: "badge-cyan" },
	{
		value: "communications",
		label: "Communications / PR",
		color: "badge-pink",
	},
	{ value: "legal", label: "Legal Officer", color: "badge-slate" },
	{ value: "qc", label: "Quality Assurance", color: "badge-teal" },
	{ value: "operations", label: "Operations Staff", color: "badge-slate" },
	{
		value: "customer_service",
		label: "Customer Service",
		color: "badge-green",
	},
	{ value: "rd", label: "Research & Development", color: "badge-purple" },
	{ value: "hse", label: "HSE Officer", color: "badge-red" },
	{ value: "facilities", label: "Facilities Manager", color: "badge-slate" },
	{ value: "security_officer", label: "Security Officer", color: "badge-red" },
	{
		value: "university_coordinator",
		label: "University Coordinator",
		color: "badge-indigo",
	},
	{ value: "lecturer", label: "Lecturer", color: "badge-indigo" },
	{ value: "broadcast_admin", label: "Broadcast Admin", color: "badge-amber" },
	{ value: "broadcast_staff", label: "Broadcast Staff", color: "badge-amber" },
	{
		value: "broadcast_student",
		label: "Broadcast Student",
		color: "badge-slate",
	},
	{ value: "journalist", label: "Journalist", color: "badge-green" },
	{ value: "presenter", label: "Presenter / DJ", color: "badge-blue" },
	{ value: "editor", label: "Editor", color: "badge-blue" },
	{ value: "videographer", label: "Videographer", color: "badge-cyan" },
	{ value: "station_engineer", label: "Station Engineer", color: "badge-teal" },
	{ value: "supervisor", label: "Supervisor", color: "badge-blue" },
	{
		value: "department_leader",
		label: "Department Leader",
		color: "badge-purple",
	},
	{ value: "attachee", label: "Attachee / Intern", color: "badge-slate" },
];

const ROLE_MAP = Object.fromEntries(ROLES.map((r) => [r.value, r]));

const STATUSES = [
	{ value: "active", label: "Active", color: "badge-green" },
	{ value: "inactive", label: "Inactive", color: "badge-slate" },
	{ value: "suspended", label: "Suspended", color: "badge-red" },
	{ value: "pending", label: "Pending", color: "badge-amber" },
	{ value: "offboarded", label: "Offboarded", color: "badge-slate" },
];

const EMPLOYMENT_TYPES = [
	{ value: "full_time", label: "Full Time" },
	{ value: "part_time", label: "Part Time" },
	{ value: "contract", label: "Contract" },
	{ value: "intern", label: "Intern / Attachee" },
	{ value: "volunteer", label: "Volunteer" },
	{ value: "consultant", label: "Consultant" },
];

type SortField = "full_name" | "date_joined" | "last_login" | "role" | "status";
type Tab =
	| "all"
	| "active"
	| "inactive"
	| "suspended"
	| "pending"
	| "offboarded"
	| "locked";

// ── Main Page ──────────────────────────────────────────────────────────────

export default function UserManagementPage() {
	const { user: me } = useAuthStore();
	const qc = useQueryClient();

	// Filters
	const [search, setSearch] = useState("");
	const [roleFilter, setRoleFilter] = useState("");
	const [deptFilter, setDeptFilter] = useState("");
	const [branchFilter, setBranchFilter] = useState("");
	const [employmentFilter, setEmploymentFilter] = useState("");
	const [mfaFilter, setMfaFilter] = useState("");
	const [tab, setTab] = useState<Tab>("all");
	const [sortField, setSortField] = useState<SortField>("date_joined");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
	const [showFilters, setShowFilters] = useState(false);
	const [page, setPage] = useState(1);

	// Selection
	const [selected, setSelected] = useState<Set<string>>(new Set());

	// Modals
	const [modal, setModal] = useState<
		| { type: "create" }
		| { type: "edit"; user: any }
		| { type: "view"; user: any }
		| { type: "bulk-import" }
		| { type: "role"; user: any }
		| { type: "reset-password"; user: any }
		| { type: "suspend"; user: any }
		| { type: "offboard"; user: any }
		| { type: "sessions"; user: any }
		| { type: "activity"; user: any }
		| { type: "invite" }
		| { type: "bulk-action"; action: string }
		| null
	>(null);

	const closeModal = () => setModal(null);
	const invalidate = () => {
		qc.invalidateQueries({ queryKey: ["users"] });
		qc.invalidateQueries({ queryKey: ["user-stats"] });
	};

	// Queries
	const queryParams = {
		search: search || undefined,
		role: roleFilter || undefined,
		department: deptFilter || undefined,
		branch: branchFilter || undefined,
		employment_type: employmentFilter || undefined,
		mfa_enabled:
			mfaFilter === "on" ? true : mfaFilter === "off" ? false : undefined,
		status: tab !== "all" && tab !== "locked" ? tab : undefined,
		page,
		page_size: 25,
	};

	const {
		data: usersData,
		isLoading,
		isFetching,
	} = useQuery({
		queryKey: ["users", queryParams],
		queryFn: () => usersApi.list(queryParams).then((r) => r.data),
		refetchInterval: 60000,
	});

	const { data: statsData } = useQuery({
		queryKey: ["user-stats"],
		queryFn: () => usersApi.stats().then((r) => r.data),
		refetchInterval: 120000,
	});

	const { data: depts = [] } = useQuery({
		queryKey: ["departments"],
		queryFn: () => hrApi.departments().then((r) => r.data.results || r.data),
	});

	const { data: branches = [] } = useQuery({
		queryKey: ["branches"],
		queryFn: () => hrApi.branches().then((r) => r.data.results || r.data),
	});

	const { data: supervisors = [] } = useQuery({
		queryKey: ["supervisors"],
		queryFn: () =>
			usersApi.listSupervisors().then((r) => {
				const d = r.data;
				return Array.isArray(d) ? d : (d.results ?? []);
			}),
	});

	let users: any[] = Array.isArray(usersData)
		? usersData
		: (usersData?.results ?? []);

	// Client-side: filter locked if tab === "locked"
	if (tab === "locked") users = users.filter((u: any) => u.is_locked);

	// Client-side sort
	users = [...users].sort((a, b) => {
		let av = a[sortField] ?? "";
		let bv = b[sortField] ?? "";
		if (typeof av === "string") av = av.toLowerCase();
		if (typeof bv === "string") bv = bv.toLowerCase();
		return sortDir === "asc" ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
	});

	const totalPages = usersData?.count ? Math.ceil(usersData.count / 25) : 1;

	// Selection helpers
	const allIds = users.map((u: any) => u.id);
	const allSelected =
		allIds.length > 0 && allIds.every((id) => selected.has(id));
	const someSelected = selected.size > 0;

	const toggleAll = () => {
		if (allSelected) setSelected(new Set());
		else setSelected(new Set(allIds));
	};
	const toggleOne = (id: string) => {
		const s = new Set(selected);
		s.has(id) ? s.delete(id) : s.add(id);
		setSelected(s);
	};

	// Sort handler
	const handleSort = (f: SortField) => {
		if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		else {
			setSortField(f);
			setSortDir("asc");
		}
	};

	// Quick mutations
	const activateMut = useMutation({
		mutationFn: (id: string) => usersApi.activate(id),
		onSuccess: () => {
			invalidate();
			toast.success("User activated");
		},
		onError: () => toast.error("Failed"),
	});
	const deactivateMut = useMutation({
		mutationFn: (id: string) => usersApi.deactivate(id),
		onSuccess: () => {
			invalidate();
			toast.success("User deactivated");
		},
		onError: () => toast.error("Failed"),
	});
	const unlockMut = useMutation({
		mutationFn: (id: string) =>
			usersApi.update(id, { failed_login_attempts: 0, locked_until: null }),
		onSuccess: () => {
			invalidate();
			toast.success("Account unlocked");
		},
		onError: () => toast.error("Failed"),
	});

	const exportMut = useMutation({
		mutationFn: () => usersApi.export({ format: "csv" }),
		onSuccess: (res) => {
			const url = URL.createObjectURL(new Blob([res.data]));
			const a = document.createElement("a");
			a.href = url;
			a.download = "users.csv";
			a.click();
			URL.revokeObjectURL(url);
			toast.success("Export downloaded");
		},
		onError: () => toast.error("Export failed"),
	});

	const resetSearch = () => {
		setSearch("");
		setRoleFilter("");
		setDeptFilter("");
		setBranchFilter("");
		setEmploymentFilter("");
		setMfaFilter("");
		setTab("all");
		setPage(1);
	};

	const hasFilters =
		search ||
		roleFilter ||
		deptFilter ||
		branchFilter ||
		employmentFilter ||
		mfaFilter ||
		tab !== "all";

	// Stat cards
	const statCards = [
		{
			label: "Total",
			value: statsData?.total_users ?? "—",
			color: "text-white",
			icon: Users,
		},
		{
			label: "Active",
			value: statsData?.active_users ?? "—",
			color: "text-green-400",
			icon: UserCheck,
		},
		{
			label: "Suspended",
			value: statsData?.suspended_users ?? "—",
			color: "text-red-400",
			icon: ShieldOff,
		},
		{
			label: "MFA On",
			value: statsData?.mfa_enabled ?? "—",
			color: "text-nexus-400",
			icon: ShieldCheck,
		},
		{
			label: "Locked",
			value: statsData?.locked_accounts ?? "—",
			color: "text-amber-400",
			icon: Lock,
		},
		{
			label: "New (30d)",
			value: statsData?.recent_joins_30d ?? "—",
			color: "text-purple-400",
			icon: Plus,
		},
		{
			label: "Offboarded",
			value: statsData?.offboarded_users ?? "—",
			color: "text-slate-400",
			icon: UserMinus,
		},
		{
			label: "Pending OB",
			value: statsData?.onboarding_pending ?? "—",
			color: "text-amber-400",
			icon: Clock,
		},
	];

	return (
		<div className="space-y-5 animate-fade-in">
			{/* Header */}
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<Shield size={20} className="text-nexus-400" /> User Management
					</h1>
					<p className="page-subtitle">
						{statsData?.total_users ?? "—"} users · manage roles, sessions,
						permissions and access
					</p>
				</div>
				<div className="flex gap-2 flex-wrap justify-end">
					<button
						onClick={() => setModal({ type: "invite" })}
						className="btn-secondary btn-sm">
						<Mail size={13} /> Invite
					</button>
					<button
						onClick={() => setModal({ type: "bulk-import" })}
						className="btn-secondary btn-sm">
						<Upload size={13} /> Import CSV
					</button>
					<button
						onClick={() => exportMut.mutate()}
						disabled={exportMut.isPending}
						className="btn-secondary btn-sm">
						<Download size={13} />{" "}
						{exportMut.isPending ? "Exporting…" : "Export"}
					</button>
					<button
						onClick={() => setModal({ type: "create" })}
						className="btn-primary">
						<Plus size={14} /> Add User
					</button>
				</div>
			</div>

			{/* Stat Strip */}
			<div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
				{statCards.map(({ label, value, color, icon: Icon }) => (
					<div key={label} className="stat-card cursor-default">
						<div className={clsx("stat-value text-xl", color)}>{value}</div>
						<div className="stat-label flex items-center gap-1">
							<Icon size={10} />
							{label}
						</div>
					</div>
				))}
			</div>

			{/* Tabs */}
			<div className="flex gap-1 border-b border-white/5 overflow-x-auto">
				{(
					[
						["all", "All"],
						["active", "Active"],
						["inactive", "Inactive"],
						["suspended", "Suspended"],
						["pending", "Pending"],
						["offboarded", "Offboarded"],
						["locked", "Locked"],
					] as [Tab, string][]
				).map(([v, l]) => (
					<button
						key={v}
						onClick={() => {
							setTab(v);
							setPage(1);
							setSelected(new Set());
						}}
						className={clsx(
							"px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
							tab === v
								? "border-nexus-400 text-nexus-300"
								: "border-transparent text-slate-500 hover:text-slate-300",
						)}>
						{l}
					</button>
				))}
			</div>

			{/* Search + Filters */}
			<div className="space-y-3">
				<div className="flex gap-2 flex-wrap">
					<div className="relative flex-1 min-w-52">
						<Search
							size={13}
							className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
						/>
						<input
							value={search}
							onChange={(e) => {
								setSearch(e.target.value);
								setPage(1);
							}}
							placeholder="Search name, email, employee ID…"
							className="input pl-9 py-2 text-sm"
						/>
						{search && (
							<button
								onClick={() => setSearch("")}
								className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
								<X size={12} />
							</button>
						)}
					</div>
					<select
						value={roleFilter}
						onChange={(e) => {
							setRoleFilter(e.target.value);
							setPage(1);
						}}
						className="select-input w-44 text-sm">
						<option value="">All Roles</option>
						{ROLES.map((r) => (
							<option key={r.value} value={r.value}>
								{r.label}
							</option>
						))}
					</select>
					<button
						onClick={() => setShowFilters((f) => !f)}
						className={clsx(
							"btn-secondary btn-sm gap-1",
							showFilters && "ring-1 ring-nexus-400",
						)}>
						<SlidersHorizontal size={13} />
						Filters{" "}
						{hasFilters && (
							<span className="w-1.5 h-1.5 rounded-full bg-nexus-400 ml-0.5" />
						)}
					</button>
					{hasFilters && (
						<button
							onClick={resetSearch}
							className="btn-ghost btn-sm text-slate-400">
							<X size={12} /> Clear all
						</button>
					)}
				</div>

				{showFilters && (
					<div className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
						<div className="input-group">
							<label className="input-label">Department</label>
							<select
								value={deptFilter}
								onChange={(e) => setDeptFilter(e.target.value)}
								className="select-input text-sm">
								<option value="">All</option>
								{depts.map((d: any) => (
									<option key={d.id} value={d.id}>
										{d.name}
									</option>
								))}
							</select>
						</div>
						<div className="input-group">
							<label className="input-label">Branch</label>
							<select
								value={branchFilter}
								onChange={(e) => setBranchFilter(e.target.value)}
								className="select-input text-sm">
								<option value="">All</option>
								{branches.map((b: any) => (
									<option key={b.id} value={b.id}>
										{b.name}
									</option>
								))}
							</select>
						</div>
						<div className="input-group">
							<label className="input-label">Employment Type</label>
							<select
								value={employmentFilter}
								onChange={(e) => setEmploymentFilter(e.target.value)}
								className="select-input text-sm">
								<option value="">All</option>
								{EMPLOYMENT_TYPES.map((e) => (
									<option key={e.value} value={e.value}>
										{e.label}
									</option>
								))}
							</select>
						</div>
						<div className="input-group">
							<label className="input-label">MFA</label>
							<select
								value={mfaFilter}
								onChange={(e) => setMfaFilter(e.target.value)}
								className="select-input text-sm">
								<option value="">All</option>
								<option value="on">Enabled</option>
								<option value="off">Disabled</option>
							</select>
						</div>
					</div>
				)}
			</div>

			{/* Bulk Action Bar */}
			{someSelected && (
				<div className="card p-3 flex items-center gap-3 flex-wrap border border-nexus-400/30">
					<span className="text-sm text-nexus-300 font-medium">
						{selected.size} selected
					</span>
					<div className="flex gap-2 flex-wrap">
						<button
							onClick={() =>
								setModal({ type: "bulk-action", action: "activate" })
							}
							className="btn-success btn-sm">
							<UserCheck size={12} /> Activate
						</button>
						<button
							onClick={() =>
								setModal({ type: "bulk-action", action: "deactivate" })
							}
							className="btn-danger btn-sm">
							<UserX size={12} /> Deactivate
						</button>
						<button
							onClick={() =>
								setModal({ type: "bulk-action", action: "change_role" })
							}
							className="btn-secondary btn-sm">
							<Settings size={12} /> Change Role
						</button>
						<button
							onClick={() =>
								setModal({ type: "bulk-action", action: "reassign" })
							}
							className="btn-secondary btn-sm">
							<Building2 size={12} /> Reassign
						</button>
						<button
							onClick={() =>
								setModal({ type: "bulk-action", action: "revoke_sessions" })
							}
							className="btn-secondary btn-sm">
							<LogOut size={12} /> Revoke Sessions
						</button>
					</div>
					<button
						onClick={() => setSelected(new Set())}
						className="ml-auto btn-ghost btn-sm text-slate-400">
						<X size={12} /> Clear
					</button>
				</div>
			)}

			{/* Table */}
			<div className="card overflow-x-auto">
				{isFetching && !isLoading && (
					<div className="h-0.5 bg-nexus-400/30 relative overflow-hidden">
						<div className="absolute inset-y-0 left-0 w-1/3 bg-nexus-400 animate-pulse" />
					</div>
				)}
				<table className="data-table">
					<thead>
						<tr>
							<th className="w-10">
								<button onClick={toggleAll}>
									{allSelected ? (
										<CheckSquare size={14} className="text-nexus-400" />
									) : (
										<Square size={14} className="text-slate-500" />
									)}
								</button>
							</th>
							<th>
								<button
									onClick={() => handleSort("full_name")}
									className="flex items-center gap-1 hover:text-white">
									User <ArrowUpDown size={11} className="opacity-50" />
								</button>
							</th>
							<th>
								<button
									onClick={() => handleSort("role")}
									className="flex items-center gap-1 hover:text-white">
									Role <ArrowUpDown size={11} className="opacity-50" />
								</button>
							</th>
							<th className="hidden md:table-cell">Department / Branch</th>
							<th>
								<button
									onClick={() => handleSort("status")}
									className="flex items-center gap-1 hover:text-white">
									Status <ArrowUpDown size={11} className="opacity-50" />
								</button>
							</th>
							<th className="hidden lg:table-cell">MFA</th>
							<th className="hidden lg:table-cell">
								<button
									onClick={() => handleSort("last_login")}
									className="flex items-center gap-1 hover:text-white">
									Last Login <ArrowUpDown size={11} className="opacity-50" />
								</button>
							</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{isLoading ? (
							[...Array(10)].map((_, i) => (
								<tr key={i}>
									<td colSpan={8}>
										<div className="skeleton h-8 w-full my-1" />
									</td>
								</tr>
							))
						) : users.length === 0 ? (
							<tr>
								<td colSpan={8} className="text-center py-16 text-slate-500">
									<Shield size={32} className="mx-auto mb-3 opacity-20" />
									<div className="font-medium text-slate-400">
										No users found
									</div>
									<div className="text-xs mt-1">Try adjusting your filters</div>
								</td>
							</tr>
						) : (
							users.map((u: any) => (
								<UserRow
									key={u.id}
									u={u}
									selected={selected.has(u.id)}
									onToggle={() => toggleOne(u.id)}
									onView={() => setModal({ type: "view", user: u })}
									onEdit={() => setModal({ type: "edit", user: u })}
									onRole={() => setModal({ type: "role", user: u })}
									onResetPw={() =>
										setModal({ type: "reset-password", user: u })
									}
									onSuspend={() => setModal({ type: "suspend", user: u })}
									onUnsuspend={() => activateMut.mutate(u.id)}
									onActivate={() => activateMut.mutate(u.id)}
									onDeactivate={() => deactivateMut.mutate(u.id)}
									onUnlock={() => unlockMut.mutate(u.id)}
									onOffboard={() => setModal({ type: "offboard", user: u })}
									onSessions={() => setModal({ type: "sessions", user: u })}
									onActivity={() => setModal({ type: "activity", user: u })}
								/>
							))
						)}
					</tbody>
				</table>
			</div>

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="flex items-center justify-between text-sm text-slate-400">
					<span>
						Page {page} of {totalPages}
					</span>
					<div className="flex gap-2">
						<button
							disabled={page === 1}
							onClick={() => setPage((p) => p - 1)}
							className="btn-secondary btn-sm disabled:opacity-40">
							Previous
						</button>
						<button
							disabled={page === totalPages}
							onClick={() => setPage((p) => p + 1)}
							className="btn-secondary btn-sm disabled:opacity-40">
							Next
						</button>
					</div>
				</div>
			)}

			{/* Modals */}
			{modal?.type === "create" && (
				<UserFormModal
					user={null}
					depts={depts}
					branches={branches}
					supervisors={supervisors}
					onClose={closeModal}
					onSuccess={() => {
						invalidate();
						closeModal();
					}}
				/>
			)}
			{modal?.type === "edit" && (
				<UserFormModal
					user={modal.user}
					depts={depts}
					branches={branches}
					supervisors={supervisors}
					onClose={closeModal}
					onSuccess={() => {
						invalidate();
						closeModal();
					}}
				/>
			)}
			{modal?.type === "view" && (
				<UserDetailModal
					userId={modal.user.id}
					onClose={closeModal}
					onEdit={() => setModal({ type: "edit", user: modal.user })}
				/>
			)}
			{modal?.type === "role" && (
				<RoleChangeModal
					user={modal.user}
					onClose={closeModal}
					onSuccess={() => {
						invalidate();
						closeModal();
					}}
				/>
			)}
			{modal?.type === "reset-password" && (
				<ResetPasswordModal
					user={modal.user}
					onClose={closeModal}
					onSuccess={() => {
						invalidate();
						closeModal();
					}}
				/>
			)}
			{modal?.type === "suspend" && (
				<SuspendModal
					user={modal.user}
					onClose={closeModal}
					onSuccess={() => {
						invalidate();
						closeModal();
					}}
				/>
			)}
			{modal?.type === "offboard" && (
				<OffboardModal
					user={modal.user}
					onClose={closeModal}
					onSuccess={() => {
						invalidate();
						closeModal();
					}}
				/>
			)}
			{modal?.type === "sessions" && (
				<SessionsModal user={modal.user} onClose={closeModal} />
			)}
			{modal?.type === "activity" && (
				<ActivityModal user={modal.user} onClose={closeModal} />
			)}
			{modal?.type === "invite" && (
				<InviteModal
					depts={depts}
					branches={branches}
					onClose={closeModal}
					onSuccess={closeModal}
				/>
			)}
			{modal?.type === "bulk-import" && (
				<BulkImportModal
					onClose={closeModal}
					onSuccess={() => {
						invalidate();
						closeModal();
					}}
				/>
			)}
			{modal?.type === "bulk-action" && (
				<BulkActionModal
					action={modal.action}
					ids={Array.from(selected)}
					depts={depts}
					branches={branches}
					onClose={closeModal}
					onSuccess={() => {
						invalidate();
						setSelected(new Set());
						closeModal();
					}}
				/>
			)}
		</div>
	);
}

// ── User Row ───────────────────────────────────────────────────────────────

function UserRow({
	u,
	selected,
	onToggle,
	onView,
	onEdit,
	onRole,
	onResetPw,
	onSuspend,
	onUnsuspend,
	onActivate,
	onDeactivate,
	onUnlock,
	onOffboard,
	onSessions,
	onActivity,
}: any) {
	const [menuOpen, setMenuOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const roleInfo = ROLE_MAP[u.role];
	const statusInfo = STATUSES.find((s) => s.value === u.status);

	const initials =
		u.full_name
			?.split(" ")
			.map((n: string) => n[0])
			.join("")
			.slice(0, 2) ?? "??";

	return (
		<tr className={clsx(selected && "bg-nexus-400/5")}>
			<td>
				<button onClick={onToggle}>
					{selected ? (
						<CheckSquare size={14} className="text-nexus-400" />
					) : (
						<Square size={14} className="text-slate-600 hover:text-slate-300" />
					)}
				</button>
			</td>
			<td>
				<div className="flex items-center gap-3 min-w-[180px]">
					{u.profile_photo ? (
						<img
							src={u.profile_photo}
							alt={u.full_name}
							className="w-8 h-8 rounded-full object-cover shrink-0"
						/>
					) : (
						<div className="w-8 h-8 rounded-full bg-gradient-nexus flex items-center justify-center text-xs font-bold text-white shrink-0">
							{initials}
						</div>
					)}
					<div>
						<div className="font-medium text-white text-sm flex items-center gap-1.5">
							{u.full_name}
							{u.is_locked && (
								<Lock
									size={10}
									className="text-amber-400"
									aria-label="Locked out"
								/>
							)}
							{u.must_change_password && (
								<Key
									size={10}
									className="text-orange-400"
									aria-label="Must change password"
								/>
							)}
						</div>
						<div className="text-xs text-slate-500">{u.email}</div>
						{u.employee_id && (
							<div className="text-[10px] text-slate-600">{u.employee_id}</div>
						)}
					</div>
				</div>
			</td>
			<td>
				<span
					className={clsx(
						"badge text-[10px]",
						roleInfo?.color ?? "badge-slate",
					)}>
					{u.role_display || u.role}
				</span>
			</td>
			<td className="hidden md:table-cell">
				<div className="text-xs text-slate-400">{u.department_name || "—"}</div>
				{u.branch_name && (
					<div className="text-[10px] text-slate-600">{u.branch_name}</div>
				)}
			</td>
			<td>
				<span
					className={clsx(
						"badge text-[10px]",
						statusInfo?.color ?? "badge-slate",
					)}>
					{statusInfo?.label ?? u.status}
				</span>
			</td>
			<td className="hidden lg:table-cell">
				{u.mfa_enabled ? (
					<span className="flex items-center gap-1 text-[11px] text-nexus-400">
						<ShieldCheck size={11} />
						On
					</span>
				) : (
					<span className="text-[11px] text-slate-600">Off</span>
				)}
			</td>
			<td className="hidden lg:table-cell text-xs text-slate-500">
				{u.last_login ? (
					<span title={format(parseISO(u.last_login), "dd MMM yyyy HH:mm")}>
						{formatDistanceToNow(parseISO(u.last_login), { addSuffix: true })}
					</span>
				) : (
					"Never"
				)}
			</td>
			<td>
				<div className="flex items-center gap-1">
					<button
						onClick={onView}
						className="btn-ghost btn-sm p-1.5"
						title="View profile">
						<Eye size={13} />
					</button>
					<button
						onClick={onEdit}
						className="btn-ghost btn-sm p-1.5"
						title="Edit">
						<Edit3 size={13} />
					</button>
					{/* More menu */}
					<div className="relative" ref={ref}>
						<button
							onClick={() => setMenuOpen((m) => !m)}
							className="btn-ghost btn-sm p-1.5"
							title="More actions">
							<MoreHorizontal size={13} />
						</button>
						{menuOpen && (
							<DropMenu onClose={() => setMenuOpen(false)}>
								<MenuItem
									icon={Settings}
									label="Change Role"
									onClick={() => {
										onRole();
										setMenuOpen(false);
									}}
								/>
								<MenuItem
									icon={Key}
									label="Reset Password"
									onClick={() => {
										onResetPw();
										setMenuOpen(false);
									}}
								/>
								<MenuDivider />
								{u.status === "suspended" ? (
									<MenuItem
										icon={UserCheck}
										label="Unsuspend"
										onClick={() => {
											onUnsuspend();
											setMenuOpen(false);
										}}
									/>
								) : (
									<MenuItem
										icon={ShieldOff}
										label="Suspend"
										danger
										onClick={() => {
											onSuspend();
											setMenuOpen(false);
										}}
									/>
								)}
								{u.is_active ? (
									<MenuItem
										icon={UserX}
										label="Deactivate"
										danger
										onClick={() => {
											onDeactivate();
											setMenuOpen(false);
										}}
									/>
								) : (
									<MenuItem
										icon={UserCheck}
										label="Activate"
										onClick={() => {
											onActivate();
											setMenuOpen(false);
										}}
									/>
								)}
								{u.is_locked && (
									<MenuItem
										icon={Unlock}
										label="Unlock Account"
										onClick={() => {
											onUnlock();
											setMenuOpen(false);
										}}
									/>
								)}
								<MenuDivider />
								<MenuItem
									icon={Activity}
									label="Activity Log"
									onClick={() => {
										onActivity();
										setMenuOpen(false);
									}}
								/>
								<MenuItem
									icon={Globe}
									label="Sessions"
									onClick={() => {
										onSessions();
										setMenuOpen(false);
									}}
								/>
								<MenuDivider />
								<MenuItem
									icon={UserMinus}
									label="Offboard"
									danger
									onClick={() => {
										onOffboard();
										setMenuOpen(false);
									}}
								/>
							</DropMenu>
						)}
					</div>
				</div>
			</td>
		</tr>
	);
}

// ── Drop Menu helpers ──────────────────────────────────────────────────────

function DropMenu({ children, onClose }: any) {
	return (
		<>
			<div className="fixed inset-0 z-40" onClick={onClose} />
			<div className="absolute right-0 top-full mt-1 z-50 w-44 bg-[#1a2035] border border-white/10 rounded-lg shadow-xl py-1 text-xs">
				{children}
			</div>
		</>
	);
}
function MenuItem({ icon: Icon, label, onClick, danger }: any) {
	return (
		<button
			onClick={onClick}
			className={clsx(
				"w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-colors",
				danger
					? "text-red-400 hover:text-red-300"
					: "text-slate-300 hover:text-white",
			)}>
			<Icon size={12} />
			{label}
		</button>
	);
}
function MenuDivider() {
	return <div className="my-1 border-t border-white/5" />;
}

// ── Modal Shell ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, size = "max-w-2xl", footer }: any) {
	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div
				className={clsx("modal-box", size)}
				onClick={(e) => e.stopPropagation()}>
				<div className="modal-header flex items-center justify-between">
					<h3 className="font-semibold text-white">{title}</h3>
					<button onClick={onClose} className="btn-ghost p-1">
						<X size={16} />
					</button>
				</div>
				<div className="modal-body">{children}</div>
				{footer && <div className="modal-footer">{footer}</div>}
			</div>
		</div>
	);
}

// ── User Form Modal (Create / Edit) ───────────────────────────────────────

function UserFormModal({
	user,
	depts,
	branches,
	supervisors,
	onClose,
	onSuccess,
}: any) {
	const isEdit = !!user;
	const {
		register,
		handleSubmit,
		watch,
		formState: { errors },
	} = useForm({
		defaultValues: user || {
			role: "attachee",
			employment_type: "intern",
			is_active: true,
		},
	});
	const [tab, setTab] = useState<
		"basic" | "employment" | "personal" | "notifications"
	>("basic");

	const mut = useMutation({
		mutationFn: (data: any) =>
			isEdit ? usersApi.update(user.id, data) : usersApi.create(data),
		onSuccess: () => {
			toast.success(isEdit ? "User updated" : "User created");
			onSuccess();
		},
		onError: (e: any) =>
			toast.error(
				e.response?.data?.detail ||
					JSON.stringify(e.response?.data) ||
					"Failed",
			),
	});

	const tabs = [
		{ key: "basic", label: "Basic Info" },
		{ key: "employment", label: "Employment" },
		{ key: "personal", label: "Personal" },
		{ key: "notifications", label: "Preferences" },
	] as const;

	return (
		<Modal
			title={isEdit ? `Edit — ${user.full_name}` : "Create New User"}
			onClose={onClose}
			size="max-w-3xl"
			footer={
				<>
					<button onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						onClick={handleSubmit((d) => mut.mutate(d))}
						disabled={mut.isPending}
						className="btn-primary">
						{mut.isPending ? "Saving…" : isEdit ? "Update User" : "Create User"}
					</button>
				</>
			}>
			{/* Tabs */}
			<div className="flex gap-1 border-b border-white/5 mb-4 -mx-6 px-6">
				{tabs.map((t) => (
					<button
						key={t.key}
						onClick={() => setTab(t.key as any)}
						className={clsx(
							"px-3 py-2 text-xs border-b-2 transition-colors",
							tab === t.key
								? "border-nexus-400 text-nexus-300"
								: "border-transparent text-slate-500 hover:text-slate-300",
						)}>
						{t.label}
					</button>
				))}
			</div>

			{tab === "basic" && (
				<div className="grid grid-cols-2 gap-4">
					<Field label="First Name *" error={errors.first_name}>
						<input
							{...register("first_name", { required: "Required" })}
							className="input"
						/>
					</Field>
					<Field label="Last Name *" error={errors.last_name}>
						<input
							{...register("last_name", { required: "Required" })}
							className="input"
						/>
					</Field>
					<Field label="Email Address *" error={errors.email}>
						<input
							type="email"
							{...register("email", { required: "Required" })}
							className="input"
							disabled={isEdit}
						/>
					</Field>
					<Field label="Phone">
						<input
							{...register("phone")}
							className="input"
							placeholder="+254 700 000 000"
						/>
					</Field>
					{!isEdit && (
						<Field
							label="Password"
							error={errors.password}
							hint="Leave blank to auto-generate">
							<input
								type="password"
								{...register("password", {
									minLength: { value: 10, message: "Min 10 chars" },
								})}
								className="input"
								placeholder="Min. 10 characters"
							/>
						</Field>
					)}
					<Field label="Employee ID">
						<input
							{...register("employee_id")}
							className="input"
							placeholder="EMP-001"
						/>
					</Field>
					<Field label="Role *">
						<select
							{...register("role", { required: true })}
							className="select-input">
							{ROLES.map((r) => (
								<option key={r.value} value={r.value}>
									{r.label}
								</option>
							))}
						</select>
					</Field>
					<Field label="Supervisor">
						<select {...register("supervisor_user")} className="select-input">
							<option value="">None</option>
							{supervisors.map((s: any) => (
								<option key={s.id} value={s.id}>
									{s.full_name}
								</option>
							))}
						</select>
					</Field>
					{isEdit && (
						<div className="col-span-2">
							<label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
								<input
									type="checkbox"
									{...register("is_active")}
									className="rounded"
								/>
								Account is active
							</label>
						</div>
					)}
				</div>
			)}

			{tab === "employment" && (
				<div className="grid grid-cols-2 gap-4">
					<Field label="Job Title">
						<input
							{...register("job_title")}
							className="input"
							placeholder="e.g. Senior Journalist"
						/>
					</Field>
					<Field label="Employment Type">
						<select {...register("employment_type")} className="select-input">
							{EMPLOYMENT_TYPES.map((e) => (
								<option key={e.value} value={e.value}>
									{e.label}
								</option>
							))}
						</select>
					</Field>
					<Field label="Branch">
						<select {...register("branch")} className="select-input">
							<option value="">None</option>
							{branches.map((b: any) => (
								<option key={b.id} value={b.id}>
									{b.name}
								</option>
							))}
						</select>
					</Field>
					<Field label="Department">
						<select {...register("department")} className="select-input">
							<option value="">None</option>
							{depts.map((d: any) => (
								<option key={d.id} value={d.id}>
									{d.name}
								</option>
							))}
						</select>
					</Field>
					<Field label="Contract Start">
						<input
							type="date"
							{...register("contract_start")}
							className="input"
						/>
					</Field>
					<Field label="Contract End">
						<input
							type="date"
							{...register("contract_end")}
							className="input"
						/>
					</Field>
				</div>
			)}

			{tab === "personal" && (
				<div className="grid grid-cols-2 gap-4">
					<Field label="Date of Birth">
						<input
							type="date"
							{...register("date_of_birth")}
							className="input"
						/>
					</Field>
					<Field label="Gender">
						<select {...register("gender")} className="select-input">
							<option value="">Prefer not to say</option>
							<option value="male">Male</option>
							<option value="female">Female</option>
							<option value="other">Other</option>
						</select>
					</Field>
					<Field label="National ID">
						<input {...register("national_id")} className="input" />
					</Field>
					<Field label="Nationality">
						<input {...register("nationality")} className="input" />
					</Field>
					<Field label="Address" className="col-span-2">
						<textarea {...register("address")} className="input" rows={2} />
					</Field>
					<Field label="Emergency Contact Name">
						<input {...register("emergency_contact_name")} className="input" />
					</Field>
					<Field label="Emergency Contact Phone">
						<input {...register("emergency_contact_phone")} className="input" />
					</Field>
					<Field label="Emergency Contact Relationship">
						<input
							{...register("emergency_contact_relationship")}
							className="input"
							placeholder="e.g. Spouse"
						/>
					</Field>
					<Field label="Bio" className="col-span-2">
						<textarea
							{...register("bio")}
							className="input"
							rows={3}
							placeholder="Brief bio…"
						/>
					</Field>
				</div>
			)}

			{tab === "notifications" && (
				<div className="space-y-4">
					<div className="space-y-3">
						{[
							{ key: "notification_email", label: "Email notifications" },
							{ key: "notification_sms", label: "SMS notifications" },
							{ key: "notification_push", label: "Push notifications" },
						].map(({ key, label }) => (
							<label
								key={key}
								className="flex items-center gap-3 cursor-pointer">
								<input
									type="checkbox"
									{...register(key as any)}
									className="rounded"
								/>
								<span className="text-sm text-slate-300">{label}</span>
							</label>
						))}
					</div>
					<div className="grid grid-cols-2 gap-4">
						<Field label="Timezone">
							<select
								{...register("timezone_preference")}
								className="select-input">
								<option value="Africa/Nairobi">Africa/Nairobi (EAT)</option>
								<option value="UTC">UTC</option>
								<option value="Europe/London">Europe/London</option>
								<option value="America/New_York">America/New_York</option>
							</select>
						</Field>
						<Field label="Theme">
							<select
								{...register("theme_preference")}
								className="select-input">
								<option value="system">System</option>
								<option value="dark">Dark</option>
								<option value="light">Light</option>
							</select>
						</Field>
					</div>
				</div>
			)}
		</Modal>
	);
}

// ── User Detail Modal ──────────────────────────────────────────────────────

function UserDetailModal({ userId, onClose, onEdit }: any) {
	const { data, isLoading } = useQuery({
		queryKey: ["user-detail", userId],
		queryFn: () => usersApi.detail(userId).then((r) => r.data),
	});

	const u = data;

	return (
		<Modal
			title="User Profile"
			onClose={onClose}
			size="max-w-2xl"
			footer={
				<>
					<button onClick={onClose} className="btn-secondary">
						Close
					</button>
					<button onClick={onEdit} className="btn-primary">
						<Edit3 size={13} /> Edit
					</button>
				</>
			}>
			{isLoading ? (
				<div className="space-y-3">
					{[...Array(6)].map((_, i) => (
						<div key={i} className="skeleton h-8" />
					))}
				</div>
			) : (
				u && (
					<div className="space-y-5">
						{/* Avatar + name */}
						<div className="flex items-center gap-4">
							{u.profile_photo ? (
								<img
									src={u.profile_photo}
									alt={u.full_name}
									className="w-16 h-16 rounded-full object-cover"
								/>
							) : (
								<div className="w-16 h-16 rounded-full bg-gradient-nexus flex items-center justify-center text-xl font-bold text-white">
									{u.full_name
										?.split(" ")
										.map((n: string) => n[0])
										.join("")
										.slice(0, 2)}
								</div>
							)}
							<div>
								<div className="text-lg font-semibold text-white">
									{u.full_name}
								</div>
								<div className="text-sm text-slate-400">{u.email}</div>
								<div className="flex gap-2 mt-1">
									<span
										className={clsx(
											"badge text-[10px]",
											ROLE_MAP[u.role]?.color ?? "badge-slate",
										)}>
										{u.role_display}
									</span>
									<span
										className={clsx(
											"badge text-[10px]",
											STATUSES.find((s) => s.value === u.status)?.color ??
												"badge-slate",
										)}>
										{u.status}
									</span>
								</div>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4 text-sm">
							<InfoRow
								icon={Briefcase}
								label="Job Title"
								value={u.job_title || "—"}
							/>
							<InfoRow
								icon={Building2}
								label="Department"
								value={u.department_name || "—"}
							/>
							<InfoRow
								icon={Building2}
								label="Branch"
								value={u.branch_name || "—"}
							/>
							<InfoRow
								icon={Users}
								label="Supervisor"
								value={u.supervisor_name || "—"}
							/>
							<InfoRow icon={Phone} label="Phone" value={u.phone || "—"} />
							<InfoRow
								icon={CalendarDays}
								label="Joined"
								value={
									u.date_joined
										? format(parseISO(u.date_joined), "dd MMM yyyy")
										: "—"
								}
							/>
							<InfoRow
								icon={Clock}
								label="Last Login"
								value={
									u.last_login
										? formatDistanceToNow(parseISO(u.last_login), {
												addSuffix: true,
											})
										: "Never"
								}
							/>
							<InfoRow
								icon={ShieldCheck}
								label="MFA"
								value={u.mfa_enabled ? "Enabled" : "Disabled"}
							/>
							<InfoRow
								icon={CalendarDays}
								label="Contract"
								value={
									u.contract_start
										? `${u.contract_start} → ${u.contract_end || "open"}`
										: "—"
								}
							/>
							<InfoRow
								icon={Lock}
								label="Locked"
								value={u.is_locked ? "Yes" : "No"}
							/>
						</div>

						{u.bio && (
							<div>
								<div className="text-xs text-slate-500 mb-1">Bio</div>
								<div className="text-sm text-slate-300 bg-white/3 rounded p-3">
									{u.bio}
								</div>
							</div>
						)}
					</div>
				)
			)}
		</Modal>
	);
}

function InfoRow({ icon: Icon, label, value }: any) {
	return (
		<div className="flex items-start gap-2 text-slate-400">
			<Icon size={13} className="mt-0.5 shrink-0 text-slate-600" />
			<div>
				<div className="text-[10px] text-slate-600">{label}</div>
				<div className="text-slate-300">{value}</div>
			</div>
		</div>
	);
}

// ── Role Change Modal ──────────────────────────────────────────────────────

function RoleChangeModal({ user, onClose, onSuccess }: any) {
	const [role, setRole] = useState(user.role);
	const [reason, setReason] = useState("");
	const mut = useMutation({
		mutationFn: () => usersApi.changeRole(user.id, role),
		onSuccess: () => {
			toast.success("Role updated");
			onSuccess();
		},
		onError: (e: any) => toast.error(e.response?.data?.detail || "Failed"),
	});
	return (
		<Modal
			title={`Change Role — ${user.full_name}`}
			onClose={onClose}
			footer={
				<>
					<button onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						onClick={() => mut.mutate()}
						disabled={mut.isPending}
						className="btn-primary">
						{mut.isPending ? "Saving…" : "Change Role"}
					</button>
				</>
			}>
			<div className="space-y-4">
				<div className="alert alert-warning text-xs">
					<AlertTriangle size={14} /> Changing role affects permissions across
					all modules.
				</div>
				<Field label="Current Role">
					<div
						className={clsx(
							"badge",
							ROLE_MAP[user.role]?.color ?? "badge-slate",
						)}>
						{user.role_display}
					</div>
				</Field>
				<Field label="New Role *">
					<select
						value={role}
						onChange={(e) => setRole(e.target.value)}
						className="select-input">
						{ROLES.map((r) => (
							<option key={r.value} value={r.value}>
								{r.label}
							</option>
						))}
					</select>
				</Field>
				<Field label="Reason (optional)">
					<input
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						className="input"
						placeholder="e.g. Promotion"
					/>
				</Field>
			</div>
		</Modal>
	);
}

// ── Reset Password Modal ───────────────────────────────────────────────────

function ResetPasswordModal({ user, onClose, onSuccess }: any) {
	const [password, setPassword] = useState("");
	const [forceChange, setForceChange] = useState(true);
	const [generated, setGenerated] = useState("");
	const mut = useMutation({
		mutationFn: () =>
			usersApi.adminResetPassword(user.id, password || undefined),
		onSuccess: (res) => {
			setGenerated(res.data.new_password || "");
			toast.success("Password reset");
			onSuccess();
		},
		onError: (e: any) => toast.error(e.response?.data?.detail || "Failed"),
	});
	return (
		<Modal
			title={`Reset Password — ${user.full_name}`}
			onClose={onClose}
			footer={
				<>
					<button onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						onClick={() => mut.mutate()}
						disabled={mut.isPending}
						className="btn-primary">
						{mut.isPending ? "Resetting…" : "Reset Password"}
					</button>
				</>
			}>
			<div className="space-y-4">
				<div className="alert alert-info text-xs">
					Leave password blank to auto-generate a secure one.
				</div>
				<Field label="New Password (optional)">
					<input
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className="input"
						placeholder="Min. 10 characters"
					/>
				</Field>
				<label className="flex items-center gap-2 text-sm cursor-pointer">
					<input
						type="checkbox"
						checked={forceChange}
						onChange={(e) => setForceChange(e.target.checked)}
						className="rounded"
					/>
					<span className="text-slate-300">
						Require password change on next login
					</span>
				</label>
				{generated && (
					<div className="alert alert-success text-xs flex items-center gap-2">
						<span>
							Generated: <code className="font-mono">{generated}</code>
						</span>
						<button
							onClick={() => {
								navigator.clipboard.writeText(generated);
								toast.success("Copied");
							}}>
							<Copy size={11} />
						</button>
					</div>
				)}
			</div>
		</Modal>
	);
}

// ── Suspend Modal ──────────────────────────────────────────────────────────

function SuspendModal({ user, onClose, onSuccess }: any) {
	const [reason, setReason] = useState("");
	const mut = useMutation({
		mutationFn: () =>
			usersApi.update(user.id, {
				status: "suspended",
				is_active: false,
				suspension_reason: reason,
			}),
		onSuccess: () => {
			toast.success("User suspended");
			onSuccess();
		},
		onError: (e: any) => toast.error(e.response?.data?.detail || "Failed"),
	});
	return (
		<Modal
			title={`Suspend — ${user.full_name}`}
			onClose={onClose}
			footer={
				<>
					<button onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						onClick={() => mut.mutate()}
						disabled={mut.isPending}
						className="btn-danger">
						{mut.isPending ? "Suspending…" : "Suspend User"}
					</button>
				</>
			}>
			<div className="space-y-4">
				<div className="alert alert-warning text-xs">
					<AlertTriangle size={14} /> This will log the user out and block all
					future logins until unsuspended.
				</div>
				<Field label="Reason *">
					<textarea
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						className="input"
						rows={3}
						placeholder="Enter reason for suspension…"
					/>
				</Field>
			</div>
		</Modal>
	);
}

// ── Offboard Modal ─────────────────────────────────────────────────────────

function OffboardModal({ user, onClose, onSuccess }: any) {
	const [notes, setNotes] = useState("");
	const mut = useMutation({
		mutationFn: () =>
			usersApi.update(user.id, {
				status: "offboarded",
				is_active: false,
				offboarding_notes: notes,
			}),
		onSuccess: () => {
			toast.success("User offboarded");
			onSuccess();
		},
		onError: (e: any) => toast.error(e.response?.data?.detail || "Failed"),
	});
	return (
		<Modal
			title={`Offboard — ${user.full_name}`}
			onClose={onClose}
			footer={
				<>
					<button onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						onClick={() => mut.mutate()}
						disabled={mut.isPending}
						className="btn-danger">
						{mut.isPending ? "Processing…" : "Confirm Offboarding"}
					</button>
				</>
			}>
			<div className="space-y-4">
				<div className="alert alert-warning text-xs">
					<AlertTriangle size={14} /> Offboarding will deactivate the account
					and revoke all active sessions. This is for departed staff / completed
					internships.
				</div>
				<Field label="Offboarding Notes">
					<textarea
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						className="input"
						rows={3}
						placeholder="Reason, handover notes…"
					/>
				</Field>
			</div>
		</Modal>
	);
}

// ── Sessions Modal ─────────────────────────────────────────────────────────

function SessionsModal({ user, onClose }: any) {
	const qc = useQueryClient();
	const { data, isLoading } = useQuery({
		queryKey: ["user-sessions-admin", user.id],
		queryFn: () => usersApi.userSessions(user.id).then((r) => r.data),
	});
	const sessions: any[] = Array.isArray(data) ? data : (data?.results ?? []);

	const revokeMut = useMutation({
		mutationFn: (sid: string) => usersApi.revokeUserSession(sid),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["user-sessions-admin", user.id] });
			toast.success("Session revoked");
		},
	});
	const revokeAllMut = useMutation({
		mutationFn: () => usersApi.revokeAllUserSessions(user.id),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["user-sessions-admin", user.id] });
			toast.success("All sessions revoked");
		},
	});

	return (
		<Modal
			title={`Sessions — ${user.full_name}`}
			onClose={onClose}
			footer={
				<>
					<button onClick={onClose} className="btn-secondary">
						Close
					</button>
					{sessions.length > 0 && (
						<button
							onClick={() => revokeAllMut.mutate()}
							disabled={revokeAllMut.isPending}
							className="btn-danger">
							<LogOut size={13} />{" "}
							{revokeAllMut.isPending ? "Revoking…" : "Revoke All"}
						</button>
					)}
				</>
			}>
			{isLoading ? (
				<div className="skeleton h-24" />
			) : sessions.length === 0 ? (
				<div className="text-center py-8 text-slate-500 text-sm">
					No active sessions
				</div>
			) : (
				<div className="space-y-2">
					{sessions.map((s: any) => (
						<div
							key={s.id}
							className="flex items-center justify-between bg-white/3 rounded-lg p-3 text-xs">
							<div>
								<div className="text-slate-300">
									{s.ip_address} · {s.device_type || "Unknown device"}
								</div>
								<div className="text-slate-500 mt-0.5">
									Last active{" "}
									{s.last_activity
										? formatDistanceToNow(parseISO(s.last_activity), {
												addSuffix: true,
											})
										: "—"}
								</div>
							</div>
							<button
								onClick={() => revokeMut.mutate(s.id)}
								disabled={revokeMut.isPending}
								className="btn-danger btn-sm text-[10px]">
								Revoke
							</button>
						</div>
					))}
				</div>
			)}
		</Modal>
	);
}

// ── Activity Log Modal ─────────────────────────────────────────────────────

function ActivityModal({ user, onClose }: any) {
	const { data, isLoading } = useQuery({
		queryKey: ["user-activity", user.id],
		queryFn: () => usersApi.auditLog({ user: user.id }).then((r) => r.data),
	});
	const logs: any[] = Array.isArray(data) ? data : (data?.results ?? []);

	const ACTION_ICONS: Record<string, any> = {
		login: Globe,
		logout: LogOut,
		password_change: Key,
		role_change: Settings,
		profile_update: Edit3,
		user_suspended: ShieldOff,
		mfa_enabled: ShieldCheck,
		session_revoked: LogOut,
	};

	return (
		<Modal
			title={`Activity — ${user.full_name}`}
			onClose={onClose}
			footer={
				<button onClick={onClose} className="btn-secondary">
					Close
				</button>
			}>
			{isLoading ? (
				<div className="skeleton h-32" />
			) : logs.length === 0 ? (
				<div className="text-center py-8 text-slate-500 text-sm">
					No activity found
				</div>
			) : (
				<div className="space-y-2 max-h-96 overflow-y-auto">
					{logs.map((l: any, i) => {
						const Icon = ACTION_ICONS[l.action] ?? Activity;
						return (
							<div
								key={i}
								className="flex items-start gap-3 py-2 border-b border-white/5 text-xs">
								<div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
									<Icon size={11} className="text-nexus-400" />
								</div>
								<div className="flex-1">
									<div className="text-slate-300">
										{l.action.replace(/_/g, " ")}
									</div>
									{l.description && (
										<div className="text-slate-500 text-[10px] mt-0.5">
											{l.description}
										</div>
									)}
								</div>
								<div className="text-slate-600 whitespace-nowrap">
									{l.created_at
										? formatDistanceToNow(parseISO(l.created_at), {
												addSuffix: true,
											})
										: "—"}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</Modal>
	);
}

// ── Invite Modal ───────────────────────────────────────────────────────────

function InviteModal({ depts, branches, onClose, onSuccess }: any) {
	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm({
		defaultValues: {
			role: "attachee",
			days_valid: 7,
			max_uses: 1,
			email: "",
			branch: "",
			department: "",
		},
	});
	const [link, setLink] = useState("");

	const mut = useMutation({
		mutationFn: (data: any) =>
			usersApi.list({ role: "system_admin" }).then(() => {
				// POST to invites
				return fetch("/api/v1/accounts/invites/", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("access")}`,
					},
					body: JSON.stringify(data),
				}).then((r) => r.json());
			}),
		onSuccess: (data) => {
			const url = `${window.location.origin}/invite/${data.token}`;
			setLink(url);
			toast.success("Invite created");
		},
		onError: () => toast.error("Failed to create invite"),
	});

	return (
		<Modal
			title="Create Invite Link"
			onClose={onClose}
			footer={
				link ? (
					<button onClick={onClose} className="btn-primary">
						Done
					</button>
				) : (
					<>
						<button onClick={onClose} className="btn-secondary">
							Cancel
						</button>
						<button
							onClick={handleSubmit((d) => mut.mutate(d))}
							disabled={mut.isPending}
							className="btn-primary">
							{mut.isPending ? "Creating…" : "Generate Link"}
						</button>
					</>
				)
			}>
			{link ? (
				<div className="space-y-4">
					<div className="alert alert-success text-xs">
						Invite link created successfully.
					</div>
					<div className="flex items-center gap-2 bg-white/5 rounded p-3 text-xs font-mono break-all">
						<span className="flex-1 text-nexus-300">{link}</span>
						<button
							onClick={() => {
								navigator.clipboard.writeText(link);
								toast.success("Copied");
							}}
							className="btn-ghost p-1 shrink-0">
							<Copy size={13} />
						</button>
					</div>
				</div>
			) : (
				<div className="grid grid-cols-2 gap-4">
					<Field
						label="Email (optional)"
						hint="Leave blank for open invite"
						className="col-span-2">
						<input
							type="email"
							{...register("email")}
							className="input"
							placeholder="user@example.com"
						/>
					</Field>
					<Field label="Role *">
						<select {...register("role")} className="select-input">
							{ROLES.map((r) => (
								<option key={r.value} value={r.value}>
									{r.label}
								</option>
							))}
						</select>
					</Field>
					<Field label="Branch">
						<select {...register("branch")} className="select-input">
							<option value="">None</option>
							{branches.map((b: any) => (
								<option key={b.id} value={b.id}>
									{b.name}
								</option>
							))}
						</select>
					</Field>
					<Field label="Department">
						<select {...register("department")} className="select-input">
							<option value="">None</option>
							{depts.map((d: any) => (
								<option key={d.id} value={d.id}>
									{d.name}
								</option>
							))}
						</select>
					</Field>
					<Field label="Valid for (days)">
						<input
							type="number"
							{...register("days_valid", { min: 1, max: 30 })}
							className="input"
						/>
					</Field>
					<Field label="Max uses">
						<input
							type="number"
							{...register("max_uses", { min: 1 })}
							className="input"
						/>
					</Field>
				</div>
			)}
		</Modal>
	);
}

// ── Bulk Action Modal ──────────────────────────────────────────────────────

function BulkActionModal({
	action,
	ids,
	depts,
	branches,
	onClose,
	onSuccess,
}: any) {
	const [role, setRole] = useState("attachee");
	const [branch, setBranch] = useState("");
	const [dept, setDept] = useState("");

	const mut = useMutation({
		mutationFn: () =>
			usersApi
				.bulkDeactivate(ids) // placeholder; calls correct fn below
				.then(() => {}),
	});

	const handleConfirm = () => {
		let promise: Promise<any>;
		if (action === "deactivate") promise = usersApi.bulkDeactivate(ids);
		else if (action === "activate") promise = usersApi.bulkActivate(ids);
		else if (action === "change_role")
			promise = usersApi.bulkChangeRole(ids, role);
		else if (action === "reassign")
			promise = usersApi.bulkReassign(ids, {
				branch: branch || undefined,
				department: dept || undefined,
			});
		else if (action === "revoke_sessions")
			promise = usersApi.bulkDeactivate(ids); // sessions endpoint
		else return;

		promise
			.then(() => {
				toast.success("Bulk action applied");
				onSuccess();
			})
			.catch((e: any) => toast.error(e.response?.data?.detail || "Failed"));
	};

	const ACTION_LABELS: Record<string, string> = {
		activate: "Activate",
		deactivate: "Deactivate",
		change_role: "Change Role",
		reassign: "Reassign",
		revoke_sessions: "Revoke Sessions",
	};

	return (
		<Modal
			title={`Bulk Action: ${ACTION_LABELS[action] ?? action}`}
			onClose={onClose}
			footer={
				<>
					<button onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						onClick={handleConfirm}
						className={action === "deactivate" ? "btn-danger" : "btn-primary"}>
						Apply to {ids.length} users
					</button>
				</>
			}>
			<div className="space-y-4">
				<div className="alert alert-warning text-xs">
					<AlertTriangle size={14} /> This will affect {ids.length} user
					{ids.length !== 1 ? "s" : ""}.
				</div>
				{action === "change_role" && (
					<Field label="New Role">
						<select
							value={role}
							onChange={(e) => setRole(e.target.value)}
							className="select-input">
							{ROLES.map((r) => (
								<option key={r.value} value={r.value}>
									{r.label}
								</option>
							))}
						</select>
					</Field>
				)}
				{action === "reassign" && (
					<>
						<Field label="Branch">
							<select
								value={branch}
								onChange={(e) => setBranch(e.target.value)}
								className="select-input">
								<option value="">Unchanged</option>
								{branches.map((b: any) => (
									<option key={b.id} value={b.id}>
										{b.name}
									</option>
								))}
							</select>
						</Field>
						<Field label="Department">
							<select
								value={dept}
								onChange={(e) => setDept(e.target.value)}
								className="select-input">
								<option value="">Unchanged</option>
								{depts.map((d: any) => (
									<option key={d.id} value={d.id}>
										{d.name}
									</option>
								))}
							</select>
						</Field>
					</>
				)}
			</div>
		</Modal>
	);
}

// ── Bulk Import Modal ──────────────────────────────────────────────────────

function BulkImportModal({ onClose, onSuccess }: any) {
	const [file, setFile] = useState<File | null>(null);
	const [result, setResult] = useState<any>(null);
	const mut = useMutation({
		mutationFn: (f: File) => usersApi.bulkImport(f),
		onSuccess: (res) => {
			setResult(res.data);
			toast.success("Import complete");
			onSuccess();
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Import failed"),
	});

	return (
		<Modal
			title="Bulk Import Users"
			onClose={onClose}
			footer={
				<>
					<button onClick={onClose} className="btn-secondary">
						{result ? "Done" : "Cancel"}
					</button>
					{!result && (
						<button
							disabled={!file || mut.isPending}
							onClick={() => file && mut.mutate(file)}
							className="btn-primary">
							<Upload size={13} /> {mut.isPending ? "Importing…" : "Import"}
						</button>
					)}
				</>
			}>
			<div className="space-y-4">
				<div className="alert alert-info text-xs">
					<div className="font-medium mb-1">CSV column order:</div>
					<code className="text-nexus-400">
						email, first_name, last_name, role, phone, employee_id, job_title,
						password
					</code>
					<div className="mt-1 text-slate-400">
						Password is optional — a secure one is auto-generated if omitted.
						Users will be required to change it on first login.
					</div>
				</div>
				<Field label="CSV File">
					<input
						type="file"
						accept=".csv"
						onChange={(e) => setFile(e.target.files?.[0] || null)}
						className="input py-2 cursor-pointer"
					/>
				</Field>
				{result && (
					<div
						className={clsx(
							"alert text-xs",
							result.errors > 0 ? "alert-warning" : "alert-success",
						)}>
						<div className="font-semibold">
							✅ {result.created} created · ❌ {result.errors} errors
						</div>
						{result.error_details?.length > 0 && (
							<div className="mt-2 space-y-1">
								{result.error_details.slice(0, 10).map((e: any, i: number) => (
									<div key={i}>
										Row {e.row}:{" "}
										<span className="text-slate-400">{e.email}</span> —{" "}
										{e.error}
									</div>
								))}
							</div>
						)}
					</div>
				)}
			</div>
		</Modal>
	);
}

// ── Field helper ───────────────────────────────────────────────────────────

function Field({ label, children, error, hint, className }: any) {
	return (
		<div className={clsx("input-group", className)}>
			<label className="input-label">{label}</label>
			{children}
			{hint && <p className="text-[10px] text-slate-500 mt-0.5">{hint}</p>}
			{error && (
				<p className="text-red-400 text-xs mt-0.5">
					{error.message || "Required"}
				</p>
			)}
		</div>
	);
}
