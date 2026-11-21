export const AERIAL_PITCH = 60
export const AERIAL_ZOOM = 15.7
export const AERIAL_BEARING = -24

export function aerialCamera(current: { zoom: number; bearing: number }) {
  return {
    pitch: AERIAL_PITCH,
    bearing: current.bearing === 0 ? AERIAL_BEARING : current.bearing,
    zoom: Math.max(current.zoom, AERIAL_ZOOM),
  }
}

export function flatCamera() {
  return { pitch: 0, bearing: 0 }
}
