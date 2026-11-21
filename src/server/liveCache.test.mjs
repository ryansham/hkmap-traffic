import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createLiveCache, handleLiveRequest, scheduleTarget, snapshotTarget } from "./liveCache.mjs"

describe("live cache targets", () => {
  it("only builds the official schedule and snapshot urls", () => {
    assert.equal(
      scheduleTarget("ISL", "CEN")?.href,
      "https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=ISL&sta=CEN&lang=TC",
    )
    assert.equal(scheduleTarget("X", "CEN"), null)
    assert.equal(scheduleTarget("ISL", "../etc"), null)
    assert.equal(snapshotTarget("H207F")?.href, "https://tdcctv.data.one.gov.hk/H207F.JPG")
    assert.equal(snapshotTarget("H207F.jpg"), null)
    assert.equal(snapshotTarget("../secret"), null)
  })
})

describe("createLiveCache", () => {
  it("fetches one upstream response for concurrent visitors and then serves the copy", async () => {
    let calls = 0
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const cache = createLiveCache({
      now: () => 0,
      fetch: async () => {
        calls += 1
        await gate
        return new Response(JSON.stringify({ status: 1 }), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        })
      },
    })
    const first = cache.schedule("ISL", "CEN")
    const second = cache.schedule("ISL", "CEN")
    release()
    const [a, b] = await Promise.all([first, second])
    assert.equal(calls, 1)
    assert.equal(a.headers.get("cache-control"), "public, max-age=20")
    assert.deepEqual(await b.json(), { status: 1 })
    await cache.schedule("ISL", "CEN")
    assert.equal(calls, 1)
  })

  it("does not call upstream for an unknown route", async () => {
    let calls = 0
    const cache = createLiveCache({ fetch: async () => {
      calls += 1
      return new Response("no")
    } })
    const response = await handleLiveRequest(cache, new Request("https://map.local/api/mtr?line=NOPE&sta=CEN"))
    assert.equal(response?.status, 400)
    assert.equal(calls, 0)
  })
})
