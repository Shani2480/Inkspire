import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"
import { insideSelection } from "@/components/object-context-menu"
import { TablePropertiesHost, openTableProperties } from "@/components/table-properties-dialog"
import { CellSelection } from "@tiptap/pm/tables"
import { applyTableDialog, tableDialogState } from "@/editor/table-dialog"
import { FramedTable, ShadedTableCell, ShadedTableHeader, SizedTableRow } from "@/editor/table-tools"

afterEach(cleanup)

const TABLE =
  '<table><tr><td colwidth="100"><p>a</p></td><td colwidth="200"><p>b</p></td></tr>' +
  '<tr><td colwidth="100"><p>c</p></td><td colwidth="200"><p>d</p></td></tr></table>'

function make() {
  const editor = new Editor({
    extensions: [StarterKit, FramedTable, SizedTableRow, ShadedTableCell, ShadedTableHeader],
    content: TABLE,
  })
  editor.commands.setTextSelection(4)
  return editor
}

const table = (editor: Editor) => editor.state.doc.firstChild!
const cellAt = (editor: Editor, row: number, column: number) => table(editor).child(row).child(column)

describe("Table Properties (22.10)", () => {
  it("reads the table, the rows and columns, and the cell the caret is in", () => {
    const editor = make()
    const state = tableDialogState(editor)!
    expect(state.rowRange).toEqual([0, 0])
    expect(state.columnRange).toEqual([0, 0])
    expect(state.drawn).toEqual([100, 200])
    expect(state.draft).toMatchObject({ align: "left", indent: 0, autoResize: true, valign: "top", noWrap: false })
    expect(state.draft.rows).toHaveLength(2)
    expect(state.draft.margins).toEqual({ top: 0, bottom: 0, left: 0.19, right: 0.19 })
    editor.destroy()
  })

  it("changes nothing when nothing differs", () => {
    const editor = make()
    const state = tableDialogState(editor)!
    const doc = editor.state.doc
    applyTableDialog(editor, state, state.draft)
    expect(editor.state.doc.eq(doc)).toBe(true)
    editor.destroy()
  })

  it("applies the whole draft as one step", () => {
    const editor = make()
    const state = tableDialogState(editor)!
    const rows = state.draft.rows.map((row, index) =>
      index === 1 ? { ...row, height: 1, rule: "exact" as const, cantSplit: true } : row,
    )
    applyTableDialog(editor, state, {
      ...state.draft,
      align: "left",
      indent: 1.5,
      cellSpacing: 0.2,
      autoResize: false,
      marginsSet: true,
      margins: { top: 0.1, bottom: 0.1, left: 0.3, right: 0.3 },
      rows,
      valign: "bottom",
      noWrap: true,
      prefWidth: { value: 600 / (96 / 2.54), unit: "cm" },
    })
    expect(table(editor).attrs).toMatchObject({
      indent: 1.5,
      cellSpacing: 0.2,
      autoResize: false,
      margins: "0.1,0.1,0.3,0.3",
    })
    expect(table(editor).child(1).attrs).toMatchObject({ height: 38, heightRule: "exact", cantSplit: true })
    expect(cellAt(editor, 0, 0).attrs).toMatchObject({ valign: "bottom", noWrap: true, colwidth: [200] })
    expect(cellAt(editor, 1, 1).attrs).toMatchObject({ valign: "top", noWrap: false, colwidth: [400] })
    editor.commands.undo()
    expect(table(editor).attrs.indent).toBeNull()
    expect(cellAt(editor, 0, 0).attrs.colwidth).toEqual([100])
    editor.destroy()
  })

  it("opens on the chosen tab and applies on OK; Cancel changes nothing", () => {
    const editor = make()
    render(<TablePropertiesHost />)
    act(() => openTableProperties(editor, "cell"))
    fireEvent.click(screen.getByRole("button", { name: "Center" }))
    fireEvent.click(screen.getByText("Cancel"))
    expect(cellAt(editor, 0, 0).attrs.valign).toBe("top")
    act(() => openTableProperties(editor, "cell"))
    fireEvent.click(screen.getByRole("button", { name: "Bottom" }))
    fireEvent.click(screen.getByText("OK"))
    expect(cellAt(editor, 0, 0).attrs.valign).toBe("bottom")
    editor.destroy()
  })

  it("sets a row's height and rule, and moves to the next row", () => {
    const editor = make()
    render(<TablePropertiesHost />)
    act(() => openTableProperties(editor, "row"))
    expect(screen.getByText("Row 1:")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Next Row/ }))
    expect(screen.getByText("Row 2:")).toBeTruthy()
    expect((screen.getByLabelText(/Repeat as header row/) as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText("Specify height:"))
    const box = screen.getByLabelText("Row height is:") as HTMLSelectElement
    fireEvent.change(box, { target: { value: "exact" } })
    fireEvent.click(screen.getByLabelText("Allow row to break across pages"))
    fireEvent.click(screen.getByText("OK"))
    expect(table(editor).child(0).attrs).toMatchObject({ heightRule: "atLeast", cantSplit: false })
    expect(table(editor).child(1).attrs).toMatchObject({ heightRule: "exact", cantSplit: true })
    expect(table(editor).child(1).attrs.height).toBeGreaterThan(0)
    editor.destroy()
  })

  it("sets the default margins and spacing in Table Options, and the cell's in Cell Options", () => {
    const editor = make()
    render(<TablePropertiesHost />)
    act(() => openTableProperties(editor, "table"))
    fireEvent.click(screen.getByRole("button", { name: "Options..." }))
    fireEvent.click(screen.getByLabelText("Allow spacing between cells"))
    fireEvent.click(screen.getByLabelText("Automatically resize to fit contents"))
    fireEvent.click(screen.getAllByText("OK").at(-1)!)
    fireEvent.click(screen.getByRole("tab", { name: "Cell" }))
    fireEvent.click(screen.getByRole("button", { name: "Options..." }))
    fireEvent.click(screen.getByLabelText("Wrap text"))
    fireEvent.click(screen.getByLabelText("Same as the whole table"))
    fireEvent.click(screen.getAllByText("OK").at(-1)!)
    fireEvent.click(screen.getByText("OK"))
    expect(table(editor).attrs).toMatchObject({ cellSpacing: 0.1, autoResize: false, margins: null })
    expect(cellAt(editor, 0, 0).attrs).toMatchObject({ noWrap: true, cellMargins: "0,0,0.19,0.19" })
    editor.destroy()
  })

  it("does not open outside a table", () => {
    const editor = new Editor({ extensions: [StarterKit], content: "<p>x</p>" })
    render(<TablePropertiesHost />)
    act(() => openTableProperties(editor))
    expect(screen.queryByText("Table Properties")).toBeNull()
    editor.destroy()
  })

  it("sets the table's alignment and alt text, and shows them again", () => {
    const editor = make()
    render(<TablePropertiesHost />)
    act(() => openTableProperties(editor, "table"))
    fireEvent.click(screen.getByRole("button", { name: "Right" }))
    expect((screen.getByLabelText("Indent from left:") as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("tab", { name: "Alt Text" }))
    fireEvent.change(screen.getByLabelText("Title:"), { target: { value: "Totals" } })
    fireEvent.change(screen.getByLabelText("Description:"), { target: { value: "Totals per row" } })
    fireEvent.click(screen.getByText("OK"))
    expect(table(editor).attrs).toMatchObject({ align: "right", altTitle: "Totals", altDesc: "Totals per row" })
    expect(editor.getHTML()).toContain('data-align="right"')
    editor.destroy()
  })

  it("counts a right-click on any selected cell as inside the selection, and one elsewhere as outside", () => {
    const editor = make()
    const doc = editor.state.doc
    const cells: number[] = []
    doc.descendants((node, pos) => {
      if (node.type.name === "tableCell") {
        cells.push(pos)
      }
    })
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(doc, cells[0]!, cells[3]!)))
    // The selection's own from and to cover only the first cell.
    expect(insideSelection(editor, cells[3]! + 2)).toBe(true)
    expect(insideSelection(editor, cells[1]! + 2)).toBe(true)
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.colSelection(doc.resolve(cells[0]!))))
    expect(insideSelection(editor, cells[2]! + 2)).toBe(true)
    expect(insideSelection(editor, cells[1]! + 2)).toBe(false)
    editor.commands.setTextSelection(cells[0]! + 2)
    expect(insideSelection(editor, cells[0]! + 2)).toBe(false)
    editor.destroy()
  })
})
