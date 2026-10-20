import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import type { PageSetup } from "@/document/page-setup"

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
})
