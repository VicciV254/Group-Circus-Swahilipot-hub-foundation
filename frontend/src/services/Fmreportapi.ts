// services/fmReportApi.ts
// Thin API layer for the fm_report module (stations, outages, alerts, stream health).
// Mirrors backend/apps/fm_report/urls.py exactly — keep both in sync.
import axios from "axios";
import { api } from "./api"; // your existing configured axios instance

export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type OutageSeverity = "minor" | "moderate" | "critical";
export type StationStatus = "on_air" | "off_air" | "degraded" | "unknown";

export interface FMStation {
	id: string;
	organisation: string;
	name: string;
	frequency: string;
	location: string;
	stream_url: string;
	heartbeat_url: string;
	is_active: boolean;
	alert_emails: string[];
	alert_phones: string[];
	current_status: StationStatus;
	last_status_change: string | null;
	heartbeat_timeout_minutes: number;
	last_heartbeat_at: string | null;
	uptime_percent_today: number;
	active_outage: {
		id: string;
		down_at: string;
		description: string;
		severity: OutageSeverity;
	} | null;
	time_since_change: string | null;
	heartbeat_overdue: boolean;
}

export interface FMOutage {
	id: string;
	station: string;
	station_name: string;
	station_frequency: string;
	reported_by: string | null;
	reported_by_name: string | null;
	resolved_by: string | null;
	resolved_by_name: string | null;
	down_at: string;
	restored_at: string | null;
	duration_minutes: number | null;
	description: string;
	resolution_notes: string;
	severity: OutageSeverity;
	auto_detected: boolean;
	alert_sent: boolean;
	is_ongoing: boolean;
}

export interface Acknowledgement {
	user: string;
	user_name: string | null;
	acknowledged_at: string;
}

export interface EmergencyAlertDTO {
	id: string;
	alert_type: string;
	title: string;
	description: string;
	severity: AlertSeverity;
	affected_systems: string[];
	notified_emails: string[];
	notified_phones: string[];
	notification_errors: string[];
	acknowledged_count: number;
	acknowledgements: Acknowledgement[];
	resolved: boolean;
	resolved_at: string | null;
	resolved_by_name: string | null;
	resolution_notes: string;
	triggered_by_name: string | null;
	created_at: string;
	related_station: string | null;
}

export interface PaginatedResponse<T> {
	count: number;
	next: string | null;
	previous: string | null;
	results: T[];
}

export interface StreamStatus {
	live: boolean;
	checked_at: string;
	response_ms: number;
	stream_url: string;
	station: string | null;
	error: string | null;
}

export interface OutageFilters {
	start?: string;
	end?: string;
	severity?: OutageSeverity;
	station?: string;
	page?: number;
}

export interface TransmitterReading {
	id: string;
	station: string;
	station_name: string;
	recorded_at: string;
	forward_power_watts: number | null;
	reflected_power_watts: number | null;
	vswr: number | null;
	pa_temperature_celsius: number | null;
	ambient_temperature_celsius: number | null;
	audio_level_db: number | null;
	signal_strength_dbm: number | null;
	vswr_warning: boolean;
	vswr_critical: boolean;
	pa_temp_warning: boolean;
}

export interface ProgrammeSlot {
	id: string;
	station: string;
	station_name: string;
	title: string;
	host: string;
	description: string;
	weekday: number; // 0=Monday .. 6=Sunday
	weekday_display: string;
	start_time: string; // "HH:MM:SS"
	end_time: string;
	is_active: boolean;
	color: string;
}

export interface AuditLogEntry {
	id: string;
	organisation: string;
	actor: string | null;
	actor_name: string | null;
	action: string;
	action_display: string;
	target_repr: string;
	target_id: string;
	metadata: Record<string, unknown>;
	created_at: string;
}

export interface NotificationPreference {
	id: string;
	user: string;
	email_on_outage: boolean;
	sms_on_outage: boolean;
	email_on_emergency_alert: boolean;
	sms_on_emergency_alert: boolean;
	email_on_restored: boolean;
	sms_on_restored: boolean;
	fm_minimum_severity: "low" | "medium" | "high" | "critical";
	phone_number: string;
}

export interface OrgMember {
	id: string;
	name: string;
	email: string;
	role: string;
	is_org_owner: boolean;
}

export interface PresetStream {
	id: string;
	name: string;
	frequency: string;
	stream_url: string;
}

export const fmReportApi = {
	// ── Stations ─────────────────────────────────────────────────────────
	listStations: () =>
		api.get<PaginatedResponse<FMStation>>("/fm-report/stations/"),
	getStation: (id: string) => api.get<FMStation>(`/fm-report/stations/${id}/`),
	createStation: (data: Partial<FMStation>) =>
		api.post<FMStation>("/fm-report/stations/", data),
	updateStation: (id: string, data: Partial<FMStation>) =>
		api.patch<FMStation>(`/fm-report/stations/${id}/`, data),
	deleteStation: (id: string) => api.delete(`/fm-report/stations/${id}/`),

	reportDown: (
		stationId: string,
		body: { description?: string; severity?: OutageSeverity },
	) => api.post<FMOutage>(`/fm-report/stations/${stationId}/down/`, body),
	reportRestored: (stationId: string, body: { resolution_notes?: string }) =>
		api.post<FMOutage>(`/fm-report/stations/${stationId}/restored/`, body),

	// ── Outages ──────────────────────────────────────────────────────────
	listOutages: (filters: OutageFilters = {}) =>
		api.get<PaginatedResponse<FMOutage>>("/fm-report/outages/", {
			params: filters,
		}),
	stationOutages: (stationId: string, filters: OutageFilters = {}) =>
		api.get<PaginatedResponse<FMOutage>>(
			`/fm-report/stations/${stationId}/outages/`,
			{ params: filters },
		),
	exportOutagesUrl: (format: "csv" | "pdf", filters: OutageFilters = {}) => {
		const params = new URLSearchParams({
			format,
			...stripUndefined(filters),
		} as any);
		return `${api.defaults.baseURL}/fm-report/outages/export/?${params.toString()}`;
	},

	// ── Emergency alerts ─────────────────────────────────────────────────
	listAlerts: () => api.get<EmergencyAlertDTO[]>("/fm-report/emergency-alert/"),
	triggerAlert: (data: Partial<EmergencyAlertDTO>) =>
		api.post<EmergencyAlertDTO>("/fm-report/emergency-alert/", data),
	acknowledgeAlert: (
		id: string,
		body: { resolve?: boolean; resolution_notes?: string } = {},
	) =>
		api.post<EmergencyAlertDTO>(
			`/fm-report/emergency-alert/${id}/acknowledge/`,
			body,
		),

	// ── Stream health ────────────────────────────────────────────────────
	streamStatus: (stationId?: string) =>
		api.get<StreamStatus>("/fm-report/stream-status/", {
			params: stationId ? { station: stationId } : {},
		}),

	// ── Preset / quick streams (env-configured on the backend) ────────────
	listPresetStreams: () =>
		api.get<PresetStream[]>("/fm-report/preset-streams/"),

	// ── Transmitter telemetry ────────────────────────────────────────────
	telemetryHistory: (stationId: string, hours = 24) =>
		api.get<PaginatedResponse<TransmitterReading>>(
			`/fm-report/stations/${stationId}/telemetry/history/`,
			{ params: { hours } },
		),

	// ── Programme schedule ───────────────────────────────────────────────
	listSchedule: (stationId: string) =>
		api.get<ProgrammeSlot[]>(`/fm-report/stations/${stationId}/schedule/`),
	createSlot: (stationId: string, data: Partial<ProgrammeSlot>) =>
		api.post<ProgrammeSlot>(`/fm-report/stations/${stationId}/schedule/`, data),
	updateSlot: (id: string, data: Partial<ProgrammeSlot>) =>
		api.patch<ProgrammeSlot>(`/fm-report/schedule/${id}/`, data),
	deleteSlot: (id: string) => api.delete(`/fm-report/schedule/${id}/`),

	// ── Audit log ─────────────────────────────────────────────────────────
	listAuditLog: (
		filters: {
			action?: string;
			start?: string;
			end?: string;
			page?: number;
		} = {},
	) =>
		api.get<PaginatedResponse<AuditLogEntry>>("/fm-report/audit-log/", {
			params: filters,
		}),

	// ── Notification preferences ─────────────────────────────────────────
	getNotificationPrefs: () =>
		api.get<NotificationPreference>("/fm-report/notification-preferences/"),
	updateNotificationPrefs: (data: Partial<NotificationPreference>) =>
		api.patch<NotificationPreference>(
			"/fm-report/notification-preferences/",
			data,
		),
	testSendNotification: (channel: "email" | "sms") =>
		api.post("/fm-report/notification-preferences/test-send/", {
			channel,
		}),

	// ── Role management ──────────────────────────────────────────────────
	listMembers: () => api.get<OrgMember[]>("/fm-report/members/"),
	updateMemberRole: (userId: string, role: string) =>
		api.patch<{ id: string; role: string }>(
			`/fm-report/members/${userId}/role/`,
			{ role },
		),
};

function stripUndefined<T extends Record<string, any>>(
	obj: T,
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(obj)) {
		if (v !== undefined && v !== null && v !== "") out[k] = String(v);
	}
	return out;
}

export function isAxiosError(
	e: unknown,
): e is { response?: { data?: any }; message: string } {
	return axios.isAxiosError(e);
}
