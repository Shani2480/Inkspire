import type { SizeFinding } from "@/document/docx/optimize"
import { create } from "zustand"

type Offer = { fileName: string; bytes: Uint8Array; findings: SizeFinding[] }

/** What the Optimize Size dialog shows: the file as it would be saved, and what could be removed from it. */
export const useOptimizeDialog = create<{ offer: Offer | null; show: (offer: Offer) => void; hide: () => void }>(
  (set) => ({
    offer: null,
    show: (offer) => set({ offer }),
    hide: () => set({ offer: null }),
  }),
)
