// Nexus Broadcast — News CMS  (production-level)
// Covers: story list/grid, write/edit modal, review modal, version history,
//         editorial comments, bulk actions, category filter, tag filter,
//         priority filter, date range, dashboard summary bar, image upload,
//         breaking/featured toggles, scheduled publish, submission deadline,
//         read-time, word-count, SEO fields, sources, and full role-gating.

import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import {
	Newspaper,
	Plus,
	Edit3,
	Eye,
	CheckCircle,
	XCircle,
	Clock,
	RotateCcw,
	Search,
	Tag,
	AlertCircle,
	ChevronRight,
	Zap,
	Archive,
	Filter,
	BarChart2,
	MessageSquare,
	History,
	Upload,
	Calendar,
	Trash2,
	Send,
	BookOpen,
	Star,
	RefreshCw,
	ChevronDown,
	ChevronUp,
	Globe,
	Link,
	X,
	Check,
	AlertTriangle,
	Download,
	Users,
	Layers,
} from "lucide-react";
import { newsApi } from "../../services/api";
import { useAuthStore } from "../../services/api";
import { format, formatDistanceToNow, parseISO, isAfter } from "date-fns";
import toast from "react-hot-toast";
import clsx from "clsx";

// ─── Types ────────────────────────────────────────────────────────────────────

type StoryStatus =
	| "draft"
	| "submitted"
	| "under_review"
	| "changes_requested"
	| "approved"
	| "published"
	| "rejected"
	| "archived";

type Priority = "low" | "normal" | "high" | "urgent";

interface Category {
	id: string;
	name: string;
	slug: string;
	colour: string;
	broadcast_deadline_hour: number;
	story_count: number;
}

interface EditorialComment {
	id: string;
	author_name: string;
	author_role: string;
	comment: string;
	action: string;
	is_resolved: boolean;
	resolved_at: string | null;
	created_at: string;
}

interface StoryVersion {
	id: string;
	version_number: number;
	title: string;
	body: string;
	edited_by_name: string;
	change_summary: string;
	created_at: string;
}

interface Story {
	id: string;
	title: string;
	subtitle: string;
	body: string;
	summary: string;
	tags: string[];
	sources: string[];
	status: StoryStatus;
	priority: Priority;
	is_breaking: boolean;
	is_featured: boolean;
	author_name: string;
	author_avatar: string | null;
	editor_name: string | null;
	category: string | null;
	category_name: string | null;
	category_colour: string | null;
	word_count: number;
	read_time_minutes: number;
	view_count: number;
	published_at: string | null;
	scheduled_publish_at: string | null;
	submission_deadline: string | null;
	rejection_reason: string;
	changes_requested_note: string;
	editorial_comments: EditorialComment[];
	versions: StoryVersion[];
	comment_count: number;
	unresolved_comment_count: number;
	created_at: string;
	updated_at: string;
	seo_title: string;
	seo_description: string;
	featured_image: string | null;
	featured_image_caption: string;
	featured_image_credit: string;
}

interface DashboardSummary {
	stories_by_status: Record<string, number>;
	today_published: number;
	pending_review: number;
	upcoming_radio_slots: number;
	expiring_subscriptions: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_META: Record<
	StoryStatus,
	{ label: string; badge: string; icon: JSX.Element }
> = {
	draft: { label: "Draft", badge: "badge-slate", icon: <Clock size={10} /> },
	submitted: {
		label: "Submitted",
		badge: "badge-blue",
		icon: <Send size={10} />,
	},
	under_review: {
		label: "Under Review",
		badge: "badge-amber",
		icon: <Eye size={10} />,
	},
	changes_requested: {
		label: "Changes Requested",
		badge: "badge-amber",
		icon: <RotateCcw size={10} />,
	},
	approved: {
		label: "Approved",
		badge: "badge-green",
		icon: <CheckCircle size={10} />,
	},
	published: {
		label: "Published",
		badge: "badge-green",
		icon: <Globe size={10} />,
	},
	rejected: {
		label: "Rejected",
		badge: "badge-red",
		icon: <XCircle size={10} />,
	},
	archived: {
		label: "Archived",
		badge: "badge-slate",
		icon: <Archive size={10} />,
	},
};

const PRIORITY_META: Record<Priority, { label: string; colour: string }> = {
	low: { label: "Low", colour: "text-slate-400" },
	normal: { label: "Normal", colour: "text-blue-400" },
	high: { label: "High", colour: "text-amber-400" },
	urgent: { label: "Urgent", colour: "text-red-400" },
};

const EDITOR_ROLES = ["editor", "broadcast_admin", "broadcast_staff"];
const JOURNALIST_ROLES = ["journalist", ...EDITOR_ROLES];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wordCount(text: string) {
	return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function readTime(wc: number) {
	return Math.max(1, Math.round(wc / 200));
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NewsPage() {
	const { user } = useAuthStore();
	const qc = useQueryClient();

	const isEditor = EDITOR_ROLES.includes(user?.role || "");
	const isJournalist = JOURNALIST_ROLES.includes(user?.role || "");

	// ── Tabs / filters ──
	const [activeTab, setActiveTab] = useState<
		"all" | "mine" | "review" | "published" | "archived"
	>("all");
	const [search, setSearch] = useState("");
	const [filterCategory, setFilterCategory] = useState("");
	const [filterPriority, setFilterPriority] = useState("");
	const [filterTag, setFilterTag] = useState("");
	const [filterDateFrom, setFilterDateFrom] = useState("");
	const [filterDateTo, setFilterDateTo] = useState("");
	const [showFilters, setShowFilters] = useState(false);
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

	// ── Modals ──
	const [showWriteModal, setShowWriteModal] = useState(false);
	const [showReviewModal, setShowReviewModal] = useState(false);
	const [showDetailDrawer, setShowDetailDrawer] = useState(false);
	const [showBulkBar, setShowBulkBar] = useState(false);
	const [selectedStory, setSelectedStory] = useState<Story | null>(null);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	// ── Data ──
	const { data: summary } = useQuery<DashboardSummary>({
		queryKey: ["news-summary"],
		queryFn: () => newsApi.dashboard().then((r) => r.data),
		refetchInterval: 120_000,
	});

	const { data: categories = [] } = useQuery<Category[]>({
		queryKey: ["news-categories"],
		queryFn: () => newsApi.categories().then((r) => r.data),
	});

	const {
		data: stories = [],
		isLoading,
		isFetching,
	} = useQuery<Story[]>({
		queryKey: [
			"news",
			activeTab,
			search,
			filterCategory,
			filterPriority,
			filterTag,
			filterDateFrom,
			filterDateTo,
		],
		queryFn: () =>
			newsApi
				.list({
					search: search || undefined,
					status:
						activeTab === "review"
							? "submitted"
							: activeTab === "published"
								? "published"
								: activeTab === "archived"
									? "archived"
									: undefined,
					author: activeTab === "mine" ? user?.id : undefined,
					category: filterCategory || undefined,
					priority: filterPriority || undefined,
					tag: filterTag || undefined,
					date_from: filterDateFrom || undefined,
					date_to: filterDateTo || undefined,
				})
				.then((r) => r.data.results || r.data),
		refetchInterval: 60_000,
	});

	// ── Mutations ──
	const reviewMutation = useMutation({
		mutationFn: ({
			id,
			action,
			comment,
		}: {
			id: string;
			action: string;
			comment: string;
		}) => newsApi.review(id, { action, comment }),
		onSuccess: (_, { action }) => {
			qc.invalidateQueries({ queryKey: ["news"] });
			qc.invalidateQueries({ queryKey: ["news-summary"] });
			setShowReviewModal(false);
			toast.success(`Story ${action.replace(/_/g, " ")} successfully`);
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Action failed"),
	});

	const bulkMutation = useMutation({
		mutationFn: ({ ids, action }: { ids: string[]; action: string }) =>
			newsApi.bulk({ ids, action }),
		onSuccess: (data) => {
			qc.invalidateQueries({ queryKey: ["news"] });
			qc.invalidateQueries({ queryKey: ["news-summary"] });
			setSelectedIds(new Set());
			setShowBulkBar(false);
			toast.success(`${data.data.updated} stories updated`);
			if (data.data.errors?.length) {
				toast.error(`${data.data.errors.length} stories could not be updated`);
			}
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Bulk action failed"),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => newsApi.delete(id),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["news"] });
			qc.invalidateQueries({ queryKey: ["news-summary"] });
			setShowDetailDrawer(false);
			toast.success("Story deleted");
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Delete failed"),
	});

	// ── Selection helpers ──
	const toggleSelect = useCallback((id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			next.has(id) ? next.delete(id) : next.add(id);
			return next;
		});
		setShowBulkBar(true);
	}, []);

	const selectAll = useCallback(() => {
		setSelectedIds(new Set(stories.map((s) => s.id)));
		setShowBulkBar(true);
	}, [stories]);

	const clearSelection = useCallback(() => {
		setSelectedIds(new Set());
		setShowBulkBar(false);
	}, []);

	const openStory = useCallback(
		(story: Story, mode: "edit" | "review" | "detail") => {
			setSelectedStory(story);
			if (mode === "edit") {
				setShowWriteModal(true);
			}
			if (mode === "review") {
				setShowReviewModal(true);
			}
			if (mode === "detail") {
				setShowDetailDrawer(true);
			}
		},
		[],
	);

	// ── Active filter count ──
	const filterCount = [
		filterCategory,
		filterPriority,
		filterTag,
		filterDateFrom,
		filterDateTo,
	].filter(Boolean).length;

	const tabs = [
		{ key: "all", label: "All Stories" },
		{ key: "mine", label: "My Stories" },
		...(isEditor
			? [
					{
						key: "review",
						label: `Pending Review${summary?.pending_review ? ` (${summary.pending_review})` : ""}`,
					},
				]
			: []),
		{ key: "published", label: "Published" },
		{ key: "archived", label: "Archived" },
	] as const;

	return (
		<div className="space-y-6 animate-fade-in">
			{/* ── Page Header ─────────────────────────────────────── */}
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<Newspaper size={24} className="text-Swahilipot-400" />
						News CMS
					</h1>
					<p className="page-subtitle">
						Write, review, and publish stories for broadcast
					</p>
				</div>
				<div className="flex items-center gap-2">
					{isJournalist && (
						<button
							onClick={() => {
								setSelectedStory(null);
								setShowWriteModal(true);
							}}
							className="btn-primary">
							<Plus size={16} /> Write Story
						</button>
					)}
				</div>
			</div>

			{/* ── Dashboard Summary Bar ────────────────────────────── */}
			{summary && (
				<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
					{[
						{
							label: "Published Today",
							value: summary.today_published,
							icon: <Globe size={14} />,
							colour: "text-green-400",
						},
						{
							label: "Pending Review",
							value: summary.pending_review,
							icon: <Eye size={14} />,
							colour: "text-amber-400",
						},
						{
							label: "Total Drafts",
							value: summary.stories_by_status?.draft ?? 0,
							icon: <Clock size={14} />,
							colour: "text-slate-400",
						},
						{
							label: "Upcoming Slots",
							value: summary.upcoming_radio_slots,
							icon: <Calendar size={14} />,
							colour: "text-blue-400",
						},
						{
							label: "Expiring Licences",
							value: summary.expiring_subscriptions,
							icon: <AlertTriangle size={14} />,
							colour: "text-red-400",
						},
					].map((stat) => (
						<div
							key={stat.label}
							className="card py-3 px-4 flex items-center gap-3">
							<span className={stat.colour}>{stat.icon}</span>
							<div>
								<div className="text-lg font-bold text-white leading-none">
									{stat.value}
								</div>
								<div className="text-[10px] text-slate-500 mt-0.5">
									{stat.label}
								</div>
							</div>
						</div>
					))}
				</div>
			)}

			{/* ── Tabs + Search + Filters ──────────────────────────── */}
			<div className="space-y-3">
				<div className="flex items-center gap-3 flex-wrap">
					{/* Tabs */}
					<div className="flex gap-1 p-1 bg-surface-card border border-surface-border rounded-xl overflow-x-auto">
						{tabs.map((tab) => (
							<button
								key={tab.key}
								onClick={() => setActiveTab(tab.key as any)}
								className={clsx(
									"px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
									activeTab === tab.key
										? "bg-Swahilipot-600 text-white"
										: "text-slate-400 hover:text-white",
								)}>
								{tab.label}
							</button>
						))}
					</div>

					{/* Search */}
					<div className="relative flex-1 min-w-[180px] max-w-72">
						<Search
							size={13}
							className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
						/>
						<input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search title, body, author…"
							className="input pl-8 py-1.5 text-sm w-full"
						/>
						{search && (
							<button
								onClick={() => setSearch("")}
								className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
								<X size={12} />
							</button>
						)}
					</div>

					{/* Filter toggle */}
					<button
						onClick={() => setShowFilters((v) => !v)}
						className={clsx(
							"btn-ghost btn-sm flex items-center gap-1.5",
							filterCount > 0 && "text-Swahilipot-400",
						)}>
						<Filter size={14} />
						Filters
						{filterCount > 0 && (
							<span className="ml-1 bg-Swahilipot-600 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
								{filterCount}
							</span>
						)}
					</button>

					{/* View mode */}
					<div className="flex gap-1 p-1 bg-surface-card border border-surface-border rounded-lg">
						{(["grid", "list"] as const).map((mode) => (
							<button
								key={mode}
								onClick={() => setViewMode(mode)}
								className={clsx(
									"p-1.5 rounded text-xs transition-all",
									viewMode === mode
										? "bg-surface-hover text-white"
										: "text-slate-500 hover:text-white",
								)}>
								{mode === "grid" ? (
									<Layers size={13} />
								) : (
									<BookOpen size={13} />
								)}
							</button>
						))}
					</div>

					{/* Refresh */}
					<button
						onClick={() => qc.invalidateQueries({ queryKey: ["news"] })}
						className={clsx(
							"btn-ghost btn-sm",
							isFetching && "animate-spin text-Swahilipot-400",
						)}>
						<RefreshCw size={14} />
					</button>

					{/* Select all (editor) */}
					{isEditor && stories.length > 0 && (
						<button onClick={selectAll} className="btn-ghost btn-sm text-xs">
							Select All
						</button>
					)}
				</div>

				{/* Filter panel */}
				{showFilters && (
					<div className="card p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 animate-fade-in">
						<div className="input-group">
							<label className="input-label">Category</label>
							<select
								value={filterCategory}
								onChange={(e) => setFilterCategory(e.target.value)}
								className="select-input text-sm">
								<option value="">All Categories</option>
								{categories.map((c) => (
									<option key={c.id} value={c.slug}>
										{c.name}
									</option>
								))}
							</select>
						</div>
						<div className="input-group">
							<label className="input-label">Priority</label>
							<select
								value={filterPriority}
								onChange={(e) => setFilterPriority(e.target.value)}
								className="select-input text-sm">
								<option value="">All Priorities</option>
								{Object.entries(PRIORITY_META).map(([k, v]) => (
									<option key={k} value={k}>
										{v.label}
									</option>
								))}
							</select>
						</div>
						<div className="input-group">
							<label className="input-label">Tag</label>
							<input
								value={filterTag}
								onChange={(e) => setFilterTag(e.target.value)}
								placeholder="Enter tag…"
								className="input text-sm"
							/>
						</div>
						<div className="input-group">
							<label className="input-label">Date From</label>
							<input
								type="date"
								value={filterDateFrom}
								onChange={(e) => setFilterDateFrom(e.target.value)}
								className="input text-sm"
							/>
						</div>
						<div className="input-group">
							<label className="input-label">Date To</label>
							<input
								type="date"
								value={filterDateTo}
								onChange={(e) => setFilterDateTo(e.target.value)}
								className="input text-sm"
							/>
						</div>
						{filterCount > 0 && (
							<div className="col-span-full flex justify-end">
								<button
									onClick={() => {
										setFilterCategory("");
										setFilterPriority("");
										setFilterTag("");
										setFilterDateFrom("");
										setFilterDateTo("");
									}}
									className="btn-ghost btn-sm text-xs text-red-400 hover:text-red-300">
									<X size={12} /> Clear filters
								</button>
							</div>
						)}
					</div>
				)}
			</div>

			{/* ── Bulk Action Bar ──────────────────────────────────── */}
			{showBulkBar && selectedIds.size > 0 && (
				<div className="card p-3 flex items-center gap-3 border-Swahilipot-600/40 bg-Swahilipot-900/20 animate-fade-in">
					<span className="text-sm text-slate-300">
						<span className="font-semibold text-white">{selectedIds.size}</span>{" "}
						selected
					</span>
					<div className="flex gap-2 flex-wrap">
						{[
							{ action: "publish", label: "Publish", cls: "btn-primary" },
							{ action: "approve", label: "Approve", cls: "btn-success" },
							{ action: "archive", label: "Archive", cls: "btn-secondary" },
							{ action: "reject", label: "Reject", cls: "btn-danger" },
						].map(({ action, label, cls }) => (
							<button
								key={action}
								disabled={bulkMutation.isPending}
								onClick={() =>
									bulkMutation.mutate({ ids: [...selectedIds], action })
								}
								className={`${cls} btn-sm text-xs`}>
								{label}
							</button>
						))}
					</div>
					<button
						onClick={clearSelection}
						className="ml-auto btn-ghost btn-sm text-slate-400">
						<X size={14} />
					</button>
				</div>
			)}

			{/* ── Stories Grid / List ──────────────────────────────── */}
			{isLoading ? (
				<div
					className={clsx(
						"grid gap-4",
						viewMode === "grid"
							? "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3"
							: "grid-cols-1",
					)}>
					{[...Array(6)].map((_, i) => (
						<div key={i} className="skeleton h-48 rounded-xl" />
					))}
				</div>
			) : stories.length === 0 ? (
				<div className="card text-center py-16">
					<Newspaper size={36} className="mx-auto text-slate-600 mb-3" />
					<p className="text-slate-400 font-medium">No stories found</p>
					<p className="text-slate-600 text-sm mt-1">
						{filterCount > 0
							? "Try clearing filters"
							: "Write your first story to get started"}
					</p>
					{isJournalist && (
						<button
							onClick={() => {
								setSelectedStory(null);
								setShowWriteModal(true);
							}}
							className="btn-primary mt-4 mx-auto">
							<Plus size={14} /> Write Story
						</button>
					)}
				</div>
			) : (
				<div
					className={clsx(
						"grid gap-4",
						viewMode === "grid"
							? "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3"
							: "grid-cols-1",
					)}>
					{stories.map((story) => (
						<StoryCard
							key={story.id}
							story={story}
							isEditor={isEditor}
							viewMode={viewMode}
							isSelected={selectedIds.has(story.id)}
							onSelect={() => toggleSelect(story.id)}
							onEdit={() => openStory(story, "edit")}
							onReview={() => openStory(story, "review")}
							onDetail={() => openStory(story, "detail")}
						/>
					))}
				</div>
			)}

			{/* ── Modals ──────────────────────────────────────────── */}
			{showWriteModal && (
				<WriteStoryModal
					story={selectedStory}
					categories={categories}
					onClose={() => setShowWriteModal(false)}
					onSuccess={() => {
						qc.invalidateQueries({ queryKey: ["news"] });
						qc.invalidateQueries({ queryKey: ["news-summary"] });
						setShowWriteModal(false);
					}}
				/>
			)}

			{showReviewModal && selectedStory && (
				<ReviewModal
					story={selectedStory}
					onClose={() => setShowReviewModal(false)}
					onAction={(action, comment) =>
						reviewMutation.mutate({ id: selectedStory.id, action, comment })
					}
					isPending={reviewMutation.isPending}
				/>
			)}

			{showDetailDrawer && selectedStory && (
				<StoryDetailDrawer
					story={selectedStory}
					isEditor={isEditor}
					onClose={() => setShowDetailDrawer(false)}
					onEdit={() => {
						setShowDetailDrawer(false);
						setShowWriteModal(true);
					}}
					onDelete={() => {
						if (
							confirm(`Delete "${selectedStory.title}"? This cannot be undone.`)
						) {
							deleteMutation.mutate(selectedStory.id);
						}
					}}
					onReview={() => {
						setShowDetailDrawer(false);
						setShowReviewModal(true);
					}}
				/>
			)}
		</div>
	);
}

// ─── Story Card ────────────────────────────────────────────────────────────────

function StoryCard({
	story,
	isEditor,
	viewMode,
	isSelected,
	onSelect,
	onEdit,
	onReview,
	onDetail,
}: {
	story: Story;
	isEditor: boolean;
	viewMode: "grid" | "list";
	isSelected: boolean;
	onSelect: () => void;
	onEdit: () => void;
	onReview: () => void;
	onDetail: () => void;
}) {
	const meta = STATUS_META[story.status] || STATUS_META.draft;
	const pMeta = PRIORITY_META[story.priority] || PRIORITY_META.normal;

	const isDeadlineSoon =
		story.submission_deadline &&
		isAfter(new Date(story.submission_deadline), new Date()) &&
		new Date(story.submission_deadline).getTime() - Date.now() <
			3 * 60 * 60 * 1000;

	return (
		<div
			onClick={onDetail}
			className={clsx(
				"card-hover group cursor-pointer transition-all",
				isSelected && "ring-2 ring-Swahilipot-500",
				viewMode === "list" && "flex items-start gap-4",
			)}>
			{/* Select checkbox (editor) */}
			{isEditor && (
				<div
					className={clsx(
						"flex-shrink-0",
						viewMode === "list" ? "mt-1" : "absolute top-3 left-3",
					)}
					onClick={(e) => {
						e.stopPropagation();
						onSelect();
					}}>
					<div
						className={clsx(
							"w-4 h-4 rounded border transition-all flex items-center justify-center",
							isSelected
								? "bg-Swahilipot-600 border-Swahilipot-500"
								: "border-surface-border hover:border-Swahilipot-500",
						)}>
						{isSelected && <Check size={10} className="text-white" />}
					</div>
				</div>
			)}

			<div
				className={clsx(
					"flex-1 min-w-0",
					viewMode === "list" && "flex items-start gap-4",
				)}>
				{/* Featured image thumbnail */}
				{story.featured_image && viewMode === "grid" && (
					<div className="w-full h-28 rounded-lg overflow-hidden mb-3 bg-surface-hover">
						<img
							src={story.featured_image}
							alt={story.title}
							className="w-full h-full object-cover"
						/>
					</div>
				)}

				{/* Breaking badge */}
				{story.is_breaking && (
					<div className="flex items-center gap-1 text-red-400 text-[10px] font-bold mb-1.5 animate-pulse">
						<Zap size={10} /> BREAKING
					</div>
				)}

				<div
					className={clsx(
						"flex items-start gap-2 mb-2",
						viewMode === "list" && "flex-1",
					)}>
					<div className="flex-1 min-w-0">
						{/* Status + category row */}
						<div className="flex items-center gap-2 mb-1.5 flex-wrap">
							<span
								className={clsx(
									"badge text-[9px] flex items-center gap-1",
									meta.badge,
								)}>
								{meta.icon} {meta.label}
							</span>
							{story.is_featured && (
								<span className="badge badge-amber text-[9px] flex items-center gap-1">
									<Star size={8} /> Featured
								</span>
							)}
							{story.category_name && (
								<span
									className="text-[9px] px-1.5 py-0.5 rounded font-medium"
									style={{
										background: `${story.category_colour}22`,
										color: story.category_colour || "#94a3b8",
									}}>
									{story.category_name}
								</span>
							)}
							<span
								className={clsx(
									"text-[9px] font-semibold ml-auto",
									pMeta.colour,
								)}>
								{pMeta.label}
							</span>
						</div>

						{/* Title */}
						<h3 className="font-semibold text-white text-sm leading-snug mb-1 line-clamp-2 group-hover:text-Swahilipot-400 transition-colors">
							{story.title}
						</h3>

						{story.subtitle && (
							<p className="text-xs text-slate-400 line-clamp-1 mb-1">
								{story.subtitle}
							</p>
						)}

						{/* Deadline warning */}
						{isDeadlineSoon && (
							<p className="text-[10px] text-amber-400 flex items-center gap-1 mb-1">
								<AlertCircle size={9} />
								Due{" "}
								{formatDistanceToNow(new Date(story.submission_deadline!), {
									addSuffix: true,
								})}
							</p>
						)}

						{/* Tags */}
						{story.tags?.length > 0 && (
							<div className="flex gap-1 flex-wrap mb-2">
								{story.tags.slice(0, 3).map((t) => (
									<span
										key={t}
										className="text-[9px] bg-surface-hover text-slate-400 px-1.5 py-0.5 rounded">
										#{t}
									</span>
								))}
								{story.tags.length > 3 && (
									<span className="text-[9px] text-slate-600">
										+{story.tags.length - 3}
									</span>
								)}
							</div>
						)}
					</div>

					{/* List-mode thumbnail */}
					{story.featured_image && viewMode === "list" && (
						<div className="w-20 h-14 rounded-lg overflow-hidden bg-surface-hover flex-shrink-0">
							<img
								src={story.featured_image}
								alt={story.title}
								className="w-full h-full object-cover"
							/>
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="flex items-center justify-between pt-2 border-t border-surface-border/50">
					<div className="flex items-center gap-2 min-w-0">
						{story.author_avatar ? (
							<img
								src={story.author_avatar}
								className="w-5 h-5 rounded-full"
								alt={story.author_name}
							/>
						) : (
							<div className="w-5 h-5 rounded-full bg-Swahilipot-700 flex items-center justify-center text-[8px] text-white font-bold">
								{story.author_name?.[0]}
							</div>
						)}
						<span className="text-[10px] text-slate-500 truncate">
							{story.author_name}
						</span>
						<span className="text-slate-700">·</span>
						<span className="text-[10px] text-slate-600">
							{formatDistanceToNow(new Date(story.updated_at), {
								addSuffix: true,
							})}
						</span>
					</div>

					<div className="flex items-center gap-2 flex-shrink-0">
						<span className="text-[9px] text-slate-600">
							{story.word_count}w
						</span>
						<span className="text-[9px] text-slate-600">
							{story.read_time_minutes}m
						</span>
						{story.unresolved_comment_count > 0 && (
							<span className="flex items-center gap-0.5 text-[9px] text-amber-400">
								<MessageSquare size={9} /> {story.unresolved_comment_count}
							</span>
						)}
						<button
							onClick={(e) => {
								e.stopPropagation();
								onEdit();
							}}
							className="btn-ghost p-1 text-slate-500 hover:text-white">
							<Edit3 size={11} />
						</button>
						{isEditor && story.status === "submitted" && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									onReview();
								}}
								className="btn-primary btn-sm text-[10px] px-2 py-0.5">
								Review
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

// ─── Write / Edit Story Modal ─────────────────────────────────────────────────

function WriteStoryModal({
	story,
	categories,
	onClose,
	onSuccess,
}: {
	story: Story | null;
	categories: Category[];
	onClose: () => void;
	onSuccess: () => void;
}) {
	const [activeSection, setActiveSection] = useState<
		"content" | "meta" | "seo" | "publish"
	>("content");
	const [tagInput, setTagInput] = useState("");
	const [sourceInput, setSourceInput] = useState("");
	const [submitStatus, setSubmitStatus] = useState<"draft" | "submitted">(
		"draft",
	);
	const imageInputRef = useRef<HTMLInputElement>(null);

	const {
		register,
		handleSubmit,
		watch,
		setValue,
		control,
		formState: { errors },
	} = useForm({
		defaultValues: story
			? {
					...story,
					category: story.category || "",
					tags: story.tags || [],
					sources: story.sources || [],
				}
			: {
					title: "",
					subtitle: "",
					body: "",
					summary: "",
					category: "",
					priority: "normal",
					is_breaking: false,
					is_featured: false,
					scheduled_publish_at: "",
					submission_deadline: "",
					seo_title: "",
					seo_description: "",
					featured_image_caption: "",
					featured_image_credit: "",
					tags: [] as string[],
					sources: [] as string[],
					status: "draft",
				},
	});

	const watchedBody = watch("body", "");
	const watchedTags = watch("tags", []) as string[];
	const watchedSources = watch("sources", []) as string[];
	const liveWC = wordCount(watchedBody);
	const liveRT = readTime(liveWC);

	const mutation = useMutation({
		mutationFn: (data: any) =>
			story ? newsApi.update(story.id, data) : newsApi.create(data),
		onSuccess: () => {
			toast.success(
				story
					? "Story updated"
					: submitStatus === "submitted"
						? "Story submitted for review"
						: "Draft saved",
			);
			onSuccess();
		},
		onError: (e: any) => {
			const detail = e.response?.data;
			if (typeof detail === "object") {
				Object.entries(detail).forEach(([k, v]) =>
					toast.error(`${k}: ${Array.isArray(v) ? v.join(", ") : v}`),
				);
			} else {
				toast.error(detail || "Failed to save story");
			}
		},
	});

	const onSubmit = (data: any) => {
		mutation.mutate({ ...data, status: submitStatus });
	};

	const addTag = () => {
		const tag = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
		if (tag && !watchedTags.includes(tag)) {
			setValue("tags", [...watchedTags, tag]);
		}
		setTagInput("");
	};

	const removeTag = (t: string) =>
		setValue(
			"tags",
			watchedTags.filter((x) => x !== t),
		);

	const addSource = () => {
		const s = sourceInput.trim();
		if (s && !watchedSources.includes(s)) {
			setValue("sources", [...watchedSources, s]);
		}
		setSourceInput("");
	};

	const removeSource = (s: string) =>
		setValue(
			"sources",
			watchedSources.filter((x) => x !== s),
		);

	const sections = [
		{ key: "content", label: "Content", icon: <BookOpen size={13} /> },
		{ key: "meta", label: "Metadata", icon: <Tag size={13} /> },
		{ key: "seo", label: "SEO", icon: <Globe size={13} /> },
		{ key: "publish", label: "Publish", icon: <Calendar size={13} /> },
	] as const;

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div
				className="modal-box max-w-4xl h-[90vh] flex flex-col"
				onClick={(e) => e.stopPropagation()}>
				{/* Header */}
				<div className="modal-header flex-shrink-0">
					<h3 className="font-semibold text-white">
						{story ? "Edit Story" : "Write New Story"}
					</h3>
					<div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
						<span>
							{liveWC} words · {liveRT} min read
						</span>
						<button onClick={onClose} className="btn-ghost p-1">
							<X size={16} />
						</button>
					</div>
				</div>

				{/* Section tabs */}
				<div className="flex border-b border-surface-border flex-shrink-0 px-6">
					{sections.map((s) => (
						<button
							key={s.key}
							type="button"
							onClick={() => setActiveSection(s.key)}
							className={clsx(
								"flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-all",
								activeSection === s.key
									? "border-Swahilipot-500 text-Swahilipot-400"
									: "border-transparent text-slate-500 hover:text-white",
							)}>
							{s.icon} {s.label}
						</button>
					))}
				</div>

				<form
					onSubmit={handleSubmit(onSubmit)}
					className="flex flex-col flex-1 min-h-0">
					<div className="modal-body flex-1 overflow-y-auto space-y-5">
						{/* ── Content Section ── */}
						{activeSection === "content" && (
							<>
								<div className="grid grid-cols-3 gap-4">
									<div className="input-group col-span-2">
										<label className="input-label">Headline *</label>
										<input
											{...register("title", {
												required: "Headline is required",
											})}
											className={clsx(
												"input text-base font-semibold",
												errors.title && "border-red-500",
											)}
											placeholder="Enter a compelling headline…"
										/>
										{errors.title && (
											<p className="text-red-400 text-xs mt-1">
												{errors.title.message as string}
											</p>
										)}
									</div>
									<div className="input-group">
										<label className="input-label">Category</label>
										<select {...register("category")} className="select-input">
											<option value="">None</option>
											{categories.map((c) => (
												<option key={c.id} value={c.id}>
													{c.name}
												</option>
											))}
										</select>
									</div>
								</div>

								<div className="input-group">
									<label className="input-label">Subtitle / Deck</label>
									<input
										{...register("subtitle")}
										className="input"
										placeholder="Supporting headline or deck…"
									/>
								</div>

								<div className="input-group">
									<label className="input-label">Story Body *</label>
									<textarea
										{...register("body", {
											required: "Story body is required",
										})}
										className={clsx(
											"textarea min-h-72 font-mono text-sm",
											errors.body && "border-red-500",
										)}
										placeholder="Write your story here…"
									/>
									{errors.body && (
										<p className="text-red-400 text-xs mt-1">
											{errors.body.message as string}
										</p>
									)}
									<p className="text-[10px] text-slate-600 mt-1">
										{liveWC} words · ~{liveRT} min read
									</p>
								</div>

								<div className="input-group">
									<label className="input-label">
										Summary / Broadcast Tease
									</label>
									<textarea
										{...register("summary")}
										className="textarea h-16 text-sm"
										placeholder="Short summary for listings and broadcast teaser…"
									/>
								</div>

								{/* Image upload */}
								<div className="input-group">
									<label className="input-label">Featured Image</label>
									<div
										className="border border-dashed border-surface-border rounded-lg p-4 flex items-center gap-3 hover:border-Swahilipot-500 transition-colors cursor-pointer"
										onClick={() => imageInputRef.current?.click()}>
										<Upload size={18} className="text-slate-500" />
										<div>
											<p className="text-sm text-slate-400">
												Click to upload image
											</p>
											<p className="text-xs text-slate-600">
												PNG, JPG, WEBP up to 10MB
											</p>
										</div>
									</div>
									<input
										ref={imageInputRef}
										type="file"
										accept="image/*"
										className="hidden"
										onChange={(e) => {
											const file = e.target.files?.[0];
											if (file) setValue("featured_image", file as any);
										}}
									/>
									<div className="grid grid-cols-2 gap-3 mt-2">
										<input
											{...register("featured_image_caption")}
											className="input text-sm"
											placeholder="Image caption…"
										/>
										<input
											{...register("featured_image_credit")}
											className="input text-sm"
											placeholder="Image credit / photographer…"
										/>
									</div>
								</div>

								{/* Flags */}
								<div className="flex items-center gap-6 flex-wrap">
									{[
										{
											field: "is_breaking",
											label: "Breaking News",
											colour: "text-red-400",
										},
										{
											field: "is_featured",
											label: "Feature Story",
											colour: "text-amber-400",
										},
									].map(({ field, label, colour }) => (
										<label
											key={field}
											className={clsx(
												"flex items-center gap-2 text-sm cursor-pointer",
												colour,
											)}>
											<input
												type="checkbox"
												{...register(field as any)}
												className="rounded"
											/>
											{label}
										</label>
									))}
								</div>
							</>
						)}

						{/* ── Meta Section ── */}
						{activeSection === "meta" && (
							<>
								<div className="input-group">
									<label className="input-label">Priority</label>
									<select {...register("priority")} className="select-input">
										{Object.entries(PRIORITY_META).map(([k, v]) => (
											<option key={k} value={k}>
												{v.label}
											</option>
										))}
									</select>
								</div>

								{/* Tags */}
								<div className="input-group">
									<label className="input-label">Tags</label>
									<div className="flex gap-2">
										<input
											value={tagInput}
											onChange={(e) => setTagInput(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === ",") {
													e.preventDefault();
													addTag();
												}
											}}
											className="input flex-1 text-sm"
											placeholder="Type a tag and press Enter or comma…"
										/>
										<button
											type="button"
											onClick={addTag}
											className="btn-secondary btn-sm">
											Add
										</button>
									</div>
									{watchedTags.length > 0 && (
										<div className="flex gap-1.5 flex-wrap mt-2">
											{watchedTags.map((t) => (
												<span
													key={t}
													className="flex items-center gap-1 text-xs bg-surface-hover text-slate-300 px-2 py-0.5 rounded-full">
													#{t}
													<button
														type="button"
														onClick={() => removeTag(t)}
														className="text-slate-500 hover:text-red-400">
														<X size={10} />
													</button>
												</span>
											))}
										</div>
									)}
								</div>

								{/* Sources */}
								<div className="input-group">
									<label className="input-label">Sources / References</label>
									<div className="flex gap-2">
										<input
											value={sourceInput}
											onChange={(e) => setSourceInput(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													e.preventDefault();
													addSource();
												}
											}}
											className="input flex-1 text-sm"
											placeholder="Source name or URL…"
										/>
										<button
											type="button"
											onClick={addSource}
											className="btn-secondary btn-sm">
											Add
										</button>
									</div>
									{watchedSources.length > 0 && (
										<ul className="mt-2 space-y-1">
											{watchedSources.map((s, i) => (
												<li
													key={i}
													className="flex items-center gap-2 text-xs text-slate-400 bg-surface-hover px-3 py-1.5 rounded">
													<Link size={10} className="flex-shrink-0" />
													<span className="flex-1 truncate">{s}</span>
													<button
														type="button"
														onClick={() => removeSource(s)}
														className="text-slate-600 hover:text-red-400">
														<X size={10} />
													</button>
												</li>
											))}
										</ul>
									)}
								</div>
							</>
						)}

						{/* ── SEO Section ── */}
						{activeSection === "seo" && (
							<>
								<div className="input-group">
									<label className="input-label">SEO Title</label>
									<input
										{...register("seo_title")}
										className="input"
										placeholder="Optimised title for search engines (leave blank to use headline)…"
										maxLength={300}
									/>
									<p className="text-[10px] text-slate-600 mt-1">
										{watch("seo_title")?.length || 0}/300 · Recommended: 50-60
										characters
									</p>
								</div>
								<div className="input-group">
									<label className="input-label">SEO Description</label>
									<textarea
										{...register("seo_description")}
										className="textarea h-20 text-sm"
										placeholder="Meta description for search engines…"
										maxLength={500}
									/>
									<p className="text-[10px] text-slate-600 mt-1">
										{watch("seo_description")?.length || 0}/500 · Recommended:
										150-160 characters
									</p>
								</div>
							</>
						)}

						{/* ── Publish Section ── */}
						{activeSection === "publish" && (
							<>
								<div className="grid grid-cols-2 gap-4">
									<div className="input-group">
										<label className="input-label">
											<Calendar size={12} className="inline mr-1" />
											Submission Deadline
										</label>
										<input
											type="datetime-local"
											{...register("submission_deadline")}
											className="input text-sm"
										/>
										<p className="text-[10px] text-slate-600 mt-1">
											Alert journalist if story is not submitted before this
											time
										</p>
									</div>
									<div className="input-group">
										<label className="input-label">
											<Clock size={12} className="inline mr-1" />
											Scheduled Publish Time
										</label>
										<input
											type="datetime-local"
											{...register("scheduled_publish_at")}
											className="input text-sm"
										/>
										<p className="text-[10px] text-slate-600 mt-1">
											Leave blank to publish immediately on approval
										</p>
									</div>
								</div>

								{/* Status summary card */}
								{story && (
									<div className="card bg-surface/60 p-4">
										<h4 className="text-xs font-semibold text-slate-300 mb-3">
											Current Status
										</h4>
										<div className="grid grid-cols-2 gap-3 text-xs">
											{[
												{
													label: "Status",
													value: STATUS_META[story.status]?.label,
												},
												{ label: "Author", value: story.author_name },
												{ label: "Editor", value: story.editor_name || "—" },
												{
													label: "Word Count",
													value: `${story.word_count} words`,
												},
												{
													label: "Read Time",
													value: `${story.read_time_minutes} min`,
												},
												{
													label: "Views",
													value: story.view_count.toLocaleString(),
												},
												{
													label: "Published",
													value: story.published_at
														? format(
																new Date(story.published_at),
																"dd MMM yyyy HH:mm",
															)
														: "—",
												},
												{
													label: "Comments",
													value: `${story.comment_count} (${story.unresolved_comment_count} open)`,
												},
											].map(({ label, value }) => (
												<div key={label}>
													<span className="text-slate-500">{label}: </span>
													<span className="text-slate-300">{value}</span>
												</div>
											))}
										</div>
									</div>
								)}
							</>
						)}
					</div>

					{/* Footer */}
					<div className="modal-footer flex-shrink-0">
						<button type="button" onClick={onClose} className="btn-secondary">
							Cancel
						</button>
						<button
							type="submit"
							disabled={mutation.isPending}
							onClick={() => setSubmitStatus("draft")}
							className="btn-secondary">
							{mutation.isPending && submitStatus === "draft"
								? "Saving…"
								: "Save Draft"}
						</button>
						<button
							type="submit"
							disabled={mutation.isPending}
							onClick={() => setSubmitStatus("submitted")}
							className="btn-primary">
							{mutation.isPending && submitStatus === "submitted"
								? "Submitting…"
								: story
									? "Update Story"
									: "Submit for Review"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

// ─── Review Modal ─────────────────────────────────────────────────────────────

function ReviewModal({
	story,
	onClose,
	onAction,
	isPending,
}: {
	story: Story;
	onClose: () => void;
	onAction: (action: string, comment: string) => void;
	isPending: boolean;
}) {
	const [comment, setComment] = useState("");
	const [activeTab, setActiveTab] = useState<"story" | "comments" | "versions">(
		"story",
	);
	const qc = useQueryClient();

	const addCommentMutation = useMutation({
		mutationFn: (text: string) =>
			newsApi.addComment(story.id, { comment: text }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["news"] });
			setComment("");
			toast.success("Comment added");
		},
		onError: (e: any) =>
			toast.error(e.response?.data?.detail || "Failed to add comment"),
	});

	const resolveCommentMutation = useMutation({
		mutationFn: (commentId: string) => newsApi.resolveComment(commentId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["news"] });
			toast.success("Comment resolved");
		},
	});

	const meta = STATUS_META[story.status] || STATUS_META.draft;

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div
				className="modal-box max-w-3xl h-[90vh] flex flex-col"
				onClick={(e) => e.stopPropagation()}>
				{/* Header */}
				<div className="modal-header flex-shrink-0">
					<h3 className="font-semibold text-white">Editorial Review</h3>
					<button onClick={onClose} className="ml-auto btn-ghost p-1">
						<X size={16} />
					</button>
				</div>

				{/* Sub-tabs */}
				<div className="flex border-b border-surface-border flex-shrink-0 px-6">
					{[
						{ key: "story", label: "Story", icon: <BookOpen size={12} /> },
						{
							key: "comments",
							label: `Comments (${story.editorial_comments?.length || 0})`,
							icon: <MessageSquare size={12} />,
						},
						{
							key: "versions",
							label: `History (${story.versions?.length || 0})`,
							icon: <History size={12} />,
						},
					].map((t) => (
						<button
							key={t.key}
							onClick={() => setActiveTab(t.key as any)}
							className={clsx(
								"flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-all",
								activeTab === t.key
									? "border-Swahilipot-500 text-Swahilipot-400"
									: "border-transparent text-slate-500 hover:text-white",
							)}>
							{t.icon} {t.label}
						</button>
					))}
				</div>

				<div className="modal-body flex-1 overflow-y-auto space-y-4">
					{/* Story tab */}
					{activeTab === "story" && (
						<>
							{/* Story header card */}
							<div className="card bg-surface/60 space-y-2">
								<div className="flex items-start gap-3">
									<div className="flex-1">
										<div className="flex items-center gap-2 mb-1 flex-wrap">
											<span className={clsx("badge text-[9px]", meta.badge)}>
												{meta.label}
											</span>
											{story.is_breaking && (
												<span className="text-red-400 text-[9px] font-bold flex items-center gap-1 animate-pulse">
													<Zap size={9} /> BREAKING
												</span>
											)}
											{story.category_name && (
												<span
													className="text-[9px]"
													style={{ color: story.category_colour || "#94a3b8" }}>
													{story.category_name}
												</span>
											)}
										</div>
										<h4 className="font-bold text-white text-base leading-snug">
											{story.title}
										</h4>
										{story.subtitle && (
											<p className="text-sm text-slate-400 mt-0.5">
												{story.subtitle}
											</p>
										)}
										<div className="flex items-center gap-3 text-[10px] text-slate-500 mt-2 flex-wrap">
											<span>
												By{" "}
												<span className="text-slate-300">
													{story.author_name}
												</span>
											</span>
											<span>
												{story.word_count} words · {story.read_time_minutes} min
												read
											</span>
											<span>
												Submitted{" "}
												{formatDistanceToNow(new Date(story.updated_at), {
													addSuffix: true,
												})}
											</span>
											{story.submission_deadline && (
												<span className="text-amber-400">
													Deadline:{" "}
													{format(
														new Date(story.submission_deadline),
														"dd MMM HH:mm",
													)}
												</span>
											)}
										</div>
									</div>
									{story.featured_image && (
										<img
											src={story.featured_image}
											className="w-24 h-16 rounded-lg object-cover flex-shrink-0"
											alt=""
										/>
									)}
								</div>

								{story.summary && (
									<div className="border-t border-surface-border/50 pt-3">
										<p className="text-xs text-slate-400 italic">
											{story.summary}
										</p>
									</div>
								)}
							</div>

							{/* Body */}
							<div className="card bg-surface/60">
								<p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
									{story.body}
								</p>
							</div>

							{/* Sources */}
							{story.sources?.length > 0 && (
								<div className="card bg-surface/60">
									<h5 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1">
										<Link size={11} /> Sources
									</h5>
									<ul className="space-y-1">
										{story.sources.map((s, i) => (
											<li key={i} className="text-xs text-slate-400">
												{s}
											</li>
										))}
									</ul>
								</div>
							)}

							{/* Tags */}
							{story.tags?.length > 0 && (
								<div className="flex gap-1.5 flex-wrap">
									{story.tags.map((t) => (
										<span
											key={t}
											className="text-xs bg-surface-hover text-slate-400 px-2 py-0.5 rounded-full">
											#{t}
										</span>
									))}
								</div>
							)}

							{/* Prior rejection / changes note */}
							{story.rejection_reason && (
								<div className="card border-red-500/30 bg-red-500/10">
									<p className="text-xs font-semibold text-red-400 mb-1">
										Previous Rejection Reason
									</p>
									<p className="text-xs text-slate-400">
										{story.rejection_reason}
									</p>
								</div>
							)}
							{story.changes_requested_note && (
								<div className="card border-amber-500/30 bg-amber-500/10">
									<p className="text-xs font-semibold text-amber-400 mb-1">
										Changes Requested
									</p>
									<p className="text-xs text-slate-400">
										{story.changes_requested_note}
									</p>
								</div>
							)}

							{/* Editorial comment */}
							<div className="input-group">
								<label className="input-label">
									Editorial Comment (optional)
								</label>
								<textarea
									value={comment}
									onChange={(e) => setComment(e.target.value)}
									className="textarea h-20 text-sm"
									placeholder="Add notes for the journalist — visible to them on any action…"
								/>
							</div>
						</>
					)}

					{/* Comments tab */}
					{activeTab === "comments" && (
						<div className="space-y-3">
							{story.editorial_comments?.length === 0 ? (
								<div className="text-center py-8 text-slate-500 text-sm">
									No comments yet
								</div>
							) : (
								story.editorial_comments?.map((c) => (
									<div
										key={c.id}
										className={clsx(
											"card p-3",
											c.is_resolved
												? "opacity-50 bg-surface/40"
												: "bg-surface/60",
										)}>
										<div className="flex items-start justify-between gap-2">
											<div className="flex-1">
												<div className="flex items-center gap-2 mb-1">
													<span className="text-xs font-semibold text-white">
														{c.author_name}
													</span>
													<span className="text-[9px] text-slate-500 capitalize">
														{c.author_role?.replace(/_/g, " ")}
													</span>
													{c.action && (
														<span
															className={clsx(
																"badge text-[8px]",
																STATUS_META[c.action as StoryStatus]?.badge ||
																	"badge-slate",
															)}>
															{c.action.replace(/_/g, " ")}
														</span>
													)}
												</div>
												<p className="text-sm text-slate-300">{c.comment}</p>
												<p className="text-[9px] text-slate-600 mt-1">
													{formatDistanceToNow(new Date(c.created_at), {
														addSuffix: true,
													})}
												</p>
											</div>
											{!c.is_resolved && (
												<button
													onClick={() => resolveCommentMutation.mutate(c.id)}
													disabled={resolveCommentMutation.isPending}
													className="btn-ghost btn-sm text-[9px] flex items-center gap-1 text-green-400 hover:text-green-300 flex-shrink-0">
													<Check size={10} /> Resolve
												</button>
											)}
										</div>
									</div>
								))
							)}
							{/* Add comment */}
							<div className="flex gap-2">
								<input
									value={comment}
									onChange={(e) => setComment(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && !e.shiftKey) {
											e.preventDefault();
											if (comment.trim()) addCommentMutation.mutate(comment);
										}
									}}
									className="input flex-1 text-sm"
									placeholder="Add a comment (Enter to send)…"
								/>
								<button
									onClick={() => {
										if (comment.trim()) addCommentMutation.mutate(comment);
									}}
									disabled={addCommentMutation.isPending || !comment.trim()}
									className="btn-primary btn-sm">
									<Send size={13} />
								</button>
							</div>
						</div>
					)}

					{/* Version History tab */}
					{activeTab === "versions" && (
						<div className="space-y-3">
							{story.versions?.length === 0 ? (
								<div className="text-center py-8 text-slate-500 text-sm">
									No version history yet
								</div>
							) : (
								story.versions?.map((v) => (
									<div key={v.id} className="card bg-surface/60 p-3">
										<div className="flex items-start justify-between gap-2 mb-2">
											<div>
												<span className="text-xs font-bold text-white">
													v{v.version_number}
												</span>
												<span className="text-[10px] text-slate-500 ml-2">
													{v.edited_by_name}
												</span>
												<span className="text-[10px] text-slate-600 ml-2">
													{formatDistanceToNow(new Date(v.created_at), {
														addSuffix: true,
													})}
												</span>
											</div>
											{v.change_summary && (
												<span className="text-[9px] text-slate-400 italic">
													{v.change_summary}
												</span>
											)}
										</div>
										<p className="text-xs font-semibold text-slate-300">
											{v.title}
										</p>
										<p className="text-xs text-slate-500 line-clamp-3 mt-1">
											{v.body}
										</p>
									</div>
								))
							)}
						</div>
					)}
				</div>

				{/* Action footer */}
				<div className="modal-footer flex-shrink-0 flex-wrap gap-2">
					<button onClick={onClose} className="btn-secondary">
						Close
					</button>
					<div className="flex-1" />
					<button
						disabled={isPending}
						onClick={() => onAction("under_review", comment)}
						className="btn-ghost btn-sm text-xs border border-surface-border">
						<Eye size={13} /> Mark Under Review
					</button>
					<button
						disabled={isPending}
						onClick={() => onAction("request_changes", comment)}
						className="btn btn-lg bg-amber-600 text-white hover:bg-amber-700 text-sm">
						<RotateCcw size={14} /> Request Changes
					</button>
					<button
						disabled={isPending}
						onClick={() => onAction("reject", comment)}
						className="btn-danger text-sm">
						<XCircle size={14} /> Reject
					</button>
					<button
						disabled={isPending}
						onClick={() => onAction("approve", comment)}
						className="btn-success text-sm">
						<CheckCircle size={14} /> Approve
					</button>
					<button
						disabled={isPending}
						onClick={() => onAction("publish", comment)}
						className="btn-primary text-sm">
						<Zap size={14} /> Publish Now
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── Story Detail Drawer ──────────────────────────────────────────────────────

function StoryDetailDrawer({
	story,
	isEditor,
	onClose,
	onEdit,
	onDelete,
	onReview,
}: {
	story: Story;
	isEditor: boolean;
	onClose: () => void;
	onEdit: () => void;
	onDelete: () => void;
	onReview: () => void;
}) {
	const meta = STATUS_META[story.status] || STATUS_META.draft;

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div
				className="fixed right-0 top-0 h-full w-full max-w-xl bg-surface-card border-l border-surface-border flex flex-col shadow-2xl animate-slide-in-right"
				onClick={(e) => e.stopPropagation()}>
				{/* Header */}
				<div className="flex items-center gap-3 p-5 border-b border-surface-border flex-shrink-0">
					<button onClick={onClose} className="btn-ghost p-1 text-slate-400">
						<ChevronRight size={18} />
					</button>
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 flex-wrap">
							<span className={clsx("badge text-[9px]", meta.badge)}>
								{meta.label}
							</span>
							{story.is_breaking && (
								<span className="text-red-400 text-[9px] font-bold animate-pulse flex items-center gap-1">
									<Zap size={9} /> BREAKING
								</span>
							)}
							{story.is_featured && (
								<span className="text-amber-400 text-[9px] flex items-center gap-1">
									<Star size={9} /> Featured
								</span>
							)}
						</div>
					</div>
					<div className="flex items-center gap-2">
						<button onClick={onEdit} className="btn-ghost btn-sm">
							<Edit3 size={14} />
						</button>
						<button
							onClick={onDelete}
							className="btn-ghost btn-sm text-red-400 hover:text-red-300">
							<Trash2 size={14} />
						</button>
						{isEditor && story.status === "submitted" && (
							<button onClick={onReview} className="btn-primary btn-sm text-xs">
								Review
							</button>
						)}
					</div>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-y-auto p-5 space-y-5">
					{story.featured_image && (
						<img
							src={story.featured_image}
							className="w-full h-40 object-cover rounded-xl"
							alt={story.title}
						/>
					)}

					<div>
						<h2 className="text-xl font-bold text-white leading-snug">
							{story.title}
						</h2>
						{story.subtitle && (
							<p className="text-slate-400 mt-1">{story.subtitle}</p>
						)}
					</div>

					{/* Meta grid */}
					<div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
						{[
							{ label: "Author", value: story.author_name },
							{ label: "Editor", value: story.editor_name || "—" },
							{ label: "Category", value: story.category_name || "—" },
							{
								label: "Priority",
								value: PRIORITY_META[story.priority]?.label || "—",
							},
							{
								label: "Words",
								value: `${story.word_count} (${story.read_time_minutes} min)`,
							},
							{ label: "Views", value: story.view_count.toLocaleString() },
							{
								label: "Created",
								value: format(new Date(story.created_at), "dd MMM yyyy"),
							},
							{
								label: "Updated",
								value: formatDistanceToNow(new Date(story.updated_at), {
									addSuffix: true,
								}),
							},
							...(story.published_at
								? [
										{
											label: "Published",
											value: format(
												new Date(story.published_at),
												"dd MMM yyyy HH:mm",
											),
										},
									]
								: []),
							...(story.scheduled_publish_at
								? [
										{
											label: "Scheduled",
											value: format(
												new Date(story.scheduled_publish_at),
												"dd MMM yyyy HH:mm",
											),
										},
									]
								: []),
							...(story.submission_deadline
								? [
										{
											label: "Deadline",
											value: format(
												new Date(story.submission_deadline),
												"dd MMM HH:mm",
											),
										},
									]
								: []),
						].map(({ label, value }) => (
							<div key={label}>
								<span className="text-slate-500">{label}: </span>
								<span className="text-slate-300">{value}</span>
							</div>
						))}
					</div>

					{/* Tags */}
					{story.tags?.length > 0 && (
						<div>
							<p className="text-xs text-slate-500 mb-1.5">Tags</p>
							<div className="flex gap-1.5 flex-wrap">
								{story.tags.map((t) => (
									<span
										key={t}
										className="text-xs bg-surface-hover text-slate-400 px-2 py-0.5 rounded-full">
										#{t}
									</span>
								))}
							</div>
						</div>
					)}

					{/* Summary */}
					{story.summary && (
						<div>
							<p className="text-xs text-slate-500 mb-1">Broadcast Tease</p>
							<p className="text-sm text-slate-400 italic">{story.summary}</p>
						</div>
					)}

					{/* Body preview */}
					<div>
						<p className="text-xs text-slate-500 mb-1">Story Body</p>
						<p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
							{story.body}
						</p>
					</div>

					{/* Sources */}
					{story.sources?.length > 0 && (
						<div>
							<p className="text-xs text-slate-500 mb-1.5">Sources</p>
							<ul className="space-y-1">
								{story.sources.map((s, i) => (
									<li
										key={i}
										className="text-xs text-slate-400 flex items-center gap-1.5">
										<Link size={9} className="flex-shrink-0 text-slate-600" />
										{s}
									</li>
								))}
							</ul>
						</div>
					)}

					{/* SEO */}
					{(story.seo_title || story.seo_description) && (
						<div className="card bg-surface/60 p-3">
							<p className="text-xs font-semibold text-slate-400 mb-2">SEO</p>
							{story.seo_title && (
								<p className="text-xs text-slate-300 font-medium">
									{story.seo_title}
								</p>
							)}
							{story.seo_description && (
								<p className="text-xs text-slate-500 mt-1">
									{story.seo_description}
								</p>
							)}
						</div>
					)}

					{/* Editorial comments */}
					{story.editorial_comments?.length > 0 && (
						<div>
							<p className="text-xs text-slate-500 mb-2">
								Editorial Comments ({story.unresolved_comment_count} open)
							</p>
							<div className="space-y-2">
								{story.editorial_comments.map((c) => (
									<div
										key={c.id}
										className={clsx(
											"card p-2.5 text-xs",
											c.is_resolved && "opacity-40",
										)}>
										<div className="flex items-center gap-2 mb-1">
											<span className="font-semibold text-white">
												{c.author_name}
											</span>
											{c.action && (
												<span
													className={clsx(
														"badge text-[8px]",
														STATUS_META[c.action as StoryStatus]?.badge ||
															"badge-slate",
													)}>
													{c.action.replace(/_/g, " ")}
												</span>
											)}
											{c.is_resolved && (
												<span className="text-green-400 text-[9px]">
													✓ Resolved
												</span>
											)}
										</div>
										<p className="text-slate-300">{c.comment}</p>
										<p className="text-[9px] text-slate-600 mt-1">
											{formatDistanceToNow(new Date(c.created_at), {
												addSuffix: true,
											})}
										</p>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
