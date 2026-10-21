import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { OptionsDialog } from "@/components/options-dialog"
import { useOptionsDialog } from "@/document/options-dialog"

describe("Options dialog (22.9)", () => {
  afterEach(() => {
    cleanup()
    useOptionsDialog.getState().closeOptions()
  })

  it("is not shown until opened, then shows the pages in a modal", () => {
    render(<OptionsDialog />)
    expect(screen.queryByRole("dialog")).toBeNull()
    act(() => useOptionsDialog.getState().openOptions("proofing"))
    const dialog = screen.getByRole("dialog", { name: "Options" })
    expect(dialog.getAttribute("aria-modal")).toBe("true")
    expect(screen.getByRole("button", { name: "Proofing" }).getAttribute("aria-current")).toBe("page")
  })

  it("closes with the Close button and with Esc", () => {
    render(<OptionsDialog />)
    act(() => useOptionsDialog.getState().openOptions())
    fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!)
    expect(useOptionsDialog.getState().open).toBe(false)
    act(() => useOptionsDialog.getState().openOptions())
    fireEvent.keyDown(window, { key: "Escape" })
    expect(useOptionsDialog.getState().open).toBe(false)
  })
})
