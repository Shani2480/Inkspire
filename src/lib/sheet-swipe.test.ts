import { describe, expect, it } from "vitest"
import { closesSheet } from "@/lib/sheet-swipe"

describe("a pane's sheet dragged down on a phone", () => {
  it("closes when let go far enough down, or flicked", () => {
    expect(closesSheet(150, 560, 0)).toBe(true)
    expect(closesSheet(90, 280, 0)).toBe(true)
    expect(closesSheet(40, 560, 1.2)).toBe(true)
  })

  it("settles back after a short, slow drag", () => {
    expect(closesSheet(60, 560, 0.1)).toBe(false)
    expect(closesSheet(20, 560, 2)).toBe(false)
  })
})
