import { describe, expect, it } from "vitest"
import { SHADING_PATTERNS, patternImage, patternOf, patternValue } from "@/document/docx/shading-pattern"

describe("shading patterns (22.4)", () => {
  it("lists Word's patterns in the dialog's order", () => {
    expect(SHADING_PATTERNS).toHaveLength(37)
    expect(SHADING_PATTERNS.slice(0, 3).map((pattern) => pattern.label)).toEqual(["Clear", "Solid (100%)", "5%"])
    expect(SHADING_PATTERNS.find((pattern) => pattern.value === "pct12")?.label).toBe("12.5%")
    expect(SHADING_PATTERNS.at(-1)).toEqual({ value: "thinDiagCross", label: "Lt Trellis" })
  })

  it("keeps a pattern with its colour, and Clear as nothing", () => {
    expect(patternValue("pct25", "#C00000")).toBe("pct25 #c00000")
    expect(patternValue("horzStripe", null)).toBe("horzStripe")
    expect(patternValue("clear", "#c00000")).toBeNull()
    expect(patternOf("pct25 #c00000")).toEqual({ pattern: "pct25", color: "#c00000" })
    expect(patternOf("nil")).toBeNull()
    expect(patternOf(null)).toBeNull()
  })

  it("draws a share of the colour, or stripes of it", () => {
    expect(patternImage("pct12 #ff0000")).toContain("color-mix(in srgb, #ff0000 12.5%, transparent)")
    expect(patternImage("solid")).toContain("#000000 100%")
    expect(patternImage("horzStripe")).toBe("repeating-linear-gradient(to bottom, #000000 0 2px, transparent 2px 4px)")
    expect(patternImage("thinDiagCross")?.match(/repeating-linear-gradient/g)).toHaveLength(2)
    expect(patternImage("thinDiagCross")).toContain("#000000 0 1px")
    expect(patternImage("clear")).toBeNull()
  })
})
