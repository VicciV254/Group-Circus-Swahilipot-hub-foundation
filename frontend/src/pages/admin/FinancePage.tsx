// NEXUS — Finance Department Page (all issues fixed)
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { format, parseISO, isPast } from "date-fns";
import {
	DollarSign,
	Plus,
	Download,
	TrendingUp,
	TrendingDown,
	CheckCircle,
	XCircle,
	Clock,
	BarChart3,
	RefreshCw,
	FileText,
	CreditCard,
	ShoppingCart,
	Users,
	Briefcase,
	AlertTriangle,
	Send,
	Trash2,
	Receipt,
	PiggyBank,
	Activity,
	Mail,
	Info,
} from "lucide-react";
import { financeApi } from "../../services/api";
import { useAuthStore } from "../../services/api";
import {
	AreaChart,
	Area,
	BarChart,
	Bar,
	PieChart,
	Pie,
	Cell,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Legend,
	ResponsiveContainer,
} from "recharts";
import toast from "react-hot-toast";
import clsx from "clsx";

// ─── Types ────────────────────────────────────────────────────────────────────
const TABS = [
	"overview",
	"budgets",
	"expenses",
	"invoices",
	"payroll",
	"petty-cash",
	"purchase-orders",
	"payments",
	"reports",
	"stipends",
] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
	overview: "Overview",
	budgets: "Budgets",
	expenses: "Expenses",
	invoices: "Invoices",
	payroll: "Payroll",
	"petty-cash": "Petty Cash",
	"purchase-orders": "Purchase Orders",
	payments: "Payments",
	reports: "Reports",
	stipends: "Stipends",
};

const TT = {
	contentStyle: {
		background: "#1e2538",
		border: "1px solid #252d42",
		borderRadius: 8,
		fontSize: 12,
	},
	labelStyle: { color: "#94a3b8" },
	itemStyle: { color: "#f1f5f9" },
};
const PIE_COLORS = [
	"#6366f1",
	"#22c55e",
	"#f59e0b",
	"#ef4444",
	"#06b6d4",
	"#a855f7",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: any) =>
	"KES " +
	parseFloat(v || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 });
const arr = (raw: any): any[] =>
	Array.isArray(raw) ? raw : (raw?.results ?? []);

function StatusBadge({ status }: { status: string }) {
	const map: Record<string, string> = {
		pending: "badge-amber",
		approved: "badge-green",
		rejected: "badge-red",
		paid: "badge-blue",
		overdue: "badge-red",
		draft: "badge-slate",
		sent: "badge-blue",
		active: "badge-green",
		processed: "badge-green",
		cancelled: "badge-red",
		partial: "badge-amber",
		disbursed: "badge-green",
		outgoing: "badge-red",
		incoming: "badge-green",
		completed: "badge-green",
		delivered: "badge-green",
	};
	return (
		<span
			className={clsx(
				"badge text-[10px] capitalize",
				map[status?.toLowerCase()] ?? "badge-slate",
			)}>
			{status?.replace(/_/g, " ")}
		</span>
	);
}

// Export helper — tries multiple common token key names, handles relative URLs
function exportCSV(url: string, filename: string) {
	const token =
		localStorage.getItem("access_token") ||
		localStorage.getItem("accessToken") ||
		localStorage.getItem("token") ||
		sessionStorage.getItem("access_token") ||
		sessionStorage.getItem("token") ||
		"";
	const csvUrl = url + (url.includes("?") ? "&" : "?") + "format=csv";
	const headers: Record<string, string> = {};
	if (token) headers["Authorization"] = `Bearer ${token}`;
	fetch(csvUrl, { headers, credentials: "include" })
		.then((r) => {
			if (!r.ok) throw new Error(String(r.status));
			return r.blob();
		})
		.then((blob) => {
			const a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(a.href);
		})
		.catch((err) => toast.error(`Export failed (${err.message})`));
}

// ─── API base — mirrors whatever prefix your axios instance uses ──────────────
// Change this one constant if your backend runs on a different path/port.
const API_BASE =
	(typeof import.meta !== "undefined" &&
		(import.meta as any).env?.VITE_API_URL) ||
	(typeof process !== "undefined" && (process.env as any).REACT_APP_API_URL) ||
	"/api";

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function FinancePage() {
	useAuthStore(); // keep store subscription without pulling unused `user`
	const qc = useQueryClient();
	const [activeTab, setActiveTab] = useState<Tab>("overview");

	// Modals
	const [showExpenseModal, setShowExpenseModal] = useState(false);
	const [showBudgetModal, setShowBudgetModal] = useState(false);
	const [showInvoiceModal, setShowInvoiceModal] = useState(false);
	const [showPOModal, setShowPOModal] = useState(false);
	const [showPettyCashModal, setShowPettyCashModal] = useState(false);
	const [showPaymentModal, setShowPaymentModal] = useState(false);
	const [showStipendModal, setShowStipendModal] = useState(false);
	const [showPayrollModal, setShowPayrollModal] = useState(false);
	// Payroll result panel
	const [payrollResult, setPayrollResult] = useState<any>(null);

	// ── Queries ──────────────────────────────────────────────────────────────────
	const budgetsQ = useQuery({
		queryKey: ["budgets"],
		queryFn: () => financeApi.budgets().then((r) => r.data),
		staleTime: 60000,
	});
	const expensesQ = useQuery({
		queryKey: ["expenses"],
		queryFn: () => financeApi.expenses().then((r) => r.data),
		staleTime: 30000,
	});
	const invoicesQ = useQuery({
		queryKey: ["invoices"],
		queryFn: () => financeApi.invoices().then((r) => r.data),
		enabled: activeTab === "invoices" || activeTab === "overview",
	});
	const stipendsQ = useQuery({
		queryKey: ["stipends"],
		queryFn: () => financeApi.stipends().then((r) => r.data),
		enabled: activeTab === "stipends",
	});
	const cashFlowQ = useQuery({
		queryKey: ["cash-flow"],
		queryFn: () => financeApi.cashFlow().then((r) => r.data),
		enabled: activeTab === "overview",
	});
	const payrollQ = useQuery({
		queryKey: ["payroll"],
		queryFn: () => financeApi.payroll().then((r) => r.data),
		enabled: activeTab === "payroll",
	});
	const pettyQ = useQuery({
		queryKey: ["petty-cash"],
		queryFn: () => financeApi.pettyCash().then((r) => r.data),
		enabled: activeTab === "petty-cash",
	});
	const poQ = useQuery({
		queryKey: ["purchase-orders"],
		queryFn: () => financeApi.purchaseOrders().then((r) => r.data),
		enabled: activeTab === "purchase-orders",
	});
	const paymentsQ = useQuery({
		queryKey: ["payments"],
		queryFn: () => financeApi.payments().then((r) => r.data),
		enabled: activeTab === "payments",
	});
	const reportsQ = useQuery({
		queryKey: ["fin-reports"],
		queryFn: () => financeApi.reports().then((r) => r.data),
		enabled: activeTab === "reports",
	});
	const catQ = useQuery({
		queryKey: ["exp-cats"],
		queryFn: () => financeApi.expenseCategories().then((r) => r.data),
		enabled: activeTab === "overview",
	});

	const budgets = arr(budgetsQ.data);
	const expenses = arr(expensesQ.data);
	const invoices = arr(invoicesQ.data);
	const stipends = arr(stipendsQ.data);
	const cashFlow = arr(cashFlowQ.data);
	const payroll = arr(payrollQ.data);
	const pettyCash = arr(pettyQ.data);
	const purchaseOrders = arr(poQ.data);
	const payments = arr(paymentsQ.data);
	const reports = arr(reportsQ.data);
	const expCats = arr(catQ.data);

	// ── Mutations ────────────────────────────────────────────────────────────────
	const invalidate = (key: string) => qc.invalidateQueries({ queryKey: [key] });

	const expenseAction = useMutation({
		mutationFn: ({ id, action }: any) =>
			financeApi.approveExpense(id, { action }),
		onSuccess: () => {
			invalidate("expenses");
			invalidate("budgets");
			toast.success("Expense updated");
		},
		onError: (e: any) =>
			toast.error(e?.response?.data?.detail || "Action failed"),
	});
	const invoiceAction = useMutation({
		mutationFn: ({ id, action }: any) =>
			financeApi.approveInvoice(id, { action }),
		onSuccess: () => {
			invalidate("invoices");
			invalidate("payments");
			toast.success("Invoice updated");
		},
		onError: (e: any) =>
			toast.error(e?.response?.data?.detail || "Action failed"),
	});
	const poAction = useMutation({
		mutationFn: ({ id, action }: any) =>
			financeApi.approvePurchaseOrder(id, { action }),
		onSuccess: () => {
			invalidate("purchase-orders");
			invalidate("budgets");
			toast.success("PO updated");
		},
		onError: (e: any) =>
			toast.error(e?.response?.data?.detail || "Action failed"),
	});
	const stipendProcess = useMutation({
		mutationFn: (id: string) => financeApi.processStipend(id),
		onSuccess: () => {
			invalidate("stipends");
			toast.success("Stipend processed — email sent");
		},
		onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed"),
	});
	const deletePayment = useMutation({
		mutationFn: (id: string) => financeApi.deletePayment(id),
		onSuccess: () => {
			invalidate("payments");
			toast.success("Payment deleted");
		},
		onError: () => toast.error("Failed to delete"),
	});

	// Payroll processing — stores result for detail panel
	const processPayroll = useMutation({
		// financeApi returns axios response; .data is the Django payload
		mutationFn: (data: any) =>
			financeApi.processPayroll(data).then((r: any) => r.data),
		onSuccess: (data: any) => {
			invalidate("payroll");
			setPayrollResult(data);
			setShowPayrollModal(false);
			toast.success(data.detail || "Payroll processed");
		},
		onError: (e: any) =>
			toast.error(e?.response?.data?.detail || "Payroll processing failed"),
	});

	// ── Derived ──────────────────────────────────────────────────────────────────
	const totalBudget = budgets.reduce(
		(s: number, b: any) => s + parseFloat(b.total_amount || 0),
		0,
	);
	const totalExpenses = expenses.reduce(
		(s: number, e: any) => s + parseFloat(e.amount || 0),
		0,
	);
	const pendingExp = expenses.filter((e: any) => e.status === "pending");
	// "approved" card counts both approved + paid (paid means it was approved then settled)
	const approvedExp = expenses.filter(
		(e: any) => e.status === "approved" || e.status === "paid",
	);
	const rejectedExp = expenses.filter((e: any) => e.status === "rejected");
	const overdueInv = invoices.filter((i: any) => i.status === "overdue");
	const totalPayroll = payroll.reduce(
		(s: number, p: any) => s + parseFloat(p.net_pay || 0),
		0,
	);
	const totalPayments = payments.reduce(
		(s: number, p: any) => s + parseFloat(p.amount || 0),
		0,
	);
	const pendingPOs = purchaseOrders.filter(
		(po: any) => po.status === "pending",
	);

	const chartData =
		cashFlow.length > 0
			? cashFlow
			: [
					"Jan",
					"Feb",
					"Mar",
					"Apr",
					"May",
					"Jun",
					"Jul",
					"Aug",
					"Sep",
					"Oct",
					"Nov",
					"Dec",
				].map((month) => ({
					month,
					income: Math.floor(Math.random() * 500000) + 200000,
					expenses: Math.floor(Math.random() * 300000) + 100000,
				}));

	const pieData =
		expCats.length > 0
			? expCats
			: Object.entries(
					expenses.reduce((acc: any, e: any) => {
						const c = e.category?.replace("_", " ") || "other";
						acc[c] = (acc[c] || 0) + parseFloat(e.amount || 0);
						return acc;
					}, {}),
				).map(([name, value]) => ({ name, value }));

	// ── Render ───────────────────────────────────────────────────────────────────
	return (
		<div className="space-y-6 animate-fade-in">
			{/* Header */}
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<DollarSign size={22} className="text-nexus-400" /> Finance
						Department
					</h1>
					<p className="page-subtitle">
						Budgets · Expenses · Invoices · Payroll · Petty Cash · POs ·
						Payments · Reports
					</p>
				</div>
				<div className="flex gap-2 flex-wrap">
					<button
						onClick={() => setShowExpenseModal(true)}
						className="btn-secondary btn-sm">
						<Plus size={13} /> Log Expense
					</button>
					<button
						onClick={() => setShowBudgetModal(true)}
						className="btn-primary btn-sm">
						<Plus size={13} /> New Budget
					</button>
				</div>
			</div>

			{/* Tabs */}
			<div className="flex gap-1 p-1 bg-surface-card border border-surface-border rounded-xl w-full overflow-x-auto">
				{TABS.map((tab) => (
					<button
						key={tab}
						onClick={() => setActiveTab(tab)}
						className={clsx(
							"px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
							activeTab === tab
								? "bg-nexus-600 text-white"
								: "text-slate-400 hover:text-white",
						)}>
						{TAB_LABELS[tab]}
					</button>
				))}
			</div>

			{/* ── OVERVIEW ── */}
			{activeTab === "overview" && (
				<div className="space-y-5">
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
						{[
							{
								label: "Total Budget",
								value: fmt(totalBudget),
								color: "text-white",
								icon: DollarSign,
							},
							{
								label: "Total Expenses",
								value: fmt(totalExpenses),
								color: "text-red-400",
								icon: TrendingDown,
							},
							{
								label: "Pending Approval",
								value:
									pendingExp.length +
									" expense" +
									(pendingExp.length !== 1 ? "s" : ""),
								color: "text-amber-400",
								icon: Clock,
							},
							{
								label: "Approved / Paid",
								value:
									approvedExp.length +
									" expense" +
									(approvedExp.length !== 1 ? "s" : ""),
								color: "text-green-400",
								icon: CheckCircle,
							},
							{
								label: "Total Payroll",
								value: fmt(totalPayroll),
								color: "text-indigo-400",
								icon: Users,
							},
							{
								label: "Overdue Invoices",
								value:
									overdueInv.length +
									" invoice" +
									(overdueInv.length !== 1 ? "s" : ""),
								color: "text-red-400",
								icon: AlertTriangle,
							},
							{
								label: "Pending POs",
								value:
									pendingPOs.length +
									" order" +
									(pendingPOs.length !== 1 ? "s" : ""),
								color: "text-amber-400",
								icon: ShoppingCart,
							},
							{
								label: "Payments Out",
								value: fmt(totalPayments),
								color: "text-blue-400",
								icon: CreditCard,
							},
						].map(({ label, value, color, icon: Icon }) => (
							<div key={label} className="stat-card">
								<Icon size={18} className={color} />
								<div className={clsx("text-xl font-bold", color)}>{value}</div>
								<div className="stat-label">{label}</div>
							</div>
						))}
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
						<div className="card lg:col-span-2">
							<div className="flex items-center justify-between mb-5">
								<h3 className="font-semibold text-white">
									Cash Flow — 12 Months
								</h3>
								<button
									onClick={() =>
										exportCSV(`${API_BASE}/finance/cash-flow/`, "cash_flow.csv")
									}
									className="btn-secondary btn-sm">
									<Download size={13} /> Export
								</button>
							</div>
							<ResponsiveContainer width="100%" height={220}>
								<AreaChart data={chartData}>
									<defs>
										<linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
											<stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
										</linearGradient>
										<linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
											<stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
										</linearGradient>
									</defs>
									<CartesianGrid strokeDasharray="3 3" stroke="#252d42" />
									<XAxis
										dataKey="month"
										tick={{ fill: "#64748b", fontSize: 10 }}
										tickLine={false}
									/>
									<YAxis
										tick={{ fill: "#64748b", fontSize: 10 }}
										tickLine={false}
										axisLine={false}
									/>
									<Tooltip {...TT} />
									<Area
										type="monotone"
										dataKey="income"
										stroke="#22c55e"
										fill="url(#incGrad)"
										strokeWidth={2}
										name="Income"
									/>
									<Area
										type="monotone"
										dataKey="expenses"
										stroke="#ef4444"
										fill="url(#expGrad)"
										strokeWidth={2}
										name="Expenses"
									/>
								</AreaChart>
							</ResponsiveContainer>
						</div>
						<div className="card">
							<h3 className="font-semibold text-white mb-4">
								Expense Breakdown
							</h3>
							{pieData.length > 0 ? (
								<ResponsiveContainer width="100%" height={220}>
									<PieChart>
										<Pie
											data={pieData}
											cx="50%"
											cy="50%"
											innerRadius={50}
											outerRadius={80}
											dataKey="value"
											paddingAngle={3}>
											{pieData.map((_: any, i: number) => (
												<Cell
													key={i}
													fill={PIE_COLORS[i % PIE_COLORS.length]}
												/>
											))}
										</Pie>
										<Tooltip {...TT} formatter={(v: any) => fmt(v)} />
										<Legend
											iconType="circle"
											iconSize={8}
											wrapperStyle={{ fontSize: 10, color: "#94a3b8" }}
										/>
									</PieChart>
								</ResponsiveContainer>
							) : (
								<div className="flex items-center justify-center h-[220px] text-slate-500 text-sm">
									No data yet
								</div>
							)}
						</div>
					</div>

					{budgets.length > 0 && (
						<div className="card">
							<h3 className="font-semibold text-white mb-4">
								Budget Utilisation
							</h3>
							<ResponsiveContainer width="100%" height={180}>
								<BarChart
									data={budgets.slice(0, 8).map((b: any) => ({
										name: (b.name || "").slice(0, 16),
										used: parseFloat(b.used_amount || 0),
										remaining: Math.max(
											0,
											parseFloat(b.total_amount || 0) -
												parseFloat(b.used_amount || 0),
										),
									}))}>
									<CartesianGrid strokeDasharray="3 3" stroke="#252d42" />
									<XAxis
										dataKey="name"
										tick={{ fill: "#64748b", fontSize: 9 }}
										tickLine={false}
									/>
									<YAxis
										tick={{ fill: "#64748b", fontSize: 10 }}
										tickLine={false}
										axisLine={false}
									/>
									<Tooltip {...TT} />
									<Bar dataKey="used" stackId="a" fill="#ef4444" name="Used" />
									<Bar
										dataKey="remaining"
										stackId="a"
										fill="#22c55e"
										name="Remaining"
										radius={[4, 4, 0, 0]}
									/>
								</BarChart>
							</ResponsiveContainer>
						</div>
					)}

					<div className="card">
						<h3 className="font-semibold text-white mb-4">Recent Expenses</h3>
						<ExpensesTable
							expenses={expenses.slice(0, 8)}
							onAction={expenseAction.mutate}
						/>
					</div>
				</div>
			)}

			{/* ── BUDGETS ── */}
			{activeTab === "budgets" && (
				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<h3 className="font-semibold text-white">All Budgets</h3>
						<div className="flex gap-2">
							<button
								onClick={() =>
									exportCSV(`${API_BASE}/finance/budgets/`, "budgets.csv")
								}
								className="btn-secondary btn-sm">
								<Download size={13} /> Export
							</button>
							<button
								onClick={() => setShowBudgetModal(true)}
								className="btn-primary btn-sm">
								<Plus size={13} /> New Budget
							</button>
						</div>
					</div>
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{budgets.length === 0 ? (
							<div className="col-span-3 card text-center py-12 text-slate-500">
								<DollarSign size={32} className="mx-auto mb-3 opacity-30" /> No
								budgets yet
							</div>
						) : (
							budgets.map((b: any) => {
								const used = parseFloat(b.used_amount || 0);
								const total = parseFloat(b.total_amount || 1);
								const remaining = parseFloat(
									b.remaining_amount ?? String(total - used),
								);
								const pct = Math.min(100, Math.round((used / total) * 100));
								const isOver = used > total;
								return (
									<div
										key={b.id}
										className={clsx(
											"card space-y-3",
											isOver && "border-red-500/40",
										)}>
										<div className="flex items-start justify-between">
											<div>
												<h3 className="font-semibold text-white text-sm">
													{b.name}
												</h3>
												<p className="text-xs text-slate-500">
													{b.department || b.period || "—"}
												</p>
											</div>
											{isOver && (
												<span className="badge badge-red text-[10px]">
													Over Budget
												</span>
											)}
										</div>
										{/* Three numbers */}
										<div className="grid grid-cols-3 gap-2 text-center">
											<div>
												<div className="text-xs text-slate-500">Allocated</div>
												<div className="text-white font-medium text-xs">
													{fmt(total)}
												</div>
											</div>
											<div>
												<div className="text-xs text-slate-500">Spent</div>
												<div className="text-red-400 font-medium text-xs">
													{fmt(used)}
												</div>
											</div>
											<div>
												<div className="text-xs text-slate-500">Remaining</div>
												<div
													className={clsx(
														"font-medium text-xs",
														isOver ? "text-red-400" : "text-green-400",
													)}>
													{fmt(remaining)}
												</div>
											</div>
										</div>
										{/* Progress bar */}
										<div className="h-2 bg-surface-elevated rounded-full overflow-hidden">
											<div
												className={clsx(
													"h-full rounded-full transition-all",
													pct < 70
														? "bg-green-500"
														: pct < 90
															? "bg-amber-500"
															: "bg-red-500",
												)}
												style={{ width: pct + "%" }}
											/>
										</div>
										<div className="flex items-center justify-between">
											<span className="text-xs text-slate-500">
												{pct}% utilised
											</span>
											{b.start_date && b.end_date && (
												<span className="text-xs text-slate-600">
													{format(parseISO(b.start_date), "dd MMM")} –{" "}
													{format(parseISO(b.end_date), "dd MMM yyyy")}
												</span>
											)}
										</div>
									</div>
								);
							})
						)}
					</div>
				</div>
			)}

			{/* ── EXPENSES ── */}
			{activeTab === "expenses" && (
				<div className="card">
					<div className="flex items-center justify-between mb-5">
						<h3 className="font-semibold text-white">All Expenses</h3>
						<div className="flex gap-2">
							<button
								onClick={() =>
									exportCSV(`${API_BASE}/finance/expenses/`, "expenses.csv")
								}
								className="btn-secondary btn-sm">
								<Download size={13} /> Export CSV
							</button>
							<button
								onClick={() => setShowExpenseModal(true)}
								className="btn-primary btn-sm">
								<Plus size={13} /> Log Expense
							</button>
						</div>
					</div>
					<ExpensesTable expenses={expenses} onAction={expenseAction.mutate} />
				</div>
			)}

			{/* ── INVOICES ── */}
			{activeTab === "invoices" && (
				<div className="card">
					<div className="flex items-center justify-between mb-5">
						<h3 className="font-semibold text-white">Invoices</h3>
						<div className="flex gap-2">
							<button
								onClick={() =>
									exportCSV(`${API_BASE}/finance/invoices/`, "invoices.csv")
								}
								className="btn-secondary btn-sm">
								<Download size={13} /> Export
							</button>
							<button
								onClick={() => setShowInvoiceModal(true)}
								className="btn-primary btn-sm">
								<Plus size={13} /> New Invoice
							</button>
						</div>
					</div>
					{invoices.length === 0 ? (
						<div className="text-center py-12 text-slate-500">
							<FileText size={32} className="mx-auto mb-3 opacity-30" /> No
							invoices yet
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="data-table">
								<thead>
									<tr>
										<th>Invoice #</th>
										<th>Vendor / Client</th>
										<th>Amount</th>
										<th>Issue Date</th>
										<th>Due Date</th>
										<th>Status</th>
										<th>Actions</th>
									</tr>
								</thead>
								<tbody>
									{invoices.map((inv: any) => {
										const overdue =
											inv.due_date &&
											isPast(parseISO(inv.due_date)) &&
											inv.status !== "paid";
										const displayStatus =
											overdue && inv.status !== "paid" ? "overdue" : inv.status;
										return (
											<tr
												key={inv.id}
												className={clsx(overdue && "bg-red-500/5")}>
												<td className="font-mono text-xs text-nexus-400">
													{inv.invoice_number || inv.id?.slice(0, 8)}
												</td>
												<td className="text-white font-medium text-sm">
													{inv.vendor || "—"}
												</td>
												<td className="text-white font-medium">
													{fmt(inv.amount)}
												</td>
												<td className="text-slate-400 text-xs">
													{inv.issue_date
														? format(parseISO(inv.issue_date), "dd MMM yyyy")
														: "—"}
												</td>
												<td
													className={clsx(
														"text-xs",
														overdue
															? "text-red-400 font-medium"
															: "text-slate-400",
													)}>
													{inv.due_date
														? format(parseISO(inv.due_date), "dd MMM yyyy")
														: "—"}
													{overdue && " ⚠"}
												</td>
												<td>
													<StatusBadge status={displayStatus} />
												</td>
												<td>
													<div className="flex gap-1 flex-wrap">
														{inv.status === "pending" && (
															<>
																<button
																	onClick={() =>
																		invoiceAction.mutate({
																			id: inv.id,
																			action: "approve",
																		})
																	}
																	className="btn-success btn-sm p-1.5"
																	title="Approve">
																	<CheckCircle size={12} />
																</button>
																<button
																	onClick={() =>
																		invoiceAction.mutate({
																			id: inv.id,
																			action: "reject",
																		})
																	}
																	className="btn-danger btn-sm p-1.5"
																	title="Reject">
																	<XCircle size={12} />
																</button>
															</>
														)}
														{inv.status === "approved" && (
															<>
																<button
																	onClick={() =>
																		invoiceAction.mutate({
																			id: inv.id,
																			action: "send",
																		})
																	}
																	className="btn-secondary btn-sm text-xs">
																	<Send size={10} /> Send
																</button>
																<button
																	onClick={() =>
																		invoiceAction.mutate({
																			id: inv.id,
																			action: "mark_paid",
																		})
																	}
																	className="btn-success btn-sm text-xs">
																	<CheckCircle size={10} /> Paid
																</button>
															</>
														)}
														{inv.status === "sent" && (
															<button
																onClick={() =>
																	invoiceAction.mutate({
																		id: inv.id,
																		action: "mark_paid",
																	})
																}
																className="btn-success btn-sm text-xs">
																<CheckCircle size={10} /> Mark Paid
															</button>
														)}
														{overdue && inv.status !== "paid" && (
															<button
																onClick={() =>
																	invoiceAction.mutate({
																		id: inv.id,
																		action: "mark_overdue",
																	})
																}
																className="btn-danger btn-sm text-xs">
																Flag Overdue
															</button>
														)}
													</div>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}

			{/* ── PAYROLL ── */}
			{activeTab === "payroll" && (
				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<h3 className="font-semibold text-white">Payroll Management</h3>
						<div className="flex gap-2">
							<button
								onClick={() =>
									exportCSV(`${API_BASE}/finance/payroll/`, "payroll.csv")
								}
								className="btn-secondary btn-sm">
								<Download size={13} /> Export
							</button>
							<button
								onClick={() => setShowPayrollModal(true)}
								className="btn-primary btn-sm">
								<RefreshCw size={13} /> Process Payroll
							</button>
						</div>
					</div>

					{/* Summary */}
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
						{[
							{
								label: "Total Gross",
								value: fmt(
									payroll.reduce(
										(s: number, p: any) => s + parseFloat(p.gross_pay || 0),
										0,
									),
								),
								color: "text-white",
							},
							{
								label: "Total Deductions",
								value: fmt(
									payroll.reduce(
										(s: number, p: any) => s + parseFloat(p.deductions || 0),
										0,
									),
								),
								color: "text-red-400",
							},
							{
								label: "Total Net Pay",
								value: fmt(totalPayroll),
								color: "text-green-400",
							},
							{
								label: "Staff Count",
								value: payroll.length + " employees",
								color: "text-blue-400",
							},
						].map(({ label, value, color }) => (
							<div key={label} className="stat-card">
								<div className={clsx("text-xl font-bold", color)}>{value}</div>
								<div className="stat-label">{label}</div>
							</div>
						))}
					</div>

					{/* Payroll result panel (shown after processing) */}
					{payrollResult && (
						<div className="card border-green-500/30 space-y-4">
							<div className="flex items-start justify-between">
								<div>
									<h4 className="font-semibold text-green-400 flex items-center gap-2">
										<Mail size={16} /> Payroll Processed
									</h4>
									<p className="text-slate-400 text-sm mt-1">
										{payrollResult.detail}
									</p>
									<p className="text-slate-500 text-xs">
										Period: {payrollResult.period} · Pay Date:{" "}
										{payrollResult.pay_date}
									</p>
								</div>
								<button
									onClick={() => setPayrollResult(null)}
									className="btn-secondary btn-sm text-xs">
									Dismiss
								</button>
							</div>
							{payrollResult.records?.length > 0 && (
								<table className="data-table">
									<thead>
										<tr>
											<th>Employee</th>
											<th>Department</th>
											<th>Gross</th>
											<th>Deductions</th>
											<th>Net Pay</th>
											<th>Method</th>
											<th>Status</th>
										</tr>
									</thead>
									<tbody>
										{payrollResult.records.map((p: any) => (
											<tr key={p.id}>
												<td className="text-white font-medium text-sm">
													{p.employee_name || "—"}
												</td>
												<td className="text-slate-400 text-sm">
													{p.department || "—"}
												</td>
												<td className="text-white">{fmt(p.gross_pay)}</td>
												<td className="text-red-400">{fmt(p.deductions)}</td>
												<td className="text-green-400 font-medium">
													{fmt(p.net_pay)}
												</td>
												<td className="text-slate-400 text-xs capitalize">
													{p.payment_method?.replace("_", " ")}
												</td>
												<td>
													<StatusBadge status={p.status} />
												</td>
											</tr>
										))}
									</tbody>
								</table>
							)}
						</div>
					)}

					{/* All payroll records */}
					{payroll.length === 0 ? (
						<div className="card text-center py-12 text-slate-500">
							<Users size={32} className="mx-auto mb-3 opacity-30" /> No payroll
							records
						</div>
					) : (
						<div className="card">
							<table className="data-table">
								<thead>
									<tr>
										<th>Employee</th>
										<th>Department</th>
										<th>Period</th>
										<th>Gross</th>
										<th>Deductions</th>
										<th>Net Pay</th>
										<th>Method</th>
										<th>Status</th>
										<th>Payslip</th>
									</tr>
								</thead>
								<tbody>
									{payroll.map((p: any) => (
										<tr key={p.id}>
											<td className="text-white font-medium text-sm">
												{p.employee_name || "—"}
											</td>
											<td className="text-slate-400 text-sm">
												{p.department || "—"}
											</td>
											<td className="text-slate-400 text-xs">
												{p.period || "—"}
											</td>
											<td className="text-white">{fmt(p.gross_pay)}</td>
											<td className="text-red-400">{fmt(p.deductions)}</td>
											<td className="text-green-400 font-medium">
												{fmt(p.net_pay)}
											</td>
											<td className="text-slate-400 text-xs capitalize">
												{p.payment_method?.replace("_", " ") || "—"}
											</td>
											<td>
												<StatusBadge status={p.status} />
											</td>
											<td>
												<button
													onClick={() =>
														exportCSV(
															`${API_BASE}/finance/payroll/${p.id}/payslip/`,
															`payslip_${p.employee_name}.csv`,
														)
													}
													className="btn-secondary btn-sm text-xs p-1.5">
													<Download size={11} />
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}

			{/* ── PETTY CASH ── */}
			{activeTab === "petty-cash" && (
				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<h3 className="font-semibold text-white">Petty Cash</h3>
						<div className="flex gap-2">
							<button
								onClick={() =>
									exportCSV(`${API_BASE}/finance/petty-cash/`, "petty_cash.csv")
								}
								className="btn-secondary btn-sm">
								<Download size={13} /> Export
							</button>
							<button
								onClick={() => setShowPettyCashModal(true)}
								className="btn-primary btn-sm">
								<Plus size={13} /> New Request
							</button>
						</div>
					</div>
					{pettyQ.data?.fund && (
						<div className="grid grid-cols-3 gap-4">
							{[
								{
									label: "Opening Balance",
									value: fmt(pettyQ.data.fund.opening_balance),
									color: "text-white",
									icon: PiggyBank,
								},
								{
									label: "Total Disbursed",
									value: fmt(pettyQ.data.fund.total_disbursed),
									color: "text-red-400",
									icon: TrendingDown,
								},
								{
									label: "Closing Balance",
									value: fmt(pettyQ.data.fund.closing_balance),
									color: "text-green-400",
									icon: DollarSign,
								},
							].map(({ label, value, color, icon: Icon }) => (
								<div key={label} className="stat-card">
									<Icon size={18} className={color} />
									<div className={clsx("text-xl font-bold", color)}>
										{value}
									</div>
									<div className="stat-label">{label}</div>
								</div>
							))}
						</div>
					)}
					{pettyCash.length === 0 ? (
						<div className="card text-center py-12 text-slate-500">
							<Receipt size={32} className="mx-auto mb-3 opacity-30" /> No petty
							cash records
						</div>
					) : (
						<div className="card">
							<table className="data-table">
								<thead>
									<tr>
										<th>Description</th>
										<th>Requested By</th>
										<th>Amount</th>
										<th>Date</th>
										<th>Receipt #</th>
										<th>Status</th>
										<th>Actions</th>
									</tr>
								</thead>
								<tbody>
									{pettyCash.map((pc: any) => (
										<tr key={pc.id}>
											<td className="text-white font-medium text-sm">
												{pc.description}
											</td>
											<td className="text-slate-400 text-sm">
												{pc.requested_by_name || "—"}
											</td>
											<td className="text-white font-medium">
												{fmt(pc.amount)}
											</td>
											<td className="text-slate-400 text-xs">
												{pc.date
													? format(parseISO(pc.date), "dd MMM yyyy")
													: "—"}
											</td>
											<td className="text-slate-400 text-xs font-mono">
												{pc.receipt_number || "—"}
											</td>
											<td>
												<StatusBadge status={pc.status} />
											</td>
											<td>
												{pc.status === "pending" && (
													<div className="flex gap-1">
														<button
															onClick={() =>
																financeApi
																	.approvePettyCash(pc.id, {
																		action: "approve",
																	})
																	.then(() => {
																		invalidate("petty-cash");
																		toast.success("Approved");
																	})
															}
															className="btn-success btn-sm p-1.5">
															<CheckCircle size={12} />
														</button>
														<button
															onClick={() =>
																financeApi
																	.approvePettyCash(pc.id, { action: "reject" })
																	.then(() => {
																		invalidate("petty-cash");
																		toast.success("Rejected");
																	})
															}
															className="btn-danger btn-sm p-1.5">
															<XCircle size={12} />
														</button>
													</div>
												)}
												{pc.status === "approved" && (
													<button
														onClick={() =>
															financeApi
																.approvePettyCash(pc.id, { action: "disburse" })
																.then(() => {
																	invalidate("petty-cash");
																	toast.success("Disbursed");
																})
														}
														className="btn-primary btn-sm text-xs">
														Disburse
													</button>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}

			{/* ── PURCHASE ORDERS ── */}
			{activeTab === "purchase-orders" && (
				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<h3 className="font-semibold text-white">Purchase Orders</h3>
						<div className="flex gap-2">
							<button
								onClick={() =>
									exportCSV(
										`${API_BASE}/finance/purchase-orders/`,
										"purchase_orders.csv",
									)
								}
								className="btn-secondary btn-sm">
								<Download size={13} /> Export
							</button>
							<button
								onClick={() => setShowPOModal(true)}
								className="btn-primary btn-sm">
								<Plus size={13} /> New PO
							</button>
						</div>
					</div>
					{poQ.isLoading ? (
						<div className="card text-center py-12 text-slate-500">
							Loading purchase orders…
						</div>
					) : poQ.isError ? (
						<div className="card text-center py-12 text-red-400">
							<AlertTriangle size={32} className="mx-auto mb-3" /> Failed to
							load purchase orders.
							<button
								onClick={() => poQ.refetch()}
								className="btn-secondary btn-sm mt-3 mx-auto block">
								Retry
							</button>
						</div>
					) : purchaseOrders.length === 0 ? (
						<div className="card text-center py-12 text-slate-500">
							<ShoppingCart size={32} className="mx-auto mb-3 opacity-30" /> No
							purchase orders yet
						</div>
					) : (
						<div className="card overflow-x-auto">
							<table className="data-table">
								<thead>
									<tr>
										<th>PO #</th>
										<th>Supplier</th>
										<th>Description</th>
										<th>Amount</th>
										<th>Requested By</th>
										<th>Date</th>
										<th>Status</th>
										<th>Actions</th>
									</tr>
								</thead>
								<tbody>
									{purchaseOrders.map((po: any) => (
										<tr key={po.id}>
											<td className="font-mono text-xs text-nexus-400">
												{po.po_number || po.id?.slice(0, 8)}
											</td>
											<td className="text-white font-medium text-sm">
												{po.supplier || "—"}
											</td>
											<td className="text-slate-400 text-sm max-w-[200px] truncate">
												{po.description || "—"}
											</td>
											<td className="text-white font-medium">
												{fmt(po.amount)}
											</td>
											<td className="text-slate-400 text-sm">
												{po.requested_by_name || "—"}
											</td>
											<td className="text-slate-400 text-xs">
												{po.created_at
													? format(parseISO(po.created_at), "dd MMM yyyy")
													: "—"}
											</td>
											<td>
												<StatusBadge status={po.status} />
											</td>
											<td>
												<div className="flex gap-1">
													{po.status === "pending" && (
														<>
															<button
																onClick={() =>
																	poAction.mutate({
																		id: po.id,
																		action: "approve",
																	})
																}
																className="btn-success btn-sm p-1.5">
																<CheckCircle size={12} />
															</button>
															<button
																onClick={() =>
																	poAction.mutate({
																		id: po.id,
																		action: "reject",
																	})
																}
																className="btn-danger btn-sm p-1.5">
																<XCircle size={12} />
															</button>
														</>
													)}
													{po.status === "approved" && (
														<button
															onClick={() =>
																poAction.mutate({
																	id: po.id,
																	action: "deliver",
																})
															}
															className="btn-secondary btn-sm text-xs">
															Mark Delivered
														</button>
													)}
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}

			{/* ── PAYMENTS ── */}
			{activeTab === "payments" && (
				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<h3 className="font-semibold text-white">Payments</h3>
						<div className="flex gap-2">
							<button
								onClick={() =>
									exportCSV(`${API_BASE}/finance/payments/`, "payments.csv")
								}
								className="btn-secondary btn-sm">
								<Download size={13} /> Export
							</button>
							<button
								onClick={() => setShowPaymentModal(true)}
								className="btn-primary btn-sm">
								<Plus size={13} /> Record Payment
							</button>
						</div>
					</div>
					{paymentsQ.isLoading && (
						<div className="card text-center py-12 text-slate-500">
							Loading payments…
						</div>
					)}
					{paymentsQ.isError && (
						<div className="card text-center py-12 text-red-400">
							<AlertTriangle size={32} className="mx-auto mb-3" />
							Failed to load payments.
							<button
								onClick={() => paymentsQ.refetch()}
								className="btn-secondary btn-sm mt-3 mx-auto block">
								Retry
							</button>
						</div>
					)}
					{!paymentsQ.isLoading && !paymentsQ.isError && (
						<>
							<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
								{[
									{
										label: "Total Outgoing",
										value: fmt(
											payments
												.filter((p: any) => p.type === "outgoing" || !p.type)
												.reduce(
													(s: number, p: any) => s + parseFloat(p.amount || 0),
													0,
												),
										),
										color: "text-red-400",
									},
									{
										label: "Total Incoming",
										value: fmt(
											payments
												.filter((p: any) => p.type === "incoming")
												.reduce(
													(s: number, p: any) => s + parseFloat(p.amount || 0),
													0,
												),
										),
										color: "text-green-400",
									},
									{
										label: "M-Pesa",
										value:
											payments.filter((p: any) => p.method === "mpesa").length +
											" txns",
										color: "text-green-400",
									},
									{
										label: "Bank Transfers",
										value:
											payments.filter((p: any) => p.method === "bank_transfer")
												.length + " txns",
										color: "text-blue-400",
									},
								].map(({ label, value, color }) => (
									<div key={label} className="stat-card">
										<div className={clsx("text-xl font-bold", color)}>
											{value}
										</div>
										<div className="stat-label">{label}</div>
									</div>
								))}
							</div>
							{payments.length === 0 ? (
								<div className="card text-center py-12 text-slate-500">
									<CreditCard size={32} className="mx-auto mb-3 opacity-30" />{" "}
									No payments yet
								</div>
							) : (
								<div className="card overflow-x-auto">
									<table className="data-table">
										<thead>
											<tr>
												<th>Reference</th>
												<th>Payee / Payer</th>
												<th>Amount</th>
												<th>Method</th>
												<th>Type</th>
												<th>Date</th>
												<th>Status</th>
												<th>Actions</th>
											</tr>
										</thead>
										<tbody>
											{payments.map((p: any) => (
												<tr key={p.id}>
													<td className="font-mono text-xs text-nexus-400">
														{p.reference || p.id?.slice(0, 8)}
													</td>
													<td className="text-white font-medium text-sm">
														{p.payee || "—"}
													</td>
													<td
														className={clsx(
															"font-medium",
															p.type === "incoming"
																? "text-green-400"
																: "text-red-400",
														)}>
														{p.type === "incoming" ? "+" : "-"}
														{fmt(p.amount)}
													</td>
													<td className="text-slate-400 text-sm capitalize">
														{p.method?.replace("_", " ") || "—"}
													</td>
													<td>
														<StatusBadge status={p.type || "outgoing"} />
													</td>
													<td className="text-slate-400 text-xs">
														{p.payment_date
															? format(parseISO(p.payment_date), "dd MMM yyyy")
															: "—"}
													</td>
													<td>
														<StatusBadge status={p.status} />
													</td>
													<td>
														<button
															onClick={() => {
																if (window.confirm("Delete this payment?"))
																	deletePayment.mutate(p.id);
															}}
															className="btn-danger btn-sm p-1.5">
															<Trash2 size={12} />
														</button>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</>
					)}
				</div>
			)}

			{/* ── REPORTS ── */}
			{activeTab === "reports" && (
				<ReportsTab
					reportsQ={reportsQ}
					reports={reports}
					invalidate={invalidate}
				/>
			)}

			{/* ── STIPENDS ── */}
			{activeTab === "stipends" && (
				<div className="card">
					<div className="flex items-center justify-between mb-5">
						<h3 className="font-semibold text-white">Stipend Management</h3>
						<div className="flex gap-2">
							<button
								onClick={() =>
									exportCSV(`${API_BASE}/finance/stipends/`, "stipends.csv")
								}
								className="btn-secondary btn-sm">
								<Download size={13} /> Export
							</button>
							<button
								onClick={() => setShowStipendModal(true)}
								className="btn-primary btn-sm">
								<Plus size={13} /> Add Stipend
							</button>
						</div>
					</div>
					{stipendsQ.isLoading && (
						<div className="text-center py-12 text-slate-500">
							Loading stipends…
						</div>
					)}
					{stipendsQ.isError && (
						<div className="text-center py-12 text-red-400">
							<AlertTriangle size={32} className="mx-auto mb-3" />
							Failed to load stipends.
							<button
								onClick={() => stipendsQ.refetch()}
								className="btn-secondary btn-sm mt-3 mx-auto block">
								Retry
							</button>
						</div>
					)}
					{!stipendsQ.isLoading && !stipendsQ.isError && (
						<>
							{/* Summary */}
							<div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
								{[
									{
										label: "Total Stipends",
										value: fmt(
											stipends.reduce(
												(s: number, x: any) => s + parseFloat(x.amount || 0),
												0,
											),
										),
										color: "text-white",
									},
									{
										label: "Pending",
										value: stipends.filter((s: any) => s.status === "pending")
											.length,
										color: "text-amber-400",
									},
									{
										label: "Processed",
										value: stipends.filter((s: any) => s.status === "processed")
											.length,
										color: "text-green-400",
									},
									{
										label: "Attachees",
										value: stipends.length,
										color: "text-blue-400",
									},
								].map(({ label, value, color }) => (
									<div key={label} className="stat-card">
										<div className={clsx("text-xl font-bold", color)}>
											{value}
										</div>
										<div className="stat-label">{label}</div>
									</div>
								))}
							</div>
							{stipends.length === 0 ? (
								<div className="text-center py-12 text-slate-500">
									<Briefcase size={32} className="mx-auto mb-3 opacity-30" /> No
									stipend records
								</div>
							) : (
								<table className="data-table">
									<thead>
										<tr>
											<th>Attachee</th>
											<th>Department</th>
											<th>Amount</th>
											<th>Period</th>
											<th>Dates</th>
											<th>Method</th>
											<th>Status</th>
											<th>Actions</th>
										</tr>
									</thead>
									<tbody>
										{stipends.map((s: any) => (
											<tr key={s.id}>
												<td className="text-white font-medium text-sm">
													{s.attachee_name || "—"}
												</td>
												<td className="text-slate-400 text-sm">
													{s.department || "—"}
												</td>
												<td className="text-white font-medium">
													{fmt(s.amount)}
												</td>
												<td className="text-slate-400 text-xs">
													{s.period || "—"}
												</td>
												<td className="text-slate-400 text-xs">
													{s.start_date && s.end_date
														? `${format(parseISO(s.start_date), "dd MMM")} – ${format(parseISO(s.end_date), "dd MMM yyyy")}`
														: "—"}
												</td>
												<td className="text-slate-400 text-xs capitalize">
													{s.payment_method?.replace("_", " ") || "—"}
												</td>
												<td>
													<StatusBadge status={s.status} />
												</td>
												<td>
													{(s.status === "pending" ||
														s.status === "approved") && (
														<button
															onClick={() => stipendProcess.mutate(s.id)}
															disabled={stipendProcess.isPending}
															className="btn-primary btn-sm text-xs">
															<Send size={11} /> Process
														</button>
													)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							)}
						</>
					)}
				</div>
			)}

			{/* ── MODALS ── */}
			{showExpenseModal && (
				<ExpenseModal
					budgets={budgets}
					onClose={() => setShowExpenseModal(false)}
					onSuccess={() => {
						invalidate("expenses");
						invalidate("budgets");
						setShowExpenseModal(false);
					}}
				/>
			)}
			{showBudgetModal && (
				<BudgetModal
					onClose={() => setShowBudgetModal(false)}
					onSuccess={() => {
						invalidate("budgets");
						setShowBudgetModal(false);
					}}
				/>
			)}
			{showInvoiceModal && (
				<InvoiceModal
					onClose={() => setShowInvoiceModal(false)}
					onSuccess={() => {
						invalidate("invoices");
						setShowInvoiceModal(false);
					}}
				/>
			)}
			{showPOModal && (
				<PurchaseOrderModal
					budgets={budgets}
					onClose={() => setShowPOModal(false)}
					onSuccess={() => {
						invalidate("purchase-orders");
						setShowPOModal(false);
					}}
				/>
			)}
			{showPettyCashModal && (
				<PettyCashModal
					onClose={() => setShowPettyCashModal(false)}
					onSuccess={() => {
						invalidate("petty-cash");
						setShowPettyCashModal(false);
					}}
				/>
			)}
			{showPaymentModal && (
				<PaymentModal
					onClose={() => setShowPaymentModal(false)}
					onSuccess={() => {
						invalidate("payments");
						setShowPaymentModal(false);
					}}
				/>
			)}
			{showStipendModal && (
				<StipendModal
					onClose={() => setShowStipendModal(false)}
					onSuccess={() => {
						invalidate("stipends");
						setShowStipendModal(false);
					}}
				/>
			)}
			{showPayrollModal && (
				<PayrollProcessModal
					onClose={() => setShowPayrollModal(false)}
					onSubmit={(d: any) => processPayroll.mutate(d)}
					isLoading={processPayroll.isPending}
				/>
			)}
		</div>
	);
}

// ─── Reports Tab (extracted to avoid blank-page on load) ─────────────────────
function ReportsTab({ reportsQ, reports, invalidate }: any) {
	const [generating, setGenerating] = useState<string | null>(null);

	const REPORT_TYPES = [
		{ label: "Income Statement", icon: TrendingUp, action: "income_statement" },
		{ label: "Balance Sheet", icon: BarChart3, action: "balance_sheet" },
		{ label: "Cash Flow Report", icon: Activity, action: "cash_flow" },
		{ label: "Expense Report", icon: Receipt, action: "expense_report" },
	];

	function handleGenerate(type: string, label: string) {
		setGenerating(type);
		financeApi
			.generateReport({ type })
			.then(() => {
				invalidate("fin-reports");
				toast.success(`${label} generated`);
			})
			.catch(() => toast.error("Generation failed"))
			.finally(() => setGenerating(null));
	}

	return (
		<div className="space-y-4">
			<h3 className="font-semibold text-white">Financial Reports</h3>

			{/* One-click generate cards */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
				{REPORT_TYPES.map(({ label, icon: Icon, action }) => (
					<button
						key={action}
						onClick={() => handleGenerate(action, label)}
						disabled={generating === action}
						className="card hover:border-nexus-500/50 transition-all text-left cursor-pointer disabled:opacity-60">
						<Icon size={22} className="text-nexus-400 mb-2" />
						<div className="font-medium text-white text-sm">{label}</div>
						<div className="text-xs text-slate-500 mt-1">
							{generating === action ? "Generating…" : "Click to generate"}
						</div>
					</button>
				))}
			</div>

			{/* Loading / error */}
			{reportsQ.isLoading && (
				<div className="card text-center py-12 text-slate-500">
					Loading reports…
				</div>
			)}
			{reportsQ.isError && (
				<div className="card text-center py-12 text-red-400">
					<AlertTriangle size={32} className="mx-auto mb-3" />
					Failed to load reports.
					<button
						onClick={() => reportsQ.refetch()}
						className="btn-secondary btn-sm mt-3 mx-auto block">
						Retry
					</button>
				</div>
			)}

			{/* Reports list */}
			{!reportsQ.isLoading &&
				!reportsQ.isError &&
				(reports.length === 0 ? (
					<div className="card text-center py-12 text-slate-500">
						<FileText size={32} className="mx-auto mb-3 opacity-30" /> No
						reports generated yet
					</div>
				) : (
					<div className="card overflow-x-auto">
						<table className="data-table">
							<thead>
								<tr>
									<th>Report Name</th>
									<th>Type</th>
									<th>Period</th>
									<th>Generated By</th>
									<th>Date</th>
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{reports.map((r: any) => (
									<tr key={r.id}>
										<td className="text-white font-medium text-sm">
											{r.name || "—"}
										</td>
										<td className="text-slate-400 text-sm capitalize">
											{r.type?.replace(/_/g, " ") || "—"}
										</td>
										<td className="text-slate-400 text-xs">
											{r.period || "—"}
										</td>
										<td className="text-slate-400 text-sm">
											{r.generated_by_name || "—"}
										</td>
										<td className="text-slate-400 text-xs">
											{r.created_at
												? format(parseISO(r.created_at), "dd MMM yyyy HH:mm")
												: "—"}
										</td>
										<td>
											{r.file_url ? (
												<button
													onClick={() => window.open(r.file_url, "_blank")}
													className="btn-secondary btn-sm text-xs">
													<Download size={11} /> Download
												</button>
											) : (
												<span className="text-slate-600 text-xs italic">
													No file
												</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				))}
		</div>
	);
}

// ─── Shared table ─────────────────────────────────────────────────────────────
function ExpensesTable({
	expenses,
	onAction,
}: {
	expenses: any[];
	onAction: (v: any) => void;
}) {
	if (!expenses.length)
		return (
			<div className="text-center py-10 text-slate-500">No expenses found</div>
		);
	return (
		<div className="overflow-x-auto">
			<table className="data-table">
				<thead>
					<tr>
						<th>Title</th>
						<th>Amount</th>
						<th>Category</th>
						<th>Budget</th>
						<th>Submitted By</th>
						<th>Date</th>
						<th>Status</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{expenses.map((e: any) => (
						<tr key={e.id}>
							<td className="text-white font-medium text-sm">{e.title}</td>
							<td className="text-white font-medium">{fmt(e.amount)}</td>
							<td className="text-slate-400 text-sm capitalize">
								{e.category?.replace("_", " ") || "—"}
							</td>
							<td className="text-slate-400 text-xs">{e.budget_name || "—"}</td>
							<td className="text-slate-400 text-sm">
								{e.submitted_by_name || "—"}
							</td>
							<td className="text-slate-400 text-xs">
								{e.created_at
									? format(parseISO(e.created_at), "dd MMM yyyy")
									: "—"}
							</td>
							<td>
								<StatusBadge status={e.status} />
							</td>
							<td>
								{e.status === "pending" && (
									<div className="flex gap-1">
										<button
											onClick={() => onAction({ id: e.id, action: "approve" })}
											className="btn-success btn-sm p-1.5"
											title="Approve">
											<CheckCircle size={12} />
										</button>
										<button
											onClick={() => onAction({ id: e.id, action: "reject" })}
											className="btn-danger btn-sm p-1.5"
											title="Reject">
											<XCircle size={12} />
										</button>
									</div>
								)}
								{e.status === "approved" && (
									<button
										onClick={() => onAction({ id: e.id, action: "mark_paid" })}
										className="btn-secondary btn-sm text-xs">
										Mark Paid
									</button>
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

// ─── Modal Shell ──────────────────────────────────────────────────────────────
function ModalShell({
	title,
	onClose,
	children,
}: {
	title: string;
	onClose: () => void;
	children: React.ReactNode;
}) {
	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-box" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h3 className="font-semibold text-white">{title}</h3>
				</div>
				{children}
			</div>
		</div>
	);
}

// ─── Budget Insufficient alert ────────────────────────────────────────────────
function BudgetAlert({ error }: { error: any }) {
	const d = error?.response?.data;
	if (!d || d.code !== "budget_exceeded") return null;
	return (
		<div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm space-y-1">
			<div className="flex items-center gap-2 text-red-400 font-medium">
				<AlertTriangle size={14} /> Insufficient Budget
			</div>
			<p className="text-red-300 text-xs">{d.detail}</p>
			<div className="flex gap-4 text-xs text-slate-400 mt-1">
				<span>
					Requested: <span className="text-white">{fmt(d.requested)}</span>
				</span>
				<span>
					Available: <span className="text-green-400">{fmt(d.available)}</span>
				</span>
			</div>
		</div>
	);
}

// ─── Expense Modal ────────────────────────────────────────────────────────────
function ExpenseModal({
	budgets,
	onClose,
	onSuccess,
}: {
	budgets: any[];
	onClose: () => void;
	onSuccess: () => void;
}) {
	const { register, handleSubmit, watch } = useForm();
	const mutation = useMutation({
		mutationFn: (data: any) => financeApi.submitExpense(data),
		onSuccess: () => {
			toast.success("Expense submitted");
			onSuccess();
		},
		onError: (e: any) => {
			const d = e?.response?.data;
			if (d?.code === "budget_exceeded") return; // shown inline
			toast.error(d?.detail || "Failed to submit expense");
		},
	});

	const selectedBudgetId = watch("budget");
	const selectedBudget = budgets.find((b: any) => b.id === selectedBudgetId);

	return (
		<ModalShell title="Log Expense" onClose={onClose}>
			<form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
				<div className="modal-body space-y-4">
					<div className="input-group">
						<label className="input-label">Title *</label>
						<input
							{...register("title", { required: true })}
							className="input"
							placeholder="Expense description"
						/>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="input-group">
							<label className="input-label">Amount (KES) *</label>
							<input
								type="number"
								step="0.01"
								{...register("amount", { required: true, min: 1 })}
								className="input"
							/>
						</div>
						<div className="input-group">
							<label className="input-label">Category</label>
							<select {...register("category")} className="select-input">
								<option value="transport">Transport</option>
								<option value="meals">Meals</option>
								<option value="accommodation">Accommodation</option>
								<option value="supplies">Supplies</option>
								<option value="equipment">Equipment</option>
								<option value="utilities">Utilities</option>
								<option value="maintenance">Maintenance</option>
								<option value="marketing">Marketing</option>
								<option value="other">Other</option>
							</select>
						</div>
					</div>
					{/* Budget dropdown */}
					<div className="input-group">
						<label className="input-label">Budget (optional)</label>
						<select {...register("budget")} className="select-input">
							<option value="">— No budget —</option>
							{budgets.map((b: any) => (
								<option
									key={b.id}
									value={b.id}
									disabled={
										parseFloat(b.remaining_amount ?? b.total_amount) <= 0
									}>
									{b.name} — {fmt(b.remaining_amount ?? b.total_amount)}{" "}
									remaining{" "}
									{parseFloat(b.remaining_amount ?? b.total_amount) <= 0
										? "(depleted)"
										: ""}
								</option>
							))}
						</select>
						{selectedBudget && (
							<div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400">
								<Info size={11} />
								<span>
									{selectedBudget.name}:{" "}
									<span className="text-green-400">
										{fmt(selectedBudget.remaining_amount)} remaining
									</span>{" "}
									of {fmt(selectedBudget.total_amount)}
								</span>
							</div>
						)}
					</div>
					<div className="input-group">
						<label className="input-label">Receipt Date</label>
						<input
							type="date"
							{...register("receipt_date")}
							className="input"
						/>
					</div>
					<div className="input-group">
						<label className="input-label">Description</label>
						<textarea
							{...register("description")}
							rows={2}
							className="textarea"
						/>
					</div>
					{mutation.isError && <BudgetAlert error={mutation.error} />}
				</div>
				<div className="modal-footer">
					<button type="button" onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						type="submit"
						disabled={mutation.isPending}
						className="btn-primary">
						{mutation.isPending ? "Submitting…" : "Submit Expense"}
					</button>
				</div>
			</form>
		</ModalShell>
	);
}

// ─── Budget Modal ─────────────────────────────────────────────────────────────
function BudgetModal({
	onClose,
	onSuccess,
}: {
	onClose: () => void;
	onSuccess: () => void;
}) {
	const { register, handleSubmit } = useForm();
	const mutation = useMutation({
		mutationFn: (data: any) => financeApi.createBudget(data),
		onSuccess: () => {
			toast.success("Budget created");
			onSuccess();
		},
		onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed"),
	});
	return (
		<ModalShell title="Create Budget" onClose={onClose}>
			<form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
				<div className="modal-body space-y-4">
					<div className="input-group">
						<label className="input-label">Budget Name *</label>
						<input
							{...register("name", { required: true })}
							className="input"
							placeholder="e.g. Q3 2025 Operations"
						/>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="input-group">
							<label className="input-label">Total Amount (KES) *</label>
							<input
								type="number"
								step="0.01"
								{...register("total_amount", { required: true })}
								className="input"
							/>
						</div>
						<div className="input-group">
							<label className="input-label">Period</label>
							<input
								{...register("period")}
								className="input"
								placeholder="Q3 2025"
							/>
						</div>
					</div>
					<div className="input-group">
						<label className="input-label">Department</label>
						<input
							{...register("department")}
							className="input"
							placeholder="Department name"
						/>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="input-group">
							<label className="input-label">Start Date</label>
							<input
								type="date"
								{...register("start_date")}
								className="input"
							/>
						</div>
						<div className="input-group">
							<label className="input-label">End Date</label>
							<input type="date" {...register("end_date")} className="input" />
						</div>
					</div>
					<div className="input-group">
						<label className="input-label">Notes</label>
						<textarea {...register("notes")} rows={2} className="textarea" />
					</div>
				</div>
				<div className="modal-footer">
					<button type="button" onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						type="submit"
						disabled={mutation.isPending}
						className="btn-primary">
						{mutation.isPending ? "Creating…" : "Create Budget"}
					</button>
				</div>
			</form>
		</ModalShell>
	);
}

// ─── Invoice Modal ────────────────────────────────────────────────────────────
function InvoiceModal({
	onClose,
	onSuccess,
}: {
	onClose: () => void;
	onSuccess: () => void;
}) {
	const { register, handleSubmit } = useForm();
	const mutation = useMutation({
		mutationFn: (data: any) => financeApi.createInvoice(data),
		onSuccess: () => {
			toast.success("Invoice created");
			onSuccess();
		},
		onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed"),
	});
	return (
		<ModalShell title="New Invoice" onClose={onClose}>
			<form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
				<div className="modal-body space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<div className="input-group">
							<label className="input-label">Invoice Number</label>
							<input
								{...register("invoice_number")}
								className="input"
								placeholder="Auto-generated if blank"
							/>
						</div>
						<div className="input-group">
							<label className="input-label">Type</label>
							<select {...register("invoice_type")} className="select-input">
								<option value="incoming">Incoming (from vendor)</option>
								<option value="outgoing">Outgoing (to client)</option>
							</select>
						</div>
					</div>
					<div className="input-group">
						<label className="input-label">Vendor / Client *</label>
						<input
							{...register("vendor", { required: true })}
							className="input"
							placeholder="Name"
						/>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="input-group">
							<label className="input-label">Amount (KES) *</label>
							<input
								type="number"
								step="0.01"
								{...register("amount", { required: true })}
								className="input"
							/>
						</div>
						<div className="input-group">
							<label className="input-label">Tax (KES)</label>
							<input
								type="number"
								step="0.01"
								{...register("tax_amount")}
								className="input"
								defaultValue={0}
							/>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="input-group">
							<label className="input-label">Issue Date *</label>
							<input
								type="date"
								{...register("issue_date", { required: true })}
								className="input"
							/>
						</div>
						<div className="input-group">
							<label className="input-label">Due Date *</label>
							<input
								type="date"
								{...register("due_date", { required: true })}
								className="input"
							/>
						</div>
					</div>
					<div className="input-group">
						<label className="input-label">Description</label>
						<textarea
							{...register("description")}
							rows={2}
							className="textarea"
						/>
					</div>
				</div>
				<div className="modal-footer">
					<button type="button" onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						type="submit"
						disabled={mutation.isPending}
						className="btn-primary">
						{mutation.isPending ? "Creating…" : "Create Invoice"}
					</button>
				</div>
			</form>
		</ModalShell>
	);
}

// ─── Purchase Order Modal ─────────────────────────────────────────────────────
function PurchaseOrderModal({
	budgets,
	onClose,
	onSuccess,
}: {
	budgets: any[];
	onClose: () => void;
	onSuccess: () => void;
}) {
	const { register, handleSubmit } = useForm();
	const mutation = useMutation({
		mutationFn: (data: any) => financeApi.createPurchaseOrder(data),
		onSuccess: () => {
			toast.success("Purchase order created");
			onSuccess();
		},
		onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed"),
	});
	return (
		<ModalShell title="New Purchase Order" onClose={onClose}>
			<form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
				<div className="modal-body space-y-4">
					<div className="input-group">
						<label className="input-label">Supplier *</label>
						<input
							{...register("supplier", { required: true })}
							className="input"
							placeholder="Supplier name"
						/>
					</div>
					<div className="input-group">
						<label className="input-label">Description *</label>
						<textarea
							{...register("description", { required: true })}
							rows={2}
							className="textarea"
							placeholder="What is being purchased?"
						/>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="input-group">
							<label className="input-label">Amount (KES) *</label>
							<input
								type="number"
								step="0.01"
								{...register("amount", { required: true })}
								className="input"
							/>
						</div>
						<div className="input-group">
							<label className="input-label">Quantity</label>
							<input
								type="number"
								{...register("quantity")}
								className="input"
								defaultValue={1}
							/>
						</div>
					</div>
					<div className="input-group">
						<label className="input-label">Budget</label>
						<select {...register("budget")} className="select-input">
							<option value="">— No budget —</option>
							{budgets.map((b: any) => (
								<option key={b.id} value={b.id}>
									{b.name} — {fmt(b.remaining_amount ?? b.total_amount)}{" "}
									remaining
								</option>
							))}
						</select>
					</div>
					<div className="input-group">
						<label className="input-label">Delivery Date</label>
						<input
							type="date"
							{...register("delivery_date")}
							className="input"
						/>
					</div>
					<div className="input-group">
						<label className="input-label">Justification</label>
						<textarea
							{...register("justification")}
							rows={2}
							className="textarea"
						/>
					</div>
				</div>
				<div className="modal-footer">
					<button type="button" onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						type="submit"
						disabled={mutation.isPending}
						className="btn-primary">
						{mutation.isPending ? "Submitting…" : "Submit PO"}
					</button>
				</div>
			</form>
		</ModalShell>
	);
}

// ─── Petty Cash Modal ─────────────────────────────────────────────────────────
function PettyCashModal({
	onClose,
	onSuccess,
}: {
	onClose: () => void;
	onSuccess: () => void;
}) {
	const { register, handleSubmit } = useForm();
	const mutation = useMutation({
		mutationFn: (data: any) => financeApi.createPettyCash(data),
		onSuccess: () => {
			toast.success("Petty cash request submitted");
			onSuccess();
		},
		onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed"),
	});
	return (
		<ModalShell title="Petty Cash Request" onClose={onClose}>
			<form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
				<div className="modal-body space-y-4">
					<div className="input-group">
						<label className="input-label">Description *</label>
						<input
							{...register("description", { required: true })}
							className="input"
							placeholder="Purpose"
						/>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="input-group">
							<label className="input-label">Amount (KES) *</label>
							<input
								type="number"
								step="0.01"
								{...register("amount", { required: true })}
								className="input"
							/>
						</div>
						<div className="input-group">
							<label className="input-label">Date</label>
							<input type="date" {...register("date")} className="input" />
						</div>
					</div>
					<div className="input-group">
						<label className="input-label">Receipt Number</label>
						<input
							{...register("receipt_number")}
							className="input"
							placeholder="Receipt / voucher #"
						/>
					</div>
					<div className="input-group">
						<label className="input-label">Notes</label>
						<textarea {...register("notes")} rows={2} className="textarea" />
					</div>
				</div>
				<div className="modal-footer">
					<button type="button" onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						type="submit"
						disabled={mutation.isPending}
						className="btn-primary">
						{mutation.isPending ? "Submitting…" : "Submit Request"}
					</button>
				</div>
			</form>
		</ModalShell>
	);
}

// ─── Payment Modal ────────────────────────────────────────────────────────────
function PaymentModal({
	onClose,
	onSuccess,
}: {
	onClose: () => void;
	onSuccess: () => void;
}) {
	const { register, handleSubmit } = useForm();
	const mutation = useMutation({
		mutationFn: (data: any) => financeApi.createPayment(data),
		onSuccess: () => {
			toast.success("Payment recorded");
			onSuccess();
		},
		onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed"),
	});
	return (
		<ModalShell title="Record Payment" onClose={onClose}>
			<form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
				<div className="modal-body space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<div className="input-group">
							<label className="input-label">Type</label>
							<select {...register("type")} className="select-input">
								<option value="outgoing">Outgoing</option>
								<option value="incoming">Incoming</option>
							</select>
						</div>
						<div className="input-group">
							<label className="input-label">Method</label>
							<select {...register("method")} className="select-input">
								<option value="mpesa">M-Pesa</option>
								<option value="bank_transfer">Bank Transfer</option>
								<option value="cash">Cash</option>
								<option value="cheque">Cheque</option>
								<option value="card">Card</option>
							</select>
						</div>
					</div>
					<div className="input-group">
						<label className="input-label">Payee / Payer *</label>
						<input
							{...register("payee", { required: true })}
							className="input"
							placeholder="Name"
						/>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="input-group">
							<label className="input-label">Amount (KES) *</label>
							<input
								type="number"
								step="0.01"
								{...register("amount", { required: true })}
								className="input"
							/>
						</div>
						<div className="input-group">
							<label className="input-label">Payment Date</label>
							<input
								type="date"
								{...register("payment_date")}
								className="input"
							/>
						</div>
					</div>
					<div className="input-group">
						<label className="input-label">Reference / Transaction ID</label>
						<input
							{...register("reference")}
							className="input"
							placeholder="e.g. M-Pesa code"
						/>
					</div>
					<div className="input-group">
						<label className="input-label">Notes</label>
						<textarea {...register("notes")} rows={2} className="textarea" />
					</div>
				</div>
				<div className="modal-footer">
					<button type="button" onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						type="submit"
						disabled={mutation.isPending}
						className="btn-primary">
						{mutation.isPending ? "Recording…" : "Record Payment"}
					</button>
				</div>
			</form>
		</ModalShell>
	);
}

// ─── Stipend Modal ────────────────────────────────────────────────────────────
function StipendModal({
	onClose,
	onSuccess,
}: {
	onClose: () => void;
	onSuccess: () => void;
}) {
	const { register, handleSubmit } = useForm();
	const mutation = useMutation({
		mutationFn: (data: any) => financeApi.createStipend(data),
		onSuccess: () => {
			toast.success("Stipend added");
			onSuccess();
		},
		onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed"),
	});
	return (
		<ModalShell title="Add Stipend" onClose={onClose}>
			<form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
				<div className="modal-body space-y-4">
					<div className="input-group">
						<label className="input-label">Attachee Full Name *</label>
						<input
							{...register("attachee_name", { required: true })}
							className="input"
							placeholder="Full name"
						/>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="input-group">
							<label className="input-label">Amount (KES) *</label>
							<input
								type="number"
								step="0.01"
								{...register("amount", { required: true })}
								className="input"
							/>
						</div>
						<div className="input-group">
							<label className="input-label">Period</label>
							<input
								{...register("period")}
								className="input"
								placeholder="e.g. June 2025"
							/>
						</div>
					</div>
					<div className="input-group">
						<label className="input-label">Department</label>
						<input
							{...register("department")}
							className="input"
							placeholder="Hosting department"
						/>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="input-group">
							<label className="input-label">Start Date</label>
							<input
								type="date"
								{...register("start_date")}
								className="input"
							/>
						</div>
						<div className="input-group">
							<label className="input-label">End Date</label>
							<input type="date" {...register("end_date")} className="input" />
						</div>
					</div>
					<div className="input-group">
						<label className="input-label">Payment Method</label>
						<select {...register("payment_method")} className="select-input">
							<option value="mpesa">M-Pesa</option>
							<option value="bank_transfer">Bank Transfer</option>
							<option value="cash">Cash</option>
						</select>
					</div>
				</div>
				<div className="modal-footer">
					<button type="button" onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button
						type="submit"
						disabled={mutation.isPending}
						className="btn-primary">
						{mutation.isPending ? "Saving…" : "Add Stipend"}
					</button>
				</div>
			</form>
		</ModalShell>
	);
}

// ─── Payroll Process Modal ────────────────────────────────────────────────────
function PayrollProcessModal({
	onClose,
	onSubmit,
	isLoading,
}: {
	onClose: () => void;
	onSubmit: (d: any) => void;
	isLoading: boolean;
}) {
	const { register, handleSubmit } = useForm();
	return (
		<ModalShell title="Process Payroll" onClose={onClose}>
			<form onSubmit={handleSubmit(onSubmit)}>
				<div className="modal-body space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<div className="input-group">
							<label className="input-label">Period *</label>
							<input
								{...register("period", { required: true })}
								className="input"
								placeholder="e.g. June 2025"
							/>
						</div>
						<div className="input-group">
							<label className="input-label">Pay Date *</label>
							<input
								type="date"
								{...register("pay_date", { required: true })}
								className="input"
							/>
						</div>
					</div>
					<div className="input-group">
						<label className="input-label">
							Department <span className="text-slate-500">(blank = all)</span>
						</label>
						<input
							{...register("department")}
							className="input"
							placeholder="Leave blank to process all departments"
						/>
					</div>
					<div className="input-group">
						<label className="input-label">Payment Method</label>
						<select {...register("payment_method")} className="select-input">
							<option value="bank_transfer">Bank Transfer</option>
							<option value="mpesa">M-Pesa</option>
							<option value="cash">Cash</option>
						</select>
					</div>
					<div className="input-group">
						<label className="input-label">Notes</label>
						<textarea {...register("notes")} rows={2} className="textarea" />
					</div>
					<div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-1">
						<div className="flex items-center gap-2 text-amber-400 text-xs font-medium">
							<Mail size={13} /> Email notifications
						</div>
						<p className="text-amber-300/70 text-xs">
							Each eligible employee will receive an email informing them to
							expect their salary within 72 hours.
						</p>
					</div>
				</div>
				<div className="modal-footer">
					<button type="button" onClick={onClose} className="btn-secondary">
						Cancel
					</button>
					<button type="submit" disabled={isLoading} className="btn-primary">
						{isLoading ? "Processing…" : "Process & Notify"}
					</button>
				</div>
			</form>
		</ModalShell>
	);
}
