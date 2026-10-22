import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { TableRow } from "@tiptap/extension-table"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BordersMenu, borderLabel } from "@/components/table-design-menus"
import { DEFAULT_PEN, FramedTable, ShadedTableCell, ShadedTableHeader } from "@/editor/table-tools"

function tableEditor() {
  const editor = new Editor({
    extensions: [StarterKit, FramedTable, TableRow, ShadedTableCell, ShadedTableHeader],
    content: "<table><tr><td><p>a</p></td><td><p>b</p></td></tr></table>",
  })
  editor.commands.setTextSelection(3)
  return editor
}

describe("Borders menu (22.3)", () => {
  afterEach(cleanup)

  it("lists Word's borders, Horizontal Line, Draw Table, View Gridlines and Borders and Shading…", () => {
    const editor = tableEditor()
    render(<BordersMenu editor={editor} pen={DEFAULT_PEN} close={() => {}} gridlines onGridlines={() => {}} />)
    const labels = screen.getAllByRole("button").map((item) => item.textContent)
    expect(labels).toEqual([
      "Bottom Border",
      "Top Border",
      "Left Border",
      "Right Border",
      "No Border",
      "All Borders",
      "Outside Borders",
      "Inside Borders",
      "Inside Horizontal Border",
      "Inside Vertical Border",
      "Diagonal Down Border",
      "Diagonal Up Border",
      "Horizontal Line",
      "Draw Table",
      "View Gridlines",
      "Borders and Shading…",
    ])
    editor.destroy()
  })

  it("applies the chosen border, tells which one, and closes", () => {
    const editor = tableEditor()
    const close = vi.fn()
    const onPick = vi.fn()
    render(
      <BordersMenu editor={editor} pen={DEFAULT_PEN} close={close} gridlines onGridlines={() => {}} onPick={onPick} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Top Border" }))
    expect(editor.getHTML()).toContain('data-borders="top"')
    expect(onPick).toHaveBeenCalledWith("top")
    expect(close).toHaveBeenCalled()
    expect(borderLabel("top")).toBe("Top Border")
    expect(borderLabel("insideH")).toBe("Inside Horizontal Border")
    editor.destroy()
  })

  it("Draw Table puts a table in", () => {
    const editor = new Editor({
      extensions: [StarterKit, FramedTable, TableRow, ShadedTableCell, ShadedTableHeader],
      content: "<p>Text</p>",
    })
    render(<BordersMenu editor={editor} pen={DEFAULT_PEN} close={() => {}} gridlines onGridlines={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Draw Table" }))
    expect(editor.getHTML()).toContain("<table")
    expect(editor.getHTML().match(/<tr>/g)).toHaveLength(3)
    editor.destroy()
  })
})
