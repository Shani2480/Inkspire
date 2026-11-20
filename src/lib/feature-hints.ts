import { create } from "zustand"

/**
 * Hints that introduce Inkspire's special features, as Word's teaching callouts do: one at a time, pointing at the
 * feature's own control while it is on screen, worded as news. Only features people may not find on their own; the
 * everyday ones (bold, tables, save) get none. A tap dismisses a hint for good. On by default; File > Options >
 * General turns them off and shows them again.
 *
 * A new special feature gets its hint here when it is added.
 */
export type FeatureHint = {
  id: string
  title: string
  text: string
  /** The control it points at, by its accessible name; the hint waits until one is on screen. */
  target: string
}

export const FEATURE_HINTS: FeatureHint[] = [
  {
    id: "read-mode",
    title: "New: Read Mode",
    text: "Read a document like a book, a page at a time: turn pages with a swipe, a tap at the edge or the arrow keys.",
    target: "Read Mode",
  },
  {
    id: "focus",
    title: "New: Focus",
    text: "Fade the ribbon and status bar while you write, so only the page stands out. They come back when you point at them.",
    target: "Focus",
  },
  {
    id: "immersive-reader",
    title: "New: Immersive Reader",
    text: "Read the document as plain, easy-to-read text, and have it read aloud.",
    target: "Immersive Reader",
  },
  {
    id: "dictate",
    title: "New: Dictate",
    text: "Speak and Inkspire types what you say into the document.",
    target: "Dictate",
  },
  {
    id: "editor",
    title: "New: Editor",
    text: "See the whole document's spelling and grammar suggestions in one pane and go through them one by one.",
    target: "Editor",
  },
  {
    id: "translate",
    title: "New: Translate",
    text: "Translate the selection or the whole document into another language.",
    target: "Translate",
  },
  {
    id: "summarize",
    title: "New: Summarize with AI",
    text: "Get a short summary of the document or the selected text.",
    target: "Summarize",
  },
  {
    id: "rewrite",
    title: "New: Rewrite with AI",
    text: "Select a passage and have it rewritten, then replace it or insert the new version below.",
    target: "Rewrite",
  },
  {
    id: "mail-merge",
    title: "New: Mail Merge",
    text: "Make a personal copy of a letter or label for everyone on a list.",
    target: "Start Mail Merge",
  },
  {
    id: "3d-models",
    title: "New: 3D Models",
    text: "Insert a 3D model and turn it with the mouse or a finger to show it from any side.",
    target: "3D Models",
  },
]

/** The first hint not yet dismissed whose control is on screen, or none. */
export function nextHint(hints: FeatureHint[], dismissed: readonly string[], isShown: (target: string) => boolean) {
  return hints.find((hint) => !dismissed.includes(hint.id) && isShown(hint.target)) ?? null
}

export const HINTS_KEY = "aiword.feature-hints"

type HintState = { enabled: boolean; dismissed: string[] }

function load(): HintState {
  try {
    const parsed = JSON.parse(localStorage.getItem(HINTS_KEY) ?? "null") as Partial<HintState> | null
    return {
      enabled: parsed?.enabled !== false,
      dismissed: Array.isArray(parsed?.dismissed)
        ? parsed.dismissed.filter((id): id is string => typeof id === "string")
        : [],
    }
  } catch {
    return { enabled: true, dismissed: [] }
  }
}

function save(state: HintState) {
  try {
    localStorage.setItem(HINTS_KEY, JSON.stringify(state))
  } catch {
    // Without storage the hints simply show again next time.
  }
}

type HintStore = HintState & {
  dismiss: (id: string) => void
  setEnabled: (enabled: boolean) => void
  /** Every hint shows again (and hints are turned on). */
  showAgain: () => void
}

export const useFeatureHints = create<HintStore>((set, get) => ({
  ...load(),
  dismiss: (id) => {
    if (!get().dismissed.includes(id)) {
      set({ dismissed: [...get().dismissed, id] })
      save({ enabled: get().enabled, dismissed: get().dismissed })
    }
  },
  setEnabled: (enabled) => {
    set({ enabled })
    save({ enabled, dismissed: get().dismissed })
  },
  showAgain: () => {
    set({ enabled: true, dismissed: [] })
    save({ enabled: true, dismissed: [] })
  },
}))
