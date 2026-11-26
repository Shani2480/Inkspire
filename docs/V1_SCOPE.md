# Inkspire 1.0 — scope and release-candidate criteria

2026-11-20. Released as **1.0.1** (version chosen 2026-11-20). What 1.0 promises, what it does not, and what must be true before a release candidate is marked.

## The promise

Open, edit and save the Word documents people meet every day (letters, contracts, forms, CVs, reports and theses
up to a few hundred pages) on the desktop (Linux, Windows, macOS) and on Android phones and tablets. They look as
they do in Word, and Word opens Inkspire's saves as they were.

## In scope for 1.0

- **Opening and saving .docx** without losing anything Word wrote (untouched parts kept as they were); Word opens
  every save. Also .dotx, .rtf, .odt, .txt and .md to open; .pdf to export.
- **Layout as in Word** for text, fonts, paragraph spacing and line rules, lists and numbering, tabs, tables,
  sections, columns, headers and footers, footnotes and endnotes, page breaks, pictures and shapes, text boxes,
  charts, TOC and the common fields.
- **Editing like Word 365**: the ribbon's Home, Insert, Layout, References, Review and View, the Font, Paragraph and
  Page Setup dialogs, styles, find and replace, comments and tracked changes, spelling and grammar, Read Mode,
  printing.
- **Android** phone layout (ribbon at the bottom, sheets, fit to width) and tablet layout (full ribbon).
- **First-run setup, What's New, feature hints**, optional local AI (opt-in).

## Not in 1.0

- Word UI wave 3 (U30–U38): Draw's eraser and lasso, custom watermark dialog, equation input modes, the Editing /
  Reviewing / Viewing switch, table markers on the ruler, Format Picture pane, rare shortcuts.
- A picture drawn inside its line of text (it shows on its own line; saving keeps the paragraph whole).
- A paragraph split between unequal columns.
- .doc (Word 97–2003), macros, iOS, real-time co-authoring, cloud accounts.
- Commercial fonts the device does not have (Aptos, Arial Nova, Avenir): shown in a similar font, so lines can wrap
  differently; the bar says so. Free fonts are offered from Google Fonts, same-width stand-ins cover Calibri, Cambria,
  Arial and Times, and fonts embedded in the document are used.

## Release-candidate criteria

1. **No known data loss:** every fixture and every document in the real-document set saves, and Word renders the
   save as the original. _Met on 2026-11-20 (77 of 77)._
2. **Real documents look as in Word:** a set of at least 20 real, varied documents (letters, forms, contracts,
   reports, a thesis, a CV, documents from Google Docs and LibreOffice) is compared page by page with Word. Every
   difference is fixed or listed under known limits. _Not met: 13 real documents so far (2026-11-26: the contract and the form, then eight more, all with Word's page count; their bugs fixed but those listed below)._
3. **Checked where it runs:** the core items of `verify-list.md` (open, type, format, table, picture, save, print)
   are ticked in the desktop app on Linux and Windows and on an Android phone and tablet. _Partly met: the Android tablet (OnePlus Pad), the phone (Pixel) and the Linux desktop app pass (2026-11-20); Windows is open._
4. **Tests, typecheck, lint and the Open XML validator are clean.** _Met._

## Open bugs found on real documents (2026-11-20)

- ~~A list whose bullet is a dash shows no bullet (a contract).~~ Fixed 2026-11-20: lists numbered by their style.
- ~~Line numbers are drawn inside a table's cells and counted on through it; Word leaves tables out.~~ Fixed
  2026-11-20 (and a line in pieces numbered once); a picture's or chart's line is numbered too since 2026-11-24.
- ~~A chart's series take a default palette instead of the document's theme colours.~~ Fixed 2026-11-20; chart
  line widths as Word's since 2026-11-24 (they were points taken as pixels).

## Open differences found on real documents (2026-11-26)

- ~~Word squeezes a justified line's spaces to fit a word; the app only stretches them (one line on a contract moves
  to the next page).~~ Mostly fixed in 1.1.3: an allowance of two spaces a line (96 of 120 test paragraphs break as
  Word's; Word's own limit varies with the text), and the contract's pages all hold Word's lines.
- Spaces in runs marked Korean (`w:lang w:eastAsia="ko-KR"`) are wider in Word than the font's own.
- Documents 6 to 13: autofit tables without cell widths keep the grid's widths; one row of the 27-page report lands a page later (its page
  ends about 1 px lower than Word's). Listed in `next-todo.md`.
