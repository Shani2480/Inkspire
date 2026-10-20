import { afterEach, describe, expect, it } from "vitest"
import { BUILT_IN_EQUATIONS, equationToText, loadSavedEquations, saveEquation } from "@/editor/equation-gallery"

afterEach(() => localStorage.clear())

describe("Equation gallery (22.2)", () => {
  it("has Word's built-in equations", () => {
    expect(BUILT_IN_EQUATIONS.map((item) => item.label)).toEqual(
      expect.arrayContaining(["Area of Circle", "Binomial Theorem", "Fourier Series", "Pythagorean Theorem"]),
    )
  })

  it("keeps the user's equations, replacing one saved under the same name", () => {
    expect(loadSavedEquations()).toEqual([])
    saveEquation("Mine", "x=1")
    saveEquation("Other", "y=2")
    expect(saveEquation(" Mine ", "x=3").map((item) => `${item.label}:${item.tex}`)).toEqual(["Other:y=2", "Mine:x=3"])
    expect(loadSavedEquations()).toHaveLength(2)
    localStorage.setItem("aiword.equation-gallery", "not json")
    expect(loadSavedEquations()).toEqual([])
  })

  it("converts an equation to Unicode, LaTeX or plain text", () => {
    expect(equationToText("A=\\pi r^{2}", "latex")).toBe("A=\\pi r^{2}")
    expect(equationToText("A=\\pi r^{2}", "unicode")).toBe("A=π r^2")
    expect(equationToText("x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}", "unicode")).toBe("x=(-b±√(b^2-4ac))/(2a)")
    expect(equationToText("\\sin\\left(x\\right)", "text")).toBe("sin(x)")
  })
})

describe("built-in equations convert (22.2)", () => {
  it("turns every built-in into text without leftover braces or commands", () => {
    for (const item of BUILT_IN_EQUATIONS) {
      expect(equationToText(item.tex, "unicode")).not.toMatch(/[{}\\]/)
    }
  })
})
