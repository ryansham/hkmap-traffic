import { cameraByKey, lineByCode, stationByCode } from "../data/index.ts"
import { formatMtrClock } from "../lib/fetchSchedule.ts"
import type { LineScheduleView } from "../lib/schedule.ts"
import { useSnapshot, useStationArrivals } from "../lib/useLiveData.ts"
import type { Selection } from "../types.ts"

type Props = {
  selection: Selection
  onClose: () => void
}

export function InfoPanel({ selection, onClose }: Props) {
  return (
    <aside className="info-panel" role="dialog" aria-labelledby="info-title">
      {selection.kind === "station" ? (
        <StationBody code={selection.code} onClose={onClose} />
      ) : (
        <CameraBody key={selection.key} cameraKey={selection.key} onClose={onClose} />
      )}
    </aside>
  )
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="close-button" onClick={onClose}>
      關閉
    </button>
  )
}

function StationBody({ code, onClose }: { code: string; onClose: () => void }) {
  const station = stationByCode.get(code)
  const arrivals = useStationArrivals(code)
  if (!station) {
    return (
      <div className="panel-scroll">
        <p className="status-copy">找不到這個車站。</p>
      </div>
    )
  }

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
          <p>此站約每 20 秒自動更新。只會查詢你正在看的車站。</p>
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
  const place = camera.description.replace(/\s*\[[^\]]+\]\s*$/, "")

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
      <div className="panel-scroll">
        {snapshot.phase === "loading" ? <p className="status-copy">正在載入最新照片。</p> : null}
        {snapshot.phase === "error" ? <p className="status-copy">暫時未能提供這張照片。</p> : null}
        {snapshot.phase === "ready" && snapshot.imageUrl ? (
          <figure className="snapshot">
            <img src={snapshot.imageUrl} alt={`${place}的最新交通快拍`} />
            <figcaption>
              {snapshot.updatedLabel ? `照片更新時間 ${snapshot.updatedLabel}。` : "未能讀取照片的更新時間。"}
              {" "}
              若照片寫著「暫時未能提供服務」，代表這個鏡頭現在沒有新照片。
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
