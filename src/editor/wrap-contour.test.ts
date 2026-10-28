import { describe, expect, it } from "vitest"
import {
  WRAP_BOX,
  contourPolygon,
  flipRows,
  isFullBox,
  parseWrapPoints,
  polygonOfRows,
  rowsOfPixels,
  rowsOfPolygon,
} from "@/editor/wrap-contour"
import { deleteWrapPoint, insertWrapPoint } from "@/editor/edit-wrap-points"

/** A 4×4 image with a diamond-ish blob: opaque where `shape` has a 1. */
function pixels(shape: string[]) {
  const height = shape.length
  const width = shape[0]!.length
  const data = new Uint8ClampedArray(width * height * 4)
  shape.forEach((line, y) => {
    for (let x = 0; x < width; x += 1) {
      data[(y * width + x) * 4 + 3] = line[x] === "1" ? 255 : 0
    }
  })
  return { width, height, data }
}

describe("tight wrap outlines", () => {
  it("reads the drawn extent of each band", () => {
    const rows = rowsOfPixels(pixels(["0110", "1111", "0000", "0011"]), 4)
    expect(rows).toEqual([[0.25, 0.75], [0, 1], null, [0.5, 1]])
  })

  it("knows when the outline is the box itself", () => {
    expect(isFullBox(rowsOfPixels(pixels(["1111", "1111"]), 2))).toBe(true)
    expect(isFullBox(rowsOfPixels(pixels(["0110", "1111"]), 2))).toBe(false)
    expect(isFullBox([[0, 1], null])).toBe(false)
  })

  it("flips an outline across and down", () => {
    expect(flipRows([[0, 0.25], [0.5, 1], null], true, false)).toEqual([[0.75, 1], [0, 0.5], null])
    expect(flipRows([[0, 0.25], null], false, true)).toEqual([null, [0, 0.25]])
  })

  it("makes a polygon along the edge facing the text", () => {
    const rows: Parameters<typeof contourPolygon>[0] = [
      [0, 0.5],
      [0, 1],
    ]
    const gaps = { top: 0, bottom: 0, left: 6, right: 6 }
    // Text on the right of an object 100 wide that ends 6 before the room's edge: the room is 206 wide.
    const left = contourPolygon(rows, { float: "left", objectWidth: 100, objectHeight: 40, roomWidth: 206, gaps })
    expect(left).toContain("156px 0px")
    expect(left).toContain("206px 20px")
    // Text on the left: the object starts 6 into the room and its left edge is the contour.
    const right = contourPolygon(
      [
        [0.5, 1],
        [0, 1],
      ],
      {
        float: "right",
        objectWidth: 100,
        objectHeight: 40,
        roomWidth: 206,
        gaps,
      },
    )
    expect(right).toContain("50px 0px")
    expect(right).toContain("0px 20px")
  })
})

describe("wrap points", () => {
  it("reads a polygon's extent band by band", () => {
    // A triangle: its point at the top middle, its base across the bottom.
    const rows = rowsOfPolygon(
      [
        [WRAP_BOX / 2, 0],
        [WRAP_BOX, WRAP_BOX],
        [0, WRAP_BOX],
      ],
      4,
    )
    expect(rows[0]![0]).toBeGreaterThan(0.35)
    expect(rows[0]![1]).toBeLessThan(0.65)
    expect(rows[3]![0]).toBeLessThan(0.15)
    expect(rows[3]![1]).toBeGreaterThan(0.85)
  })

  it("turns an outline into a few points and back", () => {
    const rows = rowsOfPixels(pixels(["0110", "0110", "1111", "1111"]), 4)
    const points = polygonOfRows(rows)
    expect(points.length).toBeLessThanOrEqual(8)
    expect(rowsOfPolygon(points, 4).map((row) => row!.map((value) => Math.round(value * 4) / 4))).toEqual(rows)
    expect(polygonOfRows(null)).toHaveLength(4)
  })

  it("parses only outlines of three points or more", () => {
    expect(parseWrapPoints("0,0 10,10")).toEqual([])
    expect(parseWrapPoints(" 0,0 10,10  5,20 ")).toEqual([
      [0, 0],
      [10, 10],
      [5, 20],
    ])
  })

  it("adds a point on the nearest line and deletes down to three", () => {
    const square: [number, number][] = [
      [0, 0],
      [0, 100],
      [100, 100],
      [100, 0],
    ]
    const added = insertWrapPoint(square, [50, 98], 5)
    expect(added?.index).toBe(2)
    expect(added?.points[2]).toEqual([50, 98])
    expect(insertWrapPoint(square, [50, 50], 5)).toBeNull()
    const three = deleteWrapPoint(square, 0)
    expect(three).toHaveLength(3)
    expect(deleteWrapPoint(three, 0)).toBe(three)
  })
})
