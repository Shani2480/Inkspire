import type { Editor } from "@tiptap/core"

export function refreshDisplayedMarks(editor: Editor) {
  if (editor.isDestroyed) {
    return
  }
  try {
    editor.view.dispatch(editor.state.tr.setMeta("display-refresh", true).setMeta("addToHistory", false))
  } catch {
    // The view is not mounted yet. The next edit redraws the marks.
  }
}
