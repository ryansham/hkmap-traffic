import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { APP_VERSION } from "./version.ts"

describe("APP_VERSION", () => {
  it("matches the package version shown in the header", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    assert.equal(pkg.version, APP_VERSION)
    assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/)
  })
})
