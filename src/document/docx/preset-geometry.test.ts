import { describe, expect, it } from "vitest"
import { readWordShape } from "@/document/docx/shape-import"
import { presetAdjust, presetSegments } from "@/document/docx/preset-geometry"
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
    expect(shape).toMatchObject({ preset: "cloudCallout", variant: "rect", fill: "#ffc000" })
    expect(shape?.points).toMatch(/^M[\d. ]+C/)
    // One the app draws keeps its own drawing, unless Word moved its handles.
    const heart = xml.replace("cloudCallout", "heart")
    expect(readWordShape(heart, null)).toMatchObject({ variant: "heart", points: "" })
    const snipped = xml.replace(
      '<a:prstGeom prst="cloudCallout"><a:avLst/>',
      '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 50000"/></a:avLst>',
    )
    expect(readWordShape(snipped, null)).toMatchObject({ preset: "roundRect", variant: "rect" })
    expect(readWordShape(snipped, null)?.points).not.toBe("")
  })
})
