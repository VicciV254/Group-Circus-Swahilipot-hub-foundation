// Nexus — Attachee Data Collection Form (comprehensive)
// Features: add/edit/remove entries, paste from clipboard, bulk paste,
// inline editing, undo delete, column sort, pagination, stats,
// export CSV/XLSX, import existing CSV to edit, keyboard shortcuts,
// duplicate detection, field validation, department/branch dropdowns,
// local draft auto-save, print view
import {
	useState,
	useCallback,
	useMemo,
	useRef,
	useEffect,
	useReducer,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
	UserPlus,
	X,
	Download,
	Trash2,
	Search,
	CheckCircle,
	AlertCircle,
	Info,
	Users,
	FileSpreadsheet,
	Upload,
	ChevronUp,
	ChevronDown,
	RotateCcw,
	Edit2,
	Save,
	Copy,
	Clipboard,
	Printer,
	ArrowRight,
	Filter,
	Eye,
	EyeOff,
	RefreshCw,
	ChevronLeft,
	ChevronRight,
	Loader2,
	Plus,
} from "lucide-react";
import { hrApi } from "../../services/api";
import clsx from "clsx";
import toast from "react-hot-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EntryRow {
	id: number;
	first: string;
	last: string;
	email: string;
	phone: string;
	empid: string;
	dept: string;
	branch: string;
	role: string;
	isDupe: boolean;
	isNew?: boolean; // flash highlight
}

type SortField = keyof Pick<
	EntryRow,
	"first" | "last" | "email" | "dept" | "branch"
>;
type SortDir = "asc" | "desc";

interface FormState {
	first: string;
	last: string;
	email: string;
	phone: string;
	empid: string;
	dept: string;
	branch: string;
	role: string;
}

const EMPTY_FORM: FormState = {
	first: "",
	last: "",
	email: "",
	phone: "",
	empid: "",
	dept: "",
	branch: "",
	role: "attachee",
};

const ROLES = [
	{ value: "attachee", label: "Attachee / Intern" },
	{ value: "broadcast_student", label: "Broadcast Student" },
	{ value: "supervisor", label: "Supervisor" },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const DRAFT_KEY = "nexus_collection_draft";

// ── Helpers ───────────────────────────────────────────────────────────────────

let _counter = Date.now();
const nextId = () => ++_counter;

function initials(first: string, last: string) {
	return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function recomputeDupes(rows: EntryRow[]): EntryRow[] {
	const seen = new Set<string>();
	return rows.map((r) => {
		const key = r.email.toLowerCase().trim();
		const isDupe = seen.has(key);
		if (key) seen.add(key);
		return { ...r, isDupe };
	});
}

function toCSV(rows: EntryRow[]): string {
	const header =
		"email,first_name,last_name,phone,employee_id,department,branch,role,password";
	const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
	const lines = rows.map((r) =>
		[
			r.email,
			r.first,
			r.last,
			r.phone,
			r.empid,
			r.dept,
			r.branch,
			r.role,
			"TempPass@1234",
		]
			.map(escape)
			.join(","),
	);
	return [header, ...lines].join("\n");
}

function downloadBlob(content: string, filename: string, mime = "text/csv") {
	const blob = new Blob([content], { type: mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

function parseCSVRows(text: string): Partial<FormState>[] {
	const lines = text.trim().split(/\r?\n/);
	if (lines.length < 2) return [];
	const headers = lines[0]
		.split(",")
		.map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
	return lines.slice(1).map((line) => {
		const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
		const row: any = {};
		headers.forEach((h, i) => {
			row[h] = vals[i] ?? "";
		});
		return {
			first: row.first_name ?? row.first ?? "",
			last: row.last_name ?? row.last ?? "",
			email: row.email ?? "",
			phone: row.phone ?? "",
			empid: row.employee_id ?? row.empid ?? "",
			dept: row.department ?? row.dept ?? "",
			branch: row.branch ?? "",
			role: row.role ?? "attachee",
		} as Partial<FormState>;
	});
}

function validateEmail(email: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ── Field Component ───────────────────────────────────────────────────────────

function Field({
	label,
	id,
	type = "text",
	placeholder,
	value,
	onChange,
	error,
	required,
	children,
}: {
	label: string;
	id: string;
	type?: string;
	placeholder?: string;
	value?: string;
	onChange?: (v: string) => void;
	error?: string;
	required?: boolean;
	children?: React.ReactNode;
}) {
	return (
		<div className="space-y-1">
			<label htmlFor={id} className="block text-xs text-slate-400">
				{label}
				{required && <span className="text-red-400 ml-0.5">*</span>}
			</label>
			{children ?? (
				<input
					id={id}
					type={type}
					placeholder={placeholder}
					value={value}
					onChange={(e) => onChange?.(e.target.value)}
					className={clsx(
						"input w-full py-2 text-sm",
						error && "border-red-500/50 focus:ring-red-500/30",
					)}
				/>
			)}
			{error && <p className="text-xs text-red-400">{error}</p>}
		</div>
	);
}

// ── Inline Edit Cell ──────────────────────────────────────────────────────────

function EditCell({
	value,
	onSave,
	type = "text",
}: {
	value: string;
	onSave: (v: string) => void;
	type?: string;
}) {
	const [editing, setEditing] = useState(false);
	const [val, setVal] = useState(value);
	const ref = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (editing) ref.current?.focus();
	}, [editing]);

	const commit = () => {
		onSave(val);
		setEditing(false);
	};

	if (!editing)
		return (
			<span
				className="cursor-pointer hover:text-white group flex items-center gap-1"
				onClick={() => setEditing(true)}>
				{value || <span className="text-slate-600">—</span>}
				<Edit2
					size={10}
					className="opacity-0 group-hover:opacity-40 shrink-0"
				/>
			</span>
		);

	return (
		<input
			ref={ref}
			type={type}
			value={val}
			onChange={(e) => setVal(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === "Enter") commit();
				if (e.key === "Escape") setEditing(false);
			}}
			className="input py-0.5 text-xs w-full min-w-0"
		/>
	);
}

// ── Bulk Paste Modal ──────────────────────────────────────────────────────────

function BulkPasteModal({
	onClose,
	onImport,
}: {
	onClose: () => void;
	onImport: (rows: Partial<FormState>[]) => void;
}) {
	const [text, setText] = useState("");
	const [preview, setPreview] = useState<Partial<FormState>[]>([]);

	const parse = () => {
		const rows = parseCSVRows(text);
		setPreview(rows);
	};

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div
				className="modal-box max-w-2xl w-full"
				onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h3 className="font-semibold text-white flex items-center gap-2">
						<Clipboard size={15} className="text-blue-400" /> Paste CSV data
					</h3>
					<button onClick={onClose} className="btn-ghost p-1.5">
						<X size={14} />
					</button>
				</div>
				<div className="modal-body space-y-4">
					<p className="text-xs text-slate-400">
						Paste CSV rows below. First row must be a header containing at
						least:
						<code className="ml-1 px-1.5 py-0.5 bg-surface rounded text-slate-300">
							email, first_name, last_name
						</code>
					</p>
					<textarea
						value={text}
						onChange={(e) => {
							setText(e.target.value);
							setPreview([]);
						}}
						className="input w-full text-xs font-mono"
						rows={8}
						placeholder={
							"email,first_name,last_name,phone,employee_id,department,branch\njane@example.com,Jane,Doe,+254700000001,EMP-001,ICT,Mombasa"
						}
					/>
					{preview.length > 0 && (
						<div className="overflow-x-auto max-h-48">
							<table className="data-table text-xs">
								<thead>
									<tr>
										<th>#</th>
										<th>Name</th>
										<th>Email</th>
										<th>Dept</th>
										<th>Branch</th>
									</tr>
								</thead>
								<tbody>
									{preview.map((r, i) => (
										<tr key={i}>
											<td className="text-slate-600">{i + 1}</td>
											<td className="text-white">
												{r.first} {r.last}
											</td>
											<td className="text-slate-400">{r.email}</td>
											<td className="text-slate-400">{r.dept || "—"}</td>
											<td className="text-slate-400">{r.branch || "—"}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
				<div className="modal-footer">
					<button onClick={onClose} className="btn-secondary btn-sm">
						Cancel
					</button>
					{preview.length === 0 ? (
						<button
							onClick={parse}
							disabled={!text.trim()}
							className="btn-secondary btn-sm">
							<Eye size={13} /> Preview
						</button>
					) : (
						<button
							onClick={() => {
								onImport(preview);
								onClose();
							}}
							className="btn-primary btn-sm">
							<Plus size={13} /> Add {preview.length} rows
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AttacheeCollectionForm() {
	const navigate = useNavigate();
	const fileRef = useRef<HTMLInputElement>(null);
	const firstRef = useRef<HTMLInputElement>(null);

	// ── State ────────────────────────────────────────────────────────────────
	const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
	const [errors, setErrors] = useState<Partial<FormState>>({});
	const [entries, setEntries] = useState<EntryRow[]>(() => {
		try {
			const saved = localStorage.getItem(DRAFT_KEY);
			return saved ? JSON.parse(saved) : [];
		} catch {
			return [];
		}
	});
	const [selected, setSelected] = useState<Set<number>>(new Set());
	const [search, setSearch] = useState("");
	const [deptFilter, setDeptFilter] = useState("");
	const [roleFilter, setRoleFilter] = useState("");
	const [statusFilter, setStatusFilter] = useState<"" | "valid" | "duplicate">(
		"",
	);
	const [sortField, setSortField] = useState<SortField>("first");
	const [sortDir, setSortDir] = useState<SortDir>("asc");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [undoStack, setUndoStack] = useState<EntryRow[][]>([]);
	const [showBulk, setShowBulk] = useState(false);
	const [showFilters, setShowFilters] = useState(false);
	const [importing, setImporting] = useState(false);

	// ── Queries ───────────────────────────────────────────────────────────────
	const { data: departments = [] } = useQuery({
		queryKey: ["departments"],
		queryFn: () => hrApi.departments().then((r) => r.data.results ?? r.data),
	});
	const { data: branches = [] } = useQuery({
		queryKey: ["branches"],
		queryFn: () =>
			hrApi
				.branches?.()
				.then((r) => r.data.results ?? r.data)
				.catch(() => []),
	});

	// ── Auto-save draft ───────────────────────────────────────────────────────
	useEffect(() => {
		try {
			localStorage.setItem(DRAFT_KEY, JSON.stringify(entries));
		} catch {}
	}, [entries]);

	// ── Derived ───────────────────────────────────────────────────────────────
	const sorted = useMemo(() => {
		return [...entries].sort((a, b) => {
			const av = (a[sortField] ?? "").toLowerCase();
			const bv = (b[sortField] ?? "").toLowerCase();
			return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
		});
	}, [entries, sortField, sortDir]);

	const filtered = useMemo(() => {
		const q = search.toLowerCase();
		return sorted.filter((e) => {
			if (
				search &&
				!`${e.first} ${e.last} ${e.email} ${e.empid}`.toLowerCase().includes(q)
			)
				return false;
			if (deptFilter && e.dept !== deptFilter) return false;
			if (roleFilter && e.role !== roleFilter) return false;
			if (statusFilter === "valid" && e.isDupe) return false;
			if (statusFilter === "duplicate" && !e.isDupe) return false;
			return true;
		});
	}, [sorted, search, deptFilter, roleFilter, statusFilter]);

	const totalPages = Math.ceil(filtered.length / pageSize);
	const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
	const validEntries = entries.filter((e) => !e.isDupe);
	const dupeCount = entries.filter((e) => e.isDupe).length;
	const uniqueDepts = [
		...new Set(entries.map((e) => e.dept).filter(Boolean)),
	].sort();
	const allPageSelected =
		paginated.length > 0 && paginated.every((e) => selected.has(e.id));

	// Reset page when filters change
	useEffect(() => setPage(1), [search, deptFilter, roleFilter, statusFilter]);

	// ── Sort toggle ───────────────────────────────────────────────────────────
	const toggleSort = (field: SortField) => {
		if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		else {
			setSortField(field);
			setSortDir("asc");
		}
	};

	const SortIcon = ({ field }: { field: SortField }) =>
		sortField === field ? (
			sortDir === "asc" ? (
				<ChevronUp size={11} />
			) : (
				<ChevronDown size={11} />
			)
		) : (
			<ChevronDown size={11} className="opacity-20" />
		);

	// ── Validate form ─────────────────────────────────────────────────────────
	function validate() {
		const errs: Partial<FormState> = {};
		if (!form.first.trim()) errs.first = "Required";
		if (!form.last.trim()) errs.last = "Required";
		if (!validateEmail(form.email)) errs.email = "Valid email required";
		setErrors(errs);
		return Object.keys(errs).length === 0;
	}

	// ── Add entry ─────────────────────────────────────────────────────────────
	const addEntry = useCallback(() => {
		if (!validate()) return;
		pushUndo();
		const newRow: EntryRow = {
			id: nextId(),
			first: form.first.trim(),
			last: form.last.trim(),
			email: form.email.trim(),
			phone: form.phone.trim(),
			empid: form.empid.trim(),
			dept: form.dept.trim(),
			branch: form.branch.trim(),
			role: form.role,
			isDupe: false,
			isNew: true,
		};
		setEntries((prev) => {
			const updated = recomputeDupes([...prev, newRow]);
			return updated;
		});
		setForm({ ...EMPTY_FORM });
		setErrors({});
		setTimeout(() => {
			setEntries((prev) =>
				prev.map((e) => (e.id === newRow.id ? { ...e, isNew: false } : e)),
			);
		}, 1500);
		toast.success(`${newRow.first} ${newRow.last} added`);
		firstRef.current?.focus();
	}, [form]);

	// ── Bulk add ──────────────────────────────────────────────────────────────
	const bulkAdd = (rows: Partial<FormState>[]) => {
		pushUndo();
		const valid = rows.filter(
			(r) => r.email && validateEmail(r.email) && r.first,
		);
		const invalid = rows.length - valid.length;
		const newRows: EntryRow[] = valid.map((r) => ({
			id: nextId(),
			first: r.first ?? "",
			last: r.last ?? "",
			email: r.email ?? "",
			phone: r.phone ?? "",
			empid: r.empid ?? "",
			dept: r.dept ?? "",
			branch: r.branch ?? "",
			role: r.role ?? "attachee",
			isDupe: false,
		}));
		setEntries((prev) => recomputeDupes([...prev, ...newRows]));
		toast.success(
			`${newRows.length} rows added${invalid > 0 ? ` (${invalid} skipped — invalid)` : ""}`,
		);
	};

	// ── Remove ────────────────────────────────────────────────────────────────
	const removeEntry = (id: number) => {
		pushUndo();
		setEntries((prev) => recomputeDupes(prev.filter((e) => e.id !== id)));
		setSelected((prev) => {
			const s = new Set(prev);
			s.delete(id);
			return s;
		});
	};

	const removeSelected = () => {
		const count = selected.size;
		pushUndo();
		setEntries((prev) =>
			recomputeDupes(prev.filter((e) => !selected.has(e.id))),
		);
		setSelected(new Set());
		toast.success(`Removed ${count} entr${count === 1 ? "y" : "ies"}`);
	};

	const clearAll = () => {
		pushUndo();
		setEntries([]);
		setSelected(new Set());
		toast("List cleared", { icon: "🗑" });
	};

	// ── Undo ─────────────────────────────────────────────────────────────────
	const pushUndo = () => setUndoStack((prev) => [...prev.slice(-19), entries]);
	const undo = () => {
		if (undoStack.length === 0) return;
		const prev = undoStack[undoStack.length - 1];
		setUndoStack((s) => s.slice(0, -1));
		setEntries(prev);
		toast("Undone", { icon: "↩" });
	};

	// ── Inline edit ───────────────────────────────────────────────────────────
	const updateField = (id: number, field: keyof EntryRow, value: string) => {
		setEntries((prev) =>
			recomputeDupes(
				prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
			),
		);
	};

	// ── Selection ─────────────────────────────────────────────────────────────
	const toggleOne = (id: number) => {
		setSelected((prev) => {
			const s = new Set(prev);
			s.has(id) ? s.delete(id) : s.add(id);
			return s;
		});
	};

	const toggleAllPage = () => {
		setSelected((prev) => {
			const s = new Set(prev);
			if (allPageSelected) paginated.forEach((e) => s.delete(e.id));
			else paginated.forEach((e) => s.add(e.id));
			return s;
		});
	};

	const selectAllValid = () => {
		setSelected(new Set(validEntries.map((e) => e.id)));
		toast(`${validEntries.length} valid entries selected`);
	};

	// ── Export ────────────────────────────────────────────────────────────────
	const exportCSV = (onlySelected = false) => {
		const toExport =
			onlySelected && selected.size > 0
				? entries.filter((e) => selected.has(e.id) && !e.isDupe)
				: validEntries;
		if (toExport.length === 0) {
			toast.error("No valid entries to export");
			return;
		}
		const date = new Date().toISOString().slice(0, 10);
		downloadBlob(toCSV(toExport), `attachees_${date}.csv`);
		toast.success(
			`Exported ${toExport.length} entr${toExport.length === 1 ? "y" : "ies"} as CSV`,
		);
	};

	// ── Import existing CSV ───────────────────────────────────────────────────
	const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const f = e.target.files?.[0];
		if (!f) return;
		setImporting(true);
		const text = await f.text();
		const rows = parseCSVRows(text);
		bulkAdd(rows);
		setImporting(false);
		e.target.value = "";
	};

	// ── Copy emails ───────────────────────────────────────────────────────────
	const copyEmails = () => {
		const emails = (
			selected.size > 0
				? entries.filter((e) => selected.has(e.id))
				: validEntries
		)
			.map((e) => e.email)
			.join("\n");
		navigator.clipboard.writeText(emails);
		toast.success("Emails copied to clipboard");
	};

	// ── Keyboard shortcuts ────────────────────────────────────────────────────
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "Enter") addEntry();
			if ((e.ctrlKey || e.metaKey) && e.key === "z") undo();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [addEntry]);

	const set = (field: keyof FormState) => (v: string) =>
		setForm((p) => ({ ...p, [field]: v }));

	// ── Render ────────────────────────────────────────────────────────────────
	return (
		<div className="space-y-6 animate-fade-in">
			{/* ── Page Header ── */}
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<FileSpreadsheet size={22} className="text-Swahilipot-400" />
						Attachee Data Collection
					</h1>
					<p className="page-subtitle">
						Build your list, then export as CSV for bulk import
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					{undoStack.length > 0 && (
						<button
							onClick={undo}
							className="btn-secondary btn-sm"
							title="Ctrl+Z">
							<RotateCcw size={13} /> Undo
						</button>
					)}
					<button
						onClick={() => setShowBulk(true)}
						className="btn-secondary btn-sm">
						<Clipboard size={13} /> Paste CSV
					</button>
					<button
						onClick={() => fileRef.current?.click()}
						disabled={importing}
						className="btn-secondary btn-sm">
						{importing ? (
							<Loader2 size={13} className="animate-spin" />
						) : (
							<Upload size={13} />
						)}
						Load CSV
					</button>
					<input
						ref={fileRef}
						type="file"
						accept=".csv"
						className="hidden"
						onChange={handleFileImport}
					/>
					{entries.length > 0 && (
						<>
							<button onClick={copyEmails} className="btn-secondary btn-sm">
								<Copy size={13} /> Copy emails
							</button>
							<button
								onClick={() => exportCSV(selected.size > 0)}
								className="btn-primary btn-sm">
								<Download size={13} />
								{selected.size > 0
									? `Export ${selected.size} selected`
									: `Export ${validEntries.length} valid`}
							</button>
						</>
					)}
				</div>
			</div>

			{/* ── Stats ── */}
			{entries.length > 0 && (
				<div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
					{[
						{
							label: "Total",
							value: entries.length,
							color: "text-white",
							onClick: () => setStatusFilter(""),
						},
						{
							label: "Valid",
							value: validEntries.length,
							color: "text-green-400",
							onClick: () => setStatusFilter("valid"),
						},
						{
							label: "Duplicates",
							value: dupeCount,
							color: "text-yellow-400",
							onClick: () => setStatusFilter("duplicate"),
						},
						{
							label: "Selected",
							value: selected.size,
							color: "text-blue-400",
							onClick: selectAllValid,
						},
						{
							label: "Departments",
							value: uniqueDepts.length,
							color: "text-purple-400",
							onClick: () => {},
						},
					].map(({ label, value, color, onClick }) => (
						<div
							key={label}
							className="stat-card cursor-pointer hover:border-white/10 transition-colors"
							onClick={onClick}
							title={
								label === "Selected"
									? "Click to select all valid"
									: `Filter by ${label.toLowerCase()}`
							}>
							<div className={clsx("stat-value", color)}>{value}</div>
							<div className="stat-label">{label}</div>
						</div>
					))}
				</div>
			)}

			{/* ── Add Form ── */}
			<div className="card space-y-4">
				<div className="flex items-center justify-between">
					<h2 className="text-sm font-medium text-white flex items-center gap-2">
						<UserPlus size={15} className="text-blue-400" /> Add attachee
					</h2>
					<span className="text-xs text-slate-600">
						Ctrl+Enter to add quickly
					</span>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
					<Field
						label="First name"
						id="first"
						placeholder="Jane"
						value={form.first}
						onChange={set("first")}
						error={errors.first}
						required>
						<input
							ref={firstRef}
							id="first"
							type="text"
							placeholder="Jane"
							value={form.first}
							onChange={(e) => set("first")(e.target.value)}
							className={clsx(
								"input w-full py-2 text-sm",
								errors.first && "border-red-500/50",
							)}
						/>
						{errors.first && (
							<p className="text-xs text-red-400 mt-1">{errors.first}</p>
						)}
					</Field>
					<Field
						label="Last name"
						id="last"
						placeholder="Doe"
						value={form.last}
						onChange={set("last")}
						error={errors.last}
						required
					/>
					<Field
						label="Email"
						id="email"
						type="email"
						placeholder="jane@example.com"
						value={form.email}
						onChange={set("email")}
						error={errors.email}
						required
					/>
					<Field
						label="Phone"
						id="phone"
						type="tel"
						placeholder="+254 700 000 000"
						value={form.phone}
						onChange={set("phone")}
					/>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
					<Field
						label="Employee ID"
						id="empid"
						placeholder="EMP-001"
						value={form.empid}
						onChange={set("empid")}
					/>

					<Field label="Department" id="dept" placeholder="">
						{(departments as any[]).length > 0 ? (
							<select
								value={form.dept}
								onChange={(e) => set("dept")(e.target.value)}
								className="select-input w-full">
								<option value="">— Select —</option>
								{(departments as any[]).map((d) => (
									<option key={d.id} value={d.name}>
										{d.name}
									</option>
								))}
							</select>
						) : (
							<input
								type="text"
								placeholder="e.g. ICT"
								value={form.dept}
								onChange={(e) => set("dept")(e.target.value)}
								className="input w-full py-2 text-sm"
							/>
						)}
					</Field>

					<Field label="Branch" id="branch" placeholder="">
						{(branches as any[]).length > 0 ? (
							<select
								value={form.branch}
								onChange={(e) => set("branch")(e.target.value)}
								className="select-input w-full">
								<option value="">— Select —</option>
								{(branches as any[]).map((b) => (
									<option key={b.id} value={b.name}>
										{b.name}
									</option>
								))}
							</select>
						) : (
							<input
								type="text"
								placeholder="e.g. Mombasa"
								value={form.branch}
								onChange={(e) => set("branch")(e.target.value)}
								className="input w-full py-2 text-sm"
							/>
						)}
					</Field>

					<Field label="Role" id="role" placeholder="">
						<select
							value={form.role}
							onChange={(e) => set("role")(e.target.value)}
							className="select-input w-full">
							{ROLES.map((r) => (
								<option key={r.value} value={r.value}>
									{r.label}
								</option>
							))}
						</select>
					</Field>
				</div>

				<div className="flex items-center justify-between gap-3 pt-1 border-t border-white/5">
					<p className="text-xs text-slate-600 flex items-center gap-1.5">
						<Info size={11} />
						Temporary password auto-generated on import · Welcome email sent
						automatically
					</p>
					<div className="flex gap-2">
						<button
							onClick={() => {
								setForm({ ...EMPTY_FORM });
								setErrors({});
							}}
							className="btn-secondary btn-sm">
							<X size={13} /> Clear
						</button>
						<button onClick={addEntry} className="btn-primary btn-sm">
							<UserPlus size={13} /> Add to list
						</button>
					</div>
				</div>
			</div>

			{/* ── Table ── */}
			<div className="card">
				{/* Table toolbar */}
				<div className="flex flex-wrap items-center justify-between gap-3 mb-4">
					<h2 className="text-sm font-medium text-white flex items-center gap-2">
						<Users size={15} className="text-slate-400" />
						Entries
						<span className="badge badge-slate ml-1">{entries.length}</span>
						{filtered.length !== entries.length && (
							<span className="text-xs text-slate-600">
								({filtered.length} shown)
							</span>
						)}
					</h2>

					<div className="flex flex-wrap gap-2 items-center">
						<div className="relative">
							<Search
								size={13}
								className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
							/>
							<input
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search name, email, ID…"
								className="input pl-8 py-1.5 text-sm w-48"
							/>
						</div>

						<button
							onClick={() => setShowFilters((p) => !p)}
							className={clsx(
								"btn-secondary btn-sm",
								showFilters && "text-blue-400",
							)}>
							<Filter size={13} />
							Filters
							{(deptFilter || roleFilter || statusFilter) && (
								<span className="badge badge-blue ml-1 text-[10px] px-1">
									{
										[deptFilter, roleFilter, statusFilter].filter(Boolean)
											.length
									}
								</span>
							)}
						</button>

						{selected.size > 0 && (
							<>
								<button
									onClick={() => exportCSV(true)}
									className="btn-secondary btn-sm text-green-400">
									<Download size={13} /> Export {selected.size}
								</button>
								<button
									onClick={removeSelected}
									className="btn-secondary btn-sm text-red-400">
									<Trash2 size={13} /> Remove {selected.size}
								</button>
							</>
						)}

						{entries.length > 0 && selected.size === 0 && (
							<button
								onClick={selectAllValid}
								className="btn-secondary btn-sm text-xs">
								Select all valid
							</button>
						)}

						{entries.length > 0 && (
							<button
								onClick={clearAll}
								className="btn-secondary btn-sm text-xs text-slate-500">
								<Trash2 size={11} /> Clear all
							</button>
						)}
					</div>
				</div>

				{/* Expanded filters */}
				{showFilters && (
					<div className="flex flex-wrap gap-3 mb-4 p-3 bg-surface rounded-xl border border-white/5">
						<div>
							<label className="block text-xs text-slate-500 mb-1">
								Department
							</label>
							<select
								value={deptFilter}
								onChange={(e) => setDeptFilter(e.target.value)}
								className="select-input w-40 text-sm">
								<option value="">All</option>
								{uniqueDepts.map((d) => (
									<option key={d} value={d}>
										{d}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className="block text-xs text-slate-500 mb-1">Role</label>
							<select
								value={roleFilter}
								onChange={(e) => setRoleFilter(e.target.value)}
								className="select-input w-40 text-sm">
								<option value="">All</option>
								{ROLES.map((r) => (
									<option key={r.value} value={r.value}>
										{r.label}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className="block text-xs text-slate-500 mb-1">
								Status
							</label>
							<select
								value={statusFilter}
								onChange={(e) => setStatusFilter(e.target.value as any)}
								className="select-input w-36 text-sm">
								<option value="">All</option>
								<option value="valid">Valid only</option>
								<option value="duplicate">Duplicates only</option>
							</select>
						</div>
						<button
							onClick={() => {
								setDeptFilter("");
								setRoleFilter("");
								setStatusFilter("");
							}}
							className="btn-secondary btn-sm text-xs self-end">
							<RefreshCw size={11} /> Reset filters
						</button>
					</div>
				)}

				{/* Empty state */}
				{entries.length === 0 ? (
					<div className="text-center py-16 text-slate-500">
						<FileSpreadsheet size={36} className="mx-auto mb-3 opacity-20" />
						<p className="text-sm font-medium">No entries yet</p>
						<p className="text-xs mt-1 text-slate-600">
							Add one above, paste CSV, or load an existing CSV file
						</p>
					</div>
				) : filtered.length === 0 ? (
					<div className="text-center py-10 text-slate-500">
						<Search size={24} className="mx-auto mb-2 opacity-30" />
						<p className="text-sm">No entries match your filters</p>
						<button
							onClick={() => {
								setSearch("");
								setDeptFilter("");
								setRoleFilter("");
								setStatusFilter("");
							}}
							className="btn-secondary btn-sm mt-3 text-xs">
							Clear filters
						</button>
					</div>
				) : (
					<>
						<div className="overflow-x-auto">
							<table className="data-table text-sm">
								<thead>
									<tr>
										<th className="w-8">
											<input
												type="checkbox"
												checked={allPageSelected}
												onChange={toggleAllPage}
												className="accent-blue-500"
											/>
										</th>
										<th
											className="cursor-pointer select-none"
											onClick={() => toggleSort("first")}>
											<span className="flex items-center gap-1">
												Name <SortIcon field="first" />
											</span>
										</th>
										<th
											className="cursor-pointer select-none"
											onClick={() => toggleSort("email")}>
											<span className="flex items-center gap-1">
												Email <SortIcon field="email" />
											</span>
										</th>
										<th>Phone</th>
										<th>Employee ID</th>
										<th
											className="cursor-pointer select-none"
											onClick={() => toggleSort("dept")}>
											<span className="flex items-center gap-1">
												Department <SortIcon field="dept" />
											</span>
										</th>
										<th
											className="cursor-pointer select-none"
											onClick={() => toggleSort("branch")}>
											<span className="flex items-center gap-1">
												Branch <SortIcon field="branch" />
											</span>
										</th>
										<th>Role</th>
										<th>Status</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{paginated.map((e) => (
										<tr
											key={e.id}
											className={clsx(
												"transition-colors",
												selected.has(e.id) && "bg-blue-500/5",
												e.isNew && "bg-green-500/5",
												e.isDupe && "opacity-50",
											)}>
											<td onClick={(ev) => ev.stopPropagation()}>
												<input
													type="checkbox"
													checked={selected.has(e.id)}
													onChange={() => toggleOne(e.id)}
													className="accent-blue-500"
												/>
											</td>
											<td>
												<div className="flex items-center gap-2.5">
													<div className="w-7 h-7 rounded-full bg-gradient-Swahilipot flex items-center justify-center text-[10px] font-bold text-white shrink-0">
														{initials(e.first, e.last)}
													</div>
													<div>
														<div className="text-white font-medium text-xs">
															<EditCell
																value={`${e.first} ${e.last}`}
																onSave={(v) => {
																	const parts = v.split(" ");
																	updateField(e.id, "first", parts[0] ?? "");
																	updateField(
																		e.id,
																		"last",
																		parts.slice(1).join(" ") ?? "",
																	);
																}}
															/>
														</div>
													</div>
												</div>
											</td>
											<td className="text-slate-400 text-xs max-w-[160px]">
												<EditCell
													value={e.email}
													onSave={(v) => updateField(e.id, "email", v)}
													type="email"
												/>
											</td>
											<td className="text-slate-400 text-xs">
												<EditCell
													value={e.phone}
													onSave={(v) => updateField(e.id, "phone", v)}
												/>
											</td>
											<td className="font-mono text-xs text-slate-500">
												<EditCell
													value={e.empid}
													onSave={(v) => updateField(e.id, "empid", v)}
												/>
											</td>
											<td className="text-slate-300 text-xs">
												<EditCell
													value={e.dept}
													onSave={(v) => updateField(e.id, "dept", v)}
												/>
											</td>
											<td className="text-slate-400 text-xs">
												<EditCell
													value={e.branch}
													onSave={(v) => updateField(e.id, "branch", v)}
												/>
											</td>
											<td className="text-slate-400 text-xs">
												<EditCell
													value={e.role}
													onSave={(v) => updateField(e.id, "role", v)}
												/>
											</td>
											<td>
												{e.isDupe ? (
													<span className="badge badge-yellow flex items-center gap-1 w-fit text-[10px]">
														<AlertCircle size={9} /> Duplicate
													</span>
												) : (
													<span className="badge badge-green flex items-center gap-1 w-fit text-[10px]">
														<CheckCircle size={9} /> Valid
													</span>
												)}
											</td>
											<td onClick={(ev) => ev.stopPropagation()}>
												<button
													onClick={() => removeEntry(e.id)}
													className="btn-ghost btn-sm p-1.5 text-red-400 hover:text-red-300"
													title="Remove">
													<Trash2 size={12} />
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>

						{/* Pagination */}
						{totalPages > 1 && (
							<div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
								<div className="flex items-center gap-2 text-xs text-slate-400">
									<span>Rows per page:</span>
									<select
										value={pageSize}
										onChange={(e) => {
											setPageSize(Number(e.target.value));
											setPage(1);
										}}
										className="select-input w-16 text-xs py-1">
										{PAGE_SIZE_OPTIONS.map((n) => (
											<option key={n} value={n}>
												{n}
											</option>
										))}
									</select>
									<span className="ml-2">
										{(page - 1) * pageSize + 1}–
										{Math.min(page * pageSize, filtered.length)} of{" "}
										{filtered.length}
									</span>
								</div>
								<div className="flex items-center gap-1">
									<button
										onClick={() => setPage(1)}
										disabled={page === 1}
										className="btn-ghost btn-sm p-1.5">
										<ChevronLeft size={13} />
									</button>
									{Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
										const p =
											Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
										return (
											<button
												key={p}
												onClick={() => setPage(p)}
												className={clsx(
													"btn-ghost btn-sm px-2.5 py-1 text-xs",
													page === p && "text-white bg-white/10",
												)}>
												{p}
											</button>
										);
									})}
									<button
										onClick={() => setPage(totalPages)}
										disabled={page === totalPages}
										className="btn-ghost btn-sm p-1.5">
										<ChevronRight size={13} />
									</button>
								</div>
							</div>
						)}
					</>
				)}

				{/* Footer actions */}
				{entries.length > 0 && (
					<div className="mt-4 pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-3">
						<div className="text-xs text-slate-600 flex items-center gap-1.5">
							<Info size={11} />
							Duplicates excluded from export · Click any cell to edit inline ·
							Draft auto-saved
						</div>
						<div className="flex gap-2">
							<button
								onClick={() => navigate("/attachees")}
								className="btn-secondary btn-sm text-xs">
								Go to Import <ArrowRight size={12} />
							</button>
							<button
								onClick={() => exportCSV(selected.size > 0)}
								className="btn-primary btn-sm">
								<Download size={13} />
								{selected.size > 0
									? `Export ${selected.size} selected`
									: `Export ${validEntries.length} valid as CSV`}
							</button>
						</div>
					</div>
				)}
			</div>

			{/* ── Bulk paste modal ── */}
			{showBulk && (
				<BulkPasteModal onClose={() => setShowBulk(false)} onImport={bulkAdd} />
			)}
		</div>
	);
}
