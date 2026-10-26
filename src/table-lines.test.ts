import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const css = readFileSync("src/index.css", "utf8")

function token(name: string) {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)
  expect(match, name).not.toBeNull()
  return match![1]
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

describe("table line contrast (21.43)", () => {
  const page = "#ffffff"

  it("keeps the default grid faint and an explicit border strong, on the white page", () => {
    expect(contrast(token("table-default-line"), page)).toBeLessThan(1.3)
    expect(contrast(token("table-gridline"), page)).toBeLessThan(1.4)
    expect(contrast(token("table-explicit-line"), page)).toBeGreaterThan(7)
  })

  it("tells a drawn border from the default at a glance", () => {
    expect(contrast(token("table-explicit-line"), token("table-default-line"))).toBeGreaterThan(6)
  })

  it("draws the default cell border and the drawn borders from those tokens", () => {
    expect(css).toContain("border: 1px solid var(--table-default-line)")
    // Each side may have a pen of its own (22.4 Grid); otherwise the cell's pen, otherwise the token.
    expect(css).toContain(
      "border-top: var(--cell-border-top, var(--cell-border, 1px solid var(--table-explicit-line))) !important",
    )
    expect(css).not.toContain("border: 1px solid #d4d4d8;\n  padding: 0.4em")
  })

  it("draws View Gridlines under the cell borders, so a drawn line hides the guide", () => {
    const rule = (selector: string) => css.slice(css.indexOf(`${selector} {`)).split("}")[0]
    expect(rule('.page-editor table[data-gridlines="1"]')).toContain("isolation: isolate")
    const guide = rule('.page-editor table[data-gridlines="1"] :is(td, th)::before')
    expect(guide).toContain("z-index: -1")
    expect(guide).toContain("border: 1px dashed var(--table-gridline)")
    expect(css).not.toContain("outline: 1px dashed var(--table-gridline)")
  })
})
