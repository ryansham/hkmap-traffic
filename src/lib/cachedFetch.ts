const LIVE_CACHE_ORIGIN = ""

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
  return null
}

export type TrainSighting = {
  line: string
  station: string
  destination: string
  minutes: number
}
