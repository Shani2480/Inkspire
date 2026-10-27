import { beforeEach, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import { createExtensions } from "@/editor/extensions"
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
    expect(shortcutFor("Mod+Shift+Q")).toBeNull()
    expect(shortcutFor("Mod+Q")?.def.id).toBe("reset-paragraph")
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

describe("Word's formatting keys", () => {
  const run = (editor: Editor, keys: string) => shortcutFor(keys)!.def.run(editor)
  const setup = (html: string) => {
    const editor = new Editor({ extensions: createExtensions(), content: html })
    editor.commands.selectAll()
    return editor
  }

  it("toggles double underline, small caps and hidden text (Ctrl+Shift+D, K, H)", () => {
    const editor = setup("<p>word</p>")
    run(editor, "Mod+Shift+D")
    expect(editor.getAttributes("underline").style).toBe("double")
    run(editor, "Mod+Shift+D")
    expect(editor.isActive("underline")).toBe(false)
    run(editor, "Mod+Shift+K")
    expect(editor.getAttributes("textStyle").fontVariant).toBe("small-caps")
    run(editor, "Mod+Shift+H")
    expect(editor.getHTML()).toContain("text-hidden")
    run(editor, "Mod+Shift+K")
    run(editor, "Mod+Shift+H")
    expect(editor.isActive("textStyle")).toBe(false)
    expect(editor.getHTML()).not.toMatch(/text-hidden|small-caps/)
    editor.destroy()
  })

  it("steps a hanging indent by 1.27 cm (Ctrl+T, Ctrl+Shift+T)", () => {
    const editor = setup("<p>word</p>")
    run(editor, "Mod+T")
    run(editor, "Mod+T")
    expect(editor.state.doc.firstChild!.attrs.specialIndent).toBe("hanging:2.54")
    run(editor, "Mod+Shift+T")
    run(editor, "Mod+Shift+T")
    expect(editor.state.doc.firstChild!.attrs.specialIndent).toBe("")
    editor.destroy()
  })

  it("takes a paragraph's own formatting off and keeps its text formatting (Ctrl+Q)", () => {
    const editor = setup('<p style="text-align: center"><strong>word</strong></p>')
    run(editor, "Mod+T")
    run(editor, "Mod+Q")
    const paragraph = editor.state.doc.firstChild!
    expect(paragraph.attrs.textAlign).not.toBe("center")
    expect(paragraph.attrs.specialIndent).toBe("")
    expect(editor.isActive("bold")).toBe(true)
    editor.destroy()
  })

  it("copies formatting and pastes it on another selection (Ctrl+Shift+C, Ctrl+Shift+V)", () => {
    const editor = new Editor({ extensions: createExtensions(), content: "<p><strong>bold</strong> plain</p>" })
    editor.commands.setTextSelection({ from: 1, to: 5 })
    run(editor, "Mod+Shift+C")
    editor.commands.setTextSelection({ from: 6, to: 11 })
    expect(run(editor, "Mod+Shift+V")).toBe(true)
    expect(editor.getHTML()).toContain("<strong>bold</strong> <strong>plain</strong>")
    editor.destroy()
  })
})
