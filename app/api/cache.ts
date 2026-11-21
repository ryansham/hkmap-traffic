import network from "../../src/data/network.json" with { type: "json" }
import { createLiveCache, handleLiveRequest } from "../../src/server/liveCache.mjs"
import { trainFeedResponse, type RailNetwork } from "../../src/server/trainSnapshot.ts"

const cache = createLiveCache({ fetch })

export function live(request: Request) {
  return handleLiveRequest(cache, request, {
    trains: () => trainFeedResponse(cache, network as RailNetwork),
  })
}
