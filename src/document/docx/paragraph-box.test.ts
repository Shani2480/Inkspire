import { describe, expect, it } from "vitest"
import { emptyChrome } from "@/document/header"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"

async function save(attrs: Record<string, unknown>) {
  const saved = await saveDocxBytes({
    json: { type: "doc", content: [{ type: "paragraph", attrs, content: [{ type: "text", text: "x" }] }] },
    chrome: emptyChrome(),
    word: null,
    unchanged: false,
    fileName: "t.docx",
  })
  const pkg = await openPackage(saved.bytes, "t.docx")
  return { bytes: saved.bytes, xml: decodeXml(findPart(pkg, pkg.mainPartName)!.data) }
}

describe("paragraph borders and fill in .docx (21.30)", () => {
  it("writes a bottom border as w:pBdr before the shading and the spacing, and opens it again", async () => {
    const { bytes, xml } = await save({ border: "bottom", shading: "#ffeb9c", spaceAfter: 6 })
    const pPr = /<w:pPr>.*?<\/w:pPr>/.exec(xml)?.[0] ?? ""
    expect(pPr).toContain('<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="1C1C1C"/></w:pBdr>')
    expect(pPr).toContain('<w:shd w:val="clear" w:color="auto" w:fill="FFEB9C"/>')
    expect(pPr.indexOf("<w:pBdr>")).toBeLessThan(pPr.indexOf("<w:shd "))
    expect(pPr.indexOf("<w:shd ")).toBeLessThan(pPr.indexOf("<w:spacing "))
    const { view } = await openDocxBytes(bytes, "t.docx")
    expect(view.html).toContain('data-border="bottom"')
    expect(view.html).toContain("background-color: #ffeb9c")
  })

  it("writes all four sides, or a comma list, and nothing for a plain paragraph", async () => {
    const all = await save({ border: "all" })
    expect(["top", "left", "bottom", "right"].every((side) => all.xml.includes(`<w:${side} w:val="single"`))).toBe(true)
    const two = await save({ border: "top,bottom" })
    expect(two.xml).toContain("<w:top ")
    expect(two.xml).not.toContain("<w:left ")
    const plain = await save({})
    expect(plain.xml).not.toContain("<w:pBdr")
    expect(plain.xml).not.toContain("<w:shd")
  })

  it("accepts the browser's rgb() form of a fill", async () => {
    const { xml } = await save({ shading: "rgb(255, 235, 156)" })
    expect(xml).toContain('w:fill="FFEB9C"')
  })

  it("writes the formatting exceptions in schema order, and opens them again (22.8)", async () => {
    const { bytes, xml } = await save({
      suppressLineNumbers: true,
      dontHyphenate: true,
      mirrorIndents: true,
      tightWrap: "firstLineOnly",
      keepNext: true,
      shading: "#ffeb9c",
      textAlign: "center",
    })
    const pPr = /<w:pPr>.*?<\/w:pPr>/.exec(xml)?.[0] ?? ""
    const order = [
      "keepNext",
      "suppressLineNumbers",
      "shd",
      "suppressAutoHyphens",
      "mirrorIndents",
      "jc",
      "textboxTightWrap",
    ].map((name) => pPr.indexOf(`<w:${name}`))
    expect(order.every((at) => at >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(pPr).toContain('<w:textboxTightWrap w:val="firstLineOnly"/>')
    const { view } = await openDocxBytes(bytes, "t.docx")
    for (const token of [
      'data-suppress-lines="1"',
      'data-no-hyphen="1"',
      'data-mirror="1"',
      'data-tight-wrap="firstLineOnly"',
    ]) {
      expect(view.html).toContain(token)
    }
  })

  it("writes none of them for a plain paragraph", async () => {
    const { xml } = await save({ tightWrap: "none" })
    for (const name of ["suppressLineNumbers", "suppressAutoHyphens", "mirrorIndents", "textboxTightWrap"]) {
      expect(xml).not.toContain(`<w:${name}`)
    }
  })

  it("writes the border's pen and Word's shadow, and opens them again (22.4)", async () => {
    const { bytes, xml } = await save({ border: "all", borderPen: "2px dashed #c00000", borderShadow: true })
    expect(xml).toContain('<w:top w:val="dashed" w:sz="12" w:space="1" w:color="C00000" w:shadow="1"/>')
    expect(xml.match(/w:shadow="1"/g)).toHaveLength(4)
    const { view } = await openDocxBytes(bytes, "t.docx")
    expect(view.html).toContain("--para-border: 2px dashed #c00000")
    expect(view.html).toContain('data-border-shadow="1"')
  })

  it("writes Word's 3-D setting as the frame effect, after the shadow, and opens it again (22.4)", async () => {
    const { bytes, xml } = await save({ border: "all", borderPen: "2px solid #000000", borderFrame: true })
    expect(xml).toContain('<w:left w:val="single" w:sz="12" w:space="4" w:color="000000" w:frame="1"/>')
    expect(xml.match(/w:frame="1"/g)).toHaveLength(4)
    const { view } = await openDocxBytes(bytes, "t.docx")
    expect(view.html).toContain('data-border-frame="1"')
    expect((await save({ border: "all" })).xml).not.toContain("w:frame")
  })

  it("keeps the app's own line as no pen, so a border made in the app opens as it was made", async () => {
    const { bytes, xml } = await save({ border: "bottom" })
    expect(xml).not.toContain("w:shadow")
    const { view } = await openDocxBytes(bytes, "t.docx")
    expect(view.html).not.toContain("--para-border")
  })

  it("writes Word's gaps by default and the ones set in Options…, and opens them again (22.4)", async () => {
    const plain = await save({ border: "all" })
    expect(plain.xml).toContain('<w:top w:val="single" w:sz="6" w:space="1"')
    expect(plain.xml).toContain('<w:left w:val="single" w:sz="6" w:space="4"')
    const { bytes, xml } = await save({ border: "all", borderSpace: "6 4 1 10" })
    expect(xml).toContain('<w:top w:val="single" w:sz="6" w:space="6"')
    expect(xml).toContain('<w:left w:val="single" w:sz="6" w:space="10"')
    const { view } = await openDocxBytes(bytes, "t.docx")
    expect(view.html).toContain('data-border-space="6 4 1 10"')
    const reopened = await openDocxBytes(plain.bytes, "t.docx")
    expect(reopened.view.html).not.toContain("data-border-space")
  })

  it("writes a shading pattern and its colour over the fill, and opens it again (22.4)", async () => {
    const { bytes, xml } = await save({ shading: "#ffeb9c", shadingPattern: "diagStripe #c00000" })
    expect(xml).toContain('<w:shd w:val="diagStripe" w:color="C00000" w:fill="FFEB9C"/>')
    const { view } = await openDocxBytes(bytes, "t.docx")
    expect(view.html).toContain('data-shading-pattern="diagStripe #c00000"')
    expect(view.html).toContain("background-color: #ffeb9c")
    const bare = await save({ shadingPattern: "pct25" })
    expect(bare.xml).toContain('<w:shd w:val="pct25" w:color="auto" w:fill="auto"/>')
    const reopened = await openDocxBytes(bare.bytes, "t.docx")
    expect(reopened.view.html).toContain('data-shading-pattern="pct25"')
  })
})
