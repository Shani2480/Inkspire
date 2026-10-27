import { describe, expect, it } from "vitest"
import { SHAPE_NAMES, shapeMarkup, shapeViewBox } from "@/editor/insert-blocks"
import {
  addPoint,
  anchorsOf,
  custGeomXml,
  deletePoint,
  movePoint,
  parsePath,
  pathString,
  pointsFromCustGeom,
  pointsFromMarkup,
  type Segment,
} from "@/editor/shape-points"

const SQUARE: Segment[] = [
  { kind: "M", to: [0, 0] },
  { kind: "L", to: [100, 0] },
  { kind: "L", to: [100, 100] },
  { kind: "L", to: [0, 100] },
  { kind: "Z" },
]

describe("shapes as points", () => {
  it("reads SVG paths as absolute moves, lines, curves and closes", () => {
    expect(pathString(parsePath("m10 10 h20 v20 l-20 0z"))).toBe("M10 10 L30 10 L30 30 L10 30 Z")
    // A quadratic curve becomes the cubic that draws it.
    expect(pathString(parsePath("M0 0 Q30 30 60 0"))).toBe("M0 0 C20 20 40 20 60 0")
    // An arc ends exactly where it says, as quarter-turn curves.
    const arc = parsePath("M0 50 A50 50 0 0 1 100 50")
    expect(arc.filter((segment) => segment.kind === "C")).toHaveLength(2)
    expect((arc.at(-1) as { to: number[] }).to).toEqual([100, 50])
    // Its middle passes through the top of the circle.
    expect((arc[1] as { to: number[] }).to.map(Math.round)).toEqual([50, 0])
  })

  it("turns a gallery drawing into points stretched over its bounds", () => {
    const points = pointsFromMarkup('<rect x="8" y="8" width="64" height="40"/>', "8 8 64 40")!
    expect(pathString(points)).toBe("M0 0 L100 0 L100 100 L0 100 Z")
    const ellipse = pointsFromMarkup('<ellipse cx="40" cy="28" rx="34" ry="22"/>', "6 6 68 44")!
    expect(anchorsOf(ellipse).map((anchor) => anchor.at.map(Math.round))).toEqual([
      [100, 50],
      [50, 100],
      [0, 50],
      [50, 0],
    ])
    expect(pointsFromMarkup('<text x="0" y="0">+</text>', "0 0 80 56")).toBeNull()
  })

  it("can turn every gallery shape with an outline into points", () => {
    for (const name of SHAPE_NAMES) {
      const points = pointsFromMarkup(shapeMarkup(name), shapeViewBox(name))
      if (!points) {
        expect(shapeMarkup(name), name).toMatch(/<text\b/)
        continue
      }
      expect(pathString(points), name).not.toMatch(/NaN|Infinity/)
    }
  })

  it("moves a point, and the close of a figure with it when it is the first point", () => {
    expect(pathString(movePoint(SQUARE, 2, 10, -10))).toBe("M0 0 L100 0 L110 90 L0 100 Z")
    const closed: Segment[] = [...SQUARE.slice(0, 4), { kind: "L", to: [0, 0] }, { kind: "Z" }]
    expect(pathString(movePoint(closed, 0, 5, 5))).toBe("M5 5 L100 0 L100 100 L0 100 L5 5 Z")
    // Only one handle shows for a point the figure closes on.
    expect(anchorsOf(closed)).toHaveLength(4)
  })

  it("moves a curve's handles with its point", () => {
    const curve: Segment[] = [
      { kind: "M", to: [0, 0] },
      { kind: "C", c1: [10, 0], c2: [40, 10], to: [50, 10] },
      { kind: "C", c1: [60, 10], c2: [90, 0], to: [100, 0] },
    ]
    expect(pathString(movePoint(curve, 1, 0, 10))).toBe("M0 0 C10 0 40 20 50 20 C60 20 90 0 100 0")
  })

  it("deletes a point, keeping at least two", () => {
    expect(pathString(deletePoint(SQUARE, 2))).toBe("M0 0 L100 0 L0 100 Z")
    expect(pathString(deletePoint(SQUARE, 0))).toBe("M100 0 L100 100 L0 100 Z")
    const line: Segment[] = [
      { kind: "M", to: [0, 0] },
      { kind: "L", to: [10, 10] },
    ]
    expect(deletePoint(line, 1)).toBe(line)
  })

  it("adds a point on the outline near where it was asked, drawing the same shape", () => {
    expect(pathString(addPoint(SQUARE, 50, 1, 3)!)).toBe("M0 0 L50 0 L100 0 L100 100 L0 100 Z")
    // On the closing side, back to the start.
    expect(pathString(addPoint(SQUARE, 0, 50, 3)!)).toBe("M0 0 L100 0 L100 100 L0 100 L0 50 Z")
    expect(addPoint(SQUARE, 50, 50, 3)).toBeNull()
    const curve: Segment[] = [
      { kind: "M", to: [0, 0] },
      { kind: "C", c1: [0, 100], c2: [100, 100], to: [100, 0] },
    ]
    const split = addPoint(curve, 50, 75, 3)!
    expect(split).toHaveLength(3)
    expect((split[1] as { to: number[] }).to).toEqual([50, 75])
    expect((split[2] as { to: number[] }).to).toEqual([100, 0])
  })
})

describe("Word's custom geometry", () => {
  it("writes points as a:custGeom and reads them back", () => {
    const shape = parsePath("M0 0 L100 0 C100 50 50 100 0 100 Z")
    const xml = custGeomXml(shape)
    expect(xml).toContain('<a:path w="100000" h="100000"><a:moveTo><a:pt x="0" y="0"/></a:moveTo>')
    expect(xml).toContain("<a:cubicBezTo>")
    expect(pathString(pointsFromCustGeom(xml)!)).toBe(pathString(shape))
  })

  it("reads Word's own freeform: its path size, quadratic curves and arcs", () => {
    const xml =
      '<a:custGeom><a:pathLst><a:path w="200" h="400"><a:moveTo><a:pt x="0" y="200"/></a:moveTo>' +
      '<a:quadBezTo><a:pt x="100" y="0"/><a:pt x="200" y="200"/></a:quadBezTo>' +
      '<a:arcTo wR="100" hR="200" stAng="0" swAng="10800000"/><a:close/></a:path></a:pathLst></a:custGeom>'
    const points = pointsFromCustGeom(xml)!
    expect(points[0]).toEqual({ kind: "M", to: [0, 50] })
    expect((points[1] as { to: number[] }).to).toEqual([100, 50])
    // Half a turn from the right of an ellipse centred at (50, 50) ends on its left.
    expect((points.at(-2) as { to: number[] }).to).toEqual([0, 50])
    expect(points.at(-1)).toEqual({ kind: "Z" })
    // A point given by a guide's name cannot be drawn here.
    expect(pointsFromCustGeom('<a:custGeom><a:pathLst><a:path w="10" h="10"><a:moveTo><a:pt x="l" y="t"/></a:moveTo></a:path></a:pathLst></a:custGeom>')).toBeNull()
  })
})
