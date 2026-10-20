import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { readDocument } from "@/document/docx/wml-read"
import { writeDocument } from "@/document/docx/wml-write"
import { decodeXml } from "@/document/docx/xml"
import { createExtensions } from "@/editor/extensions"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")

const NESTED_TABLE =
  `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>` +
  `<w:tr><w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/><w:vAlign w:val="bottom"/></w:tcPr>` +
  `<w:p><w:r><w:t>NESTED</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p/>`

/**
 * f06 with markup the model does not cover, the way Word writes it: a table style, cell margins, vertical
 * alignment, conditional formatting and row height; a table nested in a cell; a bordered and shaded paragraph
 * with a symbol, a smart tag, custom XML and a run ending in a space; and a bookmark between body paragraphs.
 */
async function richTable() {
  const name = "f06_table.docx"
  const pkg = await openPackage(new Uint8Array(readFileSync(path.join(AUTHORED, name))), name)
  const part = findPart(pkg, pkg.mainPartName)!
  const xml = decodeXml(part.data)
    .replace(
      /<w:p\b[^>]*><w:r><w:t>BEFORE<\/w:t><\/w:r><\/w:p>/,
      `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="FF0000"/></w:pBdr>` +
        `<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/></w:pPr><w:r><w:t>BEFORE</w:t></w:r>` +
        `<w:r><w:sym w:font="Wingdings" w:char="F0E0"/></w:r>` +
        `<w:smartTag w:uri="urn:x" w:element="place"><w:r><w:t>Paris</w:t></w:r></w:smartTag>` +
        `<w:customXml w:element="tag"><w:r><w:t>CX</w:t></w:r></w:customXml>` +
        `<w:r><w:t xml:space="preserve"> end </w:t></w:r></w:p>` +
        `<w:bookmarkStart w:id="90" w:name="between"/><w:bookmarkEnd w:id="90"/>`,
    )
    .replace("<w:tblPr>", `<w:tblPr><w:tblStyle w:val="GridTable4"/>`)
    .replace("<w:trPr><w:tblHeader/>", `<w:trPr><w:trHeight w:val="600"/><w:tblHeader/>`)
    .replace(
      /(<w:tcPr>)(<w:tcW w:w="6017" w:type="dxa"\/><w:gridSpan w:val="2"\/>)(<w:shd [^>]*\/>)(<\/w:tcPr>)/,
      `$1<w:cnfStyle w:val="100000000000"/>$2$3<w:tcMar><w:left w:w="200" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/>$4`,
    )
    .replace(/(<w:t>c12<\/w:t><\/w:r><\/w:p>)/, `$1${NESTED_TABLE}`)
  part.data = new TextEncoder().encode(xml)
  return writePackage(pkg)
}

const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

async function openInEditor(bytes: Uint8Array) {
  const opened = await openDocxBytes(bytes, "rich.docx")
  const editor = new Editor({
    extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
    content: opened.view.html,
    // As the app opens Word documents: every space is text.
    parseOptions: { preserveWhitespace: "full" },
  })
  editors.push(editor)
  return { opened, editor }
}

async function save(opened: Awaited<ReturnType<typeof openDocxBytes>>, editor: Editor) {
  const saved = await saveDocxBytes({
    json: editor.getJSON(),
    chrome: opened.view.chrome,
    props: opened.view.props,
    word: opened.word,
    unchanged: false,
    fileName: "rich.docx",
  })
  const pkg = await openPackage(saved.bytes, "rich.docx")
  return decodeXml(findPart(pkg, pkg.mainPartName)!.data)
}

function positionOf(editor: Editor, text: string) {
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text?.includes(text)) {
      at = pos + node.text.indexOf(text)
    }
  })
  return at
}

function appendParagraph(editor: Editor) {
  editor
    .chain()
    .insertContentAt(editor.state.doc.content.size, { type: "paragraph", content: [{ type: "text", text: "ADDED" }] })
    .run()
}

const KEPT = [
  `<w:tblStyle w:val="GridTable4"/>`,
  `<w:trHeight w:val="600"/>`,
  `<w:cnfStyle w:val="100000000000"/>`,
  `<w:tcMar><w:left w:w="200" w:type="dxa"/></w:tcMar>`,
  `<w:vAlign w:val="center"/>`,
  `<w:vAlign w:val="bottom"/>`,
  `<w:t>NESTED</w:t>`,
  `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="FF0000"/></w:pBdr>`,
  `<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>`,
  `<w:sym w:font="Wingdings" w:char="F0E0"/>`,
  `<w:customXml w:element="tag">`,
  `<w:t>Paris</w:t>`,
  `<w:t xml:space="preserve"> end </w:t>`,
  `<w:bookmarkStart w:id="90" w:name="between"/>`,
]

describe("markup the editor does not model", () => {
  it("survives reading and writing", async () => {
    const pkg = await openPackage(await richTable(), "rich.docx")
    const written = writeDocument(readDocument(pkg))
    const xml = decodeXml(findPart(written, written.mainPartName)!.data)
    for (const markup of KEPT) {
      expect(xml, markup).toContain(markup)
    }
    expect(xml.match(/<w:tbl>/g)).toHaveLength(2)
  })

  it("survives an edit elsewhere in the editor", async () => {
    const { opened, editor } = await openInEditor(await richTable())
    appendParagraph(editor)
    const xml = await save(opened, editor)
    for (const markup of KEPT) {
      expect(xml, markup).toContain(markup)
    }
    expect(xml.match(/<w:tbl>/g)).toHaveLength(2)
  })

  it("keeps a cell's properties when its text changes", async () => {
    const { opened, editor } = await openInEditor(await richTable())
    const at = positionOf(editor, "c11")
    editor.chain().insertContentAt(at, "edited ").run()
    const xml = await save(opened, editor)
    expect(xml).toContain("edited c11")
    expect(xml).toContain(`<w:vAlign w:val="center"/>`)
    expect(xml).toContain(`<w:cnfStyle w:val="100000000000"/>`)
  })

  it("rewrites only the property that changed", async () => {
    const { opened, editor } = await openInEditor(await richTable())
    const at = positionOf(editor, "BEFORE")
    editor.chain().setTextSelection(at).updateAttributes("paragraph", { textAlign: "center" }).run()
    const xml = await save(opened, editor)
    const pPr = /<w:pPr>(.*?)<\/w:pPr>/.exec(xml)?.[1] ?? ""
    // Borders and shading stay where Word put them; the new alignment takes its place in schema order.
    expect(pPr).toBe(
      `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="FF0000"/></w:pBdr>` +
        `<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/><w:jc w:val="center"/>`,
    )
  })

  it("shows a symbol's character and keeps text inside a smart tag editable", async () => {
    const { opened, editor } = await openInEditor(await richTable())
    expect(opened.view.html).toContain("")
    expect(editor.getText()).toContain("Paris")
  })
})
