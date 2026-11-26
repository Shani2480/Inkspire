import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import type { Table } from "@/document/docx/model"
import { editorToWord, wordToEditor } from "@/document/docx/project"
import { readWordXml } from "@/document/docx/wml-read"
import { emptyChrome } from "@/document/header"
import { createExtensions } from "@/editor/extensions"
import { fitContentMode } from "@/editor/table-props"

// An autofit table whose cells give no width: Word sets its columns to their text, not to the grid it wrote (a
// statement of work's signature table, measured in Word). With cell widths, or a fixed layout, Word keeps the grid.
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

function wordTable({ cellWidths = false, fixed = false, tableWidth = '<w:tblW w:type="dxa" w:w="9026"/>' } = {}) {
  const cell = (text: string, width: number) =>
    `<w:tc><w:tcPr>${cellWidths ? `<w:tcW w:w="${width}" w:type="dxa"/>` : ""}</w:tcPr>` +
    `<w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`
  const body =
    `<w:tbl><w:tblPr>${tableWidth}${fixed ? '<w:tblLayout w:type="fixed"/>' : ""}</w:tblPr>` +
    '<w:tblGrid><w:gridCol w:w="2250"/><w:gridCol w:w="3390"/><w:gridCol w:w="3390"/></w:tblGrid>' +
    `<w:tr>${cell("Signatory Name:", 2250)}${cell("A. Person", 3390)}${cell("[Client Signatory]", 3390)}</w:tr>` +
    "</w:tbl><w:p/>"
  return readWordXml({ documentXml: `<w:document ${W}><w:body>${body}</w:body></w:document>` })
}

const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

function opened(doc: ReturnType<typeof wordTable>) {
  const editor = new Editor({
    extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
    content: wordToEditor(doc).html,
  })
  editors.push(editor)
  return editor
}

function tableNode(editor: Editor) {
  let found: Parameters<typeof fitContentMode>[0] | null = null
  editor.state.doc.descendants((node) => {
    if (node.type.name === "table") {
      found = node
    }
  })
  return found!
}

describe("a Word table set to its text", () => {
  it("is drawn by its text while its columns keep the widths it opened with", () => {
    const editor = opened(wordTable())
    expect(fitContentMode(tableNode(editor))).toBe("fill")
  })

  it("shrinks to its text when it has no width of its own", () => {
    expect(fitContentMode(tableNode(opened(wordTable({ tableWidth: "" }))))).toBe("auto")
  })

  it("keeps the grid with cell widths or a fixed layout, as Word does", () => {
    expect(fitContentMode(tableNode(opened(wordTable({ cellWidths: true }))))).toBeNull()
    expect(fitContentMode(tableNode(opened(wordTable({ fixed: true }))))).toBeNull()
  })

  it("is saved without cell widths, so Word sets it to its text again", () => {
    const source = wordTable()
    const editor = opened(source)
    const saved = editorToWord(editor.getJSON(), emptyChrome(), {}, source)
    const table = saved.blocks.find((block): block is Table => block.kind === "table")!
    expect(table.rows[0]!.cells.map((cell) => cell.width)).toEqual([undefined, undefined, undefined])
  })

  it("keeps the widths a person gives its columns", () => {
    const editor = opened(wordTable())
    const table = tableNode(editor)
    let pos = -1
    editor.state.doc.descendants((node, at) => {
      if (node.type.name === "tableCell" && pos < 0) {
        pos = at
      }
    })
    const cell = editor.state.doc.nodeAt(pos)!
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...cell.attrs, colwidth: [200] }))
    expect(fitContentMode(tableNode(editor))).toBeNull()
    expect(table).not.toBe(tableNode(editor))
  })
})
