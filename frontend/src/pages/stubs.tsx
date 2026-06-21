// Swahilipot — All remaining page stubs
import { useNavigate } from "react-router-dom";
import {
	Activity,
	Calendar,
	Award,
	Star,
	BookOpen,
	ClipboardList,
	Users,
	BarChart3,
	DollarSign,
	Settings,
	Bell,
	AlertTriangle,
	User,
	Shield,
	Camera,
	Phone,
	Wifi,
	FolderUp,
	MessageSquare,
	Radio,
	Siren,
	Globe,
	Briefcase,
	FileText,
	GraduationCap,
} from "lucide-react";

function StubPage({
	icon: Icon,
	title,
	subtitle,
	color = "text-Swahilipot-400",
	features = [],
}: any) {
	const navigate = useNavigate();
	return (
		<div className="animate-fade-in space-y-6">
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<Icon size={24} className={color} />
						{title}
					</h1>
					<p className="page-subtitle">{subtitle}</p>
				</div>
			</div>
			{features.length > 0 && (
				<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
					{features.map((f: string) => (
						<div key={f} className="card flex items-center gap-2 py-3">
							<div className="w-1.5 h-1.5 rounded-full bg-Swahilipot-400" />
							<span className="text-sm text-slate-300">{f}</span>
						</div>
					))}
				</div>
			)}
			<div className="card text-center py-16">
				<Icon size={44} className={`mx-auto mb-4 opacity-25 ${color}`} />
				<h3 className="text-lg font-semibold text-white mb-2">
					{title} Module
				</h3>
				<p className="text-slate-400 max-w-lg mx-auto text-sm">
					Fully specified in the SRS document. Backend models, serializers, and
					API endpoints are implemented. Frontend follows the same design system
					and API patterns as the Equipment, FM Report, and News modules.
				</p>
				<div className="flex items-center justify-center gap-3 mt-6">
					<button onClick={() => navigate(-1)} className="btn-secondary">
						← Back
					</button>
					<button
						onClick={() => navigate("/dashboard")}
						className="btn-primary">
						Dashboard
					</button>
				</div>
			</div>
		</div>
	);
}

export function AttendancePage() {
	return (
		<StubPage
			icon={Activity}
			title="Attendance Management"
			subtitle="GPS geofencing, check-in/out, leave requests, violation alerts"
			color="text-green-400"
			features={[
				"GPS Check-In",
				"QR Code Backup",
				"Geofence Enforcement",
				"Leave Requests",
				"Violation Alerts",
				"Attendance Reports",
				"Shift Scheduling",
				"Supervisor Approval",
			]}
		/>
	);
}

export function TasksPage() {
	return (
		<StubPage
			icon={ClipboardList}
			title="Task Management"
			subtitle="Assign, track, submit and review internship tasks"
			color="text-blue-400"
			features={[
				"Kanban Board",
				"Gantt Charts",
				"File Submissions",
				"Deadline Tracking",
				"Extension Requests",
				"Supervisor Feedback",
				"Progress Tracking",
				"Overdue Alerts",
			]}
		/>
	);
}

export function LogbooksPage() {
	return (
		<StubPage
			icon={BookOpen}
			title="Daily Logbooks"
			subtitle="Rich-text daily entries, supervisor review, digital signatures"
			color="text-amber-400"
			features={[
				"Daily Entries",
				"Rich Text Editor",
				"Supervisor Comments",
				"Digital Signatures",
				"Approval Workflow",
				"Weekly Summaries",
				"File Attachments",
				"PDF Export",
			]}
		/>
	);
}

export function EvaluationsPage() {
	return (
		<StubPage
			icon={Star}
			title="Evaluations"
			subtitle="Weekly, monthly, and final attachee performance evaluations"
			color="text-yellow-400"
			features={[
				"Evaluation Templates",
				"Scored Criteria",
				"Feedback Comments",
				"Strengths/Weaknesses",
				"Historical Records",
				"Comparison Charts",
				"Export Reports",
				"Attachee Acknowledgement",
			]}
		/>
	);
}

export function CertificatesPage() {
	return (
		<StubPage
			icon={Award}
			title="Certificates & Letters"
			subtitle="Auto-generated completion certificates and recommendation letters"
			color="text-purple-400"
			features={[
				"Auto-Generation",
				"PDF Download",
				"QR Verification",
				"Digital Signature",
				"Recommendation Letters",
				"Achievement Badges",
				"Email Delivery",
				"Alumni Network",
			]}
		/>
	);
}

export function AttacheeListPage() {
	return (
		<StubPage
			icon={GraduationCap}
			title="Attachee Management"
			subtitle="Manage all industrial attachment placements across departments"
			color="text-Swahilipot-400"
			features={[
				"Placement Tracking",
				"University Coordination",
				"Department Assignment",
				"Progress Overview",
				"Supervisor Assignment",
				"Bulk Import",
				"Certificate Issuance",
				"Exit Surveys",
			]}
		/>
	);
}

export function RadioPage() {
	return (
		<StubPage
			icon={Radio}
			title="Radio Schedule Management"
			subtitle="Frequency management, show scheduling, presenter portal, conflict prevention"
			color="text-purple-400"
			features={[
				"Weekly Grid View",
				"Conflict Detection",
				"Show Plan Submission",
				"24h/2h Reminders",
				"Presenter Portal",
				"Emergency Changes",
				"Public Schedule View",
				"Show Type Tagging",
			]}
		/>
	);
}

export function SubscriptionsPage() {
	return (
		<StubPage
			icon={Shield}
			title="Software Subscriptions"
			subtitle="Adobe, Lightroom, and other software licence management"
			color="text-cyan-400"
			features={[
				"Licence Dashboard",
				"Seat Allocation",
				"Expiry Alerts (30d/7d)",
				"Access Requests",
				"Secure Credential Sharing",
				"Auto-revocation",
				"Renewal Workflow",
				"Cost Tracking",
			]}
		/>
	);
}

export function WifiPage() {
	return (
		<StubPage
			icon={Wifi}
			title="Wi-Fi Access Management"
			subtitle="Formal access requests, time-limited grants, device registration"
			color="text-cyan-400"
			features={[
				"Access Request Form",
				"MAC Address Registration",
				"Time-Limited Grants",
				"IT Approval Workflow",
				"Auto-revocation",
				"Guest Access",
				"Active Grants Dashboard",
				"Audit Logs",
			]}
		/>
	);
}

export function FeedbackPage() {
	return (
		<StubPage
			icon={MessageSquare}
			title="Feedback & Complaints"
			subtitle="Structured ticketing system for complaints and suggestions"
			color="text-amber-400"
			features={[
				"Ticket Submission",
				"Category Classification",
				"Unique Ticket Numbers",
				"Status Tracking",
				"Admin Assignment",
				"Response Threading",
				"Resolution Analytics",
				"Weekly Email Reports",
			]}
		/>
	);
}

export function FileTransferPage() {
	return (
		<StubPage
			icon={FolderUp}
			title="Secure File Transfer"
			subtitle="Campus-network file transfer with QR links and auto-expiry"
			color="text-blue-400"
			features={[
				"Large File Upload",
				"QR Code Links",
				"Auto-expiry (24h)",
				"Progress Tracking",
				"Cross-platform (Mac/Win)",
				"Transfer Audit Log",
				"Admin Size Limits",
				"MinIO Storage",
			]}
		/>
	);
}

export function VideographyPage() {
	return (
		<StubPage
			icon={Camera}
			title="Videography Booking"
			subtitle="Shoot booking, production briefs, equipment reservation, footage archive"
			color="text-red-400"
			features={[
				"Shoot Booking",
				"Production Brief",
				"Equipment Auto-reservation",
				"Shared Calendar",
				"Footage Upload",
				"Archive Search",
				"Location Management",
				"Production Stats",
			]}
		/>
	);
}

export function CallsPage() {
	return (
		<StubPage
			icon={Phone}
			title="Call Recording System"
			subtitle="On-air call metadata logging, audio storage, hardware fault tracking"
			color="text-green-400"
			features={[
				"Call Metadata Logging",
				"Audio Playback",
				"Studio/Operator Stats",
				"Hardware Fault Tracking",
				"Access Controls",
				"Auto-archival",
				"Call Volume Analytics",
				"VoIP Integration",
			]}
		/>
	);
}

export function AnalyticsPage() {
	return (
		<StubPage
			icon={BarChart3}
			title="Data Analytics"
			subtitle="Cross-module reporting, predictive analytics, KPI dashboards, data export"
			color="text-purple-400"
			features={[
				"Attendance KPIs",
				"Task Performance",
				"FM Uptime Trends",
				"Equipment Utilisation",
				"News Publication Rate",
				"Subscription Analytics",
				"Ticket Resolution Time",
				"Export CSV/PDF",
			]}
		/>
	);
}

export function HRPage() {
	return (
		<StubPage
			icon={Users}
			title="HR Management"
			subtitle="Complete HRIS — recruitment, onboarding, lifecycle, performance, compliance"
			color="text-Swahilipot-400"
			features={[
				"ATS / Recruitment",
				"Onboarding Workflows",
				"Contract Management",
				"Performance Reviews",
				"Leave Management",
				"Training Tracking",
				"Succession Planning",
				"Compliance Monitoring",
			]}
		/>
	);
}

export function FinancePage() {
	return (
		<StubPage
			icon={DollarSign}
			title="Finance Department"
			subtitle="Budgets, expenses, invoicing, stipend management, cash flow"
			color="text-green-400"
			features={[
				"Budget Planning",
				"Expense Tracking",
				"Invoice Management",
				"Stipend Management",
				"Approval Workflows",
				"Cost Centre Reporting",
				"Cash Flow Monitoring",
				"Tax Reporting",
			]}
		/>
	);
}

export function NotificationsPage() {
	return (
		<StubPage
			icon={Bell}
			title="Notifications Centre"
			subtitle="All system notifications, preferences, digest scheduling, read receipts"
			color="text-amber-400"
			features={[
				"Notification Feed",
				"Mark as Read",
				"Email Preferences",
				"SMS Preferences",
				"Push Notifications",
				"Digest Scheduling",
				"Escalation Chains",
				"Delivery Tracking",
			]}
		/>
	);
}

export function EmergencyPage() {
	return (
		<StubPage
			icon={Siren}
			title="Emergency Alerts"
			subtitle="Active emergencies, alert history, acknowledgements"
			color="text-red-400"
			features={[
				"Active Alerts List",
				"Alert History",
				"Acknowledgement Tracking",
				"Resolution Notes",
				"Authority Contacts",
				"Email/SMS Log",
				"Severity Classification",
				"Affected Systems",
			]}
		/>
	);
}

export function ProfilePage() {
	return (
		<StubPage
			icon={User}
			title="My Profile"
			subtitle="Personal details, MFA setup, notification preferences, emergency contacts"
			color="text-Swahilipot-400"
			features={[
				"Personal Info",
				"Profile Photo",
				"Password Change",
				"MFA Setup",
				"Notification Preferences",
				"Emergency Contacts",
				"Session History",
				"Activity Log",
			]}
		/>
	);
}

export function MFAPage() {
	return (
		<StubPage
			icon={Shield}
			title="Two-Factor Authentication"
			subtitle="Enter your TOTP code to complete login"
			color="text-Swahilipot-400"
		/>
	);
}

export function UserManagementPage() {
	return (
		<StubPage
			icon={Users}
			title="User Management"
			subtitle="Create, edit, deactivate users, manage roles and permissions"
			color="text-Swahilipot-400"
			features={[
				"User Creation",
				"Role Assignment",
				"Bulk Import",
				"Deactivation",
				"Password Reset",
				"MFA Enforcement",
				"Session Management",
				"Activity Logs",
			]}
		/>
	);
}

export function SettingsPage() {
	return (
		<StubPage
			icon={Settings}
			title="System Settings"
			subtitle="Organisation config, geofencing, notifications, integrations, backup"
			color="text-slate-400"
			features={[
				"Org Details",
				"Branch Configuration",
				"Geofence Radius",
				"Email Settings",
				"SMS Configuration",
				"FM Alert Contacts",
				"Backup Schedule",
				"Audit Logs",
			]}
		/>
	);
}
