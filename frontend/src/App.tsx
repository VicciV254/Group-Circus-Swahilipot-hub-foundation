// Nexus Enterprise Management System — Main Router
import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { useAuthStore } from "./services/api";
import AppLayout from "./components/layout/AppLayout";
import LoadingScreen from "./components/ui/LoadingScreen";
import { projectsRoutes } from "./pages/projects/routes";

// ── Auth ─────────────────────────────────────────────────────────────────────
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const MFAPage = lazy(() => import("./pages/auth/MFAPage"));
const ForceChangePasswordPage = lazy(
	() => import("./pages/auth/ForceChangePasswordPage"),
);
const ProfileCompletionPage = lazy(
	() => import("./pages/auth/Profilecompletionpage"),
);
const ProfilePage = lazy(() => import("./pages/auth/ProfilePage"));
const AttacheeCollectionForm = lazy(
	() => import("./pages/attachees/AttacheeCollectionForm"),
);

// ── Public ───────────────────────────────────────────────────────────────────
const VerifyPage = lazy(() => import("./pages/certificates/VerifyPage"));
const LandingPage = lazy(() => import("./pages/LandingPage"));

// ── Dashboards ────────────────────────────────────────────────────────────────
const AdminDashboard = lazy(() => import("./pages/dashboard/AdminDashboard"));
const BroadcastDash = lazy(
	() => import("./pages/dashboard/BroadcastDashboard"),
);
const ExecutiveDash = lazy(
	() => import("./pages/dashboard/ExecutiveDashboard"),
);
const AttacheeDash = lazy(() => import("./pages/dashboard/AttacheeDashboard"));
const DeptDashboard = lazy(
	() => import("./pages/attendance/DeptDashboardPage"),
);

// ── Internship modules ────────────────────────────────────────────────────────
const AttendancePage = lazy(() => import("./pages/attendance/AttendancePage"));
const TasksPage = lazy(() => import("./pages/tasks/TasksPage"));
const LogbooksPage = lazy(() => import("./pages/logbooks/LogbooksPage"));
const ProgramsPage = lazy(() => import("./pages/logbooks/Programspage"));
const EvaluationsPage = lazy(
	() => import("./pages/evaluations/EvaluationsPage"),
);
const CertificatesPage = lazy(
	() => import("./pages/certificates/CertificatesPage"),
);
const AttacheeList = lazy(() => import("./pages/attachees/AttacheeListPage"));

// ── Broadcast modules ─────────────────────────────────────────────────────────
const EquipmentPage = lazy(() => import("./pages/equipment/EquipmentPage"));
const NewsPage = lazy(() => import("./pages/news/NewsPage"));
const FMReportPage = lazy(() => import("./pages/fm/FMReportPage"));
const RadioPage = lazy(() => import("./pages/radio/RadioPage"));
const VideographyPage = lazy(
	() => import("./pages/videography/VideographyPage"),
);
const CallsPage = lazy(() => import("./components/layout/calls/CallsPage"));

// ── Digital services ──────────────────────────────────────────────────────────
const SubscriptionsPage = lazy(
	() => import("./pages/subscriptions/SubscriptionsPage"),
);
const WifiPage = lazy(() => import("./pages/wifi/WifiPage"));
const FeedbackPage = lazy(() => import("./pages/feedback/FeedbackPage"));
const FileTransferPage = lazy(
	() => import("./pages/filetransfer/FileTransferPage"),
);

// ── Enterprise ────────────────────────────────────────────────────────────────
const AnalyticsPage = lazy(() => import("./pages/analytics/AnalyticsPage"));
const HRPage = lazy(() => import("./pages/admin/HRPage"));
const FinancePage = lazy(() => import("./pages/admin/FinancePage"));
const UserManagement = lazy(() => import("./pages/admin/UserManagementPage"));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage"));

// ── System ────────────────────────────────────────────────────────────────────
const NotificationsPage = lazy(
	() => import("./pages/notifications/NotificationsPage"),
);
const EmergencyPage = lazy(() => import("./pages/emergency/EmergencyPage"));

// ─────────────────────────────────────────────────────────────────────────────

const ROLES = {
	ATTACHEE: ["attachee"],
	SUPERVISOR: ["supervisor"],
	DEPT_LEADER: ["department_leader"],
	HR: ["hr_officer"],
	ADMIN: ["system_admin"],
	ANALYTICS: ["data_analyst"],
	EXECUTIVE: ["executive"],
	FINANCE: ["finance"],
	UNIVERSITY: ["university_coordinator"],
	BROADCAST: [
		"broadcast_admin",
		"broadcast_staff",
		"journalist",
		"presenter",
		"editor",
		"videographer",
		"station_engineer",
	],
} as const;

const ALL_STAFF = [
	...ROLES.FINANCE,
	...ROLES.UNIVERSITY,
	...ROLES.ADMIN,
	...ROLES.HR,
	...ROLES.SUPERVISOR,
	...ROLES.DEPT_LEADER,
	...ROLES.EXECUTIVE,
	...ROLES.ANALYTICS,
];
const ALL_ROLES = [...ALL_STAFF, ...ROLES.ATTACHEE, ...ROLES.BROADCAST];

// ── Guards ────────────────────────────────────────────────────────────────────

function RoleRoute({
	children,
	allowed,
}: {
	children: React.ReactNode;
	allowed: readonly string[] | string[];
}) {
	const { user } = useAuthStore();
	if (!allowed.includes(user?.role ?? ""))
		return <Navigate to="/dashboard" replace />;
	return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
	const { isAuthenticated } = useAuthStore();
	if (isAuthenticated) return <Navigate to="/dashboard" replace />;
	return <>{children}</>;
}

/**
 * PrivateRoute — enforces the full first-login flow in order:
 *  1. must_change_password → /change-password-required
 *  2. profile_complete === false → /complete-profile
 *  3. Otherwise → render children
 */
function PrivateRoute({ children }: { children: React.ReactNode }) {
	const { isAuthenticated, user } = useAuthStore();

	if (!isAuthenticated) return <Navigate to="/login" replace />;

	// Step 1 — force password change (highest priority)
	if (
		user?.must_change_password &&
		location.pathname !== "/change-password-required"
	) {
		return <Navigate to="/change-password-required" replace />;
	}

	// Step 2 — profile completion (only after password is set)
	if (
		!user?.must_change_password &&
		(user as any)?.profile_complete === false &&
		location.pathname !== "/complete-profile"
	) {
		return <Navigate to="/complete-profile" replace />;
	}

	return <>{children}</>;
}

function RoleDashboard() {
	const { user } = useAuthStore();
	const role = user?.role ?? "";
	if (role === "attachee") return <AttacheeDash />;
	if (([...ROLES.BROADCAST] as string[]).includes(role))
		return <BroadcastDash />;
	if (([...ROLES.EXECUTIVE, ...ROLES.ANALYTICS] as string[]).includes(role))
		return <ExecutiveDash />;
	if (([...ROLES.SUPERVISOR, ...ROLES.DEPT_LEADER] as string[]).includes(role))
		return <DeptDashboard />;
	return <AdminDashboard />;
}

// ─────────────────────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60 * 3,
			retry: 1,
			refetchOnWindowFocus: false,
		},
	},
});

export default function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<BrowserRouter>
				<Suspense fallback={<LoadingScreen />}>
					<Routes>
						{/* ── Fully public ────────────────────────────────────────── */}
						<Route
							path="/"
							element={
								<PublicOnlyRoute>
									<LandingPage />
								</PublicOnlyRoute>
							}
						/>
						<Route
							path="/login"
							element={
								<PublicOnlyRoute>
									<LoginPage />
								</PublicOnlyRoute>
							}
						/>
						<Route path="/mfa" element={<MFAPage />} />
						<Route path="/verify/:code" element={<VerifyPage />} />

						{/* ── First-login flow (auth required, no AppLayout chrome) ── */}
						<Route
							path="/change-password-required"
							element={
								<PrivateRoute>
									<ForceChangePasswordPage />
								</PrivateRoute>
							}
						/>
						<Route
							path="/complete-profile"
							element={
								<PrivateRoute>
									<ProfileCompletionPage />
								</PrivateRoute>
							}
						/>

						{/* ── Protected (AppLayout wrapper) ───────────────────────── */}
						<Route
							element={
								<PrivateRoute>
									<AppLayout />
								</PrivateRoute>
							}>
							<Route
								path="/attachees/collect"
								element={<AttacheeCollectionForm />}
							/>

							{/* Core — every authenticated user */}
							<Route path="/dashboard" element={<RoleDashboard />} />
							<Route
								path="/profile"
								element={
									<RoleRoute allowed={ALL_ROLES}>
										<ProfilePage />
									</RoleRoute>
								}
							/>
							<Route
								path="/notifications"
								element={
									<RoleRoute allowed={ALL_ROLES}>
										<NotificationsPage />
									</RoleRoute>
								}
							/>
							<Route
								path="/emergency-alerts"
								element={
									<RoleRoute allowed={ALL_ROLES}>
										<EmergencyPage />
									</RoleRoute>
								}
							/>

							{/* Internship */}
							<Route
								path="/attendance"
								element={
									<RoleRoute
										allowed={[
											...ROLES.ATTACHEE,
											...ROLES.SUPERVISOR,
											...ROLES.DEPT_LEADER,
											...ROLES.HR,
											...ROLES.ADMIN,
										]}>
										<AttendancePage />
									</RoleRoute>
								}
							/>
							<Route
								path="/dept-dashboard"
								element={
									<RoleRoute
										allowed={[
											...ROLES.DEPT_LEADER,
											...ROLES.SUPERVISOR,
											...ROLES.HR,
											...ROLES.ADMIN,
										]}>
										<DeptDashboard />
									</RoleRoute>
								}
							/>
							<Route
								path="/tasks"
								element={
									<RoleRoute
										allowed={[
											...ROLES.ATTACHEE,
											...ROLES.SUPERVISOR,
											...ROLES.DEPT_LEADER,
											...ROLES.HR,
											...ROLES.ADMIN,
										]}>
										<TasksPage />
									</RoleRoute>
								}
							/>
							<Route
								path="/logbooks"
								element={
									<RoleRoute
										allowed={[
											...ROLES.ATTACHEE,
											...ROLES.SUPERVISOR,
											...ROLES.DEPT_LEADER,
											...ROLES.HR,
											...ROLES.ADMIN,
										]}>
										<ProgramsPage />
									</RoleRoute>
								}
							/>
							<Route
								path="/evaluations"
								element={
									<RoleRoute
										allowed={[
											...ROLES.ATTACHEE,
											...ROLES.SUPERVISOR,
											...ROLES.DEPT_LEADER,
											...ROLES.HR,
											...ROLES.ADMIN,
										]}>
										<EvaluationsPage />
									</RoleRoute>
								}
							/>
							<Route
								path="/certificates"
								element={
									<RoleRoute
										allowed={[...ROLES.ATTACHEE, ...ROLES.HR, ...ROLES.ADMIN]}>
										<CertificatesPage />
									</RoleRoute>
								}
							/>
							<Route
								path="/attachees"
								element={
									<RoleRoute
										allowed={[
											...ROLES.SUPERVISOR,
											...ROLES.DEPT_LEADER,
											...ROLES.HR,
											...ROLES.ADMIN,
										]}>
										<AttacheeList />
									</RoleRoute>
								}
							/>

							{/* Projects */}
							{projectsRoutes}
							<Route
								path="/projects"
								element={
									<RoleRoute
										allowed={[
											...ROLES.BROADCAST,
											...ROLES.SUPERVISOR,
											...ROLES.DEPT_LEADER,
											...ROLES.ADMIN,
										]}>
										<AttacheeList />
									</RoleRoute>
								}
							/>

							{/* Broadcast */}
							<Route
								path="/equipment"
								element={
									<RoleRoute allowed={[...ROLES.BROADCAST, ...ROLES.ADMIN]}>
										<EquipmentPage />
									</RoleRoute>
								}
							/>
							<Route
								path="/fm-report"
								element={
									<RoleRoute allowed={[...ROLES.BROADCAST, ...ROLES.ADMIN]}>
										<FMReportPage />
									</RoleRoute>
								}
							/>
							<Route
								path="/radio"
								element={
									<RoleRoute allowed={[...ROLES.BROADCAST, ...ROLES.ADMIN]}>
										<RadioPage />
									</RoleRoute>
								}
							/>
							<Route
								path="/news"
								element={
									<RoleRoute allowed={[...ROLES.BROADCAST, ...ROLES.ADMIN]}>
										<NewsPage />
									</RoleRoute>
								}
							/>
							<Route
								path="/videography"
								element={
									<RoleRoute allowed={[...ROLES.BROADCAST, ...ROLES.ADMIN]}>
										<VideographyPage />
									</RoleRoute>
								}
							/>
							<Route
								path="/calls"
								element={
									<RoleRoute
										allowed={[
											...ROLES.BROADCAST,
											...ROLES.SUPERVISOR,
											...ROLES.DEPT_LEADER,
											...ROLES.ADMIN,
										]}>
										<CallsPage />
									</RoleRoute>
								}
							/>

							{/* Digital services */}
							<Route
								path="/subscriptions"
								element={
									<RoleRoute allowed={[...ROLES.ADMIN, ...ROLES.HR]}>
										<SubscriptionsPage />
									</RoleRoute>
								}
							/>
							<Route
								path="/wifi"
								element={
									<RoleRoute allowed={ALL_ROLES}>
										<WifiPage />
									</RoleRoute>
								}
							/>
							<Route
								path="/file-transfer"
								element={
									<RoleRoute allowed={ALL_ROLES}>
										<FileTransferPage />
									</RoleRoute>
								}
							/>
							<Route
								path="/feedback"
								element={
									<RoleRoute allowed={ALL_ROLES}>
										<FeedbackPage />
									</RoleRoute>
								}
							/>

							{/* Enterprise */}
							<Route
								path="/analytics"
								element={
									<RoleRoute
										allowed={[
											...ROLES.ANALYTICS,
											...ROLES.EXECUTIVE,
											...ROLES.ADMIN,
										]}>
										<AnalyticsPage />
									</RoleRoute>
								}
							/>
							<Route
								path="/hr"
								element={
									<RoleRoute allowed={[...ROLES.HR, ...ROLES.ADMIN]}>
										<HRPage />
									</RoleRoute>
								}
							/>
							<Route
								path="/finance"
								element={
									<RoleRoute
										allowed={[
											...ROLES.ADMIN,
											...ROLES.EXECUTIVE,
											...ROLES.FINANCE,
										]}>
										<FinancePage />
									</RoleRoute>
								}
							/>
							<Route
								path="/users"
								element={
									<RoleRoute allowed={[...ROLES.ADMIN]}>
										<UserManagement />
									</RoleRoute>
								}
							/>
							<Route
								path="/settings"
								element={
									<RoleRoute allowed={[...ROLES.ADMIN]}>
										<SettingsPage />
									</RoleRoute>
								}
							/>
						</Route>

						{/* Catch-all */}
						<Route path="*" element={<Navigate to="/" replace />} />
					</Routes>
				</Suspense>
			</BrowserRouter>

			<Toaster
				position="top-right"
				toastOptions={{
					style: {
						background: "#1e2538",
						color: "#f1f5f9",
						border: "1px solid #252d42",
						borderRadius: "12px",
						fontSize: "14px",
					},
					success: { iconTheme: { primary: "#22c55e", secondary: "#fff" } },
					error: { iconTheme: { primary: "#ef4444", secondary: "#fff" } },
					loading: { iconTheme: { primary: "#3b63f5", secondary: "#fff" } },
				}}
			/>
		</QueryClientProvider>
	);
}
