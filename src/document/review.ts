import { create } from "zustand"

export type MarkupMode = "all" | "simple" | "original"

type ReviewState = {
  panel: boolean
  showComments: boolean
  tracking: boolean
  markup: MarkupMode
  showResolved: boolean
  activeCommentId: string | null
  popoverCommentId: string | null
  setPanel: (panel: boolean) => void
  setShowComments: (showComments: boolean) => void
  setTracking: (tracking: boolean) => void
  setMarkup: (markup: MarkupMode) => void
  setShowResolved: (showResolved: boolean) => void
  setActiveCommentId: (activeCommentId: string | null) => void
  setPopoverCommentId: (popoverCommentId: string | null) => void
  focusComment: (id: string, options?: { openPopover?: boolean; openPanel?: boolean; closePopover?: boolean }) => void
  clearCommentFocus: () => void
}

export const useReviewStore = create<ReviewState>((set) => ({
  panel: false,
  showComments: true,
  tracking: false,
  markup: "simple",
  showResolved: false,
  activeCommentId: null,
  popoverCommentId: null,
  setPanel: (panel) => set({ panel }),
  setShowComments: (showComments) =>
    set((state) => ({
      showComments,
      popoverCommentId: showComments ? state.popoverCommentId : null,
    })),
  setTracking: (tracking) => set({ tracking }),
  setMarkup: (markup) => set({ markup }),
  setShowResolved: (showResolved) => set({ showResolved }),
  setActiveCommentId: (activeCommentId) => set({ activeCommentId }),
  setPopoverCommentId: (popoverCommentId) => set({ popoverCommentId }),
  focusComment: (id, options) =>
    set((state) => {
      const showComments = options?.openPopover ? true : state.showComments
      return {
        activeCommentId: id,
        showComments,
        popoverCommentId: options?.closePopover
          ? null
          : options?.openPopover
            ? id
            : state.popoverCommentId === id
              ? id
              : state.popoverCommentId,
        panel: options?.openPanel ? true : state.panel,
      }
    }),
  clearCommentFocus: () => set({ activeCommentId: null, popoverCommentId: null }),
}))
