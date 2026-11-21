import {
  LINE_METERS_PER_MINUTE,
  dedupeTrains,
  locateTrain,
  parseLineTrains,
  sentinelStations,
  type ReportedTrain,
} from "../lib/trainPosition.ts"

type Station = { code: string; lng: number; lat: number }
type Line = { code: string; paths: { codes: string[]; coordinates: [number, number][] }[] }
export type RailNetwork = { lines: Line[]; stations: Station[] }

type ScheduleCache = {
  schedule: (line: string, station: string) => Promise<Response>
  remember: (key: string, ttlSeconds: number, producer: () => Promise<ReportedTrain[]>) => Promise<{ value: ReportedTrain[]; ageMs: number }>
}

const COVER_MINUTES = 7
const UPSTREAM_LIMIT = 4

export function watchStations(network: RailNetwork) {
  const stationByCode = new Map(network.stations.map((station) => [station.code, station]))
  return sentinelStations(network.lines, (code) => stationByCode.get(code), LINE_METERS_PER_MINUTE, COVER_MINUTES)
}

export async function buildTrainFeed(cache: Pick<ScheduleCache, "schedule">, network: RailNetwork) {
  const stationByCode = new Map(network.stations.map((station) => [station.code, station]))
  const lineByCode = new Map(network.lines.map((line) => [line.code, line]))
  const stations = watchStations(network)
  const batches = await pool(stations, UPSTREAM_LIMIT, async (item) => {
    try {
      const response = await cache.schedule(item.line, item.station)
      if (!response.ok) return []
      return parseLineTrains(await response.json(), item.line, item.station)
    } catch {
      return []
    }
  })
  const placed = batches.flat().flatMap((train) => {
    const spot = locateTrain({
      paths: lineByCode.get(train.line)?.paths ?? [],
      stationAt: (code) => stationByCode.get(code),
      stationCode: train.station,
      destinationCode: train.destination,
      remainingMinutes: train.minutes <= 0 ? 0.1 : train.minutes + 0.35,
      metersPerMinute: LINE_METERS_PER_MINUTE[train.line] ?? 530,
    })
    return spot ? [{ ...train, ...spot }] : []
  })
  return dedupeTrains(placed).slice(0, 160).map((train) => ({
    line: train.line,
    station: train.station,
    destination: train.destination,
    minutes: train.minutes,
  }))
}

export async function trainFeedResponse(cache: ScheduleCache, network: RailNetwork) {
  try {
    const snap = await cache.remember("trains:snapshot", 20, () => buildTrainFeed(cache, network))
    return Response.json(
      { ageMs: Math.round(snap.ageMs), trains: snap.value },
      { headers: { "cache-control": "public, max-age=20", "access-control-allow-origin": "*" } },
    )
  } catch {
    return Response.json(
      { ageMs: 0, trains: [] },
      { headers: { "cache-control": "public, max-age=5", "access-control-allow-origin": "*" } },
    )
  }
}

async function pool<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await task(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}
