import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { paragraphsIn } from "@/document/docx/model"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { readDocument } from "@/document/docx/wml-read"
import { decodeXml } from "@/document/docx/xml"
import { createExtensions } from "@/editor/extensions"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")

const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

/** f04 as a pasted summary writes it: each item sets its own left indent and keeps its level's hanging one. */
async function ownIndents() {
  const pkg = await openPackage(new Uint8Array(readFileSync(path.join(AUTHORED, "f04_bullets.docx"))), "f04.docx")
  const part = findPart(pkg, pkg.mainPartName)!
  let item = 0
  const xml = decodeXml(part.data).replace(/<w:ilvl w:val="0"\/><w:numId w:val="1"\/><\/w:numPr>/g, (match) => {
    item += 1
    return item === 2
      ? `<w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr><w:ind w:left="2160"/>`
      : `${match}<w:ind w:left="1080"/>`
  })
  part.data = new TextEncoder().encode(xml)
  return writePackage(pkg)
}

describe("a list item's own indent", () => {
  it("places the text once, at the paragraph's left indent, and steps levels by the document's spacing", async () => {
    const opened = await openDocxBytes(await ownIndents(), "f04.docx")
    const html = opened.view.html
    expect(html).toContain(`data-word-indent="padding-left: 54pt; --list-indent-step: 54pt"`)
    // The paragraph inside the item does not indent a second time.
    expect(html).not.toMatch(/<li[^>]*>\s*<p[^>]*data-indent=/)
    expect(html).not.toMatch(/<li[^>]*>\s*<p[^>]*data-special=/)

    const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
    const editor = new Editor({ extensions, content: html })
    editors.push(editor)
    expect(editor.getHTML()).toContain("--list-indent-step: 54pt")
    expect(editor.getHTML()).toContain("margin-left: calc(1 * var(--list-indent-step, 1.75em))")

    const saved = await saveDocxBytes({
      json: editor.getJSON(),
      chrome: opened.view.chrome,
      props: opened.view.props,
      word: opened.word,
      unchanged: false,
      fileName: "edited.docx",
    })
    const doc = readDocument(await openPackage(saved.bytes, "edited.docx"))
    const items = paragraphsIn(doc.blocks).filter((paragraph) => paragraph.pPr.numPr)
    expect(items.map((paragraph) => paragraph.pPr.ind)).toEqual([{ left: 1080 }, { left: 2160 }, { left: 1080 }])
    expect(items.map((paragraph) => paragraph.pPr.numPr?.ilvl)).toEqual([0, 1, 0])
  })
})

describe("a Word list's markers", () => {
  it("carries each level's text, format, start, hanging indent and font to the editor", async () => {
    const opened = await openDocxBytes(new Uint8Array(readFileSync(path.join(AUTHORED, "f05_numbering.docx"))))
    const encoded = opened.view.html.match(/data-word-levels="([^"]+)"/)![1]!
    const levels = JSON.parse(encoded.replace(/&quot;/g, '"').replace(/&amp;/g, "&")) as unknown[]
    expect(levels[0]).toEqual({ text: "%1.", format: "decimal", start: 1, hang: 18 })
  })
})

/** f05 with its level drawn as Word lets a level be: right-aligned, a space after, legal numbers, its own run format. */
async function formattedLevels() {
  const pkg = await openPackage(new Uint8Array(readFileSync(path.join(AUTHORED, "f05_numbering.docx"))), "f05.docx")
  const part = findPart(pkg, "/word/numbering.xml")!
  const level = `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="upperRoman"/><w:lvlRestart w:val="0"/><w:isLgl/><w:suff w:val="space"/><w:lvlText w:val="%1."/><w:lvlJc w:val="right"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:b/><w:color w:val="C00000"/><w:sz w:val="32"/></w:rPr></w:lvl>`
  part.data = new TextEncoder().encode(decodeXml(part.data).replace(/<w:lvl w:ilvl="0">.*?<\/w:lvl>/, level))
  return writePackage(pkg)
}

describe("a Word list level's own look", () => {
  it("carries the marker's alignment, suffix, legal numbers, restart and run format, and keeps them on save", async () => {
    const opened = await openDocxBytes(await formattedLevels(), "f05.docx")
    const encoded = opened.view.html.match(/data-word-levels="([^"]+)"/)![1]!
    const levels = JSON.parse(encoded.replace(/&quot;/g, '"').replace(/&amp;/g, "&")) as unknown[]
    expect(levels[0]).toEqual({
      text: "%1.",
      format: "upperRoman",
      start: 1,
      hang: 18,
      justify: "right",
      suffix: "space",
      legal: true,
      restart: 0,
      size: 16,
      color: "#c00000",
      bold: true,
    })
    expect(opened.view.html).toContain(`data-word-tab="36"`)

    const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
    const editor = new Editor({ extensions, content: opened.view.html })
    editors.push(editor)
    editor.commands.insertContentAt(editor.state.doc.content.size, "<p>added</p>")
    const saved = await saveDocxBytes({
      json: editor.getJSON(),
      chrome: opened.view.chrome,
      props: opened.view.props,
      word: opened.word,
      unchanged: false,
      fileName: "edited.docx",
    })
    const numbering = decodeXml(findPart(await openPackage(saved.bytes, "edited.docx"), "/word/numbering.xml")!.data)
    const written = numbering.match(/<w:lvl w:ilvl="0">.*?<\/w:lvl>/)![0]
    expect(written).toMatch(
      /<w:numFmt w:val="upperRoman"\/><w:lvlRestart w:val="0"\/><w:isLgl\/><w:suff w:val="space"\/>/,
    )
    expect(written).toContain(`<w:lvlJc w:val="right"/>`)
  })
})
