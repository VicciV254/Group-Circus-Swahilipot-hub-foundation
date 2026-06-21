// pages/fm/FmOpsExtraTabs.tsx
// Additional tabs for the Broadcast Operations Center: live audio player,
// programme schedule, station map, analytics/SLA dashboard, audit activity
// feed, and the settings panel (notification preferences + role management).
import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
	type RefObject,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
	Play,
	Pause,
	Volume2,
	VolumeX,
	Radio,
	MapPin,
	Calendar,
	Plus,
	Pencil,
	Trash2,
	TrendingUp,
	TrendingDown,
	Activity,
	Gauge,
	Thermometer,
	History,
	Bell,
	Mail,
	MessageSquare,
	Users,
	Shield,
	Send,
	AlertTriangle,
	CheckCircle,
	Heart,
	Share2,
	Search,
	Timer,
	Music2,
	Maximize2,
	Minimize2,
} from "lucide-react";
import clsx from "clsx";
import toast from "react-hot-toast";
import {
	fmReportApi,
	type FMStation,
	type ProgrammeSlot,
	type TransmitterReading,
	type NotificationPreference,
	type OrgMember,
	type PresetStream,
} from "../../services/Fmreportapi";
import {
	errorMessage,
	fieldErrorsFrom,
	StatCard,
	EmptyState,
	ErrorBanner,
	Spinner,
	Field,
	Modal,
	WEEKDAYS,
	formatTime,
	useStickyState,
} from "./Fmshared";

// ═══════════════════════════════════════════════════════════════════════════
// LIVE PLAYER
// ═══════════════════════════════════════════════════════════════════════════
//
// Architecture note: the actual playback engine (the <audio> element, the
// Web Audio analyser graph, volume/mute, favorites, sleep timer, recently
// played) lives in <PlayerProvider> — mounted once around the whole ops
// page in FMReportPage.tsx — instead of inside this tab. That's what lets
// a station keep playing in the background (via <MiniPlayerBar/>) while you
// switch to Outage History, Schedule, etc., instead of audio cutting out
// the moment you click away from this tab.

// Quick-pick streams available even before any station is configured in the
// database. Configured backend-side via the FM_PRESET_STREAMS_JSON env var
// (see backend/.env) and fetched below with usePresetStreams() — nothing is
// hardcoded here, so ops can add/change these without a frontend deploy.

interface PlayableStream {
	id: string;
	name: string;
	frequency: string;
	stream_url: string;
	location?: string;
	current_status?: FMStation["current_status"];
	isPreset: boolean;
}

// ─── Web Audio wiring ───────────────────────────────────────────────────────
// A given <audio> element can only ever have ONE MediaElementSourceNode
// created from it (the browser throws on a second attempt), so this graph is
// built exactly once and shared via context — every visualizer instance
// (the big one in the tab, the small one in the mini-player) reads from the
// same AnalyserNode.
function useAudioGraph(audioRef: RefObject<HTMLAudioElement | null>) {
	const ctxRef = useRef<AudioContext | null>(null);
	const analyserRef = useRef<AnalyserNode | null>(null);
	const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
	const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

	// Must be called (and awaited) from inside a user-gesture handler (the
	// play button click) — browsers block AudioContext creation/resume
	// outside one, and a suspended context silently produces NO sound even
	// though playback otherwise looks like it's working (the visualizer
	// keeps drawing its idle/ambient animation regardless).
	const ensureGraph = async () => {
		const el = audioRef.current;
		if (!el) return;
		try {
			if (!ctxRef.current) {
				const AudioCtxClass: typeof AudioContext | undefined =
					window.AudioContext || (window as any).webkitAudioContext;
				if (!AudioCtxClass) return; // Unsupported browser — visualizer just stays in ambient mode.
				ctxRef.current = new AudioCtxClass();
			}
			if (!sourceRef.current) {
				sourceRef.current = ctxRef.current.createMediaElementSource(el);
				const analyser = ctxRef.current.createAnalyser();
				analyser.fftSize = 256;
				analyser.smoothingTimeConstant = 0.78;
				// Route audio THROUGH the analyser back out to the speakers —
				// otherwise connecting the source here would go silent.
				sourceRef.current.connect(analyser);
				analyser.connect(ctxRef.current.destination);
				analyserRef.current = analyser;
				dataRef.current = new Uint8Array(analyser.frequencyBinCount);
			}
			// Resolved BEFORE play() proceeds — while suspended, the routed
			// graph isn't processing audio yet, which on stricter browsers
			// can leave playback silent indefinitely rather than just
			// delayed by a beat.
			if (ctxRef.current.state === "suspended") {
				await ctxRef.current.resume();
			}
		} catch (err) {
			// createMediaElementSource throws if this <audio> element was
			// already captured by a different AudioContext — most often
			// left over from a dev-server hot-reload while the page was
			// open. Web Audio reroutes a captured element's output for its
			// whole lifetime with no way to undo it, so when that happens
			// native playback can be left silently broken until a full,
			// hard page reload creates a fresh, uncaptured element.
			console.warn(
				"[fm_report] Web Audio visualizer setup failed — if there's no sound, try a hard page reload (Ctrl/Cmd+Shift+R). Falling back to the ambient visualizer animation.",
				err,
			);
		}
	};

	return { analyserRef, dataRef, ensureGraph };
}

// ─── Shared player context ──────────────────────────────────────────────────

interface PlayerContextValue {
	stream: PlayableStream | null;
	setStream: (s: PlayableStream) => void;
	playing: boolean;
	loading: boolean;
	loadError: string | null;
	toggle: () => void;
	volume: number;
	setVolume: (v: number) => void;
	muted: boolean;
	toggleMute: () => void;
	audioRef: RefObject<HTMLAudioElement | null>;
	analyserRef: RefObject<AnalyserNode | null>;
	dataRef: RefObject<Uint8Array<ArrayBuffer> | null>;
	favorites: string[];
	toggleFavorite: (id: string) => void;
	recentlyPlayed: PlayableStream[];
	sleepTimerEndsAt: number | null;
	setSleepTimer: (minutes: number | null) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
	const ctx = useContext(PlayerContext);
	if (!ctx) throw new Error("usePlayer() must be used inside <PlayerProvider>");
	return ctx;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [stream, setStreamState] = useState<PlayableStream | null>(null);
	const [playing, setPlaying] = useState(false);
	const [loading, setLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [volume, setVolumeState] = useStickyState(0.8, "fm-player-volume");
	const [muted, setMuted] = useState(false);
	const [favorites, setFavorites] = useStickyState<string[]>(
		[],
		"fm-player-favorites",
	);
	const [recentlyPlayed, setRecentlyPlayed] = useState<PlayableStream[]>([]);
	const [sleepTimerEndsAt, setSleepTimerEndsAt] = useState<number | null>(null);
	const sleepTimeoutRef = useRef<number | null>(null);

	const { analyserRef, dataRef, ensureGraph } = useAudioGraph(audioRef);

	const setStream = (s: PlayableStream) => {
		setStreamState(s);
		setRecentlyPlayed((prev) =>
			[s, ...prev.filter((p) => p.id !== s.id)].slice(0, 6),
		);
	};

	// Reset playback state whenever the selected stream changes — otherwise
	// the play button shows "playing" for a stream that never loaded, and a
	// previous stream would keep playing silently in the background.
	useEffect(() => {
		const el = audioRef.current;
		if (el) {
			el.pause();
			el.currentTime = 0;
		}
		setPlaying(false);
		setLoadError(null);
		setLoading(false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [stream?.id]);

	const toggle = async () => {
		const el = audioRef.current;
		if (!el || !stream) return;
		if (playing) {
			el.pause();
			setPlaying(false);
			return;
		}
		try {
			setLoading(true);
			setLoadError(null);
			// Web Audio is a visual nicety on top of playback, never a
			// prerequisite for it — a hiccup here must never block sound.
			await ensureGraph().catch(() => {});
			await el.play();
			setPlaying(true);
		} catch {
			setLoadError(
				"Couldn't start playback. The stream may be offline or blocked by your browser.",
			);
		} finally {
			setLoading(false);
		}
	};

	const setVolume = (v: number) => {
		const clamped = Math.max(0, Math.min(1, v));
		setVolumeState(clamped);
		if (audioRef.current) audioRef.current.volume = clamped;
		if (clamped > 0 && muted) {
			setMuted(false);
			if (audioRef.current) audioRef.current.muted = false;
		}
	};

	const toggleMute = () => {
		setMuted((m) => {
			if (audioRef.current) audioRef.current.muted = !m;
			return !m;
		});
	};

	const toggleFavorite = (id: string) =>
		setFavorites((prev) =>
			prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id],
		);

	const setSleepTimer = (minutes: number | null) => {
		if (sleepTimeoutRef.current) {
			window.clearTimeout(sleepTimeoutRef.current);
			sleepTimeoutRef.current = null;
		}
		if (minutes === null) {
			setSleepTimerEndsAt(null);
			return;
		}
		const endsAt = Date.now() + minutes * 60_000;
		setSleepTimerEndsAt(endsAt);
		sleepTimeoutRef.current = window.setTimeout(() => {
			audioRef.current?.pause();
			setPlaying(false);
			setSleepTimerEndsAt(null);
			toast("Sleep timer ended — playback paused");
		}, minutes * 60_000);
	};

	// Apply persisted volume/mute to the <audio> element on mount.
	useEffect(() => {
		if (audioRef.current) {
			audioRef.current.volume = volume;
			audioRef.current.muted = muted;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// MediaSession integration — OS lock-screen / hardware media-key controls.
	useEffect(() => {
		if (
			!stream ||
			typeof navigator === "undefined" ||
			!("mediaSession" in navigator)
		) {
			return;
		}
		try {
			navigator.mediaSession.metadata = new MediaMetadata({
				title: stream.name,
				artist: stream.frequency,
				album: "Nexus FM — Live Radio",
			});
			navigator.mediaSession.playbackState = playing ? "playing" : "paused";
			navigator.mediaSession.setActionHandler("play", () => toggle());
			navigator.mediaSession.setActionHandler("pause", () => toggle());
		} catch {
			/* MediaSession not fully supported in this browser — non-critical */
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [stream?.id, playing]);

	useEffect(
		() => () => {
			if (sleepTimeoutRef.current) window.clearTimeout(sleepTimeoutRef.current);
		},
		[],
	);

	return (
		<PlayerContext.Provider
			value={{
				stream,
				setStream,
				playing,
				loading,
				loadError,
				toggle,
				volume,
				setVolume,
				muted,
				toggleMute,
				audioRef,
				analyserRef,
				dataRef,
				favorites,
				toggleFavorite,
				recentlyPlayed,
				sleepTimerEndsAt,
				setSleepTimer,
			}}>
			{children}
			<audio
				ref={audioRef}
				src={stream?.stream_url}
				preload="none"
				onEnded={() => setPlaying(false)}
				onError={() => {
					setLoadError("Stream failed to load. It may be temporarily offline.");
					setPlaying(false);
				}}
			/>
		</PlayerContext.Provider>
	);
}

// ─── Canvas frequency visualizer ────────────────────────────────────────────
// Reads real FFT data from the shared AnalyserNode and draws a mirrored bar
// spectrum that genuinely rises and falls with the audio. Internet radio
// streams frequently omit CORS headers — when that happens the browser
// silently zeroes out analyser data (playback is unaffected, only the raw
// samples are blocked for privacy reasons). Rather than show a dead flat
// line in that case, this falls back to a layered-sine "ambient" animation
// after ~1.5s of true silence, so the visualizer always feels alive.
function Visualizer({
	analyserRef,
	dataRef,
	playing,
	size = "lg",
}: {
	analyserRef: RefObject<AnalyserNode | null>;
	dataRef: RefObject<Uint8Array<ArrayBuffer> | null>;
	playing: boolean;
	size?: "lg" | "sm";
}) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [mode, setMode] = useState<"live" | "ambient" | "idle">("idle");

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx2d = canvas.getContext("2d");
		if (!ctx2d) return;

		const BARS = size === "lg" ? 48 : 22;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const heights = new Array(BARS).fill(0.05);
		let flatFrames = 0;
		let phase = 0;
		let raf = 0;

		const resize = () => {
			const rect = canvas.getBoundingClientRect();
			canvas.width = Math.max(1, Math.floor(rect.width * dpr));
			canvas.height = Math.max(1, Math.floor(rect.height * dpr));
		};
		resize();
		window.addEventListener("resize", resize);

		const roundRect = (
			x: number,
			y: number,
			w: number,
			h: number,
			r: number,
		) => {
			const rad = Math.min(r, w / 2, h / 2);
			ctx2d.beginPath();
			ctx2d.moveTo(x + rad, y);
			ctx2d.arcTo(x + w, y, x + w, y + h, rad);
			ctx2d.arcTo(x + w, y + h, x, y + h, rad);
			ctx2d.arcTo(x, y + h, x, y, rad);
			ctx2d.arcTo(x, y, x + w, y, rad);
			ctx2d.closePath();
		};

		const draw = () => {
			raf = requestAnimationFrame(draw);
			const w = canvas.width;
			const h = canvas.height;
			ctx2d.clearRect(0, 0, w, h);

			if (!playing) {
				flatFrames = 0;
				setMode((m) => (m !== "idle" ? "idle" : m));
				for (let i = 0; i < BARS; i++) heights[i] += (0.04 - heights[i]) * 0.08;
			} else {
				const analyser = analyserRef.current;
				const data = dataRef.current;
				let usingLive = false;
				if (analyser && data) {
					analyser.getByteFrequencyData(data);
					let sum = 0;
					for (let i = 0; i < data.length; i++) sum += data[i];
					const avg = sum / data.length;
					if (avg > 2) {
						usingLive = true;
						flatFrames = 0;
						const step = Math.max(1, Math.floor(data.length / BARS));
						for (let i = 0; i < BARS; i++) {
							const v = data[Math.min(i * step, data.length - 1)] / 255;
							heights[i] += (v - heights[i]) * 0.35;
						}
					} else {
						flatFrames++;
					}
				} else {
					flatFrames++;
				}
				if (!usingLive) {
					// Procedural fallback so the visualizer keeps "breathing"
					// even when real spectrum data isn't reachable.
					phase += 0.06;
					for (let i = 0; i < BARS; i++) {
						const t = phase + i * 0.35;
						const v =
							0.32 +
							0.22 * Math.sin(t) +
							0.14 * Math.sin(t * 2.3 + i) +
							0.08 * Math.sin(t * 0.5);
						heights[i] += (Math.max(0.05, v) - heights[i]) * 0.18;
					}
				}
				const next: "live" | "ambient" = usingLive ? "live" : "ambient";
				if (usingLive || flatFrames > 90) {
					setMode((m) => (m !== next ? next : m));
				}
			}

			const gap = w / BARS;
			const barW = gap * 0.6;
			for (let i = 0; i < BARS; i++) {
				const bh = heights[i] * h * 0.92;
				const x = i * gap + (gap - barW) / 2;
				const y = (h - bh) / 2;
				const grad = ctx2d.createLinearGradient(0, y, 0, y + bh);
				grad.addColorStop(0, "rgba(129,140,248,0.95)");
				grad.addColorStop(1, "rgba(192,132,252,0.55)");
				ctx2d.fillStyle = grad;
				roundRect(x, y, barW, Math.max(bh, 2), Math.min(barW / 2, 6 * dpr));
				ctx2d.fill();
			}
		};
		draw();

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("resize", resize);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [playing, size]);

	return (
		<div className="relative w-full">
			<canvas
				ref={canvasRef}
				className={clsx(
					"w-full rounded-xl bg-black/30",
					size === "lg" ? "h-28 sm:h-36" : "h-9",
				)}
			/>
			{size === "lg" && playing && (
				<span
					className={clsx(
						"absolute top-2 right-2 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full",
						mode === "live"
							? "bg-green-500/20 text-green-300"
							: "bg-slate-500/30 text-slate-300",
					)}>
					{mode === "live" ? "● Live Spectrum" : "≈ Ambient"}
				</span>
			)}
		</div>
	);
}

// ─── Mini player (persists across every tab once a stream is chosen) ───────

export function MiniPlayerBar() {
	const {
		stream,
		playing,
		loading,
		toggle,
		volume,
		setVolume,
		muted,
		toggleMute,
		analyserRef,
		dataRef,
		sleepTimerEndsAt,
	} = usePlayer();

	if (!stream) return null;

	return (
		<div className="fixed bottom-0 left-0 right-0 z-30 border-t border-surface-border bg-surface-card/95 backdrop-blur">
			<div className="max-w-screen-2xl mx-auto px-3 sm:px-6 py-2.5 flex items-center gap-3">
				<button
					onClick={toggle}
					disabled={loading}
					aria-label={playing ? "Pause" : "Play"}
					className="w-9 h-9 rounded-full bg-nexus-600 hover:bg-nexus-500 text-white flex items-center justify-center shrink-0 disabled:opacity-60">
					{loading ? (
						<Spinner light />
					) : playing ? (
						<Pause size={15} />
					) : (
						<Play size={15} />
					)}
				</button>
				<div className="min-w-0 flex-1 sm:flex-initial sm:w-44">
					<div className="text-sm font-medium text-white truncate flex items-center gap-1.5">
						<Radio size={11} className="text-nexus-400 shrink-0" />
						{stream.name}
					</div>
					<div className="text-[11px] text-slate-500 truncate">
						{stream.frequency}
					</div>
				</div>
				<div className="hidden sm:block flex-1 max-w-xs">
					<Visualizer
						analyserRef={analyserRef}
						dataRef={dataRef}
						playing={playing}
						size="sm"
					/>
				</div>
				<div className="hidden md:flex items-center gap-2 w-28 shrink-0">
					<button
						onClick={toggleMute}
						aria-label={muted ? "Unmute" : "Mute"}
						className="text-slate-400 hover:text-white shrink-0">
						{muted || volume === 0 ? (
							<VolumeX size={15} />
						) : (
							<Volume2 size={15} />
						)}
					</button>
					<input
						type="range"
						min={0}
						max={1}
						step={0.01}
						value={muted ? 0 : volume}
						onChange={(e) => setVolume(Number(e.target.value))}
						aria-label="Volume"
						className="flex-1 accent-nexus-500"
					/>
				</div>
				{sleepTimerEndsAt && <SleepCountdown endsAt={sleepTimerEndsAt} />}
				{playing && (
					<span className="hidden sm:flex items-center gap-1 text-[10px] font-semibold text-green-400 shrink-0">
						<span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
						LIVE
					</span>
				)}
			</div>
		</div>
	);
}

function SleepCountdown({ endsAt }: { endsAt: number }) {
	const [, tick] = useState(0);
	useEffect(() => {
		const id = window.setInterval(() => tick((n) => n + 1), 1000);
		return () => window.clearInterval(id);
	}, []);
	const remainingMs = Math.max(0, endsAt - Date.now());
	const mins = Math.floor(remainingMs / 60_000);
	const secs = Math.floor((remainingMs % 60_000) / 1000);
	return (
		<span className="hidden lg:flex items-center gap-1 text-[10px] text-amber-300 shrink-0">
			<Timer size={11} /> {mins}:{String(secs).padStart(2, "0")}
		</span>
	);
}

// ─── Full live player tab ───────────────────────────────────────────────────

export function LivePlayerTab({ stations }: { stations: FMStation[] }) {
	const { stream, setStream, favorites } = usePlayer();
	const [query, setQuery] = useState("");

	// Backend-configured "quick streams" — see FM_PRESET_STREAMS_JSON in
	// backend/.env. Cached for 5 minutes since these change rarely.
	const { data: presetStreams, isLoading: presetsLoading } = useQuery({
		queryKey: ["fm-preset-streams"],
		queryFn: () => fmReportApi.listPresetStreams().then((r) => r.data),
		staleTime: 5 * 60_000,
	});

	const configured: PlayableStream[] = stations
		.filter((s) => s.stream_url)
		.map((s) => ({
			id: s.id,
			name: s.name,
			frequency: s.frequency,
			stream_url: s.stream_url,
			location: s.location,
			current_status: s.current_status,
			isPreset: false,
		}));
	const presets: PlayableStream[] = (presetStreams || []).map(
		(p: PresetStream) => ({
			...p,
			isPreset: true,
		}),
	);
	const all = [...configured, ...presets];

	// Auto-select the first available stream once, without ever clobbering a
	// selection the user (or the mini-player) already made.
	useEffect(() => {
		if (!stream && all.length > 0) setStream(all[0]);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [all.length]);

	if (all.length === 0) {
		if (presetsLoading) {
			return (
				<div className="card flex flex-col items-center gap-3 text-center py-14">
					<Spinner />
					<span className="text-slate-400 text-sm">Loading streams…</span>
				</div>
			);
		}
		return (
			<EmptyState
				icon={Radio}
				message="No stations have a live stream URL configured"
			/>
		);
	}

	const filtered = all.filter((s) =>
		`${s.name} ${s.frequency} ${s.location || ""}`
			.toLowerCase()
			.includes(query.toLowerCase()),
	);
	const sorted = [...filtered].sort((a, b) => {
		const fa = favorites.includes(a.id) ? 0 : 1;
		const fb = favorites.includes(b.id) ? 0 : 1;
		if (fa !== fb) return fa - fb;
		const sa = a.current_status === "on_air" ? 0 : 1;
		const sb = b.current_status === "on_air" ? 0 : 1;
		if (sa !== sb) return sa - sb;
		return a.name.localeCompare(b.name);
	});

	return (
		<div className="space-y-6">
			{stream && <NowPlayingPanel stream={stream} stations={stations} />}

			<RecentlyPlayedRow onSelect={setStream} />

			<div className="flex items-center gap-3 flex-wrap">
				<div className="relative flex-1 min-w-[180px] max-w-sm">
					<Search
						size={14}
						className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
					/>
					<input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search stations…"
						className="input pl-9"
					/>
				</div>
				<span className="text-xs text-slate-500 shrink-0">
					{sorted.length} stream{sorted.length !== 1 ? "s" : ""}
				</span>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{sorted.map((s) => (
					<StreamCard
						key={s.id}
						s={s}
						active={stream?.id === s.id}
						favorite={favorites.includes(s.id)}
						onSelect={() => setStream(s)}
					/>
				))}
				{sorted.length === 0 && (
					<div className="sm:col-span-2 lg:col-span-3">
						<EmptyState
							icon={Search}
							message={`No stations match "${query}"`}
						/>
					</div>
				)}
			</div>
		</div>
	);
}

function RecentlyPlayedRow({
	onSelect,
}: {
	onSelect: (s: PlayableStream) => void;
}) {
	const { recentlyPlayed, stream } = usePlayer();
	const others = recentlyPlayed.filter((r) => r.id !== stream?.id);
	if (others.length === 0) return null;
	return (
		<div>
			<div className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-1.5">
				<History size={12} /> Recently Played
			</div>
			<div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				{others.map((r) => (
					<button
						key={r.id}
						onClick={() => onSelect(r)}
						className="shrink-0 px-3 py-2 rounded-lg bg-surface-card border border-surface-border text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors whitespace-nowrap">
						{r.name}
					</button>
				))}
			</div>
		</div>
	);
}

function StreamCard({
	s,
	active,
	favorite,
	onSelect,
}: {
	s: PlayableStream;
	active: boolean;
	favorite: boolean;
	onSelect: () => void;
}) {
	const { toggleFavorite } = usePlayer();
	const isOnAir = s.current_status === "on_air";
	const isOffAir = s.current_status === "off_air";
	return (
		<div
			role="button"
			tabIndex={0}
			onClick={onSelect}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") onSelect();
			}}
			className={clsx(
				"card text-left transition-all border-l-4 cursor-pointer",
				active
					? "border-l-nexus-500 ring-1 ring-nexus-500/40"
					: "border-l-transparent hover:border-l-slate-600",
			)}>
			<div className="flex items-center justify-between gap-2">
				<div className="min-w-0">
					<div className="font-semibold text-white text-sm truncate">
						{s.name}
					</div>
					<div className="text-xs text-slate-400 truncate">
						{s.frequency}
						{s.location ? ` · ${s.location}` : ""}
					</div>
				</div>
				<div className="flex items-center gap-1.5 shrink-0">
					<button
						onClick={(e) => {
							e.stopPropagation();
							toggleFavorite(s.id);
						}}
						aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
						className={clsx(
							"p-1 rounded transition-colors",
							favorite ? "text-red-400" : "text-slate-600 hover:text-slate-400",
						)}>
						<Heart size={14} fill={favorite ? "currentColor" : "none"} />
					</button>
					{s.current_status && (
						<span
							className={clsx("badge text-[10px] uppercase", {
								"badge-green": isOnAir,
								"badge-red": isOffAir,
								"badge-slate": !isOnAir && !isOffAir,
							})}>
							{s.current_status.replace("_", " ")}
						</span>
					)}
					{s.isPreset && (
						<span className="badge-slate text-[10px]">Preset</span>
					)}
				</div>
			</div>
		</div>
	);
}

function NowPlayingPanel({
	stream,
	stations,
}: {
	stream: PlayableStream;
	stations: FMStation[];
}) {
	const {
		playing,
		loading,
		loadError,
		toggle,
		volume,
		setVolume,
		muted,
		toggleMute,
		analyserRef,
		dataRef,
		favorites,
		toggleFavorite,
		sleepTimerEndsAt,
		setSleepTimer,
	} = usePlayer();

	const [expanded, setExpanded] = useState(false);
	const isFavorite = favorites.includes(stream.id);
	const fullStation = stations.find((st) => st.id === stream.id);
	const liveStatus = fullStation?.current_status ?? stream.current_status;
	const isOnAir = liveStatus === "on_air";
	const isOffAir = liveStatus === "off_air";

	// Keyboard shortcuts — ignored while typing into any form control.
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
			if (e.code === "Space") {
				e.preventDefault();
				toggle();
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setVolume(volume + 0.05);
			} else if (e.key === "ArrowDown") {
				e.preventDefault();
				setVolume(volume - 0.05);
			} else if (e.key.toLowerCase() === "m") {
				toggleMute();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [volume]);

	const share = async () => {
		const url = stream.stream_url;
		if (typeof navigator !== "undefined" && (navigator as any).share) {
			try {
				await (navigator as any).share({
					title: stream.name,
					text: `Listen to ${stream.name} live`,
					url,
				});
			} catch {
				/* user dismissed the share sheet — not an error */
			}
		} else if (typeof navigator !== "undefined" && navigator.clipboard) {
			await navigator.clipboard.writeText(url);
			toast.success("Stream link copied");
		}
	};

	return (
		<div className="card border-l-4 border-l-nexus-500">
			<div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
				<div
					className={clsx(
						"w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 relative",
						playing ? "bg-nexus-600/20" : "bg-nexus-600/15",
					)}>
					{playing && (
						<>
							<span className="absolute inset-0 rounded-2xl border-2 border-nexus-400/40 animate-ping" />
							<span className="absolute inset-0 rounded-2xl border-2 border-nexus-400/20 animate-pulse" />
						</>
					)}
					<Radio
						size={28}
						className={clsx(
							"text-nexus-400 relative z-10",
							playing && "animate-pulse",
						)}
					/>
				</div>

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 flex-wrap">
						<div className="text-lg font-semibold text-white truncate">
							{stream.name}
						</div>
						<button
							onClick={() => toggleFavorite(stream.id)}
							aria-label={
								isFavorite ? "Remove from favorites" : "Add to favorites"
							}
							className={clsx(
								"transition-colors",
								isFavorite
									? "text-red-400"
									: "text-slate-600 hover:text-slate-400",
							)}>
							<Heart size={15} fill={isFavorite ? "currentColor" : "none"} />
						</button>
					</div>
					<div className="text-sm text-slate-400">
						{stream.frequency}
						{stream.location ? ` · ${stream.location}` : ""}
					</div>
				</div>

				<div className="flex items-center gap-2 shrink-0">
					{liveStatus && (
						<span
							className={clsx("badge text-[10px] uppercase", {
								"badge-green": isOnAir,
								"badge-red": isOffAir,
								"badge-slate": !isOnAir && !isOffAir,
							})}>
							{liveStatus.replace("_", " ")}
						</span>
					)}
					<button
						onClick={share}
						aria-label="Share stream"
						title="Share"
						className="btn-secondary btn-sm px-2">
						<Share2 size={13} />
					</button>
					<button
						onClick={() => setExpanded((v) => !v)}
						aria-label={expanded ? "Collapse visualizer" : "Expand visualizer"}
						title={expanded ? "Collapse visualizer" : "Expand visualizer"}
						className="btn-secondary btn-sm px-2">
						{expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
					</button>
				</div>
			</div>

			{fullStation?.heartbeat_overdue && (
				<div className="mt-3 flex items-center gap-1.5 text-xs text-amber-400">
					<AlertTriangle size={11} /> Heartbeat overdue
				</div>
			)}
			{fullStation?.active_outage && (
				<div className="mt-2 p-2 bg-red-900/20 rounded-lg border border-red-500/20 text-xs text-red-300">
					Down since{" "}
					{format(parseISO(fullStation.active_outage.down_at), "dd MMM, HH:mm")}
					{fullStation.active_outage.description &&
						` — ${fullStation.active_outage.description}`}
				</div>
			)}

			<div className={clsx("mt-4 transition-all", expanded && "h-56 sm:h-64")}>
				<Visualizer
					analyserRef={analyserRef}
					dataRef={dataRef}
					playing={playing}
					size="lg"
				/>
			</div>

			<div className="flex items-center gap-4 mt-5 flex-wrap">
				<button
					onClick={toggle}
					disabled={loading}
					aria-label={playing ? "Pause" : "Play"}
					className={clsx(
						"w-12 h-12 rounded-full text-white flex items-center justify-center shrink-0 transition-all disabled:opacity-50",
						playing
							? "bg-nexus-500 shadow-lg shadow-nexus-500/30"
							: "bg-nexus-600 hover:bg-nexus-500",
					)}>
					{loading ? (
						<Spinner light />
					) : playing ? (
						<Pause size={20} />
					) : (
						<Play size={20} />
					)}
				</button>

				<button
					onClick={toggleMute}
					aria-label={muted ? "Unmute" : "Mute"}
					className="text-slate-400 hover:text-white">
					{muted || volume === 0 ? (
						<VolumeX size={18} />
					) : (
						<Volume2 size={18} />
					)}
				</button>
				<input
					type="range"
					min={0}
					max={1}
					step={0.01}
					value={muted ? 0 : volume}
					onChange={(e) => setVolume(Number(e.target.value))}
					aria-label="Volume"
					className="flex-1 min-w-[100px] accent-nexus-500"
				/>
				<div className="hidden sm:flex items-center gap-0.5 shrink-0">
					{[0, 0.25, 0.5, 0.75, 1].map((v) => (
						<button
							key={v}
							onClick={() => setVolume(v)}
							className="text-[10px] px-1.5 py-1 rounded text-slate-500 hover:text-white hover:bg-white/5">
							{Math.round(v * 100)}%
						</button>
					))}
				</div>

				{playing && (
					<div className="flex items-center gap-1.5 text-xs text-green-400 font-semibold shrink-0">
						<span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
						LIVE
					</div>
				)}
			</div>

			<div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-surface-border/50 flex-wrap">
				<ScheduleStrip stationId={stream.isPreset ? undefined : stream.id} />
				<SleepTimerControl endsAt={sleepTimerEndsAt} onSet={setSleepTimer} />
			</div>

			<p className="text-[11px] text-slate-600 mt-3 hidden sm:block">
				Shortcuts: Space play/pause · ↑ / ↓ volume · M mute
			</p>

			{loadError && (
				<div className="mt-3 p-2.5 bg-red-900/20 rounded-lg border border-red-500/20 text-xs text-red-300 flex items-center gap-2">
					<AlertTriangle size={13} className="shrink-0" /> {loadError}
				</div>
			)}
		</div>
	);
}

function ScheduleStrip({ stationId }: { stationId: string | undefined }) {
	const { data } = useQuery({
		queryKey: ["fm-schedule-now", stationId],
		queryFn: () => fmReportApi.listSchedule(stationId!).then((r) => r.data),
		enabled: !!stationId,
		refetchInterval: 60_000,
	});

	if (!stationId) {
		return (
			<div className="text-xs text-slate-500">
				Quick stream — no programme schedule
			</div>
		);
	}
	if (!data || data.length === 0) {
		return (
			<div className="text-xs text-slate-500">
				No programme schedule set for this station
			</div>
		);
	}

	const now = new Date();
	const weekday = (now.getDay() + 6) % 7; // JS: 0=Sun..6=Sat → backend: 0=Mon..6=Sun
	const hhmmss = format(now, "HH:mm:ss");

	const todays = data
		.filter((s) => s.weekday === weekday)
		.sort((a, b) => a.start_time.localeCompare(b.start_time));
	const current = todays.find(
		(s) => s.start_time <= hhmmss && hhmmss < s.end_time,
	);
	const next =
		todays.find((s) => s.start_time > hhmmss) ||
		[...data]
			.sort(
				(a, b) =>
					a.weekday - b.weekday || a.start_time.localeCompare(b.start_time),
			)
			.find(
				(s) =>
					s.weekday > weekday ||
					(s.weekday === weekday && s.start_time > hhmmss),
			);

	return (
		<div className="flex items-center gap-4 text-xs flex-wrap">
			<div className="flex items-center gap-1.5">
				<Music2 size={12} className="text-nexus-400 shrink-0" />
				<span className="text-slate-500">On now:</span>
				<span className="text-white font-medium">
					{current ? current.title : "—"}
				</span>
				{current?.host && (
					<span className="text-slate-500">w/ {current.host}</span>
				)}
			</div>
			{next && (
				<div className="flex items-center gap-1.5">
					<span className="text-slate-500">Up next:</span>
					<span className="text-slate-300">{next.title}</span>
					<span className="text-slate-600">{formatTime(next.start_time)}</span>
				</div>
			)}
		</div>
	);
}

function SleepTimerControl({
	endsAt,
	onSet,
}: {
	endsAt: number | null;
	onSet: (m: number | null) => void;
}) {
	const [, tick] = useState(0);
	useEffect(() => {
		if (!endsAt) return;
		const id = window.setInterval(() => tick((n) => n + 1), 1000);
		return () => window.clearInterval(id);
	}, [endsAt]);

	if (endsAt) {
		const remainingMs = Math.max(0, endsAt - Date.now());
		const mins = Math.floor(remainingMs / 60_000);
		const secs = Math.floor((remainingMs % 60_000) / 1000);
		return (
			<div className="flex items-center gap-2 text-xs">
				<Timer size={13} className="text-amber-400" />
				<span className="text-amber-300">
					Sleeps in {mins}:{String(secs).padStart(2, "0")}
				</span>
				<button
					onClick={() => onSet(null)}
					className="text-slate-500 hover:text-white underline">
					Cancel
				</button>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-1.5 text-xs">
			<Timer size={13} className="text-slate-500" />
			<span className="text-slate-500">Sleep timer:</span>
			{[15, 30, 45, 60].map((m) => (
				<button
					key={m}
					onClick={() => onSet(m)}
					className="px-1.5 py-0.5 rounded text-slate-400 hover:text-white hover:bg-white/5">
					{m}m
				</button>
			))}
		</div>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULE
// ═══════════════════════════════════════════════════════════════════════════

export function ScheduleTab({
	stations,
	isAdmin,
}: {
	stations: FMStation[];
	isAdmin: boolean;
}) {
	const qc = useQueryClient();
	const [stationId, setStationId] = useState<string | undefined>(
		stations[0]?.id,
	);
	const [formSlot, setFormSlot] = useState<"create" | ProgrammeSlot | null>(
		null,
	);

	const QK = ["fm-schedule", stationId] as const;

	const { data, isLoading, isError, error, refetch } = useQuery({
		queryKey: QK,
		queryFn: () => fmReportApi.listSchedule(stationId!).then((r) => r.data),
		enabled: !!stationId,
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => fmReportApi.deleteSlot(id),
		onSuccess: () => {
			toast.success("Slot removed");
			qc.invalidateQueries({ queryKey: QK });
		},
		onError: (e) => toast.error(errorMessage(e, "Failed to remove slot")),
	});

	const slots = data || [];
	const byDay = useMemo(() => {
		const grouped: ProgrammeSlot[][] = Array.from({ length: 7 }, () => []);
		for (const s of slots) grouped[s.weekday]?.push(s);
		for (const day of grouped)
			day.sort((a, b) => a.start_time.localeCompare(b.start_time));
		return grouped;
	}, [slots]);

	if (stations.length === 0) {
		return (
			<EmptyState
				icon={Calendar}
				message="Add a station first to build its schedule"
			/>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between flex-wrap gap-3">
				<select
					value={stationId}
					onChange={(e) => setStationId(e.target.value)}
					className="select-input w-fit">
					{stations.map((s) => (
						<option key={s.id} value={s.id}>
							{s.name} ({s.frequency})
						</option>
					))}
				</select>
				{isAdmin && (
					<button
						onClick={() => setFormSlot("create")}
						className="btn-primary btn-sm">
						<Plus size={14} /> Add Slot
					</button>
				)}
			</div>

			{isError && (
				<ErrorBanner
					message={errorMessage(error, "Couldn't load schedule.")}
					onRetry={refetch}
				/>
			)}

			{isLoading ? (
				<div className="skeleton h-96 rounded-xl" />
			) : slots.length === 0 ? (
				<EmptyState
					icon={Calendar}
					message="No programme slots scheduled yet"
				/>
			) : (
				<div className="grid grid-cols-1 lg:grid-cols-7 gap-3">
					{WEEKDAYS.map((day, idx) => (
						<div key={day} className="space-y-2">
							<div className="text-xs font-semibold text-slate-400 uppercase text-center">
								{day.slice(0, 3)}
							</div>
							{byDay[idx].length === 0 ? (
								<div className="text-center text-[11px] text-slate-600 py-4">
									—
								</div>
							) : (
								byDay[idx].map((slot) => (
									<div
										key={slot.id}
										className="rounded-lg p-2.5 text-xs group relative"
										style={{
											backgroundColor: `${slot.color}22`,
											borderLeft: `3px solid ${slot.color}`,
										}}>
										<div className="font-semibold text-white truncate">
											{slot.title}
										</div>
										<div className="text-slate-400">
											{formatTime(slot.start_time)}–{formatTime(slot.end_time)}
										</div>
										{slot.host && (
											<div className="text-slate-500 truncate">{slot.host}</div>
										)}
										{isAdmin && (
											<div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
												<button
													onClick={() => setFormSlot(slot)}
													aria-label="Edit slot"
													className="p-1 rounded bg-surface-card/80 hover:bg-surface-card text-slate-300">
													<Pencil size={10} />
												</button>
												<button
													onClick={() =>
														confirm(`Remove "${slot.title}"?`) &&
														deleteMutation.mutate(slot.id)
													}
													aria-label="Delete slot"
													className="p-1 rounded bg-surface-card/80 hover:bg-surface-card text-red-400">
													<Trash2 size={10} />
												</button>
											</div>
										)}
									</div>
								))
							)}
						</div>
					))}
				</div>
			)}

			{formSlot && stationId && (
				<SlotFormModal
					stationId={stationId}
					slot={formSlot === "create" ? null : formSlot}
					onClose={() => setFormSlot(null)}
					onSuccess={() => {
						qc.invalidateQueries({ queryKey: QK });
						setFormSlot(null);
					}}
				/>
			)}
		</div>
	);
}

function SlotFormModal({
	stationId,
	slot,
	onClose,
	onSuccess,
}: {
	stationId: string;
	slot: ProgrammeSlot | null;
	onClose: () => void;
	onSuccess: () => void;
}) {
	const isEdit = !!slot;
	const [form, setForm] = useState({
		title: slot?.title || "",
		host: slot?.host || "",
		description: slot?.description || "",
		weekday: slot?.weekday ?? 0,
		start_time: slot?.start_time?.slice(0, 5) || "09:00",
		end_time: slot?.end_time?.slice(0, 5) || "10:00",
		color: slot?.color || "#3b82f6",
	});
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

	const mutation = useMutation({
		mutationFn: () =>
			isEdit
				? fmReportApi.updateSlot(slot!.id, form)
				: fmReportApi.createSlot(stationId, form),
		onSuccess: () => {
			toast.success(isEdit ? "Slot updated" : "Slot added");
			onSuccess();
		},
		onError: (e) => {
			setFieldErrors(fieldErrorsFrom(e));
			toast.error(errorMessage(e, "Failed to save slot"));
		},
	});

	const canSubmit =
		form.title.trim().length > 0 &&
		form.end_time > form.start_time &&
		!mutation.isPending;

	return (
		<Modal onClose={onClose} labelledBy="slot-form-title">
			<div className="modal-header">
				<h3
					id="slot-form-title"
					className="text-xl font-display font-bold text-white">
					{isEdit ? "Edit Slot" : "Add Programme Slot"}
				</h3>
			</div>
			<div className="modal-body space-y-4">
				<Field label="Show Title *" error={fieldErrors.title}>
					<input
						value={form.title}
						onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
						className="input"
						placeholder="e.g. Morning Drive"
					/>
				</Field>
				<Field label="Host" error={fieldErrors.host}>
					<input
						value={form.host}
						onChange={(e) => setForm((p) => ({ ...p, host: e.target.value }))}
						className="input"
						placeholder="Optional"
					/>
				</Field>
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
					<Field label="Day">
						<select
							value={form.weekday}
							onChange={(e) =>
								setForm((p) => ({ ...p, weekday: Number(e.target.value) }))
							}
							className="select-input">
							{WEEKDAYS.map((d, idx) => (
								<option key={d} value={idx}>
									{d}
								</option>
							))}
						</select>
					</Field>
					<Field label="Start" error={fieldErrors.start_time}>
						<input
							type="time"
							value={form.start_time}
							onChange={(e) =>
								setForm((p) => ({ ...p, start_time: e.target.value }))
							}
							className="input"
						/>
					</Field>
					<Field label="End" error={fieldErrors.end_time}>
						<input
							type="time"
							value={form.end_time}
							onChange={(e) =>
								setForm((p) => ({ ...p, end_time: e.target.value }))
							}
							className="input"
						/>
					</Field>
				</div>
				<Field label="Color" error={fieldErrors.color}>
					<input
						type="color"
						value={form.color}
						onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
						className="h-9 w-20 rounded cursor-pointer"
					/>
				</Field>
				<Field label="Description" error={fieldErrors.description}>
					<textarea
						value={form.description}
						onChange={(e) =>
							setForm((p) => ({ ...p, description: e.target.value }))
						}
						rows={2}
						className="textarea"
						placeholder="Optional"
					/>
				</Field>
			</div>
			<div className="modal-footer">
				<button onClick={onClose} className="btn-secondary">
					Cancel
				</button>
				<button
					disabled={!canSubmit}
					onClick={() => mutation.mutate()}
					className="btn-primary px-8">
					{mutation.isPending ? (
						<Spinner light />
					) : isEdit ? (
						"Save Changes"
					) : (
						"Add Slot"
					)}
				</button>
			</div>
		</Modal>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAP
// ═══════════════════════════════════════════════════════════════════════════

export function MapTab({ stations }: { stations: FMStation[] }) {
	const withLocation = stations.filter((s) => s.location);

	return (
		<div className="space-y-6">
			<div className="card">
				<div className="flex items-center gap-2 mb-4">
					<MapPin size={16} className="text-nexus-400" />
					<h3 className="font-semibold text-white">Transmitter Locations</h3>
				</div>
				{withLocation.length === 0 ? (
					<EmptyState
						icon={MapPin}
						message="No stations have a location set yet"
					/>
				) : (
					<div className="space-y-2">
						{withLocation.map((s) => (
							<div
								key={s.id}
								className="flex items-center justify-between p-3 rounded-lg bg-surface-card/60">
								<div className="flex items-center gap-3">
									<div
										className={clsx("w-2.5 h-2.5 rounded-full shrink-0", {
											"bg-green-400": s.current_status === "on_air",
											"bg-red-400": s.current_status === "off_air",
											"bg-slate-500":
												s.current_status !== "on_air" &&
												s.current_status !== "off_air",
										})}
									/>
									<div>
										<div className="text-sm font-medium text-white">
											{s.name}
										</div>
										<div className="text-xs text-slate-400">{s.frequency}</div>
									</div>
								</div>
								<div className="text-xs text-slate-400 text-right">
									{s.location}
								</div>
							</div>
						))}
					</div>
				)}
				<p className="text-xs text-slate-500 mt-4">
					Embed your preferred mapping provider (Google Maps, Mapbox, Leaflet)
					here using each station's geocoded location to plot live markers.
				</p>
			</div>
		</div>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export function AnalyticsTab({ stations }: { stations: FMStation[] }) {
	const {
		data: outagesPage,
		isLoading,
		isError,
		error,
		refetch,
	} = useQuery({
		queryKey: ["fm-outages-analytics"],
		queryFn: () => fmReportApi.listOutages({ page: 1 }).then((r) => r.data),
	});

	const outages = outagesPage?.results || [];
	const totalOutages = outagesPage?.count ?? outages.length;
	const avgUptime = stations.length
		? Math.round(
				(stations.reduce((sum, s) => sum + s.uptime_percent_today, 0) /
					stations.length) *
					10,
			) / 10
		: 0;
	const criticalOutages = outages.filter(
		(o) => o.severity === "critical",
	).length;
	const avgDuration = (() => {
		const closed = outages.filter((o) => o.duration_minutes !== null);
		if (closed.length === 0) return 0;
		return Math.round(
			closed.reduce((sum, o) => sum + (o.duration_minutes || 0), 0) /
				closed.length,
		);
	})();

	const worstStation = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const o of outages)
			counts[o.station_name] = (counts[o.station_name] || 0) + 1;
		const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
		return entries[0] || null;
	}, [outages]);

	return (
		<div className="space-y-6">
			{isError && (
				<ErrorBanner
					message={errorMessage(error, "Couldn't load analytics.")}
					onRetry={refetch}
				/>
			)}

			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				<StatCard
					icon={TrendingUp}
					label="Avg Uptime Today"
					value={`${avgUptime}%`}
					tone={avgUptime >= 99 ? "green" : avgUptime >= 95 ? "amber" : "red"}
				/>
				<StatCard
					icon={History}
					label="Total Outages (recent)"
					value={totalOutages}
					tone="slate"
				/>
				<StatCard
					icon={TrendingDown}
					label="Critical Outages"
					value={criticalOutages}
					tone={criticalOutages > 0 ? "red" : "slate"}
				/>
				<StatCard
					icon={Activity}
					label="Avg Outage Duration"
					value={`${avgDuration}m`}
					tone="blue"
				/>
			</div>

			<div className="card">
				<h3 className="font-semibold text-white mb-4">Station Reliability</h3>
				{isLoading ? (
					<div className="skeleton h-48 rounded-xl" />
				) : stations.length === 0 ? (
					<EmptyState icon={Activity} message="No stations to analyze yet" />
				) : (
					<div className="space-y-3">
						{stations.map((s) => (
							<div key={s.id} className="flex items-center gap-3">
								<div className="w-32 truncate text-sm text-slate-300">
									{s.name}
								</div>
								<div className="flex-1 h-2 rounded-full bg-surface-card overflow-hidden">
									<div
										className={clsx("h-full rounded-full", {
											"bg-green-500": s.uptime_percent_today >= 99,
											"bg-amber-500":
												s.uptime_percent_today >= 95 &&
												s.uptime_percent_today < 99,
											"bg-red-500": s.uptime_percent_today < 95,
										})}
										style={{ width: `${s.uptime_percent_today}%` }}
									/>
								</div>
								<div className="w-14 text-right text-sm font-medium text-white">
									{s.uptime_percent_today}%
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{worstStation && (
				<div className="p-4 rounded-xl border border-amber-500/30 bg-amber-900/10 flex items-center gap-3">
					<AlertTriangle size={18} className="text-amber-400 shrink-0" />
					<span className="text-sm text-amber-200">
						<strong>{worstStation[0]}</strong> had the most outages recently (
						{worstStation[1]}) — worth a maintenance check.
					</span>
				</div>
			)}

			<TelemetryPanel stations={stations} />
		</div>
	);
}

function TelemetryPanel({ stations }: { stations: FMStation[] }) {
	const [stationId, setStationId] = useState<string | undefined>(
		stations[0]?.id,
	);

	const { data, isLoading } = useQuery({
		queryKey: ["fm-telemetry", stationId],
		queryFn: () =>
			fmReportApi.telemetryHistory(stationId!, 24).then((r) => r.data),
		enabled: !!stationId,
	});

	const readings = data?.results || [];
	const latest = readings[0];

	if (stations.length === 0) return null;

	return (
		<div className="card">
			<div className="flex items-center justify-between mb-4 flex-wrap gap-2">
				<h3 className="font-semibold text-white flex items-center gap-2">
					<Gauge size={16} className="text-nexus-400" /> Transmitter Readings
					(24h)
				</h3>
				<select
					value={stationId}
					onChange={(e) => setStationId(e.target.value)}
					className="select-input w-fit">
					{stations.map((s) => (
						<option key={s.id} value={s.id}>
							{s.name}
						</option>
					))}
				</select>
			</div>

			{isLoading ? (
				<div className="skeleton h-24 rounded-xl" />
			) : !latest ? (
				<p className="text-sm text-slate-500 text-center py-6">
					No telemetry reported for this station yet.
				</p>
			) : (
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
					<TelemetryStat
						label="VSWR"
						value={latest.vswr !== null ? latest.vswr.toFixed(2) : "—"}
						warn={latest.vswr_warning}
						critical={latest.vswr_critical}
					/>
					<TelemetryStat
						label="PA Temp"
						value={
							latest.pa_temperature_celsius !== null
								? `${latest.pa_temperature_celsius}°C`
								: "—"
						}
						warn={latest.pa_temp_warning}
					/>
					<TelemetryStat
						label="Forward Power"
						value={
							latest.forward_power_watts !== null
								? `${latest.forward_power_watts}W`
								: "—"
						}
					/>
					<TelemetryStat
						label="Signal Strength"
						value={
							latest.signal_strength_dbm !== null
								? `${latest.signal_strength_dbm}dBm`
								: "—"
						}
					/>
				</div>
			)}
			{latest && (
				<p className="text-[11px] text-slate-500 mt-3">
					Last reported {format(parseISO(latest.recorded_at), "dd MMM, HH:mm")}
				</p>
			)}
		</div>
	);
}

function TelemetryStat({
	label,
	value,
	warn,
	critical,
}: {
	label: string;
	value: string;
	warn?: boolean;
	critical?: boolean;
}) {
	return (
		<div
			className={clsx(
				"rounded-lg p-3",
				critical
					? "bg-red-900/20 border border-red-500/30"
					: warn
						? "bg-amber-900/15 border border-amber-500/20"
						: "bg-surface-card/60",
			)}>
			<div className="flex items-center gap-1.5 text-slate-500 text-xs mb-1">
				<Thermometer size={11} /> {label}
			</div>
			<div
				className={clsx(
					"text-lg font-semibold",
					critical ? "text-red-400" : warn ? "text-amber-400" : "text-white",
				)}>
				{value}
			</div>
		</div>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY LOG
// ═══════════════════════════════════════════════════════════════════════════

const ACTION_LABELS: Record<string, string> = {
	station_created: "Station Created",
	station_updated: "Station Updated",
	station_deleted: "Station Deactivated",
	outage_reported: "Outage Reported",
	outage_restored: "Outage Restored",
	alert_triggered: "Emergency Alert Triggered",
	alert_acknowledged: "Alert Acknowledged",
	alert_resolved: "Alert Resolved",
	schedule_updated: "Schedule Updated",
	role_changed: "Role Changed",
	notification_prefs_updated: "Notification Preferences Updated",
};

export function ActivityTab() {
	const [actionFilter, setActionFilter] = useState("");
	const [page, setPage] = useState(1);

	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: ["fm-audit-log", actionFilter, page],
		queryFn: () =>
			fmReportApi
				.listAuditLog({ action: actionFilter || undefined, page })
				.then((r) => r.data),
	});

	const entries = data?.results || [];

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between flex-wrap gap-3">
				<select
					value={actionFilter}
					onChange={(e) => {
						setActionFilter(e.target.value);
						setPage(1);
					}}
					className="select-input w-fit">
					<option value="">All activity</option>
					{Object.entries(ACTION_LABELS).map(([v, label]) => (
						<option key={v} value={v}>
							{label}
						</option>
					))}
				</select>
			</div>

			{isError && (
				<ErrorBanner
					message={errorMessage(error, "Couldn't load activity log.")}
					onRetry={refetch}
				/>
			)}

			<div className="card">
				{isLoading ? (
					[...Array(5)].map((_, i) => (
						<div key={i} className="skeleton h-10 rounded mb-2" />
					))
				) : entries.length === 0 ? (
					<EmptyState icon={History} message="No activity recorded yet" />
				) : (
					<div className="space-y-1">
						{entries.map((entry) => (
							<div
								key={entry.id}
								className="flex items-start gap-3 py-2.5 border-b border-surface-border/40 last:border-0">
								<div className="w-7 h-7 rounded-full bg-nexus-600/15 flex items-center justify-center shrink-0 mt-0.5">
									<History size={13} className="text-nexus-400" />
								</div>
								<div className="flex-1 min-w-0">
									<div className="text-sm text-white">
										<span className="font-medium">
											{entry.actor_name || "System"}
										</span>{" "}
										<span className="text-slate-400">
											{(
												ACTION_LABELS[entry.action] || entry.action_display
											).toLowerCase()}
										</span>
										{entry.target_repr && (
											<span className="text-slate-300">
												{" "}
												— {entry.target_repr}
											</span>
										)}
									</div>
									<div className="text-[11px] text-slate-500">
										{format(
											parseISO(entry.created_at),
											"dd MMM yyyy, HH:mm:ss",
										)}
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{(data?.next || data?.previous) && (
				<div className="flex items-center justify-between">
					<button
						disabled={!data?.previous || isFetching}
						onClick={() => setPage((p) => p - 1)}
						className="btn-secondary btn-sm">
						Previous
					</button>
					<span className="text-xs text-slate-500">Page {page}</span>
					<button
						disabled={!data?.next || isFetching}
						onClick={() => setPage((p) => p + 1)}
						className="btn-secondary btn-sm">
						Next
					</button>
				</div>
			)}
		</div>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS — notification preferences + role management
// ═══════════════════════════════════════════════════════════════════════════

export function SettingsTab({ isAdmin }: { isAdmin: boolean }) {
	return (
		<div className="space-y-8">
			<NotificationSettings />
			{isAdmin && <RoleManagement />}
		</div>
	);
}

function NotificationSettings() {
	const qc = useQueryClient();
	const QK = ["fm-notification-prefs"] as const;

	const { data: prefs, isLoading } = useQuery({
		queryKey: QK,
		queryFn: () => fmReportApi.getNotificationPrefs().then((r) => r.data),
	});

	const [form, setForm] = useState<Partial<NotificationPreference> | null>(
		null,
	);
	useEffect(() => {
		if (prefs) setForm(prefs);
	}, [prefs]);

	const saveMutation = useMutation({
		mutationFn: (data: Partial<NotificationPreference>) =>
			fmReportApi.updateNotificationPrefs(data),
		onSuccess: (r) => {
			qc.setQueryData(QK, r.data);
			toast.success("Preferences saved");
		},
		onError: (e) => toast.error(errorMessage(e, "Failed to save preferences")),
	});

	const testMutation = useMutation({
		mutationFn: (channel: "email" | "sms") =>
			fmReportApi.testSendNotification(channel),
		onSuccess: (_r, channel) => toast.success(`Test ${channel} sent`),
		onError: (e) => toast.error(errorMessage(e, "Test send failed")),
	});

	if (isLoading || !form) {
		return <div className="skeleton h-64 rounded-xl" />;
	}

	const toggle = (key: keyof NotificationPreference) =>
		setForm((p) => ({ ...p!, [key]: !p![key] }));

	return (
		<div className="card">
			<div className="flex items-center gap-2 mb-4">
				<Bell size={16} className="text-nexus-400" />
				<h3 className="font-semibold text-white">Notification Preferences</h3>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
				<Field label="Phone Number" hint="Required for SMS notifications">
					<input
						value={form.phone_number || ""}
						onChange={(e) =>
							setForm((p) => ({ ...p!, phone_number: e.target.value }))
						}
						className="input"
						placeholder="+254712345678"
					/>
				</Field>
				<Field label="Minimum Severity" hint="Suppress alerts below this level">
					<select
						value={form.fm_minimum_severity}
						onChange={(e) =>
							setForm((p) => ({
								...p!,
								fm_minimum_severity: e.target.value as any,
							}))
						}
						className="select-input">
						<option value="low">Low and above</option>
						<option value="medium">Medium and above</option>
						<option value="high">High and above</option>
						<option value="critical">Critical only</option>
					</select>
				</Field>
			</div>

			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead>
						<tr className="text-left text-xs text-slate-500 uppercase border-b border-surface-border">
							<th className="py-2 pr-4">Event</th>
							<th className="py-2 pr-4 text-center">
								<Mail size={13} className="inline" /> Email
							</th>
							<th className="py-2 text-center">
								<MessageSquare size={13} className="inline" /> SMS
							</th>
						</tr>
					</thead>
					<tbody>
						<ToggleRow
							label="Station outage"
							emailKey="email_on_outage"
							smsKey="sms_on_outage"
							form={form}
							toggle={toggle}
						/>
						<ToggleRow
							label="Station restored"
							emailKey="email_on_restored"
							smsKey="sms_on_restored"
							form={form}
							toggle={toggle}
						/>
						<ToggleRow
							label="Emergency alert"
							emailKey="email_on_emergency_alert"
							smsKey="sms_on_emergency_alert"
							form={form}
							toggle={toggle}
						/>
					</tbody>
				</table>
			</div>

			<div className="flex items-center gap-2 mt-5 pt-4 border-t border-surface-border/50">
				<button
					onClick={() => saveMutation.mutate(form)}
					disabled={saveMutation.isPending}
					className="btn-primary btn-sm">
					{saveMutation.isPending ? (
						<Spinner light />
					) : (
						<CheckCircle size={13} />
					)}{" "}
					Save Preferences
				</button>
				<button
					onClick={() => testMutation.mutate("email")}
					disabled={testMutation.isPending}
					className="btn-secondary btn-sm">
					<Send size={12} /> Test Email
				</button>
				<button
					onClick={() => testMutation.mutate("sms")}
					disabled={testMutation.isPending || !form.phone_number}
					className="btn-secondary btn-sm">
					<Send size={12} /> Test SMS
				</button>
			</div>
		</div>
	);
}

function ToggleRow({
	label,
	emailKey,
	smsKey,
	form,
	toggle,
}: {
	label: string;
	emailKey: keyof NotificationPreference;
	smsKey: keyof NotificationPreference;
	form: Partial<NotificationPreference>;
	toggle: (key: keyof NotificationPreference) => void;
}) {
	return (
		<tr className="border-b border-surface-border/40 last:border-0">
			<td className="py-2.5 pr-4 text-slate-300">{label}</td>
			<td className="py-2.5 pr-4 text-center">
				<Checkbox
					checked={!!form[emailKey]}
					onChange={() => toggle(emailKey)}
					label={`Email on ${label}`}
				/>
			</td>
			<td className="py-2.5 text-center">
				<Checkbox
					checked={!!form[smsKey]}
					onChange={() => toggle(smsKey)}
					label={`SMS on ${label}`}
				/>
			</td>
		</tr>
	);
}

function Checkbox({
	checked,
	onChange,
	label,
}: {
	checked: boolean;
	onChange: () => void;
	label: string;
}) {
	return (
		<button
			role="checkbox"
			aria-checked={checked}
			aria-label={label}
			onClick={onChange}
			className={clsx(
				"w-5 h-5 rounded-md border flex items-center justify-center transition-colors mx-auto",
				checked ? "bg-nexus-600 border-nexus-600" : "border-surface-border",
			)}>
			{checked && <CheckCircle size={12} className="text-white" />}
		</button>
	);
}

const ASSIGNABLE_ROLES = ["broadcast_admin", "broadcast_staff", "viewer"];
const ROLE_LABELS: Record<string, string> = {
	system_admin: "System Admin",
	broadcast_admin: "Broadcast Admin",
	broadcast_staff: "Broadcast Staff",
	viewer: "Viewer",
};

function RoleManagement() {
	const qc = useQueryClient();
	const QK = ["fm-members"] as const;
	const [pendingId, setPendingId] = useState<string | null>(null);

	const { data, isLoading, isError, error, refetch } = useQuery({
		queryKey: QK,
		queryFn: () => fmReportApi.listMembers().then((r) => r.data),
	});

	const roleMutation = useMutation({
		mutationFn: ({ id, role }: { id: string; role: string }) =>
			fmReportApi.updateMemberRole(id, role),
		onMutate: ({ id }) => setPendingId(id),
		onSuccess: () => {
			toast.success("Role updated");
			qc.invalidateQueries({ queryKey: QK });
		},
		onError: (e) => toast.error(errorMessage(e, "Failed to update role")),
		onSettled: () => setPendingId(null),
	});

	const members = data || [];

	return (
		<div className="card">
			<div className="flex items-center gap-2 mb-4">
				<Shield size={16} className="text-nexus-400" />
				<h3 className="font-semibold text-white">Role &amp; Permissions</h3>
			</div>

			{isError && (
				<ErrorBanner
					message={errorMessage(error, "Couldn't load members.")}
					onRetry={refetch}
				/>
			)}

			{isLoading ? (
				<div className="skeleton h-40 rounded-xl" />
			) : members.length === 0 ? (
				<EmptyState icon={Users} message="No organisation members found" />
			) : (
				<div className="space-y-2">
					{members.map((m: OrgMember) => (
						<div
							key={m.id}
							className="flex items-center justify-between p-3 rounded-lg bg-surface-card/60">
							<div>
								<div className="text-sm font-medium text-white">{m.name}</div>
								<div className="text-xs text-slate-500">{m.email}</div>
							</div>
							{m.is_org_owner || m.role === "system_admin" ? (
								<span className="badge-slate text-[10px]">
									{ROLE_LABELS[m.role] || m.role}
								</span>
							) : (
								<select
									value={m.role}
									disabled={pendingId === m.id}
									onChange={(e) =>
										roleMutation.mutate({ id: m.id, role: e.target.value })
									}
									className="select-input w-fit text-xs">
									{ASSIGNABLE_ROLES.map((r) => (
										<option key={r} value={r}>
											{ROLE_LABELS[r]}
										</option>
									))}
								</select>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
