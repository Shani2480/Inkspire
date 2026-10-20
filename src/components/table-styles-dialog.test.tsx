import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { TableRow } from "@tiptap/extension-table"
import { afterEach, describe, expect, it } from "vitest"
import { TableStylesDialog, useTableStylesDialog } from "@/components/table-design-menus"
import { FramedTable, ShadedTableCell, ShadedTableHeader } from "@/editor/table-tools"

describe("Table Styles dialog", () => {
  afterEach(cleanup)

  it("applies the chosen style to the table the cursor is in", () => {
    const editor = new Editor({
      extensions: [StarterKit, FramedTable, TableRow, ShadedTableCell, ShadedTableHeader],
      content: "<table><tr><td><p>a</p></td></tr></table>",
    })
    editor.commands.setTextSelection(3)
    render(<TableStylesDialog editor={editor} />)
    expect(screen.queryByRole("listbox")).toBeNull()
    act(() => useTableStylesDialog.getState().show())
    fireEvent.click(screen.getByRole("option", { name: /Teal Table/ }))
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))
    expect(editor.getHTML()).toContain('data-look="teal"')
    expect(useTableStylesDialog.getState().open).toBe(false)
    editor.destroy()
  })
})
