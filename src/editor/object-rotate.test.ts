import { describe, expect, it } from "vitest"
import { normalizeDegrees, rotatedBounds, snapDegrees } from "./object-rotate"

describe("rotation", () => {
  it("snaps to 1° or, with Shift, 15° steps and keeps the angle within ±180°", () => {
    expect(snapDegrees(52.4, 1)).toBe(52)
    expect(snapDegrees(52.4, 15)).toBe(45)
    expect(normalizeDegrees(270)).toBe(-90)
    expect(normalizeDegrees(-360)).toBe(0)
  })

  it("finds the upright box a turned object covers", () => {
    const quarter = rotatedBounds(200, 100, 90)
    expect(Math.round(quarter.width)).toBe(100)
    expect(Math.round(quarter.height)).toBe(200)
    expect(Math.round(quarter.dy)).toBe(-50)
    expect(Math.round(rotatedBounds(100, 100, 45).width)).toBe(141)
    expect(rotatedBounds(200, 100, 0)).toMatchObject({ width: 200, height: 100, dx: 0, dy: 0 })
  })
})
