import { describe, expect, it } from "vitest"
import { SCENE_SECONDS, modelScene, scenePose } from "@/editor/model-scenes"

describe("3D model scenes (22.15)", () => {
  it("turntable completes a full turn each pass", () => {
    expect(scenePose("turntable", 0).yaw).toBe(0)
    expect(scenePose("turntable", SCENE_SECONDS / 2).yaw).toBeCloseTo(Math.PI)
  })

  it("arrive ends at rest and leave ends gone", () => {
    const arrived = scenePose("arrive", SCENE_SECONDS * 2)
    expect(arrived.scale).toBe(1)
    expect(arrived.opacity).toBe(1)
    expect(scenePose("leave", SCENE_SECONDS * 2).opacity).toBe(0)
  })

  it("jump lifts and comes back down", () => {
    expect(scenePose("jump", SCENE_SECONDS / 4).lift).toBeGreaterThan(0.3)
    expect(scenePose("jump", 0).lift).toBe(0)
  })

  it("no scene is the model at rest, and unknown names mean no scene", () => {
    expect(scenePose("", 3)).toEqual({ yaw: 0, lift: 0, scale: 1, opacity: 1 })
    expect(modelScene("spin")).toBe("")
    expect(modelScene("swing")).toBe("swing")
  })
})
