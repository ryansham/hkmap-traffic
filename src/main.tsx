import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { setWorkerUrl } from "maplibre-gl"
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
import "@fontsource/noto-sans-tc/chinese-traditional-400.css"
import "@fontsource/noto-sans-tc/chinese-traditional-700.css"
import "maplibre-gl/dist/maplibre-gl.css"
import App from "./App.tsx"
import "./index.css"

setWorkerUrl(workerUrl)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
