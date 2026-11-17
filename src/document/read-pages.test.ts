import { describe, expect, it } from "vitest"
import { findInPieces, readPageAt, readPageCount, readPageStep, useReadFind } from "@/document/read-pages"

describe("Read Mode pages", () => {
  it("steps by the view's width plus the gap", () => {
    expect(readPageStep(1000, 64)).toBe(1064)
  })

  it("counts the screens that hold the columns", () => {
    expect(readPageCount(1000, 1000, 64)).toBe(1)
    expect(readPageCount(2064, 1000, 64)).toBe(2)
    expect(readPageCount(2065, 1000, 64)).toBe(2)
    expect(readPageCount(3200, 1000, 64)).toBe(4)
    expect(readPageCount(3128, 1000, 64)).toBe(3)
  })

  it("finds the page a scroll position is on", () => {
    expect(readPageAt(0, 1000, 64)).toBe(0)
    expect(readPageAt(1064, 1000, 64)).toBe(1)
    expect(readPageAt(1500, 1000, 64)).toBe(1)
    expect(readPageAt(1700, 1000, 64)).toBe(2)
  })
})

describe("Find in Read Mode", () => {
  it("finds every match, ignoring case, across the pieces the text comes in", () => {
    const found = findInPieces(["The cat sat. ", "A C", "AT ran."], "cat")
    expect(found).toEqual([
      { start: { piece: 0, offset: 4 }, end: { piece: 0, offset: 7 } },
      { start: { piece: 1, offset: 2 }, end: { piece: 2, offset: 2 } },
    ])
  })

  it("finds nothing for an empty query, and skips empty pieces", () => {
    expect(findInPieces(["abc"], "")).toEqual([])
    expect(findInPieces(["ab", "", "c"], "c")).toEqual([
      { start: { piece: 2, offset: 0 }, end: { piece: 2, offset: 1 } },
    ])
  })

  it("steps through the matches round and round", () => {
    const find = useReadFind.getState()
    find.show()
    find.setQuery("x")
    useReadFind.getState().setCount(3)
    useReadFind.getState().move(-1)
    expect(useReadFind.getState().current).toBe(2)
    useReadFind.getState().move(1)
    expect(useReadFind.getState().current).toBe(0)
    useReadFind.getState().hide()
    expect(useReadFind.getState()).toMatchObject({ open: false, query: "", count: 0 })
  })
})

describe("a page folded over as it turns", () => {
  const w = 400
  const h = 600
  const corner = { x: w, y: h }

  it("lies flat with its corner in place", async () => {
    const { foldShapes } = await import("@/document/read-pages")
    const fold = foldShapes(w, h, corner, corner)
    expect(fold.top.slice(0, 4)).toEqual([
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ])
    expect(fold.turned).toBe(0)
  })

  it("folds along the line halfway to where the corner went, the flap mirrored across it", async () => {
    const { foldShapes } = await import("@/document/read-pages")
    // The corner drawn straight across to the spine: the fold runs down the middle of the page.
    const fold = foldShapes(w, h, corner, { x: 0, y: h })
    expect(fold.top).toHaveLength(6)
    expect(Math.max(...fold.top.map((point) => point.x))).toBeCloseTo(w / 2)
    expect(Math.min(...fold.flap.map((point) => point.x))).toBeCloseTo(w / 2)
    const [a, b, c, d, e, f] = fold.matrix
    const mirror = (x: number, y: number) => ({ x: a! * x + c! * y + e!, y: b! * x + d! * y + f! })
    expect(mirror(w, h).x).toBeCloseTo(0)
    expect(mirror(w, h).y).toBeCloseTo(h)
    expect(fold.turned).toBeCloseTo(0.5)
  })

  it("leaves nothing flat once the page has gone over", async () => {
    const { foldShapes } = await import("@/document/read-pages")
    const fold = foldShapes(w, h, corner, { x: -w, y: h })
    expect(Math.max(...fold.top.map((point) => point.x))).toBeLessThanOrEqual(0.001)
    expect(fold.turned).toBe(1)
  })

  it("keeps the corner within reach of the spine, as paper bound at its edge", async () => {
    const { onSpine } = await import("@/document/read-pages")
    const pulled = onSpine({ x: -w, y: 0 }, corner, w, h)
    expect(Math.hypot(pulled.x, pulled.y - h)).toBeLessThanOrEqual(w + 0.001)
    expect(onSpine({ x: 100, y: h - 50 }, corner, w, h)).toEqual({ x: 100, y: h - 50 })
  })

  it("lifts the corner on its way across and ends where it was sent", async () => {
    const { curlPath } = await import("@/document/read-pages")
    const path = curlPath(corner, { x: -w, y: h }, corner, w, h, 0.15)
    expect(path[0]).toEqual(corner)
    expect(path[path.length - 1]!.x).toBeCloseTo(-w)
    expect(path[path.length - 1]!.y).toBeCloseTo(h)
    expect(path[16]!.y).toBeLessThan(h)
  })
})

describe("the fold's mirror as CSS transforms", () => {
  it("matches the matrix: about the fold's middle, flipped along the corner's way", async () => {
    const { foldShapes } = await import("@/document/read-pages")
    const fold = foldShapes(400, 600, { x: 400, y: 600 }, { x: 120, y: 480 })
    const { x, y, angle } = fold.mirror
    const [a, b, c, d, e, f] = fold.matrix
    // translate(m) rotate(angle) scaleX(-1) rotate(-angle) translate(-m), applied to a point.
    const apply = (px: number, py: number) => {
      const ux = px - x
      const uy = py - y
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const rx = cos * ux + sin * uy
      const ry = -sin * ux + cos * uy
      return { x: -cos * rx - sin * ry + x, y: -sin * rx + cos * ry + y }
    }
    const mirrored = apply(400, 600)
    expect(mirrored.x).toBeCloseTo(a! * 400 + c! * 600 + e!)
    expect(mirrored.y).toBeCloseTo(b! * 400 + d! * 600 + f!)
    expect(angle).toBeGreaterThanOrEqual(0)
  })
})
