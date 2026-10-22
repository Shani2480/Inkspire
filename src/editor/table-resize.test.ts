import { describe, expect, it } from "vitest"
import { scaledColumnWidths } from "@/editor/table-tools"

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
