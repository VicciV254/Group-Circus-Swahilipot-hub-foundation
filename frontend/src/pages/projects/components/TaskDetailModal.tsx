// ─────────────────────────────────────────────────────────────────────────────
// Enterprise Internship Management System
// Projects — Task Detail Slide-Over Modal
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from "react";
import { tasksApi } from "../api";
import {
	Task,
	Comment,
	TimeLog,
	TaskChecklist,
	ChecklistItem,
	TaskSubmission,
  TaskAttachment,
  TaskStatus,
	UUID,
} from "../types/index";
import {
	TASK_STATUS_LABELS,
	TASK_STATUS_COLORS,
	TASK_PRIORITY_LABELS,
	TASK_PRIORITY_COLORS,
	formatDate,
	formatDateTime,
	formatRelativeTime,
	formatFileSize,
	Avatar,
	AvatarGroup,
	clsx,
} from "../utils";

// ── Status Pipeline ───────────────────────────────────────────────────────────

const STATUS_PIPELINE: TaskStatus[] = [
  "backlog",
  "pending",
  "in_progress",
  "in_review",
  "submitted",
  "approved",
];
// ── Comment Item ──────────────────────────────────────────────────────────────

const CommentItem: React.FC<{ comment: Comment; depth?: number }> = ({
	comment,
	depth = 0,
}) => (
	<div className={clsx("flex gap-3", depth > 0 && "ml-8 mt-2")}>
		<Avatar user={comment.author} size="sm" />
		<div className="flex-1 min-w-0">
			<div className="bg-gray-50 rounded-xl px-3 py-2.5">
				<div className="flex items-center gap-2 mb-1">
					<span className="text-sm font-semibold text-gray-800">
						{comment.author.full_name}
					</span>
					{comment.comment_type !== "general" && (
						<span
							className={clsx(
								"text-xs px-1.5 py-0.5 rounded font-medium",
								comment.comment_type === "approval"
									? "bg-emerald-100 text-emerald-700"
									: comment.comment_type === "rejection"
										? "bg-red-100 text-red-700"
										: "bg-violet-100 text-violet-700",
							)}>
							{comment.comment_type}
						</span>
					)}
					<span className="text-xs text-gray-400 ml-auto">
						{formatRelativeTime(comment.created_at)}
					</span>
					{comment.is_edited && (
						<span className="text-xs text-gray-300">(edited)</span>
					)}
				</div>
				<p className="text-sm text-gray-700 whitespace-pre-wrap">
					{comment.body}
				</p>
			</div>
			{comment.replies?.map((r) => (
				<CommentItem key={r.id} comment={r} depth={depth + 1} />
			))}
		</div>
	</div>
);

// ── Checklist Section ─────────────────────────────────────────────────────────

const ChecklistSection: React.FC<{
	checklist: TaskChecklist;
	projectId: UUID;
	taskId: UUID;
	onToggle: (checklistId: UUID, itemId: UUID, done: boolean) => void;
}> = ({ checklist, projectId, taskId, onToggle }) => (
	<div className="mb-4">
		<div className="flex items-center justify-between mb-2">
			<span className="text-sm font-semibold text-gray-700">
				{checklist.title}
			</span>
			<span className="text-xs text-gray-400">
				{checklist.completion_percent}%
			</span>
		</div>
		<div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-3">
			<div
				className="h-full bg-indigo-500 rounded-full"
				style={{ width: `${checklist.completion_percent}%` }}
			/>
		</div>
		<div className="space-y-1.5">
			{checklist.items.map((item) => (
				<label
					key={item.id}
					className="flex items-center gap-2.5 cursor-pointer group">
					<input
						type="checkbox"
						checked={item.is_done}
						onChange={(e) => onToggle(checklist.id, item.id, e.target.checked)}
						className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
					/>
					<span
						className={clsx(
							"text-sm transition-colors",
							item.is_done
								? "line-through text-gray-400"
								: "text-gray-700 group-hover:text-gray-900",
						)}>
						{item.text}
					</span>
					{item.completed_by && (
						<span className="text-xs text-gray-300 ml-auto">
							{item.completed_by.full_name}
						</span>
					)}
				</label>
			))}
		</div>
	</div>
);

// ── Time Log Entry ────────────────────────────────────────────────────────────

const TimeLogEntry: React.FC<{ log: TimeLog }> = ({ log }) => (
	<div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
		<Avatar user={log.logged_by} size="xs" />
		<div className="flex-1 min-w-0">
			<p className="text-sm text-gray-700">
				{log.description || "Time logged"}
			</p>
			<p className="text-xs text-gray-400">{formatDate(log.date)}</p>
		</div>
		<div className="text-right flex-shrink-0">
			<p className="text-sm font-semibold text-gray-800">{log.hours}h</p>
			{log.is_billable && <p className="text-xs text-emerald-600">Billable</p>}
		</div>
	</div>
);

// ── Section Tabs ──────────────────────────────────────────────────────────────

type SectionTab =
	| "details"
	| "comments"
	| "checklists"
	| "timelog"
	| "submissions"
	| "attachments"
	| "subtasks";

const SECTION_TABS: Array<{ key: SectionTab; label: string }> = [
	{ key: "details", label: "Details" },
	{ key: "comments", label: "Comments" },
	{ key: "checklists", label: "Checklists" },
	{ key: "timelog", label: "Time Log" },
	{ key: "submissions", label: "Submissions" },
	{ key: "attachments", label: "Attachments" },
	{ key: "subtasks", label: "Subtasks" },
];

// ── TASK DETAIL MODAL ─────────────────────────────────────────────────────────

interface Props {
	projectId: UUID;
	task: Task;
	onClose: () => void;
	onUpdate: (task: Task) => void;
}

const TaskDetailModal: React.FC<Props> = ({
	projectId,
	task: initialTask,
	onClose,
	onUpdate,
}) => {
	const [task, setTask] = useState<Task>(initialTask);
	const [section, setSection] = useState<SectionTab>("details");
	const [comments, setComments] = useState<Comment[]>([]);
	const [checklists, setChecklists] = useState<TaskChecklist[]>([]);
	const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
	const [submissions, setSubmissions] = useState<TaskSubmission[]>([]);
	const [newComment, setNewComment] = useState("");
	const [logHours, setLogHours] = useState("");
	const [logDesc, setLogDesc] = useState("");
	const [submitNotes, setSubmitNotes] = useState("");
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);

	const fetchTask = useCallback(async () => {
		try {
			const t = await tasksApi.get(projectId, task.id);
			setTask(t);
			setComments(t.comments || []);
			setChecklists(t.checklists || []);
			setTimeLogs(t.time_logs || []);
			setSubmissions(t.submissions || []);
		} catch {
			/* silent */
		}
	}, [projectId, task.id]);

	useEffect(() => {
		fetchTask();
	}, [fetchTask]);

	// ── Status update ─────────────────────────────────────────────────────────

	const updateStatus = async (newStatus: string) => {
		setSaving(true);
		try {
			const updated = await tasksApi.update(projectId, task.id, {
				status: newStatus as any,
			});
			setTask(updated);
			onUpdate(updated);
		} finally {
			setSaving(false);
		}
	};

	// ── Comment ───────────────────────────────────────────────────────────────

	const addComment = async () => {
		if (!newComment.trim()) return;
		setSaving(true);
		try {
			const c = await tasksApi.addComment(
				projectId,
				task.id,
				newComment.trim(),
			);
			setComments((prev) => [...prev, c]);
			setNewComment("");
		} finally {
			setSaving(false);
		}
	};

	// ── Time log ──────────────────────────────────────────────────────────────

	const logTime = async () => {
		if (!logHours) return;
		setSaving(true);
		try {
			const log = await tasksApi.logTime(projectId, task.id, {
				hours: parseFloat(logHours),
				description: logDesc,
				date: new Date().toISOString().slice(0, 10),
			});
			setTimeLogs((prev) => [log, ...prev]);
			setLogHours("");
			setLogDesc("");
			// Update task logged hours
			setTask((t) => ({
				...t,
				logged_hours: t.logged_hours + parseFloat(logHours),
			}));
		} finally {
			setSaving(false);
		}
	};

	// ── Submit task ───────────────────────────────────────────────────────────

	const submitTask = async () => {
		setSaving(true);
		try {
			const sub = await tasksApi.submit(projectId, task.id, submitNotes);
			setSubmissions((prev) => [sub, ...prev]);
			setSubmitNotes("");
			setTask((t) => ({ ...t, status: "submitted" as any }));
			onUpdate({ ...task, status: "submitted" as any });
		} finally {
			setSaving(false);
		}
	};

	// ── Review submission ─────────────────────────────────────────────────────

	const reviewSubmission = async (
		subId: UUID,
		action: "approve" | "reject",
	) => {
		const notes = action === "reject" ? prompt("Rejection reason:") || "" : "";
		setSaving(true);
		try {
			const updated = await tasksApi.reviewSubmission(
				projectId,
				task.id,
				subId,
				action,
				notes,
			);
			setSubmissions((prev) => prev.map((s) => (s.id === subId ? updated : s)));
			const newStatus = action === "approve" ? "approved" : "rejected";
			setTask((t) => ({ ...t, status: newStatus as any }));
			onUpdate({ ...task, status: newStatus as any });
		} finally {
			setSaving(false);
		}
	};

	// ── Checklist toggle ──────────────────────────────────────────────────────

	const toggleChecklistItem = async (
		checklistId: UUID,
		itemId: UUID,
		done: boolean,
	) => {
		await tasksApi.toggleChecklistItem(
			projectId,
			task.id,
			checklistId,
			itemId,
			done,
		);
		setChecklists((prev) =>
			prev.map((cl) =>
				cl.id === checklistId
					? {
							...cl,
							items: cl.items.map((i) =>
								i.id === itemId ? { ...i, is_done: done } : i,
							),
						}
					: cl,
			),
		);
	};

	const totalLoggedHours = timeLogs.reduce((sum, l) => sum + l.hours, 0);

	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm"
				onClick={onClose}
			/>

			{/* Slide-over panel */}
			<div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col">
				{/* Header */}
				<div className="flex items-start gap-3 px-6 py-4 border-b border-gray-100 flex-shrink-0">
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 mb-1">
							<span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
								{task.reference}
							</span>
							<span
								className={clsx(
									"text-xs px-2 py-0.5 rounded-full font-medium",
									TASK_STATUS_COLORS[task.status],
								)}>
								{TASK_STATUS_LABELS[task.status]}
							</span>
							<span
								className={clsx(
									"text-xs px-2 py-0.5 rounded-full font-medium",
									TASK_PRIORITY_COLORS[task.priority],
								)}>
								{TASK_PRIORITY_LABELS[task.priority]}
							</span>
							{task.is_overdue && (
								<span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
									Overdue
								</span>
							)}
						</div>
						<h2 className="text-lg font-semibold text-gray-900 leading-snug">
							{task.title}
						</h2>
					</div>
					<button
						onClick={onClose}
						className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 flex-shrink-0">
						<svg
							className="w-5 h-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				{/* Status Pipeline */}
				<div className="px-6 py-3 border-b border-gray-50 bg-gray-50/50 flex-shrink-0">
					<div className="flex items-center gap-1">
						{STATUS_PIPELINE.map((s, i) => {
							const idx = STATUS_PIPELINE.indexOf(task.status as any);
							const isPast = STATUS_PIPELINE.indexOf(s) <= idx;
							const isCurrent = s === task.status;
							return (
								<React.Fragment key={s}>
									<button
										onClick={() => updateStatus(s)}
										disabled={saving}
										className={clsx(
											"text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all",
											isCurrent
												? TASK_STATUS_COLORS[s as TaskStatus] +
														" ring-2 ring-offset-1 ring-current"
												: isPast
													? "bg-gray-100 text-gray-500"
													: "text-gray-300 hover:bg-gray-100 hover:text-gray-500",
										)}>
										{TASK_STATUS_LABELS[s as TaskStatus]}
									</button>
									{i < STATUS_PIPELINE.length - 1 && (
										<svg
											className="w-3 h-3 text-gray-300 flex-shrink-0"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor">
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M9 5l7 7-7 7"
											/>
										</svg>
									)}
								</React.Fragment>
							);
						})}
					</div>
				</div>

				{/* Section Tabs */}
				<div className="flex gap-0 border-b border-gray-100 px-6 overflow-x-auto flex-shrink-0">
					{SECTION_TABS.map((tab) => (
						<button
							key={tab.key}
							onClick={() => setSection(tab.key)}
							className={clsx(
								"text-sm py-3 px-3 border-b-2 transition-colors whitespace-nowrap",
								section === tab.key
									? "border-indigo-600 text-indigo-600 font-medium"
									: "border-transparent text-gray-500 hover:text-gray-700",
							)}>
							{tab.label}
							{tab.key === "comments" && comments.length > 0 && (
								<span className="ml-1.5 bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded-full">
									{comments.length}
								</span>
							)}
							{tab.key === "timelog" && totalLoggedHours > 0 && (
								<span className="ml-1.5 bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded-full">
									{totalLoggedHours}h
								</span>
							)}
							{tab.key === "submissions" && submissions.length > 0 && (
								<span className="ml-1.5 bg-amber-100 text-amber-600 text-xs px-1.5 py-0.5 rounded-full">
									{submissions.length}
								</span>
							)}
						</button>
					))}
				</div>

				{/* Content */}
				<div className="flex-1 overflow-y-auto px-6 py-5">
					{/* DETAILS */}
					{section === "details" && (
						<div className="space-y-5">
							{/* Description */}
							<div>
								<h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
									Description
								</h4>
								<p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
									{task.description || "No description."}
								</p>
							</div>

							{/* Meta grid */}
							<div className="grid grid-cols-2 gap-4">
								{[
									{
										label: "Assignees",
										value:
											task.assignees.length > 0 ? (
												<AvatarGroup users={task.assignees} />
											) : (
												<span className="text-gray-400 text-sm">
													Unassigned
												</span>
											),
									},
									{
										label: "Reporter",
										value: (
											<div className="flex items-center gap-1.5">
												<Avatar user={task.reporter} size="xs" />
												<span className="text-sm">
													{task.reporter.full_name}
												</span>
											</div>
										),
									},
									{
										label: "Start Date",
										value: (
											<span className="text-sm">
												{formatDate(task.start_date)}
											</span>
										),
									},
									{
										label: "Due Date",
										value: (
											<span
												className={clsx(
													"text-sm",
													task.is_overdue ? "text-red-600 font-medium" : "",
												)}>
												{formatDate(task.due_date)}
											</span>
										),
									},
									{
										label: "Est. Hours",
										value: (
											<span className="text-sm">
												{task.estimated_hours
													? `${task.estimated_hours}h`
													: "—"}
											</span>
										),
									},
									{
										label: "Logged Hours",
										value: (
											<span className="text-sm font-medium text-indigo-600">
												{task.logged_hours}h
											</span>
										),
									},
									{
										label: "Story Points",
										value: (
											<span className="text-sm">
												{task.story_points ?? "—"}
											</span>
										),
									},
									{
										label: "Progress",
										value: (
											<div className="flex items-center gap-2">
												<div className="flex-1 bg-gray-100 rounded-full h-1.5">
													<div
														className="h-full bg-indigo-500 rounded-full"
														style={{ width: `${task.progress_percent}%` }}
													/>
												</div>
												<span className="text-sm font-medium">
													{task.progress_percent}%
												</span>
											</div>
										),
									},
								].map(({ label, value }) => (
									<div key={label}>
										<p className="text-xs text-gray-400 mb-1">{label}</p>
										{value}
									</div>
								))}
							</div>

							{/* Tags */}
							{(task.tags.length > 0 || task.labels.length > 0) && (
								<div>
									<h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
										Tags & Labels
									</h4>
									<div className="flex flex-wrap gap-1.5">
										{task.tags.map((t) => (
											<span
												key={t}
												className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-lg font-medium">
												{t}
											</span>
										))}
										{task.labels.map((l) => (
											<span
												key={l}
												className="text-xs bg-violet-50 text-violet-600 px-2 py-0.5 rounded-lg font-medium">
												{l}
											</span>
										))}
									</div>
								</div>
							)}

							{/* Dependencies */}
							{(task.predecessors?.length || 0) > 0 && (
								<div>
									<h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
										Dependencies
									</h4>
									<div className="space-y-1">
										{task.predecessors?.map((dep) => (
											<div
												key={dep.id}
												className="flex items-center gap-2 text-sm text-gray-600">
												<svg
													className="w-3 h-3 text-indigo-400"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor">
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
														d="M13 5l7 7-7 7M5 5l7 7-7 7"
													/>
												</svg>
												<span className="font-mono text-xs text-gray-400">
													{dep.predecessor}
												</span>
												<span className="text-xs text-gray-400">
													({dep.dependency_type})
												</span>
											</div>
										))}
									</div>
								</div>
							)}

							{/* Timestamps */}
							<div className="pt-3 border-t border-gray-100 text-xs text-gray-400 space-y-1">
								<p>
									Created:{" "}
									{formatDateTime(
										task.reporter?.full_name ? undefined : undefined,
									)}
								</p>
								{task.completed_at && (
									<p>Completed: {formatDateTime(task.completed_at)}</p>
								)}
							</div>
						</div>
					)}

					{/* COMMENTS */}
					{section === "comments" && (
						<div>
							<div className="space-y-4 mb-6">
								{comments.length === 0 && (
									<p className="text-center text-gray-400 text-sm py-8">
										No comments yet. Start the conversation.
									</p>
								)}
								{comments.map((c) => (
									<CommentItem key={c.id} comment={c} />
								))}
							</div>
							{/* Add comment */}
							<div className="border-t border-gray-100 pt-4">
								<textarea
									value={newComment}
									onChange={(e) => setNewComment(e.target.value)}
									placeholder="Write a comment…"
									rows={3}
									className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
									onKeyDown={(e) => {
										if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
											addComment();
									}}
								/>
								<div className="flex justify-end mt-2">
									<button
										onClick={addComment}
										disabled={saving || !newComment.trim()}
										className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
										{saving ? "Sending…" : "Comment"}
									</button>
								</div>
							</div>
						</div>
					)}

					{/* CHECKLISTS */}
					{section === "checklists" && (
						<div>
							{checklists.length === 0 && (
								<p className="text-center text-gray-400 text-sm py-8">
									No checklists on this task.
								</p>
							)}
							{checklists.map((cl) => (
								<ChecklistSection
									key={cl.id}
									checklist={cl}
									projectId={projectId}
									taskId={task.id}
									onToggle={toggleChecklistItem}
								/>
							))}
						</div>
					)}

					{/* TIME LOG */}
					{section === "timelog" && (
						<div>
							{/* Log time form */}
							<div className="bg-gray-50 rounded-xl p-4 mb-5">
								<h4 className="text-sm font-semibold text-gray-700 mb-3">
									Log Time
								</h4>
								<div className="flex gap-3 mb-4">
									<input
										type="number"
										step="0.25"
										min="0.25"
										value={logHours}
										onChange={(e) => setLogHours(e.target.value)}
										placeholder="Hours"
										className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
									/>
									<input
										type="text"
										value={logDesc}
										onChange={(e) => setLogDesc(e.target.value)}
										placeholder="What did you work on?"
										className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
									/>
									<button
										onClick={logTime}
										disabled={saving || !logHours}
										className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
										Log
									</button>
								</div>

								{/* Hours tracking visual */}
								<div className="bg-white rounded-xl border border-gray-100 p-4">
									<div className="grid grid-cols-3 gap-4 mb-3">
										<div>
											<p className="text-xs text-gray-400 mb-1">Estimated</p>
											<p className="text-xl font-bold text-gray-700">
												{task.estimated_hours || 0}
												<span className="text-sm font-normal text-gray-400">
													h
												</span>
											</p>
										</div>
										<div>
											<p className="text-xs text-gray-400 mb-1">Logged</p>
											<p className="text-xl font-bold text-indigo-600">
												{task.logged_hours}
												<span className="text-sm font-normal text-indigo-300">
													h
												</span>
											</p>
										</div>
										<div>
											<p className="text-xs text-gray-400 mb-1">Remaining</p>
											<p
												className={clsx(
													"text-xl font-bold",
													task.estimated_hours &&
														task.logged_hours > task.estimated_hours
														? "text-red-600"
														: "text-emerald-600",
												)}>
												{task.estimated_hours
													? Math.max(
															0,
															task.estimated_hours - task.logged_hours,
														)
													: "—"}
												{task.estimated_hours ? (
													<span className="text-sm font-normal opacity-60">
														h
													</span>
												) : null}
											</p>
										</div>
									</div>

									{/* Progress bar */}
									{task.estimated_hours ? (
										<div>
											<div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
												<div
													className={clsx(
														"h-full rounded-full transition-all",
														task.logged_hours > task.estimated_hours
															? "bg-red-500"
															: task.logged_hours / task.estimated_hours >= 0.9
																? "bg-amber-400"
																: "bg-indigo-500",
													)}
													style={{
														width: `${Math.min(100, (task.logged_hours / task.estimated_hours) * 100)}%`,
													}}
												/>
											</div>
											<p className="text-xs text-gray-400 mt-1.5">
												{Math.round(
													(task.logged_hours / task.estimated_hours) * 100,
												)}
												% of estimate used
												{task.logged_hours > task.estimated_hours && (
													<span className="text-red-500 font-medium">
														{" "}
														· over estimate
													</span>
												)}
											</p>
										</div>
									) : (
										<p className="text-xs text-gray-400">
											No estimate set for this task.
										</p>
									)}
								</div>
							</div>

							{/* Entries list */}
							{timeLogs.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-10 text-center">
									<div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
										<svg
											className="w-6 h-6 text-gray-300"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor">
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={1.5}
												d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
											/>
										</svg>
									</div>
									<p className="text-sm text-gray-500 font-medium">
										No time logged yet
									</p>
									<p className="text-xs text-gray-400 mt-0.5">
										Log your first entry above to start tracking.
									</p>
								</div>
							) : (
								<div>
									<h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
										{timeLogs.length}{" "}
										{timeLogs.length === 1 ? "Entry" : "Entries"}
									</h4>
									{timeLogs.map((l) => (
										<TimeLogEntry key={l.id} log={l} />
									))}
								</div>
							)}
						</div>
					)}

					{/* SUBMISSIONS */}
					{section === "submissions" && (
						<div>
							{/* Submit form */}
							{!["approved", "submitted"].includes(task.status) && (
								<div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-5">
									<h4 className="text-sm font-semibold text-amber-800 mb-2">
										Submit Task for Review
									</h4>
									<textarea
										value={submitNotes}
										onChange={(e) => setSubmitNotes(e.target.value)}
										placeholder="Add notes about your submission…"
										rows={3}
										className="w-full border border-amber-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none bg-white"
									/>
									<div className="flex justify-end mt-2">
										<button
											onClick={submitTask}
											disabled={saving}
											className="bg-amber-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-amber-600 disabled:opacity-50">
											{saving ? "Submitting…" : "Submit for Review"}
										</button>
									</div>
								</div>
							)}

							{submissions.length === 0 && (
								<p className="text-center text-gray-400 text-sm py-4">
									No submissions yet.
								</p>
							)}
							{submissions.map((sub) => (
								<div
									key={sub.id}
									className="border border-gray-100 rounded-xl p-4 mb-3">
									<div className="flex items-center gap-2 mb-2">
										<Avatar user={sub.submitted_by} size="xs" />
										<span className="text-sm font-medium">
											{sub.submitted_by.full_name}
										</span>
										<span
											className={clsx(
												"ml-auto text-xs px-2 py-0.5 rounded-full font-medium",
												sub.status === "approved"
													? "bg-emerald-100 text-emerald-700"
													: sub.status === "rejected"
														? "bg-red-100 text-red-600"
														: "bg-amber-100 text-amber-700",
											)}>
											{sub.status}
										</span>
									</div>
									{sub.notes && (
										<p className="text-sm text-gray-600 mb-2">{sub.notes}</p>
									)}
									{sub.status === "pending" && (
										<div className="flex gap-2 mt-3">
											<button
												onClick={() => reviewSubmission(sub.id, "approve")}
												className="flex-1 bg-emerald-600 text-white text-xs py-2 rounded-lg hover:bg-emerald-700">
												Approve
											</button>
											<button
												onClick={() => reviewSubmission(sub.id, "reject")}
												className="flex-1 bg-red-500 text-white text-xs py-2 rounded-lg hover:bg-red-600">
												Reject
											</button>
										</div>
									)}
									{sub.review_notes && (
										<div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
											<strong>Review note:</strong> {sub.review_notes}
										</div>
									)}
								</div>
							))}
						</div>
					)}

					{/* ATTACHMENTS */}
					{section === "attachments" && (
						<div>
							{(task.attachments || []).length === 0 && (
								<p className="text-center text-gray-400 text-sm py-8">
									No attachments yet.
								</p>
							)}
							<div className="space-y-2">
								{(task.attachments || []).map((att) => (
									<a
										key={att.id}
										href={att.file_url}
										target="_blank"
										rel="noopener noreferrer"
										className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group">
										<div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-100">
											<svg
												className="w-5 h-5 text-gray-500 group-hover:text-indigo-600"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor">
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
												/>
											</svg>
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-sm font-medium text-gray-700 truncate">
												{att.file_name}
											</p>
											<p className="text-xs text-gray-400">
												{formatFileSize(att.file_size)} ·{" "}
												{att.uploaded_by.full_name}
											</p>
										</div>
										<svg
											className="w-4 h-4 text-gray-400 group-hover:text-indigo-600"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor">
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
											/>
										</svg>
									</a>
								))}
							</div>
						</div>
					)}

					{/* SUBTASKS */}
					{section === "subtasks" && (
						<div>
							{(task.subtasks || []).length === 0 && (
								<p className="text-center text-gray-400 text-sm py-8">
									No subtasks.
								</p>
							)}
							<div className="space-y-2">
								{(task.subtasks || []).map((sub) => (
									<div
										key={sub.id}
										className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl">
										<span
											className={clsx(
												"w-2 h-2 rounded-full flex-shrink-0",
												TASK_STATUS_COLORS[sub.status]
													.split(" ")[0]
													.replace("bg-", "bg-"),
											)}
										/>
										<span className="text-xs font-mono text-gray-400">
											{sub.reference}
										</span>
										<span className="text-sm text-gray-700 flex-1 truncate">
											{sub.title}
										</span>
										<span
											className={clsx(
												"text-xs px-2 py-0.5 rounded-full",
												TASK_STATUS_COLORS[sub.status],
											)}>
											{TASK_STATUS_LABELS[sub.status]}
										</span>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		</>
	);
};

export default TaskDetailModal;
