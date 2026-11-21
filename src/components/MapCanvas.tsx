import { useEffect, useRef } from "react"
import { Map, NavigationControl } from "maplibre-gl"
import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl"
import { cameras, network } from "../data/index.ts"
import { AerialControl } from "./AerialControl.ts"

const STYLE = "https://tiles.openfreemap.org/styles/liberty"

const stationCollection = {
  type: "FeatureCollection" as const,
  features: network.stations.map((station) => ({
    type: "Feature" as const,
    id: station.code,
    properties: { code: station.code, zh: station.zh },
    geometry: { type: "Point" as const, coordinates: [station.lng, station.lat] },
  })),
}

const cameraCollection = {
  type: "FeatureCollection" as const,
  features: cameras.map((camera) => ({
    type: "Feature" as const,
    id: camera.key,
    properties: {
      key: camera.key,
      label: camera.description.replace(/\s*\[[^\]]+\]\s*$/, ""),
    },
    geometry: { type: "Point" as const, coordinates: [camera.lng, camera.lat] },
  })),
}

const lineSources = network.lines.map((line) => ({
  id: line.code,
  color: line.color,
  offset: line.offset,
  data: {
    type: "FeatureCollection" as const,
    features: line.paths.map((path) => ({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: path.coordinates },
    })),
  },
}))

type Props = {
  showMtr: boolean
  showCameras: boolean
  selectedStation: string | null
  panelOpen: boolean
  focusNonce: number
  focusTarget: { lng: number; lat: number } | null
  onSelectStation: (code: string) => void
  onSelectCamera: (key: string) => void
  onClear: () => void
  onStyleError: () => void
  onStyleReady: () => void
}

function layerIds(prefix: string) {
  return network.lines.flatMap((line) => [`${prefix}-${line.code}`, `${prefix}-${line.code}-case`])
}

export function MapCanvas(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const selectedStationRef = useRef<string | null>(null)
  const handlers = useRef(props)
  useEffect(() => {
    handlers.current = props
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new Map({
      container,
      style: STYLE,
      center: [114.15, 22.36],
      zoom: 10.4,
      minZoom: 9,
      maxZoom: 18,
      maxPitch: 70,
      maxBounds: [
        [113.45, 21.85],
        [114.85, 22.75],
      ],
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: true,
      touchPitch: false,
      locale: {
        "NavigationControl.ZoomIn": "放大",
        "NavigationControl.ZoomOut": "縮小",
        "NavigationControl.ResetBearing": "重設方向",
      },
    })
    map.addControl(new NavigationControl({ showCompass: true, visualizePitch: true }), "top-right")
    map.addControl(new AerialControl(), "top-right")
    map.touchZoomRotate.disableRotation()
    mapRef.current = map

    const failed = window.setTimeout(() => handlers.current.onStyleError(), 15000)
    map.on("load", () => {
      window.clearTimeout(failed)
      handlers.current.onStyleReady()
      for (const source of lineSources) {
        map.addSource(source.id, { type: "geojson", data: source.data })
        const width = ["interpolate", ["linear"], ["zoom"], 9, 1.6, 13, 3.4, 16, 6.5] as ExpressionSpecification
        const casing = ["interpolate", ["linear"], ["zoom"], 9, 4, 13, 6.4, 16, 10] as ExpressionSpecification
        const offset = ["interpolate", ["linear"], ["zoom"], 9, source.offset * 0.4, 14, source.offset * 1.35] as ExpressionSpecification
        map.addLayer({
          id: `mtr-${source.id}-case`,
          type: "line",
          source: source.id,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#fffdf8",
            "line-width": casing,
            "line-offset": offset,
          },
        })
        map.addLayer({
          id: `mtr-${source.id}`,
          type: "line",
          source: source.id,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": source.color,
            "line-width": width,
            "line-offset": offset,
          },
        })
      }

      map.addSource("cameras", { type: "geojson", data: cameraCollection, promoteId: "key" })
      map.addLayer({
        id: "cameras",
        type: "circle",
        source: "cameras",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 1.6, 12, 3, 15, 5],
          "circle-color": "#24324a",
          "circle-stroke-color": "#fffdf8",
          "circle-stroke-width": 1,
          "circle-opacity": 0.88,
        },
      })
      map.addLayer({
        id: "camera-labels",
        type: "symbol",
        source: "cameras",
        minzoom: 13.4,
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-offset": [0, 0.9],
          "text-anchor": "top",
          "text-max-width": 12,
          "text-optional": true,
        },
        paint: {
          "text-color": "#24324a",
          "text-halo-color": "#fffdf8",
          "text-halo-width": 1.2,
        },
      })

      map.addSource("stations", { type: "geojson", data: stationCollection, promoteId: "code" })
      map.addLayer({
        id: "stations",
        type: "circle",
        source: "stations",
        paint: {
          "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 8, 5.5],
          "circle-color": "#fffdf8",
          "circle-stroke-color": ["case", ["boolean", ["feature-state", "selected"], false], "#1c7670", "#1d1a16"],
          "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 4, 2],
        },
      })
      map.addLayer({
        id: "station-labels",
        type: "symbol",
        source: "stations",
        minzoom: 12,
        layout: {
          "text-field": ["get", "zh"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 12, 11, 15, 14],
          "text-offset": [0, 0.85],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: {
          "text-color": "#1d1a16",
          "text-halo-color": "#fffdf8",
          "text-halo-width": 1.4,
        },
      })

      map.fitBounds(
        [
          [113.84, 22.2],
          [114.42, 22.56],
        ],
        { padding: 28, duration: 0 },
      )

      const interactive = ["stations", "cameras"]
      map.on("click", (event) => {
        const box = [
          [event.point.x - 10, event.point.y - 10],
          [event.point.x + 10, event.point.y + 10],
        ] as [[number, number], [number, number]]
        const stationHit = map.queryRenderedFeatures(box, { layers: ["stations"] })[0]
        if (stationHit?.properties.code) {
          handlers.current.onSelectStation(String(stationHit.properties.code))
          return
        }
        const cameraHit = map.queryRenderedFeatures(box, { layers: ["cameras"] })[0]
        if (cameraHit?.properties.key) {
          handlers.current.onSelectCamera(String(cameraHit.properties.key))
          return
        }
        handlers.current.onClear()
      })
      map.on("mousemove", (event) => {
        const hits = map.queryRenderedFeatures(event.point, { layers: interactive })
        map.getCanvas().style.cursor = hits.length > 0 ? "pointer" : ""
      })
    })

    return () => {
      window.clearTimeout(failed)
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      if (!map.getLayer("stations")) return false
      const visibility = (id: string, show: boolean) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", show ? "visible" : "none")
      }
      for (const id of layerIds("mtr")) visibility(id, props.showMtr)
      visibility("stations", props.showMtr)
      visibility("station-labels", props.showMtr)
      visibility("cameras", props.showCameras)
      visibility("camera-labels", props.showCameras)
      return true
    }
    if (apply()) return
    const retry = () => {
      if (apply()) map.off("idle", retry)
    }
    map.on("idle", retry)
    return () => {
      map.off("idle", retry)
    }
  }, [props.showCameras, props.showMtr])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      if (!map.getSource("stations")) return false
      if (selectedStationRef.current) {
        map.setFeatureState({ source: "stations", id: selectedStationRef.current }, { selected: false })
      }
      if (props.selectedStation) {
        map.setFeatureState({ source: "stations", id: props.selectedStation }, { selected: true })
      }
      selectedStationRef.current = props.selectedStation
      return true
    }
    if (apply()) return
    const retry = () => {
      if (apply()) map.off("idle", retry)
    }
    map.on("idle", retry)
    return () => {
      map.off("idle", retry)
    }
  }, [props.selectedStation])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const applyPadding = () => {
      const narrow = window.matchMedia("(max-width: 760px)").matches
      map.setPadding({
        top: 0,
        left: 0,
        right: !narrow && props.panelOpen ? 400 : 0,
        bottom: narrow && props.panelOpen ? Math.round(window.innerHeight * 0.46) : 0,
      })
    }
    applyPadding()
    window.addEventListener("resize", applyPadding)
    return () => window.removeEventListener("resize", applyPadding)
  }, [props.panelOpen])

  useEffect(() => {
    const map = mapRef.current
    const target = props.focusTarget
    if (!map || !target) return
    const fly = () => {
      const pitched = map.getPitch() > 10
      map.flyTo({
        center: [target.lng, target.lat],
        zoom: Math.max(map.getZoom(), pitched ? 15.7 : 14.5),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
        essential: true,
      })
    }
    if (map.isStyleLoaded()) fly()
    else map.once("load", fly)
  }, [props.focusNonce, props.focusTarget])

  return <div ref={containerRef} className="map-canvas" />
}
