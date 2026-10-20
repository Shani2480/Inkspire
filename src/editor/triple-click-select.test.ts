import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { describe, expect, it } from "vitest"
import { TripleClickSelectAll } from "@/editor/triple-click-select"

function tripleClick(editor: Editor, pos: number) {
  const plugin = editor.state.plugins.find((item) => item.props.handleTripleClick)
  return plugin?.props.handleTripleClick?.call(plugin, editor.view, pos, new MouseEvent("mousedown"))
}

describe("triple-click", () => {
  it("selects the whole paragraph, not only the line that was clicked", () => {
    const editor = new Editor({
      extensions: [StarterKit, TripleClickSelectAll],
      content: "<p>First paragraph here.</p><p>Second one, a little longer.</p>",
    })
    expect(tripleClick(editor, 30)).toBe(true)
    const { from, to } = editor.state.selection
    expect(editor.state.doc.textBetween(from, to)).toBe("Second one, a little longer.")
    editor.destroy()
  })
})
