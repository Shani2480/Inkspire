import type { Editor } from "@tiptap/core"

let current: Editor | null = null

export function bindDocumentEditor(editor: Editor | null) {
  current = editor
}

export function getDocumentEditor() {
  return current
}

let pendingEdit: (() => void) | null = null

/** Registers how to record an edit still waiting for a pause in typing (document-editor.tsx). */
export function bindPendingEdit(flush: (() => void) | null) {
  pendingEdit = flush
}

/** Records the latest edit in the document store now, for code about to read `documentHTML`. */
export function flushPendingEdit() {
  pendingEdit?.()
}
