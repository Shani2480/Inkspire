import type { Editor } from "@tiptap/core"

let saved: { from: number; to: number } | null = null

export function rememberSelection(editor: Editor) {
  if (!editor.view.hasFocus()) {
    return
  }

  const { from, to } = editor.state.selection
  if (from !== to) {
    saved = { from, to }
  }
}

export function syncSelectionMemory(editor: Editor) {
  if (!editor.view.hasFocus()) {
    return
  }

  const { from, to } = editor.state.selection
  saved = from === to ? null : { from, to }
}

export function chainWithSelection(editor: Editor) {
  const { from, to } = editor.state.selection
  if (from === to && saved && saved.from !== saved.to) {
    return editor.chain().setTextSelection(saved).focus()
  }

  return editor.chain().focus()
}

export function restoreSelection(editor: Editor) {
  const { from, to } = editor.state.selection
  if (from === to && saved && saved.from !== saved.to) {
    editor.commands.setTextSelection(saved)
  }
}

export function insertAtSelectionEnd(editor: Editor) {
  restoreSelection(editor)
  const to = editor.state.selection.to
  return editor.chain().setTextSelection(to).focus()
}
