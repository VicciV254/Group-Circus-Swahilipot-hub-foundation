// Nexus — Public Certificate Verification Page
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
	Award,
	CheckCircle,
	XCircle,
	Shield,
	Star,
	Loader2,
} from "lucide-react";
import { certificatesApi } from "../../services/api";

const TYPE_ICONS: Record<string, any> = {
	"Certificate of Completion": Award,
	"Recommendation Letter": Star,
	"Achievement Award": Award,
	"Participation Certificate": Shield,
};

export default function VerifyPage() {
	const { code } = useParams<{ code: string }>();
	const [result, setResult] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);

	useEffect(() => {
		if (!code) return;
		certificatesApi
			.verify(code)
			.then((r) => setResult(r.data))
			.catch(() => setError(true))
			.finally(() => setLoading(false));
	}, [code]);

	return (
		<div className="min-h-screen bg-[#0f1320] flex items-center justify-center p-4">
			<div className="w-full max-w-md">
				{/* Header */}
				<div className="text-center mb-8">
					<div className="w-12 h-12 rounded-2xl bg-Nexus-500/20 flex items-center justify-center mx-auto mb-3">
						<Award size={24} className="text-Nexus-400" />
					</div>
					<h1 className="text-xl font-bold text-white">
						Certificate Verification
					</h1>
					<p className="text-sm text-slate-400 mt-1">
						Swahilipot Foundation Management System
					</p>
				</div>

				{/* Card */}
				<div className="bg-[#151c2e] border border-[#1e2a42] rounded-2xl p-6">
					{loading && (
						<div className="flex flex-col items-center py-8 gap-3">
							<Loader2 size={28} className="text-Nexus-400 animate-spin" />
							<p className="text-sm text-slate-400">Verifying certificate...</p>
						</div>
					)}

					{error && (
						<div className="flex flex-col items-center py-8 gap-3">
							<XCircle size={40} className="text-red-400" />
							<p className="text-white font-semibold">Verification Failed</p>
							<p className="text-sm text-slate-400 text-center">
								This certificate could not be found. It may be invalid or have
								been revoked.
							</p>
						</div>
					)}

					{result && !loading && (
						<>
							{/* Valid / Invalid banner */}
							<div
								className={`flex items-center gap-3 rounded-xl p-3 mb-6 ${
									result.valid
										? "bg-green-500/10 border border-green-500/20"
										: "bg-red-500/10 border border-red-500/20"
								}`}>
								{result.valid ? (
									<CheckCircle size={20} className="text-green-400 shrink-0" />
								) : (
									<XCircle size={20} className="text-red-400 shrink-0" />
								)}
								<div>
									<p
										className={`text-sm font-semibold ${result.valid ? "text-green-400" : "text-red-400"}`}>
										{result.valid ? "Valid Certificate" : "Invalid Certificate"}
									</p>
									<p className="text-xs text-slate-400">
										{result.valid
											? "This certificate is authentic and verified."
											: `Status: ${result.status}`}
									</p>
								</div>
							</div>

							{/* Certificate details */}
							<div className="space-y-3">
								{[
									{
										label: "Certificate Number",
										value: result.certificate_number,
									},
									{ label: "Type", value: result.certificate_type },
									{ label: "Recipient", value: result.recipient_name },
									{
										label: "Issue Date",
										value: result.issue_date
											? format(parseISO(result.issue_date), "dd MMMM yyyy")
											: "—",
									},
									{ label: "Signed By", value: result.signed_by_name || "—" },
									{ label: "Title", value: result.signed_by_title || "—" },
									{ label: "Organisation", value: result.organisation },
								].map(({ label, value }) => (
									<div
										key={label}
										className="flex justify-between items-start gap-4 text-sm">
										<span className="text-slate-500 shrink-0">{label}</span>
										<span className="text-white font-medium text-right">
											{value}
										</span>
									</div>
								))}
							</div>

							<div className="mt-6 pt-4 border-t border-[#1e2a42] text-center">
								<p className="text-[11px] text-slate-500">
									Verified on {format(new Date(), "dd MMM yyyy, HH:mm")} · Swahilipot
									Certificate Authority
								</p>
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
