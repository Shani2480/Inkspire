import { version } from "../../package.json"

/**
 * What changed in each version, in plain words, newest first. Help > What's New shows them, and Inkspire opens it once
 * after an update. Add the new version's notes here whenever the version in package.json goes up (a test checks).
 */
export type ReleaseNote = { title: string; text: string }
export type Release = { version: string; date: string; notes: ReleaseNote[] }

export const RELEASES: Release[] = [
  {
    version: "0.6.0",
    date: "2026-11-17",
    notes: [
      {
        title: "Read Mode turns pages like a book",
        text: "Each page now turns over like a sheet of paper. On a phone, swipe or tap near the edge to turn. Read Mode also opens and turns much faster in long documents.",
      },
      {
        title: "Easier to tap on a phone",
        text: "The buttons, tabs and menus on a phone are bigger. The title bar keeps Save, Undo and Redo. Side panes have a handle: swipe them down to close.",
      },
      {
        title: "Fewer popups on touch screens",
        text: "Selecting text or tapping in a table no longer covers the page with a toolbar. A small round button appears instead; tap it for the formatting or table tools. File > Options > General lets you show them right away or never.",
      },
    ],
  },
  {
    version: "0.5.0",
    date: "2026-11-17",
    notes: [
      {
        title: "Print and PDF on Android",
        text: "File > Print opens Android's print screen, which prints to your printer or saves the document as a PDF. Export > PDF goes there too.",
      },
      {
        title: "Share on Android",
        text: "File > Share > Send a copy sends the document as a Word file by mail, in a chat or to another app, through Android's share menu.",
      },
      {
        title: "Open with Inkspire",
        text: "Word, OpenDocument, RTF, text and Markdown files open in Inkspire straight from Files, Gmail and other apps. OpenDocument (.odt) files now open on Android and in the browser too.",
      },
      {
        title: "Clearer lists",
        text: "Recent shows where a document is (Phone storage › Documents, Downloads, Google Drive) instead of a long link. Commands Android can't run, such as Edit in Cells, are no longer offered there.",
      },
    ],
  },
  {
    version: "0.4.0",
    date: "2026-11-17",
    notes: [
      {
        title: "Inkspire on a phone",
        text: "On an Android phone the page now fits the screen, and the commands sit at the bottom above the keyboard, as in Word on a phone: swipe the row for more, and the tabs under it for the others. Side panes open as sheets from the bottom, and the File screen and dialogs fit the screen.",
      },
      {
        title: "Tapping the page",
        text: "On a touch screen, a tap in the margin or below the text puts the cursor in the nearest line, ready to type. A long press opens the menu with Cut, Copy, Paste and more.",
      },
      {
        title: "Tablets",
        text: "The Clipboard and Editing names no longer run into the buttons above them on a touch screen.",
      },
    ],
  },
  {
    version: "0.3.3",
    date: "2026-11-17",
    notes: [
      {
        title: "Tables of contents",
        text: "A table of contents from Word now keeps the empty line Word shows below its entries, so the text after it starts where it does in Word.",
      },
    ],
  },
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
