import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { createExtensions } from "@/editor/extensions"

// Paragraphs numbered by their style alone (List Paragraph with w:numPr), as Word's own lists often are: a dash list
// with a deeper item, an item turning the list off (numId 0), and numbered steps (made for this test; Word draws
// "- S1", "- S2", "o S3", S4 unnumbered, "1. S6", "2. S7", 2026-11-20).
const FIXTURE = path.resolve(process.cwd(), "tests/docx-fixtures/cases/w18_list_from_style.docx")

async function openAndSave() {
  const opened = await openDocxBytes(new Uint8Array(readFileSync(FIXTURE)), "w18.docx")
  const editor = new Editor({
    extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
    content: opened.view.html,
    parseOptions: { preserveWhitespace: "full" },
  })
  const json = editor.getJSON()
  editor.destroy()
  const saved = await saveDocxBytes({
    json,
    chrome: opened.view.chrome,
    props: opened.view.props,
    word: opened.word,
    unchanged: false,
    fileName: "w18.docx",
  })
  const pkg = await openPackage(saved.bytes, "w18.docx")
  const part = pkg.parts.find((item) => item.name === "/word/document.xml")!
  return { html: opened.view.html, xml: decodeXml(part.data) }
}

/** The w:pPr of the paragraph holding `text` in saved XML. */
function pPrOf(xml: string, text: string) {
  const end = xml.indexOf(text)
  const start =
    xml.lastIndexOf("<w:p>", end) >= xml.lastIndexOf("<w:p ", end)
      ? xml.lastIndexOf("<w:p>", end)
      : xml.lastIndexOf("<w:p ", end)
  return /<w:pPr>.*?<\/w:pPr>/.exec(xml.slice(start, end))?.[0] ?? ""
}

describe("lists numbered by their paragraph style", () => {
  it("open as lists with the style's numbering", async () => {
    const { html } = await openAndSave()
    const bullets = /<ul[\s\S]*?<\/ul>\s*(?=<p)/.exec(html)?.[0] ?? ""
    expect(bullets).toContain("S1 dash item")
    expect(bullets).toContain("S2 second dash item")
    expect(bullets).toContain("S3 deeper item")
    expect(bullets).not.toContain("S4")
    const steps = /<ol[\s\S]*?<\/ol>/.exec(html)?.[0] ?? ""
    expect(steps).toContain("S6 numbered step")
    expect(steps).toContain("S7 numbered step two")
  })

  it("save with the numbering left to the style, as written", async () => {
    const { xml } = await openAndSave()
    for (const text of ["S1 dash item", "S2 second dash item", "S6 numbered step", "S7 numbered step two"]) {
      expect(pPrOf(xml, text)).not.toContain("<w:numPr>")
    }
    expect(pPrOf(xml, "S3 deeper item")).toContain('<w:ilvl w:val="1"/><w:numId w:val="4"/>')
    expect(pPrOf(xml, "S4 style list")).toContain('<w:numId w:val="0"/>')
  })
})
