import { Editor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import { StarterKit } from "@tiptap/starter-kit"
import { describe, expect, it } from "vitest"
import {
  EditPoints,
  canConvertToFreeform,
  canEditPoints,
  convertToFreeform,
  editingPointsAt,
  startEditPoints,
  stopEditPoints,
} from "@/editor/edit-points"
import { Figure } from "@/editor/insert-blocks"

function make(variant: string) {
  const editor = new Editor({
    extensions: [StarterKit, Figure, EditPoints],
    content: `<p>a</p><div data-figure data-kind="shape" data-variant="${variant}"></div><p>b</p>`,
  })
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "figure") {
      at = pos
    }
  })
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, at)))
  return { editor, at }
}

const points = (editor: Editor, at: number) => String(editor.state.doc.nodeAt(at)?.attrs.points ?? "")

describe("Edit Points and Convert to Freeform", () => {
  it("turns a gallery shape into the same outline as points", () => {
    const { editor, at } = make("triangle")
    expect(canConvertToFreeform(editor)).toBe(true)
    expect(convertToFreeform(editor)).toBe(true)
    // Three corners, closed: the triangle as the gallery draws it.
    expect(points(editor, at)).toMatch(/^M\S+ \S+ L\S+ \S+ L\S+ \S+ Z$/)
    // Already points: nothing left to convert, but its points can still be edited.
    expect(canConvertToFreeform(editor)).toBe(false)
    expect(canEditPoints(editor)).toBe(true)
  })

  it("starts on the selected shape and ends when something else is chosen or on stop", () => {
    const { editor, at } = make("rect")
    expect(startEditPoints(editor)).toBe(true)
    expect(editingPointsAt(editor.view)).toBe(at)
    expect(points(editor, at)).not.toBe("")
    stopEditPoints(editor.view)
    expect(editingPointsAt(editor.view)).toBeNull()
  })
})
