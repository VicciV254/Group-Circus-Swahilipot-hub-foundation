// ─────────────────────────────────────────────────────────────────────────────
// Enterprise Internship Management System
// Projects — All Supporting Panel Components
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from "react";
import {
	projectsApi,
	tasksApi,
	sprintsApi,
	milestonesApi,
	risksApi,
	expensesApi,
	documentsApi,
	meetingsApi,
	membersApi,
} from "../api";
import {
	Project,
	Task,
	Sprint,
	Milestone,
	Risk,
	Expense,
	ProjectDocument,
	ProjectMeeting,
	ProjectMember,
	ProjectActivity,
	ProjectAnalytics,
	UUID,
	TaskStatus,
	UserMinimal,
} from "../types";
import {
	TASK_STATUS_COLORS,
	TASK_STATUS_LABELS,
	TASK_PRIORITY_COLORS,
	TASK_PRIORITY_LABELS,
	SPRINT_STATUS_COLORS,
	MILESTONE_STATUS_COLORS,
	RISK_SEVERITY_COLORS,
	RISK_STATUS_LABELS,
	STATUS_COLORS,
	STATUS_LABELS,
	formatDate,
	formatDateTime,
	formatRelativeTime,
	formatCurrency,
	formatFileSize,
	getProgressColor,
	Avatar,
	AvatarGroup,
	clsx,
} from "../utils";
import TaskDetailModal from "./TaskDetailModal";
import CreateTaskModal from "./CreateTaskModal";

// ═════════════════════════════════════════════════════════════════════════════
// TASK LIST VIEW
// ═════════════════════════════════════════════════════════════════════════════

export const TaskListView: React.FC<{ projectId: UUID; project: Project }> = ({
	projectId,
	project,
}) => {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [loading, setLoading] = useState(true);
	const [selected, setSelected] = useState<Task | null>(null);
	const [creating, setCreating] = useState(false);
	const [statusFilter, setStatusFilter] = useState("");
	const [priorityFilter, setPriorityFilter] = useState("");
	const [search, setSearch] = useState("");
	const [sort, setSort] = useState("-created_at");

	const fetch = useCallback(async () => {
		setLoading(true);
		try {
			const res = await tasksApi.list(projectId, {
				status: statusFilter as any,
				priority: priorityFilter as any,
				search,
			});
			setTasks(res.results);
		} finally {
			setLoading(false);
		}
	}, [projectId, statusFilter, priorityFilter, search]);

	useEffect(() => {
		fetch();
	}, [fetch]);

	const filtered = tasks.slice().sort((a, b) => {
		if (sort === "due_date")
			return (a.due_date || "").localeCompare(b.due_date || "");
		if (sort === "-due_date")
			return (b.due_date || "").localeCompare(a.due_date || "");
		if (sort === "priority") {
			const order = { urgent: 0, high: 1, medium: 2, low: 3 };
			return order[a.priority] - order[b.priority];
		}
		return 0;
	});

	return (
		<div>
			{/* Toolbar */}
			<div className="flex flex-wrap items-center gap-3 mb-4">
				<input
					type="text"
					placeholder="Search tasks…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
				/>
				<select
					value={statusFilter}
					onChange={(e) => setStatusFilter(e.target.value)}
					className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
					<option value="">All Status</option>
					{Object.entries(TASK_STATUS_LABELS).map(([k, v]) => (
						<option key={k} value={k}>
							{v}
						</option>
					))}
				</select>
				<select
					value={priorityFilter}
					onChange={(e) => setPriorityFilter(e.target.value)}
					className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
					<option value="">All Priority</option>
					{Object.entries(TASK_PRIORITY_LABELS).map(([k, v]) => (
						<option key={k} value={k}>
							{v}
						</option>
					))}
				</select>
				<select
					value={sort}
					onChange={(e) => setSort(e.target.value)}
					className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
					<option value="-created_at">Newest</option>
					<option value="due_date">Due Soon</option>
					<option value="-due_date">Due Late</option>
					<option value="priority">Priority High-Low</option>
				</select>
				<div className="ml-auto">
					<button
						onClick={() => setCreating(true)}
						className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
						<svg
							className="w-4 h-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 4v16m8-8H4"
							/>
						</svg>
						New Task
					</button>
				</div>
			</div>

			{/* Table */}
			<div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b border-gray-100 bg-gray-50">
							<th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
								Task
							</th>
							<th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">
								Status
							</th>
							<th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">
								Priority
							</th>
							<th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">
								Assignees
							</th>
							<th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden xl:table-cell">
								Due Date
							</th>
							<th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden xl:table-cell">
								Progress
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-50">
						{loading ? (
							[...Array(5)].map((_, i) => (
								<tr key={i} className="animate-pulse">
									<td className="px-4 py-3">
										<div className="h-4 bg-gray-100 rounded w-3/4" />
									</td>
									<td className="px-4 py-3 hidden md:table-cell">
										<div className="h-4 bg-gray-100 rounded w-16" />
									</td>
									<td className="px-4 py-3 hidden lg:table-cell">
										<div className="h-4 bg-gray-100 rounded w-12" />
									</td>
									<td className="px-4 py-3 hidden lg:table-cell">
										<div className="h-6 w-6 bg-gray-100 rounded-full" />
									</td>
									<td className="px-4 py-3 hidden xl:table-cell">
										<div className="h-4 bg-gray-100 rounded w-20" />
									</td>
									<td className="px-4 py-3 hidden xl:table-cell">
										<div className="h-2 bg-gray-100 rounded-full w-24" />
									</td>
								</tr>
							))
						) : filtered.length === 0 ? (
							<tr>
								<td
									colSpan={6}
									className="px-4 py-12 text-center text-gray-400">
									No tasks found.
								</td>
							</tr>
						) : (
							filtered.map((task) => (
								<tr
									key={task.id}
									onClick={() => setSelected(task)}
									className="hover:bg-indigo-50/30 cursor-pointer transition-colors group">
									<td className="px-4 py-3">
										<div className="flex items-center gap-2">
											<span className="text-xs font-mono text-gray-300 opacity-0 group-hover:opacity-100">
												{task.reference}
											</span>
											<span className="font-medium text-gray-800 truncate max-w-[300px]">
												{task.title}
											</span>
											{task.is_overdue && (
												<span className="text-xs bg-red-100 text-red-600 px-1.5 rounded">
													Overdue
												</span>
											)}
											{(task.attachment_count || 0) > 0 && (
												<span className="text-xs text-gray-400 flex items-center gap-0.5">
													<svg
														className="w-3 h-3"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor">
														<path
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth={2}
															d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
														/>
													</svg>
													{task.attachment_count}
												</span>
											)}
										</div>
									</td>
									<td className="px-4 py-3 hidden md:table-cell">
										<span
											className={clsx(
												"text-xs px-2 py-0.5 rounded-full font-medium",
												TASK_STATUS_COLORS[task.status],
											)}>
											{TASK_STATUS_LABELS[task.status]}
										</span>
									</td>
									<td className="px-4 py-3 hidden lg:table-cell">
										<span
											className={clsx(
												"text-xs px-2 py-0.5 rounded-full font-medium",
												TASK_PRIORITY_COLORS[task.priority],
											)}>
											{TASK_PRIORITY_LABELS[task.priority]}
										</span>
									</td>
									<td className="px-4 py-3 hidden lg:table-cell">
										{task.assignees.length > 0 ? (
											<AvatarGroup users={task.assignees} max={3} />
										) : (
											<span className="text-gray-300 text-xs">—</span>
										)}
									</td>
									<td className="px-4 py-3 hidden xl:table-cell">
										<span
											className={clsx(
												"text-xs",
												task.is_overdue
													? "text-red-600 font-medium"
													: "text-gray-500",
											)}>
											{formatDate(task.due_date)}
										</span>
									</td>
									<td className="px-4 py-3 hidden xl:table-cell">
										<div className="flex items-center gap-2">
											<div className="w-20 bg-gray-100 rounded-full h-1.5">
												<div
													className={`h-full rounded-full ${getProgressColor(task.progress_percent)}`}
													style={{ width: `${task.progress_percent}%` }}
												/>
											</div>
											<span className="text-xs text-gray-400">
												{task.progress_percent}%
											</span>
										</div>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			{selected && (
				<TaskDetailModal
					projectId={projectId}
					task={selected}
					onClose={() => setSelected(null)}
					onUpdate={(t) => {
						setSelected(t);
						fetch();
					}}
				/>
			)}
			{creating && (
				<CreateTaskModal
					projectId={projectId}
					onClose={() => setCreating(false)}
					onCreate={() => {
						setCreating(false);
						fetch();
					}}
				/>
			)}
		</div>
	);
};

// ═════════════════════════════════════════════════════════════════════════════
// SPRINTS PANEL
// ═════════════════════════════════════════════════════════════════════════════

export const SprintsPanel: React.FC<{ projectId: UUID }> = ({ projectId }) => {
	const [sprints, setSprints] = useState<Sprint[]>([]);
	const [loading, setLoading] = useState(true);
	const [creating, setCreating] = useState(false);
	const [form, setForm] = useState({
		name: "",
		goal: "",
		start_date: "",
		end_date: "",
	});

	const fetch = () =>
		sprintsApi
			.list(projectId)
			.then(setSprints)
			.finally(() => setLoading(false));
	useEffect(() => {
		fetch();
	}, [projectId]);

	const create = async () => {
		if (!form.name || !form.start_date || !form.end_date) return;
		await sprintsApi.create(projectId, form);
		setCreating(false);
		setForm({ name: "", goal: "", start_date: "", end_date: "" });
		fetch();
	};

	return (
		<div>
			<div className="flex items-center justify-between mb-4">
				<h3 className="font-semibold text-gray-800">Sprints</h3>
				<button
					onClick={() => setCreating(true)}
					className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
					<svg
						className="w-4 h-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M12 4v16m8-8H4"
						/>
					</svg>
					New Sprint
				</button>
			</div>

			{creating && (
				<div className="bg-white border border-indigo-200 rounded-xl p-5 mb-4 shadow-sm">
					<h4 className="font-semibold text-gray-800 mb-4">Create Sprint</h4>
					<div className="grid grid-cols-2 gap-4 mb-4">
						<div className="col-span-2">
							<label className="text-xs text-gray-500 mb-1 block">
								Sprint Name *
							</label>
							<input
								value={form.name}
								onChange={(e) =>
									setForm((f) => ({ ...f, name: e.target.value }))
								}
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
								placeholder="Sprint 1"
							/>
						</div>
						<div>
							<label className="text-xs text-gray-500 mb-1 block">
								Start Date *
							</label>
							<input
								type="date"
								value={form.start_date}
								onChange={(e) =>
									setForm((f) => ({ ...f, start_date: e.target.value }))
								}
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
							/>
						</div>
						<div>
							<label className="text-xs text-gray-500 mb-1 block">
								End Date *
							</label>
							<input
								type="date"
								value={form.end_date}
								onChange={(e) =>
									setForm((f) => ({ ...f, end_date: e.target.value }))
								}
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
							/>
						</div>
						<div className="col-span-2">
							<label className="text-xs text-gray-500 mb-1 block">
								Sprint Goal
							</label>
							<textarea
								value={form.goal}
								onChange={(e) =>
									setForm((f) => ({ ...f, goal: e.target.value }))
								}
								rows={2}
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
								placeholder="What do you aim to achieve?"
							/>
						</div>
					</div>
					<div className="flex gap-2 justify-end">
						<button
							onClick={() => setCreating(false)}
							className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">
							Cancel
						</button>
						<button
							onClick={create}
							className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
							Create Sprint
						</button>
					</div>
				</div>
			)}

			{loading ? (
				<div className="text-center py-8 text-gray-400">Loading sprints…</div>
			) : (
				<div className="space-y-4">
					{sprints.length === 0 && (
						<p className="text-center py-12 text-gray-400">No sprints yet.</p>
					)}
					{sprints.map((sprint) => (
						<div
							key={sprint.id}
							className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
							<div className="flex items-start justify-between mb-3">
								<div>
									<div className="flex items-center gap-2 mb-1">
										<h4 className="font-semibold text-gray-800">
											{sprint.name}
										</h4>
										<span
											className={clsx(
												"text-xs px-2 py-0.5 rounded-full font-medium",
												SPRINT_STATUS_COLORS[sprint.status],
											)}>
											{sprint.status}
										</span>
									</div>
									{sprint.goal && (
										<p className="text-sm text-gray-500">{sprint.goal}</p>
									)}
								</div>
								<div className="flex gap-2">
									{sprint.status === "planning" && (
										<button
											onClick={async () => {
												await sprintsApi.start(projectId, sprint.id);
												fetch();
											}}
											className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700">
											Start Sprint
										</button>
									)}
									{sprint.status === "active" && (
										<button
											onClick={async () => {
												await sprintsApi.complete(projectId, sprint.id);
												fetch();
											}}
											className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700">
											Complete
										</button>
									)}
								</div>
							</div>
							<div className="grid grid-cols-4 gap-4 mb-3">
								{[
									{ label: "Start", value: formatDate(sprint.start_date) },
									{ label: "End", value: formatDate(sprint.end_date) },
									{ label: "Tasks", value: sprint.task_count },
									{ label: "Done", value: sprint.done_count },
								].map(({ label, value }) => (
									<div key={label}>
										<p className="text-xs text-gray-400">{label}</p>
										<p className="text-sm font-semibold text-gray-700">
											{value}
										</p>
									</div>
								))}
							</div>
							{sprint.task_count > 0 && (
								<div>
									<div className="flex justify-between text-xs text-gray-400 mb-1">
										<span>Progress</span>
										<span>
											{Math.round(
												(sprint.done_count / sprint.task_count) * 100,
											)}
											%
										</span>
									</div>
									<div className="h-2 bg-gray-100 rounded-full overflow-hidden">
										<div
											className="h-full bg-indigo-500 rounded-full"
											style={{
												width: `${(sprint.done_count / sprint.task_count) * 100}%`,
											}}
										/>
									</div>
								</div>
							)}
							{sprint.velocity && (
								<p className="text-xs text-gray-400 mt-2">
									Velocity: <strong>{sprint.velocity} pts</strong>
								</p>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
};

// ═════════════════════════════════════════════════════════════════════════════
// MILESTONES PANEL
// ═════════════════════════════════════════════════════════════════════════════

export const MilestonesPanel: React.FC<{ projectId: UUID }> = ({
	projectId,
}) => {
	const [milestones, setMilestones] = useState<Milestone[]>([]);
	const [loading, setLoading] = useState(true);
	const [creating, setCreating] = useState(false);
	const [form, setForm] = useState({ name: "", description: "", due_date: "" });

	const fetch = () =>
		milestonesApi
			.list(projectId)
			.then(setMilestones)
			.finally(() => setLoading(false));
	useEffect(() => {
		fetch();
	}, [projectId]);

	const create = async () => {
		if (!form.name || !form.due_date) return;
		await milestonesApi.create(projectId, form);
		setCreating(false);
		setForm({ name: "", description: "", due_date: "" });
		fetch();
	};

	return (
		<div>
			<div className="flex items-center justify-between mb-4">
				<h3 className="font-semibold text-gray-800">Milestones</h3>
				<button
					onClick={() => setCreating(true)}
					className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
					<svg
						className="w-4 h-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M12 4v16m8-8H4"
						/>
					</svg>
					New Milestone
				</button>
			</div>

			{creating && (
				<div className="bg-white border border-amber-200 rounded-xl p-5 mb-4 shadow-sm">
					<h4 className="font-semibold text-gray-800 mb-4">Create Milestone</h4>
					<div className="space-y-3 mb-4">
						<input
							value={form.name}
							onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
							placeholder="Milestone name *"
							className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
						/>
						<input
							type="date"
							value={form.due_date}
							onChange={(e) =>
								setForm((f) => ({ ...f, due_date: e.target.value }))
							}
							className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
						/>
						<textarea
							value={form.description}
							onChange={(e) =>
								setForm((f) => ({ ...f, description: e.target.value }))
							}
							placeholder="Description"
							rows={2}
							className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
						/>
					</div>
					<div className="flex gap-2 justify-end">
						<button
							onClick={() => setCreating(false)}
							className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">
							Cancel
						</button>
						<button
							onClick={create}
							className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-amber-600">
							Create
						</button>
					</div>
				</div>
			)}

			{loading ? (
				<div className="text-center py-8 text-gray-400">Loading…</div>
			) : (
				<div className="space-y-3">
					{milestones.length === 0 && (
						<p className="text-center py-12 text-gray-400">
							No milestones yet.
						</p>
					)}
					{milestones.map((ms) => (
						<div
							key={ms.id}
							className={clsx(
								"bg-white rounded-xl border p-4 shadow-sm flex items-center gap-4",
								ms.is_overdue && ms.status !== "completed"
									? "border-red-200"
									: "border-gray-100",
							)}>
							<div
								className={clsx(
									"w-5 h-5 rotate-45 border-2 flex-shrink-0",
									ms.status === "completed"
										? "bg-emerald-500 border-emerald-600"
										: ms.is_overdue
											? "bg-red-400 border-red-500"
											: "bg-amber-400 border-amber-500",
								)}
							/>
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2 mb-0.5">
									<h4
										className={clsx(
											"font-semibold text-gray-800",
											ms.status === "completed" && "line-through text-gray-400",
										)}>
										{ms.name}
									</h4>
									<span
										className={clsx(
											"text-xs px-2 py-0.5 rounded-full font-medium",
											MILESTONE_STATUS_COLORS[ms.status],
										)}>
										{ms.status.replace("_", " ")}
									</span>
								</div>
								{ms.description && (
									<p className="text-xs text-gray-500 truncate">
										{ms.description}
									</p>
								)}
							</div>
							<div className="text-right flex-shrink-0">
								<p
									className={clsx(
										"text-sm font-medium",
										ms.is_overdue && ms.status !== "completed"
											? "text-red-600"
											: "text-gray-600",
									)}>
									{formatDate(ms.due_date)}
								</p>
								{ms.task_count > 0 && (
									<p className="text-xs text-gray-400">{ms.task_count} tasks</p>
								)}
							</div>
							{ms.status !== "completed" && (
								<button
									onClick={async () => {
										await milestonesApi.complete(projectId, ms.id);
										fetch();
									}}
									className="text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg hover:bg-emerald-100 flex-shrink-0">
									Mark Done
								</button>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
};

// ═════════════════════════════════════════════════════════════════════════════
// RISK PANEL
// ═════════════════════════════════════════════════════════════════════════════

export const RiskPanel: React.FC<{ projectId: UUID }> = ({ projectId }) => {
	const [risks, setRisks] = useState<Risk[]>([]);
	const [loading, setLoading] = useState(true);
	const [creating, setCreating] = useState(false);
	const [form, setForm] = useState({
		title: "",
		description: "",
		category: "",
		severity: "medium",
		probability: 50,
		impact_score: 50,
		mitigation_plan: "",
		contingency_plan: "",
	});

	const fetch = () =>
		risksApi
			.list(projectId)
			.then(setRisks)
			.finally(() => setLoading(false));
	useEffect(() => {
		fetch();
	}, [projectId]);

	const create = async () => {
		if (!form.title) return;
		await risksApi.create(projectId, form as any);
		setCreating(false);
		fetch();
	};

	const MATRIX_COLOR = (score: number) =>
		score >= 70
			? "bg-red-100 text-red-700"
			: score >= 40
				? "bg-amber-100 text-amber-700"
				: "bg-emerald-100 text-emerald-700";

	return (
		<div>
			<div className="flex items-center justify-between mb-4">
				<h3 className="font-semibold text-gray-800">Risk Register</h3>
				<button
					onClick={() => setCreating(true)}
					className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
					<svg
						className="w-4 h-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M12 4v16m8-8H4"
						/>
					</svg>
					Log Risk
				</button>
			</div>

			{creating && (
				<div className="bg-white border border-red-200 rounded-xl p-5 mb-4 shadow-sm">
					<h4 className="font-semibold text-gray-800 mb-4">Log New Risk</h4>
					<div className="grid grid-cols-2 gap-4 mb-4">
						<div className="col-span-2">
							<label className="text-xs text-gray-500 mb-1 block">
								Risk Title *
							</label>
							<input
								value={form.title}
								onChange={(e) =>
									setForm((f) => ({ ...f, title: e.target.value }))
								}
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
								placeholder="Describe the risk..."
							/>
						</div>
						<div>
							<label className="text-xs text-gray-500 mb-1 block">
								Category
							</label>
							<input
								value={form.category}
								onChange={(e) =>
									setForm((f) => ({ ...f, category: e.target.value }))
								}
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
								placeholder="Technical / HR / Legal..."
							/>
						</div>
						<div>
							<label className="text-xs text-gray-500 mb-1 block">
								Severity
							</label>
							<select
								value={form.severity}
								onChange={(e) =>
									setForm((f) => ({ ...f, severity: e.target.value }))
								}
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
								<option value="low">Low</option>
								<option value="medium">Medium</option>
								<option value="high">High</option>
								<option value="critical">Critical</option>
							</select>
						</div>
						<div>
							<label className="text-xs text-gray-500 mb-1 block">
								Probability: {form.probability}%
							</label>
							<input
								type="range"
								min={0}
								max={100}
								value={form.probability}
								onChange={(e) =>
									setForm((f) => ({ ...f, probability: +e.target.value }))
								}
								className="w-full"
							/>
						</div>
						<div>
							<label className="text-xs text-gray-500 mb-1 block">
								Impact: {form.impact_score}%
							</label>
							<input
								type="range"
								min={0}
								max={100}
								value={form.impact_score}
								onChange={(e) =>
									setForm((f) => ({ ...f, impact_score: +e.target.value }))
								}
								className="w-full"
							/>
						</div>
						<div className="col-span-2">
							<label className="text-xs text-gray-500 mb-1 block">
								Description
							</label>
							<textarea
								value={form.description}
								onChange={(e) =>
									setForm((f) => ({ ...f, description: e.target.value }))
								}
								rows={2}
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
							/>
						</div>
						<div>
							<label className="text-xs text-gray-500 mb-1 block">
								Mitigation Plan
							</label>
							<textarea
								value={form.mitigation_plan}
								onChange={(e) =>
									setForm((f) => ({ ...f, mitigation_plan: e.target.value }))
								}
								rows={2}
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
							/>
						</div>
						<div>
							<label className="text-xs text-gray-500 mb-1 block">
								Contingency Plan
							</label>
							<textarea
								value={form.contingency_plan}
								onChange={(e) =>
									setForm((f) => ({ ...f, contingency_plan: e.target.value }))
								}
								rows={2}
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
							/>
						</div>
					</div>
					<div className="flex gap-2 justify-end">
						<button
							onClick={() => setCreating(false)}
							className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">
							Cancel
						</button>
						<button
							onClick={create}
							className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-600">
							Log Risk
						</button>
					</div>
				</div>
			)}

			{loading ? (
				<div className="text-center py-8 text-gray-400">Loading…</div>
			) : (
				<div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-gray-100 bg-gray-50">
								{[
									"Risk",
									"Category",
									"Severity",
									"Probability",
									"Impact",
									"Score",
									"Status",
									"Actions",
								].map((h) => (
									<th
										key={h}
										className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
										{h}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-50">
							{risks.length === 0 ? (
								<tr>
									<td
										colSpan={8}
										className="px-4 py-12 text-center text-gray-400">
										No risks logged.
									</td>
								</tr>
							) : (
								risks.map((risk) => (
									<tr
										key={risk.id}
										className={clsx(
											"hover:bg-gray-50",
											risk.status === "resolved" && "opacity-50",
										)}>
										<td className="px-4 py-3 max-w-[180px]">
											<p className="font-medium text-gray-800 truncate">
												{risk.title}
											</p>
											{risk.description && (
												<p className="text-xs text-gray-400 truncate">
													{risk.description}
												</p>
											)}
										</td>
										<td className="px-4 py-3 text-xs text-gray-500">
											{risk.category || "—"}
										</td>
										<td className="px-4 py-3">
											<span
												className={clsx(
													"text-xs px-2 py-0.5 rounded-full font-medium",
													RISK_SEVERITY_COLORS[risk.severity],
												)}>
												{risk.severity}
											</span>
										</td>
										<td className="px-4 py-3 text-sm text-gray-600">
											{risk.probability}%
										</td>
										<td className="px-4 py-3 text-sm text-gray-600">
											{risk.impact_score}%
										</td>
										<td className="px-4 py-3">
											<span
												className={clsx(
													"text-xs px-2 py-0.5 rounded-full font-bold",
													MATRIX_COLOR(risk.risk_score),
												)}>
												{risk.risk_score}
											</span>
										</td>
										<td className="px-4 py-3 text-xs text-gray-500">
											{RISK_STATUS_LABELS[risk.status]}
										</td>
										<td className="px-4 py-3">
											{risk.status !== "resolved" && (
												<button
													onClick={async () => {
														await risksApi.resolve(projectId, risk.id);
														fetch();
													}}
													className="text-xs text-emerald-600 hover:underline">
													Resolve
												</button>
											)}
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
};

// ═════════════════════════════════════════════════════════════════════════════
// BUDGET PANEL (Expense Tracking)
// ═════════════════════════════════════════════════════════════════════════════

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
	labor: "Labor / Stipends",
	equipment: "Equipment",
	travel: "Travel",
	materials: "Materials & Supplies",
	software: "Software & Licenses",
	services: "Professional Services",
	venue: "Venue & Facilities",
	marketing: "Marketing & Communications",
	contingency: "Contingency",
	other: "Other",
};

const EXPENSE_CATEGORY_ICONS: Record<string, string> = {
	labor: "👥",
	equipment: "🛠️",
	travel: "✈️",
	materials: "📦",
	software: "💻",
	services: "🤝",
	venue: "🏢",
	marketing: "📣",
	contingency: "🛡️",
	other: "📋",
};

const EXPENSE_STATUS_COLORS: Record<string, string> = {
	pending: "bg-amber-100 text-amber-700",
	approved: "bg-emerald-100 text-emerald-700",
	rejected: "bg-red-100 text-red-600",
};

export const BudgetPanel: React.FC<{ projectId: UUID; project: Project }> = ({
	projectId,
	project,
}) => {
	const [expenses, setExpenses] = useState<Expense[]>([]);
	const [loading, setLoading] = useState(true);
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [form, setForm] = useState({
		title: "",
		description: "",
		category: "other",
		amount: "",
		currency: "USD",
		incurred_on: new Date().toISOString().slice(0, 10),
		receipt_url: "",
	});

	const fetch = () =>
		expensesApi
			.list(projectId)
			.then(setExpenses)
			.finally(() => setLoading(false));
	useEffect(() => {
		fetch();
	}, [projectId]);

	const submit = async () => {
		if (!form.title.trim() || !form.amount) {
			setError("Title and amount are required.");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			await expensesApi.create(projectId, {
				...form,
				amount: parseFloat(form.amount),
			} as any);
			setCreating(false);
			setForm({
				title: "",
				description: "",
				category: "other",
				amount: "",
				currency: "USD",
				incurred_on: new Date().toISOString().slice(0, 10),
				receipt_url: "",
			});
			fetch();
		} catch (e: any) {
			setError(e?.data?.detail || "Failed to log expense.");
		} finally {
			setSaving(false);
		}
	};

	const handleApprove = async (id: UUID) => {
		await expensesApi.approve(projectId, id);
		fetch();
	};

	const handleReject = async (id: UUID) => {
		const notes = window.prompt("Reason for rejection (optional):") || "";
		await expensesApi.reject(projectId, id, notes);
		fetch();
	};

	const approved = expenses.filter((e) => e.status === "approved");
	const pending = expenses.filter((e) => e.status === "pending");
	const approvedTotal = approved.reduce((sum, e) => sum + Number(e.amount), 0);
	const pendingTotal = pending.reduce((sum, e) => sum + Number(e.amount), 0);
	const allocated = project.budget_allocated || 0;
	const utilizationPct =
		allocated > 0 ? Math.min(100, (approvedTotal / allocated) * 100) : 0;

	const byCategory: Record<string, number> = {};
	approved.forEach((e) => {
		byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount);
	});

	return (
		<div>
			{/* Summary header */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
				<div className="bg-white rounded-xl border border-gray-100 p-4">
					<p className="text-xs text-gray-400 mb-1">Allocated</p>
					<p className="text-2xl font-bold text-gray-800">
						{formatCurrency(allocated)}
					</p>
				</div>
				<div className="bg-white rounded-xl border border-gray-100 p-4">
					<p className="text-xs text-gray-400 mb-1">Approved Spend</p>
					<p className="text-2xl font-bold text-indigo-600">
						{formatCurrency(approvedTotal)}
					</p>
				</div>
				<div className="bg-white rounded-xl border border-gray-100 p-4">
					<p className="text-xs text-gray-400 mb-1">Remaining</p>
					<p
						className={clsx(
							"text-2xl font-bold",
							allocated - approvedTotal < 0
								? "text-red-600"
								: "text-emerald-600",
						)}>
						{formatCurrency(allocated - approvedTotal)}
					</p>
				</div>
				<div className="bg-white rounded-xl border border-amber-100 p-4 bg-amber-50/30">
					<p className="text-xs text-amber-600 mb-1">Pending Approval</p>
					<p className="text-2xl font-bold text-amber-600">
						{formatCurrency(pendingTotal)}
					</p>
					{pending.length > 0 && (
						<p className="text-xs text-amber-500 mt-0.5">
							{pending.length} expense{pending.length !== 1 ? "s" : ""}
						</p>
					)}
				</div>
			</div>

			{/* Utilization bar */}
			<div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
				<div className="flex items-center justify-between mb-2">
					<h4 className="font-semibold text-gray-800">Budget Utilization</h4>
					<span className="text-sm font-medium text-gray-600">
						{allocated > 0 ? Math.round((approvedTotal / allocated) * 100) : 0}%
					</span>
				</div>
				<div className="h-3 bg-gray-100 rounded-full overflow-hidden">
					<div
						className={clsx(
							"h-full rounded-full transition-all",
							utilizationPct >= 100
								? "bg-red-500"
								: utilizationPct >= 80
									? "bg-amber-400"
									: "bg-indigo-500",
						)}
						style={{ width: `${utilizationPct}%` }}
					/>
				</div>
				{allocated === 0 && (
					<p className="text-xs text-gray-400 mt-2">
						No budget allocated yet. Set one on the Settings tab.
					</p>
				)}

				{/* By category breakdown */}
				{Object.keys(byCategory).length > 0 && (
					<div className="mt-5 space-y-2">
						<p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
							By Category
						</p>
						{Object.entries(byCategory)
							.sort((a, b) => b[1] - a[1])
							.map(([cat, amount]) => (
								<div key={cat} className="flex items-center gap-3">
									<span className="text-base">
										{EXPENSE_CATEGORY_ICONS[cat] || "📋"}
									</span>
									<span className="text-sm text-gray-600 flex-1">
										{EXPENSE_CATEGORY_LABELS[cat] || cat}
									</span>
									<span className="text-sm font-medium text-gray-700">
										{formatCurrency(amount)}
									</span>
								</div>
							))}
					</div>
				)}
			</div>

			{/* Header + log expense button */}
			<div className="flex items-center justify-between mb-4">
				<h3 className="font-semibold text-gray-800">Expense History</h3>
				<button
					onClick={() => setCreating(true)}
					className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
					<svg
						className="w-4 h-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M12 4v16m8-8H4"
						/>
					</svg>
					Log Expense
				</button>
			</div>

			{creating && (
				<div className="bg-white border border-indigo-200 rounded-xl p-5 mb-4 shadow-sm">
					<h4 className="font-semibold text-gray-800 mb-4">Log Expense</h4>
					{error && (
						<div className="bg-red-50 border border-red-200 rounded-lg p-2.5 mb-3 text-sm text-red-600">
							{error}
						</div>
					)}
					<div className="grid grid-cols-2 gap-4 mb-4">
						<div className="col-span-2">
							<label className="text-xs text-gray-500 mb-1 block">
								Title *
							</label>
							<input
								value={form.title}
								onChange={(e) =>
									setForm((f) => ({ ...f, title: e.target.value }))
								}
								placeholder="e.g. Venue deposit, laptop purchase…"
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
							/>
						</div>
						<div>
							<label className="text-xs text-gray-500 mb-1 block">
								Amount *
							</label>
							<input
								type="number"
								step="0.01"
								min="0.01"
								value={form.amount}
								onChange={(e) =>
									setForm((f) => ({ ...f, amount: e.target.value }))
								}
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
							/>
						</div>
						<div>
							<label className="text-xs text-gray-500 mb-1 block">
								Category
							</label>
							<select
								value={form.category}
								onChange={(e) =>
									setForm((f) => ({ ...f, category: e.target.value }))
								}
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
								{Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
									<option key={k} value={k}>
										{v}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className="text-xs text-gray-500 mb-1 block">
								Date Incurred
							</label>
							<input
								type="date"
								value={form.incurred_on}
								onChange={(e) =>
									setForm((f) => ({ ...f, incurred_on: e.target.value }))
								}
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
							/>
						</div>
						<div>
							<label className="text-xs text-gray-500 mb-1 block">
								Receipt URL (optional)
							</label>
							<input
								value={form.receipt_url}
								onChange={(e) =>
									setForm((f) => ({ ...f, receipt_url: e.target.value }))
								}
								placeholder="Link to receipt/invoice"
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
							/>
						</div>
						<div className="col-span-2">
							<label className="text-xs text-gray-500 mb-1 block">
								Description
							</label>
							<textarea
								value={form.description}
								onChange={(e) =>
									setForm((f) => ({ ...f, description: e.target.value }))
								}
								rows={2}
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
							/>
						</div>
					</div>
					<div className="flex gap-2 justify-end">
						<button
							onClick={() => {
								setCreating(false);
								setError(null);
							}}
							className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">
							Cancel
						</button>
						<button
							onClick={submit}
							disabled={saving}
							className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
							{saving ? "Logging…" : "Log Expense"}
						</button>
					</div>
				</div>
			)}

			{loading ? (
				<div className="text-center py-8 text-gray-400">Loading…</div>
			) : (
				<div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-gray-100 bg-gray-50">
								{[
									"Expense",
									"Category",
									"Amount",
									"Date",
									"Status",
									"Submitted By",
									"Actions",
								].map((h) => (
									<th
										key={h}
										className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
										{h}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-50">
							{expenses.length === 0 ? (
								<tr>
									<td
										colSpan={7}
										className="px-4 py-12 text-center text-gray-400">
										No expenses logged yet.
									</td>
								</tr>
							) : (
								expenses.map((exp) => (
									<tr
										key={exp.id}
										className={clsx(
											"hover:bg-gray-50",
											exp.status === "rejected" && "opacity-50",
										)}>
										<td className="px-4 py-3 max-w-[200px]">
											<p className="font-medium text-gray-800 truncate">
												{exp.title}
											</p>
											{exp.description && (
												<p className="text-xs text-gray-400 truncate">
													{exp.description}
												</p>
											)}
										</td>
										<td className="px-4 py-3 text-xs text-gray-500">
											{EXPENSE_CATEGORY_ICONS[exp.category]}{" "}
											{EXPENSE_CATEGORY_LABELS[exp.category] || exp.category}
										</td>
										<td className="px-4 py-3 text-sm font-semibold text-gray-700">
											{formatCurrency(Number(exp.amount))}
										</td>
										<td className="px-4 py-3 text-xs text-gray-500">
											{formatDate(exp.incurred_on)}
										</td>
										<td className="px-4 py-3">
											<span
												className={clsx(
													"text-xs px-2 py-0.5 rounded-full font-medium",
													EXPENSE_STATUS_COLORS[exp.status],
												)}>
												{exp.status}
											</span>
										</td>
										<td className="px-4 py-3 text-xs text-gray-500">
											{exp.submitted_by?.full_name || "—"}
										</td>
										<td className="px-4 py-3">
											{exp.status === "pending" && (
												<div className="flex gap-1.5">
													<button
														onClick={() => handleApprove(exp.id)}
														className="text-xs text-emerald-600 hover:underline">
														Approve
													</button>
													<button
														onClick={() => handleReject(exp.id)}
														className="text-xs text-red-500 hover:underline">
														Reject
													</button>
												</div>
											)}
											{exp.receipt_url && (
												<a
													href={exp.receipt_url}
													target="_blank"
													rel="noopener noreferrer"
													className="text-xs text-indigo-500 hover:underline">
													Receipt
												</a>
											)}
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
};

// ═════════════════════════════════════════════════════════════════════════════
// DOCUMENTS PANEL
// ═════════════════════════════════════════════════════════════════════════════

export const DocumentsPanel: React.FC<{ projectId: UUID }> = ({
	projectId,
}) => {
	const [docs, setDocs] = useState<ProjectDocument[]>([]);
	const [loading, setLoading] = useState(true);
	const [uploading, setUploading] = useState(false);
	const [file, setFile] = useState<File | null>(null);
	const [progress, setProgress] = useState(0);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [form, setForm] = useState({
		title: "",
		doc_type: "other",
		description: "",
	});

	const fetch = () =>
		documentsApi
			.list(projectId)
			.then(setDocs)
			.finally(() => setLoading(false));
	useEffect(() => {
		fetch();
	}, [projectId]);

	const DOC_TYPE_ICONS: Record<string, string> = {
		specification: "📋",
		contract: "📜",
		report: "📊",
		plan: "🗺️",
		minutes: "📝",
		deliverable: "📦",
		other: "📄",
	};

	const submitUpload = async () => {
		if (!file) {
			setError("Please choose a file.");
			return;
		}
		if (!form.title.trim()) {
			setError("Please enter a title.");
			return;
		}
		setSaving(true);
		setError(null);
		setProgress(0);
		try {
			// Reuses the existing org-wide file transfer endpoint for actual binary
			// storage, then creates a ProjectDocument record pointing at the
			// resulting URL — ProjectDocument itself stores metadata + file_url
			// only, it does not accept raw multipart uploads directly.
			//
			// NOTE: this app's file-transfer system does not return a direct
			// public URL on upload — it returns a `token`, and the file is later
			// retrieved via GET /file-transfer/download/{token}/. So the
			// file_url we store is a constructed download link using that token.
			const { fileTransferApi } = await import("../../../services/api");
			const uploadRes = await fileTransferApi.upload(file, setProgress);
			const uploaded = uploadRes.data;

			const API_BASE =
				(import.meta as any).env?.VITE_API_URL ??
				"http://127.0.0.1:8000/api/v1";
			const fileUrl = uploaded?.token
				? `${API_BASE}/file-transfer/download/${uploaded.token}/`
				: uploaded?.download_url || uploaded?.file_url || uploaded?.url || "";

			if (!fileUrl) {
				console.error(
					"File upload response (no recognized URL field found):",
					uploaded,
				);
			}

			if (!fileUrl) {
				setError(
					"Upload succeeded but no file URL was returned by the server.",
				);
				setSaving(false);
				return;
			}

			await documentsApi.upload(projectId, {
				title: form.title.trim(),
				doc_type: form.doc_type as any,
				description: form.description,
				file_url: fileUrl,
				file_name: file.name,
				file_size: file.size,
				mime_type: file.type,
				version: "1.0",
				is_latest: true,
			});

			setUploading(false);
			setFile(null);
			setForm({ title: "", doc_type: "other", description: "" });
			fetch();
		} catch (e: any) {
			setError(
				e?.data?.detail ||
					e?.response?.data?.detail ||
					"Upload failed. Please try again.",
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div>
			<div className="flex items-center justify-between mb-4">
				<h3 className="font-semibold text-gray-800">Documents</h3>
				<button
					onClick={() => setUploading(true)}
					className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
					<svg
						className="w-4 h-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
						/>
					</svg>
					Upload Document
				</button>
			</div>

			{uploading && (
				<div className="bg-white border border-indigo-200 rounded-xl p-5 mb-4 shadow-sm">
					<h4 className="font-semibold text-gray-800 mb-4">Upload Document</h4>
					{error && (
						<div className="bg-red-50 border border-red-200 rounded-lg p-2.5 mb-3 text-sm text-red-600">
							{error}
						</div>
					)}
					<div className="space-y-3 mb-4">
						<div>
							<label className="text-xs text-gray-500 mb-1 block">File *</label>
							<input
								type="file"
								onChange={(e) => setFile(e.target.files?.[0] || null)}
								className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
							/>
							{saving && (
								<div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
									<div
										className="h-full bg-indigo-500 rounded-full transition-all"
										style={{ width: `${progress}%` }}
									/>
								</div>
							)}
						</div>
						<input
							value={form.title}
							onChange={(e) =>
								setForm((f) => ({ ...f, title: e.target.value }))
							}
							placeholder="Document title *"
							className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
						/>
						<select
							value={form.doc_type}
							onChange={(e) =>
								setForm((f) => ({ ...f, doc_type: e.target.value }))
							}
							className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
							{Object.keys(DOC_TYPE_ICONS).map((t) => (
								<option key={t} value={t}>
									{t}
								</option>
							))}
						</select>
						<textarea
							value={form.description}
							onChange={(e) =>
								setForm((f) => ({ ...f, description: e.target.value }))
							}
							placeholder="Description"
							rows={2}
							className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
						/>
					</div>
					<div className="flex gap-2 justify-end">
						<button
							onClick={() => {
								setUploading(false);
								setError(null);
								setFile(null);
							}}
							className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">
							Cancel
						</button>
						<button
							onClick={submitUpload}
							disabled={saving}
							className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
							{saving ? `Uploading… ${progress}%` : "Upload"}
						</button>
					</div>
				</div>
			)}
			{loading ? (
				<div className="text-center py-8 text-gray-400">Loading…</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{docs.length === 0 && (
						<p className="col-span-3 text-center py-12 text-gray-400">
							No documents uploaded.
						</p>
					)}
					{docs.map((doc) => (
						<a
							key={doc.id}
							href={doc.file_url}
							target="_blank"
							rel="noopener noreferrer"
							className="bg-white rounded-xl border border-gray-100 p-4 hover:border-indigo-200 hover:shadow-md transition-all group">
							<div className="flex items-start gap-3">
								<div className="text-2xl">
									{DOC_TYPE_ICONS[doc.doc_type] || "📄"}
								</div>
								<div className="flex-1 min-w-0">
									<p className="font-medium text-gray-800 truncate group-hover:text-indigo-600">
										{doc.title}
									</p>
									<p className="text-xs text-gray-400 mt-0.5">
										{doc.doc_type} · v{doc.version}
									</p>
									<p className="text-xs text-gray-400">
										{formatFileSize(doc.file_size)} ·{" "}
										{doc.uploaded_by.full_name}
									</p>
									<p className="text-xs text-gray-300 mt-1">
										{formatRelativeTime(doc.created_at)}
									</p>
								</div>
							</div>
						</a>
					))}
				</div>
			)}
		</div>
	);
};

// ═════════════════════════════════════════════════════════════════════════════
// MEETINGS PANEL
// ═════════════════════════════════════════════════════════════════════════════

export const MeetingsPanel: React.FC<{ projectId: UUID }> = ({ projectId }) => {
	const [meetings, setMeetings] = useState<ProjectMeeting[]>([]);
	const [loading, setLoading] = useState(true);
	const [creating, setCreating] = useState(false);
	const [editingId, setEditingId] = useState<UUID | null>(null);
	const [form, setForm] = useState({
		title: "",
		description: "",
		scheduled_at: "",
		duration_min: 60,
		location: "",
		minutes: "",
	});

	const fetch = () =>
		meetingsApi
			.list(projectId)
			.then(setMeetings)
			.finally(() => setLoading(false));
	useEffect(() => {
		fetch();
	}, [projectId]);

	const resetForm = () => {
		setForm({
			title: "",
			description: "",
			scheduled_at: "",
			duration_min: 60,
			location: "",
			minutes: "",
		});
		setEditingId(null);
		setCreating(false);
	};

	const openEdit = (m: ProjectMeeting) => {
		setForm({
			title: m.title,
			description: m.description || "",
			// datetime-local inputs need 'YYYY-MM-DDTHH:mm', trim any seconds/timezone
			scheduled_at: m.scheduled_at?.slice(0, 16) || "",
			duration_min: m.duration_min,
			location: m.location || "",
			minutes: m.minutes || "",
		});
		setEditingId(m.id);
		setCreating(true);
	};

	const submit = async () => {
		if (!form.title || !form.scheduled_at) return;
		if (editingId) {
			await meetingsApi.update(projectId, editingId, form as any);
		} else {
			await meetingsApi.create(projectId, form as any);
		}
		resetForm();
		fetch();
	};

	const upcoming = meetings.filter(
		(m) => !m.is_completed && new Date(m.scheduled_at) >= new Date(),
	);
	const past = meetings.filter(
		(m) => m.is_completed || new Date(m.scheduled_at) < new Date(),
	);

	return (
		<div>
			<div className="flex items-center justify-between mb-4">
				<h3 className="font-semibold text-gray-800">Meetings</h3>
				<button
					onClick={() => setCreating(true)}
					className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
					<svg
						className="w-4 h-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M12 4v16m8-8H4"
						/>
					</svg>
					Schedule Meeting
				</button>
			</div>

			{creating && (
				<div className="bg-white border border-blue-200 rounded-xl p-5 mb-4 shadow-sm">
					<h4 className="font-semibold text-gray-800 mb-4">
						{editingId ? "Edit Meeting" : "Schedule Meeting"}
					</h4>
					<div className="grid grid-cols-2 gap-4 mb-4">
						<div className="col-span-2">
							<input
								value={form.title}
								onChange={(e) =>
									setForm((f) => ({ ...f, title: e.target.value }))
								}
								placeholder="Meeting title *"
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
							/>
						</div>
						<div>
							<input
								type="datetime-local"
								value={form.scheduled_at}
								onChange={(e) =>
									setForm((f) => ({ ...f, scheduled_at: e.target.value }))
								}
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
							/>
						</div>
						<div className="flex gap-2">
							<input
								type="number"
								value={form.duration_min}
								onChange={(e) =>
									setForm((f) => ({ ...f, duration_min: +e.target.value }))
								}
								className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
								placeholder="Minutes"
							/>
							<input
								value={form.location}
								onChange={(e) =>
									setForm((f) => ({ ...f, location: e.target.value }))
								}
								placeholder="Location or link"
								className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
							/>
						</div>
						<div className="col-span-2">
							<textarea
								value={form.description}
								onChange={(e) =>
									setForm((f) => ({ ...f, description: e.target.value }))
								}
								placeholder="Description"
								rows={2}
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
							/>
						</div>
						{editingId && (
							<div className="col-span-2">
								<label className="text-xs text-gray-500 mb-1 block">
									Meeting Minutes
								</label>
								<textarea
									value={form.minutes}
									onChange={(e) =>
										setForm((f) => ({ ...f, minutes: e.target.value }))
									}
									placeholder="Notes from the meeting…"
									rows={3}
									className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
								/>
							</div>
						)}
					</div>
					<div className="flex gap-2 justify-end">
						<button
							onClick={resetForm}
							className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">
							Cancel
						</button>
						<button
							onClick={submit}
							className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
							{editingId ? "Save Changes" : "Schedule"}
						</button>
					</div>
				</div>
			)}

			{loading ? (
				<div className="text-center py-8 text-gray-400">Loading…</div>
			) : (
				<div className="space-y-6">
					{upcoming.length > 0 && (
						<div>
							<h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
								Upcoming
							</h4>
							<div className="space-y-3">
								{upcoming.map((m) => (
									<div
										key={m.id}
										className="bg-white rounded-xl border border-blue-100 p-4 shadow-sm">
										<div className="flex items-start justify-between">
											<div>
												<h5 className="font-semibold text-gray-800">
													{m.title}
												</h5>
												<div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
													<span>📅 {formatDateTime(m.scheduled_at)}</span>
													<span>⏱ {m.duration_min}m</span>
													{m.location && <span>📍 {m.location}</span>}
												</div>
											</div>
											<div className="flex items-center gap-2">
												<AvatarGroup users={m.attendees} max={4} />
												<button
													onClick={() => openEdit(m)}
													className="text-xs bg-gray-50 text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100">
													Edit
												</button>
												<button
													onClick={async () => {
														await meetingsApi.complete(projectId, m.id);
														fetch();
													}}
													className="text-xs bg-emerald-50 text-emerald-600 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100">
													Mark Done
												</button>
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
					{past.length > 0 && (
						<div>
							<h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
								Past
							</h4>
							<div className="space-y-3">
								{past.slice(0, 5).map((m) => (
									<div
										key={m.id}
										className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm opacity-70 hover:opacity-100 transition-opacity">
										<div className="flex items-start justify-between">
											<div className="flex-1">
												<h5 className="font-medium text-gray-700">{m.title}</h5>
												<p className="text-xs text-gray-400 mt-0.5">
													{formatDateTime(m.scheduled_at)}
												</p>
												{m.minutes && (
													<p className="text-xs text-gray-500 mt-2 line-clamp-2">
														{m.minutes}
													</p>
												)}
											</div>
											<button
												onClick={() => openEdit(m)}
												className="text-xs bg-gray-50 text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 flex-shrink-0">
												{m.minutes ? "Edit" : "Add Minutes"}
											</button>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
					{meetings.length === 0 && (
						<p className="text-center py-12 text-gray-400">
							No meetings scheduled.
						</p>
					)}
				</div>
			)}
		</div>
	);
};

// ═════════════════════════════════════════════════════════════════════════════
// MEMBERS PANEL
// ═════════════════════════════════════════════════════════════════════════════

export const MembersPanel: React.FC<{ projectId: UUID }> = ({ projectId }) => {
	const [members, setMembers] = useState<ProjectMember[]>([]);
	const [loading, setLoading] = useState(true);
	const [adding, setAdding] = useState(false);
	const [users, setUsers] = useState<UserMinimal[]>([]);
	const [usersLoading, setUsersLoading] = useState(false);
	const [form, setForm] = useState({
		user_id: "",
		role: "member",
		allocation_percent: 100,
	});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetch = () =>
		membersApi
			.list(projectId)
			.then(setMembers)
			.finally(() => setLoading(false));
	useEffect(() => {
		fetch();
	}, [projectId]);

	const openAddForm = async () => {
		setAdding(true);
		setError(null);
		if (users.length === 0) {
			setUsersLoading(true);
			try {
				// Reuses the org-wide user directory endpoint (services/api.ts usersApi)
				// so members can be picked from real accounts rather than typed by hand.
				const { usersApi } = await import("../../../services/api");
				const res = await usersApi.list({ page_size: 200 });
				const list = Array.isArray(res.data)
					? res.data
					: res.data?.results || [];
				setUsers(
					list.map((u: any) => ({
						id: u.id,
						full_name:
							u.full_name || `${u.first_name} ${u.last_name}`.trim() || u.email,
						email: u.email,
						avatar_url: u.profile_photo,
					})),
				);
			} catch {
				setError("Could not load user directory.");
			} finally {
				setUsersLoading(false);
			}
		}
	};

	const submitAdd = async () => {
		if (!form.user_id) {
			setError("Please select a user.");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			await membersApi.add(projectId, form);
			setAdding(false);
			setForm({ user_id: "", role: "member", allocation_percent: 100 });
			fetch();
		} catch (e: any) {
			setError(
				e?.data?.detail ||
					e?.response?.data?.detail ||
					"Failed to add member. They may already be on this project.",
			);
		} finally {
			setSaving(false);
		}
	};

	const ROLE_COLORS: Record<string, string> = {
		lead: "bg-indigo-100 text-indigo-700",
		member: "bg-gray-100 text-gray-600",
		reviewer: "bg-violet-100 text-violet-700",
		observer: "bg-slate-100 text-slate-600",
		attachee: "bg-emerald-100 text-emerald-700",
		supervisor: "bg-amber-100 text-amber-700",
		consultant: "bg-blue-100 text-blue-700",
	};

	return (
		<div>
			<div className="flex items-center justify-between mb-4">
				<h3 className="font-semibold text-gray-800">
					Team Members ({members.filter((m) => m.is_active).length})
				</h3>
				<button
					onClick={openAddForm}
					className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
					<svg
						className="w-4 h-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
						/>
					</svg>
					Add Member
				</button>
			</div>

			{adding && (
				<div className="bg-white border border-indigo-200 rounded-xl p-5 mb-4 shadow-sm">
					<h4 className="font-semibold text-gray-800 mb-4">Add Team Member</h4>
					{error && (
						<div className="bg-red-50 border border-red-200 rounded-lg p-2.5 mb-3 text-sm text-red-600">
							{error}
						</div>
					)}
					<div className="grid grid-cols-2 gap-4 mb-4">
						<div className="col-span-2">
							<label className="text-xs text-gray-500 mb-1 block">User *</label>
							{usersLoading ? (
								<p className="text-sm text-gray-400">Loading users…</p>
							) : (
								<select
									value={form.user_id}
									onChange={(e) =>
										setForm((f) => ({ ...f, user_id: e.target.value }))
									}
									className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
									<option value="">Select a user…</option>
									{users
										.filter(
											(u) =>
												!members.some((m) => m.is_active && m.user.id === u.id),
										)
										.map((u) => (
											<option key={u.id} value={u.id}>
												{u.full_name} ({u.email})
											</option>
										))}
								</select>
							)}
						</div>
						<div>
							<label className="text-xs text-gray-500 mb-1 block">Role</label>
							<select
								value={form.role}
								onChange={(e) =>
									setForm((f) => ({ ...f, role: e.target.value }))
								}
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
								{Object.keys(ROLE_COLORS).map((r) => (
									<option key={r} value={r}>
										{r}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className="text-xs text-gray-500 mb-1 block">
								Allocation %
							</label>
							<input
								type="number"
								min={1}
								max={100}
								value={form.allocation_percent}
								onChange={(e) =>
									setForm((f) => ({
										...f,
										allocation_percent: +e.target.value,
									}))
								}
								className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
							/>
						</div>
					</div>
					<div className="flex gap-2 justify-end">
						<button
							onClick={() => {
								setAdding(false);
								setError(null);
							}}
							className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">
							Cancel
						</button>
						<button
							onClick={submitAdd}
							disabled={saving}
							className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
							{saving ? "Adding…" : "Add Member"}
						</button>
					</div>
				</div>
			)}
			{loading ? (
				<div className="text-center py-8 text-gray-400">Loading…</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{members.length === 0 && (
						<p className="col-span-2 text-center py-12 text-gray-400">
							No members yet.
						</p>
					)}
					{members
						.filter((m) => m.is_active)
						.map((member) => (
							<div
								key={member.id}
								className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-4">
								<Avatar user={member.user} size="md" />
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 mb-0.5">
										<p className="font-semibold text-gray-800">
											{member.user.full_name}
										</p>
										<span
											className={clsx(
												"text-xs px-2 py-0.5 rounded-full font-medium",
												ROLE_COLORS[member.role] || "bg-gray-100 text-gray-600",
											)}>
											{member.role}
										</span>
									</div>
									<p className="text-xs text-gray-400">{member.user.email}</p>
									<p className="text-xs text-gray-400 mt-0.5">
										Joined {formatDate(member.joined_at)} ·{" "}
										{member.allocation_percent}% allocated
									</p>
								</div>
								<button
									onClick={async () => {
										await membersApi.remove(projectId, member.id);
										fetch();
									}}
									className="p-2 text-gray-300 hover:text-red-400 rounded-lg hover:bg-red-50 transition-colors"
									title="Remove member">
									<svg
										className="w-4 h-4"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor">
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6"
										/>
									</svg>
								</button>
							</div>
						))}
				</div>
			)}
		</div>
	);
};

// ═════════════════════════════════════════════════════════════════════════════
// ANALYTICS PANEL
// ═════════════════════════════════════════════════════════════════════════════

export const AnalyticsPanel: React.FC<{ projectId: UUID }> = ({
	projectId,
}) => {
	const [data, setData] = useState<ProjectAnalytics | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		projectsApi
			.analytics(projectId)
			.then(setData)
			.finally(() => setLoading(false));
	}, [projectId]);

	if (loading)
		return (
			<div className="text-center py-12">
				<div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
			</div>
		);
	if (!data) return null;

	const { task_stats, risk_stats, member_stats, sprint_stats } = data;
	const statusOrder: TaskStatus[] = [
		"done",
		"approved",
		"in_progress",
		"in_review",
		"pending",
		"backlog",
		"overdue",
		"rejected",
		"submitted",
	];

	return (
		<div className="space-y-6">
			{/* KPI Cards */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
				{[
					{
						label: "Progress",
						value: `${data.progress_percent}%`,
						color: "text-indigo-600",
						bg: "bg-indigo-50",
					},
					{
						label: "Tasks Total",
						value: task_stats.total,
						color: "text-gray-700",
						bg: "bg-gray-50",
					},
					{
						label: "Overdue",
						value: task_stats.overdue,
						color: "text-red-600",
						bg: "bg-red-50",
					},
					{
						label: "Budget Used",
						value: `${data.budget_utilization}%`,
						color:
							task_stats.overdue > 0 ? "text-amber-600" : "text-emerald-600",
						bg: "bg-emerald-50",
					},
				].map(({ label, value, color, bg }) => (
					<div key={label} className={`${bg} rounded-xl p-4`}>
						<p className={`text-2xl font-bold ${color}`}>{value}</p>
						<p className="text-xs text-gray-500 mt-0.5">{label}</p>
					</div>
				))}
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				{/* Task by Status */}
				<div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
					<h4 className="font-semibold text-gray-800 mb-4">Tasks by Status</h4>
					<div className="space-y-2.5">
						{statusOrder
							.filter((s) => (task_stats.by_status[s] || 0) > 0)
							.map((s) => {
								const count = task_stats.by_status[s] || 0;
								const pct =
									task_stats.total > 0
										? Math.round((count / task_stats.total) * 100)
										: 0;
								return (
									<div key={s}>
										<div className="flex justify-between text-xs mb-1">
											<span className="text-gray-600 capitalize">
												{TASK_STATUS_LABELS[s]}
											</span>
											<span className="font-medium text-gray-700">{count}</span>
										</div>
										<div className="h-2 bg-gray-100 rounded-full overflow-hidden">
											<div
												className={clsx(
													"h-full rounded-full",
													TASK_STATUS_COLORS[s]?.split(" ")[0] || "bg-gray-300",
												)}
												style={{ width: `${pct}%` }}
											/>
										</div>
									</div>
								);
							})}
					</div>
				</div>

				{/* Task by Priority */}
				<div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
					<h4 className="font-semibold text-gray-800 mb-4">Hours Tracking</h4>
					<div className="space-y-4">
						<div>
							<div className="flex justify-between text-xs mb-1">
								<span className="text-gray-500">Estimated</span>
								<span className="font-medium">
									{task_stats.total_estimated_hours}h
								</span>
							</div>
							<div className="h-3 bg-gray-100 rounded-full" />
						</div>
						<div>
							<div className="flex justify-between text-xs mb-1">
								<span className="text-gray-500">Logged</span>
								<span className="font-medium text-indigo-600">
									{task_stats.total_logged_hours}h
								</span>
							</div>
							<div className="h-3 bg-gray-100 rounded-full overflow-hidden">
								<div
									className="h-full bg-indigo-500 rounded-full"
									style={{
										width:
											task_stats.total_estimated_hours > 0
												? `${Math.min(100, (task_stats.total_logged_hours / task_stats.total_estimated_hours) * 100)}%`
												: "0%",
									}}
								/>
							</div>
						</div>
					</div>

					<h4 className="font-semibold text-gray-800 mt-5 mb-3">Risks</h4>
					<div className="grid grid-cols-3 gap-3 text-center">
						<div className="bg-gray-50 rounded-lg p-3">
							<p className="text-xl font-bold text-gray-700">
								{risk_stats.total}
							</p>
							<p className="text-xs text-gray-400">Total</p>
						</div>
						<div className="bg-red-50 rounded-lg p-3">
							<p className="text-xl font-bold text-red-600">
								{risk_stats.open}
							</p>
							<p className="text-xs text-gray-400">Open</p>
						</div>
						<div className="bg-emerald-50 rounded-lg p-3">
							<p className="text-xl font-bold text-emerald-600">
								{risk_stats.total - risk_stats.open}
							</p>
							<p className="text-xs text-gray-400">Resolved</p>
						</div>
					</div>
				</div>
			</div>

			{/* Member Performance */}
			<div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
				<h4 className="font-semibold text-gray-800 mb-4">Member Performance</h4>
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-gray-100">
								{[
									"Member",
									"Role",
									"Tasks",
									"Completed",
									"Completion %",
									"Logged Hours",
								].map((h) => (
									<th
										key={h}
										className="text-left px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
										{h}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-50">
							{member_stats.map((m) => {
								const compPct =
									m.task_count > 0
										? Math.round((m.completed / m.task_count) * 100)
										: 0;
								return (
									<tr key={m.user_id}>
										<td className="px-3 py-3 font-medium text-gray-800">
											{m.name}
										</td>
										<td className="px-3 py-3 text-xs text-gray-500 capitalize">
											{m.role}
										</td>
										<td className="px-3 py-3 text-gray-700">{m.task_count}</td>
										<td className="px-3 py-3 text-emerald-600 font-medium">
											{m.completed}
										</td>
										<td className="px-3 py-3">
											<div className="flex items-center gap-2">
												<div className="w-16 bg-gray-100 rounded-full h-1.5">
													<div
														className={`h-full rounded-full ${getProgressColor(compPct)}`}
														style={{ width: `${compPct}%` }}
													/>
												</div>
												<span className="text-xs text-gray-500">
													{compPct}%
												</span>
											</div>
										</td>
										<td className="px-3 py-3 text-indigo-600 font-medium">
											{m.logged_hours}h
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</div>

			{/* Sprint velocity */}
			{sprint_stats.length > 0 && (
				<div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
					<h4 className="font-semibold text-gray-800 mb-4">Sprint Progress</h4>
					<div className="space-y-3">
						{sprint_stats.map((s) => (
							<div key={s.id} className="flex items-center gap-4">
								<span className="text-sm text-gray-700 w-32 truncate">
									{s.name}
								</span>
								<div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
									<div
										className="h-full bg-indigo-500 rounded-full"
										style={{
											width:
												s.total > 0
													? `${Math.round((s.done / s.total) * 100)}%`
													: "0%",
										}}
									/>
								</div>
								<span className="text-xs text-gray-500 w-20 text-right">
									{s.done}/{s.total} tasks
								</span>
								{s.velocity && (
									<span className="text-xs text-indigo-600 w-16 text-right">
										{s.velocity} pts
									</span>
								)}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
};

// ═════════════════════════════════════════════════════════════════════════════
// ACTIVITY FEED
// ═════════════════════════════════════════════════════════════════════════════

export const ActivityFeed: React.FC<{ projectId: UUID }> = ({ projectId }) => {
	const [activities, setActivities] = useState<ProjectActivity[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		projectsApi
			.activity(projectId)
			.then(setActivities)
			.finally(() => setLoading(false));
	}, [projectId]);

	const VERB_ICONS: Record<string, string> = {
		created: "✨",
		archived: "🗄️",
		restored: "♻️",
		status_changed: "🔄",
		task_created: "📝",
		task_status_changed: "🔀",
		task_moved: "↔️",
		task_submitted: "📤",
		task_approved: "✅",
		task_rejected: "❌",
		task_archived: "🗑️",
		deadline_extended: "📅",
		member_added: "👤",
		member_removed: "👋",
		sprint_created: "🏃",
		sprint_started: "🚀",
		sprint_completed: "🏁",
		milestone_completed: "🏆",
		risk_added: "⚠️",
		risk_resolved: "✓",
		commented: "💬",
		duplicate: "📋",
	};

	return (
		<div>
			<div className="flex items-center justify-between mb-4">
				<h3 className="font-semibold text-gray-800">Activity Feed</h3>
				<button
					onClick={() => projectsApi.activity(projectId).then(setActivities)}
					className="text-sm text-gray-400 hover:text-indigo-600 flex items-center gap-1">
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
					Refresh
				</button>
			</div>
			{loading ? (
				<div className="text-center py-8 text-gray-400">Loading activity…</div>
			) : (
				<div className="space-y-1">
					{activities.length === 0 && (
						<p className="text-center py-12 text-gray-400">No activity yet.</p>
					)}
					{activities.map((act, i) => (
						<div
							key={act.id}
							className={clsx(
								"flex items-start gap-3 py-3 px-3 rounded-xl hover:bg-gray-50 transition-colors",
								i < activities.length - 1 && "border-b border-gray-50",
							)}>
							<div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">
								{VERB_ICONS[act.verb] || "●"}
							</div>
							<div className="flex-1 min-w-0">
								<div className="flex items-start gap-2">
									<p className="text-sm text-gray-700 flex-1">
										<span className="font-semibold text-gray-800">
											{act.actor.full_name}
										</span>{" "}
										{act.description}
									</p>
									<span className="text-xs text-gray-400 flex-shrink-0 ml-2">
										{formatRelativeTime(act.created_at)}
									</span>
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
};

// ═════════════════════════════════════════════════════════════════════════════
// PROJECT SETTINGS PANEL
// ═════════════════════════════════════════════════════════════════════════════

export const ProjectSettingsPanel: React.FC<{
	project: Project;
	onUpdate: (p: Project) => void;
}> = ({ project, onUpdate }) => {
	const [form, setForm] = useState({
		name: project.name,
		description: project.description,
		objectives: project.objectives,
		status: project.status,
		priority: project.priority,
		start_date: project.start_date || "",
		end_date: project.end_date || "",
		budget_allocated: project.budget_allocated,
		cover_color: project.cover_color,
		is_confidential: project.is_confidential,
		tags: project.tags.join(", "),
	});
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	const save = async () => {
		setSaving(true);
		try {
			const updated = await projectsApi.update(project.id, {
				...form,
				tags: form.tags
					.split(",")
					.map((t) => t.trim())
					.filter(Boolean),
			} as any);
			onUpdate(updated);
			setSaved(true);
			setTimeout(() => setSaved(false), 2000);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="max-w-2xl">
			<div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm space-y-5">
				<h3 className="font-semibold text-gray-900">Project Settings</h3>

				<div>
					<label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
						Project Name
					</label>
					<input
						value={form.name}
						onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
						className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
					/>
				</div>

				<div>
					<label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
						Description
					</label>
					<textarea
						value={form.description}
						onChange={(e) =>
							setForm((f) => ({ ...f, description: e.target.value }))
						}
						rows={3}
						className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
					/>
				</div>

				<div>
					<label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
						Objectives
					</label>
					<textarea
						value={form.objectives}
						onChange={(e) =>
							setForm((f) => ({ ...f, objectives: e.target.value }))
						}
						rows={3}
						className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
					/>
				</div>

				<div className="grid grid-cols-2 gap-4">
					<div>
						<label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
							Status
						</label>
						<select
							value={form.status}
							onChange={(e) =>
								setForm((f) => ({ ...f, status: e.target.value as any }))
							}
							className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
							{Object.entries(STATUS_LABELS).map(([k, v]) => (
								<option key={k} value={k}>
									{v}
								</option>
							))}
						</select>
					</div>
					<div>
						<label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
							Priority
						</label>
						<select
							value={form.priority}
							onChange={(e) =>
								setForm((f) => ({ ...f, priority: e.target.value as any }))
							}
							className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
							{["critical", "high", "medium", "low"].map((p) => (
								<option key={p} value={p}>
									{p}
								</option>
							))}
						</select>
					</div>
					<div>
						<label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
							Start Date
						</label>
						<input
							type="date"
							value={form.start_date}
							onChange={(e) =>
								setForm((f) => ({ ...f, start_date: e.target.value }))
							}
							className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
						/>
					</div>
					<div>
						<label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
							Due Date
						</label>
						<input
							type="date"
							value={form.end_date}
							onChange={(e) =>
								setForm((f) => ({ ...f, end_date: e.target.value }))
							}
							className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
						/>
					</div>
				</div>

				<div>
					<label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
						Budget Allocated
					</label>
					<input
						type="number"
						value={form.budget_allocated}
						onChange={(e) =>
							setForm((f) => ({ ...f, budget_allocated: +e.target.value }))
						}
						className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
					/>
				</div>

				<div className="flex items-center gap-4">
					<div>
						<label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
							Cover Color
						</label>
						<input
							type="color"
							value={form.cover_color}
							onChange={(e) =>
								setForm((f) => ({ ...f, cover_color: e.target.value }))
							}
							className="w-12 h-10 border border-gray-200 rounded-lg cursor-pointer"
						/>
					</div>
					<div className="flex-1">
						<label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
							Tags (comma-separated)
						</label>
						<input
							value={form.tags}
							onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
							placeholder="frontend, backend, urgent"
							className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
						/>
					</div>
				</div>

				<label className="flex items-center gap-3 cursor-pointer">
					<input
						type="checkbox"
						checked={form.is_confidential}
						onChange={(e) =>
							setForm((f) => ({ ...f, is_confidential: e.target.checked }))
						}
						className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
					/>
					<span className="text-sm text-gray-700">Mark as Confidential</span>
					<span className="text-xs text-gray-400">(restricts visibility)</span>
				</label>

				<div className="flex gap-3 pt-2">
					<button
						onClick={save}
						disabled={saving}
						className={clsx(
							"px-6 py-2.5 rounded-xl text-sm font-medium transition-all",
							saved
								? "bg-emerald-600 text-white"
								: "bg-indigo-600 text-white hover:bg-indigo-700",
							saving && "opacity-70",
						)}>
						{saving ? "Saving…" : saved ? "✓ Saved!" : "Save Changes"}
					</button>
				</div>
			</div>

			{/* Danger Zone */}
			<div className="bg-white rounded-xl border border-red-100 p-6 shadow-sm mt-5">
				<h4 className="font-semibold text-red-600 mb-3">Danger Zone</h4>
				<div className="flex items-center justify-between">
					<div>
						<p className="text-sm font-medium text-gray-800">Archive Project</p>
						<p className="text-xs text-gray-400">
							Archive this project. Data is preserved and can be restored.
						</p>
					</div>
					<button
						onClick={async () => {
							if (window.confirm("Archive this project?")) {
								await projectsApi.delete(project.id);
								window.location.href = "/projects";
							}
						}}
						className="text-sm text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50">
						Archive
					</button>
				</div>
			</div>
		</div>
	);
};
