import { describe, expect, it } from "vitest"
import { SHAPE_NAMES, shapeMarkup, shapeViewBox } from "@/editor/insert-blocks"
import {
  addPoint,
  anchorsOf,
  bendSegment,
  closePath,
  custGeomXml,
  deletePoint,
  deleteSegment,
  handlesAt,
  moveHandle,
  nearestSegment,
  openPath,
  pointKind,
  setPointKind,
  setSegmentKind,
  fitPoints,
  movePoint,
  parsePath,
  pathBounds,
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

describe("point kinds, curve handles and paths", () => {
  const path = (d: string) => parsePath(d)
  const text = (segments: Segment[]) => pathString(segments)

  it("tells a point's kind from its handles", () => {
    const smooth = path("M0 50 C0 20 20 0 50 0 C80 0 100 20 100 50")
    expect(pointKind(smooth, 1)).toBe("smooth")
    expect(pointKind(path("M0 50 C0 20 40 0 50 0 C80 0 100 20 100 50"), 1)).toBe("straight")
    expect(pointKind(path("M0 50 C0 20 40 10 50 0 C80 0 100 20 100 50"), 1)).toBe("corner")
    expect(pointKind(SQUARE, 1)).toBe("corner")
    expect(handlesAt(smooth, 1)).toEqual({
      at: [50, 0],
      in: { segment: 1, at: [20, 0] },
      out: { segment: 2, at: [80, 0] },
    })
    // Into a closed figure's first point comes its last line back; out of its last point, the close (a line).
    const closed = path("M50 0 C80 0 100 20 100 50 C100 80 80 100 50 100 C20 100 0 80 0 50 C0 20 20 0 50 0 Z")
    expect(handlesAt(closed, 0).in).toEqual({ segment: 4, at: [20, 0] })
    expect(handlesAt(SQUARE, 3).out).toBeNull()
  })

  it("drags a handle: a Smooth point's other handle follows at the same length, a Straight one's at its own", () => {
    const curve = path("M0 50 C0 20 20 0 50 0 C80 0 100 20 100 50")
    expect(text(moveHandle(curve, 1, "out", 0, 10, "smooth"))).toBe("M0 50 C0 20 20 -10 50 0 C80 10 100 20 100 50")
    const straight = path("M0 50 C0 20 40 0 50 0 C80 0 100 20 100 50")
    const turned = moveHandle(straight, 1, "out", 0, 30, "straight")
    const { in: incoming } = handlesAt(turned, 1)
    // Turned to stay opposite, keeping its length of 10.
    expect(incoming!.at[0]).toBeCloseTo(50 - 10 / Math.SQRT2, 1)
    expect(incoming!.at[1]).toBeCloseTo(-10 / Math.SQRT2, 1)
    expect(text(moveHandle(curve, 1, "out", 0, 10, "corner"))).toBe("M0 50 C0 20 20 0 50 0 C80 10 100 20 100 50")
  })

  it("makes a corner Smooth or Straight, turning the lines either side into curves", () => {
    const smooth = setPointKind(SQUARE, 1, "smooth")
    expect(smooth.map((segment) => segment.kind).join("")).toBe("MCCLZ")
    expect(pointKind(smooth, 1)).toBe("smooth")
    // The handles lie along the way from the point before to the point after.
    const { in: incoming, out } = handlesAt(smooth, 1)
    expect((out!.at[1] - 0) / (out!.at[0] - 100)).toBeCloseTo((100 - 0) / (100 - 0), 5)
    expect(incoming!.at[0]).toBeLessThan(100)
    // The first point of a closed figure: the close's line becomes a curve of its own, coming back to it.
    const first = setPointKind(SQUARE, 0, "smooth")
    expect(text(first)).toMatch(/^M0 0 C.* C[^C]* 0 0 Z$/)
    expect(pointKind(first, 0)).toBe("smooth")
    expect(setPointKind(SQUARE, 1, "corner")).toBe(SQUARE)
  })

  it("makes a segment straight or curved, drawing the same until its handles move", () => {
    const curved = setSegmentKind(SQUARE, 1, "curved")
    expect(text(curved)).toBe("M0 0 C33.33 0 66.67 0 100 0 L100 100 L0 100 Z")
    expect(text(setSegmentKind(curved, 1, "straight"))).toBe(text(SQUARE))
    expect(text(setSegmentKind(SQUARE, 4, "curved"))).toBe("M0 0 L100 0 L100 100 L0 100 C0 66.67 0 33.33 0 0 Z")
    expect(nearestSegment(SQUARE, 2, 50)!.index).toBe(4)
  })

  it("opens a closed path at a point and closes it again", () => {
    const open = openPath(SQUARE, 2)
    expect(text(open)).toBe("M100 100 L0 100 L0 0 L100 0 L100 100")
    // Both ends are points of their own now, one on top of the other.
    expect(anchorsOf(open)).toHaveLength(5)
    expect(text(openPath(SQUARE, 0))).toBe("M0 0 L100 0 L100 100 L0 100 L0 0")
    expect(text(closePath(open, 1))).toBe("M100 100 L0 100 L0 0 L100 0 L100 100 Z")
    expect(closePath(SQUARE, 1)).toBe(SQUARE)
  })

  it("bends a line or curve so the point grabbed follows the pointer", () => {
    const at = (segments: Segment[], index: number, t: number) => {
      const curve = segments[index] as Extract<Segment, { kind: "C" }>
      const from = (segments[index - 1] as { to: [number, number] }).to
      const u = 1 - t
      return [0, 1].map(
        (axis) =>
          u * u * u * from[axis]! +
          3 * u * u * t * curve.c1[axis]! +
          3 * u * t * t * curve.c2[axis]! +
          t * t * t * curve.to[axis]!,
      )
    }
    // A line becomes a curve through the dragged point, its ends where they were.
    const bent = bendSegment(path("M0 0 L100 0"), 1, 0.5, 0, 30)
    expect(at(bent, 1, 0.5).map((value) => Math.round(value))).toEqual([50, 30])
    expect((bent[1] as { to: number[] }).to).toEqual([100, 0])
    const third = bendSegment(path("M0 0 C30 0 70 0 100 0"), 1, 0.25, 10, -20)
    expect(at(third, 1, 0.25).map((value) => Math.round(value))).toEqual([34, -20])
    // The close's line becomes a curve of its own, coming back to the start.
    const closed = bendSegment(SQUARE, 4, 0.5, -20, 0)
    expect(text(closed)).toMatch(/L0 100 C[^Z]* 0 0 Z$/)
    expect(at(closed, 4, 0.5).map((value) => Math.round(value))).toEqual([-20, 50])
  })

  it("deletes a segment: a closed path opens there, an open one splits", () => {
    expect(text(deleteSegment(SQUARE, 2))).toBe("M100 100 L0 100 L0 0 L100 0")
    expect(text(deleteSegment(SQUARE, 4))).toBe("M0 0 L100 0 L100 100 L0 100")
    const line = path("M0 0 L10 0 L20 0 L30 0")
    expect(text(deleteSegment(line, 2))).toBe("M0 0 L10 0 M20 0 L30 0")
    expect(text(deleteSegment(line, 1))).toBe("M10 0 L20 0 L30 0")
    expect(deleteSegment(path("M0 0 L10 0"), 1)).toHaveLength(2)
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
    expect(
      pointsFromCustGeom(
        '<a:custGeom><a:pathLst><a:path w="10" h="10"><a:moveTo><a:pt x="l" y="t"/></a:moveTo></a:path></a:pathLst></a:custGeom>',
      ),
    ).toBeNull()
  })
})

describe("fitting the box to the outline", () => {
  const frame = { width: 200, height: 100, rotate: 0, flipH: false, flipV: false }

  /** A point of the outline on the page, for a box whose top-left corner is at (left, top). */
  function onPage([x, y]: [number, number], box: typeof frame, left: number, top: number) {
    let lx = (x / 100) * box.width - box.width / 2
    let ly = (y / 100) * box.height - box.height / 2
    if (box.flipH) {
      lx = -lx
    }
    if (box.flipV) {
      ly = -ly
    }
    const turn = (box.rotate * Math.PI) / 180
    return [
      left + box.width / 2 + lx * Math.cos(turn) - ly * Math.sin(turn),
      top + box.height / 2 + lx * Math.sin(turn) + ly * Math.cos(turn),
    ]
  }

  it("leaves a box that fits alone", () => {
    expect(fitPoints(parsePath("M50 0 L100 100 L0 100 Z"), frame)).toBeNull()
  })

  it("grows the box when a point goes out, and spreads the points over it again", () => {
    const fit = fitPoints(parsePath("M50 -50 L100 100 L0 100 Z"), frame)!
    expect(pathString(fit.segments)).toBe("M50 0 L100 100 L0 100 Z")
    expect([fit.width, fit.height, fit.dx, fit.dy]).toEqual([200, 150, 0, -50])
  })

  it("shrinks it when the outline is pulled in", () => {
    const fit = fitPoints(parsePath("M50 0 L75 100 L25 100 Z"), frame)!
    expect([fit.width, fit.height, fit.dx, fit.dy]).toEqual([100, 100, 50, 0])
  })

  it("keeps the points that did not move where they were on the page, turned and flipped", () => {
    for (const box of [
      { ...frame, rotate: 30 },
      { ...frame, rotate: -75, flipH: true },
      { ...frame, rotate: 120, flipV: true },
    ]) {
      const moved = parsePath("M50 -40 L130 100 L0 100 Z")
      const fit = fitPoints(moved, box)!
      const after = { ...box, width: fit.width, height: fit.height }
      const fixed = anchorsOf(moved).slice(1)
      const fitted = anchorsOf(fit.segments).slice(1)
      fixed.forEach((anchor, index) => {
        const before = onPage(anchor.at, box, 10, 20)
        const now = onPage(fitted[index]!.at, after, 10 + fit.dx, 20 + fit.dy)
        expect(now[0]).toBeCloseTo(before[0]!, 1)
        expect(now[1]).toBeCloseTo(before[1]!, 1)
      })
    }
  })

  it("measures a curve by how far it reaches, not by its control points", () => {
    const bounds = pathBounds(parsePath("M0 50 C0 -16.67 100 -16.67 100 50"))!
    expect(bounds.minY).toBeCloseTo(0, 0)
    expect(bounds.maxX).toBe(100)
  })

  it("keeps a straight line's box across it", () => {
    const fit = fitPoints(parsePath("M0 50 L100 50"), frame)
    expect(fit).toBeNull()
  })
})
