import { useEffect, useState } from "react"
import { InfoPanel } from "./components/InfoPanel.tsx"
import { MapCanvas } from "./components/MapCanvas.tsx"
import { PlaceSearch } from "./components/PlaceSearch.tsx"
import { cameraByKey, network, stationByCode } from "./data/index.ts"
import { useStationArrivals } from "./lib/useLiveData.ts"
import type { Selection } from "./types.ts"
import { APP_VERSION } from "./version.ts"

function selectionId(selection: Selection | null) {
  if (!selection) return ""
  return selection.kind === "station" ? `station:${selection.code}` : `camera:${selection.key}`
}

export default function App() {
  const [showMtr, setShowMtr] = useState(true)
  const [showCameras, setShowCameras] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [query, setQuery] = useState("")
  const [aboutOpen, setAboutOpen] = useState(false)
  const [styleError, setStyleError] = useState(false)
  const [focus, setFocus] = useState<{ nonce: number; lng: number; lat: number } | null>(null)
  const [legendOpen, setLegendOpen] = useState(() => window.matchMedia("(min-width: 761px)").matches)
  const [sheetHeight, setSheetHeight] = useState(0)
  const [sheetFor, setSheetFor] = useState("")
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const arrivals = useStationArrivals(selection?.kind === "station" ? selection.code : null)
  const currentSelection = selectionId(selection)
  if (sheetFor !== currentSelection) {
    setSheetFor(currentSelection)
    setSheetExpanded(false)
    if (!currentSelection) setSheetHeight(0)
  }

  function chooseStation(code: string) {
    const station = stationByCode.get(code)
    if (!station) return
    setShowMtr(true)
    setSelection({ kind: "station", code })
    setFocus({ nonce: Date.now(), lng: station.lng, lat: station.lat })
    setQuery("")
    setAboutOpen(false)
  }

  function chooseCamera(key: string) {
    const camera = cameraByKey.get(key)
    if (!camera) return
    setSelection({ kind: "camera", key })
    setFocus({ nonce: Date.now(), lng: camera.lng, lat: camera.lat })
    setQuery("")
    setAboutOpen(false)
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      if (aboutOpen) {
        setAboutOpen(false)
        return
      }
      if (query.trim()) {
        setQuery("")
        return
      }
      setSelection(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [aboutOpen, query])

  useEffect(() => {
    if (!aboutOpen) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (document.getElementById("about-anchor")?.contains(target)) return
      setAboutOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [aboutOpen])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>香港智慧城市地圖</h1>
          <span className="version">v{APP_VERSION}</span>
          <div className="about-anchor" id="about-anchor">
            <button
              type="button"
              className="about-button"
              aria-expanded={aboutOpen}
              aria-controls="about-note"
              onClick={() => setAboutOpen((open) => !open)}
            >
              關於
            </button>
            {aboutOpen ? (
              <div id="about-note" role="dialog" aria-label="關於這幅地圖" tabIndex={-1}>
                <p>98 個重鐵站可查到站班次，1013 個快拍點可看最新照片。輕鐵 68 個站和高鐵西九龍站不在這份到站資料內。</p>
                <p>全市視角只顯示港鐵。放大到街道，或打開「交通快拍」，才出現鏡頭。</p>
                <p>全圖列車沿路軌行駛。位置用到站時間估算，經共用快取更新，不會由每個訪客逐站查詢。</p>
                <p className="credit">車站位置：地政總署　路軌：OpenStreetMap　到站班次：港鐵　交通快拍：運輸署　底圖：OpenFreeMap</p>
                <button type="button" onClick={() => setAboutOpen(false)}>
                  關閉
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="tools">
          <PlaceSearch
            query={query}
            onQueryChange={setQuery}
            onPickStation={chooseStation}
            onPickCamera={chooseCamera}
          />
          <div className="toggles">
            <button type="button" aria-pressed={showMtr} onClick={() => setShowMtr((value) => !value)}>
              港鐵網絡
            </button>
            <button
              type="button"
              aria-pressed={showCameras}
              aria-label={showCameras ? "交通快拍，全市顯示中" : "交通快拍，放大到街道才顯示"}
              onClick={() => setShowCameras((value) => !value)}
            >
              交通快拍
            </button>
          </div>
        </div>
      </header>
      <main className="stage">
        <MapCanvas
          showMtr={showMtr}
          showCameras={showCameras}
          selectedStation={selection?.kind === "station" ? selection.code : null}
          panelOpen={selection !== null}
          sheetHeight={sheetHeight}
          focusNonce={focus?.nonce ?? 0}
          focusTarget={focus}
          onSelectStation={chooseStation}
          onSelectCamera={(key) => {
            setSelection({ kind: "camera", key })
            setQuery("")
            setAboutOpen(false)
          }}
          onClear={() => setSelection(null)}
          onStyleError={() => setStyleError(true)}
          onStyleReady={() => setStyleError(false)}
        />
        <details className="legend" open={legendOpen} onToggle={(event) => setLegendOpen(event.currentTarget.open)}>
          <summary>圖例</summary>
          <div className="legend-body">
            {network.lines.map((line) => (
              <span key={line.code}>
                <i style={{ background: line.color }} />
                {line.name}
              </span>
            ))}
            <span className="legend-camera">
              <i className="camera-swatch" />
              {showCameras ? "交通快拍" : "交通快拍（放大後）"}
            </span>
          </div>
        </details>
        {styleError ? (
          <p className="map-error" role="alert">
            底圖暫時載入不到。街道圖由 OpenFreeMap 提供，請稍後再打開。
          </p>
        ) : null}
        {selection ? (
          <InfoPanel
            selection={selection}
            arrivals={arrivals}
            expanded={sheetExpanded}
            onExpandedChange={setSheetExpanded}
            onHeight={setSheetHeight}
            onClose={() => setSelection(null)}
          />
        ) : null}
      </main>
    </div>
  )
}
