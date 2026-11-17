import { afterEach, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import { createExtensions } from "@/editor/extensions"
import { emptyChrome } from "@/document/header"
import { saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import {
  columnsForText,
  convertTextToTable,
  guessSeparator,
  insertTableWith,
  rememberTableDefaults,
  rowsForText,
  tableDefaults,
  textForTable,
} from "@/editor/table-insert"

let editor: Editor
afterEach(() => editor?.destroy())

const make = (content: string) => {
  editor = new Editor({ extensions: createExtensions(), content })
  return editor
}

function tableNode() {
  let found: ReturnType<typeof editor.state.doc.child> | null = null
  editor.state.doc.descendants((node) => {
    if (!found && node.type.name === "table") {
      found = node
    }
    return !found
  })
  return found! as ReturnType<typeof editor.state.doc.child>
}

function cellTexts() {
  const rows: string[][] = []
  tableNode().forEach((row) => {
    const cells: string[] = []
    row.forEach((cell) => cells.push(cell.textContent))
    rows.push(cells)
  })
  return rows
}

async function documentXml() {
  const saved = await saveDocxBytes({
    json: editor.getJSON(),
    chrome: emptyChrome(),
    word: null,
    unchanged: false,
    fileName: "t.docx",
  })
  const pkg = await openPackage(saved.bytes, "t.docx")
  return decodeXml(findPart(pkg, pkg.mainPartName)!.data)
}

describe("Insert Table…", () => {
  it("makes a table of the size asked for, with the caret in its first cell", () => {
    make("<p>before</p>")
    editor.commands.setTextSelection(3)
    expect(insertTableWith(editor, { rows: 3, columns: 4, autoFit: { kind: "fixed", widthCm: null } })).toBe(true)
    expect(cellTexts()).toHaveLength(3)
    expect(cellTexts()[0]).toHaveLength(4)
    expect(editor.state.selection.$from.node(-1).type.name).toMatch(/tableCell|tableHeader/)
    expect(tableNode().attrs.autoResize).toBe(true)
    expect(tableNode().attrs.prefWidth).toBeNull()
  })

  it("writes a fixed column width as fixed layout with that width", async () => {
    make("<p>x</p>")
    insertTableWith(editor, { rows: 1, columns: 2, autoFit: { kind: "fixed", widthCm: 2.54 } })
    const table = tableNode()
    expect(table.attrs.autoResize).toBe(false)
    expect(table.firstChild!.firstChild!.attrs.colwidth).toEqual([96])
    const xml = await documentXml()
    expect(xml).toContain('<w:tblLayout w:type="fixed"/>')
    expect(xml).toContain('<w:gridCol w:w="1440"/>')
  })

  it("makes AutoFit to window a table 100% of the text width", async () => {
    make("<p>x</p>")
    insertTableWith(editor, { rows: 2, columns: 2, autoFit: { kind: "window" } })
    expect(tableNode().attrs.prefWidth).toBe("100%")
    expect(await documentXml()).toContain('<w:tblW w:w="5000" w:type="pct"/>')
  })

  it("clamps sizes to Word's limits", () => {
    make("<p>x</p>")
    insertTableWith(editor, { rows: 0, columns: 99, autoFit: { kind: "contents" } })
    expect(cellTexts()).toHaveLength(1)
    expect(cellTexts()[0]).toHaveLength(63)
  })

  it("remembers dimensions only when asked", () => {
    rememberTableDefaults(null)
    expect(tableDefaults()).toMatchObject({ columns: 5, rows: 2, remembered: false })
    rememberTableDefaults({ columns: 3, rows: 7, autoFit: { kind: "window" } })
    expect(tableDefaults()).toMatchObject({ columns: 3, rows: 7, autoFit: { kind: "window" }, remembered: true })
    rememberTableDefaults(null)
    expect(tableDefaults().remembered).toBe(false)
  })
})

describe("Convert Text to Table…", () => {
  it("needs selected text outside a table", () => {
    make("<p>one</p>")
    expect(textForTable(editor)).toBeNull()
    editor.commands.selectAll()
    expect(textForTable(editor)?.blocks).toHaveLength(1)
  })

  it("splits at tabs, guessing tabs and the column count from the text", () => {
    const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] })
    editor = new Editor({
      extensions: createExtensions(),
      content: { type: "doc", content: [p("keep"), p("a\tb\tc"), p("d\te"), p("after")] },
    })
    // From inside "a…" to inside "d…".
    editor.commands.setTextSelection({ from: 8, to: 15 })
    const blocks = textForTable(editor)!.blocks
    expect(blocks.map((block) => block.textContent)).toEqual(["a\tb\tc", "d\te"])
    const separator = guessSeparator(blocks)
    expect(separator).toEqual({ kind: "tabs" })
    expect(columnsForText(blocks, separator)).toBe(3)
    expect(rowsForText(blocks, separator, 3)).toBe(2)
    convertTextToTable(editor, { separator, columns: 3, autoFit: { kind: "fixed", widthCm: null } })
    expect(cellTexts()).toEqual([
      ["a", "b", "c"],
      ["d", "e", ""],
    ])
    const outside: string[] = []
    editor.state.doc.forEach((node) => node.isTextblock && outside.push(node.textContent))
    expect(outside).toEqual(["keep", "after"])
    editor.commands.undo()
    expect(editor.state.doc.childCount).toBe(4)
  })

  it("splits at the editor's own tab nodes too", () => {
    const tab = { type: "docTab" }
    editor = new Editor({
      extensions: createExtensions(),
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "a" }, tab, { type: "text", text: "b" }] },
          { type: "paragraph", content: [{ type: "text", text: "c" }, tab, { type: "text", text: "d" }] },
        ],
      },
    })
    editor.commands.selectAll()
    const blocks = textForTable(editor)!.blocks
    expect(guessSeparator(blocks)).toEqual({ kind: "tabs" })
    expect(columnsForText(blocks, { kind: "tabs" })).toBe(2)
    convertTextToTable(editor, { separator: { kind: "tabs" }, columns: 2, autoFit: { kind: "fixed", widthCm: null } })
    expect(cellTexts()).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
  })

  it("splits at commas or any character and keeps the text's formatting", () => {
    make("<p><strong>Name</strong>,Age</p><p>Ann,30</p>")
    editor.commands.selectAll()
    const blocks = textForTable(editor)!.blocks
    expect(guessSeparator(blocks)).toEqual({ kind: "paragraphs" })
    convertTextToTable(editor, { separator: { kind: "commas" }, columns: 2, autoFit: { kind: "window" } })
    expect(cellTexts()).toEqual([
      ["Name", "Age"],
      ["Ann", "30"],
    ])
    const first = tableNode().firstChild!.firstChild!.firstChild!.firstChild!
    expect(first.marks.map((mark) => mark.type.name)).toContain("bold")

    make("<p>a-b-c-d</p>")
    editor.commands.selectAll()
    convertTextToTable(editor, { separator: { kind: "other", char: "-" }, columns: 2, autoFit: { kind: "contents" } })
    expect(cellTexts()).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
  })

  it("puts one paragraph in each cell, filling rows across", () => {
    make("<p>1</p><p>2</p><p>3</p>")
    editor.commands.selectAll()
    const blocks = textForTable(editor)!.blocks
    expect(rowsForText(blocks, { kind: "paragraphs" }, 2)).toBe(2)
    convertTextToTable(editor, {
      separator: { kind: "paragraphs" },
      columns: 2,
      autoFit: { kind: "fixed", widthCm: null },
    })
    expect(cellTexts()).toEqual([
      ["1", "2"],
      ["3", ""],
    ])
  })
})
