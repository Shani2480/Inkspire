import { create } from "zustand"

const KEY = "aiword.editing-options"

/** Options that change how the editor behaves (22.9). Kept in this browser. */
export type EditingOptions = {
  /** Show the Mini Toolbar when text is selected. */
  miniToolbar: boolean
  /** Show a command's result on the document while the pointer is over its choice. */
  livePreview: boolean
  /** Spelling: leave out words in capitals, words with digits, and Internet and file addresses. */
  ignoreUppercase: boolean
  ignoreNumbers: boolean
  ignoreAddresses: boolean
  /** Spelling: underline a word that repeats the one before it. */
  flagRepeated: boolean
  /** Seconds between recovery copies of unsaved changes. */
  recoverySeconds: number
}

export const EDITING_DEFAULTS: EditingOptions = {
  miniToolbar: true,
  livePreview: true,
  ignoreUppercase: true,
  ignoreNumbers: true,
  ignoreAddresses: true,
  flagRepeated: true,
  recoverySeconds: 10,
}

export const RECOVERY_CHOICES = [5, 10, 30, 60, 300]

function load(): EditingOptions {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, unknown>
    const next = { ...EDITING_DEFAULTS } as Record<string, unknown>
    for (const [name, fallback] of Object.entries(EDITING_DEFAULTS)) {
      if (typeof parsed[name] === typeof fallback) {
        next[name] = parsed[name]
      }
    }
    return next as EditingOptions
  } catch {
    return { ...EDITING_DEFAULTS }
  }
}

function pick(state: EditingOptions): EditingOptions {
  const picked = {} as Record<string, unknown>
  for (const name of Object.keys(EDITING_DEFAULTS)) {
    picked[name] = state[name as keyof EditingOptions]
  }
  return picked as EditingOptions
}

export const useEditingOptions = create<EditingOptions & { set: (patch: Partial<EditingOptions>) => void }>(
  (set, get) => ({
    ...load(),
    set: (patch) => {
      set(patch)
      try {
        localStorage.setItem(KEY, JSON.stringify(pick(get())))
      } catch {
        // Without storage the choice lasts until the page closes.
      }
    },
  }),
)
