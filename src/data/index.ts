import cameraJson from "./cameras.json"
import networkJson from "./network.json"
import type { CameraRecord, LineRecord, Network, StationRecord } from "../types.ts"

export const network = networkJson as Network
export const cameras = cameraJson as CameraRecord[]

export const stationByCode = new Map<string, StationRecord>(
  network.stations.map((station) => [station.code, station]),
)
export const cameraByKey = new Map<string, CameraRecord>(
  cameras.map((camera) => [camera.key, camera]),
)
export const lineByCode = new Map<string, LineRecord>(
  network.lines.map((line) => [line.code, line]),
)
