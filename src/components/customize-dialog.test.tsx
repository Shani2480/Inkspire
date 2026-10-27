import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CommandMenuHost } from "@/components/command-menu"
import { CustomizeDialogHost, openCustomize } from "@/components/customize-dialog"
import { defaults, exportCustomization, useCustomize } from "@/document/customize"

const files = vi.hoisted(() => ({ opened: null as string | null, saved: [] as [string, string][] }))
vi.mock("@/lib/file-io", () => ({
  openSettingsFile: async () => files.opened,
  saveSettingsFile: async (name: string, text: string) => {
    files.saved.push([name, text])
    return true
  },
}))

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

  it("exports all customizations and imports a file, kept on OK", async () => {
    useCustomize.getState().set({ qat: ["save", "bold"] })
    render(
      <>
        <CustomizeDialogHost />
        <CommandMenuHost />
      </>,
    )
    act(() => openCustomize("quick-access"))
    fireEvent.click(screen.getByText("Import/Export ▾"))
    fireEvent.click(screen.getByText("Export all customizations"))
    await screen.findByText("Customizations exported.")
    expect(files.saved[0]![0]).toBe("Inkspire Customizations.json")
    expect(JSON.parse(files.saved[0]![1]).qat).toEqual(["save", "bold"])

    files.opened = exportCustomization({ ...defaults(), qat: ["undo"], hiddenTabs: ["view"] })
    fireEvent.click(screen.getByText("Import/Export ▾"))
    fireEvent.click(screen.getByText("Import customization file"))
    await screen.findByText("Customizations imported. Click OK to use them.")
    // Not used until OK.
    expect(useCustomize.getState().qat).toEqual(["save", "bold"])
    fireEvent.click(screen.getByText("OK"))
    expect(useCustomize.getState()).toMatchObject({ qat: ["undo"], hiddenTabs: ["view"] })

    files.opened = "{}"
    act(() => openCustomize("quick-access"))
    fireEvent.click(screen.getByText("Import/Export ▾"))
    fireEvent.click(screen.getByText("Import customization file"))
    await screen.findByText("That file is not an Inkspire customization file.")
  })
})
