import { objectWrap, type ObjectWrap } from "@/editor/objects"
import { create } from "zustand"

export type LayoutTab = "position" | "wrap" | "size"

/** Word's Layout dialog (More Layout Options…), opened on one of its tabs for the selected object. */
export const useLayoutDialog = create<{
  tab: LayoutTab | null
  show: (tab: LayoutTab) => void
  close: () => void
}>((set) => ({
  tab: null,
  show: (tab) => set({ tab }),
  close: () => set({ tab: null }),
}))

const DEFAULT_WRAP_KEY = "inkspire.default-picture-wrap"

/** The wrap new pictures are inserted with (Wrap Text > Set as Default Layout); Word's default is In Line. */
export function defaultPictureWrap(): ObjectWrap {
  try {
    return objectWrap(localStorage.getItem(DEFAULT_WRAP_KEY) ?? "inline")
  } catch {
    return "inline"
  }
}

export function setDefaultPictureWrap(wrap: ObjectWrap | null) {
  try {
    if (!wrap || wrap === "inline") {
      localStorage.removeItem(DEFAULT_WRAP_KEY)
    } else {
      localStorage.setItem(DEFAULT_WRAP_KEY, wrap)
    }
  } catch {
    // Storage may be unavailable; the default stays In Line.
  }
}
