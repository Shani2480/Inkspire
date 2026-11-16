import { create } from "zustand"
import { getDocumentEditor } from "@/document/editor-ref"
import { useDocumentStore } from "@/document/store"
import { refreshDisplayedMarks } from "@/editor/display-refresh"

/**
 * Options > Proofing > Exceptions for this document: Hide spelling errors / Hide grammar errors in this document
 * only. Kept in the document (w:hideSpellingErrors, w:hideGrammaticalErrors in settings.xml), as Word keeps them.
 */
type ProofingExceptions = {
  hideSpelling: boolean
  hideGrammar: boolean
  set: (patch: Partial<Pick<ProofingExceptions, "hideSpelling" | "hideGrammar">>) => void
  /** A document was opened (its own settings) or started (none). */
  opened: (next?: { hideSpelling?: boolean; hideGrammar?: boolean }) => void
}

export const useProofingExceptions = create<ProofingExceptions>((set) => ({
  hideSpelling: false,
  hideGrammar: false,
  set: (patch) => {
    set(patch)
    useDocumentStore.setState({ isDirty: true })
    const editor = getDocumentEditor()
    if (editor && !editor.isDestroyed) {
      refreshDisplayedMarks(editor)
    }
  },
  opened: (next = {}) => set({ hideSpelling: Boolean(next.hideSpelling), hideGrammar: Boolean(next.hideGrammar) }),
}))

export function proofingForSave() {
  const { hideSpelling, hideGrammar } = useProofingExceptions.getState()
  return { hideSpelling, hideGrammar }
}
