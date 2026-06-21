// Nexus Login Page — fixed
import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	Eye,
	EyeOff,
	Zap,
	Lock,
	Mail,
	ArrowRight,
	AlertCircle,
} from "lucide-react";
import axios from "axios";
import { useAuthStore } from "../../services/api";
import toast from "react-hot-toast";

const schema = z.object({
	email: z.string().email("Invalid email address"),
	password: z.string().min(1, "Password is required"),
});
type FormData = z.infer<typeof schema>;

const API_URL =
	(import.meta as any).env?.VITE_API_URL ?? "http://127.0.0.1:8000/api/v1";

export default function LoginPage() {
	const navigate = useNavigate();
	const { setAuth, isAuthenticated } = useAuthStore();
	const [showPassword, setShowPassword] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	// Already logged in — go straight to dashboard
	if (isAuthenticated) {
		navigate
		return <Navigate to="/dashboard" replace />; 
	}

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<FormData>({
		resolver: zodResolver(schema),
	});

	const onSubmit = async (data: FormData) => {
		setLoading(true);
		setError("");
		try {
			const res = await axios.post(API_URL + "/auth/login/", {
				email: data.email,
				password: data.password,
			});

			const { access, refresh, user, mfa_required } = res.data;

			setAuth(user, access, refresh, mfa_required ?? false);

			if (mfa_required) {
				navigate("/mfa", { replace: true });
			} else {
				toast.success("Welcome back, " + user.first_name + "!");
				navigate("/dashboard", { replace: true });
			}
		} catch (err: any) {
			const msg =
				err.response?.data?.detail ||
				err.response?.data?.non_field_errors?.[0] ||
				"Invalid credentials. Please try again.";
			setError(msg);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen bg-surface flex items-center justify-center p-4 relative overflow-hidden">
			{/* Background glows */}
			<div className="absolute top-1/4 left-1/4 w-96 h-96 bg-Nexus-600/20 rounded-full blur-3xl pointer-events-none" />
			<div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

			<div className="relative z-10 w-full max-w-md animate-slide-up">
				{/* Logo */}
				<div className="text-center mb-8">
					<div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-Nexus shadow-Nexus mb-4">
						<Zap size={28} className="text-white" />
					</div>
					<h1 className="font-display font-bold text-3xl text-white">Swahilipot</h1>
					<p className="text-slate-400 text-sm mt-1 tracking-widest uppercase">
						Foundation Management System
					</p>
				</div>

				{/* Card */}
				<div className="card-elevated">
					<div className="mb-6">
						<h2 className="text-xl font-semibold text-white">
							Sign in to your account
						</h2>
						<p className="text-slate-400 text-sm mt-1">
							Enter your credentials to access the system
						</p>
					</div>

					{error && (
						<div className="alert alert-danger mb-5">
							<AlertCircle size={16} className="shrink-0 mt-0.5" />
							<span>{error}</span>
						</div>
					)}

					<form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
						{/* Email */}
						<div className="input-group">
							<label className="input-label">Email Address</label>
							<div className="relative">
								<Mail
									size={16}
									className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
								/>
								<input
									{...register("email")}
									type="email"
									placeholder="you@organisation.com"
									className="input pl-10"
									autoFocus
								/>
							</div>
							{errors.email && (
								<p className="text-red-400 text-xs mt-1">
									{errors.email.message}
								</p>
							)}
						</div>

						{/* Password */}
						<div className="input-group">
							<label className="input-label">Password</label>
							<div className="relative">
								<Lock
									size={16}
									className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
								/>
								<input
									{...register("password")}
									type={showPassword ? "text" : "password"}
									placeholder="••••••••••"
									className="input pl-10 pr-10"
								/>
								<button
									type="button"
									onClick={() => setShowPassword(!showPassword)}
									className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
									{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
								</button>
							</div>
							{errors.password && (
								<p className="text-red-400 text-xs mt-1">
									{errors.password.message}
								</p>
							)}
						</div>

						<button
							type="submit"
							disabled={loading}
							className="btn-primary w-full py-3 justify-center btn-lg">
							{loading ? (
								<span className="flex items-center gap-2">
									<span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
									Signing in...
								</span>
							) : (
								<span className="flex items-center gap-2">
									Sign In <ArrowRight size={16} />
								</span>
							)}
						</button>
					</form>

					<p className="text-center text-xs text-slate-500 mt-6">
						Contact your system administrator to reset your password or create
						an account.
					</p>
				</div>

				<p className="text-center text-xs text-slate-600 mt-6">
					Swahilipot Foundation — Secure Production-Grade System
				</p>
			</div>
		</div>
	);
}
