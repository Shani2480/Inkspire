import { create } from "zustand"
import { useDocumentStore } from "@/document/store"

/**
 * File > Info > Protect Document for the open document: the password it is encrypted with, Always Open Read-Only
 * and Mark as Final, and the digital signatures the file came with. Saved into the file on the next save (a Word
 * document; other formats have none of these).
 */
type FileProtectionState = {
  /** Encrypt with Password; null when the file opens without one. Kept for this session only, never stored. */
  password: string | null
  readOnlyRecommended: boolean
  markedFinal: boolean
  /** Digital signatures in the file as opened; a save here leaves them out, as Word drops them when you edit. */
  signatures: number
  setPassword: (password: string | null) => void
  setReadOnlyRecommended: (on: boolean) => void
  setMarkedFinal: (on: boolean) => void
  /** A document was opened (or a new one started): its own settings, none for a new document. */
  opened: (next?: Partial<Pick<FileProtectionState, "password" | "readOnlyRecommended" | "markedFinal" | "signatures">>) => void
}

/** A change to the file's protection is a change to the document: Save writes it, as in Word. */
function changed() {
  useDocumentStore.setState({ isDirty: true })
}

export const useFileProtection = create<FileProtectionState>((set) => ({
  password: null,
  readOnlyRecommended: false,
  markedFinal: false,
  signatures: 0,
  setPassword: (password) => {
    set({ password: password || null })
    changed()
  },
  setReadOnlyRecommended: (readOnlyRecommended) => {
    set({ readOnlyRecommended })
    changed()
  },
  setMarkedFinal: (markedFinal) => {
    set({ markedFinal })
    // Marking it final saves it at once in Word; here the document stops taking edits until Edit Anyway.
    useDocumentStore.getState().setReadOnly(markedFinal)
    changed()
  },
  opened: (next = {}) =>
    set({
      password: next.password ?? null,
      readOnlyRecommended: next.readOnlyRecommended ?? false,
      markedFinal: next.markedFinal ?? false,
      signatures: next.signatures ?? 0,
    }),
}))

/** What saveDocxBytes takes from Protect Document. */
export function protectionForSave() {
  const { readOnlyRecommended, markedFinal, password } = useFileProtection.getState()
  return { protection: { readOnlyRecommended, markedFinal }, password }
}
