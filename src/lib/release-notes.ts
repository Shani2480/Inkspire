import { version } from "../../package.json"

/**
 * What changed in each version, in plain words, newest first. Help > What's New shows them, and Inkspire opens it once
 * after an update. Add the new version's notes here whenever the version in package.json goes up (a test checks).
 */
export type ReleaseNote = { title: string; text: string }
export type Release = { version: string; date: string; notes: ReleaseNote[] }

export const RELEASES: Release[] = [
  {
    version: "1.2.4",
    date: "2026-11-26",
    notes: [
      {
        title: "Tables as tall as in Word",
        text: "Table borders, thin or thick, no longer make rows a fraction taller or shorter than Word's, so long documents with many tables break pages where Word does.",
      },
      {
        title: "Columns fitted to their words",
        text: "A Word table that resizes to its contents widens a column to fit its longest word, as Word does.",
      },
    ],
  },
  {
    version: "1.2.3",
    date: "2026-11-26",
    notes: [
      {
        title: "Tables sized to their text",
        text: "A Word table that sets no column widths now has its columns sized to their text, as Word draws it, and keeps that when you save. Dragging a column sets its width, as in Word.",
      },
    ],
  },
  {
    version: "1.2.2",
    date: "2026-11-26",
    notes: [
      {
        title: "Pages after a section break start as in Word",
        text: "On a page a section break starts, the first paragraph's space before now comes out as Word sets it: less the space after of the paragraph that ended the section, which stays on the page before.",
      },
    ],
  },
  {
    version: "1.2.1",
    date: "2026-11-26",
    notes: [
      {
        title: "Tables break across pages as in Word",
        text: "A row no longer leaves a single line behind at the foot of a page, and a table's header row is no longer left alone there: the table starts on the next page.",
      },
      {
        title: "Pages hold what Word's hold",
        text: "Rows with fine borders are as tall as in Word, a long table of contents no longer creeps down the page, and each page's text starts at the top margin instead of a few pixels above or below it.",
      },
      {
        title: "Page numbers in footers",
        text: "A page number set at the right margin no longer drops to a line of its own.",
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-11-26",
    notes: [
      {
        title: "Tables of contents filled in and split across pages",
        text: "A table of contents a program left empty, marked to be updated, is now filled in from the headings when the document opens, as Word does. A long table of contents now goes on to the next page instead of running off the bottom.",
      },
      {
        title: "Pages start where Word starts them",
        text: "At the top of a new page Word leaves out a paragraph's space before; Inkspire now does too. Pages also no longer creep lower from page to page, and a list item's bullet moves to the next page with its text.",
      },
      {
        title: "Tables as in Word",
        text: "Rows of an exact height keep it (cut text no longer stretches them), rows with a minimum height and cell margins are as tall as in Word, and a table's header row repeats at the top of each page.",
      },
      {
        title: "Headers and footers",
        text: "A full-width picture in a footer sits where Word puts it, and a page number after a tab lines up at the right margin.",
      },
      {
        title: "Fill-ins such as [Client Name]",
        text: "Their yellow mark no longer takes room, so lines break as in Word, and it is left off when you print.",
      },
    ],
  },
  {
    version: "1.1.5",
    date: "2026-11-26",
    notes: [
      {
        title: "Justified text in the Linux app",
        text: "On a screen without scaling, the Linux app sets text a little wider than the font's true widths, so a justified line now and then broke a word earlier than in Word. Inkspire now allows for that, and justified paragraphs break as they do in Word there too.",
      },
    ],
  },
  {
    version: "1.1.4",
    date: "2026-11-26",
    notes: [
      {
        title: "Arial on Android",
        text: "Android draws Arial, Times New Roman and Courier New in its own fonts, which are wider or narrower, so lines broke in other places than in Word. Inkspire now sees that these fonts are missing and offers their free look-alikes with the same widths (Arimo, Tinos, Cousine) in the fonts bar.",
      },
    ],
  },
  {
    version: "1.1.3",
    date: "2026-11-26",
    notes: [
      {
        title: "Justified text breaks as in Word",
        text: "Word fits one more word on a justified line by narrowing its spaces a little; Inkspire now does too, so justified paragraphs break their lines, and long documents their pages, much closer to where Word does.",
      },
      {
        title: "Pages no longer drift",
        text: "Text sat a little lower on every page than the last, up to several points by page six. Each page now starts where Word starts it, and a list that runs past the foot of a page goes on to the next item by item instead of moving whole.",
      },
      {
        title: "No empty page after a final heading",
        text: "A document ending in a heading showed, and saved, an empty second page made of the line the editor keeps for typing below it. That line now hangs below the last page and is not saved.",
      },
    ],
  },
  {
    version: "1.1.2",
    date: "2026-11-26",
    notes: [
      {
        title: "Indented text in text boxes",
        text: "Text in a text box keeps its paragraph indent from Word, so a cover page's title sits where Word puts it. The indent stays when you edit the box and save.",
      },
    ],
  },
  {
    version: "1.1.1",
    date: "2026-11-26",
    notes: [
      {
        title: "Missing fonts shown as Word shows them",
        text: "When a document uses a font this device does not have, its text is drawn in the font Word itself uses in its place (Calibri, or Cambria for a serif font), so lines and pages break where they do in Word. Arial Nova Cond is shown in Roboto Condensed, which has nearly its widths; the bar offers it as a free download.",
      },
      {
        title: "Page breaks inside a paragraph",
        text: "A page break typed at the end of a line of text now starts the next page, as in Word; before, the text after it ran on. A page break on a nearly full page moves to the next page and leaves a blank page, as in Word.",
      },
      {
        title: "Closer to Word on the page",
        text: "Empty lines are as tall as their paragraph mark, text in text boxes has Word's line spacing, and text is no longer kerned unless the document asks for it.",
      },
      {
        title: "Documents on a line grid",
        text: "A document set on a line grid (common in forms and in documents from Asia) shows its lines and table rows at the grid's spacing, as Word does, and keeps the grid when saved; before, Word showed the saved copy shorter.",
      },
      {
        title: "Text below wide floating tables",
        text: "Text after a floating table as wide as the page now starts below the table instead of running under its last row.",
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-11-24",
    notes: [
      {
        title: "Pictures inside a line of text",
        text: "A picture in line with text now sits among the words of its line, as in Word, instead of on a line of its own. Pictures you add while the cursor is in text go in at the cursor. You can still select, resize, crop and format them, and Wrap Text moves one out of the line.",
      },
      {
        title: "Format Picture pane",
        text: "Right-click a picture and choose Format Picture, or pick the Options entry at the foot of Corrections, Color, Artistic Effects or Transparency. Sliders set brightness, contrast, saturation and transparency exactly, and the Crop section sizes and places the picture and its crop in centimetres.",
      },
      {
        title: "More on the mini toolbar",
        text: "The toolbar over selected text now has Format Painter, Styles, Line Spacing and New Comment.",
      },
    ],
  },
  {
    version: "1.0.8",
    date: "2026-11-24",
    notes: [
      {
        title: "Chart lines as thick as in Word",
        text: "Chart lines, borders and gridlines are drawn at the width Word gives them. They were a quarter thinner.",
      },
      {
        title: "Line numbers count pictures and charts",
        text: "With line numbering on, the line holding an in-line picture, chart or 3D model gets its number, at the foot of the object, and the lines after it count on as in Word.",
      },
    ],
  },
  {
    version: "1.0.7",
    date: "2026-11-24",
    notes: [
      {
        title: "Smoother page turns in long books",
        text: "Read Mode turns the pages of a long book without the stutter during and after each turn. The cursor's place in the hidden editor and the copy of the whole book made for the turning page both slowed every frame; now only the turning page is copied.",
      },
      {
        title: "Text shows through the turning page",
        text: "As on an e-reader, the back of a page being turned shows its own text faintly, reversed, as if held to the light.",
      },
      {
        title: "Readable dark Read Mode",
        text: "In dark mode, Read Mode's text was near-black on a dark page. It now uses the page colour's light text (and the sepia page its brown text).",
      },
    ],
  },
  {
    version: "1.0.6",
    date: "2026-11-24",
    notes: [
      {
        title: "Spreadsheets keep their empty rows and columns",
        text: "An Excel Spreadsheet you made bigger before saving now opens again at the same size, with its empty rows and columns, as in Word. Before, only the cells you had typed in came back.",
      },
      {
        title: "Font and Paragraph fit your phone",
        text: "On a phone the Font and Paragraph dialogs now have their own narrow layout at full size, instead of a shrunken copy of the desktop one. The Font, Font style and Size lists also have rows big enough for a finger, and only the chosen row is highlighted.",
      },
    ],
  },
  {
    version: "1.0.5",
    date: "2026-11-20",
    notes: [
      {
        title: "New tables look as they are saved",
        text: "A table from Insert > Table showed its first row bold on grey, but it was saved as a plain row. Every row is now plain, as in Word, so the table looks the same after you reopen it.",
      },
    ],
  },
  {
    version: "1.0.4",
    date: "2026-11-20",
    notes: [
      {
        title: "A drop cap stays with its paragraph",
        text: "Pressing Enter at the end of a paragraph with a drop cap no longer gives the next paragraph a drop cap too, as in Word.",
      },
      {
        title: "Menus stay inside the window",
        text: "Right-clicking a table or picture near the bottom or right edge of the window opens its menu upward or to the left, so every command stays in reach.",
      },
    ],
  },
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
