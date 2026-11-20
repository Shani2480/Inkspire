// @vitest-environment jsdom
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { createExtensions } from "@/editor/extensions"

let editor: Editor | null = null
afterEach(() => editor?.destroy())

const marked = () => [...editor!.view.dom.querySelectorAll("p")].map((p) => p.hasAttribute("data-word-mixed"))

describe("Word's line placement after an edit", () => {
  it("keeps a paragraph of mixed sizes marked when the paragraph after it is edited", () => {
    editor = new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content:
        '<p>first</p><p>small <span style="font-size: 36pt">BIG</span> small</p><p>a sentense to fix</p><p>last</p>',
    })
    expect(marked()).toEqual([false, true, false, false])
    let at = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.text?.includes("sentense")) {
        at = pos + node.text.indexOf("sentense")
      }
    })
    editor
      .chain()
      .insertContentAt({ from: at, to: at + 8 }, "sentence")
      .run()
    expect(editor.getText()).toContain("a sentence to fix")
    expect(marked()).toEqual([false, true, false, false])
  })
})

describe("the on-screen keyboard", () => {
  it("stays down while an object is selected on a phone or tablet, not on a desktop or in text", async () => {
    const { keyboardMode } = await import("@/editor/object-keyboard")
    const { NodeSelection, TextSelection } = await import("@tiptap/pm/state")
    editor = new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content: "<p>text</p><hr><p>more</p>",
    })
    let rule = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "horizontalRule") {
        rule = pos
      }
    })
    const object = NodeSelection.create(editor.state.doc, rule)
    expect(keyboardMode(object, "tablet")).toBe("none")
    expect(keyboardMode(object, "desktop")).toBeNull()
    expect(keyboardMode(TextSelection.create(editor.state.doc, 2), "phone")).toBeNull()
  })
})
