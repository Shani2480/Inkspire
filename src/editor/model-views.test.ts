import { describe, expect, it } from "vitest"
import {
  MODEL_VIEWS,
  facingPose,
  matrixPose,
  poseMatrix,
  registerViewSource,
  viewPose,
  viewSourceFor,
} from "@/editor/model-views"

const ROUND = (value: number) => Math.round(value * 1000) / 1000 + 0
const apply = (m: number[][], v: number[]) =>
  m.map((row) => ROUND(row.reduce((sum, value, k) => sum + value * v[k], 0)))
const view = (name: string) => MODEL_VIEWS.find((item) => item.name === name)!

describe("model views", () => {
  it("lists Word's named views once each", () => {
    const names = MODEL_VIEWS.map((item) => item.name)
    expect(names.slice(0, 6)).toEqual(["Front", "Back", "Left", "Right", "Top", "Bottom"])
    expect(new Set(names).size).toBe(names.length)
  })

  it("faces the front to a camera above and to the side", () => {
    const toward = [ROUND(Math.SQRT1_2), ROUND(Math.SQRT1_2), 0]
    expect(apply(poseMatrix(facingPose({ x: 3, y: 3, z: 0 })), [0, 0, 1])).toEqual(toward)
  })

  it("brings each named side square to the camera", () => {
    const camera = { x: 3, y: 3, z: 0 }
    const toward = [ROUND(Math.SQRT1_2), ROUND(Math.SQRT1_2), 0]
    const sides: [string, number[]][] = [
      ["Front", [0, 0, 1]],
      ["Back", [0, 0, -1]],
      ["Left", [-1, 0, 0]],
      ["Right", [1, 0, 0]],
      ["Top", [0, 1, 0]],
      ["Bottom", [0, -1, 0]],
    ]
    for (const [name, side] of sides) {
      expect(apply(poseMatrix(viewPose(view(name), camera)), side), name).toEqual(toward)
    }
  })

  it("keeps the model upright in the side views", () => {
    const camera = { x: 0, y: 0, z: 3 }
    for (const name of ["Front", "Back", "Left", "Right"]) {
      expect(apply(poseMatrix(viewPose(view(name), camera)), [0, 1, 0]), name).toEqual([0, 1, 0])
    }
  })

  it("reads a turn back as the same pose", () => {
    const pose = { yaw: 0.7, pitch: -0.4, roll: 0.3 }
    const back = matrixPose(poseMatrix(pose))
    expect([back.yaw, back.pitch, back.roll].map(ROUND)).toEqual([0.7, -0.4, 0.3])
  })

  it("finds a viewer by its node view and forgets it when it stops", () => {
    const dom = document.createElement("div")
    const source = { camera: () => ({ x: 0, y: 0, z: 1 }), pictures: () => null }
    registerViewSource(dom, source)
    expect(viewSourceFor(dom)).toBe(source)
    registerViewSource(dom, null)
    expect(viewSourceFor(dom)).toBeNull()
    expect(viewSourceFor(null)).toBeNull()
  })
})
