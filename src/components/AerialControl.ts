import type { IControl, Map as MapLibreMap } from "maplibre-gl"
import { aerialCamera, flatCamera } from "../lib/aerialView.ts"

export class AerialControl implements IControl {
  private map?: MapLibreMap
  private container?: HTMLDivElement
  private button?: HTMLButtonElement
  private aerial = false

  onAdd(map: MapLibreMap) {
    this.map = map
    const container = document.createElement("div")
    container.className = "maplibregl-ctrl maplibregl-ctrl-group"
    const button = document.createElement("button")
    button.type = "button"
    button.className = "aerial-toggle"
    button.textContent = "3D"
    button.addEventListener("click", () => this.toggle())
    container.appendChild(button)
    this.container = container
    this.button = button
    this.syncLabel()
    map.on("pitchend", this.onPitchEnd)
    return container
  }

  onRemove(map: MapLibreMap) {
    map.off("pitchend", this.onPitchEnd)
    this.container?.remove()
    this.map = undefined
    this.button = undefined
    this.container = undefined
  }

  private onPitchEnd = () => {
    if (!this.map || !this.aerial || this.map.getPitch() >= 8) return
    this.aerial = false
    this.setGestures(false)
    this.syncLabel()
  }

  private toggle() {
    const map = this.map
    if (!map) return
    this.aerial = !this.aerial
    if (this.aerial) {
      this.setGestures(true)
      map.easeTo({
        ...aerialCamera({ zoom: map.getZoom(), bearing: map.getBearing() }),
        duration: 900,
        essential: true,
      })
    } else {
      this.setGestures(false)
      map.easeTo({ ...flatCamera(), duration: 700, essential: true })
    }
    this.syncLabel()
  }

  private setGestures(enabled: boolean) {
    const map = this.map
    if (!map) return
    if (enabled) {
      map.dragRotate.enable()
      map.touchZoomRotate.enableRotation()
      map.touchPitch.enable()
      return
    }
    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()
    map.touchPitch.disable()
  }

  private syncLabel() {
    const button = this.button
    if (!button) return
    button.classList.toggle("is-active", this.aerial)
    button.setAttribute("aria-pressed", this.aerial ? "true" : "false")
    const label = this.aerial ? "返回平面地圖" : "立體樓宇航拍"
    button.setAttribute("aria-label", label)
    button.title = label
  }
}
