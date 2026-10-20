import { describe, expect, it } from "vitest"
import { emptyChrome } from "@/document/header"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"

const paragraph = { type: "paragraph", content: [{ type: "text", text: "x" }] }
const cell = { type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [paragraph] }

async function save(attrs: Record<string, unknown>, row: Record<string, unknown> = {}, cellAttrs = {}) {
  const shown = { ...cell, attrs: { ...cell.attrs, ...cellAttrs } }
  const saved = await saveDocxBytes({
    json: {
      type: "doc",
      content: [{ type: "table", attrs, content: [{ type: "tableRow", attrs: row, content: [shown] }] }],
    },
    chrome: emptyChrome(),
    word: null,
    unchanged: false,
    fileName: "t.docx",
  })
  const pkg = await openPackage(saved.bytes, "t.docx")
  return { bytes: saved.bytes, xml: decodeXml(findPart(pkg, pkg.mainPartName)!.data) }
}

describe("table alignment and alt text in .docx (22.10)", () => {
  it("writes w:jc, w:tblCaption and w:tblDescription in schema order, and opens them again", async () => {
    const { bytes, xml } = await save({ align: "center", altTitle: "Sales", altDesc: "Sales by region & year" })
    const tblPr = /<w:tblPr>.*?<\/w:tblPr>/.exec(xml)?.[0] ?? ""
    expect(tblPr).toContain('<w:jc w:val="center"/>')
    expect(tblPr).toContain('<w:tblCaption w:val="Sales"/>')
    expect(tblPr).toContain('<w:tblDescription w:val="Sales by region &amp; year"/>')
    expect(tblPr.indexOf("<w:jc ")).toBeLessThan(tblPr.indexOf("<w:tblCaption"))
    expect(tblPr.indexOf("<w:tblCaption")).toBeLessThan(tblPr.indexOf("<w:tblDescription"))
    const { view } = await openDocxBytes(bytes, "t.docx")
    expect(view.html).toContain('data-align="center"')
    expect(view.html).toContain('data-alt-title="Sales"')
    expect(view.html).toContain('data-alt-desc="Sales by region &amp; year"')
  })

  it("writes nothing for a left-aligned table without alt text", async () => {
    const { xml } = await save({})
    const tblPr = /<w:tblPr>.*?<\/w:tblPr>/.exec(xml)?.[0] ?? ""
    expect(tblPr).not.toContain("<w:jc ")
    expect(tblPr).not.toContain("tblCaption")
    expect(tblPr).not.toContain("tblDescription")
  })

  it("writes a row's height, a repeated header row and a cell's vertical alignment, and opens them again", async () => {
    const { bytes, xml } = await save({ headerRow: true }, { height: 96 }, { valign: "middle" })
    expect(xml).toContain('<w:trPr><w:trHeight w:val="1440"/><w:tblHeader/></w:trPr>')
    expect(xml).toContain('<w:vAlign w:val="center"/>')
    const { view } = await openDocxBytes(bytes, "t.docx")
    expect(view.html).toContain("height: 96px")
    expect(view.html).toContain('data-valign="middle"')
  })

  it("writes none of them for a plain table", async () => {
    const { xml } = await save({})
    expect(xml).not.toContain("trHeight")
    expect(xml).not.toContain("tblHeader")
    expect(xml).not.toContain("vAlign")
  })
})
