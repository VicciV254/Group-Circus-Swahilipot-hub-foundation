// pages/fm/fmShared.tsx
// Shared primitives used by both FmOpsPage.tsx and FmOpsExtraTabs.tsx.
// Keeping these in one place avoids duplicating the modal/spinner/empty-state
// markup (and its styling) across every tab file.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import clsx from "clsx";
import { isAxiosError } from "../../services/Fmreportapi";

export const SEVERITY_STYLES: Record<string, string> = {
	low: "badge-blue",
	medium: "badge-amber",
	high: "badge-red",
	critical: "badge-red",
	minor: "badge-blue",
	moderate: "badge-amber",
};

export function errorMessage(e: unknown, fallback: string): string {
	if (isAxiosError(e)) return e.response?.data?.detail || e.message || fallback;
	return fallback;
}

export function fieldErrorsFrom(e: unknown): Record<string, string> {
	if (!isAxiosError(e)) return {};
	const data = e.response?.data;
	if (!data || typeof data !== "object") return {};
	const out: Record<string, string> = {};
	for (const [field, msgs] of Object.entries(data)) {
		out[field] = Array.isArray(msgs) ? msgs.join(" ") : String(msgs);
	}
	return out;
}

export function StatCard({
	icon: Icon,
	label,
	value,
	tone,
}: {
	icon: any;
	label: string;
	value: number | string;
	tone: "green" | "red" | "slate" | "amber" | "blue";
}) {
	return (
		<div className="card flex items-center gap-3">
			<div
				className={clsx(
					"w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
					{
						"bg-green-500/15 text-green-400": tone === "green",
						"bg-red-500/15 text-red-400": tone === "red",
						"bg-slate-500/15 text-slate-400": tone === "slate",
						"bg-amber-500/15 text-amber-400": tone === "amber",
						"bg-blue-500/15 text-blue-400": tone === "blue",
					},
				)}>
				<Icon size={18} />
			</div>
			<div>
				<div className="text-xl font-bold text-white">{value}</div>
				<div className="text-xs text-slate-500">{label}</div>
			</div>
		</div>
	);
}

export function EmptyState({
	icon: Icon,
	message,
}: {
	icon: any;
	message: string;
}) {
	return (
		<div className="card text-center py-14">
			<Icon size={36} className="mx-auto text-slate-500 mb-3 opacity-50" />
			<p className="text-slate-400">{message}</p>
		</div>
	);
}

export function ErrorBanner({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) {
	return (
		<div className="p-4 rounded-xl border border-red-500/40 bg-red-900/10 flex items-center gap-3">
			<X size={20} className="text-red-400 shrink-0 rotate-45" />
			<div className="flex-1">
				<span className="font-semibold text-red-400 text-sm block">
					Something went wrong
				</span>
				<span className="text-xs text-slate-400">{message}</span>
			</div>
			<button onClick={onRetry} className="btn-secondary btn-sm">
				Retry
			</button>
		</div>
	);
}

export function Spinner({ light }: { light?: boolean }) {
	return (
		<span
			className={clsx(
				"w-3.5 h-3.5 border-2 rounded-full animate-spin",
				light
					? "border-white/30 border-t-white"
					: "border-current/30 border-t-current",
			)}
		/>
	);
}

export function Field({
	label,
	hint,
	error,
	children,
}: {
	label: string;
	hint?: string;
	error?: string;
	children: ReactNode;
}) {
	return (
		<div className="input-group">
			<label className="input-label">{label}</label>
			{children}
			{hint && !error && (
				<p className="text-[11px] text-slate-500 mt-1">{hint}</p>
			)}
			{error && <p className="text-xs text-red-400 mt-1">{error}</p>}
		</div>
	);
}

export function Modal({
	onClose,
	labelledBy,
	maxWidth = "max-w-lg",
	children,
}: {
	onClose: () => void;
	labelledBy: string;
	maxWidth?: string;
	children: ReactNode;
}) {
	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby={labelledBy}
				className={clsx(
					"modal-box max-h-[90vh] overflow-y-auto relative",
					maxWidth,
				)}
				onClick={(e) => e.stopPropagation()}>
				<button
					onClick={onClose}
					aria-label="Close"
					className="absolute top-4 right-4 text-slate-400 hover:text-white z-10">
					<X size={18} />
				</button>
				{children}
			</div>
		</div>
	);
}

export const WEEKDAYS = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
];

export function formatTime(t: string): string {
	// "14:30:00" -> "2:30 PM"
	const [h, m] = t.split(":").map(Number);
	const period = h >= 12 ? "PM" : "AM";
	const hour12 = h % 12 || 12;
	return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * State that persists to localStorage under `key`. Used for things that
 * should survive a page refresh but don't belong on the server — player
 * volume, favorite stations, etc. Fails silently in private-browsing /
 * storage-disabled contexts instead of throwing.
 */
export function useStickyState<T>(defaultValue: T, key: string) {
	const [value, setValue] = useState<T>(() => {
		if (typeof window === "undefined") return defaultValue;
		try {
			const stored = window.localStorage.getItem(key);
			return stored !== null ? (JSON.parse(stored) as T) : defaultValue;
		} catch {
			return defaultValue;
		}
	});

	useEffect(() => {
		try {
			window.localStorage.setItem(key, JSON.stringify(value));
		} catch {
			/* storage unavailable — non-critical, value just won't persist */
		}
	}, [key, value]);

	return [value, setValue] as const;
}

/**
 * A horizontally-scrollable row that's CONTAINED to its own width (never
 * forces the page to scroll horizontally, unlike a `w-fit` flex row) and
 * shows fade-out edges + chevron buttons whenever there's more content off
 * to one side. Used for the main tab strip and any other pill/chip row that
 * might overflow on small screens.
 */
export function ScrollFadeRow({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	const scrollerRef = useRef<HTMLDivElement | null>(null);
	const [atStart, setAtStart] = useState(true);
	const [atEnd, setAtEnd] = useState(true);

	const updateEdges = () => {
		const el = scrollerRef.current;
		if (!el) return;
		setAtStart(el.scrollLeft <= 2);
		setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
	};

	useEffect(() => {
		updateEdges();
		const el = scrollerRef.current;
		if (!el) return;
		const ro = new ResizeObserver(updateEdges);
		ro.observe(el);
		window.addEventListener("resize", updateEdges);
		return () => {
			ro.disconnect();
			window.removeEventListener("resize", updateEdges);
		};
	}, []);

	const scrollByAmount = (dx: number) =>
		scrollerRef.current?.scrollBy({ left: dx, behavior: "smooth" });

	// Fade the edges with a mask-image rather than a background-color
	// gradient, so it works correctly regardless of what's behind it.
	const maskImage = `linear-gradient(to right, ${
		atStart ? "black" : "transparent"
	} 0, black 20px, black calc(100% - 20px), ${atEnd ? "black" : "transparent"} 100%)`;

	return (
		<div className={clsx("relative", className)}>
			{!atStart && (
				<button
					type="button"
					aria-label="Scroll left"
					onClick={() => scrollByAmount(-160)}
					className="hidden sm:flex absolute left-0.5 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-surface-card border border-surface-border items-center justify-center text-slate-300 hover:text-white shadow">
					<ChevronLeft size={13} />
				</button>
			)}
			<div
				ref={scrollerRef}
				onScroll={updateEdges}
				style={{ WebkitMaskImage: maskImage, maskImage }}
				className="flex gap-1 overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				{children}
			</div>
			{!atEnd && (
				<button
					type="button"
					aria-label="Scroll right"
					onClick={() => scrollByAmount(160)}
					className="hidden sm:flex absolute right-0.5 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-surface-card border border-surface-border items-center justify-center text-slate-300 hover:text-white shadow">
					<ChevronRight size={13} />
				</button>
			)}
		</div>
	);
}
