import { describe, expect, it } from "vitest"
import katex from "katex"
import {
  allEquationItems,
  appendTemplate,
  applyTemplate,
  EQUATION_STRUCTURES,
  EQUATION_SYMBOLS,
  texFromTyped,
} from "@/editor/equation-templates"

describe("equation templates (21.23)", () => {
  it("fills the first place with the selection and selects it when empty", () => {
    const filled = applyTemplate("x+y", 2, 3, "\\frac{#1}{#2}")
    expect(filled.tex).toBe("x+\\frac{y}{}")
    expect(filled.tex.slice(filled.start, filled.end)).toBe("y")
    const empty = applyTemplate("a=", 2, 2, "\\sqrt{#1}")
    expect(empty.tex).toBe("a=\\sqrt{}")
    expect(empty.start).toBe(empty.end)
    expect(empty.tex.slice(0, empty.start)).toBe("a=\\sqrt{")
  })

  it("puts the lowest-numbered place first even when it is not first in the text", () => {
    const filled = applyTemplate("n", 0, 1, "\\sqrt[#2]{#1}")
    expect(filled.tex).toBe("\\sqrt[]{n}")
    expect(filled.tex.slice(filled.start, filled.end)).toBe("n")
  })

  it("appends a template at the end", () => {
    expect(appendTemplate("x=", "\\frac{#1}{#2}")).toBe("x=\\frac{}{}")
  })

  it("every structure and symbol is valid LaTeX that KaTeX renders", () => {
    for (const item of allEquationItems()) {
      const tex = item.tex.replace(/#\d/g, "x")
      expect(() => katex.renderToString(tex, { throwOnError: true }), item.label).not.toThrow()
    }
    expect(EQUATION_STRUCTURES.length).toBeGreaterThan(5)
    expect(EQUATION_SYMBOLS.length).toBeGreaterThan(2)
  })

  it("turns typed unicode math into LaTeX", () => {
    expect(texFromTyped("α≤β")).toBe("\\alpha \\leq \\beta ")
    expect(texFromTyped("√x+y²")).toBe("\\sqrt{x}+y^{2}")
    expect(texFromTyped("\\frac{1}{2}")).toBe("\\frac{1}{2}")
  })
})
