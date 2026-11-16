import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { applyDropCap, currentDropCap } from "@/components/drop-cap-dialog"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { createExtensions } from "@/editor/extensions"

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

/** Word's own drop cap markup (a Word 365 re-save keeps it as written). */
function wordCap(kind: "drop" | "margin", font = "", hSpace = 0) {
  const fonts = font ? `<w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>` : ""
  const space = hSpace ? ` w:hSpace="${hSpace}"` : ""
  const anchor = kind === "margin" ? "page" : "text"
  return (
    `<w:p><w:pPr><w:keepNext/><w:framePr w:dropCap="${kind}" w:lines="3"${space} w:wrap="around" w:vAnchor="text" w:hAnchor="${anchor}"/>` +
    `<w:spacing w:after="0" w:line="1373" w:lineRule="exact"/><w:textAlignment w:val="baseline"/>` +
    `<w:rPr>${fonts}<w:position w:val="-14"/><w:sz w:val="164"/></w:rPr></w:pPr>` +
    `<w:r><w:rPr>${fonts}<w:position w:val="-14"/><w:sz w:val="164"/></w:rPr><w:t>T</w:t></w:r></w:p>` +
    `<w:p><w:r><w:t>here was once a quiet town.</w:t></w:r></w:p>`
  )
}

async function wordFile(body: string) {
  const name = "f01_runs.docx"
  const pkg = await openPackage(new Uint8Array(readFileSync(path.join(AUTHORED, name))), name)
  const part = findPart(pkg, pkg.mainPartName)!
  part.data = new TextEncoder().encode(decodeXml(part.data).replace(/<w:body>[\s\S]*?(<w:sectPr)/, `<w:body>${body}$1`))
  return writePackage(pkg)
}

async function save(editor: Editor, opened: Awaited<ReturnType<typeof openDocxBytes>>, unchanged = false) {
  const saved = await saveDocxBytes({
    json: editor.getJSON(),
    chrome: opened.view.chrome,
    props: opened.view.props,
    word: opened.word,
    unchanged,
    fileName: "t.docx",
  })
  if (process.env.DROPCAP_OUT) {
    const { writeFileSync } = await import("node:fs")
    writeFileSync(process.env.DROPCAP_OUT, saved.bytes)
  }
  return {
    bytes: saved.bytes,
    xml: decodeXml(findPart(await openPackage(saved.bytes, "t.docx"), "/word/document.xml")!.data),
  }
}

function paragraphs(editor: Editor) {
  const out: { text: string; cap: unknown; lines: unknown; distance: unknown; font: unknown }[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === "paragraph") {
      out.push({
        text: node.textContent,
        cap: node.attrs.dropCap,
        lines: node.attrs.dropCapLines,
        distance: node.attrs.dropCapDistance,
        font: node.attrs.dropCapFont,
      })
    }
  })
  return out
}

describe("Drop Cap (U29)", () => {
  it("opens Word's drop cap frame as the paragraph's own drop cap, with its lines, distance and font", async () => {
    const bytes = await wordFile(`${wordCap("drop")}${wordCap("drop", "Georgia", 284)}${wordCap("margin")}`)
    const opened = await openDocxBytes(bytes, "t.docx")
    const editor = editorWith(opened.view.html)
    expect(paragraphs(editor)).toEqual([
      { text: "There was once a quiet town.", cap: "dropped", lines: 3, distance: null, font: null },
      { text: "There was once a quiet town.", cap: "dropped", lines: 3, distance: 14.2, font: "Georgia" },
      { text: "There was once a quiet town.", cap: "margin", lines: 3, distance: null, font: null },
    ])
    expect(editor.view.dom.querySelector("p[data-drop-cap]")?.getAttribute("style")).toContain("--drop-lines: 3")

    // Saved untouched, Word's frames come back as they were.
    const { xml } = await save(editor, opened)
    expect(xml.match(/<w:framePr w:dropCap="drop" w:lines="3" w:wrap="around"/g)?.length).toBe(1)
    expect(xml).toContain('w:dropCap="drop" w:lines="3" w:hSpace="284"')
    expect(xml).toContain('w:dropCap="margin"')
    expect(xml.match(/<w:t>T<\/w:t>/g)?.length).toBe(3)
    expect(xml.match(/<w:t>here was once a quiet town.<\/w:t>/g)?.length).toBe(3)
  })

  it("saves a drop cap made in the app as Word's frame, sized by its lines, and opens it again", async () => {
    const bytes = await wordFile("<w:p><w:r><w:t>Once upon a time.</w:t></w:r></w:p>")
    const opened = await openDocxBytes(bytes, "t.docx")
    const editor = editorWith(opened.view.html)
    editor.commands.setTextSelection(3)
    applyDropCap(editor, { kind: "dropped", lines: 5, distance: 0.5 * (72 / 2.54), font: "Georgia" })
    expect(currentDropCap(editor)).toEqual({ kind: "dropped", lines: 5, distance: 14.2, font: "Georgia" })
    const { xml, bytes: saved } = await save(editor, opened)
    expect(xml).toMatch(
      /<w:p><w:pPr><w:keepNext\/><w:framePr w:dropCap="drop" w:lines="5" w:hSpace="284" w:wrap="around" w:vAnchor="text" w:hAnchor="text"\/>/,
    )
    expect(xml).toMatch(/<w:spacing w:after="0" w:line="\d+" w:lineRule="exact"\/><w:textAlignment w:val="baseline"\/>/)
    expect(xml).toMatch(/<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"\/>/)
    expect(xml).toMatch(/<w:t>O<\/w:t>/)
    expect(xml).toMatch(/<w:t xml:space="preserve">nce upon a time.<\/w:t>|<w:t>nce upon a time.<\/w:t>/)

    const again = editorWith((await openDocxBytes(saved, "t.docx")).view.html)
    expect(paragraphs(again)[0]).toEqual({
      text: "Once upon a time.",
      cap: "dropped",
      lines: 5,
      distance: 14.2,
      font: "Georgia",
    })

    // None takes it off, and nothing is framed on save.
    applyDropCap(again, { kind: null })
    expect(paragraphs(again)[0]?.cap).toBe(null)
    expect(again.view.dom.querySelector("[data-drop-cap]")).toBeNull()
  })
})
