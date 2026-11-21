import { writeFileSync } from "node:fs"

const UA = "hk-smart-city-map/0.1 (classroom preview)"

const LINES = [
  { code: "ISL", name: "港島綫", color: "#0071bc", offset: -2 },
  { code: "TWL", name: "荃灣綫", color: "#e2231a", offset: 2 },
  { code: "KTL", name: "觀塘綫", color: "#00a040", offset: -2 },
  { code: "TKL", name: "將軍澳綫", color: "#6b208b", offset: 2 },
  { code: "SIL", name: "南港島綫", color: "#8c9300", offset: 3 },
  { code: "EAL", name: "東鐵綫", color: "#2f95c8", offset: 0 },
  { code: "TML", name: "屯馬綫", color: "#9a3b26", offset: 4 },
  { code: "TCL", name: "東涌綫", color: "#f7941d", offset: -3 },
  { code: "AEL", name: "機場快綫", color: "#1c7670", offset: 3 },
  { code: "DRL", name: "迪士尼綫", color: "#e45aa0", offset: -4 },
]

const DRAW = {
  AEL: [{ direction: "UT" }],
  DRL: [{ direction: "UT" }],
  ISL: [{ direction: "UT" }],
  KTL: [{ direction: "UT" }],
  SIL: [{ direction: "UT" }],
  TCL: [{ direction: "UT" }],
  TWL: [{ direction: "UT" }],
  TML: [{ direction: "UT" }],
  TKL: [{ direction: "UT" }, { codes: ["TKO", "LHP"] }],
  EAL: [{ direction: "UT" }, { codes: ["SHS", "LMC"] }, { codes: ["SHT", "RAC", "UNI"] }],
}

function normEn(value) {
  return value
    .toLowerCase()
    .replace(/station/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function normZh(value) {
  return value.replace(/鐵路站$/, "").replace(/站$/, "").trim()
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ""
  let quoted = false
  const source = text.replace(/^\uFEFF/, "")
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ",") {
      row.push(cell)
      cell = ""
    } else if (char === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else if (char !== "\r") {
      cell += char
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  const header = rows[0].map((item) => item.replace(/^\uFEFF/, "").trim())
  return rows.slice(1).filter((items) => items.some((item) => item.trim())).map((items) => {
    const record = {}
    header.forEach((key, index) => {
      record[key] = (items[index] ?? "").trim()
    })
    return record
  })
}

async function fetchBuffer(url) {
  const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" } })
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

function bboxCenter(bbox) {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
}

const lineRows = parseCsv(
  (await fetchBuffer("https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv")).toString("utf8"),
)
const venues = JSON.parse(
  (await fetchBuffer(
    "https://mapapi.hkmapservice.gov.hk/ogc/wfs/indoor/mtr_venue_polygon?service=WFS&version=1.1.0&request=GetFeature&outputFormat=application/json",
  )).toString("utf8"),
).features
const cameraText = (await fetchBuffer(
  "https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_Tc.csv",
)).toString("utf16le").replace(/^\uFEFF/, "")

const sequences = new Map()
const stations = new Map()
for (const row of lineRows) {
  const line = row["Line Code"]
  const code = row["Station Code"]
  if (!line || !code) continue
  const direction = row.Direction
  const key = `${line}:${direction}`
  if (!sequences.has(key)) sequences.set(key, [])
  sequences.get(key).push({
    sequence: Number(row.Sequence),
    code,
  })
  if (!stations.has(code)) {
    stations.set(code, {
      code,
      zh: row["Chinese Name"],
      en: row["English Name"],
      lines: [],
    })
  }
  const station = stations.get(code)
  if (!station.lines.includes(line)) station.lines.push(line)
}

const venueByEn = new Map()
for (const feature of venues) {
  const name = feature.properties.venue_name_en
  venueByEn.set(normEn(name), feature)
}

function sameZh(csvName, venueName) {
  const fold = (value) => normZh(value).replaceAll("茘", "荔").replaceAll("啓", "啟")
  return fold(csvName) === fold(venueName)
}

const placed = new Map()
const nameNotes = []
for (const station of stations.values()) {
  const feature = venueByEn.get(normEn(station.en))
  if (!feature) {
    throw new Error(`No Lands Department venue for ${station.code} ${station.en}`)
  }
  if (!sameZh(station.zh, feature.properties.venue_name_zh)) {
    throw new Error(`Name mismatch ${station.code}: ${station.zh} / ${feature.properties.venue_name_zh}`)
  }
  if (station.zh !== normZh(feature.properties.venue_name_zh)) {
    nameNotes.push(`${station.code} ${station.zh} / ${feature.properties.venue_name_zh}`)
  }
  const [lng, lat] = bboxCenter(feature.properties.bbox)
  placed.set(station.code, { lng, lat, venueId: feature.properties.venue_id })
  venueByEn.delete(normEn(station.en))
}
if (nameNotes.length > 0) console.log("Variant characters:\n" + nameNotes.join("\n"))

if (venueByEn.size !== 1) {
  throw new Error(`Expected only Racecourse to remain, left ${[...venueByEn.keys()].join(", ")}`)
}
const racecourse = [...venueByEn.values()][0]
if (normZh(racecourse.properties.venue_name_zh) !== "馬場") {
  throw new Error(`Unexpected extra venue ${racecourse.properties.venue_name_zh}`)
}
const [racLng, racLat] = bboxCenter(racecourse.properties.bbox)
placed.set("RAC", { lng: racLng, lat: racLat, venueId: racecourse.properties.venue_id })
stations.set("RAC", { code: "RAC", zh: "馬場", en: "Racecourse", lines: ["EAL"] })

function orderedCodes(line, direction) {
  const rows = sequences.get(`${line}:${direction}`)
  if (!rows) throw new Error(`Missing ${line} ${direction}`)
  return [...rows].sort((a, b) => a.sequence - b.sequence).map((item) => item.code)
}

function terminusLines(code) {
  const result = []
  for (const line of LINES) {
    const matching = [...sequences.keys()]
      .filter((key) => key.startsWith(`${line.code}:`))
      .map((key) => sequences.get(key).sort((a, b) => a.sequence - b.sequence).map((item) => item.code))
      .filter((codes) => codes.includes(code))
    if (matching.length === 0) continue
    const alwaysEnd = matching.every((codes) => codes[0] === code || codes[codes.length - 1] === code)
    if (alwaysEnd) result.push(line.code)
  }
  return result
}

const lines = LINES.map((line) => {
  const paths = DRAW[line.code].map((instruction) => {
    const codes = instruction.codes ?? orderedCodes(line.code, instruction.direction)
    return {
      codes,
      coordinates: codes.map((code) => {
        const point = placed.get(code)
        if (!point) throw new Error(`Missing coordinate for ${code}`)
        return [point.lng, point.lat]
      }),
    }
  })
  return { ...line, paths }
})

const stationList = [...stations.values()]
  .map((station) => {
    const point = placed.get(station.code)
    return {
      code: station.code,
      zh: station.zh.replaceAll("茘", "荔").replaceAll("啓", "啟"),
      en: station.en,
      lng: point.lng,
      lat: point.lat,
      lines: LINES.map((line) => line.code).filter((code) => station.lines.includes(code)),
      terminusLines: terminusLines(station.code),
    }
  })
  .sort((a, b) => a.zh.localeCompare(b.zh, "zh-Hant"))

const cameraRows = cameraText
  .split(/\r?\n/)
  .filter((line) => line.trim())
const cameraHeader = cameraRows[0].split("\t").map((item) => item.replace(/^\uFEFF/, "").trim())
const cameras = cameraRows.slice(1).map((line) => {
  const cells = line.split("\t")
  const record = {}
  cameraHeader.forEach((key, index) => {
    record[key] = (cells[index] ?? "").trim()
  })
  return {
    key: record.key,
    region: record.region,
    district: record.district,
    description: record.description,
    lng: Number(record.longitude),
    lat: Number(record.latitude),
    url: record.url,
  }
})

if (stationList.length !== 98) throw new Error(`Expected 98 stations, got ${stationList.length}`)
if (cameras.length !== 1013) throw new Error(`Expected 1013 cameras, got ${cameras.length}`)

const network = {
  generatedAt: new Date().toISOString(),
  stationCount: stationList.length,
  lines,
  stations: stationList,
}
writeFileSync("src/data/network.json", `${JSON.stringify(network)}\n`)
writeFileSync("src/data/cameras.json", `${JSON.stringify(cameras)}\n`)
console.log(`Wrote ${stationList.length} stations and ${cameras.length} cameras`)
