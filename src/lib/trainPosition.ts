import type { LineScheduleView } from "./schedule.ts"

export const LINE_METERS_PER_MINUTE: Record<string, number> = {
  ISL: 530,
  TWL: 530,
  KTL: 530,
  TKL: 560,
  SIL: 500,
  EAL: 850,
  TML: 750,
  TCL: 900,
  AEL: 1100,
  DRL: 600,
}

export type TrainFix = {
  id: string
  minutes: number
  fetchedAt: number
}

export type TrainMarker = {
  id: string
  lng: number
  lat: number
  bearing: number
  color: string
}

type Coord = [number, number]

type PathShape = {
  codes: string[]
  coordinates: Coord[]
}

type StationPoint = {
  lng: number
  lat: number
}

type MeasuredPoint = StationPoint & { meters: number }

type MeasuredPath = {
  codes: string[]
  points: MeasuredPoint[]
  total: number
}

const EMPTY: TrainMarker[] = []

export function nextFix(
  previous: TrainFix | undefined,
  incoming: { id: string; minutes: number; now: number },
): TrainFix {
  const estimate = incoming.minutes <= 0 ? 0.1 : incoming.minutes + 0.35
  if (!previous || previous.id !== incoming.id) {
    return { id: incoming.id, minutes: estimate, fetchedAt: incoming.now }
  }
  const projected = previous.minutes - (incoming.now - previous.fetchedAt) / 60_000
  if (estimate < projected - 0.75 || estimate > projected + 1.2) {
    return { id: incoming.id, minutes: estimate, fetchedAt: incoming.now }
  }
  return previous
}

export function remainingMinutes(fix: TrainFix, now: number) {
  return Math.max(0, fix.minutes - (now - fix.fetchedAt) / 60_000)
}

export function locateTrain(options: {
  paths: PathShape[]
  stationAt: (code: string) => StationPoint | undefined
  stationCode: string
  destinationCode: string
  remainingMinutes: number
  metersPerMinute: number
}): { lng: number; lat: number; bearing: number } | null {
  const station = options.stationAt(options.stationCode)
  const destination = options.stationAt(options.destinationCode)
  if (!station || !destination || options.metersPerMinute <= 0) return null

  let chosen: { path: MeasuredPath; stationMeters: number; destinationMeters: number } | null = null
  for (const shape of options.paths) {
    if (!shape.codes.includes(options.stationCode) || !shape.codes.includes(options.destinationCode)) continue
    if (options.stationCode === options.destinationCode) continue
    const path = measure(shape)
    if (path.total <= 0) continue
    const stationMeters = project(path, station)
    const destinationMeters = project(path, destination)
    const span = Math.abs(destinationMeters - stationMeters)
    if (!chosen || span < Math.abs(chosen.destinationMeters - chosen.stationMeters)) {
      chosen = { path, stationMeters, destinationMeters }
    }
  }
  if (!chosen) return null

  const sign = chosen.destinationMeters >= chosen.stationMeters ? 1 : -1
  const back = Math.max(0, options.remainingMinutes) * options.metersPerMinute
  const trainMeters = clamp(chosen.stationMeters - sign * back, 0, chosen.path.total)
  const here = pointAt(chosen.path, trainMeters)
  const aheadMeters = clamp(trainMeters + sign * 40, 0, chosen.path.total)
  const bearingFrom = aheadMeters === trainMeters ? pointAt(chosen.path, trainMeters - sign * 40) : here
  const bearingTo = aheadMeters === trainMeters ? here : pointAt(chosen.path, aheadMeters)
  return {
    lng: round(here.lng),
    lat: round(here.lat),
    bearing: bearing(bearingFrom, bearingTo),
  }
}

export type ReportedTrain = {
  line: string
  station: string
  destination: string
  minutes: number
}

export function parseLineTrains(body: unknown, line: string, station: string): ReportedTrain[] {
  if (!body || typeof body !== "object") return []
  const data = (body as { data?: unknown }).data
  if (!data || typeof data !== "object") return []
  const block = (data as Record<string, unknown>)[`${line}-${station}`]
  if (!block || typeof block !== "object") return []
  const trains: ReportedTrain[] = []
  for (const bound of ["UP", "DOWN"]) {
    const list = (block as Record<string, unknown>)[bound]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (!item || typeof item !== "object") continue
      const row = item as { dest?: unknown; ttnt?: unknown; valid?: unknown }
      if (row.valid === "N" || typeof row.dest !== "string" || row.dest.length === 0) continue
      const minutes = Number(row.ttnt)
      if (!Number.isFinite(minutes)) continue
      trains.push({ line, station, destination: row.dest, minutes })
    }
  }
  return trains
}

export function sentinelStations(
  lines: { code: string; paths: PathShape[] }[],
  stationAt: (code: string) => StationPoint | undefined,
  metersPerMinute: Record<string, number>,
  coverMinutes = 7,
) {
  const chosen = new Map<string, { line: string; station: string }>()
  for (const line of lines) {
    const speed = metersPerMinute[line.code] ?? 530
    for (const shape of line.paths) {
      const path = measure(shape)
      const stops = shape.codes.flatMap((code) => {
        const point = stationAt(code)
        return point ? [{ code, meters: project(path, point) }] : []
      })
      stops.sort((a, b) => a.meters - b.meters)
      let last = Number.NEGATIVE_INFINITY
      stops.forEach((stop, index) => {
        const edge = index === 0 || index === stops.length - 1
        if (edge || (stop.meters - last) / speed >= coverMinutes) {
          chosen.set(`${line.code}:${stop.code}`, { line: line.code, station: stop.code })
          last = stop.meters
        }
      })
    }
  }
  return [...chosen.values()]
}

export function dedupeTrains<T extends { line: string; destination: string; lng: number; lat: number; minutes: number }>(
  trains: T[],
  radiusMeters = 600,
) {
  const kept: T[] = []
  for (const train of [...trains].sort((a, b) => a.minutes - b.minutes)) {
    const sameTrain = kept.some(
      (other) =>
        other.line === train.line &&
        other.destination === train.destination &&
        haversine(other, train) < radiusMeters,
    )
    if (!sameTrain) kept.push(train)
  }
  return kept
}

export function frameTrains(options: {
  stationCode: string | null
  byLine: Record<string, LineScheduleView>
  pathsForLine: (line: string) => PathShape[]
  colorForLine: (line: string) => string
  stationAt: (code: string) => StationPoint | undefined
  fixes: Map<string, TrainFix>
  now: number
}): { fixes: Map<string, TrainFix>; trains: TrainMarker[] } {
  if (!options.stationCode) return { fixes: new Map(), trains: EMPTY }
  const fixes = new Map<string, TrainFix>()
  const trains: TrainMarker[] = []
  for (const [line, view] of Object.entries(options.byLine)) {
    if (view.status !== "ready") continue
    for (const direction of view.directions) {
      const train = direction.trains[0]
      if (!train || train.minutes === null || !train.destinationCode) continue
      const id = `${line}-${direction.bound}-${train.destinationCode}`
      const fix = nextFix(options.fixes.get(id), { id, minutes: train.minutes, now: options.now })
      fixes.set(id, fix)
      const spot = locateTrain({
        paths: options.pathsForLine(line),
        stationAt: options.stationAt,
        stationCode: options.stationCode,
        destinationCode: train.destinationCode,
        remainingMinutes: remainingMinutes(fix, options.now),
        metersPerMinute: LINE_METERS_PER_MINUTE[line] ?? 530,
      })
      if (!spot) continue
      trains.push({ id, color: options.colorForLine(line), ...spot })
    }
  }
  return { fixes, trains }
}

function measure(shape: PathShape): MeasuredPath {
  const points: MeasuredPoint[] = []
  let meters = 0
  for (let index = 0; index < shape.coordinates.length; index += 1) {
    const [lng, lat] = shape.coordinates[index]
    if (index > 0) meters += haversine(shape.coordinates[index - 1], shape.coordinates[index])
    points.push({ lng, lat, meters })
  }
  return { codes: shape.codes, points, total: meters }
}

function project(path: MeasuredPath, station: StationPoint) {
  let best = 0
  let bestDistance = Infinity
  for (let index = 0; index < path.points.length - 1; index += 1) {
    const start = path.points[index]
    const end = path.points[index + 1]
    const startXY = toXY(start)
    const endXY = toXY(end)
    const point = toXY(station)
    const dx = endXY.x - startXY.x
    const dy = endXY.y - startXY.y
    const lengthSquared = dx * dx + dy * dy
    const t = lengthSquared === 0 ? 0 : clamp(((point.x - startXY.x) * dx + (point.y - startXY.y) * dy) / lengthSquared, 0, 1)
    const distance = Math.hypot(point.x - (startXY.x + t * dx), point.y - (startXY.y + t * dy))
    if (distance < bestDistance) {
      bestDistance = distance
      best = start.meters + t * (end.meters - start.meters)
    }
  }
  return best
}

function pointAt(path: MeasuredPath, meters: number): StationPoint {
  if (path.points.length === 0) return { lng: 0, lat: 0 }
  if (meters <= 0) return path.points[0]
  if (meters >= path.total) return path.points[path.points.length - 1]
  for (let index = 1; index < path.points.length; index += 1) {
    const end = path.points[index]
    if (end.meters < meters) continue
    const start = path.points[index - 1]
    const span = end.meters - start.meters
    const t = span === 0 ? 0 : (meters - start.meters) / span
    return { lng: start.lng + (end.lng - start.lng) * t, lat: start.lat + (end.lat - start.lat) * t }
  }
  return path.points[path.points.length - 1]
}

function haversine(a: Coord | StationPoint, b: Coord | StationPoint) {
  const [lng1, lat1] = pair(a)
  const [lng2, lat2] = pair(b)
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lng2 - lng1) * Math.PI) / 180
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

function pair(value: Coord | StationPoint): Coord {
  return Array.isArray(value) ? value : [value.lng, value.lat]
}

function toXY(point: StationPoint) {
  const cos = Math.cos((22.35 * Math.PI) / 180)
  return { x: point.lng * 111_320 * cos, y: point.lat * 110_540 }
}

function bearing(from: StationPoint, to: StationPoint) {
  const lat1 = (from.lat * Math.PI) / 180
  const lat2 = (to.lat * Math.PI) / 180
  const dl = ((to.lng - from.lng) * Math.PI) / 180
  const y = Math.sin(dl) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dl)
  return (Math.atan2(y, x) * 180) / Math.PI
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function round(value: number) {
  return Math.round(value * 1e5) / 1e5
}
