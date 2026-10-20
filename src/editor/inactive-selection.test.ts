import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { describe, expect, it } from "vitest"
import { InactiveSelection } from "@/editor/inactive-selection"

function make() {
  const element = document.createElement("div")
  document.body.append(element)
  const editor = new Editor({
    element,
    extensions: [StarterKit, InactiveSelection],
    content: "<p>Hello brave world</p>",
  })
  return { editor, element }
}

describe("the selection kept while focus is elsewhere", () => {
  it("is drawn after the editor loses focus and gone when it comes back", () => {
    const { editor, element } = make()
    editor.commands.setTextSelection({ from: 1, to: 6 })
    expect(element.querySelector(".inactive-selection")).toBeNull()
    editor.view.dom.dispatchEvent(new FocusEvent("blur"))
    expect(element.querySelector(".inactive-selection")?.textContent).toBe("Hello")
    editor.view.dom.dispatchEvent(new FocusEvent("focus"))
    expect(element.querySelector(".inactive-selection")).toBeNull()
    editor.destroy()
  })

  it("draws nothing for a caret", () => {
    const { editor, element } = make()
    editor.commands.setTextSelection(3)
    editor.view.dom.dispatchEvent(new FocusEvent("blur"))
    expect(element.querySelector(".inactive-selection")).toBeNull()
    editor.destroy()
  })
})
