import { holdsText } from "@/editor/insert-blocks"
import { FONT_SIZES } from "@/components/ribbon/options"
import { chainWithSelection } from "@/editor/selection-memory"
import type { Editor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"

/** The size a shape's text has when none was set, in points. */
export const SHAPE_TEXT_SIZE = 14

/** The shape the selection is, when it can hold text: the Home tab's font controls then act on its text. */
export function selectedShapeText(editor: Editor | null) {
  const selection = editor?.state.selection
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== "figure") {
    return null
  }
  const { attrs } = selection.node
  return attrs.kind === "shape" && holdsText(String(attrs.variant)) ? { pos: selection.from, attrs } : null
}

/** Changes the selected shape's text look (`textSize`, `textBold`, `textColor`); false when no shape is selected. */
export function setShapeText(
  editor: Editor,
  patch: { textSize?: number; textBold?: boolean; textColor?: string; textFont?: string },
) {
  const target = selectedShapeText(editor)
  if (!target) {
    return false
  }
  editor.view.dispatch(editor.state.tr.setNodeMarkup(target.pos, undefined, { ...target.attrs, ...patch }))
  return true
}

/** Grow or shrink the selected shape's text to the next size in Word's list. */
export function stepShapeTextSize(editor: Editor, direction: 1 | -1) {
  const target = selectedShapeText(editor)
  if (!target) {
    return false
  }
  const current = Number(target.attrs.textSize) || SHAPE_TEXT_SIZE
  const sizes: number[] = [...FONT_SIZES]
  const next =
    direction === 1 ? sizes.find((size) => size > current) : [...sizes].reverse().find((size) => size < current)
  return setShapeText(editor, { textSize: next ?? current })
}

/** Bold for the Home tab, the Mini Toolbar and the Quick Access Toolbar: a selected shape's text, else the selection's. */
export function toggleBold(editor: Editor) {
  const shape = selectedShapeText(editor)
  if (shape) {
    setShapeText(editor, { textBold: !shape.attrs.textBold })
    return
  }
  chainWithSelection(editor).toggleBold().run()
}

/** Font Color for the Home tab: a selected shape's text colour (empty is automatic), else the selection's. */
export function applyFontColor(editor: Editor, color: string) {
  if (setShapeText(editor, { textColor: color })) {
    return
  }
  const chain = chainWithSelection(editor)
  void (color ? chain.setColor(color).run() : chain.unsetColor().run())
}

/** Font name for the Home tab: a selected shape's text font (empty is the document's), else the selection's. */
export function applyFontFamily(editor: Editor, family: string) {
  if (setShapeText(editor, { textFont: family })) {
    return
  }
  const chain = chainWithSelection(editor)
  void (family ? chain.setFontFamily(family).run() : chain.unsetFontFamily().run())
}
