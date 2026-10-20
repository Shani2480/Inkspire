import { describe, expect, it } from "vitest"
import { pageGridCell, pageGridRows } from "@/document/page-grid"

const cell = (index: number, view: number) => pageGridCell(index, view, 100, 200)

describe("the two-page spread (21.39)", () => {
  it("puts odd pages on the right and even pages on the left, page 1 alone on the right", () => {
    // pages 1..5 are indices 0..4
    expect([0, 1, 2, 3, 4].map((index) => cell(index, 2).column)).toEqual([1, 0, 1, 0, 1])
    expect([0, 1, 2, 3, 4].map((index) => cell(index, 2).row)).toEqual([0, 1, 1, 2, 2])
  })

  it("places a page that typing opens on the side its number says", () => {
    // Typing past page 3 opens page 4: it starts the next spread, on the left.
    expect(cell(3, 2)).toEqual({ column: 0, row: 2, left: 0, top: 400 })
    // Typing past page 4 opens page 5: beside it, on the right.
    expect(cell(4, 2)).toEqual({ column: 1, row: 2, left: 100, top: 400 })
  })

  it("counts the spread's rows with the empty place before page 1", () => {
    expect([1, 2, 3, 4, 5].map((count) => pageGridRows(count, 2))).toEqual([1, 2, 2, 3, 3])
  })

  it("leaves the single page and the four and eight page grids as they were", () => {
    expect(cell(3, 1)).toEqual({ column: 0, row: 3, left: 0, top: 600 })
    expect([0, 1, 2, 3, 4].map((index) => cell(index, 4).column)).toEqual([0, 1, 2, 3, 0])
    expect(pageGridRows(5, 4)).toBe(2)
  })
})
