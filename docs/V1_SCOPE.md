# Inkspire 1.0 — scope and release-candidate criteria

Draft, 2026-11-20. What 1.0 promises, what it does not, and what must be true before a release candidate is marked.

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
- Fonts the device does not have: Inkspire uses a stand-in with the same widths where one exists (Carlito for
  Calibri, Liberation for Arial and Times); for others (Aptos, Arial Nova, Avenir) lines can wrap differently.

## Release-candidate criteria

1. **No known data loss:** every fixture and every document in the real-document set saves, and Word renders the
   save as the original. *Met on 2026-11-20 (77 of 77).*
2. **Real documents look as in Word:** a set of at least 20 real, varied documents (letters, forms, contracts,
   reports, a thesis, a CV, documents from Google Docs and LibreOffice) is compared page by page with Word. Every
   difference is fixed or listed under known limits. *Not met: 3 real documents so far, with 3 open bugs below.*
3. **Checked where it runs:** the core items of `verify-list.md` (open, type, format, table, picture, save, print)
   are ticked in the desktop app on Linux and Windows and on an Android phone and tablet. *Not met: 144 items open.*
4. **Tests, typecheck, lint and the Open XML validator are clean.** *Met.*

## Open bugs found on real documents (2026-11-20)

- A list whose bullet is a dash shows no bullet (a contract).
- Line numbers are drawn inside a table's cells and counted on through it; Word leaves tables out.
- A chart's series take a default palette instead of the document's theme colours.
