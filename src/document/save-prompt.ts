import { create } from "zustand"

/** The answer to Word's "Do you want to save changes?" prompt. */
export type SaveChoice = "save" | "discard" | "cancel"

type SavePromptState = {
  /** The document asked about while the prompt is open. */
  name: string | null
  resolve: ((choice: SaveChoice) => void) | null
  ask: (name: string) => Promise<SaveChoice>
  answer: (choice: SaveChoice) => void
}

export const useSavePrompt = create<SavePromptState>((set, get) => ({
  name: null,
  resolve: null,
  ask: (name) =>
    new Promise<SaveChoice>((resolve) => {
      // A second request (a close while Open is asking) answers the first as Cancel.
      get().resolve?.("cancel")
      set({ name, resolve })
    }),
  answer: (choice) => {
    const resolve = get().resolve
    set({ name: null, resolve: null })
    resolve?.(choice)
  },
}))
