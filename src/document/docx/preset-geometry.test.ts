import { describe, expect, it } from "vitest"
import { readWordShape } from "@/document/docx/shape-import"
import {
  avListXml,
  dragAdjustHandle,
  hasAdjustHandles,
  presetAdjust,
  presetAdjustDefaults,
  presetHandles,
  presetSegments,
} from "@/document/docx/preset-geometry"
import { geometryPoints } from "@/editor/shape-adjust"
import { pathBounds, type Segment } from "@/editor/shape-points"

const ends = (segments: Segment[]) => segments.filter((item) => item.kind !== "Z").map((item) => item.to)

describe("Word's preset geometry (21.35)", () => {
  it("works out a preset's guides and paths at the shape's size", () => {
    expect(ends(presetSegments("rect", 2, 1)!)).toEqual([
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ])
    // A triangle's apex follows its adjust value (half way by default, a quarter here).
    expect(ends(presetSegments("triangle", 4, 3)!)[1]).toEqual([50, 0])
    expect(ends(presetSegments("triangle", 4, 3, { adj: 25000 })!)[1]).toEqual([25, 0])
  })

  it("draws arcs as curves round the ellipse Word means", () => {
    const ellipse = presetSegments("ellipse", 300, 100)!
    expect(ellipse.filter((item) => item.kind === "C")).toHaveLength(4)
    const bounds = pathBounds(ellipse)
    expect([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].map((value) => Math.round(value) + 0)).toEqual([
      0, 0, 100, 100,
    ])
    // A rounded rectangle's corners are a sixth of the short side by default.
    const round = ends(presetSegments("roundRect", 600, 300)!)
    expect(round[0]?.[1]).toBeCloseTo((300 / 6 / 300) * 100, 1)
  })

  it("places a callout's tail by its adjust values", () => {
    const tail = (adjust: Record<string, number>) =>
      ends(presetSegments("wedgeRectCallout", 1000, 500, adjust)!).reduce((low, point) =>
        point[1] > low[1] ? point : low,
      )
    expect(tail({})).toEqual([29.17, 112.5])
    expect(tail({ adj1: 20000, adj2: 80000 })).toEqual([70, 130])
  })

  it("reads the adjust values a shape sets", () => {
    expect(
      presetAdjust(
        '<a:prstGeom prst="wedgeRectCallout"><a:avLst><a:gd name="adj1" fmla="val -2083"/></a:avLst></a:prstGeom>',
      ),
    ).toEqual({ adj1: -2083 })
  })

  it("opens a preset the app has no drawing for as a shape drawn from Word's geometry", () => {
    const xml =
      `<a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:spPr>` +
      `<a:xfrm><a:off x="0" y="0"/><a:ext cx="1828800" cy="914400"/></a:xfrm>` +
      `<a:prstGeom prst="cloudCallout"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFC000"/></a:solidFill>` +
      `</wps:spPr></wps:wsp>`
    const shape = readWordShape(xml, null)
    // It keeps the preset's name, not points, so its adjustment handles still work.
    expect(shape).toMatchObject({ preset: "cloudCallout", variant: "rect", geometry: "cloudCallout", points: "" })
    expect(shape?.fill).toBe("#ffc000")
    expect(geometryPoints({ geometry: "cloudCallout" }, 192, 96)).toMatch(/^M[\d. ]+C/)
    // One the app draws keeps its own drawing, unless Word moved its handles.
    const heart = xml.replace("cloudCallout", "heart")
    expect(readWordShape(heart, null)).toMatchObject({ variant: "heart", points: "", geometry: "" })
    const snipped = xml.replace(
      '<a:prstGeom prst="cloudCallout"><a:avLst/>',
      '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 50000"/></a:avLst>',
    )
    expect(readWordShape(snipped, null)).toMatchObject({
      preset: "roundRect",
      variant: "round",
      geometry: "roundRect",
      adjust: '{"adj":50000}',
      points: "",
    })
  })
})

describe("Word's adjustment handles", () => {
  it("lists a preset's handles where Word draws them", () => {
    expect(hasAdjustHandles("rect")).toBe(false)
    expect(hasAdjustHandles("mathDivide")).toBe(true)
    // The Division sign's three: the dots' size, the gap to the bar, and the bar's width.
    expect(presetHandles("mathDivide", 200, 200)).toHaveLength(3)
    // A rounded rectangle's one handle sits on the top edge where the corner's curve ends.
    const [corner] = presetHandles("roundRect", 600, 300)
    expect(corner![1]).toBe(0)
    expect(corner![0]).toBeCloseTo((300 / 6 / 600) * 100, 1)
    expect(presetAdjustDefaults("roundRect")).toEqual({ adj: 16667 })
  })

  it("moves a handle's adjust value so the handle follows the pointer, within its limits", () => {
    // Dragged a quarter of the short side in: the corner's radius is a quarter of it.
    const half = dragAdjustHandle("roundRect", 600, 300, {}, 0, [(75 / 600) * 100, 10])
    expect(half.adj).toBeGreaterThan(24500)
    expect(half.adj).toBeLessThan(25500)
    // Dragged past the middle: no more than a half-round end (50000).
    expect(dragAdjustHandle("roundRect", 600, 300, {}, 0, [90, 0]).adj).toBe(50000)
    expect(dragAdjustHandle("roundRect", 600, 300, {}, 0, [-20, 0]).adj).toBe(0)
    // The handle is then drawn where it was let go.
    const [moved] = presetHandles("roundRect", 600, 300, half)
    expect(moved![0]).toBeCloseTo((75 / 600) * 100, 0)
  })

  it("moves a two-way handle on both axes, as a callout's tail", () => {
    const tail = dragAdjustHandle("wedgeRectCallout", 1000, 500, {}, 0, [70, 130])
    expect(tail.adj1).toBeCloseTo(20000, -2)
    expect(tail.adj2).toBeCloseTo(80000, -2)
  })

  it("writes the values as Word's a:avLst", () => {
    expect(avListXml({})).toBe("<a:avLst/>")
    expect(avListXml({ adj1: 20000.4, adj2: -5 })).toBe(
      '<a:avLst><a:gd name="adj1" fmla="val 20000"/><a:gd name="adj2" fmla="val -5"/></a:avLst>',
    )
  })
})
