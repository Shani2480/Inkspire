import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { createExtensions } from "@/editor/extensions"
import { paragraphBorderOn, setBlockBorder } from "@/editor/home-actions"
import { boxJoins } from "@/editor/paragraph-box-groups"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")
const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

function editorWith(content: string) {
  const editor = new Editor({
    extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
    content,
  })
  editors.push(editor)
  return editor
}

function paragraphs(editor: Editor) {
  const out: { border: unknown; between: unknown }[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === "paragraph") {
      out.push({ border: node.attrs.border, between: node.attrs.borderBetween })
    }
  })
  return out
}

describe("Home > Borders on paragraphs (U27)", () => {
  it("toggles a side, keeps the others, and toggles the box and the line between", () => {
    const editor = editorWith("<p>one</p><p>two</p>")
    editor.commands.setTextSelection({ from: 1, to: 9 })
    setBlockBorder(editor, "bottom")
    setBlockBorder(editor, "top")
    expect(paragraphs(editor)[0]).toEqual({ border: "top,bottom", between: false })
    setBlockBorder(editor, "bottom")
    expect(paragraphs(editor)[0]?.border).toBe("top")
    setBlockBorder(editor, "outside")
    expect(paragraphs(editor)[1]?.border).toBe("all")
    setBlockBorder(editor, "insideH")
    expect(paragraphs(editor)[1]).toEqual({ border: "all", between: true })
    expect(paragraphBorderOn("all", "all", true)).toBe(true)
    setBlockBorder(editor, "none")
    expect(paragraphs(editor)).toEqual([
      { border: null, between: false },
      { border: null, between: false },
    ])
    // Inside Vertical and the diagonals belong to tables.
    setBlockBorder(editor, "diagDown")
    expect(paragraphs(editor)[0]?.border).toBe(null)
  })

  it("joins neighbours with the same borders into one box, as Word draws them", () => {
    const editor = editorWith(
      '<p data-border="all">a</p><p data-border="all">b</p><p data-border="all" data-border-between="1">c</p><p data-border="all">d</p>',
    )
    const joins = [...boxJoins(editor.state.doc).values()]
    expect(joins).toEqual([
      { prev: false, next: true },
      { prev: true, next: false },
      { prev: false, next: false },
      { prev: false, next: false },
    ])
    expect(editor.view.dom.querySelectorAll('[data-border-join="next"]').length).toBe(1)
    expect(editor.view.dom.querySelectorAll('[data-border-join="prev"]').length).toBe(1)
  })

  it("sets the selected cells' borders in a table", () => {
    const editor = editorWith("<table><tbody><tr><td><p>x</p></td><td><p>y</p></td></tr></tbody></table>")
    editor.commands.setTextSelection(4)
    setBlockBorder(editor, "diagDown")
    let borders: unknown
    editor.state.doc.descendants((node) => {
      if (node.type.name === "tableCell" && borders === undefined) {
        borders = node.attrs.borders
      }
    })
    expect(String(borders)).toContain("diagDown")
    expect(paragraphs(editor).every((item) => !item.border)).toBe(true)
  })

  it("opens and saves Word's line between paragraphs (w:between)", async () => {
    const name = "f13_inline_image.docx"
    const pkg = await openPackage(new Uint8Array(readFileSync(path.join(AUTHORED, name))), name)
    const part = findPart(pkg, pkg.mainPartName)!
    const box =
      '<w:pPr><w:pBdr><w:top w:val="single" w:sz="6" w:space="1" w:color="1C1C1C"/><w:left w:val="single" w:sz="6" w:space="4" w:color="1C1C1C"/><w:bottom w:val="single" w:sz="6" w:space="1" w:color="1C1C1C"/><w:right w:val="single" w:sz="6" w:space="4" w:color="1C1C1C"/><w:between w:val="single" w:sz="6" w:space="1" w:color="1C1C1C"/></w:pBdr></w:pPr>'
    const body = ["one", "two"].map((text) => `<w:p>${box}<w:r><w:t>${text}</w:t></w:r></w:p>`).join("")
    part.data = new TextEncoder().encode(
      decodeXml(part.data).replace(/<w:body>[\s\S]*?(<w:sectPr)/, `<w:body>${body}$1`),
    )
    const opened = await openDocxBytes(await writePackage(pkg), "t.docx")
    const editor = editorWith(opened.view.html)
    expect(paragraphs(editor)).toEqual([
      { border: "all", between: true },
      { border: "all", between: true },
    ])
    // A new paragraph made in the app with All Borders saves the line between too.
    editor.commands.insertContentAt(editor.state.doc.content.size, "<p>three</p>")
    editor.commands.setTextSelection(editor.state.doc.content.size - 2)
    setBlockBorder(editor, "all")
    const saved = await saveDocxBytes({
      json: editor.getJSON(),
      chrome: opened.view.chrome,
      props: opened.view.props,
      word: opened.word,
      unchanged: false,
      fileName: "t.docx",
    })
    if (process.env.BORDERS_OUT) {
      const { writeFileSync } = await import("node:fs")
      writeFileSync(process.env.BORDERS_OUT, saved.bytes)
    }
    const xml = decodeXml(findPart(await openPackage(saved.bytes, "t.docx"), "/word/document.xml")!.data)
    expect(xml.match(/<w:between /g)?.length).toBe(3)
    expect(xml).toMatch(/<w:right [^>]*\/><w:between /)
  })
})
