import { fitLine, type LineSlot } from "@/components/ribbon/line-fit"
import { describe, expect, it } from "vitest"

const metrics = { more: 30, divider: 10 }

function slots(...entries: [width: number, priority: number, group: number][]): LineSlot[] {
  return entries.map(([width, priority, group]) => ({ width, priority, group }))
}

describe("single line ribbon fitting", () => {
  it("keeps every command when the row is wide enough", () => {
    const row = slots([40, 0, 0], [40, 0, 0], [40, 0, 1])
    // 40 + 40 + divider + 40; no room is kept for More options when nothing leaves.
    expect(fitLine(row, { ...metrics, available: 130 })).toEqual([true, true, true])
  })

  it("drops commands right to left among equal priority and keeps room for More options", () => {
    const row = slots([40, 0, 0], [40, 0, 0], [40, 0, 0], [40, 0, 0])
    expect(fitLine(row, { ...metrics, available: 150 })).toEqual([true, true, true, false])
    expect(fitLine(row, { ...metrics, available: 100 })).toEqual([true, false, false, false])
  })

  it("drops lower priority first, wherever it is", () => {
    const row = slots([40, 0, 0], [40, 2, 0], [40, 1, 1], [40, 2, 1])
    expect(fitLine(row, { ...metrics, available: 160 })).toEqual([false, true, true, true])
    expect(fitLine(row, { ...metrics, available: 120 })).toEqual([false, true, false, true])
  })

  it("leaves out the divider of a group with nothing shown", () => {
    const row = slots([40, 1, 0], [40, 0, 1], [40, 1, 2])
    // Without the middle group: 40 + divider + 40 + More options.
    expect(fitLine(row, { ...metrics, available: 120 })).toEqual([true, false, true])
  })
})
