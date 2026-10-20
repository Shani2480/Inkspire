import { create } from "zustand"

export type ClipItem = {
  id: string
  text: string
  html: string
}

const LIMIT = 24

type ClipboardState = {
  open: boolean
  autoOpen: boolean
  items: ClipItem[]
  toggle: () => void
  setOpen: (open: boolean) => void
  setAutoOpen: (autoOpen: boolean) => void
  push: (item: { text: string; html: string }) => void
  remove: (id: string) => void
  clear: () => void
}

export const useClipboard = create<ClipboardState>((set) => ({
  open: false,
  autoOpen: false,
  items: [],
  toggle: () => set((state) => ({ open: !state.open })),
  setOpen: (open) => set({ open }),
  setAutoOpen: (autoOpen) => set({ autoOpen }),
  push: (item) =>
    set((state) => {
      const text = item.text.replace(/\u00a0/g, " ").trim()
      if (!text) {
        return state
      }
      if (state.items[0]?.text === text) {
        return state
      }
      const next: ClipItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        html: item.html,
      }
      return { items: [next, ...state.items].slice(0, LIMIT), open: state.autoOpen ? true : state.open }
    }),
  remove: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
  clear: () => set({ items: [] }),
}))

export function rememberClipboard(event: ClipboardEvent) {
  const selected = window.getSelection()?.toString() ?? ""
  const fromEvent = event.clipboardData?.getData("text/plain") ?? ""
  const text = selected.trim() ? selected : fromEvent
  const html = event.clipboardData?.getData("text/html") ?? ""
  useClipboard.getState().push({ text, html })
}
