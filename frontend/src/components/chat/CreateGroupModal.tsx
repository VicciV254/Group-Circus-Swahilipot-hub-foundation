// CreateGroupModal — Admin-only group creation with role guard
import { useState } from "react";
import { X, Hash, Users, Shield, AlertCircle, Loader2 } from "lucide-react";
import { useChatStore } from "../../stores/chatStore";
import { useAuthStore } from "../../services/api";
import { useChatApi } from "../../hooks/useChatApi";
import toast from "react-hot-toast";
import clsx from "clsx";

const ALL_USERS = [
	{
		id: "u1",
		name: "Sarah Kamau",
		role: "Supervisor",
		department: "Broadcast",
		email: "sarah.kamau@nexus.co.ke",
		isOnline: true,
	},
	{
		id: "u2",
		name: "John Mwangi",
		role: "Journalist",
		department: "News",
		email: "john.mwangi@nexus.co.ke",
		isOnline: true,
	},
	{
		id: "u3",
		name: "Amina Ochieng",
		role: "HR Officer",
		department: "Human Resources",
		email: "amina.ochieng@nexus.co.ke",
		isOnline: false,
	},
	{
		id: "u4",
		name: "David Otieno",
		role: "Station Engineer",
		department: "Broadcast",
		email: "david.otieno@nexus.co.ke",
		isOnline: true,
	},
	{
		id: "u5",
		name: "Grace Wanjiku",
		role: "Presenter",
		department: "Radio",
		email: "grace.wanjiku@nexus.co.ke",
		isOnline: false,
	},
	{
		id: "u6",
		name: "Peter Njoroge",
		role: "Videographer",
		department: "Production",
		email: "peter.njoroge@nexus.co.ke",
		isOnline: true,
	},
];

interface Props {
	onClose: () => void;
}

export function CreateGroupModal({ onClose }: Props) {
	const { user } = useAuthStore();
	const { createGroup, isCreatingGroup } = useChatApi();

	const [groupName, setGroupName] = useState("");
	const [description, setDescription] = useState("");
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [error, setError] = useState("");

	// Client-side role check
	const canCreate = user?.role
		? ["system_admin", "broadcast_admin", "hr_officer", "executive"].includes(
				user.role,
			)
		: false;

	const toggleUser = (id: string) => {
		setSelectedIds((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
		);
	};

	const handleCreate = () => {
		if (!groupName.trim()) {
			setError("Group name is required.");
			return;
		}
		if (selectedIds.length < 1) {
			setError("Add at least one member.");
			return;
		}

		createGroup({
			name: groupName.trim(),
			description: description.trim(),
			participant_ids: selectedIds,
		});
		onClose();
	};

	const getInitials = (name: string) =>
		name
			.split(" ")
			.map((w) => w[0])
			.join("")
			.slice(0, 2)
			.toUpperCase();

	return (
		<div className="modal-backdrop">
			<div className="modal-box">
				<div className="modal-header">
					<div className="flex items-center gap-3">
						<div className="w-9 h-9 rounded-xl bg-Swahilipot-600/20 border border-Swahilipot-500/30 flex items-center justify-center">
							<Hash size={16} className="text-Swahilipot-400" />
						</div>
						<div>
							<h2 className="text-sm font-bold text-white">Create Group</h2>
							<p className="text-[11px] text-slate-500">
								Admin permission required
							</p>
						</div>
					</div>
					<button onClick={onClose} className="btn-ghost btn-icon p-1.5">
						<X size={16} />
					</button>
				</div>

				<div className="modal-body space-y-4 max-h-[70vh] overflow-y-auto">
					{/* Role gate — show warning if not admin */}
					{!canCreate && (
						<div className="alert alert-danger">
							<Shield size={16} className="shrink-0 mt-0.5" />
							<div>
								<p className="font-semibold text-sm">Access Denied</p>
								<p className="text-xs mt-0.5 opacity-80">
									Only admins can create groups.
								</p>
							</div>
						</div>
					)}

					{canCreate && (
						<>
							{/* Admin badge */}
							<div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
								<Shield size={14} className="text-green-400 shrink-0" />
								<p className="text-xs text-green-300">
									Creating as <strong>{user?.role_display}</strong> — group
									creation permitted.
								</p>
							</div>

							{/* Group name */}
							<div className="input-group">
								<label className="input-label">Group Name *</label>
								<div className="relative">
									<span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
										#
									</span>
									<input
										value={groupName}
										onChange={(e) => {
											setGroupName(e.target.value);
											setError("");
										}}
										placeholder="group-name"
										className="input pl-7"
										maxLength={50}
									/>
								</div>
							</div>

							{/* Description */}
							<div className="input-group">
								<label className="input-label">Description</label>
								<textarea
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder="What's this group for?"
									className="textarea"
									rows={2}
									maxLength={200}
								/>
							</div>

							{/* Member selection */}
							<div className="input-group">
								<label className="input-label flex items-center gap-1.5">
									<Users size={12} /> Add Members ({selectedIds.length}{" "}
									selected)
								</label>
								<div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
									{ALL_USERS.map((u) => (
										<button
											key={u.id}
											onClick={() => toggleUser(u.id)}
											className={clsx(
												"w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all",
												selectedIds.includes(u.id)
													? "bg-Swahilipot-600/15 border-Swahilipot-500/30"
													: "border-surface-border hover:border-surface-muted bg-surface-elevated/50",
											)}>
											<div className="w-7 h-7 rounded-full bg-gradient-Nexus flex items-center justify-center text-[10px] font-bold text-white shrink-0">
												{getInitials(u.name)}
											</div>
											<div className="flex-1 min-w-0">
												<p className="text-xs font-medium text-slate-200 truncate">
													{u.name}
												</p>
												<p className="text-[10px] text-slate-500 truncate">
													{u.role} · {u.department}
												</p>
											</div>
											<div
												className={clsx(
													"w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all",
													selectedIds.includes(u.id)
														? "bg-Swahilipot-600 border-Swahilipot-600"
														: "border-surface-muted",
												)}>
												{selectedIds.includes(u.id) && (
													<svg
														width="8"
														height="8"
														viewBox="0 0 8 8"
														fill="none">
														<path
															d="M1 4L3 6L7 2"
															stroke="white"
															strokeWidth="1.5"
															strokeLinecap="round"
															strokeLinejoin="round"
														/>
													</svg>
												)}
											</div>
										</button>
									))}
								</div>
							</div>

							{/* Error */}
							{error && (
								<div className="flex items-center gap-2 text-red-400 text-xs">
									<AlertCircle size={13} />
									{error}
								</div>
							)}
						</>
					)}
				</div>

				<div className="modal-footer">
					<button onClick={onClose} className="btn-secondary btn-sm">
						Cancel
					</button>
					{canCreate && (
						<button
							onClick={handleCreate}
							className="btn-primary btn-sm"
							disabled={!groupName.trim() || isCreatingGroup}>
							{isCreatingGroup ? (
								<>
									<Loader2 size={13} className="animate-spin" /> Creating…
								</>
							) : (
								"Create Group"
							)}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
