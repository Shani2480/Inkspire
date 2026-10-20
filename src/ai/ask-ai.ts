import type { Editor } from "@tiptap/core"
import { create } from "zustand"

type AskAi = {
  open: boolean
  /** The selection (or the caret, when from and to are equal) the request is about. */
  from: number
  to: number
  show: (editor: Editor) => void
  hide: () => void
}

/** The small prompt that opens at the caret or the selection when the AI button in the title bar is pressed. */
export const useAskAi = create<AskAi>((set) => ({
  open: false,
  from: 0,
  to: 0,
  show: (editor) => {
    const { from, to } = editor.state.selection
    set({ open: true, from, to })
  },
  hide: () => set({ open: false }),
}))
