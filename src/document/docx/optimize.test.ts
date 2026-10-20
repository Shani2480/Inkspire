import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { analyzeDocx, optimizeDocx } from "@/document/docx/optimize"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"

const NAME = "f20_word_shapes.docx"

async function fixture() {
  const bytes = new Uint8Array(readFileSync(path.resolve(process.cwd(), "tests/docx-fixtures/authored", NAME)))
  const opened = await openDocxBytes(bytes, NAME)
  const saved = await saveDocxBytes({
    json: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] },
    chrome: opened.view.chrome,
    props: opened.view.props,
    word: opened.word,
    unchanged: false,
    fileName: "plain.docx",
  })
  return saved.bytes
}

/** The saved file plus a stale thumbnail, a printer settings blob, an orphan picture and a relationship nothing uses. */
async function withExtras() {
  const pkg = await openPackage(await fixture(), "plain.docx")
  const junk = new Uint8Array(5000).fill(7)
  pkg.defaults.push(
    ...["bin", "jpeg", "png"]
      .filter((ext) => !pkg.defaults.some((item) => item.extension === ext))
      .map((extension) => ({
        extension,
        contentType: extension === "bin" ? "application/vnd.ms-office.printerSettings" : `image/${extension}`,
      })),
  )
  pkg.parts.push(
    { name: "/docProps/thumbnail.jpeg", contentType: "image/jpeg", data: junk },
    {
      name: "/word/printerSettings/printerSettings1.bin",
      contentType: "application/vnd.ms-office.printerSettings",
      data: junk,
    },
    { name: "/word/media/orphan.png", contentType: "image/png", data: junk },
    { name: "/word/media/unused.png", contentType: "image/png", data: junk },
  )
  const root = pkg.relationships.find((group) => group.source === "")!
  root.items.push({
    id: "rIdThumb",
    type: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail",
    target: "docProps/thumbnail.jpeg",
    targetMode: "Internal",
    partName: "/docProps/thumbnail.jpeg",
  })
  const main = pkg.relationships.find((group) => group.source.toLowerCase() === pkg.mainPartName.toLowerCase())!
  main.items.push(
    {
      id: "rIdUnused",
      type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
      target: "media/unused.png",
      targetMode: "Internal",
      partName: "/word/media/unused.png",
    },
    {
      id: "rIdPrinter",
      type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/printerSettings",
      target: "printerSettings/printerSettings1.bin",
      targetMode: "Internal",
      partName: "/word/printerSettings/printerSettings1.bin",
    },
  )
  return writePackage(pkg)
}

describe("lossless size optimization (21.48)", () => {
  it("lists exactly the stale thumbnail, printer settings, orphan and unused pictures", async () => {
    const found = await analyzeDocx(await withExtras(), "plain.docx")
    expect(found.map((item) => item.kind).sort()).toEqual([
      "orphan-part",
      "printer-settings",
      "thumbnail",
      "unused-image",
    ])
    expect(found.every((item) => item.bytes === 5000)).toBe(true)
  })

  it("removes them, keeps the document, and a second pass finds nothing", async () => {
    const extras = await withExtras()
    const result = await optimizeDocx(extras, "plain.docx")
    expect(result.removed).toBe(4)
    expect(result.bytes.length).toBeLessThan(extras.length)
    const pkg = await openPackage(result.bytes, "plain.docx")
    expect(findPart(pkg, "/word/media/orphan.png")).toBeUndefined()
    expect(findPart(pkg, "/docProps/thumbnail.jpeg")).toBeUndefined()
    expect(findPart(pkg, pkg.mainPartName)).toBeDefined()
    expect(await analyzeDocx(result.bytes, "plain.docx")).toEqual([])
    const reopened = await openDocxBytes(result.bytes, "plain.docx")
    expect(JSON.stringify(reopened.view.html)).toContain("Hello")
  })

  it("leaves a file with nothing to strip byte for byte", async () => {
    const plain = await fixture()
    const result = await optimizeDocx(plain, "plain.docx")
    expect(result.removed).toBe(0)
    expect(result.bytes).toBe(plain)
  })
})
