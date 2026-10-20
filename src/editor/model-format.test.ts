import { describe, expect, it } from "vitest"
import { DEFAULT_MODEL_FORMAT, lightPosition, modelFormat } from "@/editor/model-format"

describe("3D model format", () => {
  it("keeps valid settings and resets the rest", () => {
    expect(modelFormat({})).toEqual(DEFAULT_MODEL_FORMAT)
    const format = modelFormat({
      color: "#C00000",
      colorMode: "replace",
      material: "metal",
      lighting: "warm",
      intensity: 500,
      direction: "90",
      elevation: -90,
      texture: "marble",
      textureScale: 0,
    })
    expect(format).toMatchObject({ color: "#C00000", colorMode: "replace", material: "metal", lighting: "warm" })
    expect(format).toMatchObject({
      intensity: 200,
      direction: 90,
      elevation: -30,
      texture: "marble",
      textureScale: 0.25,
    })
    expect(modelFormat({ color: "red", material: "chrome", texture: "javascript:x" })).toMatchObject({
      color: "",
      material: "standard",
      texture: "",
    })
    expect(modelFormat({ texture: "data:image/png;base64,AAA" }).texture).toBe("data:image/png;base64,AAA")
  })

  it("places the main light from its direction and height", () => {
    const front = lightPosition(0, 0)
    expect(front.z).toBeCloseTo(5)
    expect(front.x).toBeCloseTo(0)
    const right = lightPosition(90, 0)
    expect(right.x).toBeCloseTo(5)
    expect(lightPosition(0, 90).y).toBeCloseTo(5)
  })
})
