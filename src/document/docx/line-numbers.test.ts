import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { emptyChrome, packDocument, unpackDocument } from "@/document/header"
import { DEFAULT_PAGE_SETUP, type PageSetup } from "@/document/page-setup"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")
// Frame and Heart from a Word file whose section has <w:lnNumType w:countBy="1" w:restart="continuous"/>.
const NAME = "f20_word_shapes.docx"

async function open() {
  return openDocxBytes(new Uint8Array(readFileSync(path.join(AUTHORED, NAME))), NAME)
}

async function saved(change: Partial<PageSetup>) {
  const opened = await open()
  const result = await saveDocxBytes({
    json: { type: "doc", content: [{ type: "paragraph" }] },
    chrome: { ...opened.view.chrome, pageSetup: { ...opened.view.chrome.pageSetup, ...change } },
    props: opened.view.props,
    word: opened.word,
    unchanged: false,
    fileName: "edited.docx",
  })
  const pkg = await openPackage(result.bytes, "edited.docx")
  return decodeXml(findPart(pkg, "/word/document.xml")!.data)
}

describe("line numbering (21.37)", () => {
  it("reads w:lnNumType into the page setup", async () => {
    const setup = (await open()).view.chrome.pageSetup
    expect(setup.lineNumbers).toBe(true)
    expect(setup.lineNumberRestart).toBe("continuous")
  })

  it("keeps Word's element while the setup is as it was", async () => {
    expect(await saved({})).toContain('<w:lnNumType w:countBy="1" w:restart="continuous"/>')
  })

  it("restarts each page when the setup says so, and drops the numbers when they are off", async () => {
    expect(await saved({ lineNumberRestart: "page" })).toContain('<w:lnNumType w:countBy="1" w:restart="newPage"/>')
    expect(await saved({ lineNumbers: false })).not.toContain("lnNumType")
  })

  it("writes Start at, Count by and From text as Word does, and reads them back", async () => {
    const xml = await saved({ lineNumberStart: 5, lineNumberCountBy: 5, lineNumberDistance: 12.7 })
    const element = /<w:lnNumType[^>]*\/>/.exec(xml)?.[0] ?? ""
    expect(element).toContain('w:countBy="5"')
    // Word counts start from 0: the first line numbered 5 is start="4".
    expect(element).toContain('w:start="4"')
    expect(element).toContain('w:distance="720"')
    const opened = await open()
    const bytes = await saveDocxBytes({
      json: { type: "doc", content: [{ type: "paragraph" }] },
      chrome: {
        ...opened.view.chrome,
        pageSetup: {
          ...opened.view.chrome.pageSetup,
          lineNumberStart: 5,
          lineNumberCountBy: 5,
          lineNumberDistance: 12.7,
        },
      },
      props: opened.view.props,
      word: opened.word,
      unchanged: false,
      fileName: "edited.docx",
    })
    const setup = (await openDocxBytes(bytes.bytes, "edited.docx")).view.chrome.pageSetup
    expect(setup).toMatchObject({ lineNumberStart: 5, lineNumberCountBy: 5, lineNumberDistance: 12.7 })
  })

  it("restarts each section as Word's newSection and reads it back", async () => {
    const opened = await open()
    const result = await saveDocxBytes({
      json: { type: "doc", content: [{ type: "paragraph" }] },
      chrome: { ...opened.view.chrome, pageSetup: { ...opened.view.chrome.pageSetup, lineNumberRestart: "section" } },
      props: opened.view.props,
      word: opened.word,
      unchanged: false,
      fileName: "edited.docx",
    })
    const pkg = await openPackage(result.bytes, "edited.docx")
    expect(decodeXml(findPart(pkg, "/word/document.xml")!.data)).toContain('w:restart="newSection"')
    const setup = (await openDocxBytes(result.bytes, "edited.docx")).view.chrome.pageSetup
    expect(setup).toMatchObject({ lineNumbers: true, lineNumberRestart: "section" })
  })

  it("keeps Restart Each Section in the app's own file header", () => {
    const packed = packDocument("<p>x</p>", {
      ...emptyChrome(),
      pageSetup: { ...DEFAULT_PAGE_SETUP, lineNumbers: true, lineNumberRestart: "section" },
    })
    expect(unpackDocument(packed).pageSetup).toMatchObject({ lineNumbers: true, lineNumberRestart: "section" })
  })
})
