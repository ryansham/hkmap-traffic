import { useMemo, useState, type KeyboardEvent } from "react"
import { cameras, network } from "../data/index.ts"
import { searchPlaces, type SearchHit } from "../lib/search.ts"

type Props = {
  query: string
  onQueryChange: (value: string) => void
  onPickStation: (code: string) => void
  onPickCamera: (key: string) => void
}

export function PlaceSearch({ query, onQueryChange, onPickStation, onPickCamera }: Props) {
  const [trackedQuery, setTrackedQuery] = useState(query)
  const [active, setActive] = useState(0)
  const matches = useMemo(
    () => searchPlaces(query, { stations: network.stations, cameras }),
    [query],
  )
  const queryChanged = trackedQuery !== query
  if (queryChanged) {
    setTrackedQuery(query)
    setActive(0)
  }
  const open = query.trim().length > 0
  const activeIndex = queryChanged ? 0 : active
  const current = matches.length === 0 ? 0 : Math.min(activeIndex, matches.length - 1)

  function pick(hit: SearchHit) {
    if (hit.kind === "station") onPickStation(hit.code)
    else onPickCamera(hit.key)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (!open) return
    if (event.key === "ArrowDown" && matches.length > 0) {
      event.preventDefault()
      setActive(Math.min(matches.length - 1, current + 1))
    } else if (event.key === "ArrowUp" && matches.length > 0) {
      event.preventDefault()
      setActive(Math.max(0, current - 1))
    } else if (event.key === "Enter") {
      const hit = matches[current]
      if (!hit) return
      event.preventDefault()
      pick(hit)
    }
  }

  return (
    <div className="search">
      <label className="visually-hidden" htmlFor="place-search">
        搜尋車站或快拍點
      </label>
      <input
        id="place-search"
        role="combobox"
        aria-expanded={open}
        aria-controls="place-results"
        aria-autocomplete="list"
        aria-activedescendant={open && matches[current] ? optionId(matches[current]) : undefined}
        value={query}
        placeholder="車站或快拍，例如紅磡、紅隧"
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {open ? (
        <ul id="place-results" role="listbox">
          {matches.length === 0 ? <li className="empty-match">沒有相符的車站或快拍點。</li> : null}
          {matches.map((hit, index) => (
            <li key={hit.kind === "station" ? hit.code : hit.key}>
              <button
                id={optionId(hit)}
                type="button"
                role="option"
                aria-selected={index === current}
                className={index === current ? "is-active" : undefined}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(hit)}
              >
                <span className="hit-copy">
                  <strong>{hit.title}</strong>
                  <span>{hit.subtitle}</span>
                </span>
                <em className="hit-kind">{hit.kind === "station" ? "車站" : "快拍"}</em>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function optionId(hit: SearchHit) {
  return hit.kind === "station" ? `hit-station-${hit.code}` : `hit-camera-${hit.key}`
}
