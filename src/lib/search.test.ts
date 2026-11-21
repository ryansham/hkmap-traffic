import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { searchPlaces, type SearchSources } from "./search.ts"

const sources: SearchSources = {
  stations: JSON.parse(readFileSync(new URL("../data/network.json", import.meta.url), "utf8")).stations,
  cameras: JSON.parse(readFileSync(new URL("../data/cameras.json", import.meta.url), "utf8")),
}

function keys(query: string) {
  return searchPlaces(query, sources).map((hit) => (hit.kind === "station" ? hit.code : hit.key))
}

describe("searchPlaces", () => {
  it("returns nothing for a blank query", () => {
    assert.deepEqual(searchPlaces("   ", sources), [])
  })

  it("puts the station ahead of cameras and folds variant characters", () => {
    const hungHom = searchPlaces("紅磡", sources)
    assert.equal(hungHom[0]?.kind, "station")
    assert.equal(hungHom[0]?.kind === "station" ? hungHom[0].code : "", "HUH")
    assert.equal(searchPlaces("啓德", sources)[0]?.kind === "station" ? searchPlaces("啓德", sources)[0]?.code : "", "KAT")
    const lai = searchPlaces("茘枝角", sources)[0]
    assert.equal(lai?.kind, "station")
    assert.equal(lai?.kind === "station" ? lai.code : "", "LCK")
  })

  it("finds the Cross Harbour Tunnel by its short name", () => {
    const hits = searchPlaces("紅隧", sources)
    assert.deepEqual(keys("紅隧").sort(), ["H207F", "K107F"])
    assert.equal(hits.every((hit) => hit.kind === "camera"), true)
  })

  it("keeps the eastern and western tunnels on their own short names", () => {
    assert.ok(keys("東隧").includes("K952F"))
    assert.equal(keys("東隧").includes("H207F"), false)
    assert.ok(keys("西隧").includes("H702F"))
    assert.equal(keys("西隧").includes("K107F"), false)
  })

  it("caps the list at eight matches", () => {
    assert.equal(searchPlaces("道", sources).length, 8)
  })
})
