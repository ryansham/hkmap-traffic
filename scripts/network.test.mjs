import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { maxOffsetFromChords } from "./rail-geometry.mjs"

const network = JSON.parse(readFileSync(new URL("../src/data/network.json", import.meta.url), "utf8"))
const cameras = JSON.parse(readFileSync(new URL("../src/data/cameras.json", import.meta.url), "utf8"))

function line(code) {
  const found = network.lines.find((item) => item.code === code)
  assert.ok(found, code)
  return found
}

function station(code) {
  const found = network.stations.find((item) => item.code === code)
  assert.ok(found, code)
  return found
}

describe("bundled network", () => {
  it("places every heavy-rail station that has a next-train code", () => {
    assert.equal(network.stations.length, 98)
    assert.equal(new Set(network.stations.map((item) => item.code)).size, 98)
    assert.equal(network.lines.length, 10)
    for (const item of network.stations) {
      assert.ok(item.lng > 113.8 && item.lng < 114.5)
      assert.ok(item.lat > 22.2 && item.lat < 22.58)
      assert.ok(item.lines.length > 0)
    }
  })

  it("keeps Racecourse off the East Rail main line", () => {
    const eastRail = line("EAL")
    const main = eastRail.paths[0]
    assert.equal(main.codes.includes("RAC"), false)
    assert.equal(main.codes.includes("FOT"), true)
    assert.deepEqual(eastRail.paths[1].codes, ["SHS", "LMC"])
    assert.deepEqual(eastRail.paths[2].codes, ["SHT", "RAC", "UNI"])
    assert.deepEqual(station("RAC").lines, ["EAL"])
    assert.equal(station("RAC").terminusLines.includes("EAL"), false)
  })

  it("draws the LOHAS Park spur separately", () => {
    const tko = line("TKL")
    assert.equal(tko.paths[0].codes.includes("LHP"), false)
    assert.deepEqual(tko.paths[1].codes, ["TKO", "LHP"])
    assert.equal(station("LHP").terminusLines.includes("TKL"), true)
  })

  it("bends the Airport Express along the railway instead of station chords", () => {
    const airport = line("AEL")
    const stops = airport.paths[0].codes.map(station)
    const offset = maxOffsetFromChords(airport.paths[0].coordinates, stops)
    assert.ok(offset > 800, `expected a geographic curve, offset was ${Math.round(offset)}m`)
    for (const record of network.lines) {
      for (const path of record.paths) {
        assert.ok(path.coordinates.length > path.codes.length, `${record.code} is still a station chord`)
        for (const [lng, lat] of path.coordinates) {
          assert.ok(lng > 113.75 && lng < 114.5 && lat > 22.12 && lat < 22.6)
        }
      }
    }
  })

  it("knows Admiralty and Central serve the expected lines", () => {
    assert.deepEqual(station("ADM").lines, ["ISL", "TWL", "SIL", "EAL"])
    assert.deepEqual(station("CEN").lines, ["ISL", "TWL"])
    assert.equal(station("CEN").terminusLines.includes("TWL"), true)
    assert.equal(station("CEN").terminusLines.includes("ISL"), false)
    assert.equal(station("LAK").zh, "荔景")
  })
})

describe("bundled cameras", () => {
  it("keeps the last northbound Shenzhen Bay camera at the bridge's northern end", () => {
    const northbound = cameras.find((camera) => camera.key === "AID10120")
    const previous = cameras.find((camera) => camera.key === "AID10119")
    assert.ok(northbound.lat > previous.lat)
    assert.ok(northbound.lng < previous.lng)
    assert.ok(Math.abs(northbound.lat - 22.47685) < 0.0001)
    assert.ok(Math.abs(northbound.lng - 113.9555) < 0.0001)
  })

  it("keeps every official snapshot point", () => {
    assert.equal(cameras.length, 1013)
    const keys = new Set()
    for (const camera of cameras) {
      assert.equal(keys.has(camera.key), false)
      keys.add(camera.key)
      assert.match(camera.url, /^https:\/\/tdcctv\.data\.one\.gov\.hk\/.+\.JPG$/)
      assert.ok(Number.isFinite(camera.lng) && Number.isFinite(camera.lat))
      assert.ok(camera.description.length > 0)
    }
  })
})
