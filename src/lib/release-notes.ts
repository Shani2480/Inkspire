import { version } from "../../package.json"

/**
 * What changed in each version, in plain words, newest first. Help > What's New shows them, and Inkspire opens it once
 * after an update. Add the new version's notes here whenever the version in package.json goes up (a test checks).
 */
export type ReleaseNote = { title: string; text: string }
export type Release = { version: string; date: string; notes: ReleaseNote[] }

export const RELEASES: Release[] = [
  {
    version: "1.0.3",
    date: "2026-11-20",
    notes: [
      {
        title: "The selected tab stays in sight on a phone",
        text: "The ribbon's tab row could open scrolled past Home, so the tab in use was out of sight. It now scrolls to show the selected tab.",
      },
    ],
  },
  {
    version: "1.0.2",
    date: "2026-11-20",
    notes: [
      {
        title: "The ribbon stays in reach on a phone",
        text: "With Unsaved Documents folded away, its strip now rests above the ribbon at the bottom of the screen instead of covering it.",
      },
      {
        title: "Hints wait for open panels",
        text: 'On a phone, a "New: …" hint no longer appears over a panel you have open; it waits until you close it.',
      },
    ],
  },
  {
    version: "1.0.1",
    date: "2026-11-20",
    notes: [
      {
        title: "Inkspire 1.0",
        text: "Open, edit and save Word documents on your computer, phone and tablet, looking as they do in Word, and saved so Word opens them as they were. This version brings together everything since 0.12: documents in their own fonts, 3D models you turn with a finger, and spelling suggestions on touch screens.",
      },
      {
        title: "Spelling menu clear of the handles",
        text: "On a phone or tablet, the spelling suggestions open below the word, so the selection handles no longer cover the first one.",
      },
    ],
  },
  {
    version: "0.12.1",
    date: "2026-11-20",
    notes: [
      {
        title: "Spelling suggestions on a touch screen",
        text: "Press and hold a word with a red underline to see its suggestions, Ignore All and Add to Dictionary. Elsewhere a long press still shows Android's Cut, Copy and Paste bar.",
      },
      {
        title: "Turn 3D models freely",
        text: "Tap a 3D model, then drag anywhere on it to turn it, for as long as you like; let go mid-turn and it spins on a little and settles. Before, a turn on a touch screen stopped after a second. A swipe over a model you haven't tapped scrolls the page, and the way you leave it is saved with the document.",
      },
      {
        title: "No keyboard over a selected picture",
        text: "On a phone or tablet, selecting a picture, shape or 3D model no longer brings up the keyboard. It comes back when you tap into text.",
      },
      {
        title: "Lines with big and small text stay in place",
        text: "A line with a large word in it kept its height only until you edited the paragraph after it, and then overlapped the line above. It now keeps its height.",
      },
    ],
  },
  {
    version: "0.12.0",
    date: "2026-11-20",
    notes: [
      {
        title: "Documents in their own fonts",
        text: "When a document uses a free font you don't have, such as Lato or Open Sans, Inkspire offers to download it from Google Fonts, so the document looks and wraps as in Word. Nothing is downloaded until you choose Download, and the fonts are kept for Inkspire only. See or remove them in File > Options > Fonts.",
      },
      {
        title: "Fonts saved in the document",
        text: "A Word document saved with its fonts (Embed fonts in the file) now shows in those fonts, and saving it keeps them.",
      },
      {
        title: "Line heights for every font",
        text: "A paragraph written in another font than its style's now has that font's line height, as in Word.",
      },
      {
        title: "Fixes from real documents",
        text: "Dash and bullet lists that take their numbering from their style now show. Line numbers leave tables out and number each line once. Charts take the document's theme colours.",
      },
    ],
  },
  {
    version: "0.11.0",
    date: "2026-11-20",
    notes: [
      {
        title: "Hints about features you may not know",
        text: "Now and then a small blue hint points at one of Inkspire's special features, such as Read Mode, Dictate or Translate. Tap it and it goes away for good. Turn hints off, or show them all again, in File > Options > General.",
      },
      {
        title: "Tabs line up as in Word",
        text: "Text after a tab moves to the next half-inch mark, as Word places it. Before, it was always half an inch past the text, so it could sit up to half an inch off.",
      },
      {
        title: "Two-column documents open in their columns",
        text: "A Word document in two columns opened with its first column running over the page's end and too few pages. It now opens with each page as Word lays it out.",
      },
      {
        title: "Closer to Word on screen",
        text: "Documents that name no font show in Times New Roman, as Word shows them. Lines in mixed fonts and sizes, pictures in exactly spaced lines, triple-spaced text and tables now break and space as in Word, and a picture among a paragraph's text is saved inside its paragraph.",
      },
    ],
  },
  {
    version: "0.10.0",
    date: "2026-11-17",
    notes: [
      {
        title: "Your device's fonts on Android",
        text: "The font list on a phone or tablet now includes the fonts Android has, such as sans-serif, serif, monospace and the names it knows them by (Arial, Times …).",
      },
      {
        title: "Save As and Rename on Android",
        text: "A document saved under a new name can be saved again and opened from Recent after Inkspire restarts. Renaming a document from its title now renames the file where it is; where that place does not allow it, Inkspire says so.",
      },
      {
        title: "Dates in Recent",
        text: "Recent shows when each document was last changed: the time for today, the day and month this year, the full date before.",
      },
      {
        title: "Opening starts at the top",
        text: "An opened document puts the cursor at its start, as Word does. A document ending in a table no longer opens with the table's toolbar over the page.",
      },
      {
        title: "Easier on a phone",
        text: "Borders and Shading fits a phone's screen at full size. A table of contents' Update Table button is big enough for a finger and appears under the table when you tap it. A picture left selected no longer shows its toolbar over Read Mode.",
      },
    ],
  },
  {
    version: "0.9.1",
    date: "2026-11-17",
    notes: [
      {
        title: "Selecting text no longer covers the page",
        text: "On a phone or tablet, holding your finger on text selects it and shows the system's small Cut, Copy and Paste bar, instead of the full right-click menu that covered most of the screen. A mouse's right-click still opens the full menu.",
      },
    ],
  },
  {
    version: "0.9.0",
    date: "2026-11-17",
    notes: [
      {
        title: "Smooth page turns in long books",
        text: "The page curl in Read Mode now runs smoothly even in a long book in a complex script, which turned at a few frames a second before.",
      },
      {
        title: "Read Mode keeps to the text",
        text: "On a phone, Read Mode now shows just the text, a slim bar with Tools, View and Edit Document above it and the page number below, as Word's reading view does. Back returns to editing.",
      },
      {
        title: "More room for the page",
        text: "On a phone the borders and margins around the page and the ribbon are thinner, so more of the document fits on the screen.",
      },
      {
        title: "A new icon on Android",
        text: "Inkspire has a new launcher icon: a page with the AI spark, on deep blue. It follows your wallpaper's colours when themed icons are turned on.",
      },
    ],
  },
  {
    version: "0.8.0",
    date: "2026-11-17",
    notes: [
      {
        title: "Long documents open much faster",
        text: "A book of several hundred pages now opens in a fraction of the time it took, and the app no longer seems to freeze while it lays the pages out.",
      },
      {
        title: "Pages curl like paper",
        text: "In Read Mode the page now folds over from its corner as you turn it, the back of the page and its shadow showing, as on an e-reader. Take it high or low and it curls from the top or bottom corner; a tap at the edge turns it the same way.",
      },
      {
        title: "Back goes back",
        text: "On Android, Back now closes the menu, dialog, pane or File view on top, and leaves Read Mode for editing, instead of closing the app. When Back would close Inkspire it asks first, and offers to save a document that has changes.",
      },
    ],
  },
  {
    version: "0.7.0",
    date: "2026-11-17",
    notes: [
      {
        title: "Pages turn under your finger",
        text: "In Read Mode the page now follows your finger as you swipe, its edge staying under your fingertip. Let go past a third of the page, or flick, and it turns; let go early and it falls back.",
      },
      {
        title: "Phone status bar",
        text: "The page number and word count no longer run into each other, and the zoom stays in view.",
      },
    ],
  },
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
