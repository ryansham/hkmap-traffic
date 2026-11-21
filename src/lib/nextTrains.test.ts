import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { summarizeNextTrains } from "./nextTrains.ts"
import type { LineScheduleView } from "./schedule.ts"

const island: LineScheduleView = {
  status: "ready",
  message: null,
  delay: false,
  updatedAt: "2026-11-21 13:40:00",
  directions: [
    {
      note: null,
      trains: [
        { destination: "柴灣", platform: "1", time: "13:42", minutesLabel: "2 分鐘" },
        { destination: "柴灣", platform: "1", time: "13:46", minutesLabel: "6 分鐘" },
      ],
    },
    {
      note: null,
      trains: [{ destination: "堅尼地城", platform: "2", time: "13:41", minutesLabel: "即將開出" }],
    },
  ],
}

const tsuenWan: LineScheduleView = {
  status: "ready",
  message: null,
  delay: true,
  updatedAt: null,
  directions: [
    {
      note: null,
      trains: [{ destination: "荃灣", platform: "3", time: "13:48", minutesLabel: "8 分鐘" }],
    },
  ],
}

const lines = [
  { code: "ISL", name: "港島綫", color: "#0071bc" },
  { code: "TWL", name: "荃灣綫", color: "#e2231a" },
]

describe("summarizeNextTrains", () => {
  it("keeps the two soonest trains and counts the rest", () => {
    const summary = summarizeNextTrains(lines, { ISL: island, TWL: tsuenWan })
    assert.deepEqual(
      summary.trains.map((train) => train.destination),
      ["堅尼地城", "柴灣"],
    )
    assert.equal(summary.extra, 1)
    assert.equal(summary.trains[0]?.minutesLabel, "即將開出")
  })

  it("skips a line that is not ready", () => {
    const summary = summarizeNextTrains(lines, {
      ISL: { status: "empty", message: "暫時沒有到站班次。", delay: false, updatedAt: null, directions: [] },
    })
    assert.deepEqual(summary.trains, [])
    assert.equal(summary.extra, 0)
  })
})
