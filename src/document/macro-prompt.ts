import { create } from "zustand"

/**
 * Word's warning when a document with macros is saved as a type that cannot hold them (.docx, .dotx): Yes saves
 * without the macros, No goes back to Save As.
 */
type MacroPromptState = {
  open: boolean
  resolve: ((keepGoing: boolean) => void) | null
  ask: () => Promise<boolean>
  answer: (keepGoing: boolean) => void
}

export const useMacroPrompt = create<MacroPromptState>((set, get) => ({
  open: false,
  resolve: null,
  ask: () =>
    new Promise<boolean>((resolve) => {
      get().resolve?.(false)
      set({ open: true, resolve })
    }),
  answer: (keepGoing) => {
    const resolve = get().resolve
    set({ open: false, resolve: null })
    resolve?.(keepGoing)
  },
}))
