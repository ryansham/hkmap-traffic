export type Arrival = {
  destination: string
  destinationCode: string
  platform: string
  time: string
  minutesLabel: string
  minutes: number | null
}

export type Bound = "UP" | "DOWN"

export type DirectionView = {
  bound: Bound
  trains: Arrival[]
  note: string | null
}

export type LineScheduleView = {
  status: "ready" | "empty" | "error"
  message: string | null
  delay: boolean
  updatedAt: string | null
  directions: DirectionView[]
}

type RawTrain = {
  seq?: string | number
  dest?: string
  plat?: string | number
  time?: string
  ttnt?: string | number
  valid?: string
}

const EMPTY_SERVICE = "暫時沒有到站班次。"
const UNAVAILABLE = "暫時取不到到站班次。"
const TOO_MANY = "港鐵暫時不接受更多查詢，請稍後再試。"

function errorView(message: string): LineScheduleView {
  return { status: "error", message, delay: false, updatedAt: null, directions: [] }
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function minutesValue(value: string | number | undefined): number | null {
  const minutes = Number(value)
  return Number.isFinite(minutes) ? minutes : null
}

function minutesLabel(value: string | number | undefined): string {
  const minutes = minutesValue(value)
  if (minutes === null) return "時間未明"
  if (minutes <= 0) return "即將開出"
  return `${minutes} 分鐘`
}

function clock(value: string | undefined): string {
  if (!value || value.length < 16) return "時間未明"
  return value.slice(11, 16)
}

function usableTrains(value: unknown): RawTrain[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is RawTrain => {
    if (!item || typeof item !== "object") return false
    const train = item as RawTrain
    return train.valid !== "N" && typeof train.dest === "string" && train.dest.length > 0
  })
}

function toArrivals(trains: RawTrain[], stationName: (code: string) => string): Arrival[] {
  return [...trains]
    .sort((a, b) => Number(a.seq) - Number(b.seq))
    .map((train) => ({
      destination: stationName(train.dest ?? ""),
      destinationCode: train.dest ?? "",
      platform: train.plat === undefined || train.plat === "" ? "—" : String(train.plat),
      time: clock(train.time),
      minutesLabel: minutesLabel(train.ttnt),
      minutes: minutesValue(train.ttnt),
    }))
}

function directionNote(isTerminus: boolean): string {
  return isTerminus ? "這個方向沒有列車。" : "這個方向暫時沒有列車。"
}

export function interpretSchedule(options: {
  httpStatus: number
  body: unknown
  line: string
  station: string
  isTerminus: boolean
  stationName: (code: string) => string
}): LineScheduleView {
  if (options.httpStatus === 429) return errorView(TOO_MANY)
  if (options.httpStatus !== 200) return errorView(UNAVAILABLE)

  const body = record(options.body)
  if (!body) return errorView(UNAVAILABLE)
  if (Number(body.status) === 0) return errorView(UNAVAILABLE)

  const data = record(body.data)
  const block = data ? record(data[`${options.line}-${options.station}`]) : null
  const up = usableTrains(block?.UP)
  const down = usableTrains(block?.DOWN)
  const updatedAt = typeof body.curr_time === "string" ? body.curr_time : null
  const nestedDelay = block?.isdelay === "Y"
  const delay = body.isdelay === "Y" || nestedDelay

  if (up.length === 0 && down.length === 0) {
    return { status: "empty", message: EMPTY_SERVICE, delay, updatedAt, directions: [] }
  }

  const directions: DirectionView[] = []
  if (up.length > 0) directions.push({ bound: "UP", trains: toArrivals(up, options.stationName), note: null })
  if (down.length > 0) directions.push({ bound: "DOWN", trains: toArrivals(down, options.stationName), note: null })
  if (up.length === 0) directions.push({ bound: "UP", trains: [], note: directionNote(options.isTerminus) })
  if (down.length === 0) directions.push({ bound: "DOWN", trains: [], note: directionNote(options.isTerminus) })

  return { status: "ready", message: null, delay, updatedAt, directions }
}
