import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { UNDERLINE_KINDS, underlineCss, wordColorOf } from "@/document/underlines"
import { createExtensions } from "@/editor/extensions"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")
const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

/** A fixture whose body is one paragraph per Word underline type, the last ones with colours. */
async function underlined() {
  const name = "f13_inline_image.docx"
  const pkg = await openPackage(new Uint8Array(readFileSync(path.join(AUTHORED, name))), name)
  const part = findPart(pkg, pkg.mainPartName)!
  const runs = UNDERLINE_KINDS.map(
    (kind) => `<w:p><w:r><w:rPr><w:u w:val="${kind.word}"/></w:rPr><w:t>${kind.label} text</w:t></w:r></w:p>`,
  ).join("")
  const colored = '<w:p><w:r><w:rPr><w:u w:val="thick" w:color="C00000"/></w:rPr><w:t>red thick</w:t></w:r></w:p>'
  const xml = decodeXml(part.data).replace(/<w:body>[\s\S]*?(<w:sectPr)/, `<w:body>${runs}${colored}$1`)
  part.data = new TextEncoder().encode(xml)
  return writePackage(pkg)
}

async function openAndSave(bytes: Uint8Array, edit?: (editor: Editor) => void) {
  const opened = await openDocxBytes(bytes, "t.docx")
  const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
  const editor = new Editor({ extensions, content: opened.view.html })
  editors.push(editor)
  edit?.(editor)
  const saved = await saveDocxBytes({
    json: editor.getJSON(),
    chrome: opened.view.chrome,
    props: opened.view.props,
    word: opened.word,
    unchanged: false,
    fileName: "t.docx",
  })
  if (process.env.UNDERLINE_OUT && edit) {
    const { writeFileSync } = await import("node:fs")
    writeFileSync(process.env.UNDERLINE_OUT, saved.bytes)
  }
  const pkg = await openPackage(saved.bytes, "t.docx")
  return { editor, xml: decodeXml(findPart(pkg, pkg.mainPartName)!.data) }
}

function underlines(editor: Editor) {
  const found: string[] = []
  editor.state.doc.descendants((node) => {
    const mark = node.marks.find((item) => item.type.name === "underline")
    if (node.isText && mark) {
      found.push(`${mark.attrs.style}${mark.attrs.color ? ` ${mark.attrs.color}` : ""}`)
    }
  })
  return found
}

describe("underline types (U26)", () => {
  it("opens each of Word's types as itself, with its colour", async () => {
    const { editor } = await openAndSave(await underlined())
    expect(underlines(editor)).toEqual([...UNDERLINE_KINDS.map((kind) => kind.id), "thick #c00000"])
  })

  it("saves each type and colour back as Word wrote it", async () => {
    const { xml } = await openAndSave(await underlined())
    for (const kind of UNDERLINE_KINDS) {
      expect(xml).toContain(`<w:u w:val="${kind.word}"/></w:rPr><w:t>${kind.label} text`)
    }
    expect(xml).toMatch(/<w:u w:val="thick" w:color="C00000"\/>/)
  })

  it("saves a type and colour chosen in the editor, and new text's", async () => {
    const { xml } = await openAndSave(await underlined(), (editor) => {
      editor.commands.setTextSelection({ from: 1, to: 5 })
      editor.commands.setMark("underline", { style: "dotDotDash", color: "rgb(0, 112, 192)" })
      editor.commands.insertContentAt(editor.state.doc.content.size, '<p><u data-underline="words">typed here</u></p>')
    })
    expect(xml).toMatch(/<w:u w:val="dotDotDash" w:color="0070C0"\/><\/w:rPr><w:t>Sing<\/w:t>/)
    expect(xml).toMatch(/<w:u w:val="words"\/><\/w:rPr><w:t>typed here/)
  })

  it("draws heavy lines thicker and Words only with no line of its own", () => {
    expect(underlineCss("thick")).toContain("text-decoration-thickness")
    expect(underlineCss("dotDash")).toContain("text-decoration-style: dashed")
    expect(underlineCss("words")).toContain("text-decoration-line: none")
    expect(wordColorOf("#abc")).toBe("AABBCC")
  })

  it("underlines the words of Words only and not the spaces", () => {
    const editor = new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content: '<p><u data-underline="words">two words</u></p>',
    })
    editors.push(editor)
    const words = [...editor.view.dom.querySelectorAll(".underline-word")].map((node) => node.textContent)
    expect(words).toEqual(["two", "words"])
  })
})
