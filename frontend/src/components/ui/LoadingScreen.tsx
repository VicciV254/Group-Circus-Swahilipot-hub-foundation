// Swahilipot Loading Screen
import { Zap } from "lucide-react";

export default function LoadingScreen() {
	return (
		<div className="fixed inset-0 bg-surface flex items-center justify-center z-50">
			<div className="text-center">
				<div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-Swahilipot shadow-Swahilipot mb-6 animate-bounce-subtle">
					<Zap size={28} className="text-white" />
				</div>
				<div className="font-display font-bold text-2xl text-white mb-2">
					Swahilipot
				</div>
				<div className="flex items-center justify-center gap-1.5 mt-4">
					{[0, 1, 2].map((i) => (
						<div
							key={i}
							className="w-2 h-2 rounded-full bg-Swahilipot-500 animate-bounce"
							style={{ animationDelay: `${i * 0.15}s` }}
						/>
					))}
				</div>
				<p className="text-slate-500 text-sm mt-4">Loading system...</p>
			</div>
		</div>
	);
}
