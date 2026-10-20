import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { describe, expect, it } from "vitest"
import { TextBox, alignSelectedObjects } from "@/editor/objects"

function make() {
  return new Editor({
    extensions: [StarterKit, TextBox],
    content:
      '<div data-text-box data-x="40" data-y="90"><p>a</p></div><div data-text-box data-x="120" data-y="30"><p>b</p></div><p>end</p>',
  })
}

function boxes(editor: Editor) {
  const found: { pos: number; x: number; y: number }[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "textBox") {
      found.push({ pos, x: Number(node.attrs.x), y: Number(node.attrs.y) })
    }
  })
  return found
}

describe("Align Selected Objects (22.17)", () => {
  it("lines the picked objects up on the left or the top of the group", () => {
    const editor = make()
    const before = boxes(editor)
    expect(before.length).toBe(2)
    expect(
      alignSelectedObjects(
        editor,
        before.map((box) => box.pos),
        "left",
      ),
    ).toBe(true)
    expect(boxes(editor).map((box) => box.x)).toEqual([40, 40])
    expect(boxes(editor).map((box) => box.y)).toEqual([90, 30])
    alignSelectedObjects(
      editor,
      before.map((box) => box.pos),
      "top",
    )
    expect(boxes(editor).map((box) => box.y)).toEqual([30, 30])
    editor.destroy()
  })

  it("needs two objects", () => {
    const editor = make()
    expect(alignSelectedObjects(editor, [boxes(editor)[0]!.pos], "left")).toBe(false)
    editor.destroy()
  })
})
