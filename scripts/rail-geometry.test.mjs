import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { TrackGapError, maxOffsetFromChords, traceTrack, waysFromOsm } from "./rail-geometry.mjs"

function arc() {
  const coordinates = []
  for (let step = 0; step <= 20; step += 1) {
    const t = step / 20
    const lng = 114.1 + t * 0.02
    const lat = 22.3 + Math.sin(Math.PI * t) * 0.01
    coordinates.push([lng, lat])
  }
  return coordinates
}

describe("traceTrack", () => {
  it("follows a curve instead of the chord between stations", () => {
    const coordinates = arc()
    const stations = [
      { code: "A", lng: coordinates[0][0], lat: coordinates[0][1] },
      { code: "B", lng: coordinates.at(-1)[0], lat: coordinates.at(-1)[1] },
    ]
    const traced = traceTrack([{ id: 1, coordinates }], stations, { toleranceMeters: 4 })
    assert.ok(traced.length > 2)
    assert.ok(Math.max(...traced.map((point) => point[1])) > 22.305)
    assert.ok(maxOffsetFromChords(traced, stations) > 400)
  })

  it("joins ways that stop a few meters apart", () => {
    const left = arc().slice(0, 11)
    const right = arc().slice(10).map(([lng, lat]) => [lng + 0.00008, lat])
    const stations = [
      { code: "A", lng: left[0][0], lat: left[0][1] },
      { code: "B", lng: right.at(-1)[0], lat: right.at(-1)[1] },
    ]
    const traced = traceTrack(
      [
        { id: 1, coordinates: left },
        { id: 2, coordinates: right },
      ],
      stations,
      { joinMeters: 20 },
    )
    assert.ok(traced.at(-1)[0] > 114.11)
  })

  it("reports a gap when the tracks do not connect", () => {
    const stations = [
      { code: "A", lng: 114.1, lat: 22.3 },
      { code: "B", lng: 114.2, lat: 22.3 },
    ]
    assert.throws(
      () =>
        traceTrack(
          [
            { id: 1, coordinates: [[114.1, 22.3], [114.101, 22.3]] },
            { id: 2, coordinates: [[114.19, 22.3], [114.2, 22.3]] },
          ],
          stations,
          { joinMeters: 20 },
        ),
      TrackGapError,
    )
  })
})

describe("waysFromOsm", () => {
  it("keeps running tracks and drops platforms", () => {
    const ways = waysFromOsm([
      { type: "node", id: 1, lon: 114.1, lat: 22.3 },
      { type: "node", id: 2, lon: 114.11, lat: 22.31 },
      { type: "node", id: 3, lon: 114.12, lat: 22.3 },
      { type: "way", id: 10, nodes: [1, 2], tags: { railway: "subway" } },
      { type: "way", id: 11, nodes: [2, 3], tags: { railway: "platform" } },
    ])
    assert.deepEqual(ways.map((way) => way.id), [10])
  })
})
