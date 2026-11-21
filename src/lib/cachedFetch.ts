import { network, stationByCode } from "../data/index.ts"
import { assembleTrainFeed, LINE_METERS_PER_MINUTE } from "./trainPosition.ts"

const LIVE_CACHE_ORIGIN = ""
const SCHEDULE_TTL_MS = 20_000
const scheduleCache = new Map<string, { expiresAt: number; body: unknown }>()
const scheduleInflight = new Map<string, Promise<unknown>>()

function sources(path: string) {
  const urls = [path]
  if (LIVE_CACHE_ORIGIN) urls.push(`${LIVE_CACHE_ORIGIN}${path}`)
  return urls
}

export async function fetchThroughCache(path: string, signal: AbortSignal, fallback: () => Promise<Response>) {
  for (const url of sources(path)) {
    try {
      const response = await fetch(url, { signal, headers: { Accept: "application/json, image/jpeg" } })
      const type = response.headers.get("content-type") ?? ""
      if (type.includes("text/html") || response.status === 404) continue
      return response
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error
    }
  }
  return fallback()
}

export async function fetchTrainFeed(signal: AbortSignal): Promise<{ ageMs: number; trains: TrainSighting[] } | null> {
  for (const url of sources("/api/trains")) {
    try {
      const response = await fetch(url, { signal, headers: { Accept: "application/json" } })
      const type = response.headers.get("content-type") ?? ""
      if (!response.ok || !type.includes("json")) continue
      const body = (await response.json()) as { ageMs?: unknown; trains?: unknown }
      if (!Array.isArray(body.trains)) continue
      const trains = body.trains.flatMap((item) => {
        if (!item || typeof item !== "object") return []
        const row = item as { line?: unknown; station?: unknown; destination?: unknown; minutes?: unknown }
        if (typeof row.line !== "string" || typeof row.station !== "string" || typeof row.destination !== "string") return []
        const minutes = Number(row.minutes)
        if (!Number.isFinite(minutes)) return []
        return [{ line: row.line, station: row.station, destination: row.destination, minutes }]
      })
      return { ageMs: Number(body.ageMs) || 0, trains }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error
    }
  }
  const trains = await assembleTrainFeed({
    lines: network.lines,
    stationAt: (code) => stationByCode.get(code),
    fetchBody: (line, station) => readSchedule(line, station, signal),
    metersPerMinute: LINE_METERS_PER_MINUTE,
  })
  return { ageMs: 0, trains }
}

async function readSchedule(line: string, station: string, signal: AbortSignal) {
  const key = `${line}:${station}`
  const cached = scheduleCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.body
  const pending = scheduleInflight.get(key)
  if (pending) return pending
  const url = new URL("https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php")
  url.searchParams.set("line", line)
  url.searchParams.set("sta", station)
  url.searchParams.set("lang", "TC")
  const task = fetch(url, { signal, headers: { Accept: "application/json" } })
    .then(async (response) => {
      if (!response.ok) throw new Error(String(response.status))
      const body: unknown = await response.json()
      scheduleCache.set(key, { expiresAt: Date.now() + SCHEDULE_TTL_MS, body })
      scheduleInflight.delete(key)
      return body
    })
    .catch((error: unknown) => {
      scheduleInflight.delete(key)
      throw error
    })
  scheduleInflight.set(key, task)
  return task
}

export type TrainSighting = {
  line: string
  station: string
  destination: string
  minutes: number
}
