import { version } from "../../package.json"

/**
 * What changed in each version, in plain words, newest first. Help > What's New shows them, and Inkspire opens it once
 * after an update. Add the new version's notes here whenever the version in package.json goes up (a test checks).
 */
export type ReleaseNote = { title: string; text: string }
export type Release = { version: string; date: string; notes: ReleaseNote[] }

export const RELEASES: Release[] = [
  {
    version: "0.3.2",
    date: "2026-11-17",
    notes: [
      {
        title: "Line spacing as in Word",
        text: "With 1.15, 1.5 or double spacing, Word keeps the text at the top of each line and puts the extra space below it; with Exactly it sits a little lower. Inkspire now does the same, so pages line up with Word's, especially with wide spacing.",
      },
      {
        title: "New documents",
        text: "A new document's line spacing now matches what Word shows when you open it.",
      },
    ],
  },
  {
    version: "0.3.1",
    date: "2026-11-17",
    notes: [
      {
        title: "New documents look the same everywhere",
        text: "A new document is now written in Aptos, the font the Home tab names, instead of a serif font. When you save it, its font, size and line spacing go with it, so Word and Inkspire show it just as you typed it.",
      },
    ],
  },
  {
    version: "0.3.0",
    date: "2026-11-17",
    notes: [
      {
        title: "Draw like in Word",
        text: "The Draw tab has Word's pen gallery: pens, a pencil and a highlighter, each with its own colour and thickness. Click a chosen pen again to change it, or use Add Pen for more.",
      },
      {
        title: "Eraser and Lasso Select",
        text: "Wipe the Eraser over ink to remove strokes. Circle strokes with Lasso Select, then drag them somewhere else or press Delete.",
      },
      {
        title: "Ruler",
        text: "Draw > Ruler lays a ruler on the drawing canvas. Ink drawn along its edge comes out straight; drag it to move it, and turn it with the mouse wheel.",
      },
      {
        title: "Fixes",
        text: "A drawing canvas stays white in dark mode, like the page, and drawings saved for Word no longer carry the canvas's frame.",
      },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-11-17",
    notes: [
      {
        title: "Stock Images",
        text: "Insert > Pictures > Stock Images finds free public-domain photos to put in your document, several at once.",
      },
      {
        title: "Quick Tables and Excel spreadsheets",
        text: "Ready-made calendars and tables under Insert > Table > Quick Tables, and an Excel Spreadsheet you can edit in Cells. Tables you make now keep their column widths in Word.",
      },
      {
        title: "Mailings",
        text: "Mail merge from Excel, CSV or contacts, plus envelopes and labels.",
      },
      {
        title: "Protect your document",
        text: "Encrypt with a password, always open read-only, or mark as final, from File > Info.",
      },
      {
        title: "More of Word's menus",
        text: "All of Word's underline and border types, drop caps, the Selection pane, the Symbol dialog, Quick Parts and fields, KeyTips (press Alt), and Spelling in the right-click menu.",
      },
      {
        title: "Options like Word's",
        text: "Proofing, language, custom dictionaries and the Advanced editing options.",
      },
      {
        title: "Writing tools",
        text: "Outline view, the Navigation pane, Source Manager and citations, captions, cross-references, indexes, Paste Special, and footnote and endnote settings.",
      },
      {
        title: "Closer to Word",
        text: "Word documents open looking more like they do in Word, including styles, lists, notes and borders. Templates, macro-enabled documents and Word 97-2003 files open too.",
      },
      {
        title: "Fonts and fixes",
        text: "Optional fonts to download that match Office's sizes, and Share by email and Open containing folder now work in the desktop app.",
      },
    ],
  },
  {
    version: "0.1.6",
    date: "2026-11-12",
    notes: [
      {
        title: "Single line ribbon",
        text: "A compact one-row ribbon, as in Word for the web, for Home, Insert, Layout, References, Review, View and Help. Choose it from the arrow at the bottom right of the ribbon.",
      },
      {
        title: "Tables of contents that work like Word's",
        text: "Built-in and custom tables, Update Table, and tables that stay intact in .docx files.",
      },
      {
        title: "Dark mode everywhere",
        text: "Menus, dialogs, panes and the chart sheet now follow dark mode, while the page stays white.",
      },
      {
        title: "Safer AutoSave",
        text: "AutoSave keeps a recovery copy, and Inkspire asks to save before closing a changed document.",
      },
      {
        title: "Headers, footers and page breaks",
        text: "Edit headers and footers as Word does, add page breaks with Ctrl+Enter, and see the editor's own pages in the print preview.",
      },
    ],
  },
]

export const APP_VERSION = version

const SEEN_KEY = "inkspire:last-version"

/**
 * Whether to show What's New on start: once, the first time this version runs after another one did. A first start
 * (nothing remembered) shows nothing; the version is remembered either way.
 */
export function updatedSinceLastRun(storage: Pick<Storage, "getItem" | "setItem"> | null = safeStorage()) {
  if (!storage) {
    return false
  }
  try {
    const last = storage.getItem(SEEN_KEY)
    storage.setItem(SEEN_KEY, APP_VERSION)
    return last !== null && last !== APP_VERSION
  } catch {
    return false
  }
}

function safeStorage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}
