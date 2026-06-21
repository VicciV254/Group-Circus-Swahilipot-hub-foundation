// Nexus — Secure File Transfer
// Add this import at the top
import { QRCodeSVG } from "qrcode.react";
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
	FolderUp,
	Upload,
	Download,
	Trash2,
	QrCode,
	Clock,
	Link,
	AlertCircle,
	CheckCircle,
	File,
} from "lucide-react";
import { fileTransferApi } from "../../services/api";
import { useAuthStore } from "../../services/api";
import { useDropzone } from "react-dropzone";
import toast from "react-hot-toast";
import clsx from "clsx";

function formatBytes(bytes: number) {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function FileTransferPage() {
	const { user } = useAuthStore();
	const qc = useQueryClient();
	const [uploadProgress, setUploadProgress] = useState(0);
	const [isUploading, setIsUploading] = useState(false);
	const [qrModal, setQrModal] = useState<any>(null);

	const { data: transfersData, isLoading } = useQuery({
		queryKey: ["file-transfers"],
		queryFn: () => fileTransferApi.list().then((r) => r.data),
		refetchInterval: 30000,
	});

	const transfers = Array.isArray(transfersData)
		? transfersData
		: Array.isArray(transfersData?.results)
			? transfersData.results
			: [];

	const uploadMutation = useMutation({
		mutationFn: (file: File) => fileTransferApi.upload(file, setUploadProgress),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["file-transfers"] });
			setIsUploading(false);
			setUploadProgress(0);
			toast.success("File uploaded! Share the download link.");
		},
		onError: () => {
			setIsUploading(false);
			setUploadProgress(0);
			toast.error("Upload failed");
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => fileTransferApi.delete(id),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["file-transfers"] });
			toast.success("File deleted");
		},
	});

	const onDrop = useCallback((files: File[]) => {
		const file = files[0];
		if (!file) return;
		setIsUploading(true);
		uploadMutation.mutate(file);
	}, []);

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop,
		maxFiles: 1,
		maxSize: 10 * 1024 * 1024 * 1024, // 10GB
		multiple: false,
	});

	const handleDownload = async (token: string, filename: string) => {
		try {
			const res = await fileTransferApi.download(token);
			const url = URL.createObjectURL(new Blob([res.data]));
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
		} catch {
			toast.error("Download failed or link expired");
		}
	};

	const copyLink = (token: string) => {
		const url = `${window.location.origin}/api/v1/file-transfer/download/${token}/`;
		navigator.clipboard.writeText(url);
		toast.success("Download link copied!");
	};

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="page-header">
				<div>
					<h1 className="page-title flex items-center gap-2">
						<FolderUp size={22} className="text-Nexus-400" /> Secure File
						Transfer
					</h1>
					<p className="page-subtitle">
						Upload files and share QR/link downloads within the campus network.
						Links auto-expire after 24 hours.
					</p>
				</div>
			</div>

			{/* Upload zone */}
			<div
				{...getRootProps()}
				className={clsx(
					"border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all",
					{
						"border-Nexus-500 bg-Nexus-600/10": isDragActive,
						"border-surface-border hover:border-Nexus-500/50 hover:bg-surface-elevated/30":
							!isDragActive,
					},
				)}>
				<input {...getInputProps()} />
				{isUploading ? (
					<div className="space-y-4">
						<Upload
							size={36}
							className="mx-auto text-Nexus-400 animate-bounce"
						/>
						<p className="text-white font-medium">Uploading...</p>
						<div className="max-w-sm mx-auto">
							<div className="h-2 bg-surface-elevated rounded-full overflow-hidden">
								<div
									className="h-full bg-Nexus-500 rounded-full transition-all duration-300"
									style={{ width: `${uploadProgress}%` }}
								/>
							</div>
							<p className="text-xs text-slate-400 mt-1">{uploadProgress}%</p>
						</div>
					</div>
				) : isDragActive ? (
					<div>
						<Upload size={36} className="mx-auto text-Nexus-400 mb-3" />
						<p className="text-Nexus-400 font-semibold">
							Drop file here to upload
						</p>
					</div>
				) : (
					<div>
						<FolderUp size={36} className="mx-auto text-slate-500 mb-3" />
						<p className="text-white font-medium">
							Drag & drop a file here, or click to browse
						</p>
						<p className="text-slate-400 text-sm mt-1">
							Max file size: 10 GB · Link expires after 24 hours
						</p>
						<p className="text-slate-500 text-xs mt-1">
							Files stay within the campus network (MinIO storage)
						</p>
					</div>
				)}
			</div>

			{/* Transfers list */}
			<div className="card">
				<h3 className="font-semibold text-white mb-5 flex items-center gap-2">
					<File size={16} className="text-Nexus-400" /> My Uploaded Files
				</h3>
				{isLoading ? (
					[...Array(4)].map((_, i) => (
						<div key={i} className="skeleton h-16 rounded-xl mb-2" />
					))
				) : transfers.length === 0 ? (
					<div className="text-center py-10">
						<FolderUp
							size={28}
							className="mx-auto text-slate-500 mb-2 opacity-30"
						/>
						<p className="text-slate-400 text-sm">No files uploaded yet</p>
					</div>
				) : (
					<div className="space-y-2">
						{transfers.map((t: any) => {
							const isExpired =
								t.is_expired ||
								(t.expires_at && new Date(t.expires_at) < new Date());
							return (
								<div
									key={t.id}
									className={clsx(
										"flex items-center gap-4 p-3 rounded-xl border transition-all",
										{
											"border-surface-border bg-surface hover:bg-surface-elevated":
												!isExpired,
											"border-surface-border/30 bg-surface/30 opacity-50":
												isExpired,
										},
									)}>
									<div className="w-9 h-9 rounded-lg bg-Nexus-600/20 flex items-center justify-center shrink-0">
										<File size={16} className="text-Nexus-400" />
									</div>
									<div className="flex-1 min-w-0">
										<div className="text-sm font-medium text-white truncate">
											{t.original_filename || t.file_name}
										</div>
										<div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
											<span>
												{t.file_size ? formatBytes(t.file_size) : "—"}
											</span>
											<span>·</span>
											{isExpired ? (
												<span className="text-red-400 flex items-center gap-0.5">
													<AlertCircle size={9} />
													Expired
												</span>
											) : (
												<span className="flex items-center gap-0.5">
													<Clock size={9} />
													Expires{" "}
													{t.expires_at
														? format(parseISO(t.expires_at), "HH:mm dd MMM")
														: "24h"}
												</span>
											)}
											{t.download_count != null && (
												<span>
													· {t.download_count} download
													{t.download_count !== 1 ? "s" : ""}
												</span>
											)}
										</div>
									</div>
									<div className="flex items-center gap-1.5 shrink-0">
										{!isExpired && (
											<>
												<button
													onClick={() => copyLink(t.token || t.id)}
													className="btn-secondary btn-sm p-1.5"
													title="Copy link">
													<Link size={12} />
												</button>
												<button
													onClick={() => setQrModal(t)}
													className="btn-secondary btn-sm p-1.5"
													title="QR code">
													<QrCode size={12} />
												</button>
												<button
													onClick={() =>
														handleDownload(
															t.token || t.id,
															t.original_filename || "download",
														)
													}
													className="btn-primary btn-sm"
													title="Download">
													<Download size={12} /> Download
												</button>
											</>
										)}
										<button
											onClick={() => deleteMutation.mutate(t.id)}
											className="btn-ghost btn-sm p-1.5 text-red-400 hover:text-red-300"
											title="Delete">
											<Trash2 size={12} />
										</button>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>

			{/* QR Modal */}
			{qrModal && (
				<div className="modal-backdrop" onClick={() => setQrModal(null)}>
					<div
						className="modal-box max-w-sm text-center"
						onClick={(e) => e.stopPropagation()}>
						<div className="modal-header justify-center">
							<h3 className="font-semibold text-white flex items-center gap-2">
								<QrCode size={16} /> Download QR Code
							</h3>
						</div>
						<div className="modal-body">
							<div className="bg-white p-4 rounded-xl mx-auto w-fit mb-4">
								<QRCodeSVG
									value={`${window.location.origin}/api/v1/file-transfer/download/${qrModal.token}/`}
									size={160}
									bgColor="#ffffff"
									fgColor="#000000"
									level="M"
								/>
							</div>
							<p className="text-slate-400 text-sm">
								{qrModal.original_filename}
							</p>
							<p className="text-xs text-slate-500 mt-1">
								Scan on any device on the campus network
							</p>
							<button
								onClick={() => copyLink(qrModal.token || qrModal.id)}
								className="btn-secondary w-full mt-4">
								<Link size={13} /> Copy Link Instead
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
