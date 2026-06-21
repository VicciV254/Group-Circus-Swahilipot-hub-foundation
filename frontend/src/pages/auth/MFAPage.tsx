// Swahilipot — MFA Verification Page
// • Email OTP (default) with 15-min countdown and Resend
// • Authenticator App (TOTP) tab
// • Blocked if not arriving from /login redirect
import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
	Shield,
	ArrowRight,
	AlertCircle,
	LogOut,
	Mail,
	Smartphone,
	RefreshCw,
	Clock,
	CheckCircle2,
} from "lucide-react";
import { authApi, useAuthStore } from "../../services/api";
import toast from "react-hot-toast";

type Method = "email" | "totp";

const RESEND_COOLDOWN = 60; // seconds before resend is allowed again
const CODE_TTL = 15 * 60; // 15 minutes in seconds

export default function MFAPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const { setAuth, logout, user, accessToken, refreshToken, mfaRequired } =
		useAuthStore();

	// ── Guard: must arrive via login redirect ────────────────────────────────
	// We check mfaRequired flag from the store (set by login) rather than
	// trusting arbitrary navigation, so direct URL access is blocked.
	useEffect(() => {
		if (!mfaRequired || !accessToken) {
			navigate("/login", { replace: true });
		}
	}, []);

	// ── State ────────────────────────────────────────────────────────────────
	const [method, setMethod] = useState<Method>("email");
	const [code, setCode] = useState(["", "", "", "", "", ""]);
	const [loading, setLoading] = useState(false);
	const [resending, setResending] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState(false);

	// Countdown timers
	const [codeTimer, setCodeTimer] = useState(CODE_TTL); // 15-min code expiry display
	const [resendCooldown, setResendCooldown] = useState(0); // cooldown after resend
	const inputs = useRef<(HTMLInputElement | null)[]>([]);

	// Start the 15-min code timer when the email tab is active
	useEffect(() => {
		if (method !== "email") return;
		setCodeTimer(CODE_TTL);
		const iv = setInterval(() => {
			setCodeTimer((t) => {
				if (t <= 1) {
					clearInterval(iv);
					return 0;
				}
				return t - 1;
			});
		}, 1000);
		return () => clearInterval(iv);
	}, [method]);

	// Resend cooldown ticker
	useEffect(() => {
		if (resendCooldown <= 0) return;
		const iv = setInterval(() => {
			setResendCooldown((c) => (c <= 1 ? 0 : c - 1));
		}, 1000);
		return () => clearInterval(iv);
	}, [resendCooldown]);

	// ── OTP input handlers ───────────────────────────────────────────────────
	const handleChange = (i: number, val: string) => {
		if (!/^\d*$/.test(val)) return;
		const next = [...code];
		next[i] = val.slice(-1);
		setCode(next);
		if (val && i < 5) inputs.current[i + 1]?.focus();
		if (next.every((d) => d !== "") && next.join("").length === 6) {
			handleVerify(next.join(""));
		}
	};

	const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
		if (e.key === "Backspace" && !code[i] && i > 0) {
			inputs.current[i - 1]?.focus();
		}
		if (e.key === "ArrowLeft" && i > 0) inputs.current[i - 1]?.focus();
		if (e.key === "ArrowRight" && i < 5) inputs.current[i + 1]?.focus();
	};

	const handlePaste = (e: React.ClipboardEvent) => {
		e.preventDefault();
		const pasted = e.clipboardData
			.getData("text")
			.replace(/\D/g, "")
			.slice(0, 6);
		if (!pasted) return;
		const next = [...code];
		for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
		setCode(next);
		inputs.current[Math.min(pasted.length, 5)]?.focus();
		if (pasted.length === 6) handleVerify(pasted);
	};

	// ── Verify ───────────────────────────────────────────────────────────────
	const handleVerify = async (token?: string) => {
		const otp = token || code.join("");
		if (otp.length !== 6) {
			setError("Please enter all 6 digits.");
			return;
		}
		if (method === "email" && codeTimer === 0) {
			setError("Your code has expired. Please request a new one.");
			return;
		}
		setLoading(true);
		setError("");
		try {
			await authApi.verifyMfa(otp, method);
			if (user) setAuth(user, accessToken!, refreshToken!, false);
			setSuccess(true);
			setTimeout(() => {
				toast.success(`Welcome, ${user?.first_name}!`);
				navigate("/dashboard", { replace: true });
			}, 800);
		} catch (err: any) {
			const msg =
				err?.response?.data?.detail ?? "Invalid code. Please try again.";
			setError(msg);
			setCode(["", "", "", "", "", ""]);
			setTimeout(() => inputs.current[0]?.focus(), 50);
		} finally {
			setLoading(false);
		}
	};

	// ── Resend email OTP ─────────────────────────────────────────────────────
	const handleResend = async () => {
		if (resendCooldown > 0) return;
		setResending(true);
		setError("");
		try {
			await authApi.resendMfa();
			setCodeTimer(CODE_TTL);
			setResendCooldown(RESEND_COOLDOWN);
			setCode(["", "", "", "", "", ""]);
			setTimeout(() => inputs.current[0]?.focus(), 50);
			toast.success("A new code has been sent to your email.");
		} catch (err: any) {
			toast.error(err?.response?.data?.detail ?? "Failed to resend code.");
		} finally {
			setResending(false);
		}
	};

	const handleLogout = () => {
		logout();
		navigate("/login", { replace: true });
	};

	// ── Switch method ────────────────────────────────────────────────────────
	const switchMethod = (m: Method) => {
		setMethod(m);
		setCode(["", "", "", "", "", ""]);
		setError("");
		setTimeout(() => inputs.current[0]?.focus(), 100);
	};

	// ── Timer display ─────────────────────────────────────────────────────────
	const timerMins = Math.floor(codeTimer / 60);
	const timerSecs = codeTimer % 60;
	const timerStr = `${timerMins}:${String(timerSecs).padStart(2, "0")}`;
	const timerCritical = codeTimer > 0 && codeTimer <= 120; // last 2 mins = red

	if (!mfaRequired || !accessToken) return null;

	return (
		<div className="min-h-screen bg-surface flex items-center justify-center p-4 relative overflow-hidden">
			{/* Background glow */}
			<div className="absolute top-1/4 left-1/3 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
			<div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

			<div className="relative z-10 w-full max-w-sm animate-slide-up">
				{/* Header */}
				<div className="text-center mb-8">
					<div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg mb-4">
						<Shield size={28} className="text-white" />
					</div>
					<h1 className="font-display font-bold text-2xl text-white">
						Two-Factor Verification
					</h1>
					<p className="text-slate-400 text-sm mt-1">
						{user?.email && (
							<span className="text-slate-500">{user.email}</span>
						)}
					</p>
				</div>

				<div className="card-elevated">
					{/* Method tabs */}
					<div className="flex rounded-xl bg-surface border border-surface-border p-1 mb-6 gap-1">
						<button
							onClick={() => switchMethod("email")}
							className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
								method === "email"
									? "bg-indigo-600 text-white shadow"
									: "text-slate-400 hover:text-slate-200"
							}`}>
							<Mail size={14} />
							Email Code
						</button>
						<button
							onClick={() => switchMethod("totp")}
							className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
								method === "totp"
									? "bg-indigo-600 text-white shadow"
									: "text-slate-400 hover:text-slate-200"
							}`}>
							<Smartphone size={14} />
							Authenticator
						</button>
					</div>

					{/* Method description */}
					<p className="text-slate-400 text-sm text-center mb-5">
						{method === "email"
							? "Enter the 6-digit code sent to your email address."
							: "Enter the 6-digit code from your authenticator app."}
					</p>

					{/* Error */}
					{error && (
						<div className="alert alert-danger mb-5 flex items-start gap-2">
							<AlertCircle size={14} className="shrink-0 mt-0.5" />
							<span>{error}</span>
						</div>
					)}

					{/* Success state */}
					{success ? (
						<div className="flex flex-col items-center py-6 gap-3">
							<div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
								<CheckCircle2 size={28} className="text-green-400" />
							</div>
							<p className="text-green-400 font-semibold">Verified!</p>
							<p className="text-slate-400 text-sm">
								Redirecting to dashboard…
							</p>
						</div>
					) : (
						<>
							{/* Code inputs */}
							<div
								className="flex justify-center gap-2.5 mb-5"
								onPaste={handlePaste}>
								{code.map((digit, i) => (
									<input
										key={i}
										ref={(el) => (inputs.current[i] = el)}
										type="text"
										inputMode="numeric"
										maxLength={1}
										value={digit}
										onChange={(e) => handleChange(i, e.target.value)}
										onKeyDown={(e) => handleKeyDown(i, e)}
										onFocus={(e) => e.target.select()}
										className={`w-11 h-13 text-center text-xl font-bold bg-surface border-2 rounded-xl text-white
										focus:outline-none transition-all
										${digit ? "border-indigo-500" : "border-surface-border"}
										focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500/30`}
										autoFocus={i === 0}
										disabled={loading || success}
									/>
								))}
							</div>

							{/* Email-specific: timer + resend */}
							{method === "email" && (
								<div className="flex items-center justify-between mb-5 text-xs">
									<span
										className={`flex items-center gap-1.5 font-medium ${
											codeTimer === 0
												? "text-red-400"
												: timerCritical
													? "text-amber-400"
													: "text-slate-400"
										}`}>
										<Clock size={12} />
										{codeTimer === 0
											? "Code expired"
											: `Expires in ${timerStr}`}
									</span>

									<button
										onClick={handleResend}
										disabled={resendCooldown > 0 || resending}
										className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium">
										<RefreshCw
											size={12}
											className={resending ? "animate-spin" : ""}
										/>
										{resending
											? "Sending…"
											: resendCooldown > 0
												? `Resend in ${resendCooldown}s`
												: "Resend Code"}
									</button>
								</div>
							)}

							{/* Verify button */}
							<button
								onClick={() => handleVerify()}
								disabled={
									loading ||
									code.some((d) => !d) ||
									(method === "email" && codeTimer === 0)
								}
								className="btn-primary w-full py-3 justify-center mb-3">
								{loading ? (
									<span className="flex items-center gap-2">
										<span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
										Verifying…
									</span>
								) : (
									<span className="flex items-center gap-2">
										Verify &amp; Sign In <ArrowRight size={16} />
									</span>
								)}
							</button>
						</>
					)}

					{/* Sign out */}
					<button
						onClick={handleLogout}
						className="btn-ghost w-full justify-center text-slate-500 text-sm">
						<LogOut size={14} /> Use a different account
					</button>
				</div>

				<p className="text-center text-xs text-slate-600 mt-6">
					Swahilipot Foundation — Secure Production-Grade System
				</p>
			</div>
		</div>
	);
}
