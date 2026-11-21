import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { CAMERA_LABEL_ZOOM, CAMERA_STREET_ZOOM, cameraZoomBounds } from "./cameraVisibility.ts"

describe("cameraZoomBounds", () => {
  it("hides cameras until street zoom unless the city layer is on", () => {
    assert.deepEqual(cameraZoomBounds(false), {
      minzoom: CAMERA_STREET_ZOOM,
      labelMinZoom: CAMERA_LABEL_ZOOM,
    })
    assert.equal(CAMERA_STREET_ZOOM, 13)
    assert.deepEqual(cameraZoomBounds(true), { minzoom: 0, labelMinZoom: CAMERA_LABEL_ZOOM })
  })
})
