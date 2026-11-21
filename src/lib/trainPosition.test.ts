import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { LineScheduleView } from "./schedule.ts"
import { readFileSync } from "node:fs"
import { dedupeTrains, frameTrains, LINE_METERS_PER_MINUTE, locateTrain, nextFix, parseLineTrains, remainingMinutes, sentinelStations, type TrainFix } from "./trainPosition.ts"

const stations = new Map([
  ["A", { lng: 114.1, lat: 22.3 }],
  ["B", { lng: 114.11, lat: 22.3 }],
  ["C", { lng: 114.12, lat: 22.3 }],
])

const paths = [
  {
    codes: ["A", "B", "C"],
    coordinates: [
      [114.1, 22.3],
      [114.11, 22.3],
      [114.12, 22.3],
    ] as [number, number][],
  },
]

function place(station: string, destination: string, minutes: number) {
  return locateTrain({
    paths,
    stationAt: (code) => stations.get(code),
    stationCode: station,
    destinationCode: destination,
    remainingMinutes: minutes,
    metersPerMinute: 500,
  })
}

describe("locateTrain", () => {
  it("puts an approaching train on the track behind the station", () => {
    const towardEnd = place("B", "C", 1)
    const towardStart = place("B", "A", 1)
    assert.ok(towardEnd)
    assert.ok(towardStart)
    assert.ok(towardEnd.lng < 114.11)
    assert.ok(towardEnd.lng > 114.1)
    assert.ok(towardStart.lng > 114.11)
    assert.ok(towardEnd.bearing > 45 && towardEnd.bearing < 135)
    assert.ok(towardStart.bearing < -45 || towardStart.bearing > 135)
  })

  it("stops at the end of the track instead of inventing a position past the terminus", () => {
    const held = place("B", "C", 30)
    assert.ok(held)
    assert.ok(Math.abs(held.lng - 114.1) < 0.001)
  })
})

describe("nextFix", () => {
  it("keeps a train moving forward when the minute value has not changed", () => {
    const first = nextFix(undefined, { id: "ISL-UP-CHW", minutes: 3, now: 0 })
    const later = nextFix(first, { id: first.id, minutes: 3, now: 20_000 })
    assert.equal(later, first)
    assert.ok(remainingMinutes(later, 20_000) < remainingMinutes(first, 0))
  })

  it("snaps when the next train is much further away", () => {
    const first: TrainFix = { id: "ISL-UP-CHW", minutes: 0.4, fetchedAt: 0 }
    const next = nextFix(first, { id: first.id, minutes: 6, now: 30_000 })
    assert.notEqual(next, first)
    assert.ok(next.minutes > 6)
  })
})

describe("network train watch", () => {
  it("samples the whole railway without asking every station", () => {
    const network = JSON.parse(readFileSync(new URL("../data/network.json", import.meta.url), "utf8"))
    const stations = new Map(network.stations.map((station: { code: string; lng: number; lat: number }) => [station.code, station]))
    const watches = sentinelStations(network.lines, (code) => stations.get(code), LINE_METERS_PER_MINUTE)
    assert.ok(watches.length >= 15)
    assert.ok(watches.length <= 80)
    assert.ok(watches.some((item) => item.line === "ISL" && item.station === "KET"))
    assert.ok(watches.some((item) => item.line === "ISL" && item.station === "CHW"))
    assert.ok(watches.some((item) => item.line === "DRL"))
  })

  it("reads every listed train and keeps one marker for the same train", () => {
    const trains = parseLineTrains(
      { data: { "ISL-CEN": { UP: [{ dest: "CHW", ttnt: "2", valid: "Y" }, { dest: "CHW", ttnt: "6", valid: "Y" }], DOWN: [] } } },
      "ISL",
      "CEN",
    )
    assert.equal(trains.length, 2)
    const markers = dedupeTrains([
      { line: "ISL", destination: "CHW", minutes: 1, lng: 114.15, lat: 22.28 },
      { line: "ISL", destination: "CHW", minutes: 4, lng: 114.1502, lat: 22.2802 },
      { line: "ISL", destination: "CHW", minutes: 6, lng: 114.17, lat: 22.28 },
    ])
    assert.equal(markers.length, 2)
    assert.equal(markers[0]?.minutes, 1)
  })
})

describe("frameTrains", () => {
  it("uses only the first train in each direction of the open station", () => {
    const view: LineScheduleView = {
      status: "ready",
      message: null,
      delay: false,
      updatedAt: null,
      directions: [
        {
          bound: "UP",
          note: null,
          trains: [
            { destination: "C", destinationCode: "C", platform: "1", time: "14:00", minutesLabel: "2 分鐘", minutes: 2 },
            { destination: "C", destinationCode: "C", platform: "1", time: "14:06", minutesLabel: "8 分鐘", minutes: 8 },
          ],
        },
        { bound: "DOWN", note: "這個方向沒有列車。", trains: [] },
      ],
    }
    const frame = frameTrains({
      stationCode: "B",
      byLine: { ISL: view },
      pathsForLine: () => paths,
      colorForLine: () => "#0071bc",
      stationAt: (code) => stations.get(code),
      fixes: new Map(),
      now: 0,
    })
    assert.equal(frame.trains.length, 1)
    assert.equal(frame.trains[0]?.color, "#0071bc")
    assert.equal(frameTrains({ ...blank(), stationCode: null }).trains.length, 0)
  })
})

function blank() {
  return {
    stationCode: "B",
    byLine: {},
    pathsForLine: () => paths,
    colorForLine: () => "#0071bc",
    stationAt: (code: string) => stations.get(code),
    fixes: new Map<string, TrainFix>(),
    now: 0,
  }
}
