import type { OptionsPage } from "@/components/backstage/views"
import { create } from "zustand"

type OptionsDialogState = {
  open: boolean
  page: OptionsPage
  openOptions: (page?: OptionsPage) => void
  closeOptions: () => void
}

/** The Options dialog: Word's modal with a list of pages at the left (File > Options). */
export const useOptionsDialog = create<OptionsDialogState>((set) => ({
  open: false,
  page: "general",
  openOptions: (page = "general") => set({ open: true, page }),
  closeOptions: () => set({ open: false }),
}))
