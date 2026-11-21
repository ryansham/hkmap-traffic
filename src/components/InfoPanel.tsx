import { useLayoutEffect, useRef, useState, type PointerEvent } from "react"
import { cameraByKey, lineByCode, stationByCode } from "../data/index.ts"
import { formatMtrClock } from "../lib/fetchSchedule.ts"
import { summarizeNextTrains } from "../lib/nextTrains.ts"
import type { LineScheduleView } from "../lib/schedule.ts"
import { cameraPlaceName } from "../lib/search.ts"
import { useSnapshot, type StationArrivals } from "../lib/useLiveData.ts"
import type { Selection } from "../types.ts"

type Props = {
  selection: Selection
  arrivals: StationArrivals
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onHeight: (height: number) => void
  onClose: () => void
}

function isNarrow() {
  return window.matchMedia("(max-width: 760px)").matches
}

export function InfoPanel({ selection, arrivals, expanded, onExpandedChange, onHeight, onClose }: Props) {
  const panelRef = useRef<HTMLElement>(null)
  const [shift, setShift] = useState(0)

  useLayoutEffect(() => {
    const node = panelRef.current
    if (!node) return
    const report = () => onHeight(Math.round(node.getBoundingClientRect().height))
    report()
    const observer = new ResizeObserver(report)
    observer.observe(node)
    return () => observer.disconnect()
  }, [onHeight, selection, expanded])

  return (
    <aside
      ref={panelRef}
      className="info-panel"
      data-expanded={expanded ? "true" : "false"}
      role="dialog"
      aria-labelledby="info-title"
      style={shift === 0 ? undefined : { transform: `translateY(${shift}px)` }}
    >
      <SheetHandle
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        onClose={onClose}
        onShift={setShift}
      />
      {selection.kind === "station" ? (
        <StationBody code={selection.code} arrivals={arrivals} onClose={onClose} />
      ) : (
        <CameraBody key={selection.key} cameraKey={selection.key} onClose={onClose} />
      )}
    </aside>
  )
}

function SheetHandle({
  expanded,
  onExpandedChange,
  onClose,
  onShift,
}: {
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onClose: () => void
  onShift: (shift: number) => void
}) {
  const startY = useRef(0)
  const dragged = useRef(false)

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!isNarrow()) return
    dragged.current = false
    startY.current = event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const delta = event.clientY - startY.current
    if (Math.abs(delta) > 6) dragged.current = true
    onShift(Math.max(-140, delta))
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    const delta = event.clientY - startY.current
    onShift(0)
    if (event.type === "pointercancel" || !dragged.current) return
    if (delta > 56) {
      if (expanded) onExpandedChange(false)
      else onClose()
      return
    }
    if (delta < -40) onExpandedChange(true)
  }

  function onClick() {
    if (dragged.current) {
      dragged.current = false
      return
    }
    if (!isNarrow()) return
    onExpandedChange(!expanded)
  }

  return (
    <div className="sheet-handle">
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? "收起詳情。向下拉可關閉。" : "展開詳情。向下拉可關閉。"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={onClick}
      >
        <span className="grabber" />
        <span className="handle-label">{expanded ? "向下拉可收起" : "向上拉看詳情，向下拉關閉"}</span>
      </button>
    </div>
  )
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="close-button" onClick={onClose}>
      關閉
    </button>
  )
}

function StationBody({ code, arrivals, onClose }: { code: string; arrivals: StationArrivals; onClose: () => void }) {
  const station = stationByCode.get(code)
  if (!station) {
    return (
      <div className="panel-scroll">
        <p className="status-copy">找不到這個車站。</p>
      </div>
    )
  }
  const lines = station.lines.flatMap((line) => {
    const record = lineByCode.get(line)
    return record ? [{ code: record.code, name: record.name, color: record.color }] : []
  })
  const summary = summarizeNextTrains(lines, arrivals.byLine)
  const delayed = station.lines.some((line) => arrivals.byLine[line]?.delay)

  return (
    <>
      <header className="panel-head">
        <div>
          <p className="eyebrow">到站班次</p>
          <h2 id="info-title">{station.zh}</h2>
          <p className="english">{station.en}</p>
        </div>
        <CloseButton onClose={onClose} />
      </header>
      <div className="sheet-peek">
        {delayed ? <p className="delay">港鐵表示服務有延誤。</p> : null}
        {arrivals.phase === "loading" ? <p className="status-copy">正在查看到站班次。</p> : null}
        {arrivals.phase !== "loading" && summary.trains.length === 0 ? (
          <p className="status-copy">向上拉可看這個站的班次。</p>
        ) : null}
        {summary.trains.length > 0 ? (
          <ul className="next-list">
            {summary.trains.map((train) => (
              <li key={`${train.lineCode}-${train.destination}`}>
                <i style={{ background: train.color }} />
                <span>
                  {train.lineName} · 往{train.destination}
                  {train.platform !== "—" ? ` · 月台 ${train.platform}` : ""}
                </span>
                <strong>{train.minutesLabel}</strong>
              </li>
            ))}
          </ul>
        ) : null}
        {summary.extra > 0 ? <p className="next-more">還有 {summary.extra} 個方向，向上拉可看。</p> : null}
      </div>
      <div className="panel-scroll">
        <div className="line-pills">
          {station.lines.map((line) => {
            const record = lineByCode.get(line)
            return (
              <span key={line} className="line-pill" style={{ background: record?.color }}>
                {record?.name}
              </span>
            )
          })}
        </div>
        {arrivals.phase === "loading" ? <p className="status-copy">正在查看到站班次。</p> : null}
        {station.lines.map((line) => {
          const record = lineByCode.get(line)
          const view = arrivals.byLine[line]
          if (!record || !view) return null
          return (
            <section key={line} className="line-block">
              <h3>
                <i style={{ background: record.color }} />
                {record.name}
              </h3>
              {view.delay ? <p className="delay">港鐵表示服務有延誤。</p> : null}
              <ScheduleBody code={code} view={view} />
              {view.updatedAt ? <p className="meta">資料時間 {formatMtrClock(view.updatedAt)}</p> : null}
            </section>
          )
        })}
        <div className="panel-actions">
          <button type="button" onClick={arrivals.refresh}>
            重新整理
          </button>
          <p>此站約每 20 秒自動更新，頁面隱藏時會暫停。全圖列車由共用快取沿路軌顯示，打開車站不是看見列車的條件。</p>
        </div>
      </div>
    </>
  )
}

function ScheduleBody({ code, view }: { code: string; view: LineScheduleView }) {
  if (view.status === "error") return <p className="status-copy">{view.message}</p>
  if (view.status === "empty") {
    return (
      <p className="status-copy">
        {code === "RAC" ? "暫時沒有到站班次。馬場站通常只在賽馬日提供服務。" : view.message}
      </p>
    )
  }
  return (
    <>
      {view.directions.map((direction, index) => (
        <div key={index} className="direction">
          {direction.trains.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>往</th>
                  <th>月台</th>
                  <th>時間</th>
                  <th>尚餘</th>
                </tr>
              </thead>
              <tbody>
                {direction.trains.map((train, trainIndex) => (
                  <tr key={`${train.destination}-${train.time}-${trainIndex}`}>
                    <td>{train.destination}</td>
                    <td>{train.platform}</td>
                    <td>{train.time}</td>
                    <td>{train.minutesLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="status-copy">{direction.note}</p>
          )}
        </div>
      ))}
    </>
  )
}

function CameraBody({ cameraKey, onClose }: { cameraKey: string; onClose: () => void }) {
  const camera = cameraByKey.get(cameraKey)
  const snapshot = useSnapshot(camera?.url ?? null)
  if (!camera) {
    return (
      <div className="panel-scroll">
        <p className="status-copy">找不到這個快拍點。</p>
      </div>
    )
  }
  const place = cameraPlaceName(camera.description)

  return (
    <>
      <header className="panel-head">
        <div>
          <p className="eyebrow">交通快拍</p>
          <h2 id="info-title">{place}</h2>
          <p className="english">
            {camera.region} · {camera.district}
          </p>
        </div>
        <CloseButton onClose={onClose} />
      </header>
      <div className="sheet-peek">
        {snapshot.phase === "loading" ? <p className="status-copy">正在載入最新照片。</p> : null}
        {snapshot.phase === "error" ? <p className="status-copy">暫時未能提供這張照片。向上拉可再試。</p> : null}
        {snapshot.phase === "ready" ? (
          <p className="status-copy">
            {snapshot.updatedLabel ? `照片更新時間 ${snapshot.updatedLabel}。` : "照片已載入。"}
            向上拉可看。
          </p>
        ) : null}
      </div>
      <div className="panel-scroll">
        {snapshot.phase === "loading" ? <p className="status-copy">正在載入最新照片。</p> : null}
        {snapshot.phase === "error" ? <p className="status-copy">暫時未能提供這張照片。</p> : null}
        {snapshot.phase === "ready" && snapshot.imageUrl ? (
          <figure className="snapshot">
            <img src={snapshot.imageUrl} alt={`${place}的最新交通快拍`} />
            <figcaption>
              {snapshot.updatedLabel ? `照片更新時間 ${snapshot.updatedLabel}。` : "未能讀取照片的更新時間。"} 若照片寫著「暫時未能提供服務」，代表這個鏡頭現在沒有新照片。
            </figcaption>
          </figure>
        ) : null}
        <div className="panel-actions">
          <button type="button" onClick={snapshot.refresh}>
            重新整理
          </button>
          <p>快拍大約每兩分鐘更新。點開這裡才會下載照片。</p>
        </div>
      </div>
    </>
  )
}
