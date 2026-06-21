// ─────────────────────────────────────────────────────────────────────────────
// Enterprise Internship Management System
// Projects Module — API Client
//
// Uses the shared axios instance + auth/refresh interceptors from
// src/services/api.ts instead of a standalone fetch client, so this module
// shares JWT handling, 401-refresh, and logout-on-failure with the rest
// of the app.
//
// Mounted under a distinct prefix (/project-management/) so it does not
// collide with the existing flat /projects/ "project deliverable" feature
// already served by projectSubmissionsApi in src/services/api.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { api } from "@/services/api";
import {
	Project,
	ProjectMember,
	KanbanBoard,
	KanbanColumn,
	KanbanData,
	Sprint,
	Milestone,
	Task,
	TaskSubmission,
	TaskAttachment,
	TimeLog,
	TaskChecklist,
	Comment,
	Risk,
	ProjectDocument,
	Expense,
	BudgetSummary,
	ProjectActivity,
	ProjectMeeting,
	ProjectAnalytics,
	GanttData,
	DashboardData,
	NotificationPref,
	PaginatedResponse,
	ProjectFilters,
	TaskFilters,
	UUID,
} from "./types";

// All routes for this module live under this prefix on the backend
// (see backend root urls.py: path('api/v1/project-management/', include('apps.projects.urls')))
const PM = "/project-management";

// ── Helper: unwrap axios response, strip undefined params ───────────────────

const unwrap = <T>(p: Promise<{ data: T }>): Promise<T> =>
	p.then((r) => r.data);

/**
 * Safely extracts an array from an axios response, regardless of whether
 * the backend returns a bare array or a DRF-paginated envelope
 * ({ count, next, previous, results: [...] }). Prevents "X.map is not a
 * function" crashes when pagination is enabled globally in Django settings
 * but a given endpoint's frontend caller expects a plain array.
 */
const unwrapList = <T>(p: Promise<{ data: unknown }>): Promise<T[]> =>
	p.then((r) => {
		const data = r.data;
		if (Array.isArray(data)) return data as T[];
		if (
			data &&
			typeof data === "object" &&
			Array.isArray((data as any).results)
		) {
			return (data as any).results as T[];
		}
		return [];
	});

function cleanParams(params?: Record<string, unknown>) {
	if (!params) return undefined;
	return Object.fromEntries(
		Object.entries(params).filter(([, v]) => v !== undefined),
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECTS
// ─────────────────────────────────────────────────────────────────────────────

export const projectsApi = {
	list: (filters?: ProjectFilters) =>
		unwrap<PaginatedResponse<Project>>(
			api.get(`${PM}/projects/`, { params: cleanParams({ ...filters }) }),
		),

	get: (id: UUID) => unwrap<Project>(api.get(`${PM}/projects/${id}/`)),

	create: (data: Partial<Project>) =>
		unwrap<Project>(api.post(`${PM}/projects/`, data)),

	update: (id: UUID, data: Partial<Project>) =>
		unwrap<Project>(api.patch(`${PM}/projects/${id}/`, data)),

	delete: (id: UUID) => unwrap<void>(api.delete(`${PM}/projects/${id}/`)),

	restore: (id: UUID) => unwrap(api.post(`${PM}/projects/${id}/restore/`)),

	duplicate: (id: UUID) =>
		unwrap<Project>(api.post(`${PM}/projects/${id}/duplicate/`)),

	analytics: (id: UUID) =>
		unwrap<ProjectAnalytics>(api.get(`${PM}/projects/${id}/analytics/`)),

	gantt: (id: UUID) =>
		unwrap<GanttData>(api.get(`${PM}/projects/${id}/gantt/`)),

	kanban: (id: UUID) =>
		unwrap<KanbanData>(api.get(`${PM}/projects/${id}/kanban/`)),

	kanbanMove: (id: UUID, taskId: UUID, targetColumn: UUID, position: number) =>
		unwrap(
			api.post(`${PM}/projects/${id}/kanban/move/`, {
				task_id: taskId,
				target_column: targetColumn,
				position,
			}),
		),

	activity: (id: UUID) =>
		unwrapList<ProjectActivity>(api.get(`${PM}/projects/${id}/activity/`)),

	dashboard: () => unwrap<DashboardData>(api.get(`${PM}/dashboard/`)),

	getNotificationPrefs: (id: UUID) =>
		unwrap<NotificationPref>(
			api.get(`${PM}/projects/${id}/notification-preferences/`),
		),

	updateNotificationPrefs: (id: UUID, data: Partial<NotificationPref>) =>
		unwrap<NotificationPref>(
			api.put(`${PM}/projects/${id}/notification-preferences/`, data),
		),
};

// ─────────────────────────────────────────────────────────────────────────────
// MEMBERS
// ─────────────────────────────────────────────────────────────────────────────

export const membersApi = {
	list: (projectId: UUID) =>
		unwrapList<ProjectMember>(api.get(`${PM}/projects/${projectId}/members/`)),

	add: (
		projectId: UUID,
		data: { user_id: UUID; role: string; allocation_percent?: number },
	) =>
		unwrap<ProjectMember>(
			api.post(`${PM}/projects/${projectId}/members/`, data),
		),

	update: (projectId: UUID, memberId: UUID, data: Partial<ProjectMember>) =>
		unwrap<ProjectMember>(
			api.patch(`${PM}/projects/${projectId}/members/${memberId}/`, data),
		),

	remove: (projectId: UUID, memberId: UUID) =>
		unwrap<void>(
			api.delete(`${PM}/projects/${projectId}/members/${memberId}/`),
		),
};

// ─────────────────────────────────────────────────────────────────────────────
// KANBAN
// ─────────────────────────────────────────────────────────────────────────────

export const kanbanApi = {
	listBoards: (projectId: UUID) =>
		unwrapList<KanbanBoard>(api.get(`${PM}/projects/${projectId}/kanban/`)),

	createBoard: (projectId: UUID, data: Partial<KanbanBoard>) =>
		unwrap<KanbanBoard>(api.post(`${PM}/projects/${projectId}/kanban/`, data)),

	createColumn: (projectId: UUID, boardId: UUID, data: Partial<KanbanColumn>) =>
		unwrap<KanbanColumn>(
			api.post(`${PM}/projects/${projectId}/kanban/${boardId}/columns/`, data),
		),

	updateColumn: (
		projectId: UUID,
		boardId: UUID,
		colId: UUID,
		data: Partial<KanbanColumn>,
	) =>
		unwrap<KanbanColumn>(
			api.patch(
				`${PM}/projects/${projectId}/kanban/${boardId}/columns/${colId}/`,
				data,
			),
		),

	deleteColumn: (projectId: UUID, boardId: UUID, colId: UUID) =>
		unwrap<void>(
			api.delete(
				`${PM}/projects/${projectId}/kanban/${boardId}/columns/${colId}/`,
			),
		),

	reorderColumns: (
		projectId: UUID,
		boardId: UUID,
		columns: Array<{ id: UUID; position: number }>,
	) =>
		unwrap(
			api.post(
				`${PM}/projects/${projectId}/kanban/${boardId}/columns/reorder/`,
				{ columns },
			),
		),
};

// ─────────────────────────────────────────────────────────────────────────────
// SPRINTS
// ─────────────────────────────────────────────────────────────────────────────

export const sprintsApi = {
	list: (projectId: UUID) =>
		unwrapList<Sprint>(api.get(`${PM}/projects/${projectId}/sprints/`)),

	create: (projectId: UUID, data: Partial<Sprint>) =>
		unwrap<Sprint>(api.post(`${PM}/projects/${projectId}/sprints/`, data)),

	update: (projectId: UUID, id: UUID, data: Partial<Sprint>) =>
		unwrap<Sprint>(
			api.patch(`${PM}/projects/${projectId}/sprints/${id}/`, data),
		),

	start: (projectId: UUID, id: UUID) =>
		unwrap<Sprint>(
			api.post(`${PM}/projects/${projectId}/sprints/${id}/start/`),
		),

	complete: (projectId: UUID, id: UUID) =>
		unwrap<Sprint>(
			api.post(`${PM}/projects/${projectId}/sprints/${id}/complete/`),
		),

	delete: (projectId: UUID, id: UUID) =>
		unwrap<void>(api.delete(`${PM}/projects/${projectId}/sprints/${id}/`)),
};

// ─────────────────────────────────────────────────────────────────────────────
// MILESTONES
// ─────────────────────────────────────────────────────────────────────────────

export const milestonesApi = {
	list: (projectId: UUID) =>
		unwrapList<Milestone>(api.get(`${PM}/projects/${projectId}/milestones/`)),

	create: (projectId: UUID, data: Partial<Milestone>) =>
		unwrap<Milestone>(
			api.post(`${PM}/projects/${projectId}/milestones/`, data),
		),

	update: (projectId: UUID, id: UUID, data: Partial<Milestone>) =>
		unwrap<Milestone>(
			api.patch(`${PM}/projects/${projectId}/milestones/${id}/`, data),
		),

	complete: (projectId: UUID, id: UUID) =>
		unwrap<Milestone>(
			api.post(`${PM}/projects/${projectId}/milestones/${id}/complete/`),
		),

	delete: (projectId: UUID, id: UUID) =>
		unwrap<void>(api.delete(`${PM}/projects/${projectId}/milestones/${id}/`)),
};

// ─────────────────────────────────────────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────────────────────────────────────────

export const tasksApi = {
	list: (projectId: UUID, filters?: TaskFilters) =>
		unwrap<PaginatedResponse<Task>>(
			api.get(`${PM}/projects/${projectId}/tasks/`, {
				params: cleanParams({ ...filters }),
			}),
		),

	get: (projectId: UUID, taskId: UUID) =>
		unwrap<Task>(api.get(`${PM}/projects/${projectId}/tasks/${taskId}/`)),

	create: (projectId: UUID, data: Partial<Task> & { assignee_ids?: UUID[] }) =>
		unwrap<Task>(api.post(`${PM}/projects/${projectId}/tasks/`, data)),

	update: (
		projectId: UUID,
		taskId: UUID,
		data: Partial<Task> & { assignee_ids?: UUID[] },
	) =>
		unwrap<Task>(
			api.patch(`${PM}/projects/${projectId}/tasks/${taskId}/`, data),
		),

	delete: (projectId: UUID, taskId: UUID) =>
		unwrap<void>(api.delete(`${PM}/projects/${projectId}/tasks/${taskId}/`)),

	extendDeadline: (
		projectId: UUID,
		taskId: UUID,
		due_date: string,
		reason: string,
	) =>
		unwrap<Task>(
			api.post(`${PM}/projects/${projectId}/tasks/${taskId}/extend-deadline/`, {
				due_date,
				reason,
			}),
		),

	addDependency: (
		projectId: UUID,
		taskId: UUID,
		predecessor_id: UUID,
		type?: string,
	) =>
		unwrap(
			api.post(`${PM}/projects/${projectId}/tasks/${taskId}/dependencies/`, {
				predecessor_id,
				dependency_type: type,
			}),
		),

	// Comments
	listComments: (projectId: UUID, taskId: UUID) =>
		unwrapList<Comment>(
			api.get(`${PM}/projects/${projectId}/tasks/${taskId}/comments/`),
		),

	addComment: (projectId: UUID, taskId: UUID, body: string, parent?: UUID) =>
		unwrap<Comment>(
			api.post(`${PM}/projects/${projectId}/tasks/${taskId}/comments/`, {
				body,
				parent,
			}),
		),

	// Time logs
	listTimeLogs: (projectId: UUID, taskId: UUID) =>
		unwrapList<TimeLog>(
			api.get(`${PM}/projects/${projectId}/tasks/${taskId}/time-logs/`),
		),

	logTime: (projectId: UUID, taskId: UUID, data: Partial<TimeLog>) =>
		unwrap<TimeLog>(
			api.post(`${PM}/projects/${projectId}/tasks/${taskId}/time-logs/`, data),
		),

	// Submissions
	listSubmissions: (projectId: UUID, taskId: UUID) =>
		unwrapList<TaskSubmission>(
			api.get(`${PM}/projects/${projectId}/tasks/${taskId}/submissions/`),
		),

	submit: (projectId: UUID, taskId: UUID, notes: string) =>
		unwrap<TaskSubmission>(
			api.post(`${PM}/projects/${projectId}/tasks/${taskId}/submissions/`, {
				notes,
			}),
		),

	reviewSubmission: (
		projectId: UUID,
		taskId: UUID,
		subId: UUID,
		action: "approve" | "reject",
		notes?: string,
	) =>
		unwrap<TaskSubmission>(
			api.post(
				`${PM}/projects/${projectId}/tasks/${taskId}/submissions/${subId}/review/`,
				{ action, notes },
			),
		),

	// Attachments
	uploadAttachment: (
		projectId: UUID,
		taskId: UUID,
		data: Partial<TaskAttachment>,
	) =>
		unwrap<TaskAttachment>(
			api.post(
				`${PM}/projects/${projectId}/tasks/${taskId}/attachments/`,
				data,
			),
		),

	// Checklists
	listChecklists: (projectId: UUID, taskId: UUID) =>
		unwrapList<TaskChecklist>(
			api.get(`${PM}/projects/${projectId}/tasks/${taskId}/checklists/`),
		),

	createChecklist: (projectId: UUID, taskId: UUID, title: string) =>
		unwrap<TaskChecklist>(
			api.post(`${PM}/projects/${projectId}/tasks/${taskId}/checklists/`, {
				title,
			}),
		),

	toggleChecklistItem: (
		projectId: UUID,
		taskId: UUID,
		checklistId: UUID,
		itemId: UUID,
		is_done: boolean,
	) =>
		unwrap(
			api.patch(
				`${PM}/projects/${projectId}/tasks/${taskId}/checklists/${checklistId}/items/${itemId}/`,
				{ is_done },
			),
		),
};

// ─────────────────────────────────────────────────────────────────────────────
// RISKS
// ─────────────────────────────────────────────────────────────────────────────

export const risksApi = {
	list: (projectId: UUID) =>
		unwrapList<Risk>(api.get(`${PM}/projects/${projectId}/risks/`)),

	create: (projectId: UUID, data: Partial<Risk>) =>
		unwrap<Risk>(api.post(`${PM}/projects/${projectId}/risks/`, data)),

	update: (projectId: UUID, id: UUID, data: Partial<Risk>) =>
		unwrap<Risk>(api.patch(`${PM}/projects/${projectId}/risks/${id}/`, data)),

	resolve: (projectId: UUID, id: UUID) =>
		unwrap<Risk>(api.post(`${PM}/projects/${projectId}/risks/${id}/resolve/`)),

	delete: (projectId: UUID, id: UUID) =>
		unwrap<void>(api.delete(`${PM}/projects/${projectId}/risks/${id}/`)),
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSES (Budget Tracking)
// ─────────────────────────────────────────────────────────────────────────────

export const expensesApi = {
	list: (projectId: UUID) =>
		unwrapList<Expense>(api.get(`${PM}/projects/${projectId}/expenses/`)),

	create: (projectId: UUID, data: Partial<Expense>) =>
		unwrap<Expense>(api.post(`${PM}/projects/${projectId}/expenses/`, data)),

	update: (projectId: UUID, id: UUID, data: Partial<Expense>) =>
		unwrap<Expense>(
			api.patch(`${PM}/projects/${projectId}/expenses/${id}/`, data),
		),

	approve: (projectId: UUID, id: UUID, notes?: string) =>
		unwrap<Expense>(
			api.post(`${PM}/projects/${projectId}/expenses/${id}/approve/`, {
				notes,
			}),
		),

	reject: (projectId: UUID, id: UUID, notes?: string) =>
		unwrap<Expense>(
			api.post(`${PM}/projects/${projectId}/expenses/${id}/reject/`, { notes }),
		),

	delete: (projectId: UUID, id: UUID) =>
		unwrap<void>(api.delete(`${PM}/projects/${projectId}/expenses/${id}/`)),
};

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTS
// ─────────────────────────────────────────────────────────────────────────────

export const documentsApi = {
	list: (projectId: UUID) =>
		unwrapList<ProjectDocument>(
			api.get(`${PM}/projects/${projectId}/documents/`),
		),

	upload: (projectId: UUID, data: Partial<ProjectDocument>) =>
		unwrap<ProjectDocument>(
			api.post(`${PM}/projects/${projectId}/documents/`, data),
		),

	delete: (projectId: UUID, id: UUID) =>
		unwrap<void>(api.delete(`${PM}/projects/${projectId}/documents/${id}/`)),
};

// ─────────────────────────────────────────────────────────────────────────────
// MEETINGS
// ─────────────────────────────────────────────────────────────────────────────

export const meetingsApi = {
	list: (projectId: UUID) =>
		unwrapList<ProjectMeeting>(
			api.get(`${PM}/projects/${projectId}/meetings/`),
		),

	create: (
		projectId: UUID,
		data: Partial<ProjectMeeting> & { attendee_ids?: UUID[] },
	) =>
		unwrap<ProjectMeeting>(
			api.post(`${PM}/projects/${projectId}/meetings/`, data),
		),

	update: (projectId: UUID, id: UUID, data: Partial<ProjectMeeting>) =>
		unwrap<ProjectMeeting>(
			api.patch(`${PM}/projects/${projectId}/meetings/${id}/`, data),
		),

	complete: (projectId: UUID, id: UUID, minutes?: string) =>
		unwrap<ProjectMeeting>(
			api.post(`${PM}/projects/${projectId}/meetings/${id}/complete/`, {
				minutes,
			}),
		),

	delete: (projectId: UUID, id: UUID) =>
		unwrap<void>(api.delete(`${PM}/projects/${projectId}/meetings/${id}/`)),
};
