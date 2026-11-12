import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { createExtensions } from "@/editor/extensions"
import { columnsForSection } from "@/editor/columns"
import { emptyChrome } from "@/document/header"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")
const PAGE = `<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>`
const para = (text: string, sectPr = "") =>
  `<w:p>${sectPr ? `<w:pPr>${sectPr}</w:pPr>` : ""}<w:r><w:t>${text}</w:t></w:r></w:p>`

/** Two sections on A4 pages, each starting a page: two columns, then three. */
function twoThenThree() {
  const first = `<w:sectPr>${PAGE}<w:cols w:num="2" w:space="708"/></w:sectPr>`
  return withBody(
    para("Two columns A") +
      para("Two columns B", first) +
      para("Three columns A") +
      para("Three columns B") +
      `<w:sectPr>${PAGE}<w:cols w:num="3" w:space="567"/></w:sectPr>`,
  )
}

/** f15 with the given body. */
async function withBody(body: string) {
  const bytes = new Uint8Array(readFileSync(path.join(AUTHORED, "f15_sections.docx")))
  const pkg = await openPackage(bytes, "f15_sections.docx")
  const part = findPart(pkg, "/word/document.xml")!
  part.data = new TextEncoder().encode(
    decodeXml(part.data).replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${body}</w:body>`),
  )
  return openDocxBytes(await writePackage(pkg), "sections.docx")
}

const editors: Editor[] = []
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

function editorFor(html: string) {
  const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
  const editor = new Editor({ extensions, content: html })
  editors.push(editor)
  return editor
}

async function saved(opened: Awaited<ReturnType<typeof twoThenThree>>, editor: Editor) {
  const result = await saveDocxBytes({
    json: editor.getJSON(),
    chrome: opened.view.chrome,
    props: opened.view.props,
    word: opened.word,
    unchanged: false,
    fileName: "edited.docx",
  })
  const pkg = await openPackage(result.bytes, "edited.docx")
  const xml = decodeXml(findPart(pkg, pkg.mainPartName)!.data)
  return { bytes: result.bytes, xml, sectPrs: xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g) ?? [] }
}

function blocks(editor: Editor) {
  const found: { pos: number; columns: number; text: string }[] = []
  editor.state.doc.forEach((node, pos) => {
    if (node.type.name === "columnSection") {
      found.push({ pos, columns: Number(node.attrs.columns), text: node.textContent })
    }
  })
  return found
}

describe("sections of other columns as blocks of columns (option 2, phase 2)", () => {
  it("opens each page-starting section of its own columns as a block, on pages of one column", async () => {
    const opened = await twoThenThree()
    expect(opened.view.chrome.pageSetup.columns).toBe(1)
    expect(opened.view.chrome.sections?.[0]?.columns).toBe(1)
    const editor = editorFor(opened.view.html)
    expect(blocks(editor).map(({ columns, text }) => [columns, text])).toEqual([
      [2, "Two columns ATwo columns B"],
      [3, "Three columns AThree columns B"],
    ])
    // The break to the next page sits between the blocks.
    const kinds: string[] = []
    editor.state.doc.forEach((node) => kinds.push(node.type.name))
    expect(kinds.slice(0, 3)).toEqual(["columnSection", "sectionBreak", "columnSection"])
  })

  it("saves each block as its section's own w:cols, with no extra section", async () => {
    const opened = await twoThenThree()
    const { sectPrs, bytes } = await saved(opened, editorFor(opened.view.html))
    expect(sectPrs).toHaveLength(2)
    expect(sectPrs[0]).toMatch(/<w:cols w:num="2" w:space="708"\/>/)
    expect(sectPrs[1]).toMatch(/<w:cols w:num="3" w:space="567"\/>/)
    if (process.env.SAVE_SECTION_DOCX) {
      const { writeFileSync } = await import("node:fs")
      writeFileSync(process.env.SAVE_SECTION_DOCX, bytes)
    }
  })

  it("saves a block's new columns into its section, and one column once the block is gone", async () => {
    const opened = await twoThenThree()
    const editor = editorFor(opened.view.html)
    const [first, last] = blocks(editor)
    editor.view.dispatch(editor.state.tr.setNodeAttribute(first!.pos, "columns", 4))
    let result = await saved(opened, editor)
    expect(result.sectPrs).toHaveLength(2)
    expect(result.sectPrs[0]).toMatch(/<w:cols [^>]*w:num="4"/)
    expect(result.sectPrs[1]).toMatch(/<w:cols w:num="3" w:space="567"\/>/)
    // The last section's block taken away: the body's section is one column.
    const node = editor.state.doc.nodeAt(last!.pos)!
    editor.view.dispatch(editor.state.tr.replaceWith(last!.pos, last!.pos + node.nodeSize, node.content))
    result = await saved(opened, editor)
    expect(result.sectPrs).toHaveLength(2)
    expect(result.sectPrs[1]).not.toMatch(/w:num=/)
    expect(result.xml).toContain("Three columns A")
  })

  it("keeps a one-column title above two columns, then three columns on the next page", async () => {
    const opened = await withBody(
      para("Title", `<w:sectPr>${PAGE}<w:cols w:space="708"/></w:sectPr>`) +
        para("Two columns A") +
        para(
          "Two columns B",
          `<w:sectPr><w:type w:val="continuous"/>${PAGE}<w:cols w:num="2" w:space="708"/></w:sectPr>`,
        ) +
        para("Three columns A") +
        `<w:sectPr>${PAGE}<w:cols w:num="3" w:space="567"/></w:sectPr>`,
    )
    const editor = editorFor(opened.view.html)
    const kinds: string[] = []
    editor.state.doc.forEach((node) => kinds.push(node.type.name))
    expect(kinds.slice(0, 4)).toEqual(["paragraph", "columnSection", "sectionBreak", "columnSection"])
    expect(blocks(editor).map((item) => item.columns)).toEqual([2, 3])
    const { sectPrs } = await saved(opened, editor)
    expect(sectPrs).toHaveLength(3)
    expect(sectPrs[0]).toMatch(/<w:cols w:space="708"\/>/)
    expect(sectPrs[1]).toMatch(/<w:type w:val="continuous"\/>[\s\S]*<w:cols w:num="2" w:space="708"\/>/)
    expect(sectPrs[2]).toMatch(/<w:cols w:num="3" w:space="567"\/>/)
  })

  it("makes the caret's section a block of columns with Columns > This section", async () => {
    const opened = await twoThenThree()
    const editor = editorFor(opened.view.html)
    const last = blocks(editor)[1]!
    const node = editor.state.doc.nodeAt(last.pos)!
    editor.view.dispatch(editor.state.tr.replaceWith(last.pos, last.pos + node.nodeSize, node.content))
    editor.commands.setTextSelection(last.pos + 2)
    expect(columnsForSection(editor, 4, 1, true)).toBe(true)
    expect(blocks(editor).map((item) => [item.columns, item.text])).toEqual([
      [2, "Two columns ATwo columns B"],
      [4, "Three columns AThree columns B"],
    ])
    // Not again inside a block, nor over a page break.
    expect(columnsForSection(editor, 3, 1, false)).toBe(false)
    const { sectPrs } = await saved(opened, editor)
    expect(sectPrs).toHaveLength(2)
    expect(sectPrs[1]).toMatch(/<w:cols [^>]*w:num="4"[^>]*w:sep="1"|<w:cols [^>]*w:sep="1"[^>]*w:num="4"/)
  })

  it("saves a block made between two page breaks as that section's columns", async () => {
    const editor = editorFor(
      '<p>Title page</p><div data-section-break="" data-kind="nextPage"></div>' +
        '<div data-column-section="" data-columns="3" data-gap="1"><p>In three columns</p></div>' +
        '<div data-section-break="" data-kind="nextPage"></div><p>After</p>',
    )
    const result = await saveDocxBytes({
      json: editor.getJSON(),
      chrome: emptyChrome(),
      props: {},
      word: null,
      unchanged: false,
      fileName: "new.docx",
    })
    const pkg = await openPackage(result.bytes, "new.docx")
    const xml = decodeXml(findPart(pkg, pkg.mainPartName)!.data)
    const sectPrs = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g) ?? []
    // Three sections, not a fourth continuous one around the block.
    expect(sectPrs).toHaveLength(3)
    expect(sectPrs[0]).not.toMatch(/w:num=/)
    expect(sectPrs[1]).toMatch(/w:num="3"/)
    expect(sectPrs[1]).not.toMatch(/continuous/)
    expect(sectPrs[2]).not.toMatch(/w:num=/)
  })
})
