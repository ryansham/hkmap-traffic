import network from "../data/network.json" with { type: "json" }
import { createLiveCache, handleLiveRequest } from "./liveCache.mjs"
import { trainFeedResponse } from "./trainSnapshot.ts"
import type { RailNetwork } from "./trainSnapshot.ts"

const cache = createLiveCache({ fetch })
const rail = network as RailNetwork

export default {
  async fetch(request: Request, _env: unknown, ctx: { waitUntil: (task: Promise<unknown>) => void }) {
    const hit = request.method === "GET" ? await caches.default.match(request) : undefined
    if (hit) return hit
    const response = await handleLiveRequest(cache, request, {
      trains: () => trainFeedResponse(cache, rail),
    })
    const result = response ?? new Response("找不到。", { status: 404, headers: { "access-control-allow-origin": "*" } })
    if (request.method === "GET" && result.ok) {
      ctx.waitUntil(caches.default.put(request, result.clone()).catch(() => undefined))
    }
    return result
  },
}
