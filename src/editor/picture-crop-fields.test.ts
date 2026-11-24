import { describe, expect, it } from "vitest"
import { cropFields, withCropField } from "@/editor/picture-crop-fields"

describe("Format Picture's Crop fields", () => {
  it("measures an uncropped picture as its own frame", () => {
    expect(cropFields(200, 100, {})).toEqual({
      pictureWidth: 200,
      pictureHeight: 100,
      offsetX: 0,
      offsetY: 0,
      cropWidth: 200,
      cropHeight: 100,
      cropLeft: 0,
      cropTop: 0,
    })
  })

  it("measures a crop Word's way: the whole picture, its offset and the frame's place", () => {
    // 25% off the left, nothing off the right: a 300 px picture shown 225 px wide.
    const fields = cropFields(225, 100, { cropL: 25 })
    expect(fields.pictureWidth).toBeCloseTo(300)
    expect(fields.cropLeft).toBeCloseTo(75)
    // The picture's centre (150) is 37.5 px left of the frame's (75 + 112.5).
    expect(fields.offsetX).toBeCloseTo(-37.5)
  })

  it("moves the frame on the picture with Crop Left, keeping its size", () => {
    const attrs = withCropField(cropFields(200, 100, { cropR: 50 }), "cropLeft", 100)
    // A 400 px picture, its left half shown: moved to show from 100 px to 300 px.
    expect(attrs).toMatchObject({ width: 200, height: 100, cropL: 25, cropR: 25 })
  })

  it("grows the frame from its left edge with Crop Width", () => {
    const attrs = withCropField(cropFields(100, 100, { cropL: 25, cropR: 25 }), "cropWidth", 150)
    // A 200 px picture showing 50–150 px: 150 px wide from 50 px reaches its right edge.
    expect(attrs).toMatchObject({ width: 150, cropL: 25, cropR: 0 })
  })

  it("scales the picture behind a still frame with Picture Width, keeping the offset", () => {
    const attrs = withCropField(cropFields(100, 100, { cropL: 25, cropR: 25 }), "pictureWidth", 400)
    // Centred before (offset 0): a 400 px picture with a 100 px frame in its middle.
    expect(attrs).toMatchObject({ width: 100, cropL: 37.5, cropR: 37.5 })
  })

  it("slides the picture behind the frame with Offset Y", () => {
    const attrs = withCropField(cropFields(100, 100, { cropT: 25, cropB: 25 }), "offsetY", 50)
    // The picture 50 px lower: the frame shows its top half.
    expect(attrs).toMatchObject({ height: 100, cropT: 0, cropB: 50 })
  })
})
