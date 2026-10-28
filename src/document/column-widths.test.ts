import { describe, expect, it } from "vitest"
import {
  columnBoxes,
  columnPreset,
  equalColumns,
  maxColumnCount,
  moveColumnEdge,
  pageColumns,
  presetColumns,
  resizeColumn,
} from "@/document/column-widths"

// Letter with 1" margins: 6.5" of text, 0.5" spacing.
const TEXT = 16.51
const GAP = 1.27

describe("column widths (22.7)", () => {
  it("Left and Right are Word's: a third less the gaps and the rest", () => {
    const left = presetColumns("left", TEXT, GAP).widths!
    expect(left.map((column) => column.width)).toEqual([4.66, 10.58])
    // 1.83" and 4.17", as Word's Columns dialog shows them.
    expect(left[0].width / 2.54).toBeCloseTo(1.83, 2)
    expect(left[1].width / 2.54).toBeCloseTo(4.17, 2)
    expect(presetColumns("right", TEXT, GAP).widths!.map((column) => column.width)).toEqual([10.58, 4.66])
    expect(columnPreset(2, left, TEXT, GAP)).toBe("left")
    expect(columnPreset(3, undefined, TEXT, GAP)).toBe("three")
  })

  it("fits as many half-inch columns as the text width takes, at most twelve", () => {
    expect(maxColumnCount(TEXT, GAP)).toBe(7)
    expect(maxColumnCount(TEXT, 0)).toBe(12)
  })

  it("scales Word's widths to a changed text width, keeping the spaces", () => {
    const widths = pageColumns(2, GAP, presetColumns("left", TEXT, GAP).widths, TEXT - 2)
    expect(widths[0].space).toBe(GAP)
    expect(widths[0].width + widths[1].width + GAP).toBeCloseTo(TEXT - 2, 1)
    expect(widths[1].width / widths[0].width).toBeCloseTo(10.58 / 4.66, 2)
    expect(pageColumns(2, GAP, undefined, TEXT)).toEqual(equalColumns(TEXT, 2, GAP))
  })

  it("lets the next column give or take a width or spacing change, down to half an inch", () => {
    const three = equalColumns(TEXT, 3, GAP)
    const wider = resizeColumn(three, 0, "width", 6, TEXT, false)
    expect(wider[0].width).toBe(6)
    expect(wider[1].width).toBeCloseTo(three[1].width - (6 - three[0].width), 2)
    expect(wider[2]).toEqual(three[2])
    const tooWide = resizeColumn(three, 0, "width", 20, TEXT, false)
    expect(tooWide[1].width).toBe(1.27)
    const last = resizeColumn(three, 2, "width", 3, TEXT, false)
    expect(last[1].width).toBeCloseTo(three[1].width + three[2].width - 3, 2)
    const spaced = resizeColumn(three, 0, "space", 2, TEXT, false)
    expect(spaced[0].space).toBe(2)
    expect(spaced[1].width).toBeCloseTo(three[1].width - (2 - GAP), 2)
  })

  it("with equal columns, a new width sets the spacing and a new spacing the widths", () => {
    const equal = resizeColumn(equalColumns(TEXT, 2, GAP), 0, "width", 7, TEXT, true)
    expect(equal.map((column) => column.width)).toEqual([7, 7])
    expect(equal[0].space).toBeCloseTo(TEXT - 14, 2)
    const spaced = resizeColumn(equalColumns(TEXT, 2, GAP), 0, "space", 2.51, TEXT, true)
    expect(spaced.map((column) => column.width)).toEqual([7, 7])
  })

  it("moves a column's edge dragged on the ruler and places the columns", () => {
    const two = presetColumns("left", TEXT, GAP).widths!
    const moved = moveColumnEdge(two, 0, 6)
    expect(moved[0].width).toBe(6)
    expect(moved[1].width).toBeCloseTo(TEXT - 6 - GAP, 2)
    const boxes = columnBoxes(moved, 10)
    expect(boxes[1].x).toBeCloseTo((6 + GAP) * 10, 5)
  })
})
