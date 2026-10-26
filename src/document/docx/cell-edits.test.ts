import { describe, expect, it } from "vitest"
import { emptyChrome } from "@/document/header"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { bordersOf, hexOf, shadingOf } from "@/document/docx/cell-edits"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"

const paragraph = { type: "paragraph", content: [{ type: "text", text: "x" }] }

async function save(attrs: Record<string, unknown>) {
  const cell = { type: "tableCell", attrs: { colspan: 1, rowspan: 1, ...attrs }, content: [paragraph] }
  const saved = await saveDocxBytes({
    json: { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [cell] }] }] },
    chrome: emptyChrome(),
    word: null,
    unchanged: false,
    fileName: "t.docx",
  })
  const pkg = await openPackage(saved.bytes, "t.docx")
  return { bytes: saved.bytes, xml: decodeXml(findPart(pkg, pkg.mainPartName)!.data) }
}

describe("cell fill and borders in .docx", () => {
  it("reads CSS colours", () => {
    expect(hexOf("#0f6cbd")).toBe("0F6CBD")
    expect(hexOf("#abc")).toBe("AABBCC")
    expect(hexOf("rgb(255, 0, 16)")).toBe("FF0010")
    expect(hexOf("red")).toBeUndefined()
    expect(shadingOf(null)).toBeUndefined()
  })

  it("maps a pen to w:sz in eighths of a point", () => {
    expect(bordersOf("top", "2px dashed #ff0000")?.top).toEqual({ value: "dashed", sz: 12, space: 0, color: "FF0000" })
    expect(bordersOf("none", null)?.left).toEqual({ value: "nil" })
    expect(Object.keys(bordersOf("top left", "1px solid #000000")!)).toEqual(["top", "left"])
  })

  it("writes a cell's fill as w:shd", async () => {
    const { xml } = await save({ backgroundColor: "#ffeb9c" })
    expect(xml).toContain('<w:shd w:val="clear" w:color="auto" w:fill="FFEB9C"/>')
  })

  it("writes the sides drawn as w:tcBorders before the shading, and opens them again", async () => {
    const { bytes, xml } = await save({
      backgroundColor: "#ffeb9c",
      borders: "top bottom",
      borderPen: "2px solid #ff0000",
    })
    expect(xml).toContain('<w:tcBorders><w:top w:val="single" w:sz="12" w:space="0" w:color="FF0000"/>')
    expect(/<w:tcBorders>.*<\/w:tcBorders>/.exec(xml)?.[0]).not.toContain("<w:left ")
    expect(xml.indexOf("<w:tcBorders>")).toBeLessThan(xml.indexOf("<w:shd "))
    const { view } = await openDocxBytes(bytes, "t.docx")
    expect(view.html).toContain("border-top: 1.5pt solid #FF0000")
  })

  it("writes a cell's diagonals as w:tl2br and w:tr2bl after its sides, and draws them when opened again", async () => {
    expect(Object.keys(bordersOf("top diagDown diagUp", "1px solid #000000")!)).toEqual(["top", "tl2br", "tr2bl"])
    expect(Object.keys(bordersOf("diagUp", "1px solid #000000")!)).toEqual(["tr2bl"])
    const { bytes, xml } = await save({ borders: "bottom diagDown", borderPen: "2px solid #ff0000" })
    const box = /<w:tcBorders>.*<\/w:tcBorders>/.exec(xml)?.[0] ?? ""
    expect(box).toContain('<w:tl2br w:val="single" w:sz="12" w:space="0" w:color="FF0000"/>')
    expect(box.indexOf("<w:bottom ")).toBeLessThan(box.indexOf("<w:tl2br "))
    expect(box).not.toContain("<w:tr2bl")
    const { view } = await openDocxBytes(bytes, "t.docx")
    expect(view.html).toContain("linear-gradient(to top right")
    expect(view.html).not.toContain("to top left")
  })

  it("writes a cell's pattern in its colour over the fill as w:shd, and draws it when opened again (22.4)", async () => {
    const { bytes, xml } = await save({ backgroundColor: "#ffff00", shadingPattern: "diagStripe #c00000" })
    expect(xml).toContain('<w:shd w:val="diagStripe" w:color="C00000" w:fill="FFFF00"/>')
    expect((await save({ shadingPattern: "pct25" })).xml).toContain(
      '<w:shd w:val="pct25" w:color="auto" w:fill="auto"/>',
    )
    const { view } = await openDocxBytes(bytes, "t.docx")
    expect(view.html).toContain("background-color: #FFFF00")
    expect(view.html).toContain("repeating-linear-gradient(-45deg, #c00000")
  })

  it("leaves a plain cell without either", async () => {
    const { xml } = await save({})
    expect(xml).not.toContain("<w:tcBorders")
    expect(xml).not.toContain("<w:shd")
  })
})
