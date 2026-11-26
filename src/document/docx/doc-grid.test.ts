import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { createExtensions } from "@/editor/extensions"

// A section's document grid keeps its type through a save: with w:type="lines" Word sets every line on the grid
// (18 pt here), so dropping it made a real registration form's rows and lines shorter in Word.
const SOURCE = path.resolve(process.cwd(), "tests/docx-fixtures/authored/f01_runs.docx")

async function withGrid(grid: string) {
  const pkg = await openPackage(new Uint8Array(readFileSync(SOURCE)), "f01.docx")
  const part = findPart(pkg, pkg.mainPartName)!
  const xml = new TextDecoder().decode(part.data).replace(/<w:docGrid[^>]*\/>/, "")
  part.data = new TextEncoder().encode(xml.replace("</w:sectPr>", `${grid}</w:sectPr>`))
  return writePackage(pkg)
}

async function savedGrid(bytes: Uint8Array) {
  const opened = await openDocxBytes(bytes, "grid.docx")
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
    fileName: "grid.docx",
  })
  const pkg = await openPackage(saved.bytes, "grid.docx")
  return new TextDecoder().decode(findPart(pkg, pkg.mainPartName)!.data).match(/<w:docGrid[^>]*\/>/)?.[0]
}

describe("the document grid", () => {
  it("keeps its type and character pitch when saved", async () => {
    expect(await savedGrid(await withGrid('<w:docGrid w:type="lines" w:linePitch="360"/>'))).toBe(
      '<w:docGrid w:type="lines" w:linePitch="360"/>',
    )
    expect(
      await savedGrid(await withGrid('<w:docGrid w:type="linesAndChars" w:linePitch="312" w:charSpace="-2049"/>')),
    ).toBe('<w:docGrid w:type="linesAndChars" w:linePitch="312" w:charSpace="-2049"/>')
  })

  it("without a type stays a plain pitch", async () => {
    expect(await savedGrid(await withGrid('<w:docGrid w:linePitch="360"/>'))).toBe('<w:docGrid w:linePitch="360"/>')
  })
})
