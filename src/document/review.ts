import { create } from "zustand"

/** Display for Review: Simple Markup, All Markup, No Markup (the result) or Original. */
export type MarkupMode = "all" | "simple" | "none" | "original"

/** Track Changes: For Everyone, or Just Mine (others' edits in a shared document are not tracked). */
export type TrackFor = "everyone" | "mine"

/** Restrict Editing's "Allow only this type of editing": Word's w:documentProtection w:edit ("none" limits formatting only). */
export type ProtectionEdit = "none" | "readOnly" | "comments" | "trackedChanges" | "forms"

/** The password Word stores for protection: a salted, iterated hash (never the password). */
export type ProtectionHash = { algorithm: string; hash: string; salt: string; spinCount: number }

/**
 * The document's protection as Word keeps it in settings.xml: what may be edited, whether it is enforced, whether
 * formatting is limited to the allowed styles, and the password's hash. Lock Tracking is trackedChanges enforced.
 */
export type DocumentProtection = {
  edit: ProtectionEdit
  enforced: boolean
  formatting: boolean
  password?: ProtectionHash
  /** Word's own attributes when read from a file and not changed, written back as they were. */
  source?: string
}

type ReviewState = {
  panel: boolean
  showComments: boolean
  tracking: boolean
  markup: MarkupMode
  trackFor: TrackFor
  /** Show Markup: which kinds of markup are drawn. */
  showInsertions: boolean
  showFormatting: boolean
  /** Show Markup > Specific People: the reviewers whose changes are hidden. */
  hiddenAuthors: string[]
  /** Restrict Editing, as set (enforced or not) for the open document; null when none was set. */
  protection: DocumentProtection | null
  /** Restrict Editing pane is open. */
  restrictPane: boolean
  showResolved: boolean
  activeCommentId: string | null
  popoverCommentId: string | null
  setPanel: (panel: boolean) => void
  setShowComments: (showComments: boolean) => void
  setTracking: (tracking: boolean) => void
  setMarkup: (markup: MarkupMode) => void
  set: (patch: Partial<ReviewState>) => void
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
  trackFor: "everyone",
  showInsertions: true,
  showFormatting: true,
  hiddenAuthors: [],
  protection: null,
  restrictPane: false,
  showResolved: false,
  activeCommentId: null,
  popoverCommentId: null,
  setPanel: (panel) => set({ panel }),
  setShowComments: (showComments) =>
    set((state) => ({
      showComments,
      popoverCommentId: showComments ? state.popoverCommentId : null,
    })),
  // Locked tracking (tracked changes enforced) cannot be turned off without stopping protection.
  setTracking: (tracking) =>
    set((state) =>
      !tracking && state.protection?.enforced && state.protection.edit === "trackedChanges" ? {} : { tracking },
    ),
  setMarkup: (markup) => set({ markup }),
  set: (patch) => set(patch),
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

/** Tracking is locked: on, and only Stop Protection (with its password) turns it off. */
export function trackingLocked(state: Pick<ReviewState, "protection">) {
  return Boolean(state.protection?.enforced && state.protection.edit === "trackedChanges")
}

/** What may be changed while protection is enforced: everything, nothing, only comments, or only form fields. */
export function editingAllowed(state: Pick<ReviewState, "protection">): "all" | "none" | "comments" | "forms" {
  const protection = state.protection
  if (!protection?.enforced || protection.edit === "trackedChanges" || protection.edit === "none") {
    return "all"
  }
  return protection.edit === "readOnly" ? "none" : protection.edit
}

/** What a save writes to settings.xml: Track Changes on or off, and the document's protection. */
export function reviewForSave() {
  const state = useReviewStore.getState()
  return { trackRevisions: state.tracking, protection: state.protection }
}

/** An opened document brings its own Track Changes and protection (none for anything but Word files). */
export function applyOpenedReview(settings: { trackRevisions?: boolean; protection?: DocumentProtection | null }) {
  useReviewStore.setState({
    tracking: Boolean(settings.trackRevisions),
    protection: settings.protection ?? null,
    hiddenAuthors: [],
  })
}
