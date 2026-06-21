// services/newsApi.ts
// Complete typed API service for the News CMS, Radio, and Subscriptions app.
// Every backend endpoint defined in urls.py is covered here.
// Uses axios with a shared authenticated instance (see api.ts).

import {api} from "./api"; // your shared axios instance with JWT interceptors

const BASE = "/news"; // adjust to match your DRF router prefix

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StoryListParams {
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
}

export interface BulkActionPayload {
	ids: string[];
	action: "publish" | "approve" | "archive" | "reject";
}

export interface ReviewPayload {
	action:
		| "approve"
		| "reject"
		| "request_changes"
		| "publish"
		| "archive"
		| "under_review";
	comment?: string;
}

export interface StoryPayload {
	title: string;
	subtitle?: string;
	body: string;
	summary?: string;
	category?: string;
	priority?: string;
	is_breaking?: boolean;
	is_featured?: boolean;
	tags?: string[];
	sources?: string[];
	seo_title?: string;
	seo_description?: string;
	featured_image?: File | null;
	featured_image_caption?: string;
	featured_image_credit?: string;
	submission_deadline?: string;
	scheduled_publish_at?: string;
	status?: string;
	change_summary?: string;
}

export interface RadioSlotPayload {
	frequency: string;
	show: string;
	presenter: string;
	co_presenter?: string;
	start_datetime: string;
	end_datetime: string;
	guests?: object[];
	notes?: string;
}

export interface ShowPlanPayload {
	show_plan: string;
}

export interface ConflictCheckPayload {
	frequency: string;
	start_datetime: string;
	end_datetime: string;
	exclude_id?: string;
}

export interface SeatRequestPayload {
	purpose: string;
}

export interface AllocateSeatPayload {
	action: "approve" | "reject";
	reason?: string;
}

export interface ApproveShowPlanPayload {
	approved: boolean;
	comment?: string;
}

export interface CategoryPayload {
	name: string;
	colour?: string;
	description?: string;
	broadcast_deadline_hour?: number;
	is_active?: boolean;
	sort_order?: number;
}

export interface ReorderPayload {
	order: { id: string; sort_order: number }[];
}

export interface RadioFrequencyPayload {
	name: string;
	frequency_mhz: string;
	description?: string;
	is_active?: boolean;
	colour?: string;
	stream_url?: string;
}

export interface RadioShowPayload {
	name: string;
	show_type: string;
	description?: string;
	default_presenter?: string;
	colour?: string;
	is_active?: boolean;
	default_duration_minutes?: number;
}

export interface SubscriptionPayload {
	software_name: string;
	vendor?: string;
	version?: string;
	description?: string;
	category?: string;
	total_seats: number;
	expiry_date: string;
	renewal_cost?: number;
	currency?: string;
	notes?: string;
	support_contact?: string;
	support_url?: string;
	auto_renew?: boolean;
	purchase_date?: string;
	purchase_order_ref?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a FormData object for multipart requests (story with image upload).
 * Plain JSON fields are stringified; File fields are appended raw.
 */
function storyToFormData(payload: StoryPayload): FormData {
	const fd = new FormData();
	Object.entries(payload).forEach(([key, value]) => {
		if (value === undefined || value === null) return;
		if (value instanceof File) {
			fd.append(key, value);
		} else if (Array.isArray(value)) {
			fd.append(key, JSON.stringify(value));
		} else {
			fd.append(key, String(value));
		}
	});
	return fd;
}

function hasFile(payload: StoryPayload): boolean {
	return payload.featured_image instanceof File;
}

// ─── newsApi ──────────────────────────────────────────────────────────────────

export const newsApi = {
	// ── Dashboard ──────────────────────────────────────────────────────────────

	/** GET /news/dashboard/ */
	dashboard: () => api.get(`${BASE}/dashboard/`),

	// ── Stories ────────────────────────────────────────────────────────────────

	/** GET /news/?search=…&status=…&… */
	list: (params?: StoryListParams) => api.get(`${BASE}/`, { params }),

	/** GET /news/:id/ */
	get: (id: string) => api.get(`${BASE}/${id}/`),

	/** POST /news/ */
	create: (payload: StoryPayload) => {
		if (hasFile(payload)) {
			return api.post(`${BASE}/`, storyToFormData(payload), {
				headers: { "Content-Type": "multipart/form-data" },
			});
		}
		return api.post(`${BASE}/`, payload);
	},

	/** PATCH /news/:id/ */
	update: (id: string, payload: Partial<StoryPayload>) => {
		if (hasFile(payload as StoryPayload)) {
			return api.patch(
				`${BASE}/${id}/`,
				storyToFormData(payload as StoryPayload),
				{
					headers: { "Content-Type": "multipart/form-data" },
				},
			);
		}
		return api.patch(`${BASE}/${id}/`, payload);
	},

	/** DELETE /news/:id/ */
	delete: (id: string) => api.delete(`${BASE}/${id}/`),

	/** POST /news/:id/review/ */
	review: (id: string, payload: ReviewPayload) =>
		api.post(`${BASE}/${id}/review/`, payload),

	/** POST /news/bulk/ */
	bulk: (payload: BulkActionPayload) =>
		api.post(`${BASE}/bulk/`, payload),

	// ── Editorial Comments ─────────────────────────────────────────────────────

	/** GET /news/:id/comments/ */
	listComments: (storyId: string) =>
		api.get(`${BASE}/${storyId}/comments/`),

	/** POST /news/:id/comments/ */
	addComment: (storyId: string, payload: { comment: string }) =>
		api.post(`${BASE}/${storyId}/comments/`, payload),

	/** POST /news/comments/:commentId/resolve/ */
	resolveComment: (commentId: string) =>
		api.post(`${BASE}/comments/${commentId}/resolve/`),

	// ── Version History ────────────────────────────────────────────────────────

	/** GET /news/:id/versions/ */
	versions: (storyId: string) => api.get(`${BASE}/${storyId}/versions/`),

	// ── Categories ─────────────────────────────────────────────────────────────

	/** GET /news/categories/ */
	categories: (params?: { active_only?: boolean }) =>
		api.get(`${BASE}/categories/`, { params }),

	/** POST /news/categories/ */
	createCategory: (payload: CategoryPayload) =>
		api.post(`${BASE}/categories/`, payload),

	/** GET /news/categories/:id/ */
	getCategory: (id: string) => api.get(`${BASE}/categories/${id}/`),

	/** PATCH /news/categories/:id/ */
	updateCategory: (id: string, payload: Partial<CategoryPayload>) =>
		api.patch(`${BASE}/categories/${id}/`, payload),

	/** DELETE /news/categories/:id/ */
	deleteCategory: (id: string) => api.delete(`${BASE}/categories/${id}/`),

	/** POST /news/categories/reorder/ */
	reorderCategories: (payload: ReorderPayload) =>
		api.post(`${BASE}/categories/reorder/`, payload),

	// ── Radio Schedule ─────────────────────────────────────────────────────────

	/** GET /news/schedule/?start=…&end=…&frequency=…&status=… */
	schedule: (params?: {
		start?: string;
		end?: string;
		frequency?: string;
		status?: string;
	}) => api.get(`${BASE}/schedule/`, { params }),

	/** POST /news/schedule/ */
	createSlot: (payload: RadioSlotPayload) =>
		api.post(`${BASE}/schedule/`, payload),

	/** GET /news/schedule/:id/ */
	getSlot: (id: string) => api.get(`${BASE}/schedule/${id}/`),

	/** PATCH /news/schedule/:id/ */
	updateSlot: (id: string, payload: Partial<RadioSlotPayload>) =>
		api.patch(`${BASE}/schedule/${id}/`, payload),

	/** DELETE /news/schedule/:id/ */
	deleteSlot: (id: string) => api.delete(`${BASE}/schedule/${id}/`),

	/** POST /news/schedule/conflict-check/ */
	checkConflict: (payload: ConflictCheckPayload) =>
		api.post(`${BASE}/schedule/conflict-check/`, payload),

	/** POST /news/schedule/:id/show-plan/ */
	submitShowPlan: (slotId: string, payload: ShowPlanPayload) =>
		api.post(`${BASE}/schedule/${slotId}/show-plan/`, payload),

	/** POST /news/schedule/:id/show-plan/approve/ */
	approveShowPlan: (slotId: string, payload: ApproveShowPlanPayload) =>
		api.post(`${BASE}/schedule/${slotId}/show-plan/approve/`, payload),

	/** GET /news/my-schedule/ */
	mySchedule: () => api.get(`${BASE}/my-schedule/`),

	// ── Frequencies ───────────────────────────────────────────────────────────

	/** GET /news/frequencies/ */
	frequencies: (params?: { active_only?: boolean }) =>
		api.get(`${BASE}/frequencies/`, { params }),

	/** POST /news/frequencies/ */
	createFrequency: (payload: RadioFrequencyPayload) =>
		api.post(`${BASE}/frequencies/`, payload),

	/** GET /news/frequencies/:id/ */
	getFrequency: (id: string) => api.get(`${BASE}/frequencies/${id}/`),

	/** PATCH /news/frequencies/:id/ */
	updateFrequency: (id: string, payload: Partial<RadioFrequencyPayload>) =>
		api.patch(`${BASE}/frequencies/${id}/`, payload),

	/** DELETE /news/frequencies/:id/ */
	deleteFrequency: (id: string) =>
		api.delete(`${BASE}/frequencies/${id}/`),

	// ── Shows ─────────────────────────────────────────────────────────────────

	/** GET /news/shows/?show_type=…&active_only=… */
	shows: (params?: { show_type?: string; active_only?: boolean }) =>
		api.get(`${BASE}/shows/`, { params }),

	/** POST /news/shows/ */
	createShow: (payload: RadioShowPayload) =>
		api.post(`${BASE}/shows/`, payload),

	/** GET /news/shows/:id/ */
	getShow: (id: string) => api.get(`${BASE}/shows/${id}/`),

	/** PATCH /news/shows/:id/ */
	updateShow: (id: string, payload: Partial<RadioShowPayload>) =>
		api.patch(`${BASE}/shows/${id}/`, payload),

	/** DELETE /news/shows/:id/ */
	deleteShow: (id: string) => api.delete(`${BASE}/shows/${id}/`),

	// ── Subscriptions ──────────────────────────────────────────────────────────

	/** GET /news/subscriptions/?status=…&expiring_days=… */
	subscriptions: (params?: { status?: string; expiring_days?: number }) =>
		api.get(`${BASE}/subscriptions/`, { params }),

	/** POST /news/subscriptions/ */
	createSubscription: (payload: SubscriptionPayload) =>
		api.post(`${BASE}/subscriptions/`, payload),

	/** GET /news/subscriptions/:id/ */
	getSubscription: (id: string) =>
		api.get(`${BASE}/subscriptions/${id}/`),

	/** PATCH /news/subscriptions/:id/ */
	updateSubscription: (id: string, payload: Partial<SubscriptionPayload>) =>
		api.patch(`${BASE}/subscriptions/${id}/`, payload),

	/** DELETE /news/subscriptions/:id/ */
	deleteSubscription: (id: string) =>
		api.delete(`${BASE}/subscriptions/${id}/`),

	// ── Seat Requests ──────────────────────────────────────────────────────────

	/** GET /news/subscriptions/seat-requests/?status=…&subscription=… */
	seatRequests: (params?: { status?: string; subscription?: string }) =>
		api.get(`${BASE}/subscriptions/seat-requests/`, { params }),

	/** POST /news/subscriptions/:subscriptionId/request/ */
	requestSeat: (subscriptionId: string, payload: SeatRequestPayload) =>
		api.post(`${BASE}/subscriptions/${subscriptionId}/request/`, payload),

	/** POST /news/subscriptions/seat-requests/:requestId/allocate/ */
	allocateSeat: (requestId: string, payload: AllocateSeatPayload) =>
		api.post(
			`${BASE}/subscriptions/seat-requests/${requestId}/allocate/`,
			payload,
		),

	// ── Seat Allocations ───────────────────────────────────────────────────────

	/** GET /news/subscriptions/allocations/?subscription=…&is_active=… */
	allocations: (params?: { subscription?: string; is_active?: boolean }) =>
		api.get(`${BASE}/subscriptions/allocations/`, { params }),

	/** POST /news/subscriptions/allocations/:allocationId/revoke/ */
	revokeSeat: (allocationId: string) =>
		api.post(`${BASE}/subscriptions/allocations/${allocationId}/revoke/`),
};

export default newsApi;
