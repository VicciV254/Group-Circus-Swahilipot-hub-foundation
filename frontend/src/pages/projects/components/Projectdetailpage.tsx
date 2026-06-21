// ─────────────────────────────────────────────────────────────────────────────
// Enterprise Internship Management System
// Projects — Project Detail Page (All Tabs)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { projectsApi } from "./api";
import { Project, ProjectActivity } from "./types";
import {
	STATUS_COLORS,
	STATUS_LABELS,
	PRIORITY_COLORS,
	PRIORITY_LABELS,
	formatDate,
	formatCurrency,
	formatRelativeTime,
	getProgressColor,
	AvatarGroup,
	Avatar,
	clsx,
} from "./utils";
import KanbanView from "./components/KanbanView";
import GanttView from "./components/GanttView";
import {
	TaskListView,
	MilestonesPanel,
	SprintsPanel,
	RiskPanel,
	BudgetPanel,
	DocumentsPanel,
	MeetingsPanel,
	MembersPanel,
	AnalyticsPanel,
	ActivityFeed,
	ProjectSettingsPanel,
} from "./components/Panels";

// ── Tab Definition ────────────────────────────────────────────────────────────

type TabKey =
	| "overview"
	| "kanban"
	| "list"
	| "gantt"
	| "sprints"
	| "milestones"
	| "risks"
	| "budget"
	| "documents"
	| "meetings"
	| "members"
	| "analytics"
	| "activity"
	| "settings";

interface Tab {
	key: TabKey;
	label: string;
	icon: React.ReactNode;
	badge?: number;
}

function buildTabs(project: Project): Tab[] {
	return [
		{
			key: "overview",
			label: "Overview",
			icon: (
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
				/>
			),
		},
		{
			key: "kanban",
			label: "Kanban",
			icon: (
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
				/>
			),
		},
		{
			key: "list",
			label: "Task List",
			icon: (
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
				/>
			),
			badge: project.task_stats?.total,
		},
		{
			key: "gantt",
			label: "Gantt",
			icon: (
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
				/>
			),
		},
		{
			key: "sprints",
			label: "Sprints",
			icon: (
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M13 10V3L4 14h7v7l9-11h-7z"
				/>
			),
		},
		{
			key: "milestones",
			label: "Milestones",
			icon: (
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
				/>
			),
		},
		{
			key: "risks",
			label: "Risks",
			icon: (
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			),
			badge: project.open_risks || undefined,
		},
		{
			key: "budget",
			label: "Budget",
			icon: (
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-9c-1.11 0-2.08.402-2.599 1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			),
		},
		{
			key: "documents",
			label: "Documents",
			icon: (
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
				/>
			),
		},
		{
			key: "meetings",
			label: "Meetings",
			icon: (
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
				/>
			),
		},
		{
			key: "members",
			label: "Team",
			icon: (
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
				/>
			),
			badge: project.member_count,
		},
		{
			key: "analytics",
			label: "Analytics",
			icon: (
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
				/>
			),
		},
		{
			key: "activity",
			label: "Activity",
			icon: (
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			),
		},
		{
			key: "settings",
			label: "Settings",
			icon: (
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
				/>
			),
		},
	];
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

const OverviewTab: React.FC<{
	project: Project;
	onNavigateToTab: (tab: TabKey) => void;
}> = ({ project, onNavigateToTab }) => {
	const daysLeft = project.end_date
		? Math.ceil((new Date(project.end_date).getTime() - Date.now()) / 86400000)
		: null;

	return (
		<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
			{/* Left — details */}
			<div className="lg:col-span-2 space-y-5">
				{/* About */}
				<div className="bg-white rounded-xl border border-gray-100 p-6">
					<h3 className="font-semibold text-gray-900 mb-3">About</h3>
					<p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">
						{project.description || "No description provided."}
					</p>
					{project.objectives && (
						<>
							<h4 className="font-medium text-gray-900 mt-5 mb-2">
								Objectives
							</h4>
							<p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">
								{project.objectives}
							</p>
						</>
					)}
				</div>

				{/* Progress */}
				<div className="bg-white rounded-xl border border-gray-100 p-6">
					<div className="flex items-center justify-between mb-3">
						<h3 className="font-semibold text-gray-900">Progress</h3>
						<span className="text-2xl font-bold text-gray-900">
							{project.progress_percent}%
						</span>
					</div>
					<div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-4">
						<div
							className={`h-full rounded-full transition-all duration-500 ${getProgressColor(project.progress_percent)}`}
							style={{ width: `${project.progress_percent}%` }}
						/>
					</div>
					{project.task_stats && (
						<div className="grid grid-cols-4 gap-3">
							{[
								{
									label: "Total",
									value: project.task_stats.total,
									color: "text-gray-700",
								},
								{
									label: "Done",
									value: project.task_stats.completed,
									color: "text-emerald-600",
								},
								{
									label: "In Progress",
									value: project.task_stats.by_status?.in_progress || 0,
									color: "text-blue-600",
								},
								{
									label: "Overdue",
									value: project.task_stats.overdue,
									color: "text-red-600",
								},
							].map((s) => (
								<div key={s.label} className="text-center">
									<p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
									<p className="text-xs text-gray-400">{s.label}</p>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Budget */}
				<div className="bg-white rounded-xl border border-gray-100 p-6">
					<div className="flex items-center justify-between mb-4">
						<h3 className="font-semibold text-gray-900">Budget</h3>
						<button
							onClick={() => onNavigateToTab("budget")}
							className="text-xs text-indigo-600 hover:underline font-medium">
							View Details →
						</button>
					</div>
					<div className="flex items-end justify-between mb-2">
						<span className="text-sm text-gray-500">Spent</span>
						<span className="text-sm font-medium text-gray-700">
							{formatCurrency(project.budget_spent)} /{" "}
							{formatCurrency(project.budget_allocated)}
						</span>
					</div>
					<div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
						<div
							className={clsx(
								"h-full rounded-full transition-all",
								project.budget_utilization > 90
									? "bg-red-500"
									: project.budget_utilization > 70
										? "bg-amber-400"
										: "bg-emerald-500",
							)}
							style={{ width: `${Math.min(project.budget_utilization, 100)}%` }}
						/>
					</div>
					<div className="flex justify-between mt-1.5">
						<span className="text-xs text-gray-400">
							{project.budget_utilization}% utilized
						</span>
						<span className="text-xs text-gray-400">
							{formatCurrency(project.budget_allocated - project.budget_spent)}{" "}
							remaining
						</span>
					</div>
				</div>

				{/* Milestones quick */}
				{project.milestones && project.milestones.length > 0 && (
					<div className="bg-white rounded-xl border border-gray-100 p-6">
						<h3 className="font-semibold text-gray-900 mb-4">Milestones</h3>
						<div className="space-y-3">
							{project.milestones.map((ms) => (
								<div key={ms.id} className="flex items-center gap-3">
									<div
										className={clsx(
											"w-4 h-4 rounded-full flex-shrink-0",
											ms.status === "completed"
												? "bg-emerald-500"
												: ms.is_overdue
													? "bg-red-500"
													: "bg-gray-200",
										)}
									/>
									<span
										className={clsx(
											"text-sm flex-1",
											ms.status === "completed" && "line-through text-gray-400",
										)}>
										{ms.name}
									</span>
									<span
										className={clsx(
											"text-xs",
											ms.is_overdue ? "text-red-600" : "text-gray-400",
										)}>
										{formatDate(ms.due_date)}
									</span>
								</div>
							))}
						</div>
					</div>
				)}
			</div>

			{/* Right — sidebar */}
			<div className="space-y-5">
				{/* Meta */}
				<div className="bg-white rounded-xl border border-gray-100 p-6">
					<h3 className="font-semibold text-gray-900 mb-4">Details</h3>
					<dl className="space-y-3">
						{[
							{
								label: "Status",
								value: (
									<span
										className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[project.status]}`}>
										{STATUS_LABELS[project.status]}
									</span>
								),
							},
							{
								label: "Priority",
								value: (
									<span className="text-sm">
										{PRIORITY_LABELS[project.priority]}
									</span>
								),
							},
							{
								label: "Start Date",
								value: (
									<span className="text-sm text-gray-700">
										{formatDate(project.start_date)}
									</span>
								),
							},
							{
								label: "Due Date",
								value: (
									<span
										className={clsx(
											"text-sm",
											project.is_overdue
												? "text-red-600 font-medium"
												: "text-gray-700",
										)}>
										{formatDate(project.end_date)}
										{daysLeft !== null && (
											<span className="ml-1 text-xs text-gray-400">
												(
												{daysLeft > 0
													? `${daysLeft}d left`
													: daysLeft === 0
														? "Today"
														: `${Math.abs(daysLeft)}d overdue`}
												)
											</span>
										)}
									</span>
								),
							},
							{
								label: "Owner",
								value: (
									<div className="flex items-center gap-2">
										<Avatar user={project.owner} size="xs" />
										<span className="text-sm text-gray-700">
											{project.owner.full_name}
										</span>
									</div>
								),
							},
							...(project.manager
								? [
										{
											label: "Manager",
											value: (
												<div className="flex items-center gap-2">
													<Avatar user={project.manager} size="xs" />
													<span className="text-sm text-gray-700">
														{project.manager.full_name}
													</span>
												</div>
											),
										},
									]
								: []),
						].map(({ label, value }) => (
							<div key={label} className="flex items-center justify-between">
								<dt className="text-xs text-gray-400">{label}</dt>
								<dd>{value}</dd>
							</div>
						))}
					</dl>
				</div>

				{/* Team */}
				{project.members && project.members.length > 0 && (
					<div className="bg-white rounded-xl border border-gray-100 p-6">
						<div className="flex items-center justify-between mb-4">
							<h3 className="font-semibold text-gray-900">Team</h3>
							<span className="text-xs text-gray-400">
								{project.members.filter((m) => m.is_active).length} members
							</span>
						</div>
						<div className="space-y-2.5">
							{project.members
								.filter((m) => m.is_active)
								.slice(0, 6)
								.map((m) => (
									<div key={m.id} className="flex items-center gap-2.5">
										<Avatar user={m.user} size="xs" />
										<div className="flex-1 min-w-0">
											<p className="text-sm font-medium text-gray-700 truncate">
												{m.user.full_name}
											</p>
											<p className="text-xs text-gray-400 capitalize">
												{m.role}
											</p>
										</div>
										<span className="text-xs text-gray-400">
											{m.allocation_percent}%
										</span>
									</div>
								))}
						</div>
					</div>
				)}

				{/* Tags */}
				{project.tags.length > 0 && (
					<div className="bg-white rounded-xl border border-gray-100 p-6">
						<h3 className="font-semibold text-gray-900 mb-3">Tags</h3>
						<div className="flex flex-wrap gap-2">
							{project.tags.map((tag) => (
								<span
									key={tag}
									className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium">
									{tag}
								</span>
							))}
						</div>
					</div>
				)}

				{/* Risks summary */}
				{project.risks && project.risks.length > 0 && (
					<div className="bg-white rounded-xl border border-gray-100 p-6">
						<h3 className="font-semibold text-gray-900 mb-3">Open Risks</h3>
						<div className="space-y-2">
							{project.risks
								.filter((r) => r.status !== "resolved")
								.slice(0, 4)
								.map((r) => (
									<div key={r.id} className="flex items-center gap-2">
										<span
											className={clsx(
												"w-2 h-2 rounded-full flex-shrink-0",
												r.severity === "critical"
													? "bg-red-500"
													: r.severity === "high"
														? "bg-orange-500"
														: r.severity === "medium"
															? "bg-amber-400"
															: "bg-gray-300",
											)}
										/>
										<p className="text-sm text-gray-700 truncate">{r.title}</p>
									</div>
								))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────

const ProjectDetailPage: React.FC = () => {
	const { projectId } = useParams<{ projectId: string }>();
	const navigate = useNavigate();

	const [project, setProject] = useState<Project | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<TabKey>("overview");

	const fetchProject = useCallback(async () => {
		if (!projectId) return;
		setLoading(true);
		setError(null);
		try {
			const p = await projectsApi.get(projectId);
			setProject(p);
		} catch {
			setError("Failed to load project.");
		} finally {
			setLoading(false);
		}
	}, [projectId]);

	useEffect(() => {
		fetchProject();
	}, [fetchProject]);

	if (loading)
		return (
			<div className="min-h-screen bg-gray-50 flex items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
					<p className="text-gray-500 text-sm">Loading project…</p>
				</div>
			</div>
		);

	if (error || !project)
		return (
			<div className="min-h-screen bg-gray-50 flex items-center justify-center">
				<div className="text-center">
					<p className="text-red-500 mb-4">{error || "Project not found."}</p>
					<button
						onClick={() => navigate("/projects")}
						className="text-indigo-600 underline text-sm">
						Back to Projects
					</button>
				</div>
			</div>
		);

	const tabs = buildTabs(project);

	return (
		<div className="min-h-screen bg-gray-50">
			{/* Top Header */}
			<div className="bg-white border-b border-gray-200 sticky top-0 z-30">
				<div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
					{/* Breadcrumb + title */}
					<div className="flex items-center gap-3 py-4">
						<Link to="/projects" className="text-gray-400 hover:text-gray-600">
							<svg
								className="w-4 h-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M15 19l-7-7 7-7"
								/>
							</svg>
						</Link>
						<span className="text-gray-300">/</span>
						<Link
							to="/projects"
							className="text-sm text-gray-500 hover:text-gray-700">
							Projects
						</Link>
						<span className="text-gray-300">/</span>

						{/* Color badge + name */}
						<div className="flex items-center gap-2.5 flex-1 min-w-0">
							<div
								className="w-6 h-6 rounded-md flex-shrink-0"
								style={{ backgroundColor: project.cover_color }}
							/>
							<h1 className="font-semibold text-gray-900 truncate">
								{project.name}
							</h1>
							<span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded hidden sm:inline">
								{project.code}
							</span>
							{project.is_confidential && (
								<span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded hidden sm:inline">
									Confidential
								</span>
							)}
							{project.is_overdue && (
								<span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded hidden sm:inline">
									Overdue
								</span>
							)}
						</div>

						{/* Right side */}
						<div className="flex items-center gap-3 flex-shrink-0">
							<div className="flex items-center gap-1.5 text-sm text-gray-500">
								<div className="h-2 bg-gray-100 rounded-full w-20 overflow-hidden">
									<div
										className={`h-full ${getProgressColor(project.progress_percent)} rounded-full`}
										style={{ width: `${project.progress_percent}%` }}
									/>
								</div>
								<span>{project.progress_percent}%</span>
							</div>
							<span
								className={`hidden sm:inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[project.status]}`}>
								{STATUS_LABELS[project.status]}
							</span>
							{project.members && (
								<AvatarGroup
									users={project.members
										.filter((m) => m.is_active)
										.map((m) => m.user)}
									max={4}
								/>
							)}
							<button
								onClick={fetchProject}
								className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"
								title="Refresh">
								<svg
									className="w-4 h-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
									/>
								</svg>
							</button>
						</div>
					</div>

					{/* Tabs */}
					<div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-px -mb-px">
						{tabs.map((tab) => (
							<button
								key={tab.key}
								onClick={() => setActiveTab(tab.key)}
								className={clsx(
									"flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
									activeTab === tab.key
										? "border-indigo-600 text-indigo-600"
										: "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200",
								)}>
								<svg
									className="w-4 h-4 flex-shrink-0"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor">
									{tab.icon}
								</svg>
								<span className="hidden sm:inline">{tab.label}</span>
								{tab.badge ? (
									<span className="bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
										{tab.badge}
									</span>
								) : null}
							</button>
						))}
					</div>
				</div>
			</div>

			{/* Tab Content */}
			<div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
				{activeTab === "overview" && (
					<OverviewTab project={project} onNavigateToTab={setActiveTab} />
				)}
				{activeTab === "kanban" && <KanbanView projectId={project.id} />}
				{activeTab === "list" && (
					<TaskListView projectId={project.id} project={project} />
				)}
				{activeTab === "gantt" && <GanttView projectId={project.id} />}
				{activeTab === "sprints" && <SprintsPanel projectId={project.id} />}
				{activeTab === "milestones" && (
					<MilestonesPanel projectId={project.id} />
				)}
				{activeTab === "risks" && <RiskPanel projectId={project.id} />}
				{activeTab === "budget" && (
					<BudgetPanel projectId={project.id} project={project} />
				)}
				{activeTab === "documents" && <DocumentsPanel projectId={project.id} />}
				{activeTab === "meetings" && <MeetingsPanel projectId={project.id} />}
				{activeTab === "members" && <MembersPanel projectId={project.id} />}
				{activeTab === "analytics" && <AnalyticsPanel projectId={project.id} />}
				{activeTab === "activity" && <ActivityFeed projectId={project.id} />}
				{activeTab === "settings" && (
					<ProjectSettingsPanel project={project} onUpdate={setProject} />
				)}
			</div>
		</div>
	);
};

export default ProjectDetailPage;
