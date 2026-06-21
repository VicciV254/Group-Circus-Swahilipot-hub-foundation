// Nexus — Enhanced Tasks Page
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
	ClipboardList,
	Plus,
	Clock,
	AlertTriangle,
	CheckCircle,
	Upload,
	MessageSquare,
	ChevronRight,
	XCircle,
	Play,
	Eye,
	Paperclip,
	Building2,
	Users,
	ChevronDown,
	ChevronUp,
	FileText,
	Image,
	Sheet,
	File,
	X,
	Send,
	Edit3,
	Activity,
	Download,
} from "lucide-react";
import { tasksApi, usersApi, departmentsApi } from "../../services/api";
import { useAuthStore } from "../../services/api";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import clsx from "clsx";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface Assignee {
	id: string;
	full_name: string;
	email: string;
	role_display: string;
	department_id?: string;
	department_name?: string;
	initials?: string;
}

interface TaskFile {
	id?: string;
	name: string;
	size: string;
	type: "pdf" | "img" | "doc" | "xls" | "other";
	url?: string;
	file?: File;
}

interface TaskSubmission {
	notes: string;
	files: TaskFile[];
	submitted_at?: string;
	submitted_by?: string;
}

interface Task {
	id: string;
	title: string;
	description: string;
	priority: "low" | "medium" | "high" | "urgent";
	status:
		| "pending"
		| "in_progress"
		| "submitted"
		| "reviewed"
		| "approved"
		| "rejected";
	due_date: string;
	assigned_to: string[];
	assigned_to_names?: string[];
	assigned_by_name?: string;
	departments?: string[];
	department_names?: string[];
	is_bulk?: boolean;
	progress_percent: number;
	files: TaskFile[];
	submission: TaskSubmission | null;
	supervisor_feedback?: string;
	is_overdue?: boolean;
	recurrence?: string;
	created_at?: string;
	activity?: { text: string; time: string }[];
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
	pending: "badge-amber",
	in_progress: "badge-blue",
	submitted: "badge-purple",
	reviewed: "badge-teal",
	approved: "badge-green",
	rejected: "badge-red",
	overdue: "badge-red",
};

const PRIORITY_STYLES: Record<string, string> = {
	low: "text-slate-400",
	medium: "text-blue-400",
	high: "text-amber-400",
	urgent: "text-red-400",
};

const FILE_FILTERS = [
	"",
	"pending",
	"in_progress",
	"submitted",
	"approved",
	"overdue",
];

function guessFileType(name: string): TaskFile["type"] {
	const ext = name.split(".").pop()?.toLowerCase() || "";
	if (ext === "pdf") return "pdf";
	if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "img";
	if (["doc", "docx"].includes(ext)) return "doc";
	if (["xls", "xlsx", "csv"].includes(ext)) return "xls";
	return "other";
}

function fmtSize(bytes: number): string {
	if (bytes < 1024) return bytes + " B";
	if (bytes < 1_048_576) return (bytes / 1024).toFixed(0) + " KB";
	return (bytes / 1_048_576).toFixed(1) + " MB";
}

function FileTypeIcon({
	type,
	className,
}: {
	type: TaskFile["type"];
	className?: string;
}) {
	const base = clsx(
		"w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0",
		className,
	);
	if (type === "pdf")
		return <div className={clsx(base, "bg-red-500/20 text-red-400")}>PDF</div>;
	if (type === "img")
		return (
			<div className={clsx(base, "bg-green-500/20 text-green-400")}>
				<Image size={14} />
			</div>
		);
	if (type === "doc")
		return (
			<div className={clsx(base, "bg-blue-500/20 text-blue-400")}>DOC</div>
		);
	if (type === "xls")
		return (
			<div className={clsx(base, "bg-emerald-500/20 text-emerald-400")}>
				XLS
			</div>
		);
	return (
		<div className={clsx(base, "bg-purple-500/20 text-purple-400")}>
			<File size={14} />
		</div>
	);
}

function FileListDisplay({
	files,
	compact = false,
}: {
	files: TaskFile[];
	compact?: boolean;
}) {
	if (!files.length)
		return <p className="text-xs text-slate-500 italic">No files attached</p>;
	return (
		<div className="flex flex-col gap-1.5">
			{files.map((f, i) => (
				<div
					key={i}
					className="flex items-center gap-2 p-2 bg-surface rounded-lg border border-surface-border">
					<FileTypeIcon type={f.type} />
					<span
						className={clsx(
							"flex-1 min-w-0 truncate",
							compact ? "text-xs" : "text-sm",
						)}>
						{f.name}
					</span>
					<span className="text-xs text-slate-500 shrink-0">{f.size}</span>
					{f.url && (
						<a
							href={f.url}
							download
							className="text-nexus-400 hover:text-nexus-300 shrink-0">
							<Download size={13} />
						</a>
					)}
				</div>
			))}
		</div>
	);
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
export default function TasksPage() {
	const { user } = useAuthStore();
	const qc = useQueryClient();
	const [editTask, setEditTask] = useState<Task | null>(null);
	const [showEditModal, setShowEditModal] = useState(false);
	const isAssigner = [
		"supervisor",
		"department_leader",
		"hr_officer",
		"system_admin",
		"broadcast_admin",
		"broadcast_staff",
	].includes(user?.role || "");

	const [filter, setFilter] = useState("");
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [showDetailModal, setShowDetailModal] = useState(false);
	const [selectedTask, setSelectedTask] = useState<Task | null>(null);

	const { data: tasksData, isLoading } = useQuery({
		queryKey: ["tasks", filter],
		queryFn: () =>
			tasksApi.list({ status: filter || undefined }).then((r) => r.data),
		refetchInterval: 60_000,
	});

	const tasks: Task[] = Array.isArray(tasksData)
		? tasksData
		: Array.isArray(tasksData?.results)
			? tasksData.results
			: [];

	// ── Mutations ──────────────────────────────
	const startMutation = useMutation({
		mutationFn: (id: string) => tasksApi.update(id, { status: "in_progress" }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["tasks"] });
			toast.success("Task started!");
			setShowDetailModal(false);
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Failed to start task"),
	});

	const submitMutation = useMutation({
		mutationFn: ({ id, data }: any) => tasksApi.submit(id, data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["tasks"] });
			toast.success("Task submitted for review!");
			setShowDetailModal(false);
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Submission failed"),
	});

	const reviewMutation = useMutation({
		mutationFn: ({ id, action, feedback }: any) =>
			tasksApi.review(id, { action, feedback }),
		onSuccess: (_: any, { action }: any) => {
			qc.invalidateQueries({ queryKey: ["tasks"] });
			toast.success(`Task ${action}d`);
			setShowDetailModal(false);
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Review failed"),
	});

	// ── Derived counts ─────────────────────────
	const overdue = tasks.filter((t) => t.is_overdue);
	const pending = tasks.filter((t) => t.status === "pending");
	const inProgress = tasks.filter((t) => t.status === "in_progress");
	const submitted = tasks.filter((t) => t.status === "submitted");
	const approved = tasks.filter((t) => t.status === "approved");

	return (
		<div className="space-y-6 animate-fade-in">
			{/* ── Header ── */}
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<ClipboardList size={22} className="text-nexus-400" /> Task
						Management
					</h1>
					<p className="page-subtitle">
						Assign, track, submit, and review tasks across your organisation
					</p>
				</div>
				{isAssigner && (
					<button
						onClick={() => setShowCreateModal(true)}
						className="btn-primary">
						<Plus size={15} /> Assign Task
					</button>
				)}
			</div>

			{/* ── Overdue alert ── */}
			{overdue.length > 0 && (
				<div className="alert alert-danger">
					<AlertTriangle size={15} className="shrink-0" />
					<span>
						<strong>
							{overdue.length} overdue task{overdue.length > 1 ? "s" : ""}
						</strong>{" "}
						require immediate attention.
					</span>
				</div>
			)}

			{/* ── Stat cards ── */}
			<div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
				{[
					{ label: "Total", value: tasks.length, color: "text-white" },
					{ label: "Pending", value: pending.length, color: "text-amber-400" },
					{
						label: "In Progress",
						value: inProgress.length,
						color: "text-blue-400",
					},
					{
						label: "Submitted",
						value: submitted.length,
						color: "text-purple-400",
					},
					{ label: "Overdue", value: overdue.length, color: "text-red-400" },
				].map(({ label, value, color }) => (
					<div key={label} className="stat-card">
						<div className={clsx("stat-value", color)}>{value}</div>
						<div className="stat-label">{label}</div>
					</div>
				))}
			</div>

			{/* ── Filters ── */}
			<div className="flex gap-2 flex-wrap">
				{FILE_FILTERS.map((s) => (
					<button
						key={s}
						onClick={() => setFilter(s)}
						className={clsx("btn btn-sm capitalize", {
							"btn-primary": filter === s,
							"btn-secondary": filter !== s,
						})}>
						{s ? s.replace("_", " ") : "All"}
					</button>
				))}
			</div>

			{/* ── Task list ── */}
			<div className="space-y-3">
				{isLoading ? (
					[...Array(5)].map((_, i) => (
						<div key={i} className="skeleton h-24 rounded-xl" />
					))
				) : tasks.length === 0 ? (
					<div className="card text-center py-12">
						<ClipboardList
							size={32}
							className="mx-auto text-slate-500 mb-3 opacity-30"
						/>
						<p className="text-slate-400">No tasks found</p>
					</div>
				) : (
					tasks.map((task) => (
						<TaskCard
							key={task.id}
							task={task}
							onView={() => {
								setSelectedTask(task);
								setShowDetailModal(true);
							}}
						/>
					))
				)}
			</div>

			{/* ── Modals ── */}
			{showCreateModal && (
				<CreateTaskModal
					onClose={() => setShowCreateModal(false)}
					onSuccess={() => {
						qc.invalidateQueries({ queryKey: ["tasks"] });
						setShowCreateModal(false);
					}}
				/>
			)}
			{showDetailModal && selectedTask && (
				<TaskDetailModal
					task={selectedTask}
					isAssigner={isAssigner}
					onClose={() => setShowDetailModal(false)}
					onStart={() => startMutation.mutate(selectedTask.id)}
					onSubmit={(notes: string, files: TaskFile[]) =>
						submitMutation.mutate({
							id: selectedTask.id,
							data: { notes, files },
						})
					}
					onReview={(action: string, feedback: string) =>
						reviewMutation.mutate({ id: selectedTask.id, action, feedback })
					}
					isPending={
						startMutation.isPending ||
						submitMutation.isPending ||
						reviewMutation.isPending
					}
					onEdit={(task) => {
						setEditTask(task);
						setShowEditModal(true);
					}}
				/>
			)}
			{showEditModal && editTask && (
				<CreateTaskModal // reuse CreateTaskModal, pre-filled
					onClose={() => setShowEditModal(false)}
					onSuccess={() => {
						qc.invalidateQueries({ queryKey: ["tasks"] });
						setShowEditModal(false);
					}}
					existingTask={editTask} // pass the task to pre-fill the form
				/>
			)}
		</div>
	);
}

// ─────────────────────────────────────────────
// Task Card
// ─────────────────────────────────────────────
function TaskCard({ task, onView }: { task: Task; onView: () => void }) {
	const hasFiles = task.files && task.files.length > 0;
	const hasSubmissionFiles =
		task.submission?.files && task.submission.files.length > 0;
	const status = task.is_overdue ? "overdue" : task.status;

	return (
		<div
			className={clsx("card-hover group", {
				"border-red-500/30": task.is_overdue,
			})}
			onClick={onView}
			style={{ cursor: "pointer" }}>
			<div className="flex items-start gap-4">
				{/* Status icon */}
				<div
					className={clsx("mt-1", {
						"text-red-400 animate-pulse": task.is_overdue,
						"text-green-400": task.status === "approved",
						"text-blue-400": task.status === "in_progress",
						"text-purple-400": task.status === "submitted",
						"text-slate-400":
							!task.is_overdue &&
							!["approved", "in_progress", "submitted"].includes(task.status),
					})}>
					{task.status === "approved" ? (
						<CheckCircle size={18} />
					) : task.is_overdue ? (
						<AlertTriangle size={18} />
					) : task.status === "in_progress" ? (
						<Play size={18} />
					) : task.status === "submitted" ? (
						<Upload size={18} />
					) : (
						<Clock size={18} />
					)}
				</div>

				<div className="flex-1 min-w-0">
					{/* Title row */}
					<div className="flex items-center gap-2 flex-wrap">
						<span className="font-semibold text-white group-hover:text-nexus-400 transition-colors">
							{task.title}
						</span>
						<span
							className={clsx(
								"badge capitalize",
								STATUS_STYLES[status] || "badge-slate",
							)}>
							{status.replace("_", " ")}
						</span>
						<span
							className={clsx(
								"text-xs font-medium capitalize",
								PRIORITY_STYLES[task.priority],
							)}>
							{task.priority} priority
						</span>
						{hasFiles && (
							<span className="badge badge-nexus flex items-center gap-1">
								<Paperclip size={10} />
								{task.files.length} file{task.files.length > 1 ? "s" : ""}
							</span>
						)}
						{task.is_bulk && (
							<span className="badge badge-amber flex items-center gap-1">
								<Users size={10} /> Bulk
							</span>
						)}
						{hasSubmissionFiles && (
							<span className="badge badge-green flex items-center gap-1 text-[10px]">
								<CheckCircle size={9} /> Submission filed
							</span>
						)}
					</div>

					{/* Description */}
					<p className="text-sm text-slate-400 mt-1 line-clamp-1">
						{task.description}
					</p>

					{/* Meta row */}
					<div className="flex items-center gap-3 mt-2 text-xs text-slate-500 flex-wrap">
						{task.assigned_to_names?.length ? (
							<span>
								Assigned to:{" "}
								<span className="text-slate-300">
									{task.assigned_to_names.slice(0, 2).join(", ")}
									{task.assigned_to_names.length > 2 &&
										` +${task.assigned_to_names.length - 2} more`}
								</span>
							</span>
						) : null}
						{task.department_names?.length ? (
							<span className="flex items-center gap-1">
								<Building2 size={10} />
								{task.department_names.join(", ")}
							</span>
						) : null}
						<span
							className={clsx({ "text-red-400 font-medium": task.is_overdue })}>
							Due: {format(parseISO(task.due_date), "dd MMM yyyy, HH:mm")}
						</span>
						{task.progress_percent > 0 && (
							<span>Progress: {task.progress_percent}%</span>
						)}
					</div>
				</div>

				{/* View button */}
				<button
					onClick={(e) => {
						e.stopPropagation();
						onView();
					}}
					className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
					<Eye size={12} /> View task
				</button>

				<ChevronRight
					size={16}
					className="text-slate-600 shrink-0 mt-1 group-hover:text-slate-400 transition-colors"
				/>
			</div>

			{/* Progress bar */}
			{task.progress_percent > 0 && (
				<div className="mt-3 ml-10">
					<div className="h-1 bg-surface-elevated rounded-full overflow-hidden">
						<div
							className="h-full bg-nexus-500 rounded-full transition-all"
							style={{ width: `${task.progress_percent}%` }}
						/>
					</div>
				</div>
			)}
		</div>
	);
}

// ─────────────────────────────────────────────
// Create Task Modal (Enhanced)
// ─────────────────────────────────────────────
type AssignMode = "department" | "individual" | "bulk";

function CreateTaskModal({
	onClose,
	onSuccess,
	existingTask,
}: {
	onClose: () => void;
	onSuccess: () => void;
	existingTask?: Task;
}) {
	const { register, handleSubmit } = useForm({
		defaultValues: existingTask
			? {
					title: existingTask.title,
					description: existingTask.description,
					priority: existingTask.priority,
					due_date: existingTask.due_date?.slice(0, 16),
					recurrence: existingTask.recurrence,
					notify_via: existingTask.notify_via,
				}
			: {},
	});
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [assignMode, setAssignMode] = useState<AssignMode>("department");
	const [selectedAssignees, setSelectedAssignees] = useState<Assignee[]>([]);
	const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
	const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
	const [userSearch, setUserSearch] = useState("");
	const [uploadedFiles, setUploadedFiles] = useState<TaskFile[]>([]);
	const [isDragging, setIsDragging] = useState(false);

	// Fetch departments
	const { data: deptsData } = useQuery({
		queryKey: ["departments"],
		queryFn: () => departmentsApi.list().then((r) => r.data),
		staleTime: 1000 * 60 * 10, // 10 min — departments don't change often
	});
	const departments: any[] = Array.isArray(deptsData)
		? deptsData
		: deptsData?.results || [];

	// Fetch users per selected department or search
	const { data: usersData } = useQuery({
		queryKey: ["users-search", userSearch, selectedDepts],
		queryFn: () =>
			usersApi
				.list({
					search: userSearch || undefined,
					departments: selectedDepts.join(",") || undefined,
					page_size: 50,
				})
				.then((r) => r.data),
		enabled: assignMode === "individual" ? true : selectedDepts.length > 0,
	});
	const allUsers: Assignee[] = Array.isArray(usersData)
		? usersData
		: usersData?.results || [];

	// Fetch department members for bulk
	const { data: bulkUsersData } = useQuery({
		queryKey: ["bulk-users", selectedDepts],
		queryFn: () =>
			usersApi
				.list({ departments: selectedDepts.join(","), page_size: 200 })
				.then((r) => r.data),
		enabled: assignMode === "bulk" && selectedDepts.length > 0,
	});
	const bulkUsers: Assignee[] = Array.isArray(bulkUsersData)
		? bulkUsersData
		: bulkUsersData?.results || [];

	const mutation = useMutation({
		mutationFn: (data: any) =>
			existingTask
				? tasksApi.update(existingTask.id, data)
				: tasksApi.create(data),
		onSuccess: () => {
			toast.success(existingTask ? "Task updated!" : "Task assigned!");
			onSuccess();
		},
		onError: (e: any) =>
			toast.error(
				e.response?.data?.detail || existingTask
					? "Failed to update task"
					: "Failed to assign task",
			),
	});

	// ── Assignee helpers ──────────────────────
	const toggleAssignee = (u: Assignee) => {
		setSelectedAssignees((prev) =>
			prev.some((a) => a.id === u.id)
				? prev.filter((a) => a.id !== u.id)
				: [...prev, u],
		);
	};

	const toggleDeptExpand = (id: string) => {
		setExpandedDepts((prev) => {
			const s = new Set(prev);
			s.has(id) ? s.delete(id) : s.add(id);
			return s;
		});
	};

	const toggleDeptSelect = (deptId: string) => {
		setSelectedDepts((prev) =>
			prev.includes(deptId)
				? prev.filter((d) => d !== deptId)
				: [...prev, deptId],
		);
	};

	// For bulk mode: compute effective assignees from selectedDepts
	const effectiveAssignees =
		assignMode === "bulk" ? bulkUsers : selectedAssignees;

	// ── File helpers ──────────────────────────
	const handleFiles = (fileList: FileList) => {
		const newFiles: TaskFile[] = Array.from(fileList).map((f) => ({
			name: f.name,
			size: fmtSize(f.size),
			type: guessFileType(f.name),
			file: f,
		}));
		setUploadedFiles((prev) => [...prev, ...newFiles]);
	};

	const removeFile = (i: number) =>
		setUploadedFiles((prev) => prev.filter((_, idx) => idx !== i));

	// ── Submit ────────────────────────────────
	const onSubmit = (formData: any) => {
		const assignees =
			assignMode === "bulk"
				? bulkUsers.map((u) => u.id)
				: selectedAssignees.map((u) => u.id);
		if (!assignees.length) {
			toast.error("Please select at least one assignee");
			return;
		}

		// Build FormData so files are sent as binary, not JSON
		const fd = new FormData();
		fd.append("title", formData.title);
		fd.append("description", formData.description);
		fd.append("priority", formData.priority || "medium");
		fd.append("due_date", formData.due_date);
		fd.append("recurrence", formData.recurrence || "none");
		fd.append("notify_via", formData.notify_via || "in_app");
		fd.append("is_bulk", String(assignMode === "bulk"));
		assignees.forEach((id) => fd.append("assigned_to", id));
		selectedDepts.forEach((id) => fd.append("departments", id));
		uploadedFiles.forEach((f) => {
			if (f.file) fd.append("files", f.file, f.name);
		});

		mutation.mutate(fd);
	};

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div
				className="modal-box max-w-2xl max-h-[90vh] overflow-y-auto"
				onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h3 className="font-semibold text-white">
						{existingTask ? "Edit Task" : "Assign New Task"}
					</h3>
					<button onClick={onClose} className="text-slate-400 hover:text-white">
						<X size={18} />
					</button>
				</div>

				<form onSubmit={handleSubmit(onSubmit)}>
					<div className="modal-body space-y-5">
						{/* Basic info */}
						<div className="input-group">
							<label className="input-label">Task Title *</label>
							<input
								{...register("title", { required: true })}
								className="input"
								placeholder="Clear, actionable task title"
							/>
						</div>
						<div className="input-group">
							<label className="input-label">Description *</label>
							<textarea
								{...register("description", { required: true })}
								rows={3}
								className="textarea"
								placeholder="Detailed instructions, expected deliverables, acceptance criteria..."
							/>
						</div>
						<div className="grid grid-cols-3 gap-4">
							<div className="input-group">
								<label className="input-label">Priority</label>
								<select {...register("priority")} className="select-input">
									<option value="low">Low</option>
									<option value="medium">Medium</option>
									<option value="high">High</option>
									<option value="urgent">Urgent</option>
								</select>
							</div>
							<div className="input-group col-span-2">
								<label className="input-label">Due Date & Time *</label>
								<input
									type="datetime-local"
									{...register("due_date", { required: true })}
									className="input"
								/>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div className="input-group">
								<label className="input-label">Recurrence</label>
								<select {...register("recurrence")} className="select-input">
									<option value="none">None</option>
									<option value="daily">Daily</option>
									<option value="weekly">Weekly</option>
									<option value="monthly">Monthly</option>
								</select>
							</div>
							<div className="input-group">
								<label className="input-label">Notify via</label>
								<select {...register("notify_via")} className="select-input">
									<option value="in_app">In-app only</option>
									<option value="email">Email + in-app</option>
									<option value="sms">SMS + in-app</option>
								</select>
							</div>
						</div>

						{/* Assignment section */}
						<div className="space-y-3">
							<label className="input-label">Assign To *</label>

							{/* Mode toggle */}
							<div className="flex gap-2">
								{(["department", "individual", "bulk"] as AssignMode[]).map(
									(m) => (
										<button
											key={m}
											type="button"
											onClick={() => setAssignMode(m)}
											className={clsx(
												"btn btn-sm capitalize flex items-center gap-1.5",
												{
													"btn-primary": assignMode === m,
													"btn-secondary": assignMode !== m,
												},
											)}>
											{m === "department" && <Building2 size={12} />}
											{m === "individual" && <Users size={12} />}
											{m === "bulk" && <Users size={12} />}
											{m === "department"
												? "By Dept"
												: m === "individual"
													? "Individual"
													: "Bulk (Dept-wide)"}
										</button>
									),
								)}
							</div>

							{/* Department mode: expand dept → pick members */}
							{assignMode === "department" && (
								<div className="space-y-2 max-h-56 overflow-y-auto pr-1">
									{departments.map((dept) => {
										const isExpanded = expandedDepts.has(dept.id);
										const deptUsers = allUsers.filter(
											(u) => u.department_id === dept.id,
										);
										return (
											<div
												key={dept.id}
												className="border border-surface-border rounded-xl overflow-hidden">
												<button
													type="button"
													onClick={() => {
														toggleDeptExpand(dept.id);
														if (!expandedDepts.has(dept.id))
															toggleDeptSelect(dept.id);
													}}
													className="w-full flex items-center justify-between px-4 py-2.5 bg-surface hover:bg-surface-muted text-left">
													<div className="flex items-center gap-2">
														<Building2 size={14} className="text-teal-400" />
														<span className="text-sm font-medium text-white">
															{dept.name}
														</span>
														<span className="text-xs text-slate-500">
															{dept.member_count || 0} members
														</span>
													</div>
													{isExpanded ? (
														<ChevronUp size={14} className="text-slate-400" />
													) : (
														<ChevronDown size={14} className="text-slate-400" />
													)}
												</button>

												{isExpanded && (
													<div className="bg-surface-muted divide-y divide-surface-border">
														{deptUsers.length === 0 ? (
															<p className="text-xs text-slate-500 px-4 py-2">
																No members found
															</p>
														) : (
															deptUsers.map((u) => {
																const selected = selectedAssignees.some(
																	(a) => a.id === u.id,
																);
																return (
																	<label
																		key={u.id}
																		className={clsx(
																			"flex items-center gap-3 px-4 py-2 cursor-pointer",
																			{ "bg-nexus-600/10": selected },
																		)}>
																		<input
																			type="checkbox"
																			checked={selected}
																			onChange={() => toggleAssignee(u)}
																			className="accent-nexus-500"
																		/>
																		<div className="w-7 h-7 rounded-full bg-nexus-600/20 flex items-center justify-center text-[10px] font-bold text-nexus-400">
																			{u.full_name
																				?.split(" ")
																				.map((n) => n[0])
																				.join("")
																				.slice(0, 2)}
																		</div>
																		<div>
																			<div className="text-sm text-white">
																				{u.full_name}
																			</div>
																			<div className="text-xs text-slate-400">
																				{u.role_display}
																			</div>
																		</div>
																	</label>
																);
															})
														)}
													</div>
												)}
											</div>
										);
									})}
								</div>
							)}

							{/* Individual mode: search */}
							{assignMode === "individual" && (
								<div className="space-y-2">
									<input
										className="input"
										placeholder="Search by name, email, or role..."
										value={userSearch}
										onChange={(e) => setUserSearch(e.target.value)}
									/>
									{allUsers.length > 0 && (
										<div className="border border-surface-border rounded-xl overflow-hidden max-h-44 overflow-y-auto">
											{allUsers.map((u) => {
												const selected = selectedAssignees.some(
													(a) => a.id === u.id,
												);
												return (
													<label
														key={u.id}
														className={clsx(
															"flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-muted",
															{ "bg-nexus-600/10": selected },
														)}>
														<input
															type="checkbox"
															checked={selected}
															onChange={() => toggleAssignee(u)}
															className="accent-nexus-500"
														/>
														<div className="w-7 h-7 rounded-full bg-nexus-600/20 flex items-center justify-center text-[10px] font-bold text-nexus-400">
															{u.full_name
																?.split(" ")
																.map((n) => n[0])
																.join("")
																.slice(0, 2)}
														</div>
														<div className="flex-1">
															<div className="text-sm text-white">
																{u.full_name}
															</div>
															<div className="text-xs text-slate-400">
																{u.role_display} · {u.department_name}
															</div>
														</div>
													</label>
												);
											})}
										</div>
									)}
								</div>
							)}

							{/* Bulk mode: select whole departments */}
							{assignMode === "bulk" && (
								<div className="space-y-2">
									<p className="text-xs text-amber-400/80 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2">
										All members of selected departments will be assigned this
										task.
									</p>
									{departments.map((dept) => {
										const selected = selectedDepts.includes(dept.id);
										return (
											<label
												key={dept.id}
												className={clsx(
													"flex items-center gap-3 px-4 py-2.5 border rounded-xl cursor-pointer",
													{
														"border-nexus-500/40 bg-nexus-600/10": selected,
														"border-surface-border bg-surface": !selected,
													},
												)}>
												<input
													type="checkbox"
													checked={selected}
													onChange={() => toggleDeptSelect(dept.id)}
													className="accent-nexus-500"
												/>
												<Building2 size={14} className="text-teal-400" />
												<div className="flex-1">
													<div className="text-sm text-white">{dept.name}</div>
													<div className="text-xs text-slate-400">
														{dept.member_count || 0} members
													</div>
												</div>
											</label>
										);
									})}
								</div>
							)}

							{/* Selected assignees chips */}
							{effectiveAssignees.length > 0 && (
								<div className="space-y-1.5">
									<p className="text-xs text-slate-400">
										{effectiveAssignees.length} assignee
										{effectiveAssignees.length > 1 ? "s" : ""} selected
									</p>
									<div className="flex flex-wrap gap-2">
										{effectiveAssignees.map((a) => (
											<div
												key={a.id}
												className="flex items-center gap-1.5 bg-surface border border-surface-border rounded-full px-3 py-1 text-xs text-white">
												<div className="w-4 h-4 rounded-full bg-nexus-600/30 flex items-center justify-center text-[8px] font-bold text-nexus-400">
													{a.full_name
														?.split(" ")
														.map((n) => n[0])
														.join("")
														.slice(0, 2)}
												</div>
												{a.full_name}
												{assignMode !== "bulk" && (
													<button
														type="button"
														onClick={() => toggleAssignee(a)}
														className="text-slate-500 hover:text-red-400">
														<X size={10} />
													</button>
												)}
											</div>
										))}
									</div>
								</div>
							)}
						</div>

						{/* File upload */}
						<div className="space-y-2">
							<label className="input-label">Attach Files (optional)</label>
							<div
								className={clsx(
									"border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
									isDragging
										? "border-nexus-500 bg-nexus-600/10"
										: "border-surface-border hover:border-nexus-500/50 bg-surface",
								)}
								onClick={() => fileInputRef.current?.click()}
								onDragOver={(e) => {
									e.preventDefault();
									setIsDragging(true);
								}}
								onDragLeave={() => setIsDragging(false)}
								onDrop={(e) => {
									e.preventDefault();
									setIsDragging(false);
									handleFiles(e.dataTransfer.files);
								}}>
								<Upload size={24} className="mx-auto text-slate-500 mb-2" />
								<p className="text-sm text-slate-400">
									Drop files here or{" "}
									<span className="text-nexus-400">click to browse</span>
								</p>
								<p className="text-xs text-slate-600 mt-1">
									PDF, DOCX, XLSX, PNG, JPEG, PPTX, CSV…
								</p>
								<input
									ref={fileInputRef}
									type="file"
									multiple
									className="hidden"
									accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt,.csv,.pptx"
									onChange={(e) =>
										e.target.files && handleFiles(e.target.files)
									}
								/>
							</div>
							{uploadedFiles.length > 0 && (
								<div className="space-y-1.5">
									{uploadedFiles.map((f, i) => (
										<div
											key={i}
											className="flex items-center gap-2 p-2 bg-surface border border-surface-border rounded-lg">
											<FileTypeIcon type={f.type} />
											<span className="flex-1 text-sm text-white truncate">
												{f.name}
											</span>
											<span className="text-xs text-slate-500">{f.size}</span>
											<button
												type="button"
												onClick={() => removeFile(i)}
												className="text-slate-400 hover:text-red-400">
												<X size={13} />
											</button>
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
							<Send size={13} />
							{mutation.isPending ? "Assigning…" : "Assign Task"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────
// Task Detail Modal (Enhanced)
// ─────────────────────────────────────────────
function TaskDetailModal({
	task,
	isAssigner,
	onClose,
	onStart,
	onSubmit,
	onReview,
	isPending,
	onEdit,
}: {
	task: Task;
	isAssigner: boolean;
	onClose: () => void;
	onStart: () => void;
	onSubmit: (notes: string, files: TaskFile[]) => void;
	onReview: (action: string, feedback: string) => void;
	isPending: boolean;
	onEdit: (task: Task) => void;
}) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [notes, setNotes] = useState("");
	const [feedback, setFeedback] = useState("");
	const [submissionFiles, setSubmissionFiles] = useState<TaskFile[]>([]);
	const [activeTab, setActiveTab] = useState<
		"details" | "compare" | "activity"
	>("details");

	const handleSubmissionFiles = (fileList: FileList) => {
		const newFiles: TaskFile[] = Array.from(fileList).map((f) => ({
			name: f.name,
			size: fmtSize(f.size),
			type: guessFileType(f.name),
			file: f,
		}));
		setSubmissionFiles((prev) => [...prev, ...newFiles]);
	};

	const status = task.is_overdue ? "overdue" : task.status;

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div
				className="modal-box max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
				onClick={(e) => e.stopPropagation()}>
				{/* Header */}
				<div className="modal-header">
					<div className="flex-1 min-w-0">
						<h3 className="font-semibold text-white truncate">{task.title}</h3>
						<div className="flex items-center gap-2 mt-1.5 flex-wrap">
							<span
								className={clsx(
									"badge capitalize",
									STATUS_STYLES[status] || "badge-slate",
								)}>
								{status.replace("_", " ")}
							</span>
							<span
								className={clsx(
									"text-xs font-medium capitalize",
									PRIORITY_STYLES[task.priority],
								)}>
								{task.priority} priority
							</span>
							{task.files?.length > 0 && (
								<span className="badge badge-nexus flex items-center gap-1">
									<Paperclip size={9} /> {task.files.length} file
									{task.files.length > 1 ? "s" : ""}
								</span>
							)}
							{task.is_bulk && (
								<span className="badge badge-amber flex items-center gap-1">
									<Users size={9} /> Bulk
								</span>
							)}
						</div>
					</div>
					<button
						onClick={onClose}
						className="text-slate-400 hover:text-white ml-4">
						<X size={18} />
					</button>
				</div>

				{/* Tabs */}
				<div className="flex gap-1 px-5 pt-3 border-b border-surface-border">
					{(["details", "compare", "activity"] as const).map((t) => (
						<button
							key={t}
							onClick={() => setActiveTab(t)}
							className={clsx(
								"px-4 py-1.5 text-xs font-medium rounded-t-lg capitalize transition-colors",
								{
									"bg-surface-elevated text-white border border-b-transparent border-surface-border":
										activeTab === t,
									"text-slate-500 hover:text-slate-300": activeTab !== t,
								},
							)}>
							{t === "compare" ? "Task vs Submission" : t}
						</button>
					))}
				</div>

				{/* Body */}
				<div className="modal-body overflow-y-auto flex-1 space-y-4">
					{/* ── Details tab ── */}
					{activeTab === "details" && (
						<>
							<p className="text-slate-300 text-sm leading-relaxed">
								{task.description}
							</p>

							<div className="grid grid-cols-2 gap-3 text-sm">
								<div className="bg-surface rounded-lg p-3 border border-surface-border">
									<div className="text-slate-500 text-xs mb-1">Assigned To</div>
									<div className="text-white text-sm">
										{task.assigned_to_names?.join(", ") || "—"}
									</div>
								</div>
								<div className="bg-surface rounded-lg p-3 border border-surface-border">
									<div className="text-slate-500 text-xs mb-1">
										Department(s)
									</div>
									<div className="text-white text-sm flex items-center gap-1">
										<Building2 size={12} className="text-teal-400" />
										{task.department_names?.join(", ") || "—"}
									</div>
								</div>
								<div className="bg-surface rounded-lg p-3 border border-surface-border">
									<div className="text-slate-500 text-xs mb-1">Assigned By</div>
									<div className="text-white">
										{task.assigned_by_name || "—"}
									</div>
								</div>
								<div className="bg-surface rounded-lg p-3 border border-surface-border">
									<div className="text-slate-500 text-xs mb-1">Due Date</div>
									<div
										className={clsx(
											"font-medium",
											task.is_overdue ? "text-red-400" : "text-white",
										)}>
										{format(parseISO(task.due_date), "dd MMM yyyy, HH:mm")}
									</div>
								</div>
								<div className="bg-surface rounded-lg p-3 border border-surface-border">
									<div className="text-slate-500 text-xs mb-1">Progress</div>
									<div className="text-white">
										{task.progress_percent || 0}%
									</div>
									<div className="h-1 bg-surface-elevated rounded-full overflow-hidden mt-1.5">
										<div
											className="h-full bg-nexus-500 rounded-full"
											style={{ width: `${task.progress_percent}%` }}
										/>
									</div>
								</div>
								<div className="bg-surface rounded-lg p-3 border border-surface-border">
									<div className="text-slate-500 text-xs mb-1">
										Assignment Type
									</div>
									<div className="text-white">
										{task.is_bulk ? "Bulk (dept-wide)" : "Individual"}
									</div>
								</div>
							</div>

							{/* Task files */}
							{task.files?.length > 0 && (
								<div>
									<p className="text-xs text-slate-500 font-medium mb-2 uppercase tracking-wide">
										Attached Files
									</p>
									<FileListDisplay files={task.files} />
								</div>
							)}

							{/* Supervisor feedback */}
							{task.supervisor_feedback && (
								<div className="alert alert-info">
									<MessageSquare size={14} />
									<div>
										<div className="text-xs font-semibold mb-0.5">
											Supervisor Feedback
										</div>
										<p className="text-sm">{task.supervisor_feedback}</p>
									</div>
								</div>
							)}

							{/* Start task (assignee, pending) */}
							{!isAssigner && task.status === "pending" && (
								<div className="border-t border-surface-border pt-4">
									<p className="text-sm text-slate-400">
										Click "Start Task" to begin working on this task.
									</p>
								</div>
							)}

							{/* Submit task (assignee, in_progress) */}
							{!isAssigner && task.status === "in_progress" && (
								<div className="space-y-3 border-t border-surface-border pt-4">
									<label className="input-label">Submission Notes</label>
									<textarea
										value={notes}
										onChange={(e) => setNotes(e.target.value)}
										rows={3}
										className="textarea"
										placeholder="Describe what you completed, any blockers, references…"
									/>
									<div>
										<label className="input-label mb-2">
											Upload Submission Files (optional)
										</label>
										<div
											className="border border-dashed border-surface-border rounded-lg p-4 text-center cursor-pointer hover:border-nexus-500/50 bg-surface"
											onClick={() => fileInputRef.current?.click()}>
											<Upload
												size={18}
												className="mx-auto text-slate-500 mb-1"
											/>
											<p className="text-xs text-slate-400">
												Click to attach your submission files
											</p>
											<input
												ref={fileInputRef}
												type="file"
												multiple
												className="hidden"
												onChange={(e) =>
													e.target.files &&
													handleSubmissionFiles(e.target.files)
												}
											/>
										</div>
										{submissionFiles.length > 0 && (
											<div className="mt-2 space-y-1.5">
												{submissionFiles.map((f, i) => (
													<div
														key={i}
														className="flex items-center gap-2 p-2 bg-surface border border-surface-border rounded-lg">
														<FileTypeIcon type={f.type} />
														<span className="flex-1 text-sm text-white truncate">
															{f.name}
														</span>
														<span className="text-xs text-slate-500">
															{f.size}
														</span>
														<button
															onClick={() =>
																setSubmissionFiles((p) =>
																	p.filter((_, j) => j !== i),
																)
															}
															className="text-slate-400 hover:text-red-400">
															<X size={12} />
														</button>
													</div>
												))}
											</div>
										)}
									</div>
								</div>
							)}

							{/* Review section (assigner, submitted) */}
							{isAssigner && task.status === "submitted" && (
								<div className="space-y-3 border-t border-surface-border pt-4">
									{task.submission?.notes && (
										<div className="p-3 bg-surface rounded-lg border border-surface-border">
											<div className="text-xs text-slate-500 mb-1">
												Submission Notes
											</div>
											<p className="text-sm text-white">
												{task.submission.notes}
											</p>
										</div>
									)}
									{task.submission?.files?.length ? (
										<div>
											<p className="text-xs text-slate-500 mb-1.5">
												Submitted Files
											</p>
											<FileListDisplay files={task.submission.files} compact />
										</div>
									) : null}
									<label className="input-label">Your Feedback</label>
									<textarea
										value={feedback}
										onChange={(e) => setFeedback(e.target.value)}
										rows={3}
										className="textarea"
										placeholder="Provide constructive feedback for the assignee…"
									/>
								</div>
							)}
						</>
					)}

					{/* ── Compare tab ── */}
					{activeTab === "compare" && (
						<div className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								{/* Assigned task side */}
								<div className="space-y-3 p-4 bg-surface border border-blue-500/20 rounded-xl">
									<div className="flex items-center gap-2 text-blue-400 text-xs font-semibold uppercase tracking-wide border-b border-blue-500/20 pb-2">
										<Send size={12} /> Assigned Task
									</div>
									<p className="text-sm text-slate-300 leading-relaxed">
										{task.description}
									</p>
									{task.files?.length > 0 ? (
										<FileListDisplay files={task.files} compact />
									) : (
										<p className="text-xs text-slate-500 italic">
											No files attached
										</p>
									)}
								</div>

								{/* Submission side */}
								<div className="space-y-3 p-4 bg-surface border border-green-500/20 rounded-xl">
									<div className="flex items-center gap-2 text-green-400 text-xs font-semibold uppercase tracking-wide border-b border-green-500/20 pb-2">
										<CheckCircle size={12} /> Submitted Answer
									</div>
									{task.submission ? (
										<>
											<p className="text-sm text-slate-300 leading-relaxed">
												{task.submission.notes || (
													<em className="text-slate-500">No notes provided</em>
												)}
											</p>
											{task.submission.files?.length ? (
												<FileListDisplay
													files={task.submission.files}
													compact
												/>
											) : (
												<p className="text-xs text-slate-500 italic">
													No files submitted
												</p>
											)}
											{task.submission.submitted_at && (
												<p className="text-xs text-slate-500">
													Submitted:{" "}
													{format(
														parseISO(task.submission.submitted_at),
														"dd MMM yyyy, HH:mm",
													)}
												</p>
											)}
										</>
									) : (
										<div className="flex flex-col items-center justify-center py-6 text-slate-500 gap-2">
											<Clock size={24} className="opacity-30" />
											<p className="text-xs">Not yet submitted</p>
										</div>
									)}
								</div>
							</div>

							{task.supervisor_feedback && (
								<div className="p-4 bg-surface border border-surface-border rounded-xl">
									<div className="flex items-center gap-2 text-nexus-400 text-xs font-semibold uppercase tracking-wide mb-2">
										<MessageSquare size={12} /> Supervisor Feedback
									</div>
									<p className="text-sm text-slate-300">
										{task.supervisor_feedback}
									</p>
								</div>
							)}
						</div>
					)}

					{/* ── Activity tab ── */}
					{activeTab === "activity" && (
						<div className="space-y-1">
							{task.activity?.length ? (
								task.activity.map((a, i) => (
									<div
										key={i}
										className="flex items-start gap-3 py-2.5 border-b border-surface-border last:border-0">
										<div className="w-1.5 h-1.5 rounded-full bg-nexus-500 mt-1.5 shrink-0" />
										<div className="flex-1">
											<p className="text-sm text-slate-300">{a.text}</p>
										</div>
										<span className="text-xs text-slate-500 shrink-0">
											{a.time}
										</span>
									</div>
								))
							) : (
								<div className="text-center py-8 text-slate-500">
									<Activity size={24} className="mx-auto mb-2 opacity-30" />
									<p className="text-xs">No activity recorded yet</p>
								</div>
							)}
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="modal-footer">
					<button onClick={onClose} className="btn-secondary">
						Close
					</button>

					{isAssigner && (
						<button
							onClick={() => {
								onClose();
								onEdit(task);
							}}
							className="btn-secondary flex items-center gap-1.5">
							<Edit3 size={13} /> Edit Task
						</button>
					)}

					{!isAssigner && task.status === "pending" && (
						<button
							disabled={isPending}
							onClick={onStart}
							className="btn-primary">
							<Play size={14} /> {isPending ? "Starting…" : "Start Task"}
						</button>
					)}

					{!isAssigner && task.status === "in_progress" && (
						<button
							disabled={isPending}
							onClick={() => onSubmit(notes, submissionFiles)}
							className="btn-primary">
							<Upload size={14} /> {isPending ? "Submitting…" : "Submit Task"}
						</button>
					)}

					{isAssigner && task.status === "submitted" && (
						<>
							<button
								disabled={isPending}
								onClick={() => onReview("reject", feedback)}
								className="btn-danger">
								<XCircle size={14} /> Reject
							</button>
							<button
								disabled={isPending}
								onClick={() => onReview("approve", feedback)}
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
