// useFloatingDock — shared coordinator for the floating Chat & AI panels
//
// Problem this solves:
//   ChatPanel and AIPanel each render as an independent `fixed` element
//   anchored near the bottom-right corner. Previously their offsets were
//   hardcoded ("right-6" / "right-[396px]") assuming the other panel was
//   always in its *default* size. The moment either panel was expanded
//   (760px wide) while the other was also open, the two would sit directly
//   on top of one another.
//
// Fix:
//   Both panels register their live {isOpen, isExpanded} state here. Each
//   panel then asks "how far from the right edge should I sit?" and gets an
//   answer computed from the OTHER panel's actual current size — so the
//   maths is always correct, no matter which panel opened first or which is
//   expanded. We also enforce that only one panel may be in its "expanded"
//   (760px) size at a time, and that on mobile-width viewports only one
//   floating panel is shown at all (a second full-screen overlay on a phone
//   would just be confusing).
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export type DockPanelId = "chat" | "ai";

export interface DockPanelHandle {
	isOpen: boolean;
	isExpanded: boolean;
	/** Fully close the panel (back to its launcher button / FAB). */
	close: () => void;
	/** Shrink the panel back to its compact size without closing it. */
	collapse: () => void;
	/** Width (px) this panel's launcher button occupies even while closed —
	 * e.g. Chat's round FAB. Used so a sibling panel never docks underneath
	 * it. Defaults to 0 (no persistent closed-state UI). */
	closedFootprintPx?: number;
}

const EDGE = 24; // px — matches Tailwind's `right-6`
const GAP = 16; // px gap kept between two simultaneously open panels
export const DOCK_COLLAPSED_WIDTH = 340; // px
export const DOCK_EXPANDED_WIDTH = 760; // px
export const DOCK_MOBILE_BREAKPOINT = 768; // px — below this, panels go full-screen

const emptyHandle: DockPanelHandle = {
	isOpen: false,
	isExpanded: false,
	close: () => {},
	collapse: () => {},
};

const registry: Record<DockPanelId, DockPanelHandle> = {
	chat: { ...emptyHandle },
	ai: { ...emptyHandle },
};

const listeners = new Set<() => void>();
function emit() {
	listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
function getSnapshot() {
	return registry;
}

function otherOf(id: DockPanelId): DockPanelId {
	return id === "chat" ? "ai" : "chat";
}

function widthOf(handle: DockPanelHandle) {
	if (!handle.isOpen) return handle.closedFootprintPx ?? 0;
	return handle.isExpanded ? DOCK_EXPANDED_WIDTH : DOCK_COLLAPSED_WIDTH;
}

function useIsMobileViewport() {
	const [isMobile, setIsMobile] = useState(
		() =>
			typeof window !== "undefined" &&
			window.innerWidth < DOCK_MOBILE_BREAKPOINT,
	);
	useEffect(() => {
		const onResize = () =>
			setIsMobile(window.innerWidth < DOCK_MOBILE_BREAKPOINT);
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);
	return isMobile;
}

/**
 * Registers a floating panel with the dock and returns everything it needs
 * to position itself without ever overlapping its sibling panel.
 *
 * `id` is "chat" (always anchored flush to the screen edge — the rightmost
 * panel) or "ai" (docks to the left of whatever space "chat" occupies).
 */
export function useFloatingDock(
	id: DockPanelId,
	handle: {
		isOpen: boolean;
		isExpanded: boolean;
		close: () => void;
		collapse: () => void;
		closedFootprintPx?: number;
	},
) {
	useEffect(() => {
		registry[id] = handle;
		emit();
		return () => {
			registry[id] = { ...emptyHandle };
			emit();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id, handle.isOpen, handle.isExpanded, handle.close, handle.collapse]);

	const snapshot = useSyncExternalStore(subscribe, getSnapshot);
	const isMobile = useIsMobileViewport();

	const sibling = snapshot[otherOf(id)];
	const siblingWidth = widthOf(sibling);
	// "chat" sits flush against the edge. "ai" sits flush against the edge
	// PLUS however much room "chat" currently needs (0 if chat is closed).
	const rightOffset =
		id === "chat" ? EDGE : EDGE + (siblingWidth > 0 ? siblingWidth + GAP : 0);

	/** Call this right before expanding — shrinks the sibling panel first so
	 * the two 760px-wide panels can never coexist. */
	const requestExpand = useCallback(() => {
		const sib = registry[otherOf(id)];
		if (sib.isOpen && sib.isExpanded) sib.collapse();
	}, [id]);

	/** Call this right before opening on a mobile viewport — closes the
	 * sibling so two full-screen panels don't stack. Desktop is unaffected,
	 * since side-by-side chat + AI is an intentional feature there. */
	const requestOpenExclusive = useCallback(() => {
		if (!isMobile) return;
		const sib = registry[otherOf(id)];
		if (sib.isOpen) sib.close();
	}, [id, isMobile]);

	return { isMobile, rightOffset, requestExpand, requestOpenExclusive };
}
