import { stationByCode } from "../data/index.ts"
import { interpretSchedule, type LineScheduleView } from "./schedule.ts"

function unavailable(): LineScheduleView {
  return {
    status: "error",
    message: "暫時取不到到站班次。",
    delay: false,
    updatedAt: null,
    directions: [],
  }
}

export async function fetchLineSchedule(
  line: string,
  station: string,
  isTerminus: boolean,
  signal: AbortSignal,
): Promise<LineScheduleView> {
  const url = new URL("https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php")
  url.searchParams.set("line", line)
  url.searchParams.set("sta", station)
  url.searchParams.set("lang", "TC")

  try {
    const response = await fetch(url, {
      signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      body = null
    }
    return interpretSchedule({
      httpStatus: response.status,
      body,
      line,
      station,
      isTerminus,
      stationName: (code) => stationByCode.get(code)?.zh ?? code,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    return unavailable()
  }
}

export function formatMtrClock(value: string | null): string | null {
  const match = value?.match(/(\d{2}:\d{2})/)
  return match ? `${match[1]}（香港時間）` : null
}

export function formatHongKong(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const formatted = new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date)
  return `${formatted}（香港時間）`
}
