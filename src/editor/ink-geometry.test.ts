import { describe, expect, it } from "vitest"
import {
  distanceToRuler,
  insidePolygon,
  lassoPicks,
  movePath,
  pathPoints,
  snapToRuler,
  strokeHit,
  strokesBox,
} from "@/editor/ink-geometry"
import { DEFAULT_PENS, activePen, parseStrokes, useDrawStore } from "@/editor/drawing"

const square = (x: number, y: number) => `M ${x} ${y} Q ${x + 10} ${y} ${x + 10} ${y + 10} ${x} ${y + 10} Z`

describe("Ink on a drawing canvas", () => {
  it("reads and moves a stroke's outline", () => {
    expect(pathPoints(square(0, 0))).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ])
    expect(movePath("M 1 2 Q 3 4 5 6 Z", 10, -1)).toBe("M 11 1 Q 13 3 15 5 Z")
    expect(strokesBox([{ d: square(5, 5) }])).toEqual({ x: 5, y: 5, width: 10, height: 10 })
  })

  it("finds the strokes the eraser touches, by their line or their outline", () => {
    const line = {
      d: "M 0 0 Z",
      points: [
        [0, 50],
        [100, 50],
      ],
    }
    expect(strokeHit(line, 50, 54, 6)).toBe(true)
    expect(strokeHit(line, 50, 70, 6)).toBe(false)
    // An older stroke without points: inside its outline.
    expect(strokeHit({ d: square(0, 0) }, 5, 5, 1)).toBe(true)
    expect(strokeHit({ d: square(0, 0) }, 40, 40, 1)).toBe(false)
  })

  it("holds the strokes inside the lasso", () => {
    const lasso = [
      [0, 0],
      [50, 0],
      [50, 50],
      [0, 50],
    ]
    expect(insidePolygon(25, 25, lasso)).toBe(true)
    const picks = lassoPicks([{ d: square(10, 10) }, { d: square(45, 45) }, { d: square(100, 100) }], lasso)
    expect(picks).toEqual([0])
  })

  it("lays a stroke begun at the Ruler's edge along it, and leaves others as drawn", () => {
    const ruler = { x: 0, y: 100, angle: 0 }
    const drawn = [
      [10, 104, 0.5, 0],
      [60, 97, 0.5, 30],
      [120, 108, 0.5, 60],
    ]
    expect(snapToRuler(drawn, ruler)).toEqual([
      [10, 100, 0.5, 0],
      [60, 100, 0.5, 30],
      [120, 100, 0.5, 60],
    ])
    const far = [
      [10, 40],
      [60, 45],
    ]
    expect(snapToRuler(far, ruler)).toBe(far)
    const turned = { x: 0, y: 0, angle: 45 }
    expect(distanceToRuler(turned, 10, 10)).toBeCloseTo(0)
    const [first] = snapToRuler([[11, 9]], turned)
    expect(first![0]).toBeCloseTo(10)
    expect(first![1]).toBeCloseTo(10)
  })

  it("keeps a stroke's points and reads pencil strokes", () => {
    const strokes = parseStrokes(
      JSON.stringify([
        { tool: "pencil", widthMm: 1, color: "#7f7f7f", d: "M 1 1 Z", points: [[1, 1, 0.5, 0]] },
        { tool: "pen", widthMm: 0.5, color: "#000", d: "M 2 2 Z", points: "broken" },
      ]),
    )
    expect(strokes[0]).toMatchObject({ tool: "pencil", points: [[1, 1, 0.5, 0]] })
    expect(strokes[1]!.points).toBeUndefined()
  })
})

describe("The Draw tab's pens", () => {
  it("starts with Word's pens, adds, changes and removes one, and keeps Pen and Highlighter working", () => {
    localStorage.clear()
    useDrawStore.setState({ pens: DEFAULT_PENS.map((pen) => ({ ...pen })), penId: DEFAULT_PENS[0]!.id, tool: "select" })
    const store = useDrawStore.getState()
    expect(store.pens.map((pen) => pen.kind)).toEqual(["pen", "pen", "pencil", "highlighter"])
    store.setTool("highlighter")
    expect(activePen(useDrawStore.getState()).kind).toBe("highlighter")
    store.addPen("pencil")
    const added = activePen(useDrawStore.getState())
    expect(added.kind).toBe("pencil")
    expect(useDrawStore.getState().tool).toBe("pencil")
    store.updatePen(added.id, { color: "#0070c0", widthMm: 2 })
    expect(activePen(useDrawStore.getState())).toMatchObject({ color: "#0070c0", widthMm: 2 })
    expect(JSON.parse(localStorage.getItem("inkspire:pens")!)).toHaveLength(5)
    store.removePen(added.id)
    expect(useDrawStore.getState().pens).toHaveLength(4)
    expect(useDrawStore.getState().pens.some((pen) => pen.id === added.id)).toBe(false)
  })
})
