import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { CustomizeDialogHost, openCustomize } from "@/components/customize-dialog"
import { defaults, useCustomize } from "@/document/customize"

afterEach(() => {
  cleanup()
  useCustomize.getState().reset()
  localStorage.clear()
})

describe("Customize the Ribbon and Quick Access Toolbar (22.5)", () => {
  it("adds a command and a separator, moves one, and keeps it all on OK", () => {
    useCustomize.getState().set({ qat: ["save", "undo"] })
    render(<CustomizeDialogHost />)
    act(() => openCustomize("quick-access"))
    fireEvent.change(screen.getByLabelText("Commands"), { target: { value: "bold" } })
    fireEvent.click(screen.getByText("Add >>"))
    fireEvent.change(screen.getByLabelText("Commands"), { target: { value: "|" } })
    fireEvent.click(screen.getByText("Add >>"))
    fireEvent.change(screen.getByLabelText("Quick Access Toolbar commands"), { target: { value: "2" } })
    fireEvent.click(screen.getByLabelText("Move Up"))
    fireEvent.click(screen.getByText("OK"))
    expect(useCustomize.getState().qat).toEqual(["save", "bold", "undo", "|"])
  })

  it("hides a tab on the Ribbon page, and Cancel keeps things as they were", () => {
    render(<CustomizeDialogHost />)
    act(() => openCustomize("ribbon"))
    fireEvent.click(screen.getByLabelText("Review"))
    fireEvent.click(screen.getByText("Cancel"))
    expect(useCustomize.getState().hiddenTabs).toEqual([])
    act(() => openCustomize("ribbon"))
    fireEvent.click(screen.getByLabelText("Review"))
    fireEvent.click(screen.getByText("OK"))
    expect(useCustomize.getState().hiddenTabs).toEqual(["review"])
  })

  it("Reset puts back the standard toolbar and shows every tab", () => {
    useCustomize.getState().set({ qat: ["bold"], hiddenTabs: ["view"], qatShown: false })
    render(<CustomizeDialogHost />)
    act(() => openCustomize("quick-access"))
    fireEvent.click(screen.getByText("Reset"))
    fireEvent.click(screen.getByText("OK"))
    expect(useCustomize.getState()).toMatchObject(defaults())
  })
})
