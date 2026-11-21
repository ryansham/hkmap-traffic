import { readFileSync } from "node:fs"
import { createLiveCache, handleLiveRequest } from "../src/server/liveCache.mjs"
import { trainFeedResponse } from "../src/server/trainSnapshot.ts"

const network = JSON.parse(readFileSync(new URL("../src/data/network.json", import.meta.url), "utf8"))

export function liveCachePlugin() {
  const cache = createLiveCache({ fetch })
  const middleware = async (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost")
    if (url.pathname !== "/api/mtr" && url.pathname !== "/api/trains" && !url.pathname.startsWith("/api/snapshot/")) {
      next()
      return
    }
    try {
      const response = await handleLiveRequest(cache, new Request(url, { method: req.method }), {
        trains: () => trainFeedResponse(cache, network),
      })
      if (!response) {
        next()
        return
      }
      res.statusCode = response.status
      response.headers.forEach((value, name) => {
        res.setHeader(name, value)
      })
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) {
      next(error)
    }
  }
  return {
    name: "live-cache",
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
