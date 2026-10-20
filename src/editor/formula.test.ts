import { describe, expect, it } from "vitest"
import { evaluateFormula, evaluateIf } from "@/editor/formula"

describe("evaluateFormula", () => {
  it("evaluates arithmetic and precedence", () => {
    expect(evaluateFormula("2 + 2")).toEqual({ ok: true, value: "4" })
    expect(evaluateFormula("= 10 - 3")).toEqual({ ok: true, value: "7" })
    expect(evaluateFormula("2 + 3 * 4")).toEqual({ ok: true, value: "14" })
    expect(evaluateFormula("(2 + 3) * 4")).toEqual({ ok: true, value: "20" })
    expect(evaluateFormula("10 / 4")).toEqual({ ok: true, value: "2.5" })
    expect(evaluateFormula("-3 + 5")).toEqual({ ok: true, value: "2" })
  })

  it("returns errors for empty, invalid, and divide-by-zero", () => {
    expect(evaluateFormula("")).toEqual({ ok: false, error: "Empty formula" })
    expect(evaluateFormula("   ")).toEqual({ ok: false, error: "Empty formula" })
    expect(evaluateFormula("2 + foo")).toEqual({ ok: false, error: "Invalid formula" })
    expect(evaluateFormula("2 +")).toEqual({ ok: false, error: "Invalid formula" })
    expect(evaluateFormula("(1 + 2")).toEqual({ ok: false, error: "Invalid formula" })
    expect(evaluateFormula("1 / 0")).toEqual({ ok: false, error: "Cannot divide by zero" })
  })
})

describe("evaluateIf", () => {
  it("compares numbers and text", () => {
    expect(evaluateIf("2", ">", "1", "yes", "no")).toEqual({ ok: true, value: "yes" })
    expect(evaluateIf("2", "≤", "1", "yes", "no")).toEqual({ ok: true, value: "no" })
    expect(evaluateIf("alpha", "=", "alpha", "match", "miss")).toEqual({ ok: true, value: "match" })
    expect(evaluateIf("alpha", "≠", "beta", "diff", "same")).toEqual({ ok: true, value: "diff" })
  })

  it("rejects invalid comparisons", () => {
    expect(evaluateIf("a", ">", "b", "yes", "no")).toEqual({ ok: false, error: "Invalid comparison" })
    expect(evaluateIf("1", "??", "2", "yes", "no")).toEqual({ ok: false, error: "Invalid comparison" })
  })
})
