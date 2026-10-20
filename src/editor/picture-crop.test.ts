import { describe, expect, it } from "vitest"
import { NO_CROP, cropAttrs, cropOf, croppedBy, isCropped, wholeSize } from "@/editor/picture-crop"

describe("picture crop", () => {
  it("reads the crop attributes as shares of the whole picture", () => {
    expect(cropOf({ cropL: 20, cropT: 0, cropR: 10, cropB: 50 })).toEqual({ l: 0.2, t: 0, r: 0.1, b: 0.5 })
    expect(cropOf({ cropL: 120, cropR: -5 })).toEqual({ l: 0.95, t: 0, r: 0, b: 0 })
    expect(isCropped(NO_CROP)).toBe(false)
    expect(isCropped({ cropT: 1 })).toBe(true)
  })

  it("finds the whole picture's size from the part that shows", () => {
    expect(wholeSize(240, 160, { l: 0.2, t: 0, r: 0, b: 0.2 })).toEqual({ width: 300, height: 200 })
  })

  it("crops an edge without scaling the picture, and a drag back shows it again", () => {
    const start = { width: 300, height: 200, crop: { l: 0, t: 0, r: 0, b: 0 } }
    const west = croppedBy("w", start, 60, 0)
    expect(west).toMatchObject({ width: 240, height: 200 })
    expect(cropAttrs(west.crop)).toEqual({ cropL: 20, cropT: 0, cropR: 0, cropB: 0 })

    const back = croppedBy("w", { width: 240, height: 200, crop: west.crop }, -30, 0)
    expect(back.width).toBe(270)
    expect(back.crop.l).toBeCloseTo(0.1)
    // Not past the picture's own edge.
    expect(croppedBy("w", { width: 240, height: 200, crop: west.crop }, -500, 0).crop.l).toBe(0)
  })

  it("keeps a sliver of the picture and crops two sides at a corner", () => {
    const start = { width: 300, height: 200, crop: { l: 0, t: 0, r: 0, b: 0 } }
    expect(croppedBy("e", start, -900, 0).width).toBe(15)
    const corner = croppedBy("se", start, -30, -20)
    expect(corner).toMatchObject({ width: 270, height: 180 })
    expect(cropAttrs(corner.crop)).toMatchObject({ cropR: 10, cropB: 10 })
  })
})
