import type { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"

/**
 * A point on the page, moved onto the text area: a tap in the margin lands on the line beside it, one above the
 * text on the first line, one below it on the last. Inset by a pixel so the point is inside, not on the edge.
 */
export function pointOnText(
  point: { x: number; y: number },
  text: { left: number; top: number; right: number; bottom: number },
) {
  const clamp = (value: number, low: number, high: number) =>
    Math.min(Math.max(value, low + 1), Math.max(low + 1, high - 1))
  return { x: clamp(point.x, text.left, text.right), y: clamp(point.y, text.top, text.bottom) }
}

/**
 * A finger's tap on the page outside the text (the margins, the space below the last line) puts the cursor in the
 * nearest line and brings up the keyboard, as Word mobile does; a mouse click there keeps the desktop behaviour.
 * Returns whether it placed the cursor.
 */
export function placeCaretFromTap(
  editor: Editor | null,
  event: { clientX: number; clientY: number; target: EventTarget | null },
) {
  if (!editor || editor.isDestroyed || !editor.isEditable) {
    return false
  }
  const target = event.target instanceof Element ? event.target : null
  // Text, objects and the header and footer handle their own taps.
  if (!target || target.closest(".ProseMirror, .object-frame, button, a, input, [role='button']")) {
    return false
  }
  const dom = editor.view.dom as HTMLElement
  const { x, y } = pointOnText({ x: event.clientX, y: event.clientY }, dom.getBoundingClientRect())
  const found = editor.view.posAtCoords({ left: x, top: y })
  if (!found) {
    return false
  }
  const { state } = editor.view
  const selection = TextSelection.near(state.doc.resolve(found.pos))
  editor.view.dispatch(state.tr.setSelection(selection).scrollIntoView())
  editor.view.focus()
  return true
}
