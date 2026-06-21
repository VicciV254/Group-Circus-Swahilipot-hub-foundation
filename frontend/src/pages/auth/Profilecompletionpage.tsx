/**
 * Nexus — Profile Completion Page
 *
 * Shown immediately after ForceChangePasswordPage on a user's first login.
 * Guards check: user.must_change_password === false AND user.profile_complete === false
 * (or we derive "incomplete" from missing bio/dob/national_id).
 *
 * Fields split into two groups:
 *   • Recommended (shown upfront, single page)
 *   • Skip-able  (user can fill in later from Settings)
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
	User,
	Phone,
	MapPin,
	Calendar,
	CreditCard,
	AlertCircle,
	ChevronRight,
	CheckCircle2,
	Loader2,
	ArrowRight,
} from "lucide-react";
import { api, useAuthStore } from "../../services/api";
import toast from "react-hot-toast";
import clsx from "clsx";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfilePayload {
	phone?: string;
	date_of_birth?: string;
	national_id?: string;
	address?: string;
	bio?: string;
	emergency_contact_name?: string;
	emergency_contact_phone?: string;
}

// ── Field groups ─────────────────────────────────────────────────────────────

const STEPS = [
	{
		id: "basic",
		title: "A few quick details",
		subtitle: "This helps your supervisor and HR team reach you.",
		icon: User,
		color: "text-blue-400",
		fields: [
			{
				name: "phone",
				label: "Phone number",
				type: "tel",
				placeholder: "+254 700 000 000",
				icon: Phone,
				hint: "Used for urgent notifications",
			},
			{
				name: "date_of_birth",
				label: "Date of birth",
				type: "date",
				placeholder: "",
				icon: Calendar,
				hint: "Kept private — used only for HR records",
			},
			{
				name: "national_id",
				label: "National ID / Passport number",
				type: "text",
				placeholder: "e.g. 12345678",
				icon: CreditCard,
				hint: "Required for certificate generation",
			},
		],
	},
	{
		id: "contact",
		title: "Emergency contact",
		subtitle: "Who should we reach if we can't contact you directly?",
		icon: AlertCircle,
		color: "text-amber-400",
		fields: [
			{
				name: "emergency_contact_name",
				label: "Contact name",
				type: "text",
				placeholder: "e.g. Mary Wanjiku",
				icon: User,
				hint: "",
			},
			{
				name: "emergency_contact_phone",
				label: "Contact phone",
				type: "tel",
				placeholder: "+254 700 000 000",
				icon: Phone,
				hint: "",
			},
			{
				name: "address",
				label: "Home address",
				type: "text",
				placeholder: "e.g. Nairobi, Westlands",
				icon: MapPin,
				hint: "",
			},
		],
	},
] as const;

// ── Main component ────────────────────────────────────────────────────────────

export default function ProfileCompletionPage() {
	const navigate = useNavigate();
	const { user, setUser } = useAuthStore();
	const [step, setStep] = useState(0);
	const [form, setForm] = useState<Record<string, string>>({});

	const totalSteps = STEPS.length;
	const currentStep = STEPS[step];
	const isLast = step === totalSteps - 1;

	// ── Mutation ───────────────────────────────────────────────────────────────
	const saveMutation = useMutation({
		mutationFn: async (payload: ProfilePayload) => {
			await api.patch("/accounts/profile/", payload);
		},
		onSuccess: () => {
			if (user) {
				// Mark locally so route guard doesn't loop
				setUser({ ...user, profile_complete: true } as any);
			}
			toast.success("Profile saved — welcome aboard!");
			navigate("/dashboard", { replace: true });
		},
		onError: () => {
			toast.error(
				"Could not save profile. You can update it later in Settings.",
			);
			navigate("/dashboard", { replace: true });
		},
	});

	// ── Handlers ───────────────────────────────────────────────────────────────
	const handleChange = (name: string, value: string) => {
		setForm((prev) => ({ ...prev, [name]: value }));
	};

	const handleNext = () => {
		if (isLast) {
			// Submit everything collected across both steps
			const payload: ProfilePayload = {};
			if (form.phone) payload.phone = form.phone;
			if (form.date_of_birth) payload.date_of_birth = form.date_of_birth;
			if (form.national_id) payload.national_id = form.national_id;
			if (form.address) payload.address = form.address;
			if (form.bio) payload.bio = form.bio;
			if (form.emergency_contact_name)
				payload.emergency_contact_name = form.emergency_contact_name;
			if (form.emergency_contact_phone)
				payload.emergency_contact_phone = form.emergency_contact_phone;
			saveMutation.mutate(payload);
		} else {
			setStep((s) => s + 1);
		}
	};

	const handleSkip = () => {
		if (isLast) {
			// Skip saving entirely — go straight to dashboard
			if (user) setUser({ ...user, profile_complete: true } as any);
			navigate("/dashboard", { replace: true });
		} else {
			setStep((s) => s + 1);
		}
	};

	// ── Progress dots ──────────────────────────────────────────────────────────
	const StepIcon = currentStep.icon;

	return (
		<div className="min-h-screen flex items-center justify-center bg-base p-4">
			<div className="w-full max-w-md space-y-6 animate-fade-in">
				{/* ── Header ── */}
				<div className="text-center space-y-3">
					{/* Progress dots */}
					<div className="flex items-center justify-center gap-2 mb-1">
						{STEPS.map((_, i) => (
							<div
								key={i}
								className={clsx(
									"rounded-full transition-all duration-300",
									i === step
										? "w-6 h-2 bg-blue-500"
										: i < step
											? "w-2 h-2 bg-blue-500/60"
											: "w-2 h-2 bg-white/10",
								)}
							/>
						))}
					</div>

					<div
						className={clsx(
							"w-14 h-14 rounded-2xl flex items-center justify-center mx-auto border",
							"bg-blue-500/10 border-blue-500/20",
						)}>
						<StepIcon size={24} className={currentStep.color} />
					</div>
					<div>
						<h1 className="text-xl font-bold text-white">
							{currentStep.title}
						</h1>
						<p className="text-slate-400 text-sm mt-1">
							{currentStep.subtitle}
						</p>
					</div>
				</div>

				{/* ── Form card ── */}
				<div className="card p-6 space-y-4">
					{currentStep.fields.map((field) => {
						const FieldIcon = field.icon;
						return (
							<div key={field.name}>
								<label className="block text-xs text-slate-400 mb-1.5">
									{field.label}
								</label>
								<div className="relative">
									<FieldIcon
										size={14}
										className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
									/>
									<input
										type={field.type}
										value={form[field.name] ?? ""}
										onChange={(e) => handleChange(field.name, e.target.value)}
										placeholder={field.placeholder}
										className="input pl-9 w-full"
									/>
								</div>
								{field.hint && (
									<p className="text-[11px] text-slate-600 mt-1">
										{field.hint}
									</p>
								)}
							</div>
						);
					})}
				</div>

				{/* ── Actions ── */}
				<div className="flex items-center gap-3">
					<button
						onClick={handleSkip}
						disabled={saveMutation.isPending}
						className="btn-secondary flex-1 text-slate-400">
						{isLast ? "Skip for now" : "Skip this step"}
						<ChevronRight size={14} />
					</button>

					<button
						onClick={handleNext}
						disabled={saveMutation.isPending}
						className="btn-primary flex-1">
						{saveMutation.isPending ? (
							<>
								<Loader2 size={14} className="animate-spin" /> Saving…
							</>
						) : isLast ? (
							<>
								<CheckCircle2 size={14} /> Save & continue
							</>
						) : (
							<>
								Next <ArrowRight size={14} />
							</>
						)}
					</button>
				</div>

				{/* ── Footer note ── */}
				<p className="text-center text-xs text-slate-600">
					You can update all of this later under{" "}
					<span className="text-slate-400">Settings → Profile</span>.
				</p>

				{/* Logged-in hint */}
				<p className="text-center text-xs text-slate-700">
					Logged in as <span className="text-slate-500">{user?.email}</span>
				</p>
			</div>
		</div>
	);
}
