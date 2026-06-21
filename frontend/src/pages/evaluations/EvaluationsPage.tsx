// Nexus — Evaluations Page
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
	Star,
	Plus,
	ChevronRight,
	Award,
	TrendingUp,
	User,
	Settings,
} from "lucide-react";
import { evaluationsApi } from "../../services/api";
import { useAuthStore } from "../../services/api";
import toast from "react-hot-toast";
import clsx from "clsx";
import NewEvaluationModal from "./NewEvaluationModal";
import EvaluationTemplatesModal from "./Evaluationtemplatesmodal";

const TYPE_BADGES: Record<string, string> = {
	weekly: "badge-blue",
	monthly: "badge-purple",
	final: "badge-green",
	mid_term: "badge-amber",
};

export default function EvaluationsPage() {
	const { user } = useAuthStore();
	const qc = useQueryClient();
	const isEvaluator = [
		"supervisor",
		"department_leader",
		"hr_officer",
		"system_admin",
		"broadcast_admin",
	].includes(user?.role || "");
	const [selectedEval, setSelectedEval] = useState<any>(null);
	const [showDetailModal, setShowDetailModal] = useState(false);
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [showTemplatesModal, setShowTemplatesModal] = useState(false);

	const { data: evaluationsData, isLoading } = useQuery({
		queryKey: ["evaluations"],
		queryFn: () => evaluationsApi.list().then((r) => r.data),
		refetchInterval: 120000,
	});

	const evaluations = Array.isArray(evaluationsData)
		? evaluationsData
		: Array.isArray(evaluationsData?.results)
			? evaluationsData.results
			: [];

	const latest = evaluations[0];
	const average =
		evaluations.length > 0
			? (
					evaluations.reduce(
						(s: number, e: any) => s + parseFloat(e.percentage || 0),
						0,
					) / evaluations.length
				).toFixed(1)
			: null;

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<Star size={22} className="text-Nexus-400" /> Performance
						Evaluations
					</h1>
					<p className="page-subtitle">
						Weekly, monthly, and final attachment evaluations with scored
						criteria
					</p>
				</div>
				{isEvaluator && (
					<div className="flex items-center gap-2">
						<button
							onClick={() => setShowTemplatesModal(true)}
							className="btn-secondary">
							<Settings size={15} /> Manage Templates
						</button>
						<button
							onClick={() => setShowCreateModal(true)}
							className="btn-primary">
							<Plus size={15} /> New Evaluation
						</button>
					</div>
				)}
			</div>

			{/* Summary cards */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
				<div className="stat-card">
					<Star size={18} className="text-yellow-400" />
					<div className="stat-value text-yellow-400">
						{average ? `${average}%` : "—"}
					</div>
					<div className="stat-label">Average Score</div>
				</div>
				<div className="stat-card">
					<Award size={18} className="text-green-400" />
					<div className="stat-value">
						{evaluations.filter((e: any) => e.status === "completed").length}
					</div>
					<div className="stat-label">Completed</div>
				</div>
				<div className="stat-card">
					<TrendingUp size={18} className="text-blue-400" />
					<div className="stat-value">
						{evaluations.filter((e: any) => e.status === "pending").length}
					</div>
					<div className="stat-label">Pending</div>
				</div>
				<div className="stat-card">
					<User size={18} className="text-Nexus-400" />
					<div className="stat-value">{evaluations.length}</div>
					<div className="stat-label">Total</div>
				</div>
			</div>

			{/* Latest score bar */}
			{latest?.percentage && (
				<div className="card">
					<div className="flex items-center justify-between mb-3">
						<div>
							<div className="text-sm font-semibold text-white">
								Latest: {latest.template?.name || "Evaluation"}
							</div>
							<div className="text-xs text-slate-400">
								{latest.period_start &&
									format(parseISO(latest.period_start), "dd MMM")}{" "}
								—{" "}
								{latest.period_end &&
									format(parseISO(latest.period_end), "dd MMM yyyy")}
							</div>
						</div>
						<div
							className={clsx("text-3xl font-display font-bold", {
								"text-green-400": parseFloat(latest.percentage) >= 75,
								"text-amber-400":
									parseFloat(latest.percentage) >= 50 &&
									parseFloat(latest.percentage) < 75,
								"text-red-400": parseFloat(latest.percentage) < 50,
							})}>
							{latest.percentage}%
						</div>
					</div>
					<div className="h-2 bg-surface-elevated rounded-full overflow-hidden">
						<div
							className={clsx(
								"h-full rounded-full transition-all duration-1000",
								{
									"bg-green-500": parseFloat(latest.percentage) >= 75,
									"bg-amber-500":
										parseFloat(latest.percentage) >= 50 &&
										parseFloat(latest.percentage) < 75,
									"bg-red-500": parseFloat(latest.percentage) < 50,
								},
							)}
							style={{ width: `${latest.percentage}%` }}
						/>
					</div>
					{latest.overall_feedback && (
						<p className="text-xs text-slate-400 mt-3 italic">
							"{latest.overall_feedback}"
						</p>
					)}
				</div>
			)}

			{/* Evaluations list */}
			<div className="space-y-3">
				{isLoading ? (
					[...Array(4)].map((_, i) => (
						<div key={i} className="skeleton h-24 rounded-xl" />
					))
				) : evaluations.length === 0 ? (
					<div className="card text-center py-12">
						<Star
							size={32}
							className="mx-auto text-slate-500 mb-3 opacity-30"
						/>
						<p className="text-slate-400">No evaluations yet</p>
					</div>
				) : (
					evaluations.map((ev: any) => (
						<div
							key={ev.id}
							className="card-hover"
							onClick={() => {
								setSelectedEval(ev);
								setShowDetailModal(true);
							}}>
							<div className="flex items-center gap-4">
								<div className="w-12 h-12 rounded-xl bg-Nexus-600/20 flex items-center justify-center shrink-0">
									<span
										className={clsx("text-sm font-bold", {
											"text-green-400": parseFloat(ev.percentage) >= 75,
											"text-amber-400":
												parseFloat(ev.percentage) >= 50 &&
												parseFloat(ev.percentage) < 75,
											"text-red-400": parseFloat(ev.percentage) < 50,
											"text-slate-400": !ev.percentage,
										})}>
										{ev.percentage ? `${ev.percentage}%` : "—"}
									</span>
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 flex-wrap">
										<span className="font-medium text-white text-sm">
											{ev.template?.name ||
												ev.evaluation_type ||
												ev.template?.evaluation_type ||
												"Evaluation"}
										</span>
										<span
											className={clsx(
												"badge text-[10px]",
												TYPE_BADGES[
													ev.evaluation_type ?? ev.template?.evaluation_type
												] || "badge-slate",
											)}>
											{ev.evaluation_type ?? ev.template?.evaluation_type}
										</span>
										<span
											className={clsx("badge text-[10px]", {
												"badge-amber": ev.status === "pending",
												"badge-blue": ev.status === "in_progress",
												"badge-green": ev.status === "completed",
											})}>
											{ev.status}
										</span>
									</div>
									<div className="text-xs text-slate-500 mt-0.5">
										{ev.period_start &&
											format(parseISO(ev.period_start), "dd MMM")}{" "}
										—{" "}
										{ev.period_end &&
											format(parseISO(ev.period_end), "dd MMM yyyy")}
										{ev.evaluator_name && ` · By ${ev.evaluator_name}`}
									</div>
									{ev.strengths && (
										<p className="text-xs text-slate-400 mt-1 line-clamp-1">
											✓ {ev.strengths}
										</p>
									)}
								</div>
								<ChevronRight size={15} className="text-slate-600 shrink-0" />
							</div>
						</div>
					))
				)}
			</div>

			{/* Detail modal */}
			{showDetailModal && selectedEval && (
				<EvaluationDetailModal
					evaluation={selectedEval}
					onClose={() => {
						setShowDetailModal(false);
						setSelectedEval(null);
					}}
				/>
			)}

			{/* Create modal */}
			{showCreateModal && (
				<NewEvaluationModal
					onClose={() => setShowCreateModal(false)}
					onSuccess={() => qc.invalidateQueries({ queryKey: ["evaluations"] })}
				/>
			)}

			{/* Templates modal */}
			{showTemplatesModal && (
				<EvaluationTemplatesModal
					onClose={() => setShowTemplatesModal(false)}
				/>
			)}
		</div>
	);
}

function EvaluationDetailModal({ evaluation: ev, onClose }: any) {
	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box max-w-2xl" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<div>
						<h3 className="font-semibold text-white">
							{ev.template?.name || "Evaluation"}
						</h3>
						<p className="text-xs text-slate-400 mt-0.5">
							{ev.period_start && format(parseISO(ev.period_start), "dd MMM")} —{" "}
							{ev.period_end && format(parseISO(ev.period_end), "dd MMM yyyy")}
							{ev.evaluator_name && ` · Evaluated by ${ev.evaluator_name}`}
						</p>
					</div>
					{ev.percentage && (
						<div
							className={clsx("text-3xl font-display font-bold", {
								"text-green-400": parseFloat(ev.percentage) >= 75,
								"text-amber-400": parseFloat(ev.percentage) >= 50,
								"text-red-400": parseFloat(ev.percentage) < 50,
							})}>
							{ev.percentage}%
						</div>
					)}
				</div>
				<div className="modal-body space-y-4">
					{ev.overall_feedback && (
						<div className="bg-surface rounded-xl p-4">
							<div className="text-xs text-slate-400 uppercase tracking-wide mb-1">
								Overall Feedback
							</div>
							<p className="text-sm text-slate-200">{ev.overall_feedback}</p>
						</div>
					)}
					{ev.strengths && (
						<div className="bg-green-900/20 rounded-xl p-4 border border-green-500/20">
							<div className="text-xs text-green-400 uppercase tracking-wide mb-1">
								Strengths
							</div>
							<p className="text-sm text-slate-200">{ev.strengths}</p>
						</div>
					)}
					{ev.areas_for_improvement && (
						<div className="bg-amber-900/20 rounded-xl p-4 border border-amber-500/20">
							<div className="text-xs text-amber-400 uppercase tracking-wide mb-1">
								Areas for Improvement
							</div>
							<p className="text-sm text-slate-200">
								{ev.areas_for_improvement}
							</p>
						</div>
					)}
					{ev.recommendation && (
						<div className="card bg-surface/60">
							<div className="text-xs text-Nexus-400 uppercase tracking-wide mb-1">
								Recommendation
							</div>
							<p className="text-sm text-white font-medium">
								{ev.recommendation}
							</p>
						</div>
					)}
					{ev.scores && Object.keys(ev.scores).length > 0 && (
						<div>
							<div className="text-xs text-slate-400 uppercase tracking-wide mb-3">
								Criteria Scores
							</div>
							<div className="space-y-2">
								{Object.entries(ev.scores).map(([criterion, score]: any) => (
									<div key={criterion} className="flex items-center gap-3">
										<div className="flex-1 text-sm text-slate-300">
											{criterion}
										</div>
										<div className="text-sm font-medium text-white">
											{score}
										</div>
										<div className="w-24 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
											<div
												className="h-full bg-Nexus-500 rounded-full"
												style={{ width: `${Math.min(100, score)}%` }}
											/>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
				<div className="modal-footer">
					<button onClick={onClose} className="btn-secondary">
						Close
					</button>
				</div>
			</div>
		</div>
	);
}
