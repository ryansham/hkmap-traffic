import { useEffect, useRef, useState } from "react"
import { stationByCode } from "../data/index.ts"
import { fetchLineSchedule, formatHongKong } from "./fetchSchedule.ts"
import type { LineScheduleView } from "./schedule.ts"

const REFRESH_MS = 20_000
const EMPTY_BOARD: Record<string, LineScheduleView> = {}

export function useStationArrivals(code: string | null) {
  const [result, setResult] = useState<{
    code: string
    byLine: Record<string, LineScheduleView>
  } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const station = code ? stationByCode.get(code) : undefined
    if (!station) return
    const selected = station

    let disposed = false
    let active: AbortController | null = null

    async function load() {
      active?.abort()
      const controller = new AbortController()
      active = controller
      try {
        const entries = await Promise.all(
          selected.lines.map(async (line) => {
            const view = await fetchLineSchedule(
              line,
              selected.code,
              selected.terminusLines.includes(line),
              controller.signal,
            )
            return [line, view] as const
          }),
        )
        if (disposed || controller.signal.aborted) return
        setResult({ code: selected.code, byLine: Object.fromEntries(entries) })
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
      }
    }

    void load()
    const timer = window.setInterval(() => {
      if (!document.hidden) void load()
    }, REFRESH_MS)
    const onVisible = () => {
      if (!document.hidden) void load()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      disposed = true
      active?.abort()
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [attempt, code])

  const current = code && result?.code === code ? result : null
  return {
    phase: !code ? "idle" : current ? "ready" : "loading",
    byLine: current?.byLine ?? EMPTY_BOARD,
    refresh: () => setAttempt((value) => value + 1),
  } as const
}

export type StationArrivals = ReturnType<typeof useStationArrivals>

function officialSnapshot(url: string | null) {
  return Boolean(url && url.startsWith("https://tdcctv.data.one.gov.hk/") && url.endsWith(".JPG"))
}

export function useSnapshot(url: string | null) {
  const [result, setResult] = useState<{
    url: string
    attempt: number
    imageUrl: string
    updatedLabel: string | null
  } | null>(null)
  const [failedAttempt, setFailedAttempt] = useState<{ url: string; attempt: number } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const objectUrl = useRef<string | null>(null)

  useEffect(() => {
    if (!officialSnapshot(url) || !url) return
    const controller = new AbortController()
    void fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const type = response.headers.get("content-type") ?? ""
        if (!response.ok || !type.includes("image")) throw new Error("unavailable")
        const blob = await response.blob()
        if (controller.signal.aborted) return
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
        objectUrl.current = URL.createObjectURL(blob)
        setResult({
          url,
          attempt,
          imageUrl: objectUrl.current,
          updatedLabel: formatHongKong(response.headers.get("last-modified")),
        })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        if (controller.signal.aborted) return
        setFailedAttempt({ url, attempt })
      })
    return () => controller.abort()
  }, [attempt, url])

  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    }
  }, [])

  const allowed = officialSnapshot(url)
  const ready = Boolean(url && result?.url === url && result.attempt === attempt)
  const failed = Boolean(url && failedAttempt?.url === url && failedAttempt.attempt === attempt)
  const phase = !url ? "idle" : !allowed ? "error" : ready ? "ready" : failed ? "error" : "loading"

  return {
    phase,
    imageUrl: ready ? result?.imageUrl ?? null : null,
    updatedLabel: ready ? result?.updatedLabel ?? null : null,
    refresh: () => setAttempt((value) => value + 1),
  } as const
}
