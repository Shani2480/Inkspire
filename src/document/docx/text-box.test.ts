import { describe, expect, it } from "vitest"
import { emptyChrome } from "@/document/header"
import { runPropertiesFromEdit } from "@/document/docx/inlines"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { runBoxOf, textBoxAttributes, textBoxOfRun } from "@/document/docx/text-box"
import { decodeXml } from "@/document/docx/xml"

async function save(marks: unknown[]) {
  const saved = await saveDocxBytes({
    json: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "boxed", marks },
            { type: "text", text: " plain" },
          ],
        },
      ],
    },
    chrome: emptyChrome(),
    word: null,
    unchanged: false,
    fileName: "t.docx",
  })
  const pkg = await openPackage(saved.bytes, "t.docx")
  return { bytes: saved.bytes, xml: decodeXml(findPart(pkg, pkg.mainPartName)!.data) }
}

describe("borders and shading on text (22.4)", () => {
  it("reads a run's w:bdr and w:shd as the box the editor draws, and writes it back", () => {
    const box = textBoxOfRun({
      bdr: { value: "dotted", sz: 12, space: 0, color: "C00000", shadow: true },
      shd: { value: "pct25", color: "auto", fill: "FFFF00" },
    })
    expect(box).toEqual({ border: "2px dotted #c00000", shadow: true, fill: "#ffff00", pattern: "pct25" })
    expect(runBoxOf(box!)).toEqual({
      bdr: { value: "dotted", sz: 12, space: 0, color: "C00000", shadow: true },
      shd: { value: "pct25", color: "auto", fill: "FFFF00" },
    })
    expect(textBoxOfRun({ bdr: { value: "nil" } })).toBeNull()
    expect(textBoxAttributes(box!).style).toContain("box-shadow: 2px 2px 0 0 #c00000")
  })

  it("saves a box and fill on text in w:rPr order, and opens them again", async () => {
    const { bytes, xml } = await save([
      { type: "bold" },
      { type: "textBorder", attrs: { border: "1px solid #000000", shadow: true, fill: "#ffeb9c", pattern: null } },
    ])
    const rPr = /<w:rPr>.*?<\/w:rPr>/.exec(xml)?.[0] ?? ""
    expect(rPr).toContain('<w:bdr w:val="single" w:sz="6" w:space="0" w:color="000000" w:shadow="1"/>')
    expect(rPr).toContain('<w:shd w:val="clear" w:color="auto" w:fill="FFEB9C"/>')
    expect(rPr.indexOf("<w:b/>")).toBeLessThan(rPr.indexOf("<w:bdr "))
    expect(rPr.indexOf("<w:bdr ")).toBeLessThan(rPr.indexOf("<w:shd "))
    expect(xml.match(/<w:bdr /g)).toHaveLength(1)
    const { view } = await openDocxBytes(bytes, "t.docx")
    expect(view.html).toContain('data-text-line="1px solid #000000"')
    expect(view.html).toContain('data-text-shadow="1"')
    expect(view.html).toContain('data-text-fill="#ffeb9c"')
  })

  it("keeps Word's own box on a run while the editor shows the same, and changes it when the box changes", () => {
    const source = { bdr: { value: "wave" as const, sz: 4, space: 0, color: "auto", shadow: false } }
    const kept = runPropertiesFromEdit({ bdr: { value: "single", sz: 4, space: 0, color: "000000" } }, source)
    expect(kept.bdr?.value).toBe("wave")
    const changed = runPropertiesFromEdit({ bdr: { value: "dotted", sz: 4, space: 0, color: "000000" } }, source)
    expect(changed.bdr?.value).toBe("dotted")
    const removed = runPropertiesFromEdit({}, source)
    expect(removed.bdr).toBeUndefined()
  })
})
