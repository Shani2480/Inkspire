import { describe, expect, it } from "vitest"
import { readPageAt, readPageCount, readPageStep } from "@/document/read-pages"

describe("Read Mode pages", () => {
  it("steps by the view's width plus the gap", () => {
    expect(readPageStep(1000, 64)).toBe(1064)
  })

  it("counts the screens that hold the columns", () => {
    expect(readPageCount(1000, 1000, 64)).toBe(1)
    expect(readPageCount(2064, 1000, 64)).toBe(2)
    expect(readPageCount(2065, 1000, 64)).toBe(2)
    expect(readPageCount(3200, 1000, 64)).toBe(4)
    expect(readPageCount(3128, 1000, 64)).toBe(3)
  })

  it("finds the page a scroll position is on", () => {
    expect(readPageAt(0, 1000, 64)).toBe(0)
    expect(readPageAt(1064, 1000, 64)).toBe(1)
    expect(readPageAt(1500, 1000, 64)).toBe(1)
    expect(readPageAt(1700, 1000, 64)).toBe(2)
  })
})
