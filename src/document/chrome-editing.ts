import type { Editor } from "@tiptap/core"
import { create } from "zustand"

/**
 * The header or footer editor the caret is in while a header or footer is being edited. The ribbon and the dialogs act
 * on it instead of the body then, so a picture or a style applies to the header.
 */
export const useActiveChromeEditor = create<{ editor: Editor | null; activate: (editor: Editor | null) => void }>(
  (set) => ({
    editor: null,
    activate: (editor) => set({ editor }),
  }),
)
