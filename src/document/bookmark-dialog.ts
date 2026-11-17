import { create } from "zustand"

/** Insert > Bookmark… and Ctrl+Shift+F5 open the same dialog, drawn once by the workspace. */
export const useBookmarkDialog = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}))
