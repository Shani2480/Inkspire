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
    fireEvent.click(screen.getByLabelText("Show Review"))
    fireEvent.click(screen.getByText("Cancel"))
    expect(useCustomize.getState().hiddenTabs).toEqual([])
    act(() => openCustomize("ribbon"))
    fireEvent.click(screen.getByLabelText("Show Review"))
    fireEvent.click(screen.getByText("OK"))
    expect(useCustomize.getState().hiddenTabs).toEqual(["review"])
  })

  it("makes a tab with a group, adds a command to it and renames it, kept on OK", () => {
    render(<CustomizeDialogHost />)
    act(() => openCustomize("ribbon"))
    // With the toolbar's commands that are on no tab to choose from.
    const from = screen.getByLabelText("Choose commands from")
    fireEvent.change(from, { target: { value: "not-in-ribbon" } })
    fireEvent.click(screen.getByText("New Tab"))
    // The new tab's group is selected: Add puts the command in it.
    fireEvent.change(screen.getByLabelText("Commands"), { target: { value: "save" } })
    fireEvent.click(screen.getByText("Add >>"))
    fireEvent.click(screen.getByText("New Tab (Custom)"))
    fireEvent.click(screen.getByText("Rename…"))
    const name = screen.getByLabelText("Display name")
    // Esc gives up the new name and leaves the dialog open.
    fireEvent.keyDown(name, { key: "Escape" })
    expect(screen.queryByLabelText("Display name")).toBeNull()
    expect(screen.getByText("New Tab (Custom)")).toBeTruthy()
    fireEvent.click(screen.getByText("Rename…"))
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Mine" } })
    fireEvent.keyDown(screen.getByLabelText("Display name"), { key: "Enter" })
    expect(screen.getByText("Mine (Custom)")).toBeTruthy()
    fireEvent.click(screen.getByText("OK"))
    const [tab] = useCustomize.getState().customTabs
    expect(tab).toMatchObject({ label: "Mine", after: "home" })
    expect(tab!.groups[0]!.commands).toEqual(["save"])
  })

  it("Reset ▾ puts back the toolbar alone, the selected tab alone, or everything", () => {
    useCustomize.getState().set({
      qat: ["bold"],
      hiddenTabs: ["view", "review"],
      qatShown: false,
      tabNames: { home: "Start", insert: "Add" },
      hiddenGroups: { home: ["font"] },
    })
    const all = (
      <>
        <CustomizeDialogHost />
        <CommandMenuHost />
      </>
    )
    const { rerender } = render(all)
    act(() => openCustomize("quick-access"))
    fireEvent.click(screen.getByText("Reset ▾"))
    fireEvent.click(screen.getByText("Reset only Quick Access Toolbar"))
    fireEvent.click(screen.getByText("OK"))
    expect(useCustomize.getState()).toMatchObject({
      qat: defaults().qat,
      qatShown: true,
      hiddenTabs: ["view", "review"],
    })

    // Review selected on the Customize Ribbon page: only it comes back as it was.
    act(() => openCustomize("ribbon"))
    rerender(all)
    fireEvent.click(screen.getByText("Review"))
    fireEvent.click(screen.getByText("Reset ▾"))
    fireEvent.click(screen.getByText("Reset only selected Ribbon tab"))
    fireEvent.click(screen.getByText("OK"))
    expect(useCustomize.getState()).toMatchObject({ hiddenTabs: ["view"], tabNames: { home: "Start", insert: "Add" } })

    act(() => openCustomize("ribbon"))
    fireEvent.click(screen.getByText("Reset ▾"))
    fireEvent.click(screen.getByText("Reset all customizations"))
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
