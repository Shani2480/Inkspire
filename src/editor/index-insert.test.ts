import { createExtensions } from "@/editor/extensions"
import { Editor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import { describe, expect, it } from "vitest"

function editorOf(html: string) {
  return new Editor({ extensions: createExtensions().filter((e) => e.name !== "spellcheck"), content: html })
}

describe("Insert Index and Insert Table of Authorities", () => {
  for (const [label, insert, type] of [
    ["Index", (editor: Editor) => editor.commands.insertDocumentIndex(), "documentIndex"],
    ["Table of Authorities", (editor: Editor) => editor.commands.insertAuthoritiesTable(), "authoritiesTable"],
  ] as const) {
    it(`${label}: with the cursor in a paragraph, inserts after it and selects the new block`, () => {
      const editor = editorOf("<p>Hello world</p>")
      editor.commands.setTextSelection(6)
      expect(insert(editor)).toBe(true)
      const selection = editor.state.selection
      expect(selection).toBeInstanceOf(NodeSelection)
      expect((selection as NodeSelection).node.type.name).toBe(type)
      expect(editor.state.doc.textContent).toContain("Hello world")
      editor.destroy()
    })
  }
})
