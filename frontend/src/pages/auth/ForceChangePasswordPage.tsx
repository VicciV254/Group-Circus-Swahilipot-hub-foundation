import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ShieldCheck, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { api, useAuthStore } from "../../services/api";
import toast from "react-hot-toast";

export default function ForceChangePasswordPage() {
	const navigate = useNavigate();
	const { user, setUser } = useAuthStore();
	const [newPass, setNewPass] = useState("");
	const [confirm, setConfirm] = useState("");
	const [show, setShow] = useState(false);

	const mutation = useMutation({
		mutationFn: async () => {
			await api.post("/accounts/profile/password/", {
				current_password: "", // backend skips check if must_change_password=True
				new_password: newPass,
			});
		},
		// ForceChangePasswordPage.tsx  onSuccess handler
		onSuccess: () => {
			if (user) setUser({ ...user, must_change_password: false });
			toast.success("Password updated!");
			navigate("/complete-profile", { replace: true }); // ← change this line
		},
		onError: (err: any) => {
			toast.error(err?.response?.data?.detail ?? "Could not update password");
		},
	});

	const valid = newPass.length >= 10 && newPass === confirm;

	return (
		<div className="min-h-screen flex items-center justify-center bg-base p-4">
			<div className="w-full max-w-sm space-y-6">
				<div className="text-center space-y-2">
					<div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto">
						<Lock size={24} className="text-blue-400" />
					</div>
					<h1 className="text-xl font-bold text-white">Set your password</h1>
					<p className="text-slate-400 text-sm">
						You're using a temporary password. Please set a new one before
						continuing.
					</p>
				</div>

				<div className="card space-y-4 p-6">
					<div>
						<label className="block text-xs text-slate-400 mb-1.5">
							New password
						</label>
						<div className="relative">
							<input
								type={show ? "text" : "password"}
								value={newPass}
								onChange={(e) => setNewPass(e.target.value)}
								placeholder="At least 10 characters"
								className="input pr-10 w-full"
							/>
							<button
								type="button"
								onClick={() => setShow(!show)}
								className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
								{show ? <EyeOff size={14} /> : <Eye size={14} />}
							</button>
						</div>
						{newPass.length > 0 && newPass.length < 10 && (
							<p className="text-xs text-red-400 mt-1">
								Must be at least 10 characters
							</p>
						)}
					</div>

					<div>
						<label className="block text-xs text-slate-400 mb-1.5">
							Confirm password
						</label>
						<input
							type={show ? "text" : "password"}
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
							placeholder="Repeat new password"
							className="input w-full"
						/>
						{confirm.length > 0 && confirm !== newPass && (
							<p className="text-xs text-red-400 mt-1">
								Passwords do not match
							</p>
						)}
					</div>

					<button
						onClick={() => mutation.mutate()}
						disabled={!valid || mutation.isPending}
						className="btn-primary w-full">
						{mutation.isPending ? (
							<>
								<Loader2 size={15} className="animate-spin" /> Updating…
							</>
						) : (
							<>
								<ShieldCheck size={15} /> Set password & continue
							</>
						)}
					</button>
				</div>

				<p className="text-center text-xs text-slate-600">
					Logged in as <span className="text-slate-400">{user?.email}</span>
				</p>
			</div>
		</div>
	);
}
