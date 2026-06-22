// Nexus Enterprise — Complete API Service Layer
// Every endpoint used by every page

import axios, { AxiosInstance } from "axios";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const BASE_URL =
	(import.meta as any).env?.VITE_API_URL ?? "http://127.0.0.1:8000/api/v1";

// ── Axios instance ─────────────────────────────────────────────────────────
export const api: AxiosInstance = axios.create({
	baseURL: BASE_URL,
	headers: { "Content-Type": "application/json" },
	timeout: 30000,
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
	const token = useAuthStore.getState().accessToken;
	if (token) config.headers.Authorization = `Bearer ${token}`;
	return config;
});

api.interceptors.response.use(
	(res) => res,
	async (error) => {
		const original = error.config;
		if (!error.response) return Promise.reject(error);

		// Don't intercept auth endpoints — avoids refresh loop
		if (original.url?.includes("/auth/")) return Promise.reject(error);

		if (error.response?.status === 401 && !original._retry) {
			original._retry = true;
			try {
				const refresh = useAuthStore.getState().refreshToken;
				if (!refresh) throw new Error("No refresh token");
				const { data } = await axios.post(BASE_URL + "/auth/refresh/", {
					refresh,
				});
				useAuthStore.getState().setTokens(data.access, refresh);
				original.headers.Authorization = "Bearer " + data.access;
				return api(original);
			} catch {
				useAuthStore.getState().logout();
			}
		}
		return Promise.reject(error);
	},
);

// ── Auth Store ─────────────────────────────────────────────────────────────
export interface User {
	id: string;
	email: string;
	first_name: string;
	last_name: string;
	full_name: string;
	role: string;
	role_display: string;
	organisation: string | null;
	organisation_name: string | null;
	branch: {
		latitude: string;
		longitude: string;
		geofence_radius?: number;
	} | null;

	branch_name: string | null;
	department: string | null;
	department_name: string | null;
	profile_photo: string | null;
	mfa_enabled: boolean;
	phone?: string;
	bio?: string;
	notification_email?: boolean;
	notification_sms?: boolean;
	notification_push?: boolean;
	employee_id?: string;
	emergency_contact_name?: string;
	emergency_contact_phone?: string;
	date_joined?: string;
	last_login?: string;
	is_active?: boolean;
	must_change_password?: boolean;
	profile_complete?: boolean;
}

interface AuthState {
	user: User | null;
	accessToken: string | null;
	refreshToken: string | null;
	/** True after login when the user still needs to complete MFA */
	mfaRequired: boolean;
	isAuthenticated: boolean;
	setAuth: (
		user: User,
		access: string,
		refresh: string,
		mfaRequired?: boolean,
	) => void;
	setTokens: (access: string, refresh: string) => void;
	setUser: (user: User) => void;
	logout: () => void;
}

export const useAuthStore = create<AuthState>()(
	persist(
		(set) => ({
			user: null,
			accessToken: null,
			refreshToken: null,
			mfaRequired: false,
			isAuthenticated: false,

			setAuth: (user, access, refresh, mfaRequired = false) =>
				set({
					user,
					accessToken: access,
					refreshToken: refresh,
					mfaRequired,
					// Only fully authenticated once MFA is cleared
					isAuthenticated: !mfaRequired,
				}),

			setTokens: (access, refresh) =>
				set({ accessToken: access, refreshToken: refresh }),

			setUser: (user) => set({ user }),

			logout: () =>
				set({
					user: null,
					accessToken: null,
					refreshToken: null,
					isAuthenticated: false,
					mfaRequired: false,
				}),
		}),
		{
			name: "nexus-auth",
			// mfaRequired is intentionally NOT persisted so a browser reload
			// on the /mfa page always redirects back to /login
			partialize: (s) => ({
				user: s.user,
				accessToken: s.accessToken,
				refreshToken: s.refreshToken,
				isAuthenticated: s.isAuthenticated,
			}),
		},
	),
);

// ── Helper ─────────────────────────────────────────────────────────────────
const safeArray = (data: any): any[] => {
	if (!data) return [];
	if (Array.isArray(data)) return data;
	if (Array.isArray(data.results)) return data.results;
	return [];
};

// ── Auth ───────────────────────────────────────────────────────────────────
export const authApi = {
	login: (email: string, password: string) =>
		axios.post(BASE_URL + "/auth/login/", { email, password }),

	logout: (refresh: string) => api.post("/auth/logout/", { refresh }),

	refresh: (refresh: string) =>
		axios.post(BASE_URL + "/auth/refresh/", { refresh }),

	/**
	 * Verify MFA code.
	 * @param token  - 6-digit OTP
	 * @param method - "email" (default) | "totp" (authenticator app)
	 */
	verifyMfa: (token: string, method: "email" | "totp" = "email") =>
		api.post("/auth/mfa/verify/", { token, method }),

	/**
	 * Request a new email OTP — invalidates any previous code.
	 */
	resendMfa: () => api.post("/auth/mfa/resend/"),

	profile: () => api.get("/accounts/profile/"),
	updateProfile: (data: Partial<User>) => api.patch("/accounts/profile/", data),
	updateProfileMultipart: (data: FormData) =>
		api.patch("/accounts/profile/", data, {
			headers: { "Content-Type": "multipart/form-data" },
		}),
	changePassword: (data: any) => api.post("/accounts/profile/password/", data),
	mfaSetup: () => api.get("/accounts/mfa/setup/"),
	mfaEnable: (token: string) => api.post("/accounts/mfa/setup/", { token }),
	mfaDisable: (data: any) => api.post("/accounts/mfa/disable/", data),
};

// ── Users ──────────────────────────────────────────────────────────────────
export const usersApi = {
	list: (params?: any) => api.get("/accounts/users/", { params }),
	detail: (id: string) => api.get("/accounts/users/" + id + "/"),
	create: (data: any) => api.post("/accounts/users/", data),
	update: (id: string, data: any) =>
		api.patch("/accounts/users/" + id + "/", data),
	deactivate: (id: string) => api.delete("/accounts/users/" + id + "/"),

	// NEW
	activate: (id: string) => api.post("/accounts/users/" + id + "/activate/"),
	// NEW
	adminResetPassword: (id: string, password?: string) =>
		api.post("/accounts/users/" + id + "/reset-password/", { password }),
	// NEW
	changeRole: (id: string, role: string) =>
		api.post("/accounts/users/" + id + "/change-role/", { role }),
	// NEW
	listSupervisors: () => api.get("/accounts/users/supervisors/"),
	// NEW
	export: (params?: any) =>
		api.get("/accounts/users/export/", { params, responseType: "blob" }),

	stats: () => api.get("/accounts/users/stats/"),
	bulkImport: (file: File) => {
		const form = new FormData();
		form.append("file", file);
		return api.post("/accounts/users/bulk-import/", form, {
			headers: { "Content-Type": "multipart/form-data" },
		});
	},

	// NEW
	bulkActivate: (ids: string[]) =>
		api.post("/accounts/users/bulk-activate/", { ids }),
	// NEW
	bulkDeactivate: (ids: string[]) =>
		api.post("/accounts/users/bulk-deactivate/", { ids }),
	// NEW
	bulkChangeRole: (ids: string[], role: string) =>
		api.post("/accounts/users/bulk-change-role/", { ids, role }),
	// NEW
	bulkReassign: (
		ids: string[],
		data: { branch?: string; department?: string },
	) => api.post("/accounts/users/bulk-reassign/", { ids, ...data }),

	sessions: () => api.get("/accounts/sessions/"),
	revokeSession: (id: string) =>
		api.post("/accounts/sessions/" + id + "/revoke/"),

	// NEW
	userSessions: (id: string) => api.get("/accounts/users/" + id + "/sessions/"),
	// NEW
	revokeUserSession: (sessionId: string) =>
		api.post("/accounts/sessions/" + sessionId + "/admin-revoke/"),
	// NEW
	revokeAllUserSessions: (id: string) =>
		api.post("/accounts/users/" + id + "/sessions/revoke-all/"),

	auditLog: (params?: any) => api.get("/accounts/audit-log/", { params }),
};

// ── HR / Organisation ──────────────────────────────────────────────────────
export const hrApi = {
	// ── Organisation structure ────────────────────────────────────────────────
	departments: (params?: any) => api.get("/accounts/departments/", { params }),
	createDept: (data: any) => api.post("/accounts/departments/", data),
	updateDept: (id: string, data: any) =>
		api.patch("/accounts/departments/" + id + "/", data),
	deleteDept: (id: string) => api.delete("/accounts/departments/" + id + "/"),

	branches: (params?: any) => api.get("/accounts/branches/", { params }),
	createBranch: (data: any) => api.post("/accounts/branches/", data),
	updateBranch: (id: string, data: any) =>
		api.patch("/accounts/branches/" + id + "/", data),
	deleteBranch: (id: string) => api.delete("/accounts/branches/" + id + "/"),

	organisation: () => api.get("/accounts/organisation/"),
	updateOrg: (data: any) => api.patch("/accounts/organisation/", data),

	// ── Attachees ─────────────────────────────────────────────────────────────
	attacheePrograms: (params?: any) => api.get("/attachees/", { params }),
	onboard: (data: any) => api.post("/attachees/onboard/", data),
	offboard: (id: string, data: any) =>
		api.post("/attachees/" + id + "/offboard/", data),

	// ── Training ──────────────────────────────────────────────────────────────
	programs: (params?: any) => api.get("/training/programs/", { params }),
	createProgram: (data: any) => api.post("/training/programs/", data),
	updateProgram: (id: string, data: any) =>
		api.patch("/training/programs/" + id + "/", data),
	deleteProgram: (id: string) => api.delete("/training/programs/" + id + "/"),
	programEnrollments: (id: string, params?: any) =>
		api.get("/training/programs/" + id + "/enrollments/", { params }),
	enrollInProgram: (id: string, data: any) =>
		api.post("/training/programs/" + id + "/enroll/", data),
	completeProgram: (id: string, data: any) =>
		api.post("/training/programs/" + id + "/complete/", data),

	// ── Recruitment ───────────────────────────────────────────────────────────
	jobPostings: (params?: any) => api.get("/recruitment/jobs/", { params }),
	createJobPosting: (data: any) => api.post("/recruitment/jobs/", data),
	updateJobPosting: (id: string, data: any) =>
		api.patch("/recruitment/jobs/" + id + "/", data),
	deleteJobPosting: (id: string) => api.delete("/recruitment/jobs/" + id + "/"),
	applications: (params?: any) =>
		api.get("/recruitment/applications/", { params }),
	reviewApplication: (id: string, data: any) =>
		api.patch("/recruitment/applications/" + id + "/", data),

	// ── Violations ────────────────────────────────────────────────────────────
	violations: (params?: any) => api.get("/attendance/violations/", { params }),
	createViolation: (data: any) => api.post("/attendance/violations/", data),
	resolveViolation: (id: string, data: any) =>
		api.patch("/attendance/violations/" + id + "/", data),

	// ── Stipends (HR view) ────────────────────────────────────────────────────
	stipends: (params?: any) => api.get("/finance/stipends/", { params }),
	createStipend: (data: any) => api.post("/finance/stipends/", data),
	updateStipend: (id: string, data: any) =>
		api.patch("/finance/stipends/" + id + "/", data),
	processStipend: (id: string) =>
		api.post("/finance/stipends/" + id + "/process/"),
};

// ── Attendance ─────────────────────────────────────────────────────────────
export const attendanceApi = {
	checkIn: (data: any) => api.post("/attendance/check-in/", data),
	checkOut: (data: any) => api.post("/attendance/check-out/", data),
	today: () => api.get("/attendance/today/"),
	history: (params?: any) => api.get("/attendance/history/", { params }),
	leaveRequests: (params?: any) => api.get("/attendance/leave/", { params }),
	submitLeave: (data: any) => api.post("/attendance/leave/", data),
	reviewLeave: (id: string, data: any) =>
		api.patch("/attendance/leave/" + id + "/", data),
	violations: (params?: any) => api.get("/attendance/violations/", { params }),
	updateLeave: (id: string, data: any) =>
		api.patch("/attendance/leave/" + id + "/", data),
	reportGeofenceViolation: (data: {
		latitude: number;
		longitude: number;
		distance_from_workplace: number;
	}) => api.post("/attendance/geofence-violation/", data),
};

// ── Tasks ──────────────────────────────────────────────────────────────────
// ── Attachee Tasks (flat, single-task assignment feature) ──────────────────
// NOTE: renamed from `tasksApi` to avoid colliding with the Kanban/Gantt
// project-management module's tasksApi (see src/pages/projects/api.ts),
// which is nested under /project-management/projects/{id}/tasks/.
export const attacheeTasksApi = {
	list: (params?: any) => api.get("/tasks/", { params }),
	detail: (id: string) => api.get("/tasks/" + id + "/"),
	create: (data: any) => api.post("/tasks/", data), // axios auto-sets multipart when data is FormData
	update: (id: string, data: any) => api.patch(`/tasks/${id}/`, data),
	submit: (id: string, data: any) =>
		api.post("/tasks/" + id + "/submit/", data),
	review: (id: string, data: any) =>
		api.post("/tasks/" + id + "/review/", data),
	requestExtension: (id: string, data: any) =>
		api.post("/tasks/" + id + "/extend/", data),
	delete: (id: string) => api.delete("/tasks/" + id + "/"),
};

export const tasksApi = {
	list: (params?: any) => api.get("/tasks/", { params }),
	detail: (id: string) => api.get("/tasks/" + id + "/"),
	create: (data: any) => api.post("/tasks/", data), // axios auto-sets multipart when data is FormData
	update: (id: string, data: any) => api.patch(`/tasks/${id}/`, data),
	submit: (id: string, data: any) =>
		api.post("/tasks/" + id + "/submit/", data),
	review: (id: string, data: any) =>
		api.post("/tasks/" + id + "/review/", data),
	requestExtension: (id: string, data: any) =>
		api.post("/tasks/" + id + "/extend/", data),
	delete: (id: string) => api.delete("/tasks/" + id + "/"),
};

// ── Logbooks ───────────────────────────────────────────────────────────────
const lbEntries = (lbId: string) => `/logbooks/${lbId}/entries`;

export const logbooksApi = {
	// Logbook CRUD
	list: (params?: any) => api.get("/logbooks/", { params }),
	detail: (id: string) => api.get("/logbooks/" + id + "/"),
	create: (data: any) => api.post("/logbooks/", data),
	update: (id: string, data: any) => api.patch("/logbooks/" + id + "/", data),
	remove: (id: string) => api.delete("/logbooks/" + id + "/"),

	// Logbook actions
	submitLogbook: (id: string) => api.post(`/logbooks/${id}/submit/`),
	approveLogbook: (id: string, data: any) =>
		api.post(`/logbooks/${id}/approve/`, data),
	sign: (id: string, data: { signature: string }) =>
		api.post(`/logbooks/${id}/sign/`, data),
	summary: (id: string) => api.get(`/logbooks/${id}/summary/`),
	export: (id: string) =>
		api.get(`/logbooks/${id}/export/`, { responseType: "blob" }),
	audit: (id: string) => api.get(`/logbooks/${id}/audit/`),

	// Entry CRUD
	entries: (logbookId: string, params?: any) =>
		api.get(`${lbEntries(logbookId)}/`, { params }),
	getEntry: (logbookId: string, entryId: string) =>
		api.get(`${lbEntries(logbookId)}/${entryId}/`),
	addEntry: (logbookId: string, data: any) =>
		api.post(`${lbEntries(logbookId)}/`, data),
	updateEntry: (logbookId: string, entryId: string, data: any) =>
		api.patch(`${lbEntries(logbookId)}/${entryId}/`, data),
	deleteEntry: (logbookId: string, entryId: string) =>
		api.delete(`${lbEntries(logbookId)}/${entryId}/`),
	// Kept for backward compatibility with any existing callers
	reviewEntry: (logbookId: string, entryId: string, data: any) =>
		api.patch(`${lbEntries(logbookId)}/${entryId}/`, data),

	// Entry actions
	submitEntry: (logbookId: string, entryId: string) =>
		api.post(`${lbEntries(logbookId)}/${entryId}/submit/`),
	approveEntry: (logbookId: string, entryId: string, data: any) =>
		api.post(`${lbEntries(logbookId)}/${entryId}/approve/`, data),
	rejectEntry: (logbookId: string, entryId: string, data: any) =>
		api.post(`${lbEntries(logbookId)}/${entryId}/reject/`, data),
	requestRevision: (logbookId: string, entryId: string, data: any) =>
		api.post(`${lbEntries(logbookId)}/${entryId}/request-revision/`, data),
	acknowledgeEntry: (logbookId: string, entryId: string) =>
		api.post(`${lbEntries(logbookId)}/${entryId}/acknowledge/`),

	// Attachments
	getAttachments: (logbookId: string, entryId: string) =>
		api.get(`${lbEntries(logbookId)}/${entryId}/attachments/`),
	uploadAttachment: (logbookId: string, entryId: string, formData: FormData) =>
		api.post(`${lbEntries(logbookId)}/${entryId}/attachments/`, formData, {
			headers: { "Content-Type": "multipart/form-data" },
		}),
	deleteAttachment: (
		logbookId: string,
		entryId: string,
		attachmentId: string,
	) =>
		api.delete(
			`${lbEntries(logbookId)}/${entryId}/attachments/${attachmentId}/`,
		),

	// Comments
	getComments: (logbookId: string, entryId: string) =>
		api.get(`${lbEntries(logbookId)}/${entryId}/comments/`),
	addComment: (logbookId: string, entryId: string, data: any) =>
		api.post(`${lbEntries(logbookId)}/${entryId}/comments/`, data),
	/** PATCH /api/v1/logbooks/logbook-comments/{id}/
	 *  NOTE: nested under /logbooks/ because the logbooks app's router is
	 *  mounted with an empty top-level prefix (see apps/logbooks/urls.py) */
	updateComment: (commentId: string, data: any) =>
		api.patch(`/logbooks/logbook-comments/${commentId}/`, data),
	/** DELETE /api/v1/logbooks/logbook-comments/{id}/ */
	deleteComment: (commentId: string) =>
		api.delete(`/logbooks/logbook-comments/${commentId}/`),
};

const programCohorts = (programId: string) =>
	`/logbooks/programs/${programId}/cohorts`;
const cohortDept = (
	programId: string,
	cohortId: string,
	deptActivationId: string,
) => `${programCohorts(programId)}/${cohortId}/departments/${deptActivationId}`;

export const programsApi = {
	// Program CRUD — admin supplies only name + description (+ dates used
	// purely to schedule the 3 auto-created cohorts)
	list: (params?: any) => api.get("/logbooks/programs/", { params }),
	detail: (id: string) => api.get(`/logbooks/programs/${id}/`),
	create: (data: any) => api.post("/logbooks/programs/", data),
	update: (id: string, data: any) =>
		api.patch(`/logbooks/programs/${id}/`, data),
	remove: (id: string) => api.delete(`/logbooks/programs/${id}/`),

	// Cohorts — always exactly 3 per program, auto-created on program
	// creation. Read-only list/detail; activation is date/sequence-driven
	// server-side, not a direct client mutation.
	cohorts: (programId: string) => api.get(`${programCohorts(programId)}/`),
	cohortDetail: (programId: string, cohortId: string) =>
		api.get(`${programCohorts(programId)}/${cohortId}/`),

	// Department activation within a cohort
	activateDepartment: (
		programId: string,
		cohortId: string,
		deptActivationId: string,
	) =>
		api.post(`${cohortDept(programId, cohortId, deptActivationId)}/activate/`),
	deactivateDepartment: (
		programId: string,
		cohortId: string,
		deptActivationId: string,
	) =>
		api.post(
			`${cohortDept(programId, cohortId, deptActivationId)}/deactivate/`,
		),

	// Attachee logbooks within an activated department
	departmentLogbooks: (
		programId: string,
		cohortId: string,
		deptActivationId: string,
		params?: any,
	) =>
		api.get(`${cohortDept(programId, cohortId, deptActivationId)}/logbooks/`, {
			params,
		}),
};

// ── Evaluations ────────────────────────────────────────────────────────────
export const evaluationsApi = {
	list: (params?: any) => api.get("/evaluations/", { params }),
	detail: (id: string) => api.get("/evaluations/" + id + "/"),
	create: (data: any) => api.post("/evaluations/", data),
	update: (id: string, data: any) =>
		api.patch("/evaluations/" + id + "/", data),
	submit: (id: string, data: any) =>
		api.post("/evaluations/" + id + "/submit/", data),
	templates: () => api.get("/evaluations/templates/"),
	createTemplate: (data: any) => api.post("/evaluations/templates/", data),
};

// ── Certificates ───────────────────────────────────────────────────────────
export const certificatesApi = {
	list: (params?: any) => api.get("/certificates/", { params }),
	detail: (id: string) => api.get("/certificates/" + id + "/"),
	generate: (data: any) => api.post("/certificates/generate/", data),
	download: (id: string) =>
		api.get("/certificates/" + id + "/download/", { responseType: "blob" }),
	verify: (code: string) => api.get("/certificates/verify/" + code + "/"),
	badges: (params?: any) => api.get("/certificates/badges/", { params }),
};

// ── Notifications ──────────────────────────────────────────────────────────
export const notificationsApi = {
	list: (params?: any) => api.get("/notifications/", { params }),
	detail: (id: string) => api.get("/notifications/" + id + "/"),
	markRead: (id: string) =>
		api.patch("/notifications/" + id + "/", { read: true }),
	markAllRead: () => api.post("/notifications/mark-all-read/"),
	unreadCount: () => api.get("/notifications/unread-count/"),
	preferences: () => api.get("/notifications/preferences/"),
	updatePreferences: (data: any) =>
		api.patch("/notifications/preferences/", data),
};

// ── Equipment ──────────────────────────────────────────────────────────────
export const equipmentApi = {
	list: (params?: any) => api.get("/equipment/", { params }),
	detail: (id: string) => api.get("/equipment/" + id + "/"),
	create: (data: any) => api.post("/equipment/", data),
	update: (id: string, data: any) => api.patch("/equipment/" + id + "/", data),
	delete: (id: string) => api.delete("/equipment/" + id + "/"),
	stats: () => api.get("/equipment/stats/"),
	categories: () => api.get("/equipment/categories/"),
	checkoutRequests: (params?: any) =>
		api.get("/equipment/checkout-requests/", { params }),
	requestCheckout: (data: any) =>
		api.post("/equipment/checkout-requests/", data),
	approveCheckout: (id: string, data: any) =>
		api.post("/equipment/checkout-requests/" + id + "/approve/", data),
	returnEquipment: (id: string, data: any) =>
		api.post("/equipment/checkout-requests/" + id + "/return/", data),
	maintenance: (params?: any) => api.get("/equipment/maintenance/", { params }),
	reportMaintenance: (data: any) => api.post("/equipment/maintenance/", data),
	updateMaintenance: (id: string, data: any) =>
		api.patch("/equipment/maintenance/" + id + "/", data),
	resolveMaintenance: (id: string, data: any) =>
		api.post("/equipment/maintenance/" + id + "/resolve/", data),
	retire: (id: string, data?: any) =>
		api.post("/equipment/" + id + "/retire/", data),
	reactivate: (id: string) => api.post("/equipment/" + id + "/reactivate/", {}),
};

// ── News CMS ───────────────────────────────────────────────────────────────

/** Build FormData for story payloads that include a file upload. */
function _storyFormData(data: Record<string, any>): FormData {
	const fd = new FormData();
	Object.entries(data).forEach(([k, v]) => {
		if (v === undefined || v === null) return;
		if (v instanceof File) fd.append(k, v);
		else if (Array.isArray(v)) fd.append(k, JSON.stringify(v));
		else fd.append(k, String(v));
	});
	return fd;
}

function _hasFile(data: Record<string, any>): boolean {
	return data.featured_image instanceof File;
}

export const newsApi = {
	// ── Dashboard summary ──────────────────────────────────────────────────
	/** GET /news/dashboard/ — aggregate stats for the summary bar */
	dashboard: () => api.get("/news/dashboard/"),

	// ── Stories ────────────────────────────────────────────────────────────
	/** GET /news/?search&status&author&category&priority&tag&date_from&date_to */
	list: (params?: {
		search?: string;
		status?: string;
		author?: string;
		category?: string;
		priority?: string;
		tag?: string;
		is_breaking?: boolean;
		is_featured?: boolean;
		date_from?: string;
		date_to?: string;
		ordering?: string;
		page?: number;
		page_size?: number;
	}) => api.get("/news/", { params }),

	/** GET /news/:id/ — also increments view_count server-side */
	detail: (id: string) => api.get("/news/" + id + "/"),

	/** POST /news/ — multipart if featured_image is a File */
	create: (data: any) =>
		_hasFile(data)
			? api.post("/news/", _storyFormData(data), {
					headers: { "Content-Type": "multipart/form-data" },
				})
			: api.post("/news/", data),

	/** PATCH /news/:id/ — multipart if featured_image is a File */
	update: (id: string, data: any) =>
		_hasFile(data)
			? api.patch("/news/" + id + "/", _storyFormData(data), {
					headers: { "Content-Type": "multipart/form-data" },
				})
			: api.patch("/news/" + id + "/", data),

	/** DELETE /news/:id/ — only non-published stories */
	delete: (id: string) => api.delete("/news/" + id + "/"),

	/** POST /news/:id/review/ — action: approve|reject|request_changes|publish|archive|under_review */
	review: (id: string, data: { action: string; comment?: string }) =>
		api.post("/news/" + id + "/review/", data),

	/** POST /news/bulk/ — ids[] + action */
	bulk: (data: { ids: string[]; action: string }) =>
		api.post("/news/bulk/", data),

	// ── Editorial comments ─────────────────────────────────────────────────
	/** GET /news/:id/comments/ */
	listComments: (storyId: string) => api.get("/news/" + storyId + "/comments/"),

	/** POST /news/:id/comments/ */
	addComment: (storyId: string, data: { comment: string }) =>
		api.post("/news/" + storyId + "/comments/", data),

	/** POST /news/comments/:commentId/resolve/ */
	resolveComment: (commentId: string) =>
		api.post("/news/comments/" + commentId + "/resolve/"),

	// ── Version history ────────────────────────────────────────────────────
	/** GET /news/:id/versions/ */
	versions: (storyId: string) => api.get("/news/" + storyId + "/versions/"),

	// ── Categories ─────────────────────────────────────────────────────────
	/** GET /news/categories/ */
	categories: (params?: { active_only?: boolean }) =>
		api.get("/news/categories/", { params }),

	/** POST /news/categories/ */
	createCategory: (data: any) => api.post("/news/categories/", data),

	/** GET /news/categories/:id/ */
	getCategory: (id: string) => api.get("/news/categories/" + id + "/"),

	/** PATCH /news/categories/:id/ */
	updateCategory: (id: string, data: any) =>
		api.patch("/news/categories/" + id + "/", data),

	/** DELETE /news/categories/:id/ */
	deleteCategory: (id: string) => api.delete("/news/categories/" + id + "/"),

	/** POST /news/categories/reorder/ — [{id, sort_order}] */
	reorderCategories: (data: { order: { id: string; sort_order: number }[] }) =>
		api.post("/news/categories/reorder/", data),
};

// ── Radio ──────────────────────────────────────────────────────────────────
export const radioApi = {
	// ── Schedule (slots) ───────────────────────────────────────────────────
	/** GET /news/schedule/?start&end&frequency&status */
	schedule: (params?: {
		start?: string;
		end?: string;
		frequency?: string;
		status?: string;
	}) => api.get("/news/schedule/", { params }),

	/** POST /news/schedule/ */
	createSlot: (data: any) => api.post("/news/schedule/", data),

	/** GET /news/schedule/:id/ */
	getSlot: (id: string) => api.get("/news/schedule/" + id + "/"),

	/** PATCH /news/schedule/:id/ */
	updateSlot: (id: string, data: any) =>
		api.patch("/news/schedule/" + id + "/", data),

	/** DELETE /news/schedule/:id/ */
	deleteSlot: (id: string) => api.delete("/news/schedule/" + id + "/"),

	/** POST /news/schedule/conflict-check/ — { frequency, start_datetime, end_datetime, exclude_id? } */
	checkConflict: (data: {
		frequency: string;
		start_datetime: string;
		end_datetime: string;
		exclude_id?: string;
	}) => api.post("/news/schedule/conflict-check/", data),

	// ── Show plans ─────────────────────────────────────────────────────────
	/** POST /news/schedule/:id/show-plan/ */
	submitShowPlan: (id: string, data: { show_plan: string }) =>
		api.post("/news/schedule/" + id + "/show-plan/", data),

	/** POST /news/schedule/:id/show-plan/approve/ */
	approveShowPlan: (
		id: string,
		data: { approved: boolean; comment?: string },
	) => api.post("/news/schedule/" + id + "/show-plan/approve/", data),

	// ── My schedule (presenter view) ───────────────────────────────────────
	/** GET /news/my-schedule/ */
	mySchedule: () => api.get("/news/my-schedule/"),

	// ── Frequencies ────────────────────────────────────────────────────────
	/** GET /news/frequencies/?active_only=true */
	frequencies: (params?: { active_only?: boolean }) =>
		api.get("/news/frequencies/", { params }),

	/** POST /news/frequencies/ */
	createFrequency: (data: any) => api.post("/news/frequencies/", data),

	/** GET /news/frequencies/:id/ */
	getFrequency: (id: string) => api.get("/news/frequencies/" + id + "/"),

	/** PATCH /news/frequencies/:id/ */
	updateFrequency: (id: string, data: any) =>
		api.patch("/news/frequencies/" + id + "/", data),

	/** DELETE /news/frequencies/:id/ */
	deleteFrequency: (id: string) => api.delete("/news/frequencies/" + id + "/"),

	// ── Shows ──────────────────────────────────────────────────────────────
	/** GET /news/shows/?show_type&active_only */
	shows: (params?: { show_type?: string; active_only?: boolean }) =>
		api.get("/news/shows/", { params }),

	/** POST /news/shows/ */
	createShow: (data: any) => api.post("/news/shows/", data),

	/** GET /news/shows/:id/ */
	getShow: (id: string) => api.get("/news/shows/" + id + "/"),

	/** PATCH /news/shows/:id/ */
	updateShow: (id: string, data: any) =>
		api.patch("/news/shows/" + id + "/", data),

	/** DELETE /news/shows/:id/ */
	deleteShow: (id: string) => api.delete("/news/shows/" + id + "/"),

	// ── Legacy helpers kept for any existing callers ───────────────────────
	/** @deprecated Use createFrequency */
	createFreq: (data: any) => api.post("/news/frequencies/", data),

	notifySlot: (payload: {
		slot: Record<string, any>;
		presenter_user_id: string;
		action: "created" | "updated" | "cancelled";
	}) => api.post("/news/notify/", payload),

	upcomingReminders: (window = 65) =>
		api.get("/news/upcoming-reminders/", { params: { window } }),
};

// ── FM Report ──────────────────────────────────────────────────────────────
export const fmReportApi = {
	stations: () => api.get("/fm-report/stations/"),
	stationDetail: (id: string) => api.get("/fm-report/stations/" + id + "/"),
	createStation: (data: any) => api.post("/fm-report/stations/", data),
	updateStation: (id: string, data: any) =>
		api.patch("/fm-report/stations/" + id + "/", data),
	reportDown: (stationId: string, data: any) =>
		api.post("/fm-report/stations/" + stationId + "/down/", data),
	reportRestored: (stationId: string, data: any) =>
		api.post("/fm-report/stations/" + stationId + "/restored/", data),
	outageHistory: (stationId: string, params?: any) =>
		api.get("/fm-report/stations/" + stationId + "/outages/", { params }),
	allOutages: (params?: any) => api.get("/fm-report/outages/", { params }),
	exportOutages: (params?: any) =>
		api.get("/fm-report/outages/export/", { params, responseType: "blob" }),
};

// ── Emergency ──────────────────────────────────────────────────────────────
export const emergencyApi = {
	trigger: (data: any) => api.post("/fm-report/emergency-alert/", data),
	list: () => api.get("/fm-report/emergency-alert/"),
	acknowledge: (id: string) =>
		api.post("/fm-report/emergency-alert/" + id + "/acknowledge/"),
	resolve: (id: string, data: any) =>
		api.patch("/fm-report/emergency-alert/" + id + "/", data),
};

// ── Subscriptions ──────────────────────────────────────────────────────────
export const subscriptionsApi = {
	// ── Subscription CRUD ──────────────────────────────────────────────────
	/** GET /news/subscriptions/?status&expiring_days */
	list: (params?: { status?: string; expiring_days?: number }) =>
		api.get("/news/subscriptions/", { params }),

	/** GET /news/subscriptions/:id/ */
	detail: (id: string) => api.get("/news/subscriptions/" + id + "/"),

	/** POST /news/subscriptions/ — admins only */
	create: (data: any) => api.post("/news/subscriptions/", data),

	/** PATCH /news/subscriptions/:id/ — admins only */
	update: (id: string, data: any) =>
		api.patch("/news/subscriptions/" + id + "/", data),

	/** DELETE /news/subscriptions/:id/ — admins only */
	delete: (id: string) => api.delete("/news/subscriptions/" + id + "/"),

	// ── Seat requests ──────────────────────────────────────────────────────
	/** POST /news/subscriptions/:id/request/ — { purpose } */
	requestSeat: (id: string, data: { purpose: string }) =>
		api.post("/news/subscriptions/" + id + "/request/", data),

	/** GET /news/subscriptions/seat-requests/?status&subscription */
	seatRequests: (params?: { status?: string; subscription?: string }) =>
		api.get("/news/subscriptions/seat-requests/", { params }),

	/** POST /news/subscriptions/seat-requests/:requestId/allocate/ — { action: approve|reject, reason? } */
	allocateSeat: (
		requestId: string,
		data: { action: "approve" | "reject"; reason?: string },
	) =>
		api.post(
			"/news/subscriptions/seat-requests/" + requestId + "/allocate/",
			data,
		),

	// ── Seat allocations ───────────────────────────────────────────────────
	/** GET /news/subscriptions/allocations/?subscription&is_active */
	allocations: (params?: { subscription?: string; is_active?: boolean }) =>
		api.get("/news/subscriptions/allocations/", { params }),

	/** POST /news/subscriptions/allocations/:allocationId/revoke/ */
	revokeSeat: (allocationId: string) =>
		api.post("/news/subscriptions/allocations/" + allocationId + "/revoke/"),
};

// ── Wi-Fi ──────────────────────────────────────────────────────────────────
export const wifiApi = {
	list: (params?: any) => api.get("/wifi/", { params }),
	detail: (id: string) => api.get("/wifi/" + id + "/"),
	request: (data: any) => api.post("/wifi/", data),
	approve: (id: string, data: any) =>
		api.post("/wifi/" + id + "/approve/", data),
	revoke: (id: string) => api.post("/wifi/" + id + "/revoke/"),
	activeGrants: () => api.get("/wifi/active/"),
};

// ── Feedback ───────────────────────────────────────────────────────────────
export const feedbackApi = {
	// ── Tickets ──────────────────────────────────────────────────────────────
	list: (params?: any) => api.get("/feedback/", { params }),
	get: (id: string) => api.get(`/feedback/${id}/`),
	submit: (data: FormData) => api.post("/feedback/", data),
	update: (id: string, data: any) => api.patch(`/feedback/${id}/`, data),
	delete: (id: string) => api.delete(`/feedback/${id}/`),

	// ── Bulk & Export ─────────────────────────────────────────────────────────
	bulkUpdate: ({ ids, data }: { ids: string[]; data: any }) =>
		api.post("/feedback/bulk_update/", { ids, data }),

	export: (params?: any) =>
		api.get("/feedback/export/", { params, responseType: "blob" }).then((r) => {
			const url = URL.createObjectURL(new Blob([r.data]));
			const a = document.createElement("a");
			a.href = url;
			a.download = `tickets-${Date.now()}.csv`;
			a.click();
			URL.revokeObjectURL(url);
		}),

	// ── Stats ─────────────────────────────────────────────────────────────────
	stats: () => api.get("/feedback/stats/"),

	// ── Comments ──────────────────────────────────────────────────────────────
	addComment: (
		ticketId: string,
		data: { body: string; is_internal?: boolean },
	) => api.post(`/feedback/${ticketId}/comments/`, data),

	deleteComment: (ticketId: string, commentId: string) =>
		api.delete(`/feedback/${ticketId}/comments/${commentId}/`),

	// ── Attachments ───────────────────────────────────────────────────────────
	uploadAttachment: (ticketId: string, data: FormData) =>
		api.post(`/feedback/${ticketId}/attachments/`, data),

	deleteAttachment: (ticketId: string, attId: string) =>
		api.delete(`/feedback/${ticketId}/attachments/${attId}/`),
};

// ── File Transfer ──────────────────────────────────────────────────────────
export const fileTransferApi = {
	upload: (file: File, onProgress?: (p: number) => void) => {
		const form = new FormData();
		form.append("file", file);
		return api.post("/file-transfer/", form, {
			headers: { "Content-Type": "multipart/form-data" },
			onUploadProgress: (e: any) =>
				onProgress?.(Math.round((e.loaded / (e.total || 1)) * 100)),
		});
	},
	list: (params?: any) => api.get("/file-transfer/", { params }),
	download: (token: string) =>
		api.get("/file-transfer/download/" + token + "/", {
			responseType: "blob",
		}),
	delete: (id: string) => api.delete("/file-transfer/" + id + "/"),
};

// ── Videography ────────────────────────────────────────────────────────────
export const videographyApi = {
	bookings: (params?: any) => api.get("/videography/", { params }),
	detail: (id: string) => api.get("/videography/" + id + "/"),
	create: (data: any) => api.post("/videography/", data),
	update: (id: string, data: any) =>
		api.patch("/videography/" + id + "/", data),
	approve: (id: string, data: any) =>
		api.post("/videography/" + id + "/approve/", data),
	uploadFootage: (id: string, file: File) => {
		const form = new FormData();
		form.append("footage", file);
		return api.post("/videography/" + id + "/footage/", form, {
			headers: { "Content-Type": "multipart/form-data" },
		});
	},
	footage: (params?: any) => api.get("/videography/footage/", { params }),
};

// ── Calls ──────────────────────────────────────────────────────────────────
export const callsApi = {
	list: (params?: any) => api.get("/calls/", { params }),
	detail: (id: string) => api.get("/calls/" + id + "/"),
	playback: (id: string) => api.get("/calls/" + id + "/playback/"),
	stats: (params?: any) => api.get("/calls/stats/", { params }),
	hardware: (params?: any) => api.get("/calls/hardware/", { params }),
	reportFault: (data: any) => api.post("/calls/hardware/", data),
};

// ── Finance ────────────────────────────────────────────────────────────────
export const financeApi = {
	budgets: (params?: any) => api.get("/finance/budgets/", { params }),
	createBudget: (data: any) => api.post("/finance/budgets/", data),
	expenses: (params?: any) => api.get("/finance/expenses/", { params }),
	submitExpense: (data: any) => api.post("/finance/expenses/", data),
	approveExpense: (id: string, data: any) =>
		api.post(`/finance/expenses/${id}/action/`, data),
	invoices: (params?: any) => api.get("/finance/invoices/", { params }),
	stipends: (params?: any) => api.get("/finance/stipends/", { params }),
	cashFlow: (params?: any) => api.get("/finance/cash-flow/", { params }),
	reports: (params?: any) => api.get("/finance/reports/", { params }),
	createInvoice: (data: any) => api.post("/finance/invoices/", data),
	approveInvoice: (id: string, data: any) =>
		api.post(`/finance/invoices/${id}/action/`, data),
	payroll: (params?: any) => api.get("/finance/payroll/", { params }),
	processPayroll: (data: any) => api.post("/finance/payroll/process/", data),
	downloadPayslip: (id: string) =>
		api.get(`/finance/payroll/${id}/payslip/`, { responseType: "blob" }),
	pettyCash: (params?: any) => api.get("/finance/petty-cash/", { params }),
	createPettyCash: (data: any) => api.post("/finance/petty-cash/", data),
	approvePettyCash: (id: string, data: any) =>
		api.post(`/finance/petty-cash/${id}/action/`, data),
	purchaseOrders: (params?: any) =>
		api.get("/finance/purchase-orders/", { params }),
	createPurchaseOrder: (data: any) =>
		api.post("/finance/purchase-orders/", data),
	approvePurchaseOrder: (id: string, data: any) =>
		api.post(`/finance/purchase-orders/${id}/action/`, data),
	payments: (params?: any) => api.get("/finance/payments/", { params }),
	createPayment: (data: any) => api.post("/finance/payments/", data),
	deletePayment: (id: string) => api.delete(`/finance/payments/${id}/`),
	createStipend: (data: any) => api.post("/finance/stipends/", data),
	processStipend: (id: string) => api.post(`/finance/stipends/${id}/process/`),
	generateReport: (data: any) => api.post("/finance/reports/generate/", data),
	expenseCategories: () => api.get("/finance/expense-categories/"),
};

// ── Analytics ──────────────────────────────────────────────────────────────
export const analyticsApi = {
	dashboard: () => api.get("/analytics/dashboard/"),
	attendance: (params?: any) => api.get("/analytics/attendance/", { params }),
	tasks: (params?: any) => api.get("/analytics/tasks/", { params }),
	internship: (params?: any) => api.get("/analytics/internship/", { params }),
	broadcast: (params?: any) => api.get("/analytics/broadcast/", { params }),
	system: (params?: any) => api.get("/analytics/system/", { params }),
	fm: (params?: any) => api.get("/analytics/fm/", { params }),
	department: (deptId: string, params?: any) =>
		api.get(`/analytics/department/${deptId}/`, { params }),
	exportReport: (module: string, params?: any) =>
		api.get("/analytics/export/" + module + "/", {
			params,
			responseType: "blob",
		}),
	export: async (
		fmt: "pdf" | "excel" | "pptx" | "csv" | "json",
		module = "full",
		options: {
			days?: number;
			department?: string;
			start?: string;
			end?: string;
		} = {},
	): Promise<void> => {
		const { days = 30, department, start, end } = options;
		const params: Record<string, string> = { days: String(days) };
		if (department) params.department = department;
		if (start) params.start = start;
		if (end) params.end = end;

		const mimes: Record<string, string> = {
			pdf: "application/pdf",
			excel:
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
			csv: "text/csv",
			json: "application/json",
		};
		const exts: Record<string, string> = {
			pdf: ".pdf",
			excel: ".xlsx",
			pptx: ".pptx",
			csv: ".csv",
			json: ".json",
		};

		const res = await api.get(`/analytics/exports/${fmt}/${module}/`, {
			params,
			responseType: "blob",
		});

		const cd = res.headers["content-disposition"] as string | undefined;
		const match = cd?.match(/filename="([^"]+)"/);
		const filename =
			match?.[1] ??
			`BMI-${module}-${new Date().toISOString().slice(0, 10)}${exts[fmt] ?? ""}`;

		const blob = new Blob([res.data], { type: mimes[fmt] });
		const objUrl = URL.createObjectURL(blob);
		const a = Object.assign(document.createElement("a"), {
			href: objUrl,
			download: filename,
		});
		a.click();
		URL.revokeObjectURL(objUrl);
	},
};

// ── Admin Dashboard ────────────────────────────────────────────────────────
export const adminDashboardApi = {
	overview: () => api.get("/admin-dashboard/overview/"),
	alerts: () => api.get("/admin-dashboard/alerts/"),
	recentActivity: () => api.get("/admin-dashboard/activity/"),
	moduleStats: (module: string) =>
		api.get("/admin-dashboard/stats/" + module + "/"),
	exportModule: (module: string, params?: any) =>
		api.get("/admin-dashboard/export/" + module + "/", {
			params,
			responseType: "blob",
		}),
};

// ── Projects ───────────────────────────────────────────────────────────────
// ── Project Deliverables (attachee submissions) ─────────────────────────────
// NOTE: renamed from `projectsApi` to avoid colliding with the Kanban/Gantt
// project-management module's projectsApi (see src/pages/projects/api.ts).
export const projectSubmissionsApi = {
	list: (params?: any) => api.get("/projects/", { params }),
	detail: (id: string) => api.get("/projects/" + id + "/"),
	create: (data: any) => api.post("/projects/", data),
	update: (id: string, data: any) => api.patch("/projects/" + id + "/", data),
	submit: (id: string, data: any) =>
		api.post("/projects/" + id + "/submit/", data),
	review: (id: string, data: any) =>
		api.post("/projects/" + id + "/review/", data),
	versions: (id: string) => api.get("/projects/" + id + "/versions/"),
	feedback: (id: string, data: any) =>
		api.post("/projects/" + id + "/feedback/", data),
};

// ── Documents ──────────────────────────────────────────────────────────────
// ── Enterprise Document Management (general DMS, not project-scoped) ───────
// NOTE: renamed from `documentsApi` to avoid colliding with the Kanban/Gantt
// project-management module's documentsApi (see src/pages/projects/api.ts),
// which is scoped to a specific project's documents.
export const enterpriseDocumentsApi = {
	list: (params?: any) => api.get("/documents/", { params }),
	detail: (id: string) => api.get("/documents/" + id + "/"),
	upload: (file: File, meta: any) => {
		const form = new FormData();
		form.append("file", file);
		Object.keys(meta).forEach((k) => form.append(k, meta[k]));
		return api.post("/documents/", form, {
			headers: { "Content-Type": "multipart/form-data" },
		});
	},
	delete: (id: string) => api.delete("/documents/" + id + "/"),
	download: (id: string) =>
		api.get("/documents/" + id + "/download/", { responseType: "blob" }),
};

// ── Knowledge Base ─────────────────────────────────────────────────────────
export const knowledgeApi = {
	list: (params?: any) => api.get("/knowledge/", { params }),
	detail: (id: string) => api.get("/knowledge/" + id + "/"),
	create: (data: any) => api.post("/knowledge/", data),
	update: (id: string, data: any) => api.patch("/knowledge/" + id + "/", data),
	search: (q: string) => api.get("/knowledge/", { params: { search: q } }),
};

// ── HSE ────────────────────────────────────────────────────────────────────
export const hseApi = {
	incidents: (params?: any) => api.get("/hse/", { params }),
	reportIncident: (data: any) => api.post("/hse/", data),
	updateIncident: (id: string, data: any) =>
		api.patch("/hse/" + id + "/", data),
	inspections: (params?: any) => api.get("/hse/inspections/", { params }),
	riskAssessments: (params?: any) => api.get("/hse/risks/", { params }),
};

// ── Facilities ─────────────────────────────────────────────────────────────
export const facilitiesApi = {
	list: (params?: any) => api.get("/facilities/", { params }),
	roomBookings: (params?: any) => api.get("/facilities/bookings/", { params }),
	bookRoom: (data: any) => api.post("/facilities/bookings/", data),
	maintenance: (params?: any) =>
		api.get("/facilities/maintenance/", { params }),
};

// ── Security ───────────────────────────────────────────────────────────────
export const securityApi = {
	incidents: (params?: any) => api.get("/security/", { params }),
	report: (data: any) => api.post("/security/", data),
	visitors: (params?: any) => api.get("/security/visitors/", { params }),
	patrols: (params?: any) => api.get("/security/patrols/", { params }),
};

// ── University Portal ──────────────────────────────────────────────────────
export const universityApi = {
	students: (params?: any) => api.get("/university/", { params }),
	placements: (params?: any) => api.get("/university/placements/", { params }),
	verify: (id: string) => api.get("/university/verify/" + id + "/"),
	stats: () => api.get("/university/stats/"),
};

// ── Workflow ───────────────────────────────────────────────────────────────
export const workflowApi = {
	list: (params?: any) => api.get("/workflow/", { params }),
	detail: (id: string) => api.get("/workflow/" + id + "/"),
	approve: (id: string, data: any) =>
		api.post("/workflow/" + id + "/approve/", data),
	reject: (id: string, data: any) =>
		api.post("/workflow/" + id + "/reject/", data),
	delegate: (id: string, data: any) =>
		api.post("/workflow/" + id + "/delegate/", data),
};

// ── Procurement ────────────────────────────────────────────────────────────
export const procurementApi = {
	requests: (params?: any) => api.get("/procurement/", { params }),
	create: (data: any) => api.post("/procurement/", data),
	approve: (id: string, data: any) =>
		api.post("/procurement/" + id + "/approve/", data),
	vendors: (params?: any) => api.get("/procurement/vendors/", { params }),
	inventory: (params?: any) => api.get("/procurement/inventory/", { params }),
};

// ── ICT ────────────────────────────────────────────────────────────────────
export const ictApi = {
	assets: (params?: any) => api.get("/ict/", { params }),
	createAsset: (data: any) => api.post("/ict/", data),
	helpdesk: (params?: any) => api.get("/ict/helpdesk/", { params }),
	submitTicket: (data: any) => api.post("/ict/helpdesk/", data),
	licenses: (params?: any) => api.get("/ict/licenses/", { params }),
	incidents: (params?: any) => api.get("/ict/incidents/", { params }),
};

// ── Communications / PR ────────────────────────────────────────────────────
export const communicationsApi = {
	announcements: (params?: any) => api.get("/communications/", { params }),
	create: (data: any) => api.post("/communications/", data),
	campaigns: (params?: any) =>
		api.get("/communications/campaigns/", { params }),
	pressReleases: (params?: any) =>
		api.get("/communications/press/", { params }),
};

// ── Legal ──────────────────────────────────────────────────────────────────
export const legalApi = {
	contracts: (params?: any) => api.get("/legal/", { params }),
	create: (data: any) => api.post("/legal/", data),
	ndas: (params?: any) => api.get("/legal/ndas/", { params }),
	compliance: (params?: any) => api.get("/legal/compliance/", { params }),
};

// ── QA / QC ────────────────────────────────────────────────────────────────
export const qcApi = {
	inspections: (params?: any) => api.get("/qc/", { params }),
	create: (data: any) => api.post("/qc/", data),
	nonConformance: (params?: any) => api.get("/qc/non-conformance/", { params }),
	metrics: (params?: any) => api.get("/qc/metrics/", { params }),
};

// ── Operations ─────────────────────────────────────────────────────────────
export const operationsApi = {
	kpis: (params?: any) => api.get("/operations/", { params }),
	incidents: (params?: any) => api.get("/operations/incidents/", { params }),
	report: (data: any) => api.post("/operations/incidents/", data),
	workflows: (params?: any) => api.get("/operations/workflows/", { params }),
};

// ── Customer Service ───────────────────────────────────────────────────────
export const customerServiceApi = {
	tickets: (params?: any) => api.get("/customer-service/", { params }),
	create: (data: any) => api.post("/customer-service/", data),
	update: (id: string, data: any) =>
		api.patch("/customer-service/" + id + "/", data),
	surveys: (params?: any) => api.get("/customer-service/surveys/", { params }),
	stats: () => api.get("/customer-service/stats/"),
};

// ── R&D ────────────────────────────────────────────────────────────────────
export const rdApi = {
	projects: (params?: any) => api.get("/rd/", { params }),
	create: (data: any) => api.post("/rd/", data),
	ideas: (params?: any) => api.get("/rd/ideas/", { params }),
	submitIdea: (data: any) => api.post("/rd/ideas/", data),
	patents: (params?: any) => api.get("/rd/patents/", { params }),
};

export const deptApi = {
	overview: () => api.get("/attendance/dept/overview/"),
	today: () => api.get("/attendance/dept/today/"),
	members: (days = 30) => api.get(`/attendance/dept/members/?days=${days}`),
	absentees: (min = 1, days = 30) =>
		api.get(`/attendance/dept/absentees/?min=${min}&days=${days}`),
	lateComers: (min = 1, days = 30) =>
		api.get(`/attendance/dept/late-comers/?min=${min}&days=${days}`),
	trends: (days = 30) => api.get(`/attendance/dept/trends/?days=${days}`),
	warn: (userId: string, data: any) =>
		api.post(`/attendance/dept/warn/${userId}/`, data),
	deactivate: (userId: string, data: any) =>
		api.post(`/attendance/dept/deactivate/${userId}/`, data),
	autoEnforce: (dryRun = false) =>
		api.post("/attendance/dept/auto-enforce/", { dry_run: dryRun }),
};

export const departmentsApi = {
	list: (params?: Record<string, any>) =>
		api.get("/accounts/departments/", { params }),
	get: (id: string) => api.get(`/accounts/departments/${id}/`),
};
