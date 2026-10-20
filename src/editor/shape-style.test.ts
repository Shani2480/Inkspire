import { describe, expect, it } from "vitest"
import { cssGradient, dashArray, effectStyle, shade, themeStyle, THEME_ACCENTS } from "@/editor/shape-style"

describe("shape style", () => {
  it("lightens toward white and darkens toward black", () => {
    expect(shade("#4472c4", 1)).toBe("#ffffff")
    expect(shade("#4472c4", -1)).toBe("#000000")
    expect(shade("#4472c4", 0)).toBe("#4472c4")
    expect(shade("not a colour", 0.5)).toBe("not a colour")
  })

  it("scales a dash pattern with the line width", () => {
    expect(dashArray("dash", 2)).toBe("8 6")
    expect(dashArray("", 2)).toBe("")
  })

  it("gives each theme style its look and clears what it does not set", () => {
    const intense = themeStyle(THEME_ACCENTS[1]!, "intense")
    expect(intense).toMatchObject({
      fill: "#4472c4",
      fillGradient: "dark-down",
      bevel: "circle",
      shapeStyle: "accent1-intense",
    })
    const outline = themeStyle(THEME_ACCENTS[2]!, "outline")
    expect(outline).toMatchObject({ fill: "#ffffff", stroke: "#ed7d31", bevel: "", shadow: "" })
  })

  it("draws effects as CSS, reading an old shape's shadow", () => {
    expect(effectStyle({ effect: "shadow" }).filter).toContain("drop-shadow(3px 3px")
    expect(effectStyle({ glow: "#ffc000:8" }).filter).toContain("#ffc000")
    expect(effectStyle({ rot3d: "perspective-front" }).transform).toContain("perspective")
    expect(effectStyle({}).filter).toBe("")
  })

  it("turns a gradient choice into CSS", () => {
    expect(cssGradient("#4472c4", "light-down")).toMatch(/^linear-gradient\(180deg/)
    expect(cssGradient("#4472c4", "dark-radial")).toMatch(/^radial-gradient/)
  })
})
