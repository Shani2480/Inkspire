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
})
