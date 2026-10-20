import { describe, expect, it } from "vitest"
import { MIN_OBJECT_SIZE, resizedBox, sizeTipText } from "./object-resize"

const start = { width: 200, height: 100 }

describe("resizedBox", () => {
  it("lets a side handle change one dimension", () => {
    expect(resizedBox("e", start, 40, 30, false)).toEqual({ width: 240, height: 100 })
    expect(resizedBox("s", start, 40, 30, false)).toEqual({ width: 200, height: 130 })
    expect(resizedBox("w", start, 40, 0, false)).toEqual({ width: 160, height: 100 })
    expect(resizedBox("n", start, 0, -20, false)).toEqual({ width: 200, height: 120 })
  })

  it("keeps the aspect ratio on a corner, following the larger move", () => {
    expect(resizedBox("se", start, 100, 0, false)).toEqual({ width: 300, height: 150 })
    expect(resizedBox("se", start, 0, 100, false)).toEqual({ width: 400, height: 200 })
    expect(resizedBox("nw", start, 50, 0, false)).toEqual({ width: 150, height: 75 })
  })

  it("keeps the aspect ratio on a side with Shift", () => {
    expect(resizedBox("e", start, 100, 0, true)).toEqual({ width: 300, height: 150 })
    expect(resizedBox("s", start, 0, 50, true)).toEqual({ width: 300, height: 150 })
  })

  it("stays within the minimum and maximum", () => {
    expect(resizedBox("e", start, -500, 0, false).width).toBe(MIN_OBJECT_SIZE)
    const small = resizedBox("se", start, -500, 0, false)
    expect(small.height).toBe(MIN_OBJECT_SIZE)
    expect(small.width).toBe(48)
    expect(resizedBox("se", start, 800, 0, false, 600)).toEqual({ width: 600, height: 300 })
  })
})

describe("sizeTipText", () => {
  it("shows the size in centimetres", () => {
    expect(sizeTipText({ width: 96, height: 48 })).toBe("2.5 × 1.3 cm")
  })
})
