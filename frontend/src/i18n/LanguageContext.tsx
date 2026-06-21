// src/i18n/LanguageContext.tsx
// Nexus Enterprise — Language context, hook, and RTL support

import {
	createContext,
	useContext,
	useState,
	useEffect,
	useCallback,
	ReactNode,
} from "react";
import {
	LangCode,
	TranslationKey,
	TRANSLATIONS,
	LANGUAGES,
} from "./translations";
import { api } from "../services/api";

// ── Preferences API ───────────────────────────────────────────────────────────
const preferencesApi = {
	get: () => api.get("/accounts/preferences/").then((r) => r.data),
	patch: (data: Record<string, unknown>) =>
		api.patch("/accounts/preferences/", data).then((r) => r.data),
};

// ── Context shape ─────────────────────────────────────────────────────────────
interface LanguageContextValue {
	lang: LangCode;
	isRTL: boolean;
	setLang: (lang: LangCode, persist?: boolean) => void;
	t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
	lang: "en",
	isRTL: false,
	setLang: () => {},
	t: (key) => key,
});

// ── Helper: apply RTL / LTR to document ──────────────────────────────────────
function applyDirection(lang: LangCode) {
	const isRTL = LANGUAGES.find((l) => l.code === lang)?.rtl ?? false;
	document.documentElement.setAttribute("dir", isRTL ? "rtl" : "ltr");
	document.documentElement.setAttribute("lang", lang);
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function LanguageProvider({ children }: { children: ReactNode }) {
	const [lang, setLangState] = useState<LangCode>(() => {
		// Use localStorage cache for instant render — no flash
		return (localStorage.getItem("nexus-lang") as LangCode) ?? "en";
	});

	const isRTL = LANGUAGES.find((l) => l.code === lang)?.rtl ?? false;

	// Apply direction on every language change
	useEffect(() => {
		applyDirection(lang);
	}, [lang]);

	// On mount: apply cache instantly, then sync from backend
	useEffect(() => {
		applyDirection(lang);

		preferencesApi
			.get()
			.then((prefs) => {
				const serverLang = (prefs?.language_preference ?? "en") as LangCode;
				const localLang = (localStorage.getItem("nexus-lang") ??
					"en") as LangCode;
				if (serverLang !== localLang) {
					setLangState(serverLang);
					localStorage.setItem("nexus-lang", serverLang);
				}
			})
			.catch(() => {
				/* silently fall back to cached */
			});
	}, []);

	const setLang = useCallback((newLang: LangCode, persist = false) => {
		setLangState(newLang);
		localStorage.setItem("nexus-lang", newLang);
		if (persist) {
			preferencesApi.patch({ language_preference: newLang }).catch(() => {});
		}
	}, []);

	const t = useCallback(
		(key: TranslationKey): string => {
			return TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS["en"][key] ?? key;
		},
		[lang],
	);

	return (
		<LanguageContext.Provider value={{ lang, isRTL, setLang, t }}>
			{children}
		</LanguageContext.Provider>
	);
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useTranslation() {
	return useContext(LanguageContext);
}

// Re-export for convenience
export { LANGUAGES, type LangCode };
