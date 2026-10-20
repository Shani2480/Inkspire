import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ShortcutSettings } from "@/components/backstage/shortcut-settings"
import { useShortcuts } from "@/editor/shortcuts"

describe("Keyboard Shortcuts settings", () => {
  beforeEach(() => useShortcuts.getState().reset())
  afterEach(cleanup)

  it("rebinds a command to the keys pressed and resets it", () => {
    render(<ShortcutSettings />)
    fireEvent.click(screen.getByRole("button", { name: "Change Bold" }))
    fireEvent.keyDown(window, { code: "KeyB", key: "B", ctrlKey: true, shiftKey: true })
    expect(useShortcuts.getState().custom.bold).toEqual(["Mod+Shift+B"])
    expect(screen.getByText("Ctrl+Shift+B")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Reset Bold" }))
    expect(useShortcuts.getState().custom.bold).toBeUndefined()
  })

  it("refuses the application's own keys and a bare letter, and says which command gave up a key", () => {
    render(<ShortcutSettings />)
    fireEvent.click(screen.getByRole("button", { name: "Change Italic" }))
    fireEvent.keyDown(window, { code: "KeyS", key: "s", ctrlKey: true })
    expect(screen.getByRole("status").textContent).toContain("used by the application")
    fireEvent.keyDown(window, { code: "KeyQ", key: "q" })
    expect(screen.getByRole("status").textContent).toContain("Ctrl, Alt")
    expect(useShortcuts.getState().custom.italic).toBeUndefined()

    fireEvent.keyDown(window, { code: "KeyU", key: "u", ctrlKey: true })
    expect(screen.getByRole("status").textContent).toContain("moved here from Underline")
    expect(useShortcuts.getState().custom.underline).toEqual([])
  })
})
