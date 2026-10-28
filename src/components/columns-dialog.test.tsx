import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ColumnsDialogHost, openColumnsDialog } from "@/components/columns-dialog"
import { Editor } from "@tiptap/core"
import { createExtensions } from "@/editor/extensions"
import { findColumnSection } from "@/editor/columns"
import { DEFAULT_PAGE_SETUP } from "@/document/page-setup"
import { useDocumentStore } from "@/document/store"

afterEach(cleanup)

describe("Columns dialog (22.7)", () => {
  it("applies the count, spacing and line between to the whole document", () => {
    useDocumentStore.getState().setPageSetup({ ...DEFAULT_PAGE_SETUP })
    render(<ColumnsDialogHost />)
    act(() => openColumnsDialog(null))
    fireEvent.click(screen.getByLabelText("Two"))
    fireEvent.change(screen.getByLabelText("Spacing"), { target: { value: "2" } })
    fireEvent.blur(screen.getByLabelText("Spacing"))
    fireEvent.click(screen.getByLabelText("Line between"))
    fireEvent.click(screen.getByText("OK"))
    expect(useDocumentStore.getState().pageSetup).toMatchObject({ columns: 2, columnGap: 2, columnLine: true })
  })

  it("Cancel changes nothing", () => {
    useDocumentStore.getState().setPageSetup({ ...DEFAULT_PAGE_SETUP })
    render(<ColumnsDialogHost />)
    act(() => openColumnsDialog(null))
    fireEvent.click(screen.getByLabelText("Three"))
    fireEvent.click(screen.getByText("Cancel"))
    expect(useDocumentStore.getState().pageSetup.columns).toBe(1)
  })

  it("previews the column count and the line between", () => {
    useDocumentStore.getState().setPageSetup({ ...DEFAULT_PAGE_SETUP })
    render(<ColumnsDialogHost />)
    act(() => openColumnsDialog(null))
    const preview = screen.getByTestId("columns-preview")
    expect(preview.querySelectorAll("span")).toHaveLength(1)
    fireEvent.click(screen.getByLabelText("Three"))
    expect(preview.querySelectorAll("span")).toHaveLength(3)
    expect(preview.querySelectorAll("i.rule")).toHaveLength(0)
    fireEvent.click(screen.getByLabelText("Line between"))
    expect(preview.querySelectorAll("i.rule")).toHaveLength(2)
  })

  it("offers Line between for selected text and keeps it on the section", () => {
    const editor = new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content: "<p>One</p><p>Two</p>",
    })
    editor.commands.selectAll()
    render(<ColumnsDialogHost />)
    act(() => openColumnsDialog(editor))
    fireEvent.change(screen.getByLabelText("Apply to"), { target: { value: "selection" } })
    fireEvent.click(screen.getByLabelText("Two"))
    const line = screen.getByLabelText("Line between") as HTMLInputElement
    expect(line.disabled).toBe(false)
    fireEvent.click(line)
    fireEvent.click(screen.getByText("OK"))
    expect(findColumnSection(editor.state)).toMatchObject({ columns: 2, line: true })
    expect(editor.getHTML()).toContain('data-line="1"')
    editor.destroy()
  })

  it("Left gives Word's narrow first column and saves the widths", () => {
    useDocumentStore.getState().setPageSetup({ ...DEFAULT_PAGE_SETUP })
    render(<ColumnsDialogHost />)
    act(() => openColumnsDialog(null))
    fireEvent.click(screen.getByLabelText("Left"))
    expect((screen.getByLabelText("Equal column width") as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByText("OK"))
    const setup = useDocumentStore.getState().pageSetup
    expect(setup.columns).toBe(2)
    const [narrow, wide] = setup.columnWidths ?? []
    expect(narrow.width).toBeLessThan(wide.width)
    // A third of the text width less two gaps; the wide one twice that plus a gap.
    expect(wide.width).toBeCloseTo(narrow.width * 2 + narrow.space, 1)
  })

  it("edits one column's width when Equal column width is cleared", () => {
    useDocumentStore.getState().setPageSetup({ ...DEFAULT_PAGE_SETUP })
    render(<ColumnsDialogHost />)
    act(() => openColumnsDialog(null))
    fireEvent.click(screen.getByLabelText("Three"))
    expect((screen.getByLabelText("Column 2 width") as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText("Equal column width"))
    const second = screen.getByLabelText("Column 2 width")
    fireEvent.change(second, { target: { value: "3" } })
    fireEvent.blur(second)
    fireEvent.click(screen.getByText("OK"))
    const widths = useDocumentStore.getState().pageSetup.columnWidths ?? []
    expect(widths.map((column) => column.width)[1]).toBe(3)
    // The third column took the difference; the first kept its width.
    expect(widths[2].width).toBeCloseTo(widths[0].width * 2 - 3, 1)
  })

  it("takes more than three columns", () => {
    useDocumentStore.getState().setPageSetup({ ...DEFAULT_PAGE_SETUP })
    render(<ColumnsDialogHost />)
    act(() => openColumnsDialog(null))
    const count = screen.getByLabelText("Number of columns:")
    fireEvent.change(count, { target: { value: "5" } })
    fireEvent.blur(count)
    fireEvent.click(screen.getByText("OK"))
    expect(useDocumentStore.getState().pageSetup).toMatchObject({ columns: 5, columnWidths: undefined })
  })

  it("This point forward puts the rest of the document in columns, after a column break", () => {
    const editor = new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content: "<p>One</p><p>Two</p><p>Three</p>",
    })
    editor.commands.setTextSelection(6)
    render(<ColumnsDialogHost />)
    act(() => openColumnsDialog(editor))
    fireEvent.change(screen.getByLabelText("Apply to"), { target: { value: "forward" } })
    fireEvent.click(screen.getByLabelText("Two"))
    fireEvent.click(screen.getByLabelText("Start new column"))
    fireEvent.click(screen.getByText("OK"))
    const json = editor.getJSON().content ?? []
    expect(json.slice(0, 3).map((node) => node.type)).toEqual(["paragraph", "columnBreak", "columnSection"])
    expect(json[2].content?.map((node) => node.content?.[0]?.text)).toEqual(["Two", "Three"])
    editor.destroy()
  })
})
