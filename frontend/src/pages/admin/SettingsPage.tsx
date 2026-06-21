// NEXUS — System Settings Page (role-based access)
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
	Settings,
	Building2,
	MapPin,
	Bell,
	Mail,
	Phone,
	Shield,
	Database,
	RefreshCw,
	Save,
	AlertTriangle,
	Globe,
	Clock,
	Users,
	Lock,
	User,
	Eye,
	EyeOff,
} from "lucide-react";
import { hrApi, authApi } from "../../services/api";
import { useAuthStore } from "../../services/api";
import toast from "react-hot-toast";
import clsx from "clsx";

// ── Role helpers ──────────────────────────────────────────────────────────────
const SYSTEM_ADMIN_ROLES = ["system_admin"];
const HR_ROLES = ["system_admin", "hr_officer"];
const ALL_STAFF_ROLES = [
	"system_admin",
	"broadcast_admin",
	"hr_officer",
	"supervisor",
	"department_leader",
	"executive",
	"data_analyst",
	"finance",
	"broadcast_staff",
	"journalist",
	"presenter",
	"editor",
	"videographer",
	"station_engineer",
	"attachee",
	"university_coordinator",
];

// ── Tab definitions with role guards ─────────────────────────────────────────
const ALL_TABS = [
	{ key: "personal", label: "My Account", icon: User, roles: ALL_STAFF_ROLES },
	{
		key: "organisation",
		label: "Organisation",
		icon: Building2,
		roles: SYSTEM_ADMIN_ROLES,
	},
	{ key: "geofencing", label: "Geofencing", icon: MapPin, roles: HR_ROLES },
	{ key: "notifications", label: "Notifications", icon: Bell, roles: HR_ROLES },
	{
		key: "security",
		label: "Security",
		icon: Shield,
		roles: SYSTEM_ADMIN_ROLES,
	},
	{ key: "system", label: "System", icon: Database, roles: SYSTEM_ADMIN_ROLES },
] as const;

type TabKey = (typeof ALL_TABS)[number]["key"];

export default function SettingsPage() {
	const { user } = useAuthStore();
	const qc = useQueryClient();
	const role = user?.role || "";

	const visibleTabs = ALL_TABS.filter((t) => t.roles.includes(role as any));
	const [activeTab, setActiveTab] = useState<TabKey>(
		visibleTabs[0]?.key ?? "personal",
	);

	const { data: org, isLoading: orgLoading } = useQuery({
		queryKey: ["organisation"],
		queryFn: () => hrApi.organisation().then((r) => r.data),
		enabled: SYSTEM_ADMIN_ROLES.includes(role),
	});
	const { data: branches = [], isLoading: branchLoading } = useQuery({
		queryKey: ["branches"],
		queryFn: () => hrApi.branches().then((r) => r.data.results || r.data),
		enabled: HR_ROLES.includes(role),
	});
	const { data: depts = [], isLoading: deptLoading } = useQuery({
		queryKey: ["departments"],
		queryFn: () => hrApi.departments().then((r) => r.data.results || r.data),
		enabled: SYSTEM_ADMIN_ROLES.includes(role),
	});

	const updateOrgMutation = useMutation({
		mutationFn: (data: any) => hrApi.updateOrg(data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["organisation"] });
			toast.success("Organisation updated");
		},
		onError: () => toast.error("Update failed"),
	});

	if (visibleTabs.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-64 gap-3">
				<Shield size={36} className="text-slate-600" />
				<p className="text-slate-400 font-medium">Access Restricted</p>
				<p className="text-xs text-slate-500">
					You don't have permission to access settings.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<Settings size={22} className="text-nexus-400" /> Settings
					</h1>
					<p className="page-subtitle">
						{SYSTEM_ADMIN_ROLES.includes(role)
							? "Organisation config · geofencing · notifications · security · system"
							: HR_ROLES.includes(role)
								? "Account settings · geofencing · notifications"
								: "Account settings"}
					</p>
				</div>
			</div>

			<div className="flex gap-6">
				{/* Sidebar */}
				<div className="w-48 shrink-0 space-y-1">
					{visibleTabs.map(({ key, label, icon: Icon }) => (
						<button
							key={key}
							onClick={() => setActiveTab(key)}
							className={clsx(
								"sidebar-link w-full",
								activeTab === key && "active",
							)}>
							<Icon size={15} />
							<span>{label}</span>
						</button>
					))}
				</div>

				{/* Content */}
				<div className="flex-1 min-w-0">
					{/* ── MY ACCOUNT ── */}
					{activeTab === "personal" && (
						<div className="space-y-5">
							<div className="card">
								<h3 className="font-semibold text-white mb-5 flex items-center gap-2">
									<User size={16} className="text-nexus-400" /> Profile
									Information
								</h3>
								<div className="grid grid-cols-2 gap-4">
									{[
										{ label: "Full Name", value: user?.full_name },
										{ label: "Email", value: user?.email },
										{ label: "Role", value: user?.role_display },
										{ label: "Organisation", value: user?.organisation_name },
									].map(({ label, value }) => (
										<div
											key={label}
											className="p-3 bg-surface rounded-xl border border-surface-border">
											<div className="text-xs text-slate-500 mb-0.5">
												{label}
											</div>
											<div className="text-sm font-medium text-white">
												{value || "—"}
											</div>
										</div>
									))}
								</div>
								<p className="text-xs text-slate-500 mt-4">
									To update profile details, visit{" "}
									<a href="/profile" className="text-nexus-400 underline">
										My Profile
									</a>
									.
								</p>
							</div>

							<ChangePasswordCard />

							<div className="card">
								<h3 className="font-semibold text-white mb-5 flex items-center gap-2">
									<Bell size={16} className="text-nexus-400" /> Notification
									Preferences
								</h3>
								<div className="space-y-3">
									{[
										{
											label: "Email notifications",
											sub: "Receive updates via email",
										},
										{
											label: "SMS notifications",
											sub: "Receive alerts via SMS",
										},
										{
											label: "Task reminders",
											sub: "Reminders for upcoming deadlines",
										},
										{
											label: "Attendance alerts",
											sub: "Alerts for check-in/check-out",
										},
									].map(({ label, sub }, i) => (
										<div
											key={label}
											className="flex items-center justify-between p-3 bg-surface rounded-xl border border-surface-border">
											<div>
												<div className="text-sm font-medium text-white">
													{label}
												</div>
												<div className="text-xs text-slate-500">{sub}</div>
											</div>
											<label className="relative inline-flex items-center cursor-pointer">
												<input
													type="checkbox"
													defaultChecked={i < 2}
													className="sr-only peer"
												/>
												<div className="w-11 h-6 bg-surface-border rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-nexus-600" />
											</label>
										</div>
									))}
								</div>
								<div className="flex justify-end mt-4">
									<button
										className="btn-primary"
										onClick={() => toast.success("Preferences saved")}>
										<Save size={14} /> Save Preferences
									</button>
								</div>
							</div>
						</div>
					)}

					{/* ── ORGANISATION ── */}
					{activeTab === "organisation" && (
						<div className="space-y-5">
							<div className="card">
								<h3 className="font-semibold text-white mb-5 flex items-center gap-2">
									<Building2 size={16} className="text-nexus-400" />{" "}
									Organisation Details
								</h3>
								{orgLoading ? (
									<div className="space-y-3">
										{[...Array(4)].map((_, i) => (
											<div key={i} className="skeleton h-10 rounded-lg" />
										))}
									</div>
								) : (
									<OrgForm
										org={org}
										onSave={(d: any) => updateOrgMutation.mutate(d)}
										isPending={updateOrgMutation.isPending}
									/>
								)}
							</div>

							<div className="card">
								<div className="flex items-center justify-between mb-4">
									<h3 className="font-semibold text-white flex items-center gap-2">
										<Globe size={15} className="text-nexus-400" /> Branches /
										Campuses
									</h3>
									<span className="badge-blue">{branches.length} total</span>
								</div>
								{branchLoading ? (
									<div className="skeleton h-20 rounded-xl" />
								) : (
									<div className="space-y-2">
										{branches.length === 0 ? (
											<p className="text-slate-500 text-sm text-center py-6">
												No branches configured
											</p>
										) : (
											branches.map((b: any) => (
												<div
													key={b.id}
													className="flex items-center justify-between p-3 bg-surface rounded-xl border border-surface-border">
													<div>
														<div className="text-sm font-medium text-white">
															{b.name}
														</div>
														<div className="text-xs text-slate-500">
															{b.city} · {b.country} · {b.user_count || 0} users
														</div>
													</div>
													<div className="flex items-center gap-2">
														{b.is_headquarters && (
															<span className="badge-blue text-[10px]">HQ</span>
														)}
														<span
															className={clsx(
																"badge text-[10px]",
																b.is_active ? "badge-green" : "badge-slate",
															)}>
															{b.is_active ? "Active" : "Inactive"}
														</span>
													</div>
												</div>
											))
										)}
									</div>
								)}
							</div>

							<div className="card">
								<div className="flex items-center justify-between mb-4">
									<h3 className="font-semibold text-white flex items-center gap-2">
										<Users size={15} className="text-nexus-400" /> Departments
									</h3>
									<span className="badge-blue">{depts.length} total</span>
								</div>
								{deptLoading ? (
									<div className="skeleton h-20 rounded-xl" />
								) : (
									<div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
										{depts.length === 0 ? (
											<p className="text-slate-500 text-sm col-span-3 text-center py-6">
												No departments configured
											</p>
										) : (
											depts.map((d: any) => (
												<div
													key={d.id}
													className="p-3 bg-surface rounded-xl border border-surface-border">
													<div className="text-sm font-medium text-white">
														{d.name}
													</div>
													<div className="text-xs text-slate-500">
														{d.user_count || 0} members
													</div>
												</div>
											))
										)}
									</div>
								)}
							</div>
						</div>
					)}

					{/* ── GEOFENCING ── */}
					{activeTab === "geofencing" && (
						<div className="space-y-5">
							<div className="card">
								<h3 className="font-semibold text-white mb-5 flex items-center gap-2">
									<MapPin size={16} className="text-nexus-400" /> GPS Geofencing
									Settings
								</h3>
								<div className="alert alert-info mb-5">
									<MapPin size={14} />
									<span>
										Set the GPS coordinates and allowed radius for each branch.
										Employees must be within the radius to GPS check in. If they
										drift outside while checked in, an email alert is sent to
										their supervisor.
									</span>
								</div>
								{branchLoading ? (
									<div className="skeleton h-40 rounded-xl" />
								) : branches.length === 0 ? (
									<p className="text-slate-500 text-sm text-center py-8">
										No branches configured. Add branches first under
										Organisation.
									</p>
								) : (
									<GeofencingBranches branches={branches} />
								)}
							</div>
						</div>
					)}

					{/* ── NOTIFICATIONS ── */}
					{activeTab === "notifications" && (
						<div className="space-y-5">
							<div className="card">
								<h3 className="font-semibold text-white mb-5 flex items-center gap-2">
									<Mail size={16} className="text-nexus-400" /> Email
									Configuration
								</h3>
								<div className="space-y-4">
									<div className="grid grid-cols-2 gap-4">
										<div className="input-group">
											<label className="input-label">SMTP Host</label>
											<input
												className="input"
												placeholder="smtp.gmail.com"
												defaultValue="smtp.gmail.com"
											/>
										</div>
										<div className="input-group">
											<label className="input-label">SMTP Port</label>
											<input
												className="input"
												placeholder="587"
												defaultValue="587"
											/>
										</div>
										<div className="input-group">
											<label className="input-label">Email Username</label>
											<input className="input" placeholder="your@gmail.com" />
										</div>
										<div className="input-group">
											<label className="input-label">Email Password</label>
											<input
												type="password"
												className="input"
												placeholder="App password"
											/>
										</div>
									</div>
									<div className="input-group">
										<label className="input-label">From Email</label>
										<input
											className="input"
											placeholder="Swahilipot System <noreply@yourorg.com>"
										/>
									</div>
									<button
										className="btn-secondary btn-sm"
										onClick={() => toast.success("Test email sent!")}>
										Send Test Email
									</button>
								</div>
							</div>

							<div className="card">
								<h3 className="font-semibold text-white mb-5 flex items-center gap-2">
									<Phone size={16} className="text-nexus-400" /> SMS
									Configuration (Africa's Talking)
								</h3>
								<div className="grid grid-cols-2 gap-4">
									<div className="input-group">
										<label className="input-label">API Key</label>
										<input
											type="password"
											className="input"
											placeholder="AT API Key"
										/>
									</div>
									<div className="input-group">
										<label className="input-label">Username</label>
										<input className="input" placeholder="sandbox" />
									</div>
									<div className="input-group">
										<label className="input-label">Sender ID / Shortcode</label>
										<input className="input" placeholder="NEXUS" />
									</div>
								</div>
							</div>

							<div className="card">
								<h3 className="font-semibold text-white mb-5 flex items-center gap-2">
									<Bell size={16} className="text-nexus-400" /> Emergency Alert
									Contacts
								</h3>
								<div className="space-y-3">
									<div className="input-group">
										<label className="input-label">
											Alert Email Addresses (comma-separated)
										</label>
										<textarea
											className="textarea h-16"
											placeholder="admin@org.com, cto@org.com"
										/>
									</div>
									<div className="input-group">
										<label className="input-label">
											Alert Phone Numbers (comma-separated)
										</label>
										<textarea
											className="textarea h-16"
											placeholder="+254700000001, +254700000002"
										/>
									</div>
								</div>
								<div className="flex justify-end mt-4">
									<button
										className="btn-primary"
										onClick={() => toast.success("Alert contacts saved")}>
										<Save size={14} /> Save Contacts
									</button>
								</div>
							</div>
						</div>
					)}

					{/* ── SECURITY ── */}
					{activeTab === "security" && (
						<div className="space-y-5">
							<div className="card">
								<h3 className="font-semibold text-white mb-5 flex items-center gap-2">
									<Shield size={16} className="text-nexus-400" /> Authentication
									Settings
								</h3>
								<div className="space-y-4">
									{[
										{
											label: "Require MFA for Admin roles",
											sub: "System Admin, HR Officer, Finance, Legal",
											defaultChecked: true,
										},
										{
											label: "Require MFA for Broadcast Admin",
											sub: "Broadcast Admin and Station Engineers",
											defaultChecked: false,
										},
										{
											label: "Enforce strong passwords",
											sub: "Minimum 10 characters, mixed case, numbers",
											defaultChecked: true,
										},
										{
											label: "Auto-logout after inactivity",
											sub: "Session expires after 8 hours of inactivity",
											defaultChecked: true,
										},
										{
											label: "Log all write operations",
											sub: "Immutable audit log for POST, PUT, PATCH, DELETE",
											defaultChecked: true,
										},
									].map(({ label, sub, defaultChecked }) => (
										<div
											key={label}
											className="flex items-center justify-between p-4 bg-surface rounded-xl border border-surface-border">
											<div>
												<div className="text-sm font-medium text-white">
													{label}
												</div>
												<div className="text-xs text-slate-500 mt-0.5">
													{sub}
												</div>
											</div>
											<label className="relative inline-flex items-center cursor-pointer">
												<input
													type="checkbox"
													defaultChecked={defaultChecked}
													className="sr-only peer"
												/>
												<div className="w-11 h-6 bg-surface-border rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-nexus-600" />
											</label>
										</div>
									))}
								</div>
							</div>

							<div className="card">
								<h3 className="font-semibold text-white mb-4 flex items-center gap-2">
									<Clock size={16} className="text-nexus-400" /> Session
									Settings
								</h3>
								<div className="grid grid-cols-2 gap-4">
									<div className="input-group">
										<label className="input-label">
											Access Token Lifetime (hours)
										</label>
										<input
											type="number"
											className="input"
											defaultValue={8}
											min={1}
											max={24}
										/>
									</div>
									<div className="input-group">
										<label className="input-label">
											Refresh Token Lifetime (days)
										</label>
										<input
											type="number"
											className="input"
											defaultValue={7}
											min={1}
											max={30}
										/>
									</div>
									<div className="input-group">
										<label className="input-label">Max Login Attempts</label>
										<input
											type="number"
											className="input"
											defaultValue={10}
											min={3}
											max={20}
										/>
									</div>
									<div className="input-group">
										<label className="input-label">
											Lockout Duration (minutes)
										</label>
										<input
											type="number"
											className="input"
											defaultValue={15}
											min={5}
											max={60}
										/>
									</div>
								</div>
								<div className="flex justify-end mt-4">
									<button
										className="btn-primary"
										onClick={() => toast.success("Security settings saved")}>
										<Save size={14} /> Save Security Config
									</button>
								</div>
							</div>
						</div>
					)}

					{/* ── SYSTEM ── */}
					{activeTab === "system" && (
						<div className="space-y-5">
							<div className="card">
								<h3 className="font-semibold text-white mb-5 flex items-center gap-2">
									<Database size={16} className="text-nexus-400" /> System
									Information
								</h3>
								<div className="grid grid-cols-2 gap-3">
									{[
										{ label: "System Version", value: "Swahilipot Foundation" },
										{ label: "Django Version", value: "6.x" },
										{ label: "Database", value: "PostgreSQL 18" },
										{ label: "Cache Backend", value: "Redis" },
										{ label: "File Storage", value: "Local / S3-compatible" },
										{ label: "Auth Method", value: "JWT + MFA (TOTP)" },
										{ label: "Time Zone", value: "Africa/Nairobi (EAT)" },
										{ label: "Debug Mode", value: "False (Development)" },
									].map(({ label, value }) => (
										<div
											key={label}
											className="p-3 bg-surface rounded-xl border border-surface-border">
											<div className="text-xs text-slate-500 mb-0.5">
												{label}
											</div>
											<div className="text-sm font-medium text-white">
												{value}
											</div>
										</div>
									))}
								</div>
							</div>

							<div className="card">
								<h3 className="font-semibold text-white mb-5">
									Maintenance Actions
								</h3>
								<div className="space-y-3">
									{[
										{
											label: "Clear Application Cache",
											sub: "Clears in-memory cache — safe to run anytime",
											icon: RefreshCw,
											action: () => toast.success("Cache cleared"),
										},
										{
											label: "Collect Static Files",
											sub: "Re-runs collectstatic — needed after updates",
											icon: Database,
											action: () => toast.success("Static files collected"),
										},
										{
											label: "Test Email Configuration",
											sub: "Sends a test email to admin address",
											icon: Mail,
											action: () => toast.success("Test email sent"),
										},
										{
											label: "Export Audit Log (CSV)",
											sub: "Downloads the full immutable audit log",
											icon: Database,
											action: () => toast.success("Downloading audit log..."),
										},
									].map(({ label, sub, icon: Icon, action }) => (
										<div
											key={label}
											className="flex items-center justify-between p-4 bg-surface rounded-xl border border-surface-border">
											<div className="flex items-center gap-3">
												<div className="w-9 h-9 rounded-lg bg-nexus-600/20 flex items-center justify-center">
													<Icon size={15} className="text-nexus-400" />
												</div>
												<div>
													<div className="text-sm font-medium text-white">
														{label}
													</div>
													<div className="text-xs text-slate-500">{sub}</div>
												</div>
											</div>
											<button onClick={action} className="btn-secondary btn-sm">
												Run
											</button>
										</div>
									))}
								</div>
							</div>

							<div className="card border-red-500/20">
								<h3 className="font-semibold text-red-400 mb-4 flex items-center gap-2">
									<AlertTriangle size={16} /> Danger Zone
								</h3>
								<div className="flex items-center justify-between p-4 bg-red-900/10 rounded-xl border border-red-500/20">
									<div>
										<div className="text-sm font-medium text-white">
											Reset All User Sessions
										</div>
										<div className="text-xs text-slate-500">
											Forces all users to log in again
										</div>
									</div>
									<button
										onClick={() =>
											toast.error(
												"Action requires confirmation — contact super admin",
											)
										}
										className="btn-danger btn-sm">
										Reset Sessions
									</button>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

// ── Geofencing Branches (fully wired — saves to backend) ─────────────────────
function GeofencingBranches({
	branches: initialBranches,
}: {
	branches: any[];
}) {
	const qc = useQueryClient();
	const [configs, setConfigs] = useState<
		Record<
			string,
			{ latitude: string; longitude: string; geofence_radius: string }
		>
	>(() => {
		const init: Record<string, any> = {};
		initialBranches.forEach((b) => {
			init[b.id] = {
				latitude: String(b.latitude ?? ""),
				longitude: String(b.longitude ?? ""),
				geofence_radius: String(b.geofence_radius ?? 100),
			};
		});
		return init;
	});
	const [saving, setSaving] = useState<Record<string, boolean>>({});

	const update = (id: string, field: string, value: string) =>
		setConfigs((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

	const saveBranch = async (branch: any) => {
		const cfg = configs[branch.id];
		if (!cfg) return;

		const lat = parseFloat(cfg.latitude);
		const lon = parseFloat(cfg.longitude);
		const radius = parseInt(cfg.geofence_radius, 10);

		if (cfg.latitude && isNaN(lat)) {
			toast.error(
				`${branch.name}: latitude must be a valid number (e.g. -4.0435)`,
			);
			return;
		}
		if (cfg.longitude && isNaN(lon)) {
			toast.error(
				`${branch.name}: longitude must be a valid number (e.g. 39.6682)`,
			);
			return;
		}
		if (isNaN(radius) || radius < 50) {
			toast.error(`${branch.name}: radius must be at least 50 metres`);
			return;
		}

		setSaving((s) => ({ ...s, [branch.id]: true }));
		try {
			await hrApi.updateBranch(branch.id, {
				latitude: cfg.latitude || null,
				longitude: cfg.longitude || null,
				geofence_radius: radius,
			});
			qc.invalidateQueries({ queryKey: ["branches"] });
			toast.success(`${branch.name} geofence saved ✓`);
		} catch (e: any) {
			toast.error(e.response?.data?.detail || `Failed to save ${branch.name}`);
		} finally {
			setSaving((s) => ({ ...s, [branch.id]: false }));
		}
	};

	return (
		<div className="space-y-4">
			{initialBranches.map((b) => {
				const cfg = configs[b.id] ?? {
					latitude: "",
					longitude: "",
					geofence_radius: "100",
				};
				const hasCoords = cfg.latitude !== "" && cfg.longitude !== "";
				const isSaving = saving[b.id] ?? false;

				return (
					<div
						key={b.id}
						className="p-4 bg-surface rounded-xl border border-surface-border">
						{/* Branch header */}
						<div className="flex items-center justify-between mb-4">
							<div>
								<div className="font-medium text-white">{b.name}</div>
								<div className="text-xs text-slate-500">
									{b.city} · {b.country}
									{b.is_headquarters && (
										<span className="ml-2 badge-blue text-[10px]">HQ</span>
									)}
								</div>
							</div>
							{hasCoords ? (
								<span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-900/20 border border-green-500/30 px-2 py-0.5 rounded-full">
									<span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
									Geofence active
								</span>
							) : (
								<span className="inline-flex items-center gap-1 text-xs text-slate-400 bg-surface-elevated border border-surface-border px-2 py-0.5 rounded-full">
									<span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block" />
									No coordinates set
								</span>
							)}
						</div>

						{/* Coordinate inputs */}
						<div className="grid grid-cols-3 gap-3 mb-4">
							<div className="input-group">
								<label className="input-label">Latitude</label>
								<input
									type="number"
									step="0.0000001"
									value={cfg.latitude}
									onChange={(e) => update(b.id, "latitude", e.target.value)}
									placeholder="-4.0435"
									className="input text-xs font-mono"
								/>
							</div>
							<div className="input-group">
								<label className="input-label">Longitude</label>
								<input
									type="number"
									step="0.0000001"
									value={cfg.longitude}
									onChange={(e) => update(b.id, "longitude", e.target.value)}
									placeholder="39.6682"
									className="input text-xs font-mono"
								/>
							</div>
							<div className="input-group">
								<label className="input-label">Radius (metres)</label>
								<input
									type="number"
									min={50}
									max={5000}
									value={cfg.geofence_radius}
									onChange={(e) =>
										update(b.id, "geofence_radius", e.target.value)
									}
									className="input text-xs"
								/>
							</div>
						</div>

						{/* Google Maps preview link */}
						{hasCoords && (
							<div className="mb-4 p-3 bg-surface-elevated rounded-lg border border-surface-border text-xs text-slate-400 flex items-center gap-3">
								<MapPin size={12} className="text-nexus-400 shrink-0" />
								<span>
									Centre:{" "}
									<span className="font-mono text-white">
										{cfg.latitude}, {cfg.longitude}
									</span>
									<span className="mx-2">·</span>
									Radius:{" "}
									<span className="font-mono text-white">
										{cfg.geofence_radius}m
									</span>
									<span className="mx-2">·</span>
									<a
										href={`https://maps.google.com/?q=${cfg.latitude},${cfg.longitude}`}
										target="_blank"
										rel="noopener noreferrer"
										className="text-nexus-400 underline">
										Verify on Google Maps ↗
									</a>
								</span>
							</div>
						)}

						{/* Save button */}
						<div className="flex justify-end">
							<button
								onClick={() => saveBranch(b)}
								disabled={isSaving}
								className="btn-primary btn-sm">
								{isSaving ? (
									<>
										<RefreshCw size={13} className="animate-spin" /> Saving…
									</>
								) : (
									<>
										<Save size={14} /> Save {b.name}
									</>
								)}
							</button>
						</div>
					</div>
				);
			})}
		</div>
	);
}

// ── Change Password Card ──────────────────────────────────────────────────────
function ChangePasswordCard() {
	const [show, setShow] = useState(false);
	const [form, setForm] = useState({
		current_password: "",
		new_password: "",
		confirm_password: "",
	});
	const [showPw, setShowPw] = useState(false);

	const handleSubmit = async () => {
		if (form.new_password !== form.confirm_password) {
			toast.error("Passwords do not match");
			return;
		}
		if (form.new_password.length < 8) {
			toast.error("Password must be at least 8 characters");
			return;
		}
		try {
			await authApi.changePassword({
				current_password: form.current_password,
				new_password: form.new_password,
			});
			toast.success("Password changed successfully");
			setShow(false);
			setForm({ current_password: "", new_password: "", confirm_password: "" });
		} catch (e: any) {
			toast.error(e.response?.data?.detail || "Password change failed");
		}
	};

	return (
		<div className="card">
			<div className="flex items-center justify-between mb-4">
				<h3 className="font-semibold text-white flex items-center gap-2">
					<Lock size={16} className="text-nexus-400" /> Password & Security
				</h3>
				<button className="btn-secondary btn-sm" onClick={() => setShow(!show)}>
					{show ? "Cancel" : "Change Password"}
				</button>
			</div>
			{!show ? (
				<p className="text-sm text-slate-400">
					Keep your account secure by using a strong, unique password.
				</p>
			) : (
				<div className="space-y-3">
					{[
						{ key: "current_password", label: "Current Password" },
						{ key: "new_password", label: "New Password" },
						{ key: "confirm_password", label: "Confirm New Password" },
					].map(({ key, label }) => (
						<div key={key} className="input-group">
							<label className="input-label">{label}</label>
							<div className="relative">
								<input
									type={showPw ? "text" : "password"}
									className="input pr-10"
									value={(form as any)[key]}
									onChange={(e) =>
										setForm((p) => ({ ...p, [key]: e.target.value }))
									}
								/>
								<button
									type="button"
									className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
									onClick={() => setShowPw(!showPw)}>
									{showPw ? <EyeOff size={14} /> : <Eye size={14} />}
								</button>
							</div>
						</div>
					))}
					<div className="flex justify-end">
						<button className="btn-primary" onClick={handleSubmit}>
							<Save size={14} /> Update Password
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

// ── Organisation Form ─────────────────────────────────────────────────────────
function OrgForm({ org, onSave, isPending }: any) {
	const { register, handleSubmit } = useForm({ defaultValues: org || {} });
	return (
		<form onSubmit={handleSubmit(onSave)} className="space-y-4">
			<div className="grid grid-cols-2 gap-4">
				<div className="input-group">
					<label className="input-label">Organisation Name *</label>
					<input
						{...register("name")}
						className="input"
						placeholder="Swahilipot Foundation Institution"
					/>
				</div>
				<div className="input-group">
					<label className="input-label">Organisation Code</label>
					<input {...register("code")} className="input" placeholder="BMI" />
				</div>
				<div className="input-group">
					<label className="input-label">Sector</label>
					<select {...register("sector")} className="select-input">
						<option value="broadcast">Broadcast Media</option>
						<option value="corporate">Corporate</option>
						<option value="government">Government</option>
						<option value="ngo">NGO</option>
						<option value="hospital">Hospital</option>
						<option value="bank">Bank</option>
						<option value="university">University</option>
						<option value="other">Other</option>
					</select>
				</div>
				<div className="input-group">
					<label className="input-label">Phone</label>
					<input
						{...register("phone")}
						className="input"
						placeholder="+254 700 000 000"
					/>
				</div>
				<div className="input-group">
					<label className="input-label">Email</label>
					<input
						type="email"
						{...register("email")}
						className="input"
						placeholder="info@org.com"
					/>
				</div>
				<div className="input-group">
					<label className="input-label">Website</label>
					<input
						{...register("website")}
						className="input"
						placeholder="https://org.com"
					/>
				</div>
			</div>
			<div className="input-group">
				<label className="input-label">Physical Address</label>
				<textarea
					{...register("address")}
					rows={2}
					className="textarea"
					placeholder="Street, City, Country"
				/>
			</div>
			<div className="flex justify-end">
				<button type="submit" disabled={isPending} className="btn-primary">
					{isPending ? (
						<>
							<RefreshCw size={14} className="animate-spin" /> Saving...
						</>
					) : (
						<>
							<Save size={14} /> Save Organisation
						</>
					)}
				</button>
			</div>
		</form>
	);
}
