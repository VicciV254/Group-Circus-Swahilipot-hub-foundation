// EvaluationTemplatesModal.tsx
// Lets evaluators view existing templates and create new ones, so the
// "New Evaluation" flow is never blocked by an empty template list.
//
// Usage (e.g. from EvaluationsPage, next to "New Evaluation"):
//   <button onClick={() => setShowTemplatesModal(true)}>Manage Templates</button>
//   {showTemplatesModal && (
//     <EvaluationTemplatesModal onClose={() => setShowTemplatesModal(false)} />
//   )}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { evaluationsApi } from "../../services/api";
import toast from "react-hot-toast";
import clsx from "clsx";
import { Plus, Minus, Trash2, X } from "lucide-react";

interface Props {
	onClose: () => void;
}

const EVAL_TYPES = [
	{ value: "weekly", label: "Weekly" },
	{ value: "monthly", label: "Monthly" },
	{ value: "mid_term", label: "Mid-Term" },
	{ value: "final", label: "Final" },
];

interface CriterionRow {
	criterion: string;
	max_score: number;
	weight: number;
}

const EMPTY_ROW: CriterionRow = { criterion: "", max_score: 10, weight: 1 };

export default function EvaluationTemplatesModal({ onClose }: Props) {
	const qc = useQueryClient();
	const [view, setView] = useState<"list" | "create">("list");

	const { data, isLoading } = useQuery({
		queryKey: ["evaluation-templates"],
		queryFn: () => evaluationsApi.templates().then((r) => r.data),
	});
	const templates: any[] = Array.isArray(data)
		? data
		: Array.isArray(data?.results)
			? data.results
			: [];

	// ── Create form state ───────────────────────────────────────────────────
	const [name, setName] = useState("");
	const [evaluationType, setEvaluationType] = useState("weekly");
	const [rows, setRows] = useState<CriterionRow[]>([{ ...EMPTY_ROW }]);

	function resetForm() {
		setName("");
		setEvaluationType("weekly");
		setRows([{ ...EMPTY_ROW }]);
	}

	function updateRow(i: number, patch: Partial<CriterionRow>) {
		setRows((prev) =>
			prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
		);
	}

	function addRow() {
		setRows((prev) => [...prev, { ...EMPTY_ROW }]);
	}

	function removeRow(i: number) {
		setRows((prev) => prev.filter((_, idx) => idx !== i));
	}

	const createMutation = useMutation({
		mutationFn: (payload: any) => evaluationsApi.createTemplate(payload),
		onSuccess: () => {
			toast.success("Template created.");
			qc.invalidateQueries({ queryKey: ["evaluation-templates"] });
			resetForm();
			setView("list");
		},
		onError: (err: any) => {
			const msg =
				err?.response?.data?.detail ||
				"Failed to create template. Check that you have permission.";
			toast.error(msg);
		},
	});

	function handleCreate(e: React.FormEvent) {
		e.preventDefault();
		const cleanRows = rows
			.map((r) => ({
				criterion: r.criterion.trim(),
				max_score: Number(r.max_score) || 10,
				weight: Number(r.weight) || 1,
			}))
			.filter((r) => r.criterion.length > 0);

		if (!name.trim()) {
			toast.error("Template name is required.");
			return;
		}
		if (cleanRows.length === 0) {
			toast.error("Add at least one scoring criterion.");
			return;
		}

		createMutation.mutate({
			name: name.trim(),
			evaluation_type: evaluationType,
			criteria: cleanRows,
			is_active: true,
		});
	}

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box max-w-xl" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<div>
						<h3 className="font-semibold text-white">Evaluation Templates</h3>
						<p className="text-xs text-slate-400 mt-0.5">
							{view === "list"
								? "Templates available for new evaluations"
								: "New template"}
						</p>
					</div>
					<button onClick={onClose} className="text-slate-400 hover:text-white">
						<X size={18} />
					</button>
				</div>

				<div className="modal-body">
					{view === "list" ? (
						<div className="space-y-3">
							{isLoading ? (
								[...Array(3)].map((_, i) => (
									<div key={i} className="skeleton h-14 rounded-xl" />
								))
							) : templates.length === 0 ? (
								<div className="text-center py-8">
									<p className="text-slate-400 text-sm mb-1">
										No templates yet.
									</p>
									<p className="text-slate-500 text-xs">
										Create one below to start running evaluations.
									</p>
								</div>
							) : (
								templates.map((t) => (
									<div
										key={t.id}
										className="card flex items-center justify-between">
										<div>
											<div className="text-sm font-medium text-white">
												{t.name}
											</div>
											<div className="text-xs text-slate-400 mt-0.5">
												{(t.criteria || []).length} criteria ·{" "}
												{EVAL_TYPES.find((x) => x.value === t.evaluation_type)
													?.label || t.evaluation_type}
											</div>
										</div>
										<span className="badge badge-slate text-[10px]">
											{t.evaluation_type}
										</span>
									</div>
								))
							)}

							<button
								type="button"
								className="btn-primary w-full justify-center"
								onClick={() => setView("create")}>
								<Plus size={15} /> New Template
							</button>
						</div>
					) : (
						<form
							id="new-template-form"
							onSubmit={handleCreate}
							className="space-y-4">
							<div>
								<label className="form-label">Template Name *</label>
								<input
									type="text"
									className="form-input"
									placeholder="e.g. Weekly Attachment Review"
									value={name}
									onChange={(e) => setName(e.target.value)}
									required
								/>
							</div>

							<div>
								<label className="form-label">Evaluation Type *</label>
								<select
									className="form-input"
									value={evaluationType}
									onChange={(e) => setEvaluationType(e.target.value)}>
									{EVAL_TYPES.map((t) => (
										<option key={t.value} value={t.value}>
											{t.label}
										</option>
									))}
								</select>
							</div>

							<div>
								<div className="flex items-center justify-between mb-2">
									<label className="form-label !mb-0">Scoring Criteria *</label>
									<button
										type="button"
										className="text-xs text-Nexus-400 hover:text-Nexus-300 flex items-center gap-1"
										onClick={addRow}>
										<Plus size={12} /> Add criterion
									</button>
								</div>
								<div className="space-y-2">
									{rows.map((row, i) => (
										<div key={i} className="flex items-center gap-2">
											<input
												type="text"
												className="form-input flex-1 text-sm"
												placeholder="Criterion name, e.g. Punctuality"
												value={row.criterion}
												onChange={(e) =>
													updateRow(i, { criterion: e.target.value })
												}
											/>
											<input
												type="number"
												min={1}
												className="form-input w-20 text-sm text-center"
												placeholder="Max"
												title="Max score"
												value={row.max_score}
												onChange={(e) =>
													updateRow(i, {
														max_score: Number(e.target.value),
													})
												}
											/>
											<input
												type="number"
												min={1}
												className="form-input w-20 text-sm text-center"
												placeholder="Weight"
												title="Weight"
												value={row.weight}
												onChange={(e) =>
													updateRow(i, { weight: Number(e.target.value) })
												}
											/>
											<button
												type="button"
												className={clsx(
													"w-7 h-7 rounded flex items-center justify-center text-slate-500 hover:text-red-400",
													rows.length === 1 && "opacity-30 pointer-events-none",
												)}
												onClick={() => removeRow(i)}>
												<Trash2 size={14} />
											</button>
										</div>
									))}
								</div>
								<p className="text-[11px] text-slate-500 mt-2">
									Max = highest score for that criterion. Weight = relative
									importance when computing the final percentage.
								</p>
							</div>
						</form>
					)}
				</div>

				<div className="modal-footer">
					{view === "create" ? (
						<>
							<button
								type="button"
								className="btn-secondary"
								onClick={() => {
									resetForm();
									setView("list");
								}}
								disabled={createMutation.isPending}>
								Back
							</button>
							<button
								type="submit"
								form="new-template-form"
								className="btn-primary"
								disabled={createMutation.isPending}>
								{createMutation.isPending ? "Saving…" : "Create Template"}
							</button>
						</>
					) : (
						<button onClick={onClose} className="btn-secondary">
							Close
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
