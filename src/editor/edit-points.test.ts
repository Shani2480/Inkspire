import { Editor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import { StarterKit } from "@tiptap/starter-kit"
import { undo } from "@tiptap/pm/history"
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

  it("grows the box as a point is dragged out, and the drag is one undo step", () => {
    const { editor, at } = make("rect")
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(at, undefined, {
        ...editor.state.doc.nodeAt(at)!.attrs,
        points: "M50 0 L100 100 L0 100 Z",
        width: 100,
        height: 100,
      }),
    )
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, at)))
    expect(startEditPoints(editor)).toBe(true)
    const before = editor.state.doc.nodeAt(at)!.attrs
    const handle = [...document.querySelectorAll<HTMLElement>(".edit-points:not([hidden]) .edit-points-handle")].find(
      (item) => !item.hidden && item.dataset.index === "0",
    )!
    const pointer = (target: EventTarget, type: string, clientY: number) =>
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 50, clientY }))
    pointer(handle, "pointerdown", 0)
    pointer(window, "pointermove", -50)
    // While dragging, the box has grown with the outline already.
    expect(editor.state.doc.nodeAt(at)!.attrs.height).toBe(150)
    pointer(window, "pointermove", -60)
    pointer(window, "pointerup", -60)
    expect(editor.state.doc.nodeAt(at)!.attrs.height).toBe(160)
    expect(editingPointsAt(editor.view)).toBe(at)
    undo(editor.state, editor.view.dispatch)
    expect(editor.state.doc.nodeAt(at)!.attrs).toMatchObject({ height: before.height, points: before.points })
  })
})
