import { create } from "zustand"

export type BackstageTab =
  | "home"
  | "new"
  | "open"
  | "addins"
  | "info"
  | "save"
  | "save-as"
  | "history"
  | "print"
  | "share"
  | "export"
  | "transform"
  | "close"
  | "account"
  | "options"

type BackstageState = {
  open: boolean
  tab: BackstageTab
  /** The document was closed (File > Close, Ctrl+W): the File view stays until one is created or opened. */
  closed: boolean
  openBackstage: (tab?: BackstageTab) => void
  closeBackstage: () => void
  setTab: (tab: BackstageTab) => void
  setClosed: (closed: boolean) => void
}

export const useBackstage = create<BackstageState>((set) => ({
  // The app starts on the File menu, as Word starts on its start screen.
  open: true,
  tab: "home",
  closed: false,
  openBackstage: (tab = "home") => set({ open: true, tab }),
  closeBackstage: () => set((state) => (state.closed ? state : { open: false })),
  setTab: (tab) => set({ tab }),
  setClosed: (closed) => set({ closed }),
}))
