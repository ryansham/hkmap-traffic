export const CAMERA_STREET_ZOOM = 13
export const CAMERA_LABEL_ZOOM = 13.4

export function cameraZoomBounds(showAcrossCity: boolean) {
  return {
    minzoom: showAcrossCity ? 0 : CAMERA_STREET_ZOOM,
    labelMinZoom: CAMERA_LABEL_ZOOM,
  }
}
