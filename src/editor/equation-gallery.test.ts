import { afterEach, describe, expect, it } from "vitest"
import {
  BUILT_IN_EQUATIONS,
  equationToText,
  loadSavedEquations,
  saveEquation,
  texFromLinear,
} from "@/editor/equation-gallery"

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

describe("linear text to an equation", () => {
  it("builds up scripts, fractions and roots, dropping brackets that only group", () => {
    expect(texFromLinear("a^2+b^2=c^2")).toBe("a^{2}+b^{2}=c^{2}")
    expect(texFromLinear("x_(i+1)")).toBe("x_{i+1}")
    expect(texFromLinear("(a+b)/2")).toBe("\\frac{a+b}{2}")
    expect(texFromLinear("nx/1!")).toBe("\\frac{nx}{1!}")
    expect(texFromLinear("√(x+1)")).toBe("\\sqrt{x+1}")
    expect(texFromLinear("x=(-b±√(b^2-4ac))/(2a)")).toBe("x=\\frac{-b\\pm \\sqrt{b^{2}-4ac}}{2a}")
  })

  it("keeps brackets that are part of the equation, and symbols as their commands", () => {
    expect(texFromLinear("f(x)=πr²")).toBe("f\\left( x \\right) =\\pi r^{2}")
    expect(texFromLinear("α≤β")).toBe("\\alpha \\leq \\beta")
  })

  it("takes text with a backslash as LaTeX", () => {
    expect(texFromLinear("\\frac{1}{2}")).toBe("\\frac{1}{2}")
  })

  it("is the way back from Convert's Unicode text", () => {
    for (const { tex } of BUILT_IN_EQUATIONS.filter((item) => item.label === "Pythagorean Theorem")) {
      expect(texFromLinear(equationToText(tex, "unicode"))).toBe(tex)
    }
  })
})
