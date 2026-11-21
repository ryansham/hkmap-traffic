import type { LineScheduleView } from "./schedule.ts"

export type NextTrainSummary = {
  lineCode: string
  lineName: string
  color: string
  destination: string
  platform: string
  minutesLabel: string
}

export function minutesRank(label: string) {
  if (label === "即將開出") return 0
  const match = /^(\d+)\s*分鐘$/.exec(label)
  if (!match) return Number.POSITIVE_INFINITY
  return Number(match[1])
}

export function summarizeNextTrains(
  lines: { code: string; name: string; color: string }[],
  byLine: Record<string, LineScheduleView | undefined>,
  limit = 2,
): { trains: NextTrainSummary[]; extra: number } {
  const ranked: (NextTrainSummary & { rank: number })[] = []
  for (const line of lines) {
    const view = byLine[line.code]
    if (!view || view.status !== "ready") continue
    for (const direction of view.directions) {
      const train = direction.trains[0]
      if (!train) continue
      ranked.push({
        lineCode: line.code,
        lineName: line.name,
        color: line.color,
        destination: train.destination,
        platform: train.platform,
        minutesLabel: train.minutesLabel,
        rank: minutesRank(train.minutesLabel),
      })
    }
  }
  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.lineName.localeCompare(b.lineName, "zh-Hant") ||
      a.destination.localeCompare(b.destination, "zh-Hant"),
  )
  const shown = ranked.slice(0, limit)
  return {
    trains: shown.map((train) => ({
      lineCode: train.lineCode,
      lineName: train.lineName,
      color: train.color,
      destination: train.destination,
      platform: train.platform,
      minutesLabel: train.minutesLabel,
    })),
    extra: ranked.length - shown.length,
  }
}
