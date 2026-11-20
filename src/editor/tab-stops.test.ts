import { describe, expect, it } from "vitest"
import { resolveStop } from "@/editor/tab-stops"

describe("default tab stops", () => {
  it("go to Word's next half-inch mark from the margin, not half an inch past the text", () => {
    // Text ending at 3.24 in (311 px): Word's tab ends at 3.5 in (336 px).
    expect(resolveStop([], 311).position).toBe(336)
    expect(resolveStop([], 0).position).toBe(48)
    // At a mark already: the next one.
    expect(resolveStop([], 96).position).toBe(144)
  })

  it("keep a custom stop ahead of the text first", () => {
    expect(resolveStop([{ position: 200, align: "right" }], 120)).toMatchObject({ position: 200, align: "right" })
    expect(resolveStop([{ position: 200, align: "left" }], 210).position).toBe(240)
  })
})
