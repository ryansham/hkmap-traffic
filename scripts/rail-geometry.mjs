const EARTH_RADIUS = 6_371_000
const TRACK_RAILWAY = new Set(["subway", "rail", "light_rail", "narrow_gauge", "construction"])

export class TrackGapError extends Error {}

export function haversineMeters(a, b) {
  const [lng1, lat1] = pair(a)
  const [lng2, lat2] = pair(b)
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lng2 - lng1) * Math.PI) / 180
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function waysFromOsm(elements) {
  const nodes = new Map()
  for (const element of elements) {
    if (element.type === "node") nodes.set(element.id, [element.lon, element.lat])
  }
  const ways = []
  for (const element of elements) {
    if (element.type !== "way") continue
    const railway = element.tags?.railway
    if (railway && !TRACK_RAILWAY.has(railway)) continue
    const coordinates = (element.nodes ?? []).map((id) => nodes.get(id)).filter(Boolean)
    if (coordinates.length >= 2) ways.push({ id: element.id, coordinates })
  }
  return ways
}

export function traceTrack(ways, stations, options = {}) {
  const joinMeters = options.joinMeters ?? 25
  const toleranceMeters = options.toleranceMeters ?? 8
  const maxStationGap = options.maxStationGap ?? 400
  if (stations.length < 2) throw new Error("A track needs two stations")
  const graph = buildGraph(ways, joinMeters)
  const nodes = [...graph.values()]
  if (nodes.length === 0) throw new TrackGapError("No track geometry")

  const snapped = stations.map((station) => {
    const nearest = nearestNode(nodes, station)
    if (!nearest || nearest.distance > maxStationGap) {
      throw new Error(`${station.code} is ${Math.round(nearest?.distance ?? Infinity)}m from the track`)
    }
    return nearest.node
  })

  const traced = []
  for (let index = 0; index < snapped.length - 1; index += 1) {
    const from = snapped[index]
    const to = snapped[index + 1]
    const path = shortestPath(graph, from.key, to.key)
    if (!path) {
      throw new TrackGapError(`No continuous track from ${stations[index].code} to ${stations[index + 1].code}`)
    }
    const straight = haversineMeters(stations[index], stations[index + 1])
    const routed = polylineMeters(path)
    if (straight > 250 && routed > straight * 4) {
      throw new Error(
        `${stations[index].code} to ${stations[index + 1].code} detours ${Math.round(routed)}m against a ${Math.round(straight)}m station spacing`,
      )
    }
    traced.push(...(traced.length === 0 ? path : path.slice(1)))
  }

  return simplify(traced, toleranceMeters).map(([lng, lat]) => [round(lng), round(lat)])
}

export function traceTrackJoiningGaps(ways, stations) {
  let lastError
  for (const joinMeters of [20, 45, 90]) {
    try {
      return traceTrack(ways, stations, { joinMeters })
    } catch (error) {
      if (!(error instanceof TrackGapError)) throw error
      lastError = error
    }
  }
  throw lastError
}

export function maxOffsetFromChords(coordinates, stations) {
  const indexes = stations.map((station) => nearestIndex(coordinates, station))
  let max = 0
  for (let index = 0; index < indexes.length - 1; index += 1) {
    const from = Math.min(indexes[index], indexes[index + 1])
    const to = Math.max(indexes[index], indexes[index + 1])
    const start = [stations[index].lng, stations[index].lat]
    const end = [stations[index + 1].lng, stations[index + 1].lat]
    for (const point of coordinates.slice(from, to + 1)) {
      max = Math.max(max, distanceToSegment(point, start, end))
    }
  }
  return max
}

export function stationOffsets(coordinates, stations) {
  return stations.map((station) => ({
    code: station.code,
    meters: coordinates.reduce((best, point) => Math.min(best, haversineMeters(point, station)), Infinity),
  }))
}

function pair(value) {
  if (Array.isArray(value)) return value
  return [value.lng, value.lat]
}

function round(value) {
  return Math.round(value * 1e5) / 1e5
}

function buildGraph(ways, joinMeters) {
  const graph = new Map()

  function ensure(lng, lat) {
    const key = `${lng.toFixed(6)},${lat.toFixed(6)}`
    if (!graph.has(key)) graph.set(key, { key, lng, lat, edges: new Map() })
    return graph.get(key)
  }

  function link(a, b) {
    const distance = haversineMeters(a, b)
    if (distance === 0) return
    if ((a.edges.get(b.key) ?? Infinity) > distance) {
      a.edges.set(b.key, distance)
      b.edges.set(a.key, distance)
    }
  }

  for (const way of ways) {
    let previous = ensure(way.coordinates[0][0], way.coordinates[0][1])
    for (let index = 1; index < way.coordinates.length; index += 1) {
      const next = ensure(way.coordinates[index][0], way.coordinates[index][1])
      link(previous, next)
      previous = next
    }
  }

  linkNearby(graph, joinMeters, link)
  return graph
}

function linkNearby(graph, meters, link) {
  const width = meters / (111_320 * Math.cos((22.35 * Math.PI) / 180))
  const height = meters / 110_540
  const bins = new Map()
  const binKey = (x, y) => `${x},${y}`
  for (const node of graph.values()) {
    const key = binKey(Math.floor(node.lng / width), Math.floor(node.lat / height))
    const bucket = bins.get(key)
    if (bucket) bucket.push(node)
    else bins.set(key, [node])
  }
  for (const node of graph.values()) {
    const x = Math.floor(node.lng / width)
    const y = Math.floor(node.lat / height)
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const bucket = bins.get(binKey(x + dx, y + dy))
        if (!bucket) continue
        for (const other of bucket) {
          if (other.key <= node.key) continue
          if (haversineMeters(node, other) <= meters) link(node, other)
        }
      }
    }
  }
}

function nearestNode(nodes, station) {
  let best = null
  let distance = Infinity
  for (const node of nodes) {
    const candidate = haversineMeters(node, station)
    if (candidate < distance) {
      distance = candidate
      best = node
    }
  }
  return best ? { node: best, distance } : null
}

function nearestIndex(coordinates, station) {
  let best = 0
  let distance = Infinity
  for (let index = 0; index < coordinates.length; index += 1) {
    const candidate = haversineMeters(coordinates[index], station)
    if (candidate < distance) {
      distance = candidate
      best = index
    }
  }
  return best
}

function shortestPath(graph, startKey, endKey) {
  if (startKey === endKey) {
    const node = graph.get(startKey)
    return [[node.lng, node.lat]]
  }
  const distance = new Map([[startKey, 0]])
  const previous = new Map()
  const heap = new MinHeap()
  heap.push(0, startKey)
  const settled = new Set()
  while (heap.size > 0) {
    const [currentDistance, key] = heap.pop()
    if (settled.has(key)) continue
    settled.add(key)
    if (key === endKey) break
    for (const [next, weight] of graph.get(key).edges) {
      const candidate = currentDistance + weight
      if (candidate < (distance.get(next) ?? Infinity)) {
        distance.set(next, candidate)
        previous.set(next, key)
        heap.push(candidate, next)
      }
    }
  }
  if (!distance.has(endKey)) return null
  const path = []
  let cursor = endKey
  while (cursor) {
    const node = graph.get(cursor)
    path.push([node.lng, node.lat])
    if (cursor === startKey) break
    cursor = previous.get(cursor)
  }
  path.reverse()
  return path
}

function polylineMeters(coordinates) {
  let total = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    total += haversineMeters(coordinates[index - 1], coordinates[index])
  }
  return total
}

function xy(point) {
  const [lng, lat] = pair(point)
  const cos = Math.cos((22.35 * Math.PI) / 180)
  return [(lng - 114.1) * 111_320 * cos, (lat - 22.35) * 110_540]
}

function distanceToSegment(point, start, end) {
  const p = xy(point)
  const a = xy(start)
  const b = xy(end)
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

function simplify(points, tolerance) {
  if (points.length < 3) return points.map((point) => point.slice())
  const keep = new Array(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true
  const stack = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [from, to] = stack.pop()
    let max = 0
    let index = -1
    for (let cursor = from + 1; cursor < to; cursor += 1) {
      const distance = distanceToSegment(points[cursor], points[from], points[to])
      if (distance > max) {
        max = distance
        index = cursor
      }
    }
    if (index !== -1 && max > tolerance) {
      keep[index] = true
      stack.push([from, index], [index, to])
    }
  }
  return points.filter((_, index) => keep[index])
}

class MinHeap {
  constructor() {
    this.data = []
  }

  get size() {
    return this.data.length
  }

  push(distance, key) {
    this.data.push([distance, key])
    let index = this.data.length - 1
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (this.data[parent][0] <= this.data[index][0]) break
      ;[this.data[parent], this.data[index]] = [this.data[index], this.data[parent]]
      index = parent
    }
  }

  pop() {
    const top = this.data[0]
    const last = this.data.pop()
    if (this.data.length > 0) {
      this.data[0] = last
      let index = 0
      for (;;) {
        const left = index * 2 + 1
        const right = left + 1
        let smallest = index
        if (left < this.data.length && this.data[left][0] < this.data[smallest][0]) smallest = left
        if (right < this.data.length && this.data[right][0] < this.data[smallest][0]) smallest = right
        if (smallest === index) break
        ;[this.data[smallest], this.data[index]] = [this.data[index], this.data[smallest]]
        index = smallest
      }
    }
    return top
  }
}
