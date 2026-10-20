import { describe, expect, it } from "vitest"
import { buildRulerTicks } from "@/document/measure"

describe("ruler numbers (22.24)", () => {
  it("count outwards from the margin edge instead of showing negatives", () => {
    const ticks = buildRulerTicks({ length: 800, origin: 200, zoom: 1, system: "metric", locale: "en-US" })
    const labels = ticks.map((tick) => tick.label).filter(Boolean)
    expect(labels.length).toBeGreaterThan(2)
    expect(labels.some((label) => String(label).startsWith("-"))).toBe(false)
    expect(labels).toContain("0")
    expect(labels).toContain("1")
  })
})
