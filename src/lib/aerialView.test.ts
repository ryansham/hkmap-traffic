import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { aerialCamera, flatCamera } from "./aerialView.ts"

describe("aerialCamera", () => {
  it("tilts and zooms in from the city overview", () => {
    assert.deepEqual(aerialCamera({ zoom: 10.4, bearing: 0 }), {
      pitch: 60,
      bearing: -24,
      zoom: 15.7,
    })
  })

  it("keeps a closer zoom and an existing heading", () => {
    assert.deepEqual(aerialCamera({ zoom: 16.4, bearing: 40 }), {
      pitch: 60,
      bearing: 40,
      zoom: 16.4,
    })
  })
})

describe("flatCamera", () => {
  it("returns the map to a north-up plan", () => {
    assert.deepEqual(flatCamera(), { pitch: 0, bearing: 0 })
  })
})
