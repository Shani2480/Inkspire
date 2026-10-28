import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { TableMap } from "@tiptap/pm/tables"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { describe, expect, it } from "vitest"
import { FramedTable, ShadedTableCell, ShadedTableHeader, SizedTableRow, StyledTableView } from "@/editor/table-tools"
import { eraseBetween, insertDrawnTable, splitCellAcross, splitCellDown } from "@/editor/table-draw"

function tableEditor(rows: string) {
  return new Editor({
    extensions: [StarterKit, FramedTable, SizedTableRow, ShadedTableCell, ShadedTableHeader],
    content: `<table>${rows}</table>`,
  })
}

const TWO_BY_TWO = "<tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr>"

function tableOf(editor: Editor) {
  let found: { node: ProseNode; pos: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (!found && node.type.name === "table") {
      found = { node, pos }
    }
  })
  return found as unknown as { node: ProseNode; pos: number }
}

function cells(editor: Editor) {
  const list: { pos: number; text: string; colspan: number; rowspan: number; colwidth: number[] | null }[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "tableCell") {
      list.push({
        pos,
        text: node.textContent,
        ...(node.attrs as { colspan: number; rowspan: number; colwidth: number[] | null }),
      })
    }
  })
  return list
}

function grid(editor: Editor) {
  const map = TableMap.get(tableOf(editor).node)
  return { width: map.width, height: map.height, problems: map.problems ?? null }
}

describe("Draw Table: splitting a cell with a drawn line", () => {
  it("an up-and-down line through a cell adds a grid column, and the cell below it spans both", () => {
    const editor = tableEditor(TWO_BY_TWO)
    const table = tableOf(editor)
    const first = cells(editor)[0]!
    const tr = editor.state.tr
    expect(splitCellDown(tr, table.pos, first.pos, [100, 100], 40)).toBe(true)
    editor.view.dispatch(tr)
    expect(grid(editor)).toEqual({ width: 3, height: 2, problems: null })
    const after = cells(editor)
    expect(after.map((cell) => [cell.text, cell.colspan, cell.colwidth])).toEqual([
      ["a", 1, [40]],
      ["", 1, [60]],
      ["b", 1, null],
      ["c", 2, [40, 60]],
      ["d", 1, null],
    ])
    editor.destroy()
  })

  it("a line on a column edge inside a merged cell divides the cell there, keeping the grid", () => {
    const editor = tableEditor(
      '<tr><td colspan="2" colwidth="100,100"><p>a</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr>',
    )
    const table = tableOf(editor)
    const tr = editor.state.tr
    expect(splitCellDown(tr, table.pos, cells(editor)[0]!.pos, [100, 100], 101)).toBe(true)
    editor.view.dispatch(tr)
    expect(grid(editor)).toEqual({ width: 2, height: 2, problems: null })
    expect(
      cells(editor)
        .slice(0, 2)
        .map((cell) => [cell.text, cell.colspan, cell.colwidth]),
    ).toEqual([
      ["a", 1, [100]],
      ["", 1, [100]],
    ])
    editor.destroy()
  })

  it("a line along a cell's own border splits nothing", () => {
    const editor = tableEditor(TWO_BY_TWO)
    const table = tableOf(editor)
    const tr = editor.state.tr
    expect(splitCellDown(tr, table.pos, cells(editor)[0]!.pos, [100, 100], 98)).toBe(false)
    expect(tr.docChanged).toBe(false)
    editor.destroy()
  })

  it("a side-to-side line through a cell adds a row, and the cell beside it spans both", () => {
    const editor = tableEditor(TWO_BY_TWO)
    const table = tableOf(editor)
    const tr = editor.state.tr
    expect(splitCellAcross(tr, table.pos, cells(editor)[0]!.pos, 0, false)).toBe(true)
    editor.view.dispatch(tr)
    expect(grid(editor)).toEqual({ width: 2, height: 3, problems: null })
    expect(cells(editor).map((cell) => [cell.text, cell.rowspan])).toEqual([
      ["a", 1],
      ["b", 2],
      ["", 1],
      ["c", 1],
      ["d", 1],
    ])
    editor.destroy()
  })

  it("a side-to-side line along a row edge inside a cell spanning rows divides it there", () => {
    const editor = tableEditor('<tr><td rowspan="2"><p>a</p></td><td><p>b</p></td></tr><tr><td><p>d</p></td></tr>')
    const table = tableOf(editor)
    const tr = editor.state.tr
    expect(splitCellAcross(tr, table.pos, cells(editor)[0]!.pos, 1, true)).toBe(true)
    editor.view.dispatch(tr)
    expect(grid(editor)).toEqual({ width: 2, height: 2, problems: null })
    expect(cells(editor).map((cell) => [cell.text, cell.rowspan])).toEqual([
      ["a", 1],
      ["b", 1],
      ["", 1],
      ["d", 1],
    ])
    editor.destroy()
  })
})

describe("Eraser", () => {
  it("merges two cells side by side", () => {
    const editor = tableEditor(TWO_BY_TWO)
    const [a, b] = cells(editor)
    expect(eraseBetween(editor, a!.pos, b!.pos)).toBe(true)
    expect(cells(editor)[0]).toMatchObject({ colspan: 2 })
    expect(cells(editor)).toHaveLength(3)
    // One undo step, leaving the text cursor in the merged cell rather than a cell selection.
    expect(editor.state.selection.empty).toBe(true)
    editor.commands.undo()
    expect(cells(editor)).toHaveLength(4)
    editor.destroy()
  })

  it("leaves cells alone that would not make a rectangle on their own", () => {
    const editor = tableEditor(TWO_BY_TWO)
    const all = cells(editor)
    expect(eraseBetween(editor, all[0]!.pos, all[3]!.pos)).toBe(false)
    expect(cells(editor)).toHaveLength(4)
    editor.destroy()
  })
})

describe("Draw Table: a box drawn on the page", () => {
  it("becomes a one-cell table that size, set in as far as the box starts", () => {
    const editor = new Editor({
      extensions: [StarterKit, FramedTable, SizedTableRow, ShadedTableCell, ShadedTableHeader],
      content: "<p>x</p>",
    })
    insertDrawnTable(editor, editor.state.doc.content.size, 240, 60, 96 / 2.54)
    const table = tableOf(editor)
    expect(table.node.attrs.indent).toBe(1)
    expect(table.node.firstChild!.attrs.height).toBe(60)
    expect(cells(editor)[0]).toMatchObject({ colspan: 1, rowspan: 1, colwidth: [240] })
    editor.destroy()
  })
})

describe("a table set in from the margin", () => {
  it("shows its indent (the float reset no longer clears it)", () => {
    const editor = new Editor({
      extensions: [
        StarterKit,
        FramedTable.configure({ resizable: true, View: StyledTableView }),
        SizedTableRow,
        ShadedTableCell,
        ShadedTableHeader,
      ],
      content: "<p>x</p>",
    })
    insertDrawnTable(editor, editor.state.doc.content.size, 240, 60, 96 / 2.54)
    expect(editor.view.dom.querySelector("table")!.style.marginLeft).toBe("1cm")
    editor.destroy()
  })
})
