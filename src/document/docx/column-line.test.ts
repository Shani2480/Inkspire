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
    expect(view.html).toMatch(
      /one<\/span><\/p><div data-column-break="" class="column-break"><\/div><p[^>]*><span[^>]*>two/,
    )
  })
})

describe("Unequal column widths (22.7)", () => {
  const left = [
    { width: 4.66, space: 1.27 },
    { width: 10.58, space: 0 },
  ]

  it("are written as Word's w:col list and read back", async () => {
    const { xml, setup } = await roundTrip({ columns: 2, columnGap: 1.27, columnWidths: left })
    expect(xml).toMatch(
      /<w:cols [^>]*w:equalWidth="0"[^>]*><w:col w:w="\d+" w:space="720"\/><w:col w:w="\d+"\/><\/w:cols>/,
    )
    expect(setup.columns).toBe(2)
    expect(setup.columnWidths).toEqual(left)
  })

  it("are left out for equal columns", async () => {
    const { xml, setup } = await roundTrip({ columns: 2, columnWidths: undefined })
    expect(xml).not.toContain("equalWidth")
    expect(setup.columnWidths).toBeUndefined()
  })

  it("open from Word's own section and save back as Word wrote them", async () => {
    const paragraph = { type: "paragraph", content: [{ type: "text", text: "x" }] }
    const first = await saveDocxBytes({
      json: { type: "doc", content: [paragraph] },
      chrome: {
        ...emptyChrome(),
        pageSetup: {
          ...DEFAULT_PAGE_SETUP,
          columns: 3,
          columnWidths: [
            { width: 3, space: 1 },
            { width: 5, space: 1.5 },
            { width: 6.01, space: 0 },
          ],
        },
      },
      word: null,
      unchanged: false,
      fileName: "u.docx",
    })
    const opened = await openDocxBytes(first.bytes, "u.docx")
    expect(opened.view.chrome.pageSetup.columnWidths?.map((column) => column.width)).toEqual([3, 5, 6.01])
    const again = await saveDocxBytes({
      json: { type: "doc", content: [paragraph] },
      chrome: opened.view.chrome,
      props: opened.view.props,
      word: opened.word,
      unchanged: false,
      fileName: "u2.docx",
    })
    const read = async (bytes: Uint8Array, name: string) => {
      const pkg = await openPackage(bytes, name)
      return decodeXml(findPart(pkg, pkg.mainPartName)!.data).match(/<w:cols[\s\S]*?<\/w:cols>/)?.[0]
    }
    expect(await read(again.bytes, "u2.docx")).toBe(await read(first.bytes, "u.docx"))
  })

  it("survive the app's own file header", () => {
    const packed = packDocument("<p>x</p>", {
      ...emptyChrome(),
      pageSetup: { ...DEFAULT_PAGE_SETUP, columns: 2, columnWidths: left },
    })
    expect(unpackDocument(packed).pageSetup.columnWidths).toEqual(left)
  })
})
