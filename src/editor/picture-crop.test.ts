import { describe, expect, it } from "vitest"
import {
  NO_CROP,
  aspectRatioCrop,
  cropAttrs,
  cropOf,
  croppedBy,
  fillCrop,
  fitCrop,
  isCropped,
  wholeSize,
} from "@/editor/picture-crop"
import { croppableShape, frameForVariant, frameOfPreset, presetOfFrame, shapeMask } from "@/editor/picture-shape"

describe("picture crop", () => {
  it("reads the crop attributes as shares of the whole picture", () => {
    expect(cropOf({ cropL: 20, cropT: 0, cropR: 10, cropB: 50 })).toEqual({ l: 0.2, t: 0, r: 0.1, b: 0.5 })
    // A negative side is empty room beside the picture (Fit), down to the picture's own width.
    expect(cropOf({ cropL: 120, cropR: -5, cropT: -300 })).toEqual({ l: 0.95, t: -1, r: -0.05, b: 0 })
    expect(isCropped({ cropL: -10, cropR: 10 })).toBe(true)
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

  it("crops to an aspect ratio: the largest centred part of the whole picture, at its scale", () => {
    // A 300×200 picture (3:2) cropped square keeps its height and loses a sixth on each side.
    const square = aspectRatioCrop(300, 200, { l: 0, t: 0, r: 0, b: 0 }, 1)
    expect(square).toMatchObject({ width: 200, height: 200 })
    expect(square.crop.l).toBeCloseTo(1 / 6)
    expect(square.crop.r).toBeCloseTo(1 / 6)
    // Already cropped: the ratio is taken from the whole picture, not the part that shows.
    const tall = aspectRatioCrop(150, 200, { l: 0.25, t: 0, r: 0.25, b: 0 }, 3 / 4)
    expect(tall).toMatchObject({ width: 150, height: 200 })
    expect(tall.crop.l).toBeCloseTo(0.25)
    const wide = aspectRatioCrop(300, 200, { l: 0, t: 0, r: 0, b: 0 }, 16 / 9)
    expect(wide).toMatchObject({ width: 300, height: 169 })
    expect(wide.crop.t).toBeCloseTo((1 - 168.75 / 200) / 2)
  })

  it("fills or fits the picture to its frame, keeping the frame", () => {
    // A 300×200 picture in a square 100×100 frame (cropped from the sides).
    const crop = { l: 1 / 6, t: 0, r: 1 / 6, b: 0 }
    const fill = fillCrop(200, 200, crop)
    expect(fill).toMatchObject({ width: 200, height: 200 })
    expect(fill.crop.l).toBeCloseTo(1 / 6)
    expect(fill.crop.t).toBeCloseTo(0)
    const fit = fitCrop(200, 200, crop)
    expect(fit).toMatchObject({ width: 200, height: 200 })
    // All of it shows, 200×133, with a sixth of empty room above and below.
    expect(fit.crop.l).toBeCloseTo(0)
    expect(fit.crop.t).toBeCloseTo(-0.25)
    expect(wholeSize(200, 200, fit.crop).width).toBeCloseTo(200)
    // A drag then may take the empty room away, but not crop back past it.
    expect(croppedBy("n", { width: 200, height: 200, crop: fit.crop }, 0, -50).crop.t).toBeCloseTo(-0.25)
  })
})

describe("Crop to Shape", () => {
  it("names the frame by the shape gallery and Word's presets", () => {
    expect(frameForVariant("ellipse")).toBe("oval")
    expect(frameForVariant("round")).toBe("rounded")
    expect(frameForVariant("rect")).toBe("")
    expect(frameForVariant("heart")).toBe("heart")
    expect(presetOfFrame("oval")).toBe("ellipse")
    expect(presetOfFrame("rounded")).toBe("roundRect")
    expect(presetOfFrame("heart")).toBe("heart")
    expect(presetOfFrame("star")).toBe("star5")
    expect(presetOfFrame("")).toBe("rect")
    expect(frameOfPreset("star5")).toBe("star")
    expect(frameOfPreset("ellipse")).toBe("oval")
    expect(frameOfPreset("rect")).toBe("")
    expect(frameOfPreset("somethingElse")).toBe("")
  })

  it("offers only shapes Word has a preset for, and no lines", () => {
    expect(croppableShape("heart")).toBe(true)
    expect(croppableShape("line")).toBe(false)
    expect(croppableShape("callout-3")).toBe(false)
  })

  it("draws a shape through a mask of its filled outline; rectangles, rounded and oval need none", () => {
    expect(shapeMask("")).toBeNull()
    expect(shapeMask("oval")).toBeNull()
    const mask = decodeURIComponent(shapeMask("triangle")!)
    expect(mask).toContain('preserveAspectRatio="none"')
    expect(mask).toContain('fill="#000"')
    expect(mask).toContain('stroke="none"')
    expect(mask).not.toContain("#fff4ce")
  })
})
