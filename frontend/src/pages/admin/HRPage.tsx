// NEXUS — HR Management Page (Full Suite) v2
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
	Users,
	Plus,
	Search,
	Eye,
	Download,
	UserPlus,
	GraduationCap,
	Building2,
	CheckCircle,
	Clock,
	XCircle,
	Calendar,
	X,
	Phone,
	MapPin,
	Briefcase,
	GitBranch,
	Upload,
	UserMinus,
	BookOpen,
	DollarSign,
	AlertTriangle,
	Shield,
	Settings2,
	ClipboardList,
	TrendingUp,
	Award,
	RefreshCw,
	Filter,
	Edit2,
	Save,
} from "lucide-react";
import {
	hrApi,
	usersApi,
	attendanceApi,
	evaluationsApi,
	financeApi,
	certificatesApi,
} from "../../services/api";
import { useAuthStore } from "../../services/api";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import clsx from "clsx";

// ── Staff roles — exact values from accounts/models.py User.ROLES ─────────────
const STAFF_ROLES = [
	{ value: "supervisor", label: "Supervisor" },
	{ value: "department_leader", label: "Department Leader" },
	{ value: "hr_officer", label: "HR Officer" },
	{ value: "system_admin", label: "System Administrator" },
	{ value: "data_analyst", label: "Data Analyst" },
	{ value: "executive", label: "Executive Management" },
	{ value: "finance", label: "Finance Officer" },
	{ value: "procurement", label: "Procurement Officer" },
	{ value: "ict", label: "ICT / IT Staff" },
	{ value: "communications", label: "Communications / PR" },
	{ value: "legal", label: "Legal Officer" },
	{ value: "qc", label: "Quality Assurance" },
	{ value: "operations", label: "Operations Staff" },
	{ value: "customer_service", label: "Customer Service" },
	{ value: "rd", label: "Research & Development" },
	{ value: "hse", label: "HSE Officer" },
	{ value: "facilities", label: "Facilities Manager" },
	{ value: "security_officer", label: "Security Officer" },
	{ value: "university_coordinator", label: "University Coordinator" },
	{ value: "lecturer", label: "Lecturer" },
	{ value: "broadcast_admin", label: "Broadcast Admin" },
	{ value: "broadcast_staff", label: "Broadcast Staff" },
	{ value: "broadcast_student", label: "Broadcast Student" },
	{ value: "journalist", label: "Journalist" },
	{ value: "presenter", label: "Presenter / DJ" },
	{ value: "editor", label: "Editor" },
	{ value: "videographer", label: "Videographer" },
	{ value: "station_engineer", label: "Station Engineer" },
];

// ── Certificate types matching the screenshot ──────────────────────────────────
const CERT_TYPES = [
	{ value: "completion", label: "Certificate of Completion" },
	{ value: "recommendation", label: "Recommendation Letter" },
	{ value: "achievement", label: "Achievement Award" },
	{ value: "participation", label: "Participation Certificate" },
];

const TABS = [
	{ key: "overview", label: "Overview", icon: TrendingUp },
	{ key: "attachees", label: "Attachees", icon: GraduationCap },
	{ key: "staff", label: "Staff", icon: Users },
	{ key: "leave", label: "Leave", icon: Calendar },
	{ key: "evaluations", label: "Evaluations", icon: ClipboardList },
	{ key: "departments", label: "Departments", icon: Building2 },
	{ key: "branches", label: "Branches", icon: GitBranch },
	{ key: "recruitment", label: "Recruitment", icon: UserPlus },
	{ key: "training", label: "Training", icon: BookOpen },
	{ key: "stipends", label: "Stipends", icon: DollarSign },
	{ key: "violations", label: "Violations", icon: AlertTriangle },
	{ key: "certificates", label: "Certificates", icon: Award },
	{ key: "audit", label: "Audit Log", icon: Shield },
	{ key: "settings", label: "Org Settings", icon: Settings2 },
] as const;
type Tab = (typeof TABS)[number]["key"];

// ── Modal wrapper ──────────────────────────────────────────────────────────────
function Modal({
	open,
	onClose,
	title,
	children,
	size = "md",
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
	size?: "sm" | "md" | "lg" | "xl";
}) {
	if (!open) return null;
	const widths = {
		sm: "max-w-md",
		md: "max-w-xl",
		lg: "max-w-2xl",
		xl: "max-w-4xl",
	};
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			<div
				className="absolute inset-0 bg-black/60 backdrop-blur-sm"
				onClick={onClose}
			/>
			<div
				className={clsx(
					"relative w-full bg-surface-card border border-surface-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto",
					widths[size],
				)}>
				<div className="flex items-center justify-between px-6 py-4 border-b border-surface-border sticky top-0 bg-surface-card z-10">
					<h2 className="text-base font-semibold text-white">{title}</h2>
					<button
						onClick={onClose}
						className="btn-ghost p-1.5 rounded-lg text-slate-400 hover:text-white">
						<X size={16} />
					</button>
				</div>
				<div className="px-6 py-5">{children}</div>
			</div>
		</div>
	);
}

// ── Shared helpers ─────────────────────────────────────────────────────────────
function parseApiError(err: any, fallback: string): string {
	const data = err?.response?.data;
	if (!data) return fallback;
	if (data.detail) return String(data.detail);
	return Object.entries(data)
		.map(([k, v]: any) => `${k}: ${Array.isArray(v) ? v[0] : v}`)
		.join(" · ");
}

function exportToCSV(data: any[], filename: string) {
	if (!data.length) {
		toast.error("No data to export");
		return;
	}
	const headers = Object.keys(data[0]);
	const rows = data.map((row) =>
		headers.map((h) => JSON.stringify(row[h] ?? "")).join(","),
	);
	const csv = [headers.join(","), ...rows].join("\n");
	const blob = new Blob([csv], { type: "text/csv" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
	toast.success(`Exported ${data.length} records`);
}

// ── Shared credential display row ──────────────────────────────────────────────
function CredRow({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="flex items-center justify-between p-3 bg-surface rounded-xl border border-surface-border gap-3">
			<div className="min-w-0">
				<div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">
					{label}
				</div>
				<div
					className={clsx(
						"text-sm text-white font-medium truncate",
						mono && "font-mono",
					)}>
					{value}
				</div>
			</div>
			<button
				onClick={() => {
					navigator.clipboard.writeText(value);
					toast.success(`${label} copied`);
				}}
				className="btn-ghost btn-sm p-1.5 text-slate-400 hover:text-white shrink-0"
				title={`Copy ${label}`}>
				<svg
					width="13"
					height="13"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2">
					<rect x="9" y="9" width="13" height="13" rx="2" />
					<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
				</svg>
			</button>
		</div>
	);
}

// ── Onboard Attachee Modal ─────────────────────────────────────────────────────
// Calls POST /attachees/create/ — backend auto-generates password + employee ID
// and emails them. Credentials shown once on success screen for HR to copy.
function OnboardAttacheeModal({
	open,
	onClose,
	departments,
	branches,
	organisationId,
}: {
	open: boolean;
	onClose: () => void;
	departments: any[];
	branches: any[];
	organisationId?: string | null;
}) {
	const qc = useQueryClient();
	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<any>();
	const [created, setCreated] = useState<{
		full_name: string;
		email: string;
		employee_id: string;
		temp_password: string;
	} | null>(null);

	const mutation = useMutation({
		mutationFn: (data: any) =>
			// ✅ hits CreateUserWithCredentialsView — password + employee_id auto-generated
			import("../../services/api").then(({ api }) =>
				api.post("attachees/create/", {
					first_name: data.first_name,
					last_name: data.last_name,
					email: data.email,
					role: "attachee",
					...(data.phone && { phone: data.phone }),
					...(data.department && { department: data.department }),
					...(data.branch && { branch: data.branch }),
				}),
			),
		onSuccess: (res) => {
			qc.invalidateQueries({ queryKey: ["attachees"] });
			qc.invalidateQueries({ queryKey: ["user-stats"] });
			const d = res.data;
			setCreated({
				full_name: d.full_name || `${d.first_name} ${d.last_name}`,
				email: d.email,
				employee_id: d.employee_id || "—",
				temp_password: d.temp_password || "Sent via email",
			});
			reset();
		},
		onError: (err: any) =>
			toast.error(parseApiError(err, "Failed to onboard attachee")),
	});

	const handleClose = () => {
		setCreated(null);
		onClose();
	};

	return (
		<Modal
			open={open}
			onClose={handleClose}
			title={created ? "Attachee Onboarded ✓" : "Onboard New Attachee"}
			size="lg">
			{created ? (
				<div className="space-y-5">
					{/* Success banner */}
					<div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
						<CheckCircle size={20} className="text-green-400 shrink-0" />
						<div>
							<div className="text-sm font-semibold text-white">
								{created.full_name} has been onboarded
							</div>
							<div className="text-xs text-slate-400 mt-0.5">
								Credentials have been emailed. They must change their password
								on first login.
							</div>
						</div>
					</div>

					{/* Credentials */}
					<div className="space-y-2">
						<CredRow label="Email / Username" value={created.email} />
						<CredRow label="Employee ID" value={created.employee_id} mono />
						<CredRow
							label="Temporary Password"
							value={created.temp_password}
							mono
						/>
					</div>

					{/* Email note */}
					<div className="flex items-center gap-2 p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl text-xs text-slate-400">
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							className="text-blue-400 shrink-0">
							<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
							<polyline points="22,6 12,13 2,6" />
						</svg>
						Credentials sent to{" "}
						<span className="text-white">{created.email}</span>
					</div>

					<div className="flex justify-end gap-3">
						<button
							onClick={() => setCreated(null)}
							className="btn-secondary btn-sm">
							<GraduationCap size={13} /> Onboard Another
						</button>
						<button onClick={handleClose} className="btn-primary btn-sm">
							Done
						</button>
					</div>
				</div>
			) : (
				<form
					onSubmit={handleSubmit((d) => mutation.mutate(d))}
					className="space-y-4">
					{/* Auto-gen notice */}
					<div className="p-3 bg-nexus-600/10 border border-nexus-500/20 rounded-xl text-xs text-slate-400 flex items-start gap-2">
						<Shield size={13} className="text-nexus-400 mt-0.5 shrink-0" />
						<span>
							Password and Employee ID are{" "}
							<span className="text-white font-medium">auto-generated</span> and
							emailed to the attachee. They'll be shown here after creation.
						</span>
					</div>

					{/* Required fields */}
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="form-label">
								First Name <span className="text-red-400">*</span>
							</label>
							<input
								{...register("first_name", { required: "Required" })}
								className="input"
								placeholder="Jane"
							/>
							{errors.first_name && (
								<p className="form-error">
									{String(errors.first_name.message)}
								</p>
							)}
						</div>
						<div>
							<label className="form-label">Last Name</label>
							<input
								{...register("last_name")}
								className="input"
								placeholder="Muthoni"
							/>
						</div>
					</div>

					<div>
						<label className="form-label">
							Email Address <span className="text-red-400">*</span>
						</label>
						<input
							{...register("email", {
								required: "Required",
								pattern: { value: /^\S+@\S+$/i, message: "Invalid email" },
							})}
							className="input"
							placeholder="jane@example.com"
							type="email"
						/>
						{errors.email && (
							<p className="form-error">{String(errors.email.message)}</p>
						)}
					</div>

					{/* Optional fields */}
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="form-label">Phone (optional)</label>
							<input
								{...register("phone")}
								className="input"
								placeholder="+254 700 000 000"
							/>
						</div>
						<div>
							<label className="form-label">Department</label>
							<select {...register("department")} className="input">
								<option value="">— Select —</option>
								{departments.map((d: any) => (
									<option key={d.id} value={d.id}>
										{d.name}
									</option>
								))}
							</select>
						</div>
					</div>

					<div>
						<label className="form-label">Branch</label>
						<select {...register("branch")} className="input">
							<option value="">— Select branch —</option>
							{branches.map((b: any) => (
								<option key={b.id} value={b.id}>
									{b.name}
								</option>
							))}
						</select>
					</div>

					<div className="flex justify-end gap-3 pt-2">
						<button
							type="button"
							onClick={handleClose}
							className="btn-secondary btn-sm">
							Cancel
						</button>
						<button
							type="submit"
							disabled={mutation.isPending}
							className="btn-primary btn-sm">
							<GraduationCap size={13} />{" "}
							{mutation.isPending ? "Onboarding…" : "Onboard Attachee"}
						</button>
					</div>
				</form>
			)}
		</Modal>
	);
}

// ── Add Staff Member Modal (non-attachee) ──────────────────────────────────────
// Calls POST /attachees/create/ — backend auto-generates password + employee ID
// and emails the credentials. Role is passed so the correct role is set.
function AddStaffModal({
	open,
	onClose,
	departments,
	branches,
	organisationId,
}: {
	open: boolean;
	onClose: () => void;
	departments: any[];
	branches: any[];
	organisationId?: string | null;
}) {
	const qc = useQueryClient();
	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<any>();
	const [created, setCreated] = useState<{
		full_name: string;
		email: string;
		employee_id: string;
		temp_password: string;
		role_display: string;
	} | null>(null);

	const mutation = useMutation({
		mutationFn: (data: any) =>
			// ✅ hits CreateUserWithCredentialsView — password + employee_id auto-generated
			import("../../services/api").then(({ api }) =>
				api.post("attachees/create/", {
					first_name: data.first_name,
					last_name: data.last_name,
					email: data.email,
					role: data.role,
					...(data.phone && { phone: data.phone }),
					...(data.department && { department: data.department }),
					...(data.branch && { branch: data.branch }),
				}),
			),
		onSuccess: (res, formData) => {
			qc.invalidateQueries({ queryKey: ["all-staff"] });
			qc.invalidateQueries({ queryKey: ["user-stats"] });
			const d = res.data;
			const roleLabel =
				STAFF_ROLES.find((r) => r.value === formData.role)?.label ||
				formData.role;
			setCreated({
				full_name: d.full_name || `${d.first_name} ${d.last_name}`,
				email: d.email,
				employee_id: d.employee_id || "—",
				temp_password: d.temp_password || "Sent via email",
				role_display: roleLabel,
			});
			reset();
		},
		onError: (err: any) =>
			toast.error(parseApiError(err, "Failed to add staff member")),
	});

	const handleClose = () => {
		setCreated(null);
		onClose();
	};

	return (
		<Modal
			open={open}
			onClose={handleClose}
			title={created ? "Staff Member Created ✓" : "Add Staff Member"}
			size="lg">
			{created ? (
				/* ── Success panel ── */
				<div className="space-y-5">
					<div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
						<CheckCircle size={20} className="text-green-400 shrink-0" />
						<div>
							<div className="text-sm font-semibold text-white">
								{created.full_name} has been added as{" "}
								<span className="text-nexus-300">{created.role_display}</span>
							</div>
							<div className="text-xs text-slate-400 mt-0.5">
								Credentials emailed. Password must be changed on first login.
							</div>
						</div>
					</div>

					<div className="space-y-2">
						<CredRow label="Email / Username" value={created.email} />
						<CredRow label="Employee ID" value={created.employee_id} mono />
						<CredRow
							label="Temporary Password"
							value={created.temp_password}
							mono
						/>
					</div>

					<div className="flex items-center gap-2 p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl text-xs text-slate-400">
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							className="text-blue-400 shrink-0">
							<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
							<polyline points="22,6 12,13 2,6" />
						</svg>
						Sent to <span className="text-white ml-1">{created.email}</span>
					</div>

					<div className="flex justify-end gap-3">
						<button
							onClick={() => setCreated(null)}
							className="btn-secondary btn-sm">
							<UserPlus size={13} /> Add Another
						</button>
						<button onClick={handleClose} className="btn-primary btn-sm">
							Done
						</button>
					</div>
				</div>
			) : (
				/* ── Form ── */
				<form
					onSubmit={handleSubmit((d) => mutation.mutate(d))}
					className="space-y-4">
					<div className="p-3 bg-nexus-600/10 border border-nexus-500/20 rounded-xl text-xs text-slate-400 flex items-start gap-2">
						<Shield size={13} className="text-nexus-400 mt-0.5 shrink-0" />
						<span>
							Password and Employee ID are{" "}
							<span className="text-white font-medium">auto-generated</span> and
							emailed to the staff member. They'll be shown here after creation.
						</span>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="form-label">
								First Name <span className="text-red-400">*</span>
							</label>
							<input
								{...register("first_name", { required: "Required" })}
								className="input"
								placeholder="John"
							/>
							{errors.first_name && (
								<p className="form-error">
									{String(errors.first_name.message)}
								</p>
							)}
						</div>
						<div>
							<label className="form-label">Last Name</label>
							<input
								{...register("last_name")}
								className="input"
								placeholder="Kamau"
							/>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="form-label">
								Email Address <span className="text-red-400">*</span>
							</label>
							<input
								{...register("email", {
									required: "Required",
									pattern: { value: /^\S+@\S+$/i, message: "Invalid email" },
								})}
								className="input"
								placeholder="john@example.com"
								type="email"
							/>
							{errors.email && (
								<p className="form-error">{String(errors.email.message)}</p>
							)}
						</div>
						<div>
							<label className="form-label">
								Role <span className="text-red-400">*</span>
							</label>
							<select
								{...register("role", { required: "Required" })}
								className="input">
								<option value="">— Select role —</option>
								{STAFF_ROLES.map((r) => (
									<option key={r.value} value={r.value}>
										{r.label}
									</option>
								))}
							</select>
							{errors.role && (
								<p className="form-error">{String(errors.role.message)}</p>
							)}
						</div>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="form-label">Phone (optional)</label>
							<input
								{...register("phone")}
								className="input"
								placeholder="+254 700 000 000"
							/>
						</div>
						<div>
							<label className="form-label">Department</label>
							<select {...register("department")} className="input">
								<option value="">— Select —</option>
								{departments.map((d: any) => (
									<option key={d.id} value={d.id}>
										{d.name}
									</option>
								))}
							</select>
						</div>
					</div>

					<div>
						<label className="form-label">Branch</label>
						<select {...register("branch")} className="input">
							<option value="">— Select —</option>
							{branches.map((b: any) => (
								<option key={b.id} value={b.id}>
									{b.name}
								</option>
							))}
						</select>
					</div>

					<div className="flex justify-end gap-3 pt-2">
						<button
							type="button"
							onClick={handleClose}
							className="btn-secondary btn-sm">
							Cancel
						</button>
						<button
							type="submit"
							disabled={mutation.isPending}
							className="btn-primary btn-sm">
							<UserPlus size={13} />{" "}
							{mutation.isPending ? "Creating…" : "Add Staff Member"}
						</button>
					</div>
				</form>
			)}
		</Modal>
	);
}

// ── View Attachee Modal ────────────────────────────────────────────────────────
function ViewAttacheeModal({
	attachee,
	onClose,
}: {
	attachee: any | null;
	onClose: () => void;
}) {
	const qc = useQueryClient();
	const offboardMutation = useMutation({
		mutationFn: () => hrApi.offboard(attachee.id, { reason: "HR action" }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["attachees"] });
			toast.success("Attachee offboarded");
			onClose();
		},
		onError: () => toast.error("Offboard failed"),
	});
	if (!attachee) return null;
	const initials = attachee.full_name
		?.split(" ")
		.map((n: string) => n[0])
		.join("")
		.slice(0, 2);
	return (
		<Modal
			open={!!attachee}
			onClose={onClose}
			title="Attachee Profile"
			size="lg">
			<div className="space-y-5">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-4">
						<div className="w-14 h-14 rounded-full bg-nexus-600/20 flex items-center justify-center text-xl font-bold text-nexus-400">
							{initials}
						</div>
						<div>
							<div className="text-lg font-semibold text-white">
								{attachee.full_name}
							</div>
							<div className="text-sm text-slate-400">{attachee.email}</div>
							<span
								className={clsx(
									"badge text-[10px] mt-1",
									attachee.is_active ? "badge-green" : "badge-slate",
								)}>
								{attachee.is_active ? "Active" : "Inactive"}
							</span>
						</div>
					</div>
					{attachee.is_active && (
						<button
							onClick={() => offboardMutation.mutate()}
							disabled={offboardMutation.isPending}
							className="btn-danger btn-sm">
							<UserMinus size={13} />{" "}
							{offboardMutation.isPending ? "Processing…" : "Offboard"}
						</button>
					)}
				</div>
				<div className="grid grid-cols-2 gap-3">
					{[
						{
							icon: Building2,
							label: "Department",
							value: attachee.department_name || "—",
						},
						{
							icon: MapPin,
							label: "Branch",
							value: attachee.branch_name || "—",
						},
						{ icon: Phone, label: "Phone", value: attachee.phone || "—" },
						{
							icon: Calendar,
							label: "Joined",
							value: attachee.date_joined
								? format(parseISO(attachee.date_joined), "dd MMM yyyy")
								: "—",
						},
						{
							icon: GraduationCap,
							label: "Institution",
							value: attachee.institution || "—",
						},
						{
							icon: Briefcase,
							label: "Employee ID",
							value: attachee.employee_id || "—",
						},
					].map(({ icon: Icon, label, value }) => (
						<div
							key={label}
							className="p-3 bg-surface rounded-xl border border-surface-border">
							<div className="flex items-center gap-2 mb-1">
								<Icon size={12} className="text-slate-500" />
								<span className="text-[10px] text-slate-500 uppercase tracking-wide">
									{label}
								</span>
							</div>
							<div className="text-sm text-white font-medium">{value}</div>
						</div>
					))}
				</div>
				{attachee.notes && (
					<div className="p-3 bg-surface rounded-xl border border-surface-border">
						<div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
							Notes
						</div>
						<p className="text-sm text-slate-300">{attachee.notes}</p>
					</div>
				)}
				<div className="flex justify-end">
					<button onClick={onClose} className="btn-secondary btn-sm">
						Close
					</button>
				</div>
			</div>
		</Modal>
	);
}

// ── Leave Review Modal ─────────────────────────────────────────────────────────
function LeaveReviewModal({
	req,
	onClose,
	onReview,
}: {
	req: any | null;
	onClose: () => void;
	onReview: (id: string, status: string, comment: string) => void;
}) {
	const [comment, setComment] = useState("");
	const [pending, setPending] = useState(false);
	if (!req) return null;

	const handle = async (status: string) => {
		setPending(true);
		await onReview(req.id, status, comment);
		setPending(false);
		setComment("");
	};

	return (
		<Modal
			open={!!req}
			onClose={onClose}
			title="Leave Request Details"
			size="lg">
			<div className="space-y-5">
				<div className="grid grid-cols-2 gap-3">
					{[
						{
							label: "Employee",
							value: req.user_name || req.user_full_name || "—",
						},
						{
							label: "Leave Type",
							value: req.leave_type?.replace(/_/g, " ") || "—",
						},
						{
							label: "Start Date",
							value: req.start_date
								? format(parseISO(req.start_date), "dd MMM yyyy")
								: "—",
						},
						{
							label: "End Date",
							value: req.end_date
								? format(parseISO(req.end_date), "dd MMM yyyy")
								: "—",
						},
						{ label: "Days Requested", value: req.days_requested ?? "—" },
						{
							label: "Applied On",
							value: req.created_at
								? format(parseISO(req.created_at), "dd MMM yyyy HH:mm")
								: "—",
						},
					].map(({ label, value }) => (
						<div
							key={label}
							className="p-3 bg-surface rounded-xl border border-surface-border">
							<div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
								{label}
							</div>
							<div className="text-sm text-white font-medium capitalize">
								{value}
							</div>
						</div>
					))}
				</div>

				{req.reason && (
					<div className="p-3 bg-surface rounded-xl border border-surface-border">
						<div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
							Reason
						</div>
						<p className="text-sm text-slate-300">{req.reason}</p>
					</div>
				)}

				{/* Reviewed by */}
				{(req.status === "approved" || req.status === "rejected") && (
					<div className="p-3 bg-surface rounded-xl border border-surface-border">
						<div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
							{req.status === "approved" ? "Approved" : "Rejected"} By
						</div>
						<div className="flex items-center gap-2 mt-1">
							<span
								className={clsx(
									"badge text-[10px]",
									req.status === "approved" ? "badge-green" : "badge-red",
								)}>
								{req.status}
							</span>
							<span className="text-sm text-white">
								{req.reviewed_by_name || req.approved_by_name || "—"}
							</span>
							{req.reviewed_at && (
								<span className="text-xs text-slate-500">
									&bull;{" "}
									{format(parseISO(req.reviewed_at), "dd MMM yyyy HH:mm")}
								</span>
							)}
						</div>
						{req.review_comment && (
							<p className="text-xs text-slate-400 mt-2">
								"{req.review_comment}"
							</p>
						)}
					</div>
				)}

				{/* Actions only for pending */}
				{req.status === "pending" && (
					<>
						<div>
							<label className="form-label">Review Comment (optional)</label>
							<textarea
								value={comment}
								onChange={(e) => setComment(e.target.value)}
								className="input resize-none"
								rows={2}
								placeholder="Add a note to the employee…"
							/>
						</div>
						<div className="flex justify-end gap-3">
							<button onClick={onClose} className="btn-secondary btn-sm">
								Cancel
							</button>
							<button
								onClick={() => handle("rejected")}
								disabled={pending}
								className="btn-danger btn-sm">
								<XCircle size={13} /> Reject
							</button>
							<button
								onClick={() => handle("approved")}
								disabled={pending}
								className="btn-primary btn-sm">
								<CheckCircle size={13} /> Approve
							</button>
						</div>
					</>
				)}

				{req.status !== "pending" && (
					<div className="flex justify-end">
						<button onClick={onClose} className="btn-secondary btn-sm">
							Close
						</button>
					</div>
				)}
			</div>
		</Modal>
	);
}

// ── New Evaluation Modal ───────────────────────────────────────────────────────
function NewEvaluationModal({
	open,
	onClose,
	attachees,
}: {
	open: boolean;
	onClose: () => void;
	attachees: any[];
}) {
	const qc = useQueryClient();
	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<any>();
	const mutation = useMutation({
		mutationFn: (data: any) => evaluationsApi.create(data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["evaluations"] });
			toast.success("Evaluation created");
			reset();
			onClose();
		},
		onError: (err: any) =>
			toast.error(parseApiError(err, "Failed to create evaluation")),
	});
	return (
		<Modal open={open} onClose={onClose} title="New Evaluation" size="md">
			<form
				onSubmit={handleSubmit((d) => mutation.mutate(d))}
				className="space-y-4">
				<div>
					<label className="form-label">Attachee</label>
					<select
						{...register("attachee", { required: "Required" })}
						className="input">
						<option value="">— Select attachee —</option>
						{attachees.map((a: any) => (
							<option key={a.id} value={a.id}>
								{a.full_name}
							</option>
						))}
					</select>
					{errors.attachee && (
						<p className="form-error">{String(errors.attachee.message)}</p>
					)}
				</div>
				<div>
					<label className="form-label">Evaluation Type</label>
					<select
						{...register("evaluation_type", { required: "Required" })}
						className="input">
						<option value="">— Select type —</option>
						<option value="mid_term">Mid-Term</option>
						<option value="final">Final</option>
						<option value="monthly">Monthly</option>
						<option value="probation">Probation</option>
					</select>
					{errors.evaluation_type && (
						<p className="form-error">
							{String(errors.evaluation_type.message)}
						</p>
					)}
				</div>
				<div className="grid grid-cols-2 gap-4">
					<div>
						<label className="form-label">Period Start</label>
						<input
							{...register("period_start", { required: "Required" })}
							className="input"
							type="date"
						/>
						{errors.period_start && (
							<p className="form-error">
								{String(errors.period_start.message)}
							</p>
						)}
					</div>
					<div>
						<label className="form-label">Period End</label>
						<input
							{...register("period_end", { required: "Required" })}
							className="input"
							type="date"
						/>
						{errors.period_end && (
							<p className="form-error">{String(errors.period_end.message)}</p>
						)}
					</div>
				</div>
				<div>
					<label className="form-label">Notes (optional)</label>
					<textarea
						{...register("notes")}
						className="input resize-none"
						rows={2}
						placeholder="Any notes for this evaluation…"
					/>
				</div>
				<div className="flex justify-end gap-3 pt-2">
					<button
						type="button"
						onClick={onClose}
						className="btn-secondary btn-sm">
						Cancel
					</button>
					<button
						type="submit"
						disabled={mutation.isPending}
						className="btn-primary btn-sm">
						<Plus size={13} />{" "}
						{mutation.isPending ? "Creating…" : "Create Evaluation"}
					</button>
				</div>
			</form>
		</Modal>
	);
}

// ── Add Department Modal ───────────────────────────────────────────────────────
function AddDepartmentModal({
	open,
	onClose,
	organisationId,
}: {
	open: boolean;
	onClose: () => void;
	organisationId?: string | null;
}) {
	const qc = useQueryClient();
	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<any>();
	const mutation = useMutation({
		mutationFn: (data: any) =>
			hrApi.createDept({
				...data,
				...(organisationId && { organisation: organisationId }),
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["departments"] });
			qc.invalidateQueries({ queryKey: ["user-stats"] });
			toast.success("Department created");
			reset();
			onClose();
		},
		onError: (err: any) =>
			toast.error(parseApiError(err, "Failed to create department")),
	});
	return (
		<Modal open={open} onClose={onClose} title="Add Department" size="sm">
			<form
				onSubmit={handleSubmit((d) => mutation.mutate(d))}
				className="space-y-4">
				<div>
					<label className="form-label">Department Name</label>
					<input
						{...register("name", { required: "Required" })}
						className="input"
						placeholder="e.g. Engineering"
					/>
					{errors.name && (
						<p className="form-error">{String(errors.name.message)}</p>
					)}
				</div>
				<div>
					<label className="form-label">Code</label>
					<input
						{...register("code", { required: "Required" })}
						className="input"
						placeholder="e.g. ENG"
					/>
					{errors.code && (
						<p className="form-error">{String(errors.code.message)}</p>
					)}
				</div>
				<div>
					<label className="form-label">Description (optional)</label>
					<textarea
						{...register("description")}
						className="input resize-none"
						rows={2}
						placeholder="What does this department do?"
					/>
				</div>
				<div className="flex justify-end gap-3 pt-2">
					<button
						type="button"
						onClick={onClose}
						className="btn-secondary btn-sm">
						Cancel
					</button>
					<button
						type="submit"
						disabled={mutation.isPending}
						className="btn-primary btn-sm">
						<Plus size={13} />{" "}
						{mutation.isPending ? "Creating…" : "Add Department"}
					</button>
				</div>
			</form>
		</Modal>
	);
}

// ── Add Branch Modal ───────────────────────────────────────────────────────────
function AddBranchModal({
	open,
	onClose,
	organisationId,
}: {
	open: boolean;
	onClose: () => void;
	organisationId?: string | null;
}) {
	const qc = useQueryClient();
	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<any>();
	const mutation = useMutation({
		mutationFn: (data: any) =>
			hrApi.createBranch({
				...data,
				...(organisationId && { organisation: organisationId }),
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["branches"] });
			toast.success("Branch created");
			reset();
			onClose();
		},
		onError: (err: any) =>
			toast.error(parseApiError(err, "Failed to create branch")),
	});
	return (
		<Modal open={open} onClose={onClose} title="Add Branch" size="sm">
			<form
				onSubmit={handleSubmit((d) => mutation.mutate(d))}
				className="space-y-4">
				<div>
					<label className="form-label">Branch Name</label>
					<input
						{...register("name", { required: "Required" })}
						className="input"
						placeholder="e.g. Mombasa Office"
					/>
					{errors.name && (
						<p className="form-error">{String(errors.name.message)}</p>
					)}
				</div>
				<div>
					<label className="form-label">Code</label>
					<input
						{...register("code", { required: "Required" })}
						className="input"
						placeholder="e.g. MBA"
					/>
					{errors.code && (
						<p className="form-error">{String(errors.code.message)}</p>
					)}
				</div>
				<div>
					<label className="form-label">Location / Address</label>
					<input
						{...register("location")}
						className="input"
						placeholder="e.g. Nyali, Mombasa"
					/>
				</div>
				<div>
					<label className="form-label">Contact Phone</label>
					<input
						{...register("contact_phone")}
						className="input"
						placeholder="+254 700 000 000"
					/>
				</div>
				<div className="flex justify-end gap-3 pt-2">
					<button
						type="button"
						onClick={onClose}
						className="btn-secondary btn-sm">
						Cancel
					</button>
					<button
						type="submit"
						disabled={mutation.isPending}
						className="btn-primary btn-sm">
						<Plus size={13} /> {mutation.isPending ? "Creating…" : "Add Branch"}
					</button>
				</div>
			</form>
		</Modal>
	);
}

// ── Add Recruitment Modal ──────────────────────────────────────────────────────
function AddRecruitmentModal({
	open,
	onClose,
	departments,
}: {
	open: boolean;
	onClose: () => void;
	departments: any[];
}) {
	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<any>();
	const mutation = useMutation({
		mutationFn: (data: any) => hrApi.createProgram(data),
		onSuccess: () => {
			toast.success("Recruitment posting created");
			reset();
			onClose();
		},
		onError: (err: any) =>
			toast.error(parseApiError(err, "Failed to create posting")),
	});
	return (
		<Modal
			open={open}
			onClose={onClose}
			title="New Recruitment Posting"
			size="lg">
			<form
				onSubmit={handleSubmit((d) => mutation.mutate(d))}
				className="space-y-4">
				<div>
					<label className="form-label">Position / Role Title</label>
					<input
						{...register("title", { required: "Required" })}
						className="input"
						placeholder="e.g. Broadcast Attachee"
					/>
					{errors.title && (
						<p className="form-error">{String(errors.title.message)}</p>
					)}
				</div>
				<div className="grid grid-cols-2 gap-4">
					<div>
						<label className="form-label">Department</label>
						<select {...register("department")} className="input">
							<option value="">— Select —</option>
							{departments.map((d: any) => (
								<option key={d.id} value={d.id}>
									{d.name}
								</option>
							))}
						</select>
					</div>
					<div>
						<label className="form-label">Number of Slots</label>
						<input
							{...register("slots")}
							className="input"
							type="number"
							min={1}
							placeholder="e.g. 3"
						/>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-4">
					<div>
						<label className="form-label">Start Date</label>
						<input {...register("start_date")} className="input" type="date" />
					</div>
					<div>
						<label className="form-label">End Date</label>
						<input {...register("end_date")} className="input" type="date" />
					</div>
				</div>
				<div>
					<label className="form-label">Description / Requirements</label>
					<textarea
						{...register("description")}
						className="input resize-none"
						rows={3}
						placeholder="Skills, qualifications, or program details…"
					/>
				</div>
				<div className="flex justify-end gap-3 pt-2">
					<button
						type="button"
						onClick={onClose}
						className="btn-secondary btn-sm">
						Cancel
					</button>
					<button
						type="submit"
						disabled={mutation.isPending}
						className="btn-primary btn-sm">
						<Plus size={13} />{" "}
						{mutation.isPending ? "Posting…" : "Create Posting"}
					</button>
				</div>
			</form>
		</Modal>
	);
}

// ── Generate Certificate Modal (FIX: attachee_id, correct cert types) ──────────
function GenerateCertModal({
	open,
	onClose,
	attachees,
}: {
	open: boolean;
	onClose: () => void;
	attachees: any[];
}) {
	const qc = useQueryClient();
	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<any>();
	const mutation = useMutation({
		mutationFn: (data: any) =>
			certificatesApi.generate({
				// backend expects attachee_id not attachee
				attachee_id: data.attachee_id,
				certificate_type: data.certificate_type,
				...(data.custom_message && { custom_message: data.custom_message }),
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["certificates"] });
			toast.success("Certificate generated");
			reset();
			onClose();
		},
		onError: (err: any) =>
			toast.error(parseApiError(err, "Failed to generate certificate")),
	});
	return (
		<Modal open={open} onClose={onClose} title="Generate Certificate" size="md">
			<form
				onSubmit={handleSubmit((d) => mutation.mutate(d))}
				className="space-y-4">
				<div>
					<label className="form-label">Attachee</label>
					<select
						{...register("attachee_id", {
							required: "Please select an attachee",
						})}
						className="input">
						<option value="">— Select attachee —</option>
						{attachees.map((a: any) => (
							<option key={a.id} value={a.id}>
								{a.full_name}
							</option>
						))}
					</select>
					{errors.attachee_id && (
						<p className="form-error">{String(errors.attachee_id.message)}</p>
					)}
				</div>
				<div>
					<label className="form-label">Certificate Type</label>
					<select
						{...register("certificate_type", {
							required: "Please select a type",
						})}
						className="input">
						<option value="">— Select type —</option>
						{CERT_TYPES.map((t) => (
							<option key={t.value} value={t.value}>
								{t.label}
							</option>
						))}
					</select>
					{errors.certificate_type && (
						<p className="form-error">
							{String(errors.certificate_type.message)}
						</p>
					)}
				</div>
				<div>
					<label className="form-label">Custom Message (optional)</label>
					<textarea
						{...register("custom_message")}
						className="input resize-none"
						rows={2}
						placeholder="Personalised message on the certificate…"
					/>
				</div>
				<div className="flex justify-end gap-3 pt-2">
					<button
						type="button"
						onClick={onClose}
						className="btn-secondary btn-sm">
						Cancel
					</button>
					<button
						type="submit"
						disabled={mutation.isPending}
						className="btn-primary btn-sm">
						<Award size={13} />{" "}
						{mutation.isPending ? "Generating…" : "Generate"}
					</button>
				</div>
			</form>
		</Modal>
	);
}

// ── Bulk Import Modal ──────────────────────────────────────────────────────────
// Flow: pick file → client-side CSV parse → preview table (select/deselect rows)
//       → POST to /attachees/bulk-import/ → rich result screen with download.
//
// Required CSV columns: email, first_name, last_name
// Optional:            phone, role, department, branch
// NEVER include:       password, employee_id  (always auto-generated by backend)

interface BulkPreviewRow {
	_idx: number;
	email: string;
	first_name: string;
	last_name: string;
	phone?: string;
	role?: string;
	department?: string;
	branch?: string;
	_status: "valid" | "duplicate_in_file" | "invalid";
	_reason?: string;
}

interface BulkImportResult {
	summary: {
		created: number;
		duplicates: number;
		skipped: number;
		errors: number;
	};
	created: {
		email: string;
		full_name?: string;
		employee_id?: string;
		department?: string;
	}[];
	duplicates: {
		row?: number;
		email: string;
		message?: string;
		is_active?: boolean;
	}[];
	skipped: { row?: number; email: string; reason: string }[];
	errors: { row?: number; email: string; reason: string }[];
	// legacy shape fallback
	created_users?: {
		email: string;
		full_name?: string;
		employee_id?: string;
		temp_password?: string;
	}[];
	error_details?: { row?: number; email?: string; error?: string }[];
}

function parseCSVForPreview(text: string): BulkPreviewRow[] {
	const lines = text.split(/\r?\n/).filter(Boolean);
	if (lines.length < 2) return [];
	const headers = lines[0]
		.split(",")
		.map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
	const seen = new Set<string>();
	return lines.slice(1).map((line, i) => {
		const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
		const raw: Record<string, string> = {};
		headers.forEach((h, j) => {
			raw[h] = vals[j] ?? "";
		});

		const email = (raw.email ?? "").toLowerCase().trim();
		const firstName = (raw.first_name ?? raw.firstname ?? "").trim();
		const lastName = (raw.last_name ?? raw.lastname ?? "").trim();

		let _status: BulkPreviewRow["_status"] = "valid";
		let _reason: string | undefined;

		if (!email) {
			_status = "invalid";
			_reason = "Missing email";
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			_status = "invalid";
			_reason = "Invalid email";
		} else if (!firstName) {
			_status = "invalid";
			_reason = "Missing first_name";
		} else if (seen.has(email)) {
			_status = "duplicate_in_file";
			_reason = "Duplicate in file";
		} else {
			seen.add(email);
		}

		return {
			_idx: i + 2,
			email,
			first_name: firstName,
			last_name: lastName,
			phone: raw.phone?.trim() || undefined,
			role: raw.role?.trim() || undefined,
			department: raw.department?.trim() || undefined,
			branch: raw.branch?.trim() || undefined,
			_status,
			_reason,
		};
	});
}

function buildCSVFromRows(rows: BulkPreviewRow[]): File {
	const header = "email,first_name,last_name,phone,role,department,branch";
	const lines = rows.map((r) =>
		[
			r.email,
			r.first_name,
			r.last_name,
			r.phone ?? "",
			r.role ?? "",
			r.department ?? "",
			r.branch ?? "",
		]
			.map((v) => `"${String(v).replace(/"/g, '""')}"`)
			.join(","),
	);
	const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
	return new File([blob], "import.csv", { type: "text/csv" });
}

function downloadCredentialsCSV(result: BulkImportResult) {
	const users = result.created_users ?? result.created ?? [];
	if (!users.length) {
		toast.error("No created users to download");
		return;
	}
	const header = "full_name,email,employee_id,temp_password";
	const rows = users.map(
		(u: any) =>
			`"${u.full_name ?? ""}","${u.email ?? ""}","${u.employee_id ?? ""}","${u.temp_password ?? "Sent via email"}"`,
	);
	const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "imported-credentials.csv";
	a.click();
	URL.revokeObjectURL(url);
}

function BulkImportModal({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const qc = useQueryClient();
	const fileRef = useRef<HTMLInputElement>(null);

	// Stage: "pick" | "preview" | "result"
	const [stage, setStage] = useState<"pick" | "preview" | "result">("pick");
	const [parsing, setParsing] = useState(false);
	const [allRows, setAllRows] = useState<BulkPreviewRow[]>([]);
	const [selected, setSelected] = useState<Set<number>>(new Set());
	const [result, setResult] = useState<BulkImportResult | null>(null);
	const [resultTab, setResultTab] = useState<
		"created" | "duplicates" | "skipped" | "errors"
	>("created");
	const [previewSearch, setPreviewSearch] = useState("");
	const [previewStatusFilter, setPreviewStatusFilter] = useState<
		"all" | "valid" | "duplicate_in_file" | "invalid"
	>("all");

	const handleClose = () => {
		setStage("pick");
		setParsing(false);
		setAllRows([]);
		setSelected(new Set());
		setResult(null);
		setPreviewSearch("");
		setPreviewStatusFilter("all");
		onClose();
	};

	// ── Parse file on pick ────────────────────────────────────────────────────
	const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		if (!/\.(csv)$/i.test(file.name)) {
			toast.error("Please upload a .csv file");
			return;
		}
		setParsing(true);
		const reader = new FileReader();
		reader.onload = (ev) => {
			try {
				const rows = parseCSVForPreview(ev.target?.result as string);
				if (!rows.length) {
					toast.error("File is empty or has no data rows");
					setParsing(false);
					return;
				}
				setAllRows(rows);
				// Auto-select all valid rows
				setSelected(
					new Set(rows.filter((r) => r._status === "valid").map((r) => r._idx)),
				);
				setStage("preview");
			} catch {
				toast.error("Could not parse file. Check the format.");
			} finally {
				setParsing(false);
				e.target.value = "";
			}
		};
		reader.readAsText(file);
	};

	// ── Commit selected rows ──────────────────────────────────────────────────
	const commitMutation = useMutation({
		mutationFn: async (rows: BulkPreviewRow[]) => {
			const file = buildCSVFromRows(rows);
			const fd = new FormData();
			fd.append("file", file);
			const res = await import("../../services/api").then(({ api }) =>
				api.post("attachees/bulk-import/", fd, {
					headers: { "Content-Type": "multipart/form-data" },
				}),
			);
			return res.data as BulkImportResult;
		},
		onSuccess: (data) => {
			qc.invalidateQueries({ queryKey: ["attachees"] });
			qc.invalidateQueries({ queryKey: ["all-staff"] });
			qc.invalidateQueries({ queryKey: ["user-stats"] });
			setResult(data);
			setResultTab("created");
			setStage("result");
			const n = data.summary?.created ?? data.created?.length ?? 0;
			if (n > 0)
				toast.success(`${n} account${n !== 1 ? "s" : ""} created and emailed`);
		},
		onError: (err: any) => toast.error(parseApiError(err, "Import failed")),
	});

	const handleCommit = () => {
		const toImport = allRows.filter(
			(r) => selected.has(r._idx) && r._status === "valid",
		);
		if (!toImport.length) {
			toast.error("No valid rows selected");
			return;
		}
		commitMutation.mutate(toImport);
	};

	// ── Preview helpers ───────────────────────────────────────────────────────
	const filteredPreview = allRows.filter((r) => {
		if (previewStatusFilter !== "all" && r._status !== previewStatusFilter)
			return false;
		if (previewSearch) {
			const q = previewSearch.toLowerCase();
			return (
				r.email.includes(q) ||
				r.first_name.toLowerCase().includes(q) ||
				r.last_name.toLowerCase().includes(q)
			);
		}
		return true;
	});
	const validRows = allRows.filter((r) => r._status === "valid");
	const allFilteredValid = filteredPreview.filter((r) => r._status === "valid");
	const allFilteredSelected =
		allFilteredValid.length > 0 &&
		allFilteredValid.every((r) => selected.has(r._idx));

	const toggleRow = (idx: number) => {
		setSelected((prev) => {
			const next = new Set(prev);
			next.has(idx) ? next.delete(idx) : next.add(idx);
			return next;
		});
	};
	const toggleAllFiltered = () => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (allFilteredSelected) {
				allFilteredValid.forEach((r) => next.delete(r._idx));
			} else {
				allFilteredValid.forEach((r) => next.add(r._idx));
			}
			return next;
		});
	};

	const statusBadge = (r: BulkPreviewRow) => {
		if (r._status === "valid")
			return <span className="badge badge-green text-[10px]">Valid</span>;
		if (r._status === "duplicate_in_file")
			return <span className="badge badge-amber text-[10px]">Duplicate</span>;
		return <span className="badge badge-red text-[10px]">Invalid</span>;
	};

	const counts = {
		valid: allRows.filter((r) => r._status === "valid").length,
		duplicate: allRows.filter((r) => r._status === "duplicate_in_file").length,
		invalid: allRows.filter((r) => r._status === "invalid").length,
	};

	const modalSize =
		stage === "preview" ? "xl" : stage === "result" ? "xl" : "md";
	const modalTitle =
		stage === "pick"
			? "Bulk Import Users"
			: stage === "preview"
				? `Preview — ${allRows.length} rows`
				: "Import Complete ✓";

	// ── Result helpers ────────────────────────────────────────────────────────
	const resultSummary = result
		? {
				created: result.summary?.created ?? result.created?.length ?? 0,
				duplicates:
					result.summary?.duplicates ?? result.duplicates?.length ?? 0,
				skipped: result.summary?.skipped ?? result.skipped?.length ?? 0,
				errors:
					result.summary?.errors ??
					result.error_details?.length ??
					result.errors?.length ??
					0,
			}
		: null;

	const resultTabs = resultSummary
		? [
				{
					key: "created" as const,
					label: "Created",
					count: resultSummary.created,
					color: "text-green-400",
				},
				{
					key: "duplicates" as const,
					label: "Duplicates",
					count: resultSummary.duplicates,
					color: "text-yellow-400",
				},
				{
					key: "skipped" as const,
					label: "Skipped",
					count: resultSummary.skipped,
					color: "text-slate-400",
				},
				{
					key: "errors" as const,
					label: "Errors",
					count: resultSummary.errors,
					color: "text-red-400",
				},
			]
		: [];

	return (
		<Modal
			open={open}
			onClose={handleClose}
			title={modalTitle}
			size={modalSize}>
			{/* ════════ STAGE 1: PICK FILE ════════ */}
			{stage === "pick" && (
				<div className="space-y-5">
					{/* Info */}
					<div className="p-4 bg-nexus-600/10 border border-nexus-500/20 rounded-xl text-sm text-slate-300 space-y-2">
						<p>
							Upload a <span className="font-mono text-nexus-400">.csv</span>{" "}
							file. Required columns:{" "}
							<span className="font-mono text-nexus-400">
								email, first_name, last_name
							</span>
							.
						</p>
						<p>
							Optional columns:{" "}
							<span className="font-mono text-nexus-300">
								phone, role, department, branch
							</span>
							.
						</p>
						<p>
							Password and Employee ID are{" "}
							<span className="text-white font-semibold">auto-generated</span>{" "}
							and emailed — do <em>not</em> include them.
						</p>
					</div>

					{/* Drop zone */}
					<div
						className="border-2 border-dashed border-surface-border rounded-xl p-10 text-center cursor-pointer hover:border-nexus-500/40 transition-colors"
						onClick={() => fileRef.current?.click()}>
						<Upload size={28} className="mx-auto text-slate-500 mb-3" />
						<div className="text-sm text-slate-300 font-medium">
							Click to select a CSV file
						</div>
						<div className="text-xs text-slate-500 mt-1">or drag and drop</div>
						<input
							ref={fileRef}
							type="file"
							accept=".csv"
							className="hidden"
							onChange={handleFile}
						/>
					</div>

					{parsing && (
						<div className="flex items-center justify-center gap-2 text-sm text-slate-400 py-2">
							<svg
								className="animate-spin w-4 h-4 text-nexus-400"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24">
								<circle
									className="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									strokeWidth="4"
								/>
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8v8z"
								/>
							</svg>
							Parsing file…
						</div>
					)}

					{/* Template download */}
					<div className="flex items-center justify-between">
						<span className="text-xs text-slate-500">
							Not sure of the format?
						</span>
						<button
							onClick={() =>
								window.open("/api/v1/attachees/bulk-import/template/", "_blank")
							}
							className="btn-secondary btn-sm text-xs">
							<Download size={11} /> Download Template
						</button>
					</div>

					<div className="flex justify-end">
						<button onClick={handleClose} className="btn-secondary btn-sm">
							Cancel
						</button>
					</div>
				</div>
			)}

			{/* ════════ STAGE 2: PREVIEW ════════ */}
			{stage === "preview" && (
				<div className="space-y-4">
					{/* Auto-gen notice */}
					<div className="flex items-start gap-2 p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl text-xs text-slate-400">
						<Shield size={12} className="text-blue-400 mt-0.5 shrink-0" />
						<span>
							Password and Employee ID are{" "}
							<span className="text-white font-medium">auto-generated</span> and
							emailed to each new account. Select only the rows you want to
							import.
						</span>
					</div>

					{/* Summary badges */}
					<div className="flex flex-wrap gap-3 px-1">
						{[
							{
								key: "valid" as const,
								label: "Valid",
								count: counts.valid,
								color: "text-green-400",
							},
							{
								key: "duplicate_in_file" as const,
								label: "Duplicates",
								count: counts.duplicate,
								color: "text-yellow-400",
							},
							{
								key: "invalid" as const,
								label: "Invalid",
								count: counts.invalid,
								color: "text-red-400",
							},
						].map((s) => (
							<button
								key={s.key}
								onClick={() =>
									setPreviewStatusFilter(
										previewStatusFilter === s.key ? "all" : s.key,
									)
								}
								className={clsx(
									"flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
									previewStatusFilter === s.key
										? "bg-white/10 text-white"
										: "text-slate-400 hover:text-white",
								)}>
								<span className={clsx("text-sm font-bold", s.color)}>
									{s.count}
								</span>
								{s.label}
							</button>
						))}
						<div className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
							<Users size={12} />
							<span className="text-white font-semibold">
								{selected.size}
							</span>{" "}
							selected
						</div>
					</div>

					{/* Filters + select toggles */}
					<div className="flex flex-wrap gap-2">
						<div className="relative flex-1 min-w-40">
							<Search
								size={12}
								className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
							/>
							<input
								value={previewSearch}
								onChange={(e) => setPreviewSearch(e.target.value)}
								placeholder="Search name or email…"
								className="input pl-8 py-1.5 text-sm"
							/>
						</div>
						<button
							onClick={toggleAllFiltered}
							className="btn-secondary btn-sm text-xs">
							{allFilteredSelected ? "Deselect visible" : "Select visible"}
						</button>
						<button
							onClick={() => setSelected(new Set(validRows.map((r) => r._idx)))}
							className="btn-secondary btn-sm text-xs">
							Select all valid
						</button>
						<button
							onClick={() => setSelected(new Set())}
							className="btn-secondary btn-sm text-xs text-slate-400">
							Clear all
						</button>
					</div>

					{/* Table */}
					<div className="max-h-72 overflow-y-auto rounded-xl border border-surface-border">
						<table className="data-table text-sm">
							<thead>
								<tr>
									<th className="w-8"></th>
									<th>Name</th>
									<th>Email</th>
									<th>Role</th>
									<th>Dept / Branch</th>
									<th>Status</th>
								</tr>
							</thead>
							<tbody>
								{filteredPreview.length === 0 ? (
									<tr>
										<td colSpan={6} className="text-center py-8 text-slate-500">
											No rows match
										</td>
									</tr>
								) : (
									filteredPreview.map((r) => {
										const isSelectable = r._status === "valid";
										const isSel = selected.has(r._idx);
										return (
											<tr
												key={r._idx}
												onClick={() => isSelectable && toggleRow(r._idx)}
												className={clsx(
													"transition-colors",
													isSelectable
														? "cursor-pointer"
														: "opacity-40 cursor-not-allowed",
													isSel && "bg-blue-500/5",
												)}>
												<td onClick={(e) => e.stopPropagation()}>
													<input
														type="checkbox"
														checked={isSel}
														disabled={!isSelectable}
														onChange={() => isSelectable && toggleRow(r._idx)}
														className="accent-nexus-500 w-3.5 h-3.5"
													/>
												</td>
												<td>
													<div className="font-medium text-white">
														{r.first_name} {r.last_name}
													</div>
												</td>
												<td className="text-slate-400 text-xs">{r.email}</td>
												<td className="text-slate-400 text-xs">
													{r.role ? (
														(STAFF_ROLES.find((x) => x.value === r.role)
															?.label ?? r.role)
													) : (
														<span className="text-slate-600">attachee</span>
													)}
												</td>
												<td className="text-slate-400 text-xs">
													{[r.department, r.branch]
														.filter(Boolean)
														.join(" · ") || "—"}
												</td>
												<td>
													{statusBadge(r)}
													{r._reason && (
														<div className="text-[10px] text-slate-500 mt-0.5">
															{r._reason}
														</div>
													)}
												</td>
											</tr>
										);
									})
								)}
							</tbody>
						</table>
					</div>

					{/* Actions */}
					<div className="flex items-center justify-between pt-1">
						<button
							onClick={() => {
								setStage("pick");
								setAllRows([]);
								setSelected(new Set());
							}}
							className="btn-secondary btn-sm text-xs">
							← Back
						</button>
						<div className="flex gap-2">
							<button onClick={handleClose} className="btn-secondary btn-sm">
								Cancel
							</button>
							<button
								onClick={handleCommit}
								disabled={commitMutation.isPending || selected.size === 0}
								className="btn-primary btn-sm">
								{commitMutation.isPending ? (
									<>
										<svg
											className="animate-spin w-3.5 h-3.5"
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24">
											<circle
												className="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												strokeWidth="4"
											/>
											<path
												className="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8v8z"
											/>
										</svg>
										Importing…
									</>
								) : (
									<>
										<Upload size={13} />
										Import {selected.size} row{selected.size !== 1 ? "s" : ""}
									</>
								)}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* ════════ STAGE 3: RESULT ════════ */}
			{stage === "result" && result && resultSummary && (
				<div className="space-y-5">
					{/* Summary cards */}
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
						{[
							{
								label: "Created",
								value: resultSummary.created,
								color: "text-green-400",
								bg: "bg-green-500/10 border-green-500/20",
							},
							{
								label: "Duplicates",
								value: resultSummary.duplicates,
								color: "text-yellow-400",
								bg: "bg-yellow-500/10 border-yellow-500/20",
							},
							{
								label: "Skipped",
								value: resultSummary.skipped,
								color: "text-slate-300",
								bg: "bg-white/5 border-white/10",
							},
							{
								label: "Errors",
								value: resultSummary.errors,
								color: "text-red-400",
								bg: "bg-red-500/10 border-red-500/20",
							},
						].map(({ label, value, color, bg }) => (
							<div
								key={label}
								className={clsx("p-3 rounded-xl border text-center", bg)}>
								<div className={clsx("text-2xl font-bold", color)}>{value}</div>
								<div className="text-xs text-slate-400 mt-0.5">{label}</div>
							</div>
						))}
					</div>

					{/* Email note */}
					{resultSummary.created > 0 && (
						<div className="flex items-center gap-2 p-3 bg-green-500/5 border border-green-500/10 rounded-xl text-xs text-slate-400">
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								className="text-green-400 shrink-0">
								<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
								<polyline points="22,6 12,13 2,6" />
							</svg>
							Credentials emailed to{" "}
							<span className="text-white font-medium">
								{resultSummary.created}
							</span>{" "}
							new account{resultSummary.created !== 1 ? "s" : ""}. They must
							change their password on first login.
						</div>
					)}

					{/* Tabs */}
					<div className="flex flex-wrap gap-2 border-b border-surface-border pb-3">
						{resultTabs.map((t) => (
							<button
								key={t.key}
								onClick={() => setResultTab(t.key)}
								className={clsx(
									"px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
									resultTab === t.key
										? "bg-white/10 text-white"
										: "text-slate-500 hover:text-slate-300",
								)}>
								<span className={t.color}>{t.count}</span> {t.label}
							</button>
						))}
					</div>

					{/* Tab content */}
					<div className="max-h-56 overflow-y-auto space-y-1">
						{resultTab === "created" && (
							<>
								{(result.created_users ?? result.created ?? []).length === 0 ? (
									<p className="text-slate-500 text-sm text-center py-6">
										No records created.
									</p>
								) : (
									(result.created_users ?? result.created ?? []).map(
										(u: any, i: number) => (
											<div
												key={i}
												className="flex items-center gap-3 py-2 px-3 rounded-lg bg-green-500/5 border border-green-500/10">
												<CheckCircle
													size={12}
													className="text-green-400 shrink-0"
												/>
												<div className="min-w-0 flex-1">
													<div className="text-sm text-white font-medium truncate">
														{u.full_name}
													</div>
													<div className="text-xs text-slate-500 truncate">
														{u.email}
														{u.employee_id ? ` · ${u.employee_id}` : ""}
														{u.department ? ` · ${u.department}` : ""}
													</div>
												</div>
												<svg
													width="12"
													height="12"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="2"
													className="text-blue-400 shrink-0"
													aria-label="Credentials emailed">
													<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
													<polyline points="22,6 12,13 2,6" />
												</svg>
											</div>
										),
									)
								)}
							</>
						)}
						{resultTab === "duplicates" && (
							<>
								{(result.duplicates ?? []).length === 0 ? (
									<p className="text-slate-500 text-sm text-center py-6">
										No duplicates.
									</p>
								) : (
									(result.duplicates ?? []).map((r: any, i: number) => (
										<div
											key={i}
											className="py-2 px-3 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
											<div className="flex items-center gap-2">
												<AlertTriangle
													size={12}
													className="text-yellow-400 shrink-0"
												/>
												<span className="text-sm text-white">{r.email}</span>
												{r.is_active !== undefined && (
													<span
														className={clsx(
															"badge ml-auto text-[10px]",
															r.is_active ? "badge-green" : "badge-slate",
														)}>
														{r.is_active ? "Active" : "Inactive"}
													</span>
												)}
											</div>
											<p className="text-xs text-yellow-300/70 ml-5 mt-0.5">
												{r.message || "Account already exists"}
											</p>
										</div>
									))
								)}
							</>
						)}
						{resultTab === "skipped" && (
							<>
								{(result.skipped ?? []).length === 0 ? (
									<p className="text-slate-500 text-sm text-center py-6">
										No rows skipped.
									</p>
								) : (
									(result.skipped ?? []).map((r: any, i: number) => (
										<div
											key={i}
											className="py-2 px-3 rounded-lg bg-white/3 border border-white/5">
											<div className="flex items-center gap-2">
												<span className="text-xs text-slate-400">
													Row {r.row} · {r.email}
												</span>
											</div>
											<p className="text-xs text-slate-500 ml-0 mt-0.5">
												{r.reason}
											</p>
										</div>
									))
								)}
							</>
						)}
						{resultTab === "errors" && (
							<>
								{(result.error_details ?? result.errors ?? []).length === 0 ? (
									<p className="text-slate-500 text-sm text-center py-6">
										No errors.
									</p>
								) : (
									(result.error_details ?? result.errors ?? []).map(
										(e: any, i: number) => (
											<div
												key={i}
												className="py-2 px-3 rounded-lg bg-red-500/5 border border-red-500/10">
												<div className="flex items-center gap-2">
													<AlertTriangle
														size={12}
														className="text-red-400 shrink-0"
													/>
													<span className="text-xs text-slate-300">
														Row {e.row} · {e.email}
													</span>
												</div>
												<p className="text-xs text-red-300/70 ml-5 mt-0.5">
													{e.error ?? e.reason}
												</p>
											</div>
										),
									)
								)}
							</>
						)}
					</div>

					{/* Warning + actions */}
					{resultSummary.created > 0 && (
						<p className="text-[11px] text-slate-500">
							⚠ Download the credentials CSV for your records. Passwords will
							not be shown again.
						</p>
					)}
					<div className="flex justify-between">
						<button
							onClick={() => downloadCredentialsCSV(result)}
							disabled={resultSummary.created === 0}
							className="btn-secondary btn-sm">
							<Download size={13} /> Download Credentials CSV
						</button>
						<button onClick={handleClose} className="btn-primary btn-sm">
							Done
						</button>
					</div>
				</div>
			)}
		</Modal>
	);
}

// ── Org Settings Modal (FIX: added HR policy defaults editing) ─────────────────
function OrgSettingsModal({
	open,
	onClose,
	org,
}: {
	open: boolean;
	onClose: () => void;
	org: any;
}) {
	const qc = useQueryClient();
	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<any>({ defaultValues: org });

	// Re-populate form whenever org data changes (defaultValues only runs once on mount)
	useEffect(() => {
		if (org) reset(org);
	}, [org, reset]);

	const mutation = useMutation({
		mutationFn: (data: any) => hrApi.updateOrg(data),
		onSuccess: (res) => {
			// Update cache directly with response so settings tab shows new values immediately
			qc.setQueryData(["organisation"], () => res.data);
			qc.invalidateQueries({ queryKey: ["organisation"] });
			toast.success("Organisation settings saved");
			onClose();
		},
		onError: (err: any) => toast.error(parseApiError(err, "Update failed")),
	});
	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Edit Organisation Settings"
			size="lg">
			<form
				onSubmit={handleSubmit((d) => mutation.mutate(d))}
				className="space-y-5">
				{/* Org info */}
				<div>
					<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
						Organisation Info
					</p>
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="form-label">Organisation Name</label>
							<input
								{...register("name", { required: "Required" })}
								className="input"
							/>
							{errors.name && (
								<p className="form-error">{String(errors.name.message)}</p>
							)}
						</div>
						<div>
							<label className="form-label">Short Code</label>
							<input
								{...register("code")}
								className="input"
								placeholder="e.g. RTK"
							/>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-4 mt-4">
						<div>
							<label className="form-label">Contact Email</label>
							<input
								{...register("contact_email")}
								className="input"
								type="email"
							/>
						</div>
						<div>
							<label className="form-label">Contact Phone</label>
							<input {...register("contact_phone")} className="input" />
						</div>
					</div>
					<div className="mt-4">
						<label className="form-label">Physical Address</label>
						<input
							{...register("address")}
							className="input"
							placeholder="Street, City"
						/>
					</div>
					<div className="mt-4">
						<label className="form-label">Website</label>
						<input
							{...register("website")}
							className="input"
							placeholder="https://example.com"
							type="url"
						/>
					</div>
					<div className="mt-4">
						<label className="form-label">Mission Statement</label>
						<textarea
							{...register("mission")}
							className="input resize-none"
							rows={2}
						/>
					</div>
				</div>

				{/* HR Policy Defaults */}
				<div>
					<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
						HR Policy Defaults
					</p>
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="form-label">Annual Leave Days</label>
							<input
								{...register("annual_leave_days")}
								className="input"
								type="number"
								min={0}
								placeholder="e.g. 21"
							/>
						</div>
						<div>
							<label className="form-label">Sick Leave Days</label>
							<input
								{...register("sick_leave_days")}
								className="input"
								type="number"
								min={0}
								placeholder="e.g. 14"
							/>
						</div>
						<div>
							<label className="form-label">Maternity Leave Days</label>
							<input
								{...register("maternity_leave_days")}
								className="input"
								type="number"
								min={0}
								placeholder="e.g. 90"
							/>
						</div>
						<div>
							<label className="form-label">Paternity Leave Days</label>
							<input
								{...register("paternity_leave_days")}
								className="input"
								type="number"
								min={0}
								placeholder="e.g. 14"
							/>
						</div>
						<div>
							<label className="form-label">Probation Period (weeks)</label>
							<input
								{...register("probation_weeks")}
								className="input"
								type="number"
								min={0}
								placeholder="e.g. 12"
							/>
						</div>
						<div>
							<label className="form-label">Notice Period (weeks)</label>
							<input
								{...register("notice_weeks")}
								className="input"
								type="number"
								min={0}
								placeholder="e.g. 4"
							/>
						</div>
					</div>
					<div className="mt-4">
						<label className="form-label">Stipend Amount (KES)</label>
						<input
							{...register("default_stipend_amount")}
							className="input"
							type="number"
							min={0}
							placeholder="e.g. 15000"
						/>
					</div>
				</div>

				<div className="flex justify-end gap-3 pt-2 border-t border-surface-border">
					<button
						type="button"
						onClick={onClose}
						className="btn-secondary btn-sm">
						Cancel
					</button>
					<button
						type="submit"
						disabled={mutation.isPending}
						className="btn-primary btn-sm">
						<Save size={13} /> {mutation.isPending ? "Saving…" : "Save Changes"}
					</button>
				</div>
			</form>
		</Modal>
	);
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function HRPage() {
	const { user } = useAuthStore();
	const qc = useQueryClient();
	const [activeTab, setActiveTab] = useState<Tab>("overview");
	const [search, setSearch] = useState("");
	const [staffSearch, setStaffSearch] = useState("");

	// Modal states
	const [showOnboard, setShowOnboard] = useState(false);
	const [showAddStaff, setShowAddStaff] = useState(false);
	const [viewAttachee, setViewAttachee] = useState<any | null>(null);
	const [reviewLeave, setReviewLeave] = useState<any | null>(null);
	const [showNewEval, setShowNewEval] = useState(false);
	const [showAddDept, setShowAddDept] = useState(false);
	const [showAddBranch, setShowAddBranch] = useState(false);
	const [showRecruitment, setShowRecruitment] = useState(false);
	const [showGenCert, setShowGenCert] = useState(false);
	const [showBulkImport, setShowBulkImport] = useState(false);
	const [showOrgSettings, setShowOrgSettings] = useState(false);
	const [violationFilter, setViolationFilter] = useState("all");
	const [auditFilter, setAuditFilter] = useState("");

	// ── Queries ──────────────────────────────────────────────────────────────
	const { data: attacheesRaw } = useQuery({
		queryKey: ["attachees"],
		queryFn: () => usersApi.list({ role: "attachee" }).then((r) => r.data),
		refetchInterval: 120000,
	});
	const { data: allStaffRaw } = useQuery({
		queryKey: ["all-staff"],
		queryFn: () => usersApi.list().then((r) => r.data),
		enabled: activeTab === "staff" || activeTab === "overview",
	});
	const { data: leaveRaw } = useQuery({
		queryKey: ["leave-requests"],
		queryFn: () => attendanceApi.leaveRequests().then((r) => r.data),
		refetchInterval: 60000,
		enabled: activeTab === "leave",
	});
	const { data: evalsRaw } = useQuery({
		queryKey: ["evaluations"],
		queryFn: () => evaluationsApi.list().then((r) => r.data),
		enabled: activeTab === "evaluations",
	});
	const { data: deptsRaw } = useQuery({
		queryKey: ["departments"],
		queryFn: () => hrApi.departments().then((r) => r.data),
		enabled:
			activeTab === "departments" ||
			showOnboard ||
			showAddStaff ||
			showRecruitment,
	});
	const { data: branchesRaw } = useQuery({
		queryKey: ["branches"],
		queryFn: () => hrApi.branches().then((r) => r.data),
		enabled: activeTab === "branches" || showAddStaff || showOnboard,
	});
	const { data: recruitmentRaw } = useQuery({
		queryKey: ["recruitment"],
		queryFn: () => hrApi.attacheePrograms().then((r) => r.data),
		enabled: activeTab === "recruitment",
	});
	const { data: userStats } = useQuery({
		queryKey: ["user-stats"],
		queryFn: () => usersApi.stats().then((r) => r.data),
	});
	const { data: stipendsRaw } = useQuery({
		queryKey: ["stipends"],
		queryFn: () => financeApi.stipends().then((r) => r.data),
		enabled: activeTab === "stipends",
	});
	const { data: violationsRaw } = useQuery({
		queryKey: ["attendance-violations"],
		queryFn: () => attendanceApi.violations().then((r) => r.data),
		enabled: activeTab === "violations",
	});
	const { data: certsRaw } = useQuery({
		queryKey: ["certificates"],
		queryFn: () => certificatesApi.list().then((r) => r.data),
		enabled: activeTab === "certificates",
	});
	const { data: auditRaw, refetch: refetchAudit } = useQuery({
		queryKey: ["audit-log"],
		queryFn: () =>
			usersApi
				.auditLog({ search: auditFilter || undefined })
				.then((r) => r.data),
		enabled: activeTab === "audit",
	});
	const { data: orgRaw } = useQuery({
		queryKey: ["organisation"],
		queryFn: () => hrApi.organisation().then((r) => r.data),
		enabled: activeTab === "settings" || showOrgSettings,
	});

	// ── Normalise ─────────────────────────────────────────────────────────────
	const attachees = Array.isArray(attacheesRaw)
		? attacheesRaw
		: (attacheesRaw?.results ?? []);
	const allStaff = Array.isArray(allStaffRaw)
		? allStaffRaw
		: (allStaffRaw?.results ?? []);
	const nonAttacheeStaff = allStaff.filter((s: any) => s.role !== "attachee");
	const leave = Array.isArray(leaveRaw) ? leaveRaw : (leaveRaw?.results ?? []);
	const evals = Array.isArray(evalsRaw) ? evalsRaw : (evalsRaw?.results ?? []);
	const depts = Array.isArray(deptsRaw) ? deptsRaw : (deptsRaw?.results ?? []);
	const branches = Array.isArray(branchesRaw)
		? branchesRaw
		: (branchesRaw?.results ?? []);
	const recruitment = Array.isArray(recruitmentRaw)
		? recruitmentRaw
		: (recruitmentRaw?.results ?? []);
	const stipends = Array.isArray(stipendsRaw)
		? stipendsRaw
		: (stipendsRaw?.results ?? []);
	const violations = Array.isArray(violationsRaw)
		? violationsRaw
		: (violationsRaw?.results ?? []);
	const certs = Array.isArray(certsRaw) ? certsRaw : (certsRaw?.results ?? []);
	const auditLogs = Array.isArray(auditRaw)
		? auditRaw
		: (auditRaw?.results ?? []);

	const pendingLeave = leave.filter((l: any) => l.status === "pending");
	const approvedLeave = leave.filter((l: any) => l.status === "approved");
	const activeAttachees = attachees.filter((a: any) => a.is_active);

	const filteredAttachees = attachees.filter(
		(a: any) =>
			!search ||
			a.full_name?.toLowerCase().includes(search.toLowerCase()) ||
			a.email?.toLowerCase().includes(search.toLowerCase()) ||
			a.department_name?.toLowerCase().includes(search.toLowerCase()),
	);
	const filteredStaff = nonAttacheeStaff.filter(
		(s: any) =>
			!staffSearch ||
			s.full_name?.toLowerCase().includes(staffSearch.toLowerCase()) ||
			s.email?.toLowerCase().includes(staffSearch.toLowerCase()) ||
			s.role?.toLowerCase().includes(staffSearch.toLowerCase()),
	);
	const filteredViolations = violations.filter(
		(v: any) =>
			violationFilter === "all" || v.violation_type === violationFilter,
	);

	// ── Leave review ──────────────────────────────────────────────────────────
	const reviewLeaveMutation = useMutation({
		mutationFn: ({ id, data }: any) => attendanceApi.reviewLeave(id, data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["leave-requests"] });
			toast.success("Leave request updated");
			setReviewLeave(null);
		},
		onError: () => toast.error("Update failed"),
	});

	const handleLeaveReview = async (
		id: string,
		status: string,
		comment: string,
	) => {
		reviewLeaveMutation.mutate({
			id,
			data: { status, ...(comment && { review_comment: comment }) },
		});
	};

	return (
		<div className="space-y-6 animate-fade-in">
			{/* ── Modals ── */}
			<OnboardAttacheeModal
				open={showOnboard}
				onClose={() => setShowOnboard(false)}
				departments={depts}
				branches={branches}
				organisationId={user?.organisation}
			/>
			<AddStaffModal
				open={showAddStaff}
				onClose={() => setShowAddStaff(false)}
				departments={depts}
				branches={branches}
				organisationId={user?.organisation}
			/>
			<ViewAttacheeModal
				attachee={viewAttachee}
				onClose={() => setViewAttachee(null)}
			/>
			<LeaveReviewModal
				req={reviewLeave}
				onClose={() => setReviewLeave(null)}
				onReview={handleLeaveReview}
			/>
			<NewEvaluationModal
				open={showNewEval}
				onClose={() => setShowNewEval(false)}
				attachees={attachees}
			/>
			<AddDepartmentModal
				open={showAddDept}
				onClose={() => setShowAddDept(false)}
				organisationId={user?.organisation}
			/>
			<AddBranchModal
				open={showAddBranch}
				onClose={() => setShowAddBranch(false)}
				organisationId={user?.organisation}
			/>
			<AddRecruitmentModal
				open={showRecruitment}
				onClose={() => setShowRecruitment(false)}
				departments={depts}
			/>
			<GenerateCertModal
				open={showGenCert}
				onClose={() => setShowGenCert(false)}
				attachees={attachees}
			/>
			<BulkImportModal
				open={showBulkImport}
				onClose={() => setShowBulkImport(false)}
			/>
			{orgRaw && (
				<OrgSettingsModal
					open={showOrgSettings}
					onClose={() => setShowOrgSettings(false)}
					org={orgRaw}
				/>
			)}

			{/* ── Header ── */}
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<Users size={22} className="text-nexus-400" /> HR Management
					</h1>
					<p className="page-subtitle">
						People · leave · departments · branches · recruitment · training ·
						stipends · compliance
					</p>
				</div>
				<div className="flex gap-2 flex-wrap">
					<button
						className="btn-secondary btn-sm"
						onClick={() => setShowBulkImport(true)}>
						<Upload size={13} /> Bulk Import
					</button>
					<button
						className="btn-secondary btn-sm"
						onClick={() => setShowAddStaff(true)}>
						<UserPlus size={13} /> Add Staff
					</button>
					<button
						className="btn-primary btn-sm"
						onClick={() => setShowOnboard(true)}>
						<GraduationCap size={13} /> Onboard Attachee
					</button>
				</div>
			</div>

			{/* ── Tabs ── */}
			<div className="flex gap-1 p-1 bg-surface-card border border-surface-border rounded-xl flex-wrap">
				{TABS.map(({ key, label, icon: Icon }) => (
					<button
						key={key}
						onClick={() => setActiveTab(key)}
						className={clsx(
							"px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5",
							activeTab === key
								? "bg-nexus-600 text-white"
								: "text-slate-400 hover:text-white",
						)}>
						<Icon size={11} />
						{label}
						{key === "leave" && pendingLeave.length > 0 && (
							<span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500 text-black">
								{pendingLeave.length}
							</span>
						)}
					</button>
				))}
			</div>

			{/* ═══════════════════════════════════════════════════════════════════ */}
			{/* OVERVIEW */}
			{/* ═══════════════════════════════════════════════════════════════════ */}
			{activeTab === "overview" && (
				<div className="space-y-5">
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
						{[
							{
								label: "Total Staff",
								value: userStats?.total_users ?? "—",
								color: "text-white",
								icon: Users,
							},
							{
								label: "Active Attachees",
								value: activeAttachees.length,
								color: "text-green-400",
								icon: GraduationCap,
							},
							{
								label: "Pending Leave",
								value: pendingLeave.length,
								color: "text-amber-400",
								icon: Clock,
							},
							{
								label: "Departments",
								value: depts.length || userStats?.by_department?.length || "—",
								color: "text-nexus-400",
								icon: Building2,
							},
						].map(({ label, value, color, icon: Icon }) => (
							<div key={label} className="stat-card">
								<Icon size={18} className={color} />
								<div className={clsx("stat-value", color)}>{value}</div>
								<div className="stat-label">{label}</div>
							</div>
						))}
					</div>
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
						{[
							{
								label: "New Evaluation",
								icon: ClipboardList,
								action: () => setShowNewEval(true),
							},
							{
								label: "Add Department",
								icon: Building2,
								action: () => setShowAddDept(true),
							},
							{
								label: "New Recruitment",
								icon: UserPlus,
								action: () => setShowRecruitment(true),
							},
							{
								label: "Generate Certificate",
								icon: Award,
								action: () => setShowGenCert(true),
							},
						].map(({ label, icon: Icon, action }) => (
							<button
								key={label}
								onClick={action}
								className="card flex items-center gap-3 text-left hover:border-nexus-500/30 transition-all p-4">
								<Icon size={16} className="text-nexus-400 shrink-0" />
								<span className="text-sm font-medium text-white">{label}</span>
							</button>
						))}
					</div>
					{userStats?.by_role && (
						<div className="card">
							<h3 className="font-semibold text-white mb-4">Staff by Role</h3>
							<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
								{Object.entries(userStats.by_role).map(([role, count]: any) => (
									<div
										key={role}
										className="p-3 bg-surface rounded-xl border border-surface-border">
										<div className="text-xl font-bold text-white">{count}</div>
										<div className="text-xs text-slate-500 mt-0.5 capitalize">
											{role.replace(/_/g, " ")}
										</div>
									</div>
								))}
							</div>
						</div>
					)}
					<div className="card">
						<div className="flex items-center justify-between mb-4">
							<h3 className="font-semibold text-white">Recent Attachees</h3>
							<button
								onClick={() => setActiveTab("attachees")}
								className="btn-ghost btn-sm text-xs">
								View all
							</button>
						</div>
						<table className="data-table">
							<thead>
								<tr>
									<th>Name</th>
									<th>Department</th>
									<th>Status</th>
									<th>Joined</th>
								</tr>
							</thead>
							<tbody>
								{attachees.slice(0, 6).map((a: any) => (
									<tr
										key={a.id}
										className="cursor-pointer hover:bg-surface/50"
										onClick={() => setViewAttachee(a)}>
										<td>
											<div className="flex items-center gap-2">
												<div className="w-7 h-7 rounded-full bg-nexus-600/20 flex items-center justify-center text-xs font-bold text-nexus-400">
													{a.full_name
														?.split(" ")
														.map((n: string) => n[0])
														.join("")
														.slice(0, 2)}
												</div>
												<div>
													<div className="text-sm font-medium text-white">
														{a.full_name}
													</div>
													<div className="text-xs text-slate-500">
														{a.email}
													</div>
												</div>
											</div>
										</td>
										<td className="text-slate-400 text-sm">
											{a.department_name || "—"}
										</td>
										<td>
											<span
												className={clsx(
													"badge",
													a.is_active ? "badge-green" : "badge-slate",
												)}>
												{a.is_active ? "Active" : "Inactive"}
											</span>
										</td>
										<td className="text-slate-400 text-xs">
											{a.date_joined
												? format(parseISO(a.date_joined), "dd MMM yyyy")
												: "—"}
										</td>
									</tr>
								))}
								{attachees.length === 0 && (
									<tr>
										<td colSpan={4} className="text-center py-8 text-slate-500">
											No attachees —{" "}
											<button
												onClick={() => setShowOnboard(true)}
												className="text-nexus-400 hover:underline">
												onboard one
											</button>
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* ═══════════════════════════════════════════════════════════════════ */}
			{/* ATTACHEES */}
			{/* ═══════════════════════════════════════════════════════════════════ */}
			{activeTab === "attachees" && (
				<div className="card">
					<div className="flex items-center gap-3 mb-5">
						<div className="relative flex-1">
							<Search
								size={13}
								className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
							/>
							<input
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search by name, email or department…"
								className="input pl-8 py-2"
							/>
						</div>
						<button
							className="btn-secondary btn-sm"
							onClick={() =>
								exportToCSV(
									filteredAttachees.map((a: any) => ({
										name: a.full_name,
										email: a.email,
										department: a.department_name || "",
										branch: a.branch_name || "",
										status: a.is_active ? "Active" : "Inactive",
										joined: a.date_joined
											? format(parseISO(a.date_joined), "dd MMM yyyy")
											: "",
										institution: a.institution || "",
									})),
									"attachees.csv",
								)
							}>
							<Download size={13} /> Export
						</button>
					</div>
					<table className="data-table">
						<thead>
							<tr>
								<th>Name</th>
								<th>Email</th>
								<th>Department</th>
								<th>Branch</th>
								<th>Institution</th>
								<th>Status</th>
								<th>Joined</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{filteredAttachees.map((a: any) => (
								<tr key={a.id}>
									<td className="font-medium text-white text-sm">
										{a.full_name}
									</td>
									<td className="text-slate-400 text-xs">{a.email}</td>
									<td className="text-slate-400 text-sm">
										{a.department_name || "—"}
									</td>
									<td className="text-slate-400 text-sm">
										{a.branch_name || "—"}
									</td>
									<td className="text-slate-400 text-xs">
										{a.institution || "—"}
									</td>
									<td>
										<span
											className={clsx(
												"badge",
												a.is_active ? "badge-green" : "badge-slate",
											)}>
											{a.is_active ? "Active" : "Inactive"}
										</span>
									</td>
									<td className="text-slate-400 text-xs">
										{a.date_joined
											? format(parseISO(a.date_joined), "dd MMM yyyy")
											: "—"}
									</td>
									<td>
										<button
											className="btn-ghost btn-sm p-1.5"
											title="View profile"
											onClick={() => setViewAttachee(a)}>
											<Eye size={13} />
										</button>
									</td>
								</tr>
							))}
							{filteredAttachees.length === 0 && (
								<tr>
									<td colSpan={8} className="text-center py-10 text-slate-500">
										{search
											? `No results for "${search}"`
											: "No attachees found"}
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			)}

			{/* ═══════════════════════════════════════════════════════════════════ */}
			{/* STAFF (non-attachee) */}
			{/* ═══════════════════════════════════════════════════════════════════ */}
			{activeTab === "staff" && (
				<div className="card">
					<div className="flex items-center gap-3 mb-5">
						<div className="relative flex-1">
							<Search
								size={13}
								className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
							/>
							<input
								value={staffSearch}
								onChange={(e) => setStaffSearch(e.target.value)}
								placeholder="Search by name, email or role…"
								className="input pl-8 py-2"
							/>
						</div>
						<button
							className="btn-secondary btn-sm"
							onClick={() =>
								exportToCSV(
									filteredStaff.map((s: any) => ({
										name: s.full_name,
										email: s.email,
										role: s.role_display || s.role,
										department: s.department_name || "",
										branch: s.branch_name || "",
										status: s.is_active ? "Active" : "Inactive",
									})),
									"staff.csv",
								)
							}>
							<Download size={13} /> Export
						</button>
						<button
							className="btn-primary btn-sm"
							onClick={() => setShowAddStaff(true)}>
							<UserPlus size={13} /> Add Staff
						</button>
					</div>
					<table className="data-table">
						<thead>
							<tr>
								<th>Name</th>
								<th>Email</th>
								<th>Role</th>
								<th>Department</th>
								<th>Branch</th>
								<th>Status</th>
								<th>Joined</th>
							</tr>
						</thead>
						<tbody>
							{filteredStaff.map((s: any) => (
								<tr key={s.id}>
									<td>
										<div className="flex items-center gap-2">
											<div className="w-7 h-7 rounded-full bg-nexus-600/20 flex items-center justify-center text-xs font-bold text-nexus-400">
												{s.full_name
													?.split(" ")
													.map((n: string) => n[0])
													.join("")
													.slice(0, 2)}
											</div>
											<div>
												<div className="text-sm font-medium text-white">
													{s.full_name}
												</div>
												<div className="text-xs text-slate-500">
													{s.employee_id || ""}
												</div>
											</div>
										</div>
									</td>
									<td className="text-slate-400 text-xs">{s.email}</td>
									<td>
										<span className="badge-blue text-[10px] capitalize">
											{s.role_display || s.role?.replace(/_/g, " ") || "—"}
										</span>
									</td>
									<td className="text-slate-400 text-sm">
										{s.department_name || "—"}
									</td>
									<td className="text-slate-400 text-sm">
										{s.branch_name || "—"}
									</td>
									<td>
										<span
											className={clsx(
												"badge",
												s.is_active ? "badge-green" : "badge-slate",
											)}>
											{s.is_active ? "Active" : "Inactive"}
										</span>
									</td>
									<td className="text-slate-400 text-xs">
										{s.date_joined
											? format(parseISO(s.date_joined), "dd MMM yyyy")
											: "—"}
									</td>
								</tr>
							))}
							{filteredStaff.length === 0 && (
								<tr>
									<td colSpan={7} className="text-center py-10 text-slate-500">
										{staffSearch
											? `No results for "${staffSearch}"`
											: "No staff found"}
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			)}

			{/* ═══════════════════════════════════════════════════════════════════ */}
			{/* LEAVE — with review eye button + reviewed-by details */}
			{/* ═══════════════════════════════════════════════════════════════════ */}
			{activeTab === "leave" && (
				<div className="space-y-4">
					<div className="grid grid-cols-3 gap-4">
						{[
							{
								label: "Pending",
								value: pendingLeave.length,
								color: "text-amber-400",
							},
							{
								label: "Approved",
								value: approvedLeave.length,
								color: "text-green-400",
							},
							{ label: "Total", value: leave.length, color: "text-white" },
						].map(({ label, value, color }) => (
							<div key={label} className="stat-card text-center">
								<div className={clsx("stat-value", color)}>{value}</div>
								<div className="stat-label">{label}</div>
							</div>
						))}
					</div>
					<div className="card">
						<table className="data-table">
							<thead>
								<tr>
									<th>Employee</th>
									<th>Type</th>
									<th>Period</th>
									<th>Days</th>
									<th>Status</th>
									<th>Reviewed By</th>
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{leave.length === 0 ? (
									<tr>
										<td
											colSpan={7}
											className="text-center py-10 text-slate-500">
											No leave requests
										</td>
									</tr>
								) : (
									leave.map((req: any) => (
										<tr key={req.id}>
											<td className="font-medium text-white text-sm">
												{req.user_name || req.user_full_name || "—"}
											</td>
											<td>
												<span className="badge-slate text-[10px] capitalize">
													{req.leave_type?.replace(/_/g, " ")}
												</span>
											</td>
											<td className="text-slate-400 text-xs">
												{req.start_date &&
													format(parseISO(req.start_date), "dd MMM")}{" "}
												→{" "}
												{req.end_date &&
													format(parseISO(req.end_date), "dd MMM yyyy")}
											</td>
											<td className="text-white font-medium">
												{req.days_requested}
											</td>
											<td>
												<span
													className={clsx("badge text-[10px]", {
														"badge-amber": req.status === "pending",
														"badge-green": req.status === "approved",
														"badge-red": req.status === "rejected",
														"badge-slate": req.status === "cancelled",
													})}>
													{req.status}
												</span>
											</td>
											<td className="text-slate-400 text-xs">
												{req.reviewed_by_name || req.approved_by_name ? (
													<span className="text-white">
														{req.reviewed_by_name || req.approved_by_name}
													</span>
												) : (
													"—"
												)}
											</td>
											<td>
												{/* Eye always visible to see details + reviewed-by */}
												<button
													className="btn-ghost btn-sm p-1.5 mr-1"
													title="View details"
													onClick={() => setReviewLeave(req)}>
													<Eye size={13} />
												</button>
												{req.status === "pending" && (
													<>
														<button
															onClick={() =>
																reviewLeaveMutation.mutate({
																	id: req.id,
																	data: { status: "approved" },
																})
															}
															title="Approve"
															className="btn-success btn-sm p-1.5 mr-1">
															<CheckCircle size={12} />
														</button>
														<button
															onClick={() =>
																reviewLeaveMutation.mutate({
																	id: req.id,
																	data: { status: "rejected" },
																})
															}
															title="Reject"
															className="btn-danger btn-sm p-1.5">
															<XCircle size={12} />
														</button>
													</>
												)}
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* ═══════════════════════════════════════════════════════════════════ */}
			{/* EVALUATIONS */}
			{/* ═══════════════════════════════════════════════════════════════════ */}
			{activeTab === "evaluations" && (
				<div className="card">
					<div className="flex items-center justify-between mb-5">
						<h3 className="font-semibold text-white">All Evaluations</h3>
						<button
							className="btn-primary btn-sm"
							onClick={() => setShowNewEval(true)}>
							<Plus size={13} /> New Evaluation
						</button>
					</div>
					<table className="data-table">
						<thead>
							<tr>
								<th>Attachee</th>
								<th>Type</th>
								<th>Period</th>
								<th>Score</th>
								<th>Evaluator</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{evals.length === 0 ? (
								<tr>
									<td colSpan={6} className="text-center py-10 text-slate-500">
										No evaluations —{" "}
										<button
											onClick={() => setShowNewEval(true)}
											className="text-nexus-400 hover:underline">
											create one
										</button>
									</td>
								</tr>
							) : (
								evals.map((ev: any) => (
									<tr key={ev.id}>
										<td className="font-medium text-white text-sm">
											{ev.attachee_name || "—"}
										</td>
										<td>
											<span className="badge-blue text-[10px] capitalize">
												{ev.template?.evaluation_type ||
													ev.evaluation_type ||
													"evaluation"}
											</span>
										</td>
										<td className="text-slate-400 text-xs">
											{ev.period_start &&
												format(parseISO(ev.period_start), "dd MMM")}{" "}
											–{" "}
											{ev.period_end &&
												format(parseISO(ev.period_end), "dd MMM yyyy")}
										</td>
										<td>
											{ev.percentage ? (
												<span
													className={clsx("font-bold text-sm", {
														"text-green-400": parseFloat(ev.percentage) >= 75,
														"text-amber-400": parseFloat(ev.percentage) >= 50,
														"text-red-400": parseFloat(ev.percentage) < 50,
													})}>
													{ev.percentage}%
												</span>
											) : (
												"—"
											)}
										</td>
										<td className="text-slate-400 text-sm">
											{ev.evaluator_name || "—"}
										</td>
										<td>
											<span
												className={clsx("badge text-[10px]", {
													"badge-amber": ev.status === "pending",
													"badge-blue": ev.status === "in_progress",
													"badge-green": ev.status === "completed",
												})}>
												{ev.status}
											</span>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			)}

			{/* ═══════════════════════════════════════════════════════════════════ */}
			{/* DEPARTMENTS */}
			{/* ═══════════════════════════════════════════════════════════════════ */}
			{activeTab === "departments" && (
				<div className="space-y-4">
					<div className="flex justify-end">
						<button
							className="btn-primary btn-sm"
							onClick={() => setShowAddDept(true)}>
							<Plus size={13} /> Add Department
						</button>
					</div>
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{depts.length === 0 ? (
							<div className="col-span-3 card text-center py-12 text-slate-500">
								No departments —{" "}
								<button
									onClick={() => setShowAddDept(true)}
									className="text-nexus-400 hover:underline">
									add one
								</button>
							</div>
						) : (
							depts.map((d: any) => (
								<div
									key={d.id}
									className="card hover:border-nexus-500/30 transition-all">
									<div className="flex items-center justify-between mb-2">
										<div>
											<h3 className="font-semibold text-white">{d.name}</h3>
											{d.code && (
												<span className="text-[10px] font-mono text-slate-500">
													{d.code}
												</span>
											)}
										</div>
										<span
											className={clsx(
												"badge text-[10px]",
												d.is_active ? "badge-green" : "badge-slate",
											)}>
											{d.is_active ? "Active" : "Inactive"}
										</span>
									</div>
									<p className="text-xs text-slate-500 mb-3">
										{d.description || "No description"}
									</p>
									<div className="flex items-center justify-between text-xs">
										<span className="text-slate-400">
											{d.user_count || 0} members
										</span>
										{d.branch_name && (
											<span className="text-slate-500">{d.branch_name}</span>
										)}
									</div>
								</div>
							))
						)}
					</div>
				</div>
			)}

			{/* ═══════════════════════════════════════════════════════════════════ */}
			{/* BRANCHES */}
			{/* ═══════════════════════════════════════════════════════════════════ */}
			{activeTab === "branches" && (
				<div className="space-y-4">
					<div className="flex justify-end">
						<button
							className="btn-primary btn-sm"
							onClick={() => setShowAddBranch(true)}>
							<Plus size={13} /> Add Branch
						</button>
					</div>
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{branches.length === 0 ? (
							<div className="col-span-3 card text-center py-12 text-slate-500">
								No branches —{" "}
								<button
									onClick={() => setShowAddBranch(true)}
									className="text-nexus-400 hover:underline">
									add one
								</button>
							</div>
						) : (
							branches.map((b: any) => (
								<div
									key={b.id}
									className="card hover:border-nexus-500/30 transition-all">
									<div className="flex items-center justify-between mb-2">
										<div>
											<h3 className="font-semibold text-white">{b.name}</h3>
											{b.code && (
												<span className="text-[10px] font-mono text-slate-500">
													{b.code}
												</span>
											)}
										</div>
										<span
											className={clsx(
												"badge text-[10px]",
												b.is_active ? "badge-green" : "badge-slate",
											)}>
											{b.is_active ? "Active" : "Inactive"}
										</span>
									</div>
									{b.location && (
										<div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
											<MapPin size={10} /> {b.location}
										</div>
									)}
									{b.contact_phone && (
										<div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
											<Phone size={10} /> {b.contact_phone}
										</div>
									)}
									<div className="text-xs text-slate-500">
										{b.department_count || 0} departments · {b.user_count || 0}{" "}
										staff
									</div>
								</div>
							))
						)}
					</div>
				</div>
			)}

			{/* ═══════════════════════════════════════════════════════════════════ */}
			{/* RECRUITMENT */}
			{/* ═══════════════════════════════════════════════════════════════════ */}
			{activeTab === "recruitment" && (
				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<h3 className="font-semibold text-white">
							Internship & Attachee Programs
						</h3>
						<button
							className="btn-primary btn-sm"
							onClick={() => setShowRecruitment(true)}>
							<Plus size={13} /> New Posting
						</button>
					</div>
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{recruitment.length === 0 ? (
							<div className="col-span-3 card text-center py-12 text-slate-500">
								No postings —{" "}
								<button
									onClick={() => setShowRecruitment(true)}
									className="text-nexus-400 hover:underline">
									create one
								</button>
							</div>
						) : (
							recruitment.map((r: any) => (
								<div
									key={r.id}
									className="card hover:border-nexus-500/30 transition-all">
									<div className="flex items-center justify-between mb-2">
										<h3 className="font-semibold text-white text-sm">
											{r.title || r.name || "Program"}
										</h3>
										<span
											className={clsx(
												"badge text-[10px]",
												r.is_active ? "badge-green" : "badge-slate",
											)}>
											{r.is_active ? "Open" : "Closed"}
										</span>
									</div>
									{r.department_name && (
										<div className="text-xs text-slate-400 mb-1">
											<Building2 size={10} className="inline mr-1" />
											{r.department_name}
										</div>
									)}
									{r.start_date && (
										<div className="text-xs text-slate-500">
											{format(parseISO(r.start_date), "dd MMM yyyy")} →{" "}
											{r.end_date
												? format(parseISO(r.end_date), "dd MMM yyyy")
												: "Ongoing"}
										</div>
									)}
									{r.slots && (
										<div className="text-xs text-nexus-400 mt-2 font-medium">
											{r.slots} slot{r.slots !== 1 ? "s" : ""}
										</div>
									)}
									{r.description && (
										<p className="text-xs text-slate-500 mt-2 line-clamp-2">
											{r.description}
										</p>
									)}
								</div>
							))
						)}
					</div>
				</div>
			)}

			{/* ═══════════════════════════════════════════════════════════════════ */}
			{/* TRAINING */}
			{/* ═══════════════════════════════════════════════════════════════════ */}
			{activeTab === "training" && (
				<div className="space-y-4">
					<div className="card">
						<div className="flex items-center justify-between mb-5">
							<div>
								<h3 className="font-semibold text-white">
									Training & Development
								</h3>
								<p className="text-xs text-slate-500 mt-0.5">
									Induction schedules, skills workshops, and compliance training
								</p>
							</div>
						</div>
						<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
							{[
								{
									label: "Induction Sessions",
									desc: "Onboarding orientation for new attachees",
									icon: BookOpen,
									color: "text-nexus-400",
								},
								{
									label: "Skills Workshops",
									desc: "Technical and soft-skills training programmes",
									icon: TrendingUp,
									color: "text-green-400",
								},
								{
									label: "Compliance Training",
									desc: "Mandatory HR, safety, and policy modules",
									icon: Shield,
									color: "text-amber-400",
								},
							].map(({ label, desc, icon: Icon, color }) => (
								<div
									key={label}
									className="p-4 bg-surface rounded-xl border border-surface-border hover:border-nexus-500/30 transition-all cursor-pointer">
									<Icon size={18} className={clsx(color, "mb-2")} />
									<div className="text-sm font-semibold text-white mb-1">
										{label}
									</div>
									<div className="text-xs text-slate-500">{desc}</div>
								</div>
							))}
						</div>
						<div className="p-4 border border-dashed border-surface-border rounded-xl text-center text-slate-500 text-sm">
							Training module integration coming soon — connect your LMS or
							upload training records manually.
						</div>
					</div>
					<div className="card">
						<h3 className="font-semibold text-white mb-4">
							Pending Inductions
						</h3>
						<table className="data-table">
							<thead>
								<tr>
									<th>Attachee</th>
									<th>Department</th>
									<th>Joined</th>
									<th>Induction Status</th>
								</tr>
							</thead>
							<tbody>
								{activeAttachees.slice(0, 8).map((a: any) => (
									<tr key={a.id}>
										<td className="font-medium text-white text-sm">
											{a.full_name}
										</td>
										<td className="text-slate-400 text-sm">
											{a.department_name || "—"}
										</td>
										<td className="text-slate-400 text-xs">
											{a.date_joined
												? format(parseISO(a.date_joined), "dd MMM yyyy")
												: "—"}
										</td>
										<td>
											<span className="badge-amber text-[10px]">Pending</span>
										</td>
									</tr>
								))}
								{activeAttachees.length === 0 && (
									<tr>
										<td colSpan={4} className="text-center py-8 text-slate-500">
											No active attachees
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* ═══════════════════════════════════════════════════════════════════ */}
			{/* STIPENDS */}
			{/* ═══════════════════════════════════════════════════════════════════ */}
			{activeTab === "stipends" && (
				<div className="space-y-4">
					<div className="grid grid-cols-3 gap-4">
						{[
							{
								label: "Total Processed",
								value: stipends.filter((s: any) => s.status === "paid").length,
								color: "text-green-400",
							},
							{
								label: "Pending Approval",
								value: stipends.filter((s: any) => s.status === "pending")
									.length,
								color: "text-amber-400",
							},
							{
								label: "This Month",
								value: stipends.filter((s: any) => {
									try {
										return (
											new Date(s.payment_date).getMonth() ===
											new Date().getMonth()
										);
									} catch {
										return false;
									}
								}).length,
								color: "text-nexus-400",
							},
						].map(({ label, value, color }) => (
							<div key={label} className="stat-card text-center">
								<div className={clsx("stat-value", color)}>{value}</div>
								<div className="stat-label">{label}</div>
							</div>
						))}
					</div>
					<div className="card">
						<div className="flex items-center justify-between mb-4">
							<h3 className="font-semibold text-white">Stipend Records</h3>
							<button
								className="btn-secondary btn-sm"
								onClick={() =>
									exportToCSV(
										stipends.map((s: any) => ({
											recipient: s.user_name || s.recipient_name || "",
											amount: s.amount,
											status: s.status,
											period: s.period || "",
											payment_date: s.payment_date || "",
										})),
										"stipends.csv",
									)
								}>
								<Download size={13} /> Export
							</button>
						</div>
						<table className="data-table">
							<thead>
								<tr>
									<th>Recipient</th>
									<th>Amount</th>
									<th>Period</th>
									<th>Payment Date</th>
									<th>Status</th>
								</tr>
							</thead>
							<tbody>
								{stipends.length === 0 ? (
									<tr>
										<td
											colSpan={5}
											className="text-center py-10 text-slate-500">
											No stipend records found
										</td>
									</tr>
								) : (
									stipends.map((s: any) => (
										<tr key={s.id}>
											<td className="font-medium text-white text-sm">
												{s.user_name || s.recipient_name || "—"}
											</td>
											<td className="text-white font-medium">
												KES {Number(s.amount || 0).toLocaleString()}
											</td>
											<td className="text-slate-400 text-sm">
												{s.period || "—"}
											</td>
											<td className="text-slate-400 text-xs">
												{s.payment_date
													? format(parseISO(s.payment_date), "dd MMM yyyy")
													: "—"}
											</td>
											<td>
												<span
													className={clsx("badge text-[10px]", {
														"badge-green": s.status === "paid",
														"badge-amber": s.status === "pending",
														"badge-red": s.status === "failed",
													})}>
													{s.status}
												</span>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* ═══════════════════════════════════════════════════════════════════ */}
			{/* VIOLATIONS */}
			{/* ═══════════════════════════════════════════════════════════════════ */}
			{activeTab === "violations" && (
				<div className="card">
					<div className="flex items-center justify-between mb-4">
						<h3 className="font-semibold text-white">Attendance Violations</h3>
						<div className="flex items-center gap-2">
							<Filter size={13} className="text-slate-400" />
							<select
								value={violationFilter}
								onChange={(e) => setViolationFilter(e.target.value)}
								className="input py-1.5 text-xs w-40">
								<option value="all">All types</option>
								<option value="late">Late arrival</option>
								<option value="absent">Absent</option>
								<option value="early_leave">Early leave</option>
								<option value="no_checkout">No checkout</option>
							</select>
						</div>
					</div>
					<table className="data-table">
						<thead>
							<tr>
								<th>Employee</th>
								<th>Type</th>
								<th>Date</th>
								<th>Details</th>
								<th>Severity</th>
							</tr>
						</thead>
						<tbody>
							{filteredViolations.length === 0 ? (
								<tr>
									<td colSpan={5} className="text-center py-10 text-slate-500">
										No violations recorded
									</td>
								</tr>
							) : (
								filteredViolations.map((v: any) => (
									<tr key={v.id}>
										<td className="font-medium text-white text-sm">
											{v.user_name || "—"}
										</td>
										<td>
											<span className="badge-slate text-[10px] capitalize">
												{v.violation_type?.replace(/_/g, " ") || "—"}
											</span>
										</td>
										<td className="text-slate-400 text-xs">
											{v.date ? format(parseISO(v.date), "dd MMM yyyy") : "—"}
										</td>
										<td className="text-slate-400 text-xs max-w-xs truncate">
											{v.details || v.notes || "—"}
										</td>
										<td>
											<span
												className={clsx("badge text-[10px]", {
													"badge-red": v.severity === "high",
													"badge-amber": v.severity === "medium",
													"badge-slate": !v.severity || v.severity === "low",
												})}>
												{v.severity || "low"}
											</span>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			)}

			{/* ═══════════════════════════════════════════════════════════════════ */}
			{/* CERTIFICATES */}
			{/* ═══════════════════════════════════════════════════════════════════ */}
			{activeTab === "certificates" && (
				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<h3 className="font-semibold text-white">Certificates Issued</h3>
						<button
							className="btn-primary btn-sm"
							onClick={() => setShowGenCert(true)}>
							<Award size={13} /> Generate Certificate
						</button>
					</div>
					<div className="card">
						<table className="data-table">
							<thead>
								<tr>
									<th>Recipient</th>
									<th>Type</th>
									<th>Issued</th>
									<th>Verify Code</th>
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{certs.length === 0 ? (
									<tr>
										<td
											colSpan={5}
											className="text-center py-10 text-slate-500">
											No certificates yet —{" "}
											<button
												onClick={() => setShowGenCert(true)}
												className="text-nexus-400 hover:underline">
												generate one
											</button>
										</td>
									</tr>
								) : (
									certs.map((c: any) => (
										<tr key={c.id}>
											<td className="font-medium text-white text-sm">
												{c.user_name || c.recipient_name || "—"}
											</td>
											<td>
												<span className="badge-blue text-[10px]">
													{CERT_TYPES.find(
														(t) => t.value === c.certificate_type,
													)?.label ||
														c.certificate_type?.replace(/_/g, " ") ||
														"Completion"}
												</span>
											</td>
											<td className="text-slate-400 text-xs">
												{c.issued_date
													? format(parseISO(c.issued_date), "dd MMM yyyy")
													: "—"}
											</td>
											<td className="font-mono text-xs text-slate-400">
												{c.verify_code || "—"}
											</td>
											<td>
												<button
													className="btn-ghost btn-sm p-1.5"
													title="Download"
													onClick={() =>
														certificatesApi.download(c.id).then((r: any) => {
															const url = URL.createObjectURL(r.data);
															const a = document.createElement("a");
															a.href = url;
															a.download = `certificate-${c.id}.pdf`;
															a.click();
															URL.revokeObjectURL(url);
														})
													}>
													<Download size={13} />
												</button>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* ═══════════════════════════════════════════════════════════════════ */}
			{/* AUDIT LOG */}
			{/* ═══════════════════════════════════════════════════════════════════ */}
			{activeTab === "audit" && (
				<div className="card">
					<div className="flex items-center justify-between mb-4">
						<h3 className="font-semibold text-white">Audit Log</h3>
						<div className="flex items-center gap-2">
							<div className="relative">
								<Search
									size={13}
									className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
								/>
								<input
									value={auditFilter}
									onChange={(e) => setAuditFilter(e.target.value)}
									onKeyDown={(e) => e.key === "Enter" && refetchAudit()}
									placeholder="Search actions…"
									className="input pl-8 py-1.5 text-xs w-48"
								/>
							</div>
							<button
								onClick={() => refetchAudit()}
								className="btn-secondary btn-sm p-1.5"
								title="Refresh">
								<RefreshCw size={13} />
							</button>
							<button
								onClick={() =>
									exportToCSV(
										auditLogs.map((l: any) => ({
											user: l.user_email || l.user || "",
											action: l.action || "",
											resource: l.resource_type || "",
											timestamp: l.timestamp || "",
											ip: l.ip_address || "",
										})),
										"audit-log.csv",
									)
								}
								className="btn-secondary btn-sm">
								<Download size={13} /> Export
							</button>
						</div>
					</div>
					<table className="data-table">
						<thead>
							<tr>
								<th>User</th>
								<th>Action</th>
								<th>Resource</th>
								<th>Timestamp</th>
								<th>IP</th>
							</tr>
						</thead>
						<tbody>
							{auditLogs.length === 0 ? (
								<tr>
									<td colSpan={5} className="text-center py-10 text-slate-500">
										No audit records found
									</td>
								</tr>
							) : (
								auditLogs.map((log: any, i: number) => (
									<tr key={log.id ?? i}>
										<td className="text-sm text-white">
											{log.user_email || log.user || "—"}
										</td>
										<td>
											<span
												className={clsx("badge text-[10px]", {
													"badge-red": ["delete", "deactivate", "reject"].some(
														(k) => log.action?.toLowerCase().includes(k),
													),
													"badge-green": ["create", "approve", "enable"].some(
														(k) => log.action?.toLowerCase().includes(k),
													),
													"badge-blue": ["update", "edit", "patch"].some((k) =>
														log.action?.toLowerCase().includes(k),
													),
													"badge-slate": true,
												})}>
												{log.action || "—"}
											</span>
										</td>
										<td className="text-slate-400 text-xs capitalize">
											{log.resource_type?.replace(/_/g, " ") ||
												log.model ||
												"—"}
										</td>
										<td className="text-slate-400 text-xs">
											{log.timestamp
												? format(parseISO(log.timestamp), "dd MMM yyyy HH:mm")
												: "—"}
										</td>
										<td className="font-mono text-xs text-slate-500">
											{log.ip_address || "—"}
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			)}

			{/* ═══════════════════════════════════════════════════════════════════ */}
			{/* ORG SETTINGS — with HR Policy Defaults editable */}
			{/* ═══════════════════════════════════════════════════════════════════ */}
			{activeTab === "settings" && (
				<div className="space-y-4">
					{orgRaw ? (
						<>
							<div className="card">
								<div className="flex items-center justify-between mb-5">
									<h3 className="font-semibold text-white">
										Organisation Details
									</h3>
									<button
										className="btn-primary btn-sm"
										onClick={() => setShowOrgSettings(true)}>
										<Edit2 size={13} /> Edit Settings
									</button>
								</div>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
									{[
										{ label: "Name", value: orgRaw.name },
										{ label: "Code", value: orgRaw.code || "—" },
										{
											label: "Contact Email",
											value: orgRaw.contact_email || "—",
										},
										{
											label: "Contact Phone",
											value: orgRaw.contact_phone || "—",
										},
										{ label: "Address", value: orgRaw.address || "—" },
										{ label: "Website", value: orgRaw.website || "—" },
									].map(({ label, value }) => (
										<div
											key={label}
											className="p-3 bg-surface rounded-xl border border-surface-border">
											<div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
												{label}
											</div>
											<div className="text-sm text-white font-medium">
												{value}
											</div>
										</div>
									))}
								</div>
								{orgRaw.mission && (
									<div className="mt-4 p-3 bg-surface rounded-xl border border-surface-border">
										<div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
											Mission Statement
										</div>
										<p className="text-sm text-slate-300">{orgRaw.mission}</p>
									</div>
								)}
							</div>

							<div className="card">
								<div className="flex items-center justify-between mb-4">
									<h3 className="font-semibold text-white">
										HR Policy Defaults
									</h3>
									<button
										className="btn-secondary btn-sm"
										onClick={() => setShowOrgSettings(true)}>
										<Edit2 size={13} /> Edit Policies
									</button>
								</div>
								<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
									{[
										{
											label: "Annual Leave Days",
											value: orgRaw.annual_leave_days ?? "—",
										},
										{
											label: "Sick Leave Days",
											value: orgRaw.sick_leave_days ?? "—",
										},
										{
											label: "Maternity Leave Days",
											value: orgRaw.maternity_leave_days ?? "—",
										},
										{
											label: "Paternity Leave Days",
											value: orgRaw.paternity_leave_days ?? "—",
										},
										{
											label: "Probation Period",
											value: orgRaw.probation_weeks
												? `${orgRaw.probation_weeks} wks`
												: "—",
										},
										{
											label: "Notice Period",
											value: orgRaw.notice_weeks
												? `${orgRaw.notice_weeks} wks`
												: "—",
										},
										{
											label: "Default Stipend",
											value: orgRaw.default_stipend_amount
												? `KES ${Number(orgRaw.default_stipend_amount).toLocaleString()}`
												: "—",
										},
									].map(({ label, value }) => (
										<div
											key={label}
											className="p-3 bg-surface rounded-xl border border-surface-border text-center">
											<div className="text-lg font-bold text-white">
												{value}
											</div>
											<div className="text-xs text-slate-500 mt-0.5">
												{label}
											</div>
										</div>
									))}
								</div>
							</div>
						</>
					) : (
						<div className="card text-center py-12 text-slate-500">
							Loading organisation settings…
						</div>
					)}
				</div>
			)}
		</div>
	);
}
