import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { NodeSelection } from "@tiptap/pm/state"
import { describe, expect, it } from "vitest"
import { Figure } from "@/editor/insert-blocks"
import {
  applyFontColor,
  applyFontFamily,
  selectedShapeText,
  setShapeText,
  stepShapeTextSize,
} from "@/editor/shape-text"

function make(variant = "hexagon") {
  const editor = new Editor({
    extensions: [StarterKit, Figure],
    content: `<p>a</p><div data-figure data-kind="shape" data-variant="${variant}" data-text="Hi"></div>`,
  })
  let pos = -1
  editor.state.doc.descendants((node, at) => {
    if (node.type.name === "figure") {
      pos = at
    }
  })
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)))
  return { editor, pos }
}

describe("font controls on a shape's text", () => {
  it("steps through Word's sizes from 14 and sets bold", () => {
    const { editor, pos } = make()
    expect(selectedShapeText(editor)?.pos).toBe(pos)
    expect(stepShapeTextSize(editor, 1)).toBe(true)
    expect(editor.state.doc.nodeAt(pos)?.attrs.textSize).toBe(16)
    stepShapeTextSize(editor, -1)
    stepShapeTextSize(editor, -1)
    expect(editor.state.doc.nodeAt(pos)?.attrs.textSize).toBe(12)
    setShapeText(editor, { textBold: true })
    expect(editor.state.doc.nodeAt(pos)?.attrs.textBold).toBe(true)
    editor.destroy()
  })

  it("leaves a line alone", () => {
    const { editor } = make("line")
    expect(selectedShapeText(editor)).toBeNull()
    expect(stepShapeTextSize(editor, 1)).toBe(false)
    editor.destroy()
  })
})

describe("font colour and name on a shape's text", () => {
  it("set and clear the shape's own colour and font", () => {
    const { editor, pos } = make()
    applyFontColor(editor, "#c00000")
    applyFontFamily(editor, "Georgia, serif")
    expect(editor.state.doc.nodeAt(pos)?.attrs).toMatchObject({ textColor: "#c00000", textFont: "Georgia, serif" })
    applyFontColor(editor, "")
    applyFontFamily(editor, "")
    expect(editor.state.doc.nodeAt(pos)?.attrs).toMatchObject({ textColor: "", textFont: "" })
    editor.destroy()
  })
})
