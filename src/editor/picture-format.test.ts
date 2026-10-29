import { describe, expect, it } from "vitest"
import { hasPictureFormat, pictureFilter, PICTURE_RESET, targetPixels } from "@/editor/picture-format"
import { pictureDrawingFormat } from "@/document/docx/inlines"

describe("picture formatting", () => {
  it("draws brightness, contrast, saturation and recolours as one CSS filter", () => {
    expect(pictureFilter({})).toBe("")
    expect(pictureFilter({ brightness: 20, contrast: -40, saturation: 200 })).toBe(
      "brightness(1.20) contrast(0.60) saturate(2.00)",
    )
    expect(pictureFilter({ recolor: "grayscale" })).toBe("grayscale(1)")
  })

  it("knows when a picture carries formatting a source drawing cannot stand for", () => {
    expect(hasPictureFormat({ brightness: 0, saturation: 100, border: "" })).toBe(false)
    expect(hasPictureFormat({ transparency: 30 })).toBe(true)
    expect(hasPictureFormat({ border: "#0f6cbd" })).toBe(true)
    expect(hasPictureFormat({ ...PICTURE_RESET })).toBe(false)
  })

  it("sizes a compressed picture for the resolution asked", () => {
    expect(targetPixels(480, 240, 96)).toEqual({ width: 480, height: 240 })
    expect(targetPixels(480, 240, 220)).toEqual({ width: 1100, height: 550 })
  })

  it("writes the formatting as DrawingML Word reads", () => {
    const none = pictureDrawingFormat({})
    expect(none).toEqual({ blip: "", srcRect: "", geometry: "rect", flips: "", line: "", effects: "" })
    const format = pictureDrawingFormat({
      brightness: 20,
      contrast: -10,
      recolor: "grayscale",
      transparency: 30,
      border: "#0f6cbd",
      borderWidth: 3,
      borderDash: "dash",
      frame: "oval",
      shadow: "outer-br",
      softEdge: 5,
      reflection: "half-tight",
    })
    expect(format.blip).toContain('<a:lum bright="20000" contrast="-10000"/>')
    expect(format.blip).toContain("<a:grayscl/>")
    expect(format.blip).toContain('<a:alphaModFix amt="70000"/>')
    expect(format.geometry).toBe("ellipse")
    expect(format.line).toBe(
      '<a:ln w="38100"><a:solidFill><a:srgbClr val="0f6cbd"/></a:solidFill><a:prstDash val="dash"/></a:ln>',
    )
    expect(format.effects).toMatch(/^<a:effectLst><a:outerShdw .*<a:softEdge rad="63500"\/><a:reflection /)
  })
})
