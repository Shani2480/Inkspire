import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ColumnsDialogHost, openColumnsDialog } from "@/components/columns-dialog"
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
})
