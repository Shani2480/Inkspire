import { drawsTextBox, NO_TEXT_BOX, type TextBox } from "@/document/docx/text-box"
import type { Editor } from "@tiptap/core"

/** Whether Borders and Shading can apply to the selected text: some text is selected. */
export function hasSelectedText(editor: Editor) {
  const { from, to } = editor.state.selection
  return from < to && editor.state.doc.textBetween(from, to, "", "").length > 0
}

/** Whether the selection is part of one paragraph, where Word's Apply to starts on Text. */
export function selectsPartOfParagraph(editor: Editor) {
  const { $from, $to, from, to } = editor.state.selection
  return hasSelectedText(editor) && $from.parent === $to.parent && to - from < $from.parent.content.size
}

/** The box and shading of the first selected text that has them, or none. */
export function selectedTextBox(editor: Editor): TextBox {
  const { from, to } = editor.state.selection
  let found: TextBox | null = null
  editor.state.doc.nodesBetween(from, to, (node) => {
    const mark = node.isText ? node.marks.find((item) => item.type.name === "textBorder") : undefined
    if (mark && !found) {
      found = { ...NO_TEXT_BOX, ...(mark.attrs as TextBox) }
    }
    return !found
  })
  return found ?? NO_TEXT_BOX
}

/**
 * Borders and Shading > Apply to Text (22.4): changes the selected text's box or shading, keeping what the patch
 * leaves out as each piece of text has it; text left with neither loses the mark.
 */
export function applyTextBox(editor: Editor, patch: Partial<TextBox>) {
  const type = editor.schema.marks.textBorder
  const { from, to } = editor.state.selection
  if (!type || from >= to) {
    return false
  }
  const tr = editor.state.tr
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) {
      return
    }
    const start = Math.max(from, pos)
    const end = Math.min(to, pos + node.nodeSize)
    const current = node.marks.find((mark) => mark.type === type)?.attrs as TextBox | undefined
    const next = { ...NO_TEXT_BOX, ...current, ...patch }
    next.shadow = Boolean(next.border) && next.shadow
    if (drawsTextBox(next)) {
      tr.addMark(start, end, type.create(next))
    } else {
      tr.removeMark(start, end, type)
    }
  })
  editor.view.dispatch(tr)
  return true
}
