import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { afterEach, describe, expect, it } from "vitest"
import { TablePropertiesHost, openTableProperties } from "@/components/table-properties-dialog"
import { applyTableProperties, tableLayoutState } from "@/editor/table-layout"
import { FramedTable, ShadedTableCell, ShadedTableHeader, SizedTableRow } from "@/editor/table-tools"

afterEach(cleanup)

const TABLE = "<table><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></table>"

function make() {
  const editor = new Editor({
    extensions: [StarterKit, FramedTable, SizedTableRow, ShadedTableCell, ShadedTableHeader],
    content: TABLE,
  })
  editor.commands.setTextSelection(4)
  return editor
}

describe("Table Properties (22.10)", () => {
  it("applies the cell margins, gridlines, row height and vertical alignment that were changed", () => {
    const editor = make()
    const before = tableLayoutState(editor)!
    expect(before).toMatchObject({ cellPad: "normal", valign: "top", gridlines: true, rowHeightSet: false })
    applyTableProperties(editor, {
      cellPad: "wide",
      gridlines: false,
      headerRow: before.headerRow,
      rowHeightCm: 1.5,
      columnWidthCm: before.widthCm,
      valign: "middle",
      align: before.align,
      altTitle: before.altTitle,
      altDesc: before.altDesc,
    })
    const after = tableLayoutState(editor)!
    expect(after).toMatchObject({ cellPad: "wide", valign: "middle", gridlines: false, rowHeightSet: true })
    expect(after.heightCm).toBeCloseTo(1.5, 1)
    // Clearing the height lets the row follow its text again.
    applyTableProperties(editor, { ...before, cellPad: "wide", gridlines: false, rowHeightCm: null, valign: "middle" })
    expect(tableLayoutState(editor)!.rowHeightSet).toBe(false)
    editor.destroy()
  })

  it("changes nothing when nothing differs", () => {
    const editor = make()
    const before = tableLayoutState(editor)!
    const doc = editor.state.doc
    applyTableProperties(editor, {
      cellPad: before.cellPad,
      gridlines: before.gridlines,
      headerRow: before.headerRow,
      rowHeightCm: null,
      columnWidthCm: before.widthCm,
      valign: before.valign,
      align: before.align,
      altTitle: before.altTitle,
      altDesc: before.altDesc,
    })
    expect(editor.state.doc.eq(doc)).toBe(true)
    editor.destroy()
  })

  it("opens on the chosen tab and applies on OK; Cancel changes nothing", () => {
    const editor = make()
    render(<TablePropertiesHost />)
    act(() => openTableProperties(editor, "cell"))
    fireEvent.click(screen.getByRole("button", { name: "Center" }))
    fireEvent.click(screen.getByText("Cancel"))
    expect(tableLayoutState(editor)!.valign).toBe("top")
    act(() => openTableProperties(editor, "cell"))
    fireEvent.click(screen.getByRole("button", { name: "Bottom" }))
    fireEvent.click(screen.getByText("OK"))
    expect(tableLayoutState(editor)!.valign).toBe("bottom")
    editor.destroy()
  })

  it("sets the row height from the Row tab", () => {
    const editor = make()
    render(<TablePropertiesHost />)
    act(() => openTableProperties(editor, "row"))
    fireEvent.click(screen.getByLabelText("Specify height"))
    fireEvent.change(screen.getByLabelText("Row height in centimetres"), { target: { value: "2" } })
    fireEvent.click(screen.getByText("OK"))
    expect(tableLayoutState(editor)!.heightCm).toBeCloseTo(2, 1)
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
    expect(tableLayoutState(editor)).toMatchObject({ align: "left", altTitle: "", altDesc: "" })
    render(<TablePropertiesHost />)
    act(() => openTableProperties(editor, "table"))
    fireEvent.click(screen.getByRole("button", { name: "Right" }))
    fireEvent.click(screen.getByRole("tab", { name: "Alt Text" }))
    fireEvent.change(screen.getByLabelText("Alt text title"), { target: { value: "Totals" } })
    fireEvent.change(screen.getByLabelText("Alt text description"), { target: { value: "Totals per row" } })
    fireEvent.click(screen.getByText("OK"))
    expect(tableLayoutState(editor)).toMatchObject({ align: "right", altTitle: "Totals", altDesc: "Totals per row" })
    expect(editor.getHTML()).toContain('data-align="right"')
    expect(editor.getHTML()).toContain('data-alt-title="Totals"')
    editor.destroy()
  })
})
