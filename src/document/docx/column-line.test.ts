import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { emptyChrome, packDocument, unpackDocument } from "@/document/header"
import { DEFAULT_PAGE_SETUP, type PageSetup } from "@/document/page-setup"

const NAME = "f20_word_shapes.docx"

async function roundTrip(change: Partial<PageSetup>) {
  const bytes = new Uint8Array(readFileSync(path.resolve(process.cwd(), "tests/docx-fixtures/authored", NAME)))
  const opened = await openDocxBytes(bytes, NAME)
  const result = await saveDocxBytes({
    json: { type: "doc", content: [{ type: "paragraph" }] },
    chrome: { ...opened.view.chrome, pageSetup: { ...opened.view.chrome.pageSetup, ...change } },
    props: opened.view.props,
    word: opened.word,
    unchanged: false,
    fileName: "edited.docx",
  })
  const pkg = await openPackage(result.bytes, "edited.docx")
  const xml = decodeXml(findPart(pkg, "/word/document.xml")!.data)
  const reopened = await openDocxBytes(result.bytes, "edited.docx")
  return { xml, setup: reopened.view.chrome.pageSetup }
}

describe("Line between columns (22.7)", () => {
  it("is written as w:sep and read back", async () => {
    const { xml, setup } = await roundTrip({ columns: 2, columnLine: true })
    expect(xml).toMatch(/<w:cols [^>]*w:sep="1"/)
    expect(setup.columnLine).toBe(true)
  })

  it("is off by default and is not written for one column", async () => {
    const { xml, setup } = await roundTrip({ columns: 1, columnLine: true })
    expect(xml).not.toContain('w:sep="1"')
    expect(setup.columnLine).toBe(false)
  })

  it("survives the app's own file header", () => {
    const packed = packDocument("<p>x</p>", {
      ...emptyChrome(),
      pageSetup: { ...DEFAULT_PAGE_SETUP, columns: 2, columnLine: true },
    })
    expect(unpackDocument(packed).pageSetup.columnLine).toBe(true)
  })
})

describe("column breaks in .docx", () => {
  it("are written as Word's paragraph holding a column break and open as one again", async () => {
    const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] })
    const saved = await saveDocxBytes({
      json: { type: "doc", content: [paragraph("one"), { type: "columnBreak" }, paragraph("two")] },
      chrome: emptyChrome(),
      word: null,
      unchanged: false,
      fileName: "c.docx",
    })
    const pkg = await openPackage(saved.bytes, "c.docx")
    const xml = decodeXml(findPart(pkg, pkg.mainPartName)!.data)
    expect(xml).toContain('<w:p><w:r><w:br w:type="column"/></w:r></w:p>')
    const { view } = await openDocxBytes(saved.bytes, "c.docx")
    expect(view.html).toMatch(/one<\/span><\/p><div data-column-break="" class="column-break"><\/div><p[^>]*><span[^>]*>two/)
  })
})
