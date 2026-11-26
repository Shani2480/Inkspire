import { describe, expect, it } from "vitest"
import { widowSafeCut } from "@/editor/pages"
import { hairlineVariables } from "@/editor/table-tools"

describe("a row breaking across pages", () => {
  const paragraph = (attrs: Record<string, string> = { "data-widow": "1" }) => {
    const element = document.createElement("p")
    for (const [name, value] of Object.entries(attrs)) {
      element.setAttribute(name, value)
    }
    return element
  }

  it("moves a two-line paragraph whole rather than leave one line on each page (Word's widow control)", () => {
    const block = paragraph()
    const lines = [{ block }, { block }]
    expect(widowSafeCut(lines, 1)).toBe(0)
  })

  it("keeps two lines together at the top of the next page", () => {
    const block = paragraph()
    const lines = [{ block }, { block }, { block }, { block }]
    // The page holds three: the last line would go on alone, so the third goes with it.
    expect(widowSafeCut(lines, 3)).toBe(2)
  })

  it("breaks where the page ends when widow control is off", () => {
    const block = paragraph({})
    expect(widowSafeCut([{ block }, { block }], 1)).toBe(1)
  })
})

describe("a cell's hairline borders", () => {
  it("are given as pixels for the stylesheet to take out of the cell's margins", () => {
    const attributes = hairlineVariables({
      style: "border-top: 0.25pt solid #CCCCCC; border-bottom: 0.25pt solid #CCCCCC; padding: 0.16cm 0.23cm",
    })
    expect(attributes.style).toContain("--cell-bt: 0.333px")
    expect(attributes.style).toContain("--cell-bb: 0.333px")
  })

  it("gives every width, so a 1 pt line the screen draws 1 px gets its third of a pixel back", () => {
    const attributes = hairlineVariables({
      style: "border-top: 1pt solid #000000; border-bottom-style: none; padding: 4pt",
    })
    expect(attributes.style).toContain("--cell-bt: 1.333px")
    // A side set to none is none, whatever the table's lines.
    expect(attributes.style).toContain("--cell-bb: 0px")
  })

  it("leaves a cell without borders of its own to the table's lines", () => {
    const style = "padding: 4pt"
    expect(hairlineVariables({ style }).style).toBe(style)
  })

  it("are 1/8 pt where Word wrote w:sz=1 (Word draws them that thin)", () => {
    const attributes = hairlineVariables({ style: "border-top: 0.125pt solid #CCCCCC; padding: 4pt" })
    expect(attributes.style).toContain("--cell-bt: 0.167px")
  })
})

describe("a Word cell's margins", () => {
  it("are drawn as Word wrote them, not rounded to a hundredth of a centimetre", () => {
    const attributes = hairlineVariables({
      "data-word-cell": "padding-top: 4.5pt; padding-left: 6.5pt; padding-bottom: 4.5pt; padding-right: 6.5pt",
      "data-cell-margins": "0.16,0.16,0.23,0.23",
      style: "padding: 0.16cm 0.23cm; --cell-top: 0.16cm; --cell-bottom: 0.16cm",
    })
    expect(attributes.style).toMatch(
      /padding-top: 4\.5pt; padding-bottom: 4\.5pt; .*--cell-top: 4\.5pt; --cell-bottom: 4\.5pt$/,
    )
  })

  it("stay as set in the app once changed there", () => {
    const style = "padding: 0.3cm 0.23cm; --cell-top: 0.3cm; --cell-bottom: 0.3cm"
    const attributes = hairlineVariables({
      "data-word-cell": "padding-top: 4.5pt; padding-left: 6.5pt; padding-bottom: 4.5pt; padding-right: 6.5pt",
      "data-cell-margins": "0.3,0.3,0.23,0.23",
      style,
    })
    expect(attributes.style).toBe(style)
  })
})
