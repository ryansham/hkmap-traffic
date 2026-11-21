export type LineCode =
  | "ISL"
  | "TWL"
  | "KTL"
  | "TKL"
  | "SIL"
  | "EAL"
  | "TML"
  | "TCL"
  | "AEL"
  | "DRL"

export type LinePath = {
  codes: string[]
  coordinates: [number, number][]
}

export type LineRecord = {
  code: LineCode
  name: string
  color: string
  offset: number
  paths: LinePath[]
}

export type StationRecord = {
  code: string
  zh: string
  en: string
  lng: number
  lat: number
  lines: LineCode[]
  terminusLines: LineCode[]
}

export type Network = {
  generatedAt: string
  stationCount: number
  lines: LineRecord[]
  stations: StationRecord[]
}

export type CameraRecord = {
  key: string
  region: string
  district: string
  description: string
  lng: number
  lat: number
  url: string
}

export type Selection =
  | { kind: "station"; code: string }
  | { kind: "camera"; key: string }
