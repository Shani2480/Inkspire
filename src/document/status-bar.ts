import { create } from "zustand"

/**
 * Word's Customize Status Bar (right-click the status bar), in Word's order, with Word's defaults. Left out, as the
 * app has nothing behind them: Formatted Page Number, Vertical Page Position, Line Number, Column, Signatures,
 * Information Management Policy, Permissions, Selection Mode, Macro Recording, Upload Status and Document Updates
 * Available. The list was taken from Word 365 from memory; no screenshot of it is in the repo.
 */
export const STATUS_ITEMS = [
  { id: "section", label: "Section", on: false },
  { id: "page", label: "Page Number", on: true },
  { id: "words", label: "Word Count", on: true },
  { id: "characters", label: "Character Count (with spaces)", on: false },
  { id: "spelling", label: "Spelling and Grammar Check", on: true },
  { id: "language", label: "Language", on: true },
  { id: "track", label: "Track Changes", on: false },
  { id: "caps", label: "Caps Lock", on: false },
  { id: "overtype", label: "Overtype", on: false },
  { id: "accessibility", label: "Accessibility Checker", on: true },
  { id: "focus", label: "Focus", on: true },
  { id: "views", label: "View Shortcuts", on: true },
  { id: "slider", label: "Zoom Slider", on: true },
  { id: "zoom", label: "Zoom", on: true },
] as const

export type StatusItemId = (typeof STATUS_ITEMS)[number]["id"]

const KEY = "aiword.status-bar"

function readShown(): Record<StatusItemId, boolean> {
  const shown = Object.fromEntries(STATUS_ITEMS.map((item) => [item.id, item.on])) as Record<StatusItemId, boolean>
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>
    for (const item of STATUS_ITEMS) {
      if (typeof saved[item.id] === "boolean") {
        shown[item.id] = saved[item.id] as boolean
      }
    }
  } catch {
    // No storage (private window, tests): Word's defaults.
  }
  return shown
}

type StatusBarState = {
  shown: Record<StatusItemId, boolean>
  toggle: (id: StatusItemId) => void
  /** Word Count's "Include textboxes, footnotes and endnotes", which the status bar's count follows too. */
  countExtras: boolean
  setCountExtras: (countExtras: boolean) => void
}

function readExtras() {
  try {
    return localStorage.getItem(`${KEY}.extras`) !== "0"
  } catch {
    return true
  }
}

export const useStatusBar = create<StatusBarState>((set, get) => ({
  shown: readShown(),
  toggle: (id) => {
    const shown = { ...get().shown, [id]: !get().shown[id] }
    set({ shown })
    try {
      localStorage.setItem(KEY, JSON.stringify(shown))
    } catch {
      // Kept for this session only.
    }
  },
  countExtras: readExtras(),
  setCountExtras: (countExtras) => {
    set({ countExtras })
    try {
      localStorage.setItem(`${KEY}.extras`, countExtras ? "1" : "0")
    } catch {
      // Kept for this session only.
    }
  },
}))
