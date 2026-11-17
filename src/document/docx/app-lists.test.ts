import { Editor } from "@tiptap/core"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { emptyChrome } from "@/document/header"
import { createExtensions } from "@/editor/extensions"

const editors: Editor[] = []
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

/** Lists made in the editor, saved; with APP_LISTS_OUT set the saves are also written there (for Word in the VM). */
async function save(name: string, html: string) {
  const editor = new Editor({ extensions: createExtensions().filter((e) => e.name !== "spellcheck"), content: html })
  editors.push(editor)
  const saved = await saveDocxBytes({
    json: editor.getJSON(),
    chrome: emptyChrome(),
    word: null,
    unchanged: false,
    fileName: `${name}.docx`,
  })
  if (process.env.APP_LISTS_OUT) {
    writeFileSync(path.join(process.env.APP_LISTS_OUT, `${name}.docx`), saved.bytes)
  }
  const pkg = await openPackage(saved.bytes, `${name}.docx`)
  return {
    bytes: saved.bytes,
    xml: decodeXml(findPart(pkg, "/word/document.xml")!.data),
    numbering: decodeXml(findPart(pkg, "/word/numbering.xml")!.data),
  }
}

/** Each numbered paragraph's numId and level, in order. */
function numPr(xml: string) {
  return [...xml.matchAll(/<w:ilvl w:val="(\d+)"\/><w:numId w:val="(\d+)"\/>/g)].map((m) => `${m[2]}:${m[1]}`)
}

/** The abstract numbering's level formats and texts, "format text" per level. */
function levels(numbering: string, abstract = 0) {
  const block = [...numbering.matchAll(/<w:abstractNum\b[\s\S]*?<\/w:abstractNum>/g)][abstract][0]
  return [...block.matchAll(/<w:numFmt w:val="(\w+)"\/>(?:<w:isLgl\/>)?<w:lvlText w:val="([^"]*)"\/>/g)].map((m) => `${m[1]} ${m[2]}`)
}

const nest = (tag: string, attrs: string, depth: number, label: string): string =>
  `<${tag}${attrs}><li><p>${label} 1</p>${depth > 1 ? nest(tag, "", depth - 1, `${label}.1`) : ""}</li><li><p>${label} 2</p></li></${tag}>`

describe("lists made in the app, saved for Word", () => {
  it("saves a nested numbered list as one Word list with 1. a. i. and Word's indents per level", async () => {
    const { xml, numbering } = await save("nested-numbers", nest("ol", "", 3, "Item"))
    expect(levels(numbering).slice(0, 4)).toEqual(["decimal %1.", "lowerLetter %2.", "lowerRoman %3.", "decimal %4."])
    expect(numbering).toContain('<w:ind w:left="720" w:hanging="360"/>')
    expect(numbering).toContain('<w:ind w:left="1440" w:hanging="360"/>')
    expect(numbering).toContain('<w:ind w:left="2160" w:hanging="360"/>')
    const used = numPr(xml)
    expect(used.map((item) => item.split(":")[1])).toEqual(["0", "1", "2", "2", "1", "0"])
    expect(new Set(used.map((item) => item.split(":")[0])).size).toBe(1)
  })

  it("saves nested bullets as • ○ ■", async () => {
    const { numbering } = await save("nested-bullets", nest("ul", "", 3, "Point"))
    expect(levels(numbering).slice(0, 3)).toEqual(["bullet •", "bullet ○", "bullet ■"])
  })

  it("keeps each list's own marker, also on a nested list", async () => {
    const html =
      `<ol data-marker="upper-roman"><li><p>Part</p><ol data-marker="decimal-paren"><li><p>step</p></li></ol></li></ol>` +
      `<p>Then</p><ul data-marker="'✓ '"><li><p>done</p></li></ul>`
    const { numbering } = await save("own-markers", html)
    expect(levels(numbering, 0).slice(0, 3)).toEqual(["upperRoman %1.", "decimal %2)", "lowerRoman %3."])
    expect(levels(numbering, 1)[0]).toBe("bullet ✓")
  })

  it("saves Legal numbering as 1. 1.1. 1.1.1.", async () => {
    const { numbering } = await save("legal", nest("ol", ' data-scheme="legal"', 3, "Clause"))
    expect(levels(numbering).slice(0, 3)).toEqual(["decimal %1.", "decimal %1.%2.", "decimal %1.%2.%3."])
    expect(numbering).toContain("<w:isLgl/>")
  })

  it("draws bullets nested in a numbered list as bullets at that level", async () => {
    const html = "<ol><li><p>First</p><ul><li><p>note</p></li></ul></li><li><p>Second</p></li></ol>"
    const { xml, numbering } = await save("mixed", html)
    expect(levels(numbering).slice(0, 3)).toEqual(["decimal %1.", "bullet ○", "lowerRoman %3."])
    expect(new Set(numPr(xml).map((item) => item.split(":")[0])).size).toBe(1)
  })

  it("reuses one definition for lists drawn alike, each numbered list still counting from 1", async () => {
    const html = "<ol><li><p>one</p></li></ol><p>x</p><ol><li><p>again</p></li></ol><ul><li><p>dot</p></li></ul>"
    const { numbering } = await save("separate", html)
    expect(numbering.match(/<w:abstractNum\b/g)).toHaveLength(2)
    expect(numbering.match(/<w:startOverride w:val="1"\/>/g)).toHaveLength(2)
  })

  it("opens its own save as it drew the list", async () => {
    const { bytes } = await save("reopen", nest("ol", "", 2, "Item"))
    const { html } = (await openDocxBytes(bytes, "reopen.docx")).view
    expect(html).toContain("data-word-levels")
    expect(html.match(/<li/g)).toHaveLength(4)
  })
})
