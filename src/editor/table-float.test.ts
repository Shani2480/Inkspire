import { describe, expect, it } from "vitest"
import {
  clearOfFloats,
  defaultFloat,
  floatPlace,
  floatSide,
  parseFloatValue,
  type FloatFrame,
} from "@/editor/table-float"
import { PX_PER_CM } from "@/editor/table-props"

// A Letter page with 1" margins: 816 × 1056 px, a 624 px text width.
const frame: FloatFrame = {
  pageWidth: 816,
  pageHeight: 1056,
  marginLeft: 96,
  marginRight: 96,
  marginTop: 96,
  marginBottom: 96,
  page: 1,
  paragraphTop: 200,
}

describe("tables text wraps around (22.10)", () => {
  it("starts where the table's alignment put it, moving with its paragraph, 0.32 cm from the text at the sides", () => {
    expect(defaultFloat("left", 1.5)).toMatchObject({ h: 1.5, hFrom: "column", v: 0, vFrom: "paragraph" })
    expect(defaultFloat("center", 0).h).toBe("center")
    expect(defaultFloat("right", 0).gaps).toEqual({ top: 0, bottom: 0, left: 0.32, right: 0.32 })
  })

  it("reads its attribute, and drops a named place below a paragraph (which has only distances)", () => {
    const float = parseFloatValue(JSON.stringify({ h: "right", hFrom: "page", v: "bottom", vFrom: "paragraph" }))
    expect(float).toMatchObject({ h: "right", hFrom: "page", v: 0, vFrom: "paragraph", overlap: true })
    expect(parseFloatValue("not json")).toBeNull()
    expect(parseFloatValue(null)).toBeNull()
  })

  it("places the table across from the column or page and down from its paragraph, the margin or the page", () => {
    const float = defaultFloat("left", 0)
    expect(floatPlace({ ...float, h: 2, v: 1 }, 200, 100, frame)).toEqual({
      x: Math.round(2 * PX_PER_CM),
      y: Math.round(200 + PX_PER_CM),
    })
    expect(floatPlace({ ...float, h: "right" }, 200, 100, frame).x).toBe(424)
    expect(floatPlace({ ...float, h: "center", hFrom: "page" }, 200, 100, frame).x).toBe(-96 + 308)
    expect(floatPlace({ ...float, v: "bottom", vFrom: "margin" }, 200, 100, frame).y).toBe(864 - 100)
    expect(floatPlace({ ...float, v: "top", vFrom: "page" }, 200, 100, frame).y).toBe(-96)
    // Inside is the left on an odd page and the right on an even one.
    expect(floatPlace({ ...float, h: "inside" }, 200, 100, frame).x).toBe(0)
    expect(floatPlace({ ...float, h: "inside" }, 200, 100, { ...frame, page: 2 }).x).toBe(424)
  })

  it("leaves the text the roomier side, or only above and below when neither side has room for a line", () => {
    const gaps = { top: 0, bottom: 0, left: 0.32, right: 0.32 }
    expect(floatSide(0, 200, gaps, 624)).toEqual({ float: "left", width: 212 })
    expect(floatSide(424, 200, gaps, 624)).toEqual({ float: "right", width: 212 })
    expect(floatSide(10, 600, gaps, 624)).toEqual({ float: "left", width: 624 })
  })
})

describe("floating tables that may not overlap (w:tblOverlap never)", () => {
  const first = { x: 0, y: 100, width: 300, height: 200 }

  it("moves down past a table it would cover", () => {
    expect(clearOfFloats([first], { x: 100, y: 150, width: 200, height: 50 })).toBe(300)
  })

  it("keeps its place beside one it does not reach, and past several in turn", () => {
    expect(clearOfFloats([first], { x: 320, y: 150, width: 200, height: 50 })).toBe(150)
    const second = { x: 200, y: 300, width: 300, height: 100 }
    expect(clearOfFloats([first, second], { x: 250, y: 120, width: 100, height: 50 })).toBe(400)
  })
})
