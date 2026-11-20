import { describe, expect, it } from "vitest"
import { visibleScroll } from "@/components/ribbon/ribbon"

describe("the selected ribbon tab on a phone", () => {
  it("is scrolled into sight, moving the row as little as can be", () => {
    // Home (at 0) scrolled out of a 300-wide row scrolled to 120: back to the start.
    expect(visibleScroll(120, 300, 0, 60)).toBe(0)
    // A tab past the right edge comes in at the edge.
    expect(visibleScroll(0, 300, 320, 70)).toBe(98)
    // One already in sight leaves the row where it is.
    expect(visibleScroll(40, 300, 100, 60)).toBe(40)
  })
})
