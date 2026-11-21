import { useEffect, useMemo, useState } from "react"
import { InfoPanel } from "./components/InfoPanel.tsx"
import { MapCanvas } from "./components/MapCanvas.tsx"
import { network, stationByCode } from "./data/index.ts"
import type { Selection } from "./types.ts"

function fold(value: string) {
  return value.replaceAll("茘", "荔").trim().toLowerCase()
}

export default function App() {
  const [showMtr, setShowMtr] = useState(true)
  const [showCameras, setShowCameras] = useState(true)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [query, setQuery] = useState("")
  const [styleError, setStyleError] = useState(false)
  const [focus, setFocus] = useState<{ nonce: number; lng: number; lat: number } | null>(null)
  const [legendOpen, setLegendOpen] = useState(() => window.matchMedia("(min-width: 761px)").matches)

  const matches = useMemo(() => {
    const text = fold(query)
    if (!text) return []
    return network.stations
      .filter((station) => fold(station.zh).includes(text) || station.en.toLowerCase().includes(text) || station.code.toLowerCase().includes(text))
      .slice(0, 8)
  }, [query])

  function chooseStation(code: string) {
    const station = stationByCode.get(code)
    if (!station) return
    setShowMtr(true)
    setSelection({ kind: "station", code })
    setFocus({ nonce: Date.now(), lng: station.lng, lat: station.lat })
    setQuery("")
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSelection(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="title-block">
          <h1>香港智慧城市地圖</h1>
          <p>
            98 個重鐵站可查到站班次，1013 個快拍點可看最新照片。輕鐵 68 個站和高鐵西九龍站不在這份到站資料內。
          </p>
          <p className="credit">車站位置：地政總署　到站班次：港鐵　交通快拍：運輸署</p>
        </div>
        <div className="tools">
          <div className="search">
            <label htmlFor="station-search">搜尋車站</label>
            <input
              id="station-search"
              value={query}
              placeholder="例如中環、金鐘、馬場"
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
            />
            {query.trim() ? (
              <ul>
                {matches.length === 0 ? <li className="empty-match">沒有這個車站。</li> : null}
                {matches.map((station) => (
                  <li key={station.code}>
                    <button type="button" onClick={() => chooseStation(station.code)}>
                      <strong>{station.zh}</strong>
                      <span>{station.en}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="toggles">
            <button type="button" aria-pressed={showMtr} onClick={() => setShowMtr((value) => !value)}>
              港鐵網絡
            </button>
            <button type="button" aria-pressed={showCameras} onClick={() => setShowCameras((value) => !value)}>
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
          focusNonce={focus?.nonce ?? 0}
          focusTarget={focus}
          onSelectStation={chooseStation}
          onSelectCamera={(key) => setSelection({ kind: "camera", key })}
          onClear={() => setSelection(null)}
          onStyleError={() => setStyleError(true)}
          onStyleReady={() => setStyleError(false)}
        />
        <details
          className="legend"
          open={legendOpen}
          onToggle={(event) => setLegendOpen(event.currentTarget.open)}
        >
          <summary>圖例</summary>
          <div className="legend-body">
            {network.lines.map((line) => (
              <span key={line.code}>
                <i style={{ background: line.color }} />
                {line.name}
              </span>
            ))}
            <span>
              <i className="camera-swatch" />
              交通快拍
            </span>
          </div>
        </details>
        {styleError ? (
          <p className="map-error" role="alert">
            底圖暫時載入不到。街道圖由 OpenFreeMap 提供，請稍後再打開。
          </p>
        ) : null}
        {selection ? <InfoPanel selection={selection} onClose={() => setSelection(null)} /> : null}
      </main>
    </div>
  )
}
