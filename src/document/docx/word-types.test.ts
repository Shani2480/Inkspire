import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import {
  CONTENT_TYPE_MACRO,
  CONTENT_TYPE_TEMPLATE,
  findPart,
  openPackage,
  relationshipsFor,
  writePackage,
} from "@/document/docx/opc"

const BASELINE = path.resolve(process.cwd(), "tests/docx-fixtures/cases/00_baseline.docx")
const VBA_REL = "http://schemas.microsoft.com/office/2006/relationships/vbaProject"

/** The baseline document as Word saves it with a macro: a .docm with a VBA project behind the main part. */
async function macroDocument() {
  const pkg = await openPackage(new Uint8Array(readFileSync(BASELINE)), "baseline.docx")
  const main = findPart(pkg, pkg.mainPartName)!
  main.contentType = CONTENT_TYPE_MACRO
  pkg.parts.push({
    name: "/word/vbaProject.bin",
    contentType: "application/vnd.ms-office.vbaProject",
    data: new Uint8Array([1, 2, 3]),
  })
  const group = pkg.relationships.find((item) => item.source === pkg.mainPartName)!
  group.items.push({
    id: "rIdVba",
    type: VBA_REL,
    target: "vbaProject.bin",
    targetMode: "Internal",
    partName: "/word/vbaProject.bin",
  })
  pkg.fileName = "macros.docm"
  return writePackage(pkg)
}

async function saveAs(bytes: Uint8Array, from: string, to: string) {
  const opened = await openDocxBytes(bytes, from)
  const saved = await saveDocxBytes({
    json: { type: "doc" },
    chrome: { header: "", footer: "" },
    word: opened.word,
    unchanged: true,
    fileName: to,
  })
  return openPackage(saved.bytes, to)
}

describe("Word templates and macro-enabled documents", () => {
  it("keeps the VBA project when a .docm is saved as .docm", async () => {
    const pkg = await saveAs(await macroDocument(), "macros.docm", "macros.docm")
    expect(findPart(pkg, pkg.mainPartName)?.contentType).toBe(CONTENT_TYPE_MACRO)
    expect(findPart(pkg, "/word/vbaProject.bin")?.data).toEqual(new Uint8Array([1, 2, 3]))
    expect(relationshipsFor(pkg, pkg.mainPartName).some((item) => item.type === VBA_REL)).toBe(true)
  })

  it("leaves the macros out of a .docx, and gives a .dotx the template type", async () => {
    const docx = await saveAs(await macroDocument(), "macros.docm", "plain.docx")
    expect(findPart(docx, "/word/vbaProject.bin")).toBeUndefined()
    expect(relationshipsFor(docx, docx.mainPartName).some((item) => item.type === VBA_REL)).toBe(false)
    const dotx = await saveAs(new Uint8Array(readFileSync(BASELINE)), "baseline.docx", "letter.dotx")
    expect(findPart(dotx, dotx.mainPartName)?.contentType).toBe(CONTENT_TYPE_TEMPLATE)
    const reopened = await openDocxBytes(await writePackage(dotx), "letter.dotx")
    expect(reopened.view.html.length).toBeGreaterThan(0)
  })
})
