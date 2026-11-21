import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { interpretSchedule } from "./schedule.ts"

const names: Record<string, string> = { CHW: "柴灣", KET: "堅尼地城", TUC: "東涌" }

function view(partial: {
  httpStatus?: number
  body: unknown
  isTerminus?: boolean
}) {
  return interpretSchedule({
    httpStatus: partial.httpStatus ?? 200,
    body: partial.body,
    line: "ISL",
    station: "CEN",
    isTerminus: partial.isTerminus ?? false,
    stationName: (code) => names[code] ?? code,
  })
}

describe("interpretSchedule", () => {
  it("explains an empty but successful response", () => {
    const result = view({
      body: { status: 1, curr_time: "2026-11-21 10:33:30", data: { "ISL-CEN": { UP: [], DOWN: [] } } },
    })
    assert.equal(result.status, "empty")
    assert.equal(result.message, "暫時沒有到站班次。")
  })

  it("explains a status 0 response without treating it as trains", () => {
    const result = view({ body: { status: 0, message: "The contents are empty!" } })
    assert.equal(result.status, "error")
    assert.equal(result.message, "暫時取不到到站班次。")
  })

  it("explains too many requests", () => {
    const result = view({ httpStatus: 429, body: null })
    assert.equal(result.message, "港鐵暫時不接受更多查詢，請稍後再試。")
  })

  it("explains server errors", () => {
    const result = view({ httpStatus: 500, body: null })
    assert.equal(result.message, "暫時取不到到站班次。")
  })

  it("labels a terminus with no trains in one direction", () => {
    const result = view({
      isTerminus: true,
      body: {
        status: 1,
        curr_time: "2026-11-21 10:33:01",
        data: {
          "ISL-CEN": {
            UP: [{ seq: "1", dest: "CHW", plat: "1", time: "2026-11-21 10:36:00", ttnt: "3", valid: "Y" }],
            DOWN: [],
          },
        },
      },
    })
    assert.equal(result.status, "ready")
    assert.equal(result.directions[0]?.trains[0]?.destination, "柴灣")
    assert.equal(result.directions[0]?.trains[0]?.minutesLabel, "3 分鐘")
    assert.equal(result.directions[1]?.note, "這個方向沒有列車。")
  })

  it("labels a through station differently when one direction is empty", () => {
    const result = view({
      body: {
        status: 1,
        data: {
          "ISL-CEN": {
            UP: [],
            DOWN: [{ seq: "1", dest: "KET", plat: "2", time: "2026-11-21 10:28:39", ttnt: "0", valid: "Y" }],
          },
        },
      },
    })
    assert.equal(result.directions[0]?.trains[0]?.minutesLabel, "即將開出")
    assert.equal(result.directions[1]?.note, "這個方向暫時沒有列車。")
  })

  it("marks a delayed service", () => {
    const result = view({
      body: {
        status: 1,
        isdelay: "Y",
        data: {
          "ISL-CEN": {
            UP: [{ seq: "1", dest: "CHW", plat: "1", time: "2026-11-21 10:36:00", ttnt: "8", valid: "Y" }],
            DOWN: [{ seq: "1", dest: "KET", plat: "2", time: "2026-11-21 10:36:00", ttnt: "4", valid: "Y" }],
          },
        },
      },
    })
    assert.equal(result.delay, true)
    assert.equal(result.directions.length, 2)
  })
})
