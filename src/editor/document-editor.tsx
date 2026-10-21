import { useEditingOptions } from "@/document/editing-options"
import { useEditor, type Editor } from "@tiptap/react"
import { createContext, useContext, useEffect, type ReactNode } from "react"
import { useActiveChromeEditor } from "@/document/chrome-editing"
import { bindDocumentEditor, bindPendingEdit } from "@/document/editor-ref"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { refreshDisplayedMarks } from "@/editor/display-refresh"
import { extensions } from "@/editor/extensions"
import { syncSelectionMemory } from "@/editor/selection-memory"
import { clearManualSpelling } from "@/editor/spellcheck"

/** How long typing has to pause before the store records the document's HTML. */
const EDIT_SETTLE_MS = 400

const DocumentEditorContext = createContext<Editor | null>(null)

export function DocumentEditorProvider({ children }: { children: ReactNode }) {
  const editor = useEditor({
    extensions,
    content: "<p></p>",
    autofocus: "start",
    editorProps: {
      attributes: {
        class: "page-editor break-words",
        spellcheck: "false",
        "aria-label": "Document",
      },
    },
  })

  useEffect(() => {
    if (!editor) {
      return
    }

    bindDocumentEditor(editor)
    useDocumentStore.getState().adoptBaseline(editor.getHTML())

    const remember = () => syncSelectionMemory(editor)
    // Serialising the whole document on every keystroke made typing lag, so the store's copy of the HTML waits
    // for a pause; the document is marked modified at once, so nothing that asks to save can miss an edit.
    let timer = 0
    const recordEdit = () => {
      window.clearTimeout(timer)
      timer = 0
      useDocumentStore.getState().noteEdit(editor.getHTML())
    }
    const noteEdit = () => {
      if (!useDocumentStore.getState().isDirty) {
        useDocumentStore.setState({ isDirty: true })
      }
      window.clearTimeout(timer)
      timer = window.setTimeout(recordEdit, EDIT_SETTLE_MS)
    }
    bindPendingEdit(() => {
      if (timer) {
        recordEdit()
      }
    })
    editor.on("selectionUpdate", remember)
    editor.on("update", noteEdit)
    const unsubscribe = useViewStore.subscribe((state, previous) => {
      if (state.spellCheck !== previous.spellCheck) {
        // A manual check's underlines belong to the off state they were made in.
        clearManualSpelling(editor)
      }
      if (state.showFormattingMarks !== previous.showFormattingMarks || state.spellCheck !== previous.spellCheck) {
        refreshDisplayedMarks(editor)
      }
    })
    const marksChanged = useEditingOptions.subscribe((state, previous) => {
      if (
        state.marksTabs !== previous.marksTabs ||
        state.marksSpaces !== previous.marksSpaces ||
        state.marksParagraph !== previous.marksParagraph ||
        state.marksHidden !== previous.marksHidden ||
        state.marksHyphens !== previous.marksHyphens
      ) {
        refreshDisplayedMarks(editor)
      }
    })
    return () => {
      unsubscribe()
      marksChanged()
      editor.off("selectionUpdate", remember)
      editor.off("update", noteEdit)
      window.clearTimeout(timer)
      bindPendingEdit(null)
      bindDocumentEditor(null)
    }
  }, [editor])

  return <DocumentEditorContext.Provider value={editor}>{children}</DocumentEditorContext.Provider>
}

/** The document's own text editor, whatever is being edited. */
export function useBodyEditor() {
  return useContext(DocumentEditorContext)
}

/** The editor commands act on: the header or footer while one is being edited, else the document. */
export function useDocumentEditor() {
  const body = useBodyEditor()
  const editing = useViewStore((state) => state.editingChrome)
  const chrome = useActiveChromeEditor((state) => state.editor)
  return editing && chrome ? chrome : body
}
