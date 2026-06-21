// ─────────────────────────────────────────────────────────────────────────────
// Enterprise Internship Management System
// Projects Module — Utilities & Constants
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import {
	ProjectStatus,
	ProjectPriority,
	TaskStatus,
	TaskPriority,
	RiskSeverity,
	SprintStatus,
	MilestoneStatus,
	UserMinimal,
} from "./types";

// ── Status Labels & Colors ────────────────────────────────────────────────────

export const STATUS_LABELS: Record<ProjectStatus, string> = {
	draft: "Draft",
	planning: "Planning",
	active: "Active",
	on_hold: "On Hold",
	completed: "Completed",
	cancelled: "Cancelled",
	archived: "Archived",
};

export const STATUS_COLORS: Record<ProjectStatus, string> = {
	draft: "bg-gray-100 text-gray-600",
	planning: "bg-blue-100 text-blue-700",
	active: "bg-emerald-100 text-emerald-700",
	on_hold: "bg-amber-100 text-amber-700",
	completed: "bg-indigo-100 text-indigo-700",
	cancelled: "bg-red-100 text-red-600",
	archived: "bg-gray-100 text-gray-500",
};

export const STATUS_DOT_COLORS: Record<ProjectStatus, string> = {
	draft: "bg-gray-400",
	planning: "bg-blue-500",
	active: "bg-emerald-500",
	on_hold: "bg-amber-500",
	completed: "bg-indigo-500",
	cancelled: "bg-red-500",
	archived: "bg-gray-400",
};

// ── Priority ──────────────────────────────────────────────────────────────────

export const PRIORITY_LABELS: Record<ProjectPriority, string> = {
	critical: "Critical",
	high: "High",
	medium: "Medium",
	low: "Low",
};

export const PRIORITY_COLORS: Record<ProjectPriority, string> = {
	critical: "bg-red-500",
	high: "bg-orange-500",
	medium: "bg-amber-400",
	low: "bg-gray-300",
};

export const PRIORITY_TEXT_COLORS: Record<ProjectPriority, string> = {
	critical: "text-red-600",
	high: "text-orange-600",
	medium: "text-amber-600",
	low: "text-gray-500",
};

// ── Task Status ───────────────────────────────────────────────────────────────

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
	backlog: "Backlog",
	pending: "Pending",
	in_progress: "In Progress",
	in_review: "In Review",
	submitted: "Submitted",
	approved: "Approved",
	rejected: "Rejected",
	overdue: "Overdue",
	done: "Done",
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
	backlog: "bg-gray-100 text-gray-600",
	pending: "bg-slate-100 text-slate-600",
	in_progress: "bg-blue-100 text-blue-700",
	in_review: "bg-violet-100 text-violet-700",
	submitted: "bg-amber-100 text-amber-700",
	approved: "bg-emerald-100 text-emerald-700",
	rejected: "bg-red-100 text-red-600",
	overdue: "bg-red-100 text-red-700",
	done: "bg-teal-100 text-teal-700",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
};

export const TASK_PRIORITY_COLORS: Record<TaskPriority, string> = {
	urgent: "text-red-600 bg-red-50",
	high: "text-orange-600 bg-orange-50",
	medium: "text-amber-600 bg-amber-50",
	low: "text-gray-500 bg-gray-50",
};

// ── Risk ──────────────────────────────────────────────────────────────────────

export const RISK_SEVERITY_COLORS: Record<RiskSeverity, string> = {
	critical: "bg-red-100 text-red-700",
	high: "bg-orange-100 text-orange-700",
	medium: "bg-amber-100 text-amber-700",
	low: "bg-emerald-100 text-emerald-700",
};

export const RISK_STATUS_LABELS: Record<string, string> = {
	identified: "Identified",
	mitigating: "Mitigating",
	resolved: "Resolved",
	accepted: "Accepted",
};

// ── Sprint ────────────────────────────────────────────────────────────────────

export const SPRINT_STATUS_COLORS: Record<SprintStatus, string> = {
	planning: "bg-gray-100 text-gray-600",
	active: "bg-emerald-100 text-emerald-700",
	completed: "bg-indigo-100 text-indigo-700",
	cancelled: "bg-red-100 text-red-600",
};

// ── Milestone ─────────────────────────────────────────────────────────────────

export const MILESTONE_STATUS_COLORS: Record<MilestoneStatus, string> = {
	pending: "bg-slate-100 text-slate-600",
	in_progress: "bg-blue-100 text-blue-700",
	completed: "bg-emerald-100 text-emerald-700",
	missed: "bg-red-100 text-red-600",
};

// ── Date Formatting ───────────────────────────────────────────────────────────

export function formatDate(
	date?: string | null,
	opts?: Intl.DateTimeFormatOptions,
): string {
	if (!date) return "—";
	return new Date(date).toLocaleDateString(
		"en-GB",
		opts || { day: "numeric", month: "short", year: "numeric" },
	);
}

export function formatDateTime(date?: string | null): string {
	if (!date) return "—";
	return new Date(date).toLocaleString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function formatRelativeTime(date: string): string {
	const diff = Date.now() - new Date(date).getTime();
	const s = Math.floor(diff / 1000);
	if (s < 60) return "just now";
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 30) return `${d}d ago`;
	const mo = Math.floor(d / 30);
	if (mo < 12) return `${mo}mo ago`;
	return `${Math.floor(mo / 12)}y ago`;
}

export function daysUntil(date?: string | null): number | null {
	if (!date) return null;
	const d = Math.ceil(
		(new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
	);
	return d;
}

export function isOverdue(date?: string | null): boolean {
	if (!date) return false;
	return new Date(date) < new Date();
}

// ── Number Formatting ─────────────────────────────────────────────────────────

export function formatCurrency(amount: number, currency = "USD"): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		minimumFractionDigits: 0,
	}).format(amount);
}

export function formatNumber(n: number): string {
	return new Intl.NumberFormat("en-US").format(n);
}

export function formatFileSize(bytes?: number): string {
	if (!bytes) return "—";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Progress Color ────────────────────────────────────────────────────────────

export function getProgressColor(pct: number): string {
	if (pct >= 90) return "bg-emerald-500";
	if (pct >= 60) return "bg-indigo-500";
	if (pct >= 30) return "bg-amber-400";
	return "bg-red-400";
}

// ── Avatar / Initials ─────────────────────────────────────────────────────────

export function getInitials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0].toUpperCase())
		.join("");
}

export const AVATAR_BG_COLORS = [
	"bg-indigo-500",
	"bg-violet-500",
	"bg-blue-500",
	"bg-emerald-500",
	"bg-amber-500",
	"bg-rose-500",
	"bg-teal-500",
	"bg-cyan-500",
];

export function getAvatarColor(name: string): string {
	let sum = 0;
	for (const c of name) sum += c.charCodeAt(0);
	return AVATAR_BG_COLORS[sum % AVATAR_BG_COLORS.length];
}

// ── Avatar Component helper ───────────────────────────────────────────────────

export const Avatar: React.FC<{
	user: UserMinimal;
	size?: "xs" | "sm" | "md" | "lg";
}> = ({ user, size = "sm" }) => {
	const sizes = {
		xs: "w-5 h-5 text-xs",
		sm: "w-7 h-7 text-xs",
		md: "w-9 h-9 text-sm",
		lg: "w-11 h-11 text-base",
	};
	if (user.avatar_url) {
		return (
			<img
				src={user.avatar_url}
				alt={user.full_name}
				className={`${sizes[size]} rounded-full object-cover ring-2 ring-white`}
			/>
		);
	}
	return (
		<div
			className={`${sizes[size]} ${getAvatarColor(user.full_name)} rounded-full flex items-center justify-center text-white font-semibold ring-2 ring-white`}>
			{getInitials(user.full_name)}
		</div>
	);
};

export const AvatarGroup: React.FC<{ users: UserMinimal[]; max?: number }> = ({
	users,
	max = 4,
}) => {
	const shown = users.slice(0, max);
	const extra = users.length - max;
	return (
		<div className="flex -space-x-2">
			{shown.map((u) => (
				<Avatar key={u.id} user={u} size="sm" />
			))}
			{extra > 0 && (
				<div className="w-7 h-7 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs font-medium text-gray-600">
					+{extra}
				</div>
			)}
		</div>
	);
};

// ── Misc ──────────────────────────────────────────────────────────────────────

export function clsx(
	...classes: (string | undefined | null | false)[]
): string {
	return classes.filter(Boolean).join(" ");
}

export function truncate(str: string, max: number): string {
	return str.length > max ? `${str.slice(0, max)}…` : str;
}

export function generateTaskReference(
	projectCode: string,
	count: number,
): string {
	return `${projectCode}-${String(count).padStart(4, "0")}`;
}

// ── Kanban drag-and-drop order helper ─────────────────────────────────────────

export function reorderList<T>(
	list: T[],
	startIndex: number,
	endIndex: number,
): T[] {
	const result = Array.from(list);
	const [removed] = result.splice(startIndex, 1);
	result.splice(endIndex, 0, removed);
	return result;
}

export function moveBetweenLists<T>(
	source: T[],
	dest: T[],
	sourceIndex: number,
	destIndex: number,
): { source: T[]; dest: T[] } {
	const sourceList = Array.from(source);
	const destList = Array.from(dest);
	const [removed] = sourceList.splice(sourceIndex, 1);
	destList.splice(destIndex, 0, removed);
	return { source: sourceList, dest: destList };
}
