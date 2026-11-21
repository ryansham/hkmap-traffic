export const SCHEDULE_TTL_SECONDS = 20
export const SNAPSHOT_TTL_SECONDS = 90
export const ERROR_TTL_SECONDS = 5

const LINES = new Set(["ISL", "TWL", "KTL", "TKL", "SIL", "EAL", "TML", "TCL", "AEL", "DRL"])

export function scheduleTarget(line, station) {
  if (!LINES.has(line) || !/^[A-Z0-9]{2,5}$/.test(station)) return null
  const url = new URL("https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php")
  url.searchParams.set("line", line)
  url.searchParams.set("sta", station)
  url.searchParams.set("lang", "TC")
  return url
}

export function snapshotTarget(key) {
  if (!/^[A-Za-z0-9]+$/.test(key)) return null
  return new URL(`https://tdcctv.data.one.gov.hk/${key}.JPG`)
}

export function createLiveCache(options) {
  const entries = new Map()
  const inflight = new Map()
  const valueInflight = new Map()
  const now = options.now ?? (() => Date.now())
  const fetchImpl = options.fetch ?? fetch

  async function load(key, ttlSeconds, url, accept) {
    const current = entries.get(key)
    const time = now()
    if (current && current.expiresAt > time) return toResponse(current.stored, ttlSeconds)
    const pending = inflight.get(key)
    if (pending) return toResponse(await pending, ttlSeconds)
    const task = fetchImpl(url, { headers: { Accept: accept } })
      .then(async (response) => {
        const stored = await storeResponse(response)
        const ttl = response.ok ? ttlSeconds : ERROR_TTL_SECONDS
        entries.set(key, { expiresAt: now() + ttl * 1000, stored, ttl })
        inflight.delete(key)
        return stored
      })
      .catch((error) => {
        inflight.delete(key)
        throw error
      })
    inflight.set(key, task)
    return toResponse(await task, ttlSeconds)
  }

  async function remember(key, ttlSeconds, producer) {
    const time = now()
    const current = entries.get(key)
    if (current?.value !== undefined && current.expiresAt > time) {
      return { value: current.value, ageMs: time - current.storedAt }
    }
    const pending = valueInflight.get(key)
    if (pending) {
      const stored = await pending
      return { value: stored.value, ageMs: Math.max(0, now() - stored.storedAt) }
    }
    const task = Promise.resolve()
      .then(() => producer())
      .then((value) => {
        const storedAt = now()
        const stored = { value, storedAt, expiresAt: storedAt + ttlSeconds * 1000 }
        entries.set(key, stored)
        valueInflight.delete(key)
        return stored
      })
      .catch((error) => {
        valueInflight.delete(key)
        throw error
      })
    valueInflight.set(key, task)
    const stored = await task
    return { value: stored.value, ageMs: 0 }
  }

  return {
    async schedule(line, station) {
      const url = scheduleTarget(line, station)
      if (!url) return text("只接受港鐵重鐵的綫和車站。", 400)
      const key = `schedule:${line}:${station}`
      try {
        return await load(key, SCHEDULE_TTL_SECONDS, url, "application/json")
      } catch {
        return text("暫時取不到到站班次。", 502)
      }
    },
    async snapshot(keyName) {
      const url = snapshotTarget(keyName)
      if (!url) return text("只接受運輸署快拍編號。", 400)
      const key = `snapshot:${keyName}`
      try {
        return await load(key, SNAPSHOT_TTL_SECONDS, url, "image/jpeg")
      } catch {
        return text("暫時未能提供這張照片。", 502)
      }
    },
    remember,
  }
}

export async function handleLiveRequest(cache, request, routes = {}) {
  const url = new URL(request.url)
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }
  if (request.method !== "GET") return text("只接受讀取。", 405)
  if (url.pathname === "/api/trains") {
    return routes.trains ? routes.trains() : text("未有列車快取。", 404)
  }
  if (url.pathname === "/api/mtr") {
    return cache.schedule(url.searchParams.get("line") ?? "", url.searchParams.get("sta") ?? "")
  }
  const snapshot = url.pathname.match(/^\/api\/snapshot\/([A-Za-z0-9]+)$/)
  if (snapshot) return cache.snapshot(snapshot[1])
  return null
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Accept",
  }
}

function text(message, status) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...corsHeaders() },
  })
}

async function storeResponse(response) {
  const type = response.headers.get("content-type") ?? ""
  const headers = new Headers()
  if (type) headers.set("content-type", type)
  const modified = response.headers.get("last-modified")
  if (modified) headers.set("last-modified", modified)
  return { status: response.status, headers, body: new Uint8Array(await response.arrayBuffer()) }
}

function toResponse(stored, ttlSeconds) {
  const headers = new Headers(stored.headers)
  const ttl = stored.status >= 200 && stored.status < 300 ? ttlSeconds : ERROR_TTL_SECONDS
  headers.set("cache-control", `public, max-age=${ttl}`)
  for (const [name, value] of Object.entries(corsHeaders())) headers.set(name, value)
  return new Response(stored.body, { status: stored.status, headers })
}
