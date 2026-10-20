import { beforeEach, describe, expect, it } from "vitest"
import { SHORTCUTS, comboFromEvent, keysOf, shortcutFor, useShortcuts } from "@/editor/shortcuts"

function key(code: string, init: Partial<KeyboardEvent> = {}) {
  return { code, key: "", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...init }
}

describe("keyboard shortcuts", () => {
  beforeEach(() => useShortcuts.getState().reset())

  it("writes an event as Word does, whatever the layout puts on the key", () => {
    expect(comboFromEvent(key("KeyL", { ctrlKey: true }))).toBe("Mod+L")
    expect(comboFromEvent(key("KeyL", { metaKey: true, shiftKey: true }))).toBe("Mod+Shift+L")
    expect(comboFromEvent(key("Period", { ctrlKey: true, shiftKey: true, key: ">" }))).toBe("Mod+Shift+.")
    expect(comboFromEvent(key("Digit1", { ctrlKey: true, altKey: true }))).toBe("Mod+Alt+1")
    expect(comboFromEvent(key("F7"))).toBe("F7")
    expect(comboFromEvent(key("ControlLeft", { key: "Control", ctrlKey: true }))).toBeNull()
  })

  it("gives every command Word's keys and no key twice", () => {
    const all = SHORTCUTS.flatMap((def) => def.keys)
    expect(new Set(all).size).toBe(all.length)
    expect(shortcutFor("Mod+J")?.def.id).toBe("justify")
    expect(shortcutFor("Mod+E")?.def.id).toBe("align-center")
    expect(shortcutFor("Mod+Shift+L")?.def.id).toBe("bullets")
    expect(shortcutFor("Mod+Q")).toBeNull()
  })

  it("rebinds a command, takes the key from its old owner, and stops the editor's own key", () => {
    useShortcuts.getState().bind("bold", ["Mod+Shift+B"])
    expect(shortcutFor("Mod+Shift+B")?.def.id).toBe("bold")
    // The editor binds Ctrl+B to bold itself; with bold moved, that key does nothing.
    expect(shortcutFor("Mod+B")).toMatchObject({ blocked: true })

    useShortcuts.getState().bind("italic", ["Mod+Shift+B"])
    const bold = SHORTCUTS.find((def) => def.id === "bold")!
    expect(keysOf(bold)).toEqual([])
    expect(shortcutFor("Mod+Shift+B")?.def.id).toBe("italic")

    useShortcuts.getState().reset()
    expect(shortcutFor("Mod+B")).toMatchObject({ blocked: false })
  })
})
