import { Editor } from "@tiptap/core"
import { describe, expect, it } from "vitest"
import { createExtensions } from "@/editor/extensions"

describe("a drop cap and Enter", () => {
  it("stays with its paragraph: the paragraph Enter starts has none, as in Word", () => {
    const editor = new Editor({ extensions: createExtensions(), content: "<p>Once upon a time</p>" })
    editor.commands.updateAttributes("paragraph", { dropCap: "dropped", dropCapLines: 3, dropCapDistance: 2 })
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.commands.enter()
    const [first, second] = [editor.state.doc.child(0), editor.state.doc.child(1)]
    expect(first.attrs.dropCap).toBe("dropped")
    expect(second.attrs.dropCap).toBeNull()
    expect(second.attrs.dropCapLines).toBeNull()
    expect(second.attrs.dropCapDistance).toBeNull()
    editor.destroy()
  })
})
