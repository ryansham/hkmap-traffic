import type { CameraRecord, StationRecord } from "../types.ts"

export type SearchSources = {
  stations: StationRecord[]
  cameras: CameraRecord[]
}

export type SearchHit =
  | { kind: "station"; code: string; title: string; subtitle: string }
  | { kind: "camera"; key: string; title: string; subtitle: string }

const VARIANT: Record<string, string> = { 茘: "荔", 啓: "啟" }

const SHORTCUTS: { needle: string; match: (place: string) => boolean }[] = [
  {
    needle: "紅隧",
    match: (place) => place.includes("海底隧道") && !place.includes("東區海底隧道") && !place.includes("西區海底隧道"),
  },
  { needle: "東隧", match: (place) => place.includes("東區海底隧道") },
  { needle: "西隧", match: (place) => place.includes("西區海底隧道") },
]

export function foldPlace(value: string) {
  return value
    .replace(/[茘啓]/g, (char) => VARIANT[char] ?? char)
    .trim()
    .toLowerCase()
}

export function cameraPlaceName(description: string) {
  return description.replace(/\s*\[[^\]]+\]\s*$/, "").trim()
}

function fieldScore(field: string, query: string): number | null {
  const hay = foldPlace(field)
  const needle = foldPlace(query)
  if (!needle || !hay) return null
  if (hay === needle) return 0
  if (hay.startsWith(needle)) return 1
  if (hay.includes(needle)) return 2
  return null
}

function bestScore(fields: string[], query: string): number | null {
  let best: number | null = null
  for (const field of fields) {
    const next = fieldScore(field, query)
    if (next === null) continue
    if (best === null || next < best) best = next
  }
  return best
}

function shortcutScore(query: string, place: string): number | null {
  const needle = foldPlace(query)
  const shortcut = SHORTCUTS.find((item) => item.needle === needle)
  if (!shortcut?.match(place)) return null
  return 1
}

function better(current: number | null, next: number | null) {
  if (next === null) return current
  if (current === null || next < current) return next
  return current
}

export function searchPlaces(query: string, sources: SearchSources, limit = 8): SearchHit[] {
  const needle = foldPlace(query)
  if (!needle) return []

  const ranked: { rank: number; title: string; hit: SearchHit }[] = []

  for (const station of sources.stations) {
    const score = bestScore([station.zh, station.en, station.code], needle)
    if (score === null) continue
    ranked.push({
      rank: score,
      title: station.zh,
      hit: { kind: "station", code: station.code, title: station.zh, subtitle: station.en },
    })
  }

  for (const camera of sources.cameras) {
    const place = cameraPlaceName(camera.description)
    const score = better(
      bestScore([place, camera.district, camera.region, camera.key, camera.description], needle),
      shortcutScore(needle, place),
    )
    if (score === null) continue
    ranked.push({
      rank: score + 0.5,
      title: place,
      hit: {
        kind: "camera",
        key: camera.key,
        title: place,
        subtitle: `${camera.district} · ${camera.region}`,
      },
    })
  }

  ranked.sort(
    (a, b) => a.rank - b.rank || a.title.length - b.title.length || a.title.localeCompare(b.title, "zh-Hant"),
  )
  return ranked.slice(0, limit).map((item) => item.hit)
}
