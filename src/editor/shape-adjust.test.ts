import { describe, expect, it } from "vitest"
import { adjustHandlePlaces, adjustOf, adjustedAttrs, geometryPoints, showsAdjustHandles } from "@/editor/shape-adjust"

describe("Shape adjustment handles", () => {
  it("shows handles on a gallery shape whose Word preset has them, not on edited points or a rectangle", () => {
    expect(showsAdjustHandles({ kind: "shape", variant: "round" })).toBe(true)
    expect(showsAdjustHandles({ kind: "shape", variant: "rect" })).toBe(false)
    expect(showsAdjustHandles({ kind: "shape", variant: "round", points: "M0 0L100 0L100 100Z" })).toBe(false)
    expect(showsAdjustHandles({ kind: "shape", variant: "rect", geometry: "mathDivide" })).toBe(true)
  })

  it("turns a gallery shape into Word's geometry at the values a handle is dragged to", () => {
    const attrs = { kind: "shape", variant: "round", width: 200, height: 100 }
    const next = adjustedAttrs(attrs, 0, [25, 0])
    expect(next.geometry).toBe("roundRect")
    // A quarter of the width in is half the short side: the end is half round.
    expect(adjustOf(next).adj).toBe(50000)
    expect(geometryPoints(next, 200, 100)).toMatch(/^M/)
    expect(adjustHandlePlaces(next)[0]![0]).toBeCloseTo(25, 0)
  })

  it("places and reads handles on a flipped shape as it is shown", () => {
    const attrs = { kind: "shape", variant: "round", width: 200, height: 100, flipH: true }
    const [place] = adjustHandlePlaces(attrs)
    expect(place![0]).toBeGreaterThan(50)
    expect(adjustOf(adjustedAttrs(attrs, 0, [75, 0])).adj).toBe(50000)
  })

  it("ignores adjust values that are not numbers", () => {
    expect(adjustOf({ adjust: '{"adj":"x","adj2":5}' })).toEqual({ adj2: 5 })
    expect(adjustOf({ adjust: "not json" })).toEqual({})
  })
})
