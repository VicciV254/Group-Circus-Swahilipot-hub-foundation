import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	server: {
		port: 5173,
		host: "0.0.0.0",
		proxy: {
			"/api": {
				target: "http://localhost:8000",
				changeOrigin: true,
				secure: false,
			},
			"/ws": {
				target: "ws://localhost:8000",
				ws: true,
				changeOrigin: true,
			},
			"/media": {
				target: "http://localhost:8000",
				changeOrigin: true,
			},
		},
	},
	build: {
		cssMinify: "esbuild",
		outDir: "dist",
		sourcemap: false,
		minify: "esbuild",
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes("node_modules")) {
						if (
							id.includes("react") ||
							id.includes("react-dom") ||
							id.includes("react-router-dom")
						)
							return "react-vendor";
						if (id.includes("@tanstack/react-query")) return "query-vendor";
						if (id.includes("recharts")) return "chart-vendor";
						if (
							id.includes("react-hook-form") ||
							id.includes("zod") ||
							id.includes("@hookform")
						)
							return "form-vendor";
						if (id.includes("date-fns") || id.includes("dayjs"))
							return "date-vendor";
						if (
							id.includes("lucide-react") ||
							id.includes("clsx") ||
							id.includes("tailwind-merge") ||
							id.includes("framer-motion")
						)
							return "ui-vendor";
						if (id.includes("axios") || id.includes("zustand"))
							return "data-vendor";
					}
				},
			},
		},
		chunkSizeWarningLimit: 1000,
	},
	optimizeDeps: {
		include: [
			"react",
			"react-dom",
			"react-router-dom",
			"@tanstack/react-query",
			"axios",
			"zustand",
			"date-fns",
			"lucide-react",
			"recharts",
		],
	},
});
