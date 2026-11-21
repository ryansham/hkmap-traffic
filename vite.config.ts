import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { liveCachePlugin } from "./scripts/liveCachePlugin.mjs"

export default defineConfig({
  plugins: [react(), tailwindcss(), liveCachePlugin()],
  server: { host: "0.0.0.0", port: 47321, strictPort: true },
  preview: { host: "0.0.0.0", port: 47321, strictPort: true },
})
