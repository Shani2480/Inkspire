import { create } from "zustand"

/** The answer to "Inkspire will close": save first, close without saving, or stay. */
export type QuitChoice = "save" | "quit" | "cancel"

type QuitPromptState = {
  /** Whether the prompt is open, and whether the document has changes not saved. */
  open: boolean
  unsaved: boolean
  resolve: ((choice: QuitChoice) => void) | null
  ask: (unsaved?: boolean) => Promise<QuitChoice>
  answer: (choice: QuitChoice) => void
}

export const useQuitPrompt = create<QuitPromptState>((set, get) => ({
  open: false,
  unsaved: false,
  resolve: null,
  ask: (unsaved) =>
    new Promise<QuitChoice>((resolve) => {
      get().resolve?.("cancel")
      set({ open: true, unsaved: unsaved ?? false, resolve })
    }),
  answer: (choice) => {
    const resolve = get().resolve
    set({ open: false, resolve: null })
    resolve?.(choice)
  },
}))
