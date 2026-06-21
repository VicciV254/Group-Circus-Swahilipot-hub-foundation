// ─────────────────────────────────────────────────────────────────────────────
// Enterprise Internship Management System
// Projects Module — TypeScript Types
// ─────────────────────────────────────────────────────────────────────────────

export type UUID = string;

// ── Enums ─────────────────────────────────────────────────────────────────────

export type ProjectStatus =
	| "draft"
	| "planning"
	| "active"
	| "on_hold"
	| "completed"
	| "cancelled"
	| "archived";

export type ProjectPriority = "critical" | "high" | "medium" | "low";

export type TaskStatus =
	| "backlog"
	| "pending"
	| "in_progress"
	| "in_review"
	| "submitted"
	| "approved"
	| "rejected"
	| "overdue"
	| "done";

export type TaskPriority = "urgent" | "high" | "medium" | "low";

export type MilestoneStatus =
	| "pending"
	| "in_progress"
	| "completed"
	| "missed";

export type RiskSeverity = "critical" | "high" | "medium" | "low";

export type RiskStatus = "identified" | "mitigating" | "resolved" | "accepted";

export type SprintStatus = "planning" | "active" | "completed" | "cancelled";

export type MemberRole =
	| "lead"
	| "member"
	| "reviewer"
	| "observer"
	| "attachee"
	| "supervisor"
	| "consultant";

export type DocType =
	| "specification"
	| "contract"
	| "report"
	| "plan"
	| "minutes"
	| "deliverable"
	| "other";

export type DependencyType = "FS" | "SS" | "FF" | "SF";

export type ViewMode = "kanban" | "gantt" | "list" | "table" | "calendar";

// ── User ──────────────────────────────────────────────────────────────────────

export interface UserMinimal {
	id: UUID;
	full_name: string;
	email: string;
	avatar_url?: string;
}

// ── Project ───────────────────────────────────────────────────────────────────

export interface Project {
	id: UUID;
	name: string;
	code: string;
	description: string;
	objectives: string;
	cover_color: string;
	cover_image?: string;
	status: ProjectStatus;
	priority: ProjectPriority;
	start_date?: string;
	end_date?: string;
	actual_end_date?: string;
	progress_percent: number;
	budget_allocated: number;
	budget_spent: number;
	budget_utilization: number;
	is_overdue: boolean;
	is_confidential: boolean;
	is_archived: boolean;
	is_template: boolean;
	tags: string[];
	owner: UserMinimal;
	manager?: UserMinimal;
	member_count?: number;
	task_count?: number;
	open_risks?: number;
	members?: ProjectMember[];
	kanban_boards?: KanbanBoard[];
	sprints?: Sprint[];
	milestones?: Milestone[];
	risks?: Risk[];
	documents?: ProjectDocument[];
	expenses?: Expense[];
	meetings?: ProjectMeeting[];
	task_stats?: TaskStats;
	activity_feed?: ProjectActivity[];
	budget_summary?: BudgetSummary;
	created_at: string;
	updated_at: string;
	department?: UUID;
	branch?: UUID;
}

export interface TaskStats {
	total: number;
	completed: number;
	overdue: number;
	by_status: Record<TaskStatus, number>;
}

// ── Project Member ────────────────────────────────────────────────────────────

export interface ProjectMember {
	id: UUID;
	user: UserMinimal;
	role: MemberRole;
	allocation_percent: number;
	joined_at: string;
	left_at?: string;
	is_active: boolean;
}

// ── Kanban ────────────────────────────────────────────────────────────────────

export interface KanbanColumn {
	id: UUID;
	name: string;
	color: string;
	position: number;
	wip_limit?: number;
	maps_to_status?: TaskStatus;
	task_count: number;
	tasks?: Task[];
}

export interface KanbanBoard {
	id: UUID;
	name: string;
	description: string;
	is_default: boolean;
	columns: KanbanColumn[];
}

export interface KanbanData {
	board: KanbanBoard;
	columns: KanbanColumn[];
}

// ── Sprint ────────────────────────────────────────────────────────────────────

export interface Sprint {
	id: UUID;
	name: string;
	goal: string;
	status: SprintStatus;
	start_date: string;
	end_date: string;
	velocity?: number;
	task_count: number;
	done_count: number;
	created_at: string;
}

// ── Milestone ─────────────────────────────────────────────────────────────────

export interface Milestone {
	id: UUID;
	name: string;
	description: string;
	due_date: string;
	completed_date?: string;
	status: MilestoneStatus;
	owner?: UserMinimal;
	is_overdue: boolean;
	task_count: number;
}

// ── Task ──────────────────────────────────────────────────────────────────────

export interface Task {
	id: UUID;
	project: UUID;
	reference: string;
	title: string;
	description?: string;
	status: TaskStatus;
	priority: TaskPriority;
	start_date?: string;
	due_date?: string;
	completed_at?: string;
	progress_percent: number;
	estimated_hours?: number;
	logged_hours: number;
	story_points?: number;
	tags: string[];
	labels: string[];
	kanban_position: number;
	kanban_column?: UUID;
	assignees: UserMinimal[];
	reporter: UserMinimal;
	is_overdue: boolean;
	subtask_count?: number;
	attachment_count?: number;
	comment_count?: number;
	milestone?: UUID;
	sprint?: UUID;
	parent?: UUID;
	// Detail fields
	checklists?: TaskChecklist[];
	comments?: Comment[];
	attachments?: TaskAttachment[];
	submissions?: TaskSubmission[];
	time_logs?: TimeLog[];
	subtasks?: Task[];
	predecessors?: TaskDependency[];
	successors?: TaskDependency[];
	requires_approval: boolean;
}

export interface TaskDependency {
	id: UUID;
	predecessor: UUID;
	successor: UUID;
	dependency_type: DependencyType;
	lag_days: number;
}

// ── Submission ────────────────────────────────────────────────────────────────

export interface TaskSubmission {
	id: UUID;
	notes: string;
	status: "pending" | "approved" | "rejected";
	submitted_by: UserMinimal;
	reviewed_by?: UserMinimal;
	reviewed_at?: string;
	review_notes?: string;
	attachments: TaskAttachment[];
	comments: Comment[];
	created_at: string;
}

// ── Attachment ────────────────────────────────────────────────────────────────

export interface TaskAttachment {
	id: UUID;
	file_name: string;
	file_url: string;
	file_size?: number;
	mime_type?: string;
	uploaded_by: UserMinimal;
	created_at: string;
}

// ── Time Log ──────────────────────────────────────────────────────────────────

export interface TimeLog {
	id: UUID;
	date: string;
	hours: number;
	description: string;
	is_billable: boolean;
	logged_by: UserMinimal;
	created_at: string;
}

// ── Checklist ─────────────────────────────────────────────────────────────────

export interface ChecklistItem {
	id: UUID;
	text: string;
	is_done: boolean;
	completed_by?: UserMinimal;
	completed_at?: string;
	position: number;
}

export interface TaskChecklist {
	id: UUID;
	title: string;
	position: number;
	items: ChecklistItem[];
	completion_percent: number;
}

// ── Comment ───────────────────────────────────────────────────────────────────

export interface Comment {
	id: UUID;
	author: UserMinimal;
	body: string;
	comment_type: "general" | "feedback" | "approval" | "rejection";
	parent?: UUID;
	is_edited: boolean;
	replies: Comment[];
	created_at: string;
	updated_at: string;
}

// ── Risk ──────────────────────────────────────────────────────────────────────

export interface Risk {
	id: UUID;
	title: string;
	description: string;
	category: string;
	severity: RiskSeverity;
	probability: number;
	impact_score: number;
	risk_score: number;
	status: RiskStatus;
	mitigation_plan: string;
	contingency_plan: string;
	owner?: UserMinimal;
	due_date?: string;
	resolved_at?: string;
	created_at: string;
}

// ── Expense (Budget Tracking) ───────────────────────────────────────────────

export type ExpenseCategory =
	| "labor"
	| "equipment"
	| "travel"
	| "materials"
	| "software"
	| "services"
	| "venue"
	| "marketing"
	| "contingency"
	| "other";

export type ExpenseStatus = "pending" | "approved" | "rejected";

export interface Expense {
	id: UUID;
	title: string;
	description: string;
	category: ExpenseCategory;
	amount: number;
	currency: string;
	incurred_on: string;
	status: ExpenseStatus;
	submitted_by?: UserMinimal;
	reviewed_by?: UserMinimal;
	reviewed_at?: string;
	review_notes?: string;
	receipt_url?: string;
	task?: UUID;
	created_at: string;
}

export interface BudgetSummary {
	total_logged: number;
	approved_total: number;
	pending_total: number;
	pending_count: number;
	by_category: Record<string, number>;
}

// ── Document ──────────────────────────────────────────────────────────────────

export interface ProjectDocument {
	id: UUID;
	title: string;
	doc_type: DocType;
	description: string;
	file_url: string;
	file_name: string;
	file_size?: number;
	mime_type?: string;
	version: string;
	is_latest: boolean;
	uploaded_by: UserMinimal;
	created_at: string;
}

// ── Activity ──────────────────────────────────────────────────────────────────

export interface ProjectActivity {
	id: UUID;
	actor: UserMinimal;
	verb: string;
	description: string;
	task?: UUID;
	meta: Record<string, unknown>;
	created_at: string;
}

// ── Meeting ───────────────────────────────────────────────────────────────────

export interface ProjectMeeting {
	id: UUID;
	title: string;
	description: string;
	scheduled_at: string;
	duration_min: number;
	location: string;
	organizer: UserMinimal;
	attendees: UserMinimal[];
	minutes: string;
	is_completed: boolean;
	gcal_event_id?: string;
	created_at: string;
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface ProjectAnalytics {
	project_id: UUID;
	code: string;
	progress_percent: number;
	budget_utilization: number;
	task_stats: {
		total: number;
		by_status: Record<string, number>;
		by_priority: Record<string, number>;
		overdue: number;
		total_estimated_hours: number;
		total_logged_hours: number;
	};
	risk_stats: {
		total: number;
		by_severity: Record<string, number>;
		open: number;
	};
	member_stats: Array<{
		user_id: UUID;
		name: string;
		role: MemberRole;
		task_count: number;
		completed: number;
		logged_hours: number;
	}>;
	sprint_stats: Array<{
		id: UUID;
		name: string;
		status: SprintStatus;
		total: number;
		done: number;
		velocity?: number;
	}>;
}

// ── Gantt ─────────────────────────────────────────────────────────────────────

export interface GanttData {
	project: { id: UUID; name: string; start_date?: string; end_date?: string };
	tasks: GanttTask[];
	milestones: Milestone[];
	sprints: Sprint[];
}

export interface GanttTask {
	id: UUID;
	reference: string;
	title: string;
	status: TaskStatus;
	priority: TaskPriority;
	start_date?: string;
	due_date?: string;
	progress_percent: number;
	parent?: UUID;
	assignees: UserMinimal[];
	dependencies: UUID[];
	milestone_name?: string;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardData {
	summary: {
		active_projects: number;
		total_projects: number;
		my_open_tasks: number;
		overdue_tasks: number;
		due_this_week: number;
	};
	recent_projects: Project[];
	my_overdue_tasks: Task[];
	due_this_week: Task[];
}

// ── Notification Preferences ──────────────────────────────────────────────────

export interface NotificationPref {
	task_assigned: boolean;
	task_due: boolean;
	task_overdue: boolean;
	status_change: boolean;
	new_comment: boolean;
	mention: boolean;
	milestone_due: boolean;
	risk_escalated: boolean;
}

// ── API Pagination ────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
	count: number;
	next?: string;
	previous?: string;
	results: T[];
}

// ── Filter State ──────────────────────────────────────────────────────────────

export interface ProjectFilters {
	status?: ProjectStatus;
	priority?: ProjectPriority;
	search?: string;
	ordering?: string;
}

export interface TaskFilters {
	status?: TaskStatus;
	priority?: TaskPriority;
	sprint?: UUID;
	milestone?: UUID;
	search?: string;
}
