/** @type {import('tailwindcss').Config} */
export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	darkMode: "class",
	theme: {
		extend: {
			colors: {
				// Swahilipot Brand
				Swahilipot: {
					50: "#f0f4ff",
					100: "#e0eaff",
					200: "#c2d5ff",
					300: "#94b5ff",
					400: "#5f8bff",
					500: "#3b63f5",
					600: "#2445eb",
					700: "#1c34d4",
					800: "#1c2dab",
					900: "#1c2c87",
					950: "#141c55",
				},
				// Status colours
				success: { DEFAULT: "#22c55e", light: "#dcfce7", dark: "#15803d" },
				warning: { DEFAULT: "#f59e0b", light: "#fef3c7", dark: "#d97706" },
				danger: { DEFAULT: "#ef4444", light: "#fee2e2", dark: "#b91c1c" },
				info: { DEFAULT: "#06b6d4", light: "#cffafe", dark: "#0e7490" },

				// Surface
				surface: {
					DEFAULT: "#0f1117",
					card: "#161b27",
					elevated: "#1e2538",
					border: "#252d42",
					muted: "#2d364f",
				},
			},
			fontFamily: {
				sans: ['"DM Sans"', "system-ui", "sans-serif"],
				display: ['"Syne"', "sans-serif"],
				mono: ['"JetBrains Mono"', "monospace"],
			},
			backgroundImage: {
				"gradient-Swahilipot":
					"linear-gradient(135deg, #3b63f5 0%, #7c3aed 50%, #1c34d4 100%)",
				"gradient-danger": "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
				"gradient-success": "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
				"gradient-warning": "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
				"grid-pattern":
					"radial-gradient(circle at 1px 1px, rgba(59,99,245,0.15) 1px, transparent 0)",
			},
			backgroundSize: {
				"grid-sm": "24px 24px",
				"grid-lg": "48px 48px",
			},
			boxShadow: {
				Swahilipot: "0 0 30px rgba(59,99,245,0.3)",
				card: "0 4px 24px rgba(0,0,0,0.4)",
				elevated: "0 8px 40px rgba(0,0,0,0.5)",
				"glow-red": "0 0 20px rgba(239,68,68,0.5)",
				"glow-green": "0 0 20px rgba(34,197,94,0.5)",
				"glow-blue": "0 0 20px rgba(59,99,245,0.4)",
			},
			animation: {
				"pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
				"fade-in": "fadeIn 0.5s ease-out",
				"slide-up": "slideUp 0.4s ease-out",
				"slide-right": "slideRight 0.3s ease-out",
				"glow-pulse": "glowPulse 2s ease-in-out infinite",
				"bounce-subtle": "bounceSub 2s ease infinite",
				"spin-slow": "spin 3s linear infinite",
				shimmer: "shimmer 2s linear infinite",
				"count-up": "countUp 1s ease-out",
			},
			keyframes: {
				fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
				slideUp: {
					from: { transform: "translateY(20px)", opacity: "0" },
					to: { transform: "translateY(0)", opacity: "1" },
				},
				slideRight: {
					from: { transform: "translateX(-20px)", opacity: "0" },
					to: { transform: "translateX(0)", opacity: "1" },
				},
				glowPulse: {
					"0%,100%": { boxShadow: "0 0 10px rgba(239,68,68,0.4)" },
					"50%": { boxShadow: "0 0 30px rgba(239,68,68,0.8)" },
				},
				bounceSub: {
					"0%,100%": { transform: "translateY(0)" },
					"50%": { transform: "translateY(-4px)" },
				},
				shimmer: {
					"0%": { backgroundPosition: "-200% 0" },
					"100%": { backgroundPosition: "200% 0" },
				},
				countUp: {
					from: { opacity: "0", transform: "translateY(10px)" },
					to: { opacity: "1", transform: "translateY(0)" },
				},
			},
		},
	},
	plugins: [],
};
