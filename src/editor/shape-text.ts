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

/** The look of a shape's text the Home tab sets, as the figure's attributes. */
export type ShapeTextPatch = {
  textSize?: number
  textBold?: boolean
  textItalic?: boolean
  textUnderline?: string
  textColor?: string
  textFont?: string
  textHighlight?: string
  textAlign?: string
}

/** Changes the selected shape's text look; false when no shape is selected. */
export function setShapeText(editor: Editor, patch: ShapeTextPatch) {
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

/** Italic for the Home tab, the Mini Toolbar, the Quick Access Toolbar and Ctrl+I. */
export function toggleItalic(editor: Editor) {
  const shape = selectedShapeText(editor)
  if (shape) {
    setShapeText(editor, { textItalic: !shape.attrs.textItalic })
    return
  }
  chainWithSelection(editor).toggleItalic().run()
}

/** Underline for the Home tab, the Mini Toolbar, the Quick Access Toolbar and Ctrl+U: on as a single line, or off. */
export function toggleUnderline(editor: Editor) {
  const shape = selectedShapeText(editor)
  const on = shape ? !shape.attrs.textUnderline : !editor.isActive("underline")
  applyUnderline(editor, on ? "solid" : "")
}

/** An underline style from the Underline menu (empty for none): a selected shape's text, else the selection's. */
export function applyUnderline(editor: Editor, style: string) {
  if (setShapeText(editor, { textUnderline: style })) {
    return
  }
  const chain = chainWithSelection(editor)
  void (style ? chain.setMark("underline", { style }).run() : chain.unsetUnderline().run())
}

/** Text Highlight Color: a selected shape's text (empty for none), else the selection's. */
export function applyHighlight(editor: Editor, color: string) {
  if (setShapeText(editor, { textHighlight: color })) {
    return
  }
  const chain = chainWithSelection(editor)
  void (color ? chain.setHighlight({ color }).run() : chain.unsetHighlight().run())
}

/** Align Left, Center, Align Right and Justify: a selected shape's text, else the paragraphs'. */
export function applyAlign(editor: Editor, align: "left" | "center" | "right" | "justify") {
  if (setShapeText(editor, { textAlign: align === "center" ? "" : align })) {
    return
  }
  chainWithSelection(editor).setTextAlign(align).run()
}
