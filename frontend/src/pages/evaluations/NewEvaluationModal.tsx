// NewEvaluationModal.tsx
// Drop-in modal for creating a new evaluation from EvaluationsPage.
// Usage:
//   <NewEvaluationModal onClose={() => setShowModal(false)} onSuccess={() => qc.invalidateQueries(["evaluations"])} />

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { evaluationsApi, usersApi } from "../../services/api";
import toast from "react-hot-toast";
import clsx from "clsx";
import { Plus, Minus } from "lucide-react";

interface Props {
	onClose: () => void;
	onSuccess: () => void;
}

export default function NewEvaluationModal({ onClose, onSuccess }: Props) {
	// ── Step state ──────────────────────────────────────────────────────────
	const [step, setStep] = useState<1 | 2>(1);

	// ── Step 1 fields ────────────────────────────────────────────────────────
	const [templateId, setTemplateId] = useState("");
	const [evaluateeId, setEvaluateeId] = useState("");
	const [periodStart, setPeriodStart] = useState("");
	const [periodEnd, setPeriodEnd] = useState("");

	// ── Step 2 fields ────────────────────────────────────────────────────────
	const [scores, setScores] = useState<Record<string, number>>({});
	const [overallFeedback, setOverallFeedback] = useState("");
	const [strengths, setStrengths] = useState("");
	const [areasForImprovement, setAreasForImprovement] = useState("");
	const [recommendation, setRecommendation] = useState("");

	// ── Fetch templates & users ──────────────────────────────────────────────
	const { data: templatesData, isLoading: templatesLoading } = useQuery({
		queryKey: ["evaluation-templates"],
		queryFn: () => evaluationsApi.templates().then((r) => r.data),
	});
	const templates: any[] = Array.isArray(templatesData)
		? templatesData
		: Array.isArray(templatesData?.results)
			? templatesData.results
			: [];

	const { data: usersData } = useQuery({
		queryKey: ["users-list"],
		queryFn: () => usersApi.list({ role: "attachee" }).then((r) => r.data),
	});
	const users: any[] = Array.isArray(usersData)
		? usersData
		: Array.isArray(usersData?.results)
			? usersData.results
			: [];

	const selectedTemplate = templates.find((t) => t.id === templateId);
	const criteria: any[] = selectedTemplate?.criteria ?? [];

	// ── Mutations ────────────────────────────────────────────────────────────
	const createMutation = useMutation({
		mutationFn: (data: any) => evaluationsApi.create(data),
		onSuccess: (res) => {
			// If scores were filled in, immediately submit to compute percentage
			if (Object.keys(scores).length > 0) {
				submitMutation.mutate({ id: res.data.id });
			} else {
				toast.success("Evaluation created successfully.");
				onSuccess();
				onClose();
			}
		},
		onError: () => toast.error("Failed to create evaluation."),
	});

	const submitMutation = useMutation({
		mutationFn: ({ id }: { id: string }) =>
			evaluationsApi.submit(id, {
				scores,
				overall_feedback: overallFeedback,
				strengths,
				areas_for_improvement: areasForImprovement,
				recommendation,
			}),
		onSuccess: () => {
			toast.success("Evaluation submitted successfully.");
			onSuccess();
			onClose();
		},
		onError: () => toast.error("Failed to submit evaluation."),
	});

	const isLoading = createMutation.isPending || submitMutation.isPending;

	// ── Handlers ─────────────────────────────────────────────────────────────
	function handleNextStep(e: React.FormEvent) {
		e.preventDefault();
		if (!templateId || !evaluateeId || !periodStart || !periodEnd) {
			toast.error("Please fill in all required fields.");
			return;
		}
		// Pre-populate score keys from criteria
		const initial: Record<string, number> = {};
		criteria.forEach((c: any) => {
			initial[c.criterion] = scores[c.criterion] ?? 0;
		});
		setScores(initial);
		setStep(2);
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		createMutation.mutate({
			template: templateId,
			attachee: evaluateeId,
			period_start: periodStart,
			period_end: periodEnd,
			scores,
			overall_feedback: overallFeedback,
			strengths,
			areas_for_improvement: areasForImprovement,
			recommendation,
		});
	}

	function setScore(name: string, value: number) {
		setScores((prev) => ({ ...prev, [name]: value }));
	}

	// ── Render ────────────────────────────────────────────────────────────────
	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box max-w-xl" onClick={(e) => e.stopPropagation()}>
				{/* Header */}
				<div className="modal-header">
					<div>
						<h3 className="font-semibold text-white">New Evaluation</h3>
						<p className="text-xs text-slate-400 mt-0.5">
							{step === 1
								? "Step 1 of 2 — Details"
								: "Step 2 of 2 — Scores & Feedback"}
						</p>
					</div>
					{/* Step indicator */}
					<div className="flex items-center gap-1.5">
						{[1, 2].map((s) => (
							<div
								key={s}
								className={clsx("w-2 h-2 rounded-full transition-colors", {
									"bg-Nexus-400": step === s,
									"bg-slate-600": step !== s,
								})}
							/>
						))}
					</div>
				</div>

				{/* Body */}
				<div className="modal-body">
					{step === 1 ? (
						<form
							id="eval-step1"
							onSubmit={handleNextStep}
							className="space-y-4">
							{/* Template */}
							<div>
								<label className="form-label">Evaluation Template *</label>
								<select
									className="form-input"
									value={templateId}
									onChange={(e) => setTemplateId(e.target.value)}
									required
									disabled={templatesLoading}>
									{templatesLoading ? (
										<option value="">Loading templates…</option>
									) : templates.length === 0 ? (
										<option value="">
											No templates found — create one first
										</option>
									) : (
										<>
											<option value="">Select a template…</option>
											{templates.map((t) => (
												<option key={t.id} value={t.id}>
													{t.name} ({t.evaluation_type})
												</option>
											))}
										</>
									)}
								</select>
								{!templatesLoading && templates.length === 0 && (
									<p className="text-xs text-amber-400 mt-1">
										No evaluation templates exist yet. Ask an admin to create
										one under Settings → Evaluation Templates.
									</p>
								)}
							</div>

							{/* Evaluatee */}
							<div>
								<label className="form-label">Evaluatee *</label>
								<select
									className="form-input"
									value={evaluateeId}
									onChange={(e) => setEvaluateeId(e.target.value)}
									required>
									<option value="">Select a person…</option>
									{users.map((u) => (
										<option key={u.id} value={u.id}>
											{u.full_name || `${u.first_name} ${u.last_name}`} —{" "}
											{u.role_display || u.role}
										</option>
									))}
								</select>
							</div>

							{/* Period */}
							<div className="grid grid-cols-2 gap-3">
								<div>
									<label className="form-label">Period Start *</label>
									<input
										type="date"
										className="form-input"
										value={periodStart}
										onChange={(e) => setPeriodStart(e.target.value)}
										required
									/>
								</div>
								<div>
									<label className="form-label">Period End *</label>
									<input
										type="date"
										className="form-input"
										value={periodEnd}
										min={periodStart}
										onChange={(e) => setPeriodEnd(e.target.value)}
										required
									/>
								</div>
							</div>
						</form>
					) : (
						<form id="eval-step2" onSubmit={handleSubmit} className="space-y-5">
							{/* Criteria scores */}
							{criteria.length > 0 && (
								<div>
									<p className="text-xs text-slate-400 uppercase tracking-wide mb-3">
										Criteria Scores
									</p>
									<div className="space-y-3">
										{criteria.map((c: any) => (
											<div
												key={c.criterion}
												className="flex items-center gap-3">
												<div className="flex-1 text-sm text-slate-300 min-w-0 truncate">
													{c.criterion}
													<span className="text-slate-500 ml-1">
														/ {c.max_score ?? 10}
													</span>
												</div>
												<div className="flex items-center gap-2">
													<button
														type="button"
														className="w-6 h-6 rounded bg-surface-elevated flex items-center justify-center text-slate-400 hover:text-white"
														onClick={() =>
															setScore(
																c.criterion,
																Math.max(0, (scores[c.criterion] ?? 0) - 1),
															)
														}>
														<Minus size={12} />
													</button>
													<input
														type="number"
														className="w-14 form-input text-center px-1 py-1 text-sm"
														min={0}
														max={c.max_score ?? 10}
														value={scores[c.criterion] ?? 0}
														onChange={(e) =>
															setScore(
																c.criterion,
																Math.min(
																	c.max_score ?? 10,
																	Math.max(0, Number(e.target.value)),
																),
															)
														}
													/>
													<button
														type="button"
														className="w-6 h-6 rounded bg-surface-elevated flex items-center justify-center text-slate-400 hover:text-white"
														onClick={() =>
															setScore(
																c.criterion,
																Math.min(
																	c.max_score ?? 10,
																	(scores[c.criterion] ?? 0) + 1,
																),
															)
														}>
														<Plus size={12} />
													</button>
												</div>
											</div>
										))}
									</div>
								</div>
							)}

							{/* Text fields */}
							<div>
								<label className="form-label">Overall Feedback</label>
								<textarea
									className="form-input min-h-[72px] resize-none"
									placeholder="General comments about this evaluation period…"
									value={overallFeedback}
									onChange={(e) => setOverallFeedback(e.target.value)}
								/>
							</div>
							<div className="grid grid-cols-2 gap-3">
								<div>
									<label className="form-label">Strengths</label>
									<textarea
										className="form-input min-h-[64px] resize-none"
										placeholder="Key strengths observed…"
										value={strengths}
										onChange={(e) => setStrengths(e.target.value)}
									/>
								</div>
								<div>
									<label className="form-label">Areas for Improvement</label>
									<textarea
										className="form-input min-h-[64px] resize-none"
										placeholder="Growth opportunities…"
										value={areasForImprovement}
										onChange={(e) => setAreasForImprovement(e.target.value)}
									/>
								</div>
							</div>
							<div>
								<label className="form-label">Recommendation</label>
								<input
									type="text"
									className="form-input"
									placeholder="e.g. Continue to next phase, Extend probation…"
									value={recommendation}
									onChange={(e) => setRecommendation(e.target.value)}
								/>
							</div>
						</form>
					)}
				</div>

				{/* Footer */}
				<div className="modal-footer">
					{step === 2 && (
						<button
							type="button"
							className="btn-secondary"
							onClick={() => setStep(1)}
							disabled={isLoading}>
							Back
						</button>
					)}
					<button
						type="button"
						className="btn-secondary"
						onClick={onClose}
						disabled={isLoading}>
						Cancel
					</button>
					{step === 1 ? (
						<button type="submit" form="eval-step1" className="btn-primary">
							Next →
						</button>
					) : (
						<button
							type="submit"
							form="eval-step2"
							className="btn-primary"
							disabled={isLoading}>
							{isLoading ? "Saving…" : "Submit Evaluation"}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
