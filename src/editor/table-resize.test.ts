import { describe, expect, it } from "vitest"
import { scaledColumnWidths, sharedColumnWidths } from "@/editor/table-tools"

describe("the table's resize square (22.19)", () => {
  it("scales every column in step and keeps each one at least as wide as a column can be", () => {
    expect(scaledColumnWidths([100, 200, 300], 1.5)).toEqual([150, 300, 450])
    expect(scaledColumnWidths([100, 200, 300], 0.5)).toEqual([50, 100, 150])
    expect(scaledColumnWidths([40, 400], 0.1)).toEqual([28, 40])
  })

  it("leaves the widths alone for a factor that makes no sense", () => {
    expect(scaledColumnWidths([120, 80], 0)).toEqual([120, 80])
    expect(scaledColumnWidths([120, 80], Number.NaN)).toEqual([120, 80])
    expect(scaledColumnWidths([120, 80], -2)).toEqual([120, 80])
  })
})

describe("fitting every column of a selected table to its contents", () => {
  it("gives each column its unwrapped width when they all fit the page", () => {
    expect(sharedColumnWidths([40, 60, 30], [90, 200, 50], 600)).toEqual([90, 200, 50])
  })

  it("shares the page in proportion to how much wider each column would like to be", () => {
    // 130 of longest words, 340 unwrapped, 235 of room: half of each column's extra.
    expect(sharedColumnWidths([40, 60, 30], [90, 200, 50], 235)).toEqual([65, 130, 40])
  })

  it("keeps the longest words whole when even they do not fit, and no column below the narrowest", () => {
    expect(sharedColumnWidths([120, 160, 10], [300, 400, 12], 200)).toEqual([120, 160, 28])
  })
})
