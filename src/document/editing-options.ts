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
  /** Spelling: suggest only words of the main dictionary, not ones the user added. */
  mainDictionaryOnly: boolean
  /** Word Count also gives the Flesch reading scores. */
  readability: boolean
  /** ScreenTips name a command's shortcut key. */
  showShortcutKeys: boolean
  /** Menus, dialogs and the File view animate; off, they appear at once. */
  animation: boolean
  /** Marks drawn even with Show/Hide ¶ off (Display > Always show these formatting marks on the screen). */
  marksTabs: boolean
  marksSpaces: boolean
  marksParagraph: boolean
  marksHidden: boolean
  marksHyphens: boolean
  /** Printing: shapes and drawings, page colour, hidden text, and a page of document properties after the document. */
  printDrawings: boolean
  printBackgrounds: boolean
  printHidden: boolean
  printProperties: boolean
  /** Advanced > Editing: typing over a selection replaces it, text can be dragged, a link needs Ctrl+Click. */
  typingReplacesSelection: boolean
  dragAndDrop: boolean
  ctrlClickLink: boolean
  /** The Insert key switches between inserting and overtyping; and overtype mode itself. */
  insertKeyOvertype: boolean
  overtype: boolean
  /** Advanced > Cut, copy, paste: "keep" the source formatting, "merge" it with the destination, or keep "text" only. */
  pasteSameDocument: string
  pasteOtherPrograms: string
  /** The status bar keeps checking accessibility as you edit; off, it waits to be asked. */
  keepAccessibilityRunning: boolean
  /** Advanced > Show document content: the page colour and watermark on screen; pictures as empty frames; shapes, text boxes and drawings. */
  showBackgrounds: boolean
  picturePlaceholders: boolean
  showDrawings: boolean
  /** Bookmarks as grey brackets; dotted lines at the text margins; corner marks where the margins meet. */
  showBookmarks: boolean
  textBoundaries: boolean
  cropMarks: boolean
  /** Fields show their code, as `{ DATE \@ "d MMMM yyyy" }`, in place of their result (Alt+F9). */
  fieldCodes: boolean
  /** Fields are shaded "never", "always", or when "selected". */
  fieldShading: string
  /** Draft and Outline views use one plain font, by name and size in points. */
  draftFont: boolean
  draftFontName: string
  draftFontSize: number
}

export const EDITING_DEFAULTS: EditingOptions = {
  miniToolbar: true,
  livePreview: true,
  ignoreUppercase: true,
  ignoreNumbers: true,
  ignoreAddresses: true,
  flagRepeated: true,
  recoverySeconds: 10,
  mainDictionaryOnly: false,
  readability: false,
  showShortcutKeys: true,
  animation: true,
  keepAccessibilityRunning: true,
  marksTabs: false,
  marksSpaces: false,
  marksParagraph: false,
  marksHidden: false,
  marksHyphens: false,
  printDrawings: true,
  printBackgrounds: true,
  printHidden: false,
  printProperties: false,
  typingReplacesSelection: true,
  dragAndDrop: true,
  ctrlClickLink: true,
  insertKeyOvertype: false,
  overtype: false,
  pasteSameDocument: "keep",
  pasteOtherPrograms: "keep",
  showBackgrounds: true,
  picturePlaceholders: false,
  showDrawings: true,
  showBookmarks: false,
  textBoundaries: false,
  cropMarks: false,
  fieldCodes: false,
  fieldShading: "selected",
  draftFont: false,
  draftFontName: "Courier New",
  draftFontSize: 10,
}

export const PASTE_CHOICES = [
  { id: "keep", label: "Keep Source Formatting" },
  { id: "merge", label: "Merge Formatting" },
  { id: "text", label: "Keep Text Only" },
]

export const RECOVERY_CHOICES = [5, 10, 30, 60, 300]

export const FIELD_SHADING_CHOICES = [
  { id: "never", label: "Never" },
  { id: "always", label: "Always" },
  { id: "selected", label: "When selected" },
]

export const DRAFT_FONT_NAMES = ["Courier New", "Consolas", "Arial", "Calibri", "Times New Roman"]

export const DRAFT_FONT_SIZES = [8, 9, 10, 11, 12, 14]

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

/** Options that act on the whole page rather than on one feature: marked on the root for CSS to follow. */
function applyPageFlags(options: EditingOptions) {
  if (typeof document !== "undefined") {
    const root = document.documentElement
    root.toggleAttribute("data-no-motion", !options.animation)
    // Read by the print styles in index.css.
    root.toggleAttribute("data-print-no-drawings", !options.printDrawings)
    root.toggleAttribute("data-print-no-bg", !options.printBackgrounds)
    root.toggleAttribute("data-print-hidden", options.printHidden)
    // Advanced > Show document content, read by the page styles.
    root.toggleAttribute("data-no-page-bg", !options.showBackgrounds)
    root.toggleAttribute("data-picture-placeholders", options.picturePlaceholders)
    root.toggleAttribute("data-no-drawings", !options.showDrawings)
    root.toggleAttribute("data-show-bookmarks", options.showBookmarks)
    root.toggleAttribute("data-text-boundaries", options.textBoundaries)
    root.toggleAttribute("data-crop-marks", options.cropMarks)
    root.toggleAttribute("data-field-codes", options.fieldCodes)
    root.setAttribute("data-field-shading", options.fieldShading)
    root.toggleAttribute("data-draft-font", options.draftFont)
    root.style.setProperty("--draft-font", `"${options.draftFontName.replace(/"/g, "")}"`)
    root.style.setProperty("--draft-font-size", `${options.draftFontSize}pt`)
  }
}

export const useEditingOptions = create<EditingOptions & { set: (patch: Partial<EditingOptions>) => void }>(
  (set, get) => ({
    ...load(),
    set: (patch) => {
      set(patch)
      applyPageFlags(get())
      try {
        localStorage.setItem(KEY, JSON.stringify(pick(get())))
      } catch {
        // Without storage the choice lasts until the page closes.
      }
    },
  }),
)

applyPageFlags(useEditingOptions.getState())
