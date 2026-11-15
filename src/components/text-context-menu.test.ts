import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { createExtensions } from "@/editor/extensions"
import { placeMenu, selectedWord } from "@/components/text-context-menu"

const editors: Editor[] = []
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

describe("text context menu", () => {
  const view = { width: 1300, height: 900 }

  it("opens below and right of the click when it fits", () => {
    expect(placeMenu({ x: 400, y: 200 }, 256, 486, view)).toEqual({ left: 400, top: 200 })
  })

  it("opens above the click near the bottom and left of it near the right edge, as Word does", () => {
    expect(placeMenu({ x: 1200, y: 700 }, 256, 486, view)).toEqual({ left: 944, top: 214 })
  })

  it("stays inside the window when it fits neither above nor below", () => {
    expect(placeMenu({ x: 10, y: 300 }, 256, 486, { width: 1300, height: 600 })).toEqual({ left: 10, top: 8 })
  })

  it("names the word the caret is in when nothing is selected", () => {
    const editor = new Editor({
      extensions: createExtensions().filter((e) => e.name !== "spellcheck"),
      content: "<p>Third item’s text</p>",
    })
    editors.push(editor)
    editor.commands.setTextSelection(4)
    expect(selectedWord(editor)).toBe("Third")
    editor.commands.setTextSelection(10)
    expect(selectedWord(editor)).toBe("item’s")
    editor.commands.setTextSelection({ from: 7, to: 18 })
    expect(selectedWord(editor)).toBe("item’s")
  })
})
