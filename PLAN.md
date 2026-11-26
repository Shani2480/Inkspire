# Inkspire plan

A local, AI-first word processor that opens and saves Word documents as Word draws them. Desktop (Tauri: Linux,
Windows, macOS) and Android from one branch. Office-like look (`office-style-ui`), not the house style.

The detailed lists live in `docs/`: `next-todo.md` (open work, in order), `changes.md` (every fix, dated),
`verify-list.md` (checks still to do in the desktop app or on a phone), `DOCX_ROUNDTRIP.md` (what survives a save).
This file is the overview; update it in the same commit as the work.

✅ done · 🔄 in progress · ⬜ next · ⏸ later / waiting

## Done

- ✅ Editor, ribbon and dialogs modelled on Word 365 (phases 1–17 of `next-todo.md`): Home, Insert, Draw, Design,
  Layout, References, Mailings, Review, View, File backstage, Font and Page Setup dialogs, single-line ribbon.
- ✅ Word UI gaps waves 1 and 2 (U1–U29): everyday and common commands Word has.
- ✅ Opening and saving .docx: Word opens every fixture save and renders it as the original (74 of 74,
  2026-11-20); untouched parts kept as written; Open XML validator clean.
- ✅ Word layout fidelity: pagination, line spacing rules, tables, columns, footnotes, sections, pictures, shapes,
  TOC, fields, notes, tab stops. Word comparison 2026-11-20: mean layout difference 0.104 (was 0.189), 30 of 67
  fixtures identical.
- ✅ Feature hints (v0.11.0): "New: …" callouts for the special features, one at a time where the feature lives,
  dismissed by a tap, on by default, off and back on in File > Options > General.
- ✅ Documents in their own fonts (v0.12.0): free fonts a document uses offered from Google Fonts on request,
  fonts embedded in the file shown and kept on save, line heights read from the font.
- ✅ Android phase 1 and 2 except the items below: phone layout (ribbon at the bottom, sheets, fit to width),
  print, share, open-with, system fonts, Read Mode page curl, launcher icon.
- ✅ 1.0.6: an Excel Spreadsheet reopens at the size it was saved (empty rows and columns kept); Font and Paragraph
  laid out for a phone at full size (A7).
- ✅ 1.0.7: Read Mode's page turn smooth in long books (B19), the page's text through the back of the fold (B16),
  readable dark Read Mode.
- ✅ 1.0.8: chart line widths as Word's; line numbers count in-line pictures, charts and 3D models.
- ✅ 1.1.0: pictures drawn inside their line of text (and inserted there among words); the Format Picture pane; the
  mini toolbar's Format Painter, Styles, Line Spacing and New Comment.

- ✅ 1.1.1: real documents 4 and 5 compared with Word: missing fonts in Word's substitute (Calibri / Cambria),
  Arial Nova Cond in Roboto Condensed, empty lines as tall as their mark, page breaks among text, Word's line for a
  page break, text box line spacing, no kerning unless asked, the document grid (kept on save and drawn as Word
  does), text below a full-width floating table.

- ✅ 1.1.2: a text box's paragraph indent drawn and kept (a cover title where Word puts it).

- ✅ 1.1.3: justified lines squeezed as Word does (two spaces' allowance, trailing spaces hang), pages no longer
  drift lower (gap heights exact), a list that does not fit goes on item by item, and no empty page from the editor's
  line after a final heading (not saved either).

- ✅ 1.1.4: Arial, Times New Roman and Courier New on Android drawn in their same-width stand-ins (Android's own
  aliases had other widths and hid the offer). 1.1.3 checked on the tablet and the desktop app.

- ✅ 1.1.5: justified lines in the Linux app at 1x allow for WebKitGTK's whole-pixel glyph widths.

- ✅ 1.2.0: real documents 6 to 13 compared with Word, all with Word's page count: tables of contents built on
  opening and split across pages, space before dropped at a page's top, no page drift (bordered paragraphs, rounded
  heights), exact and "at least" rows as Word's, repeated header rows, footer pictures and tabs, list bullets kept
  with their text.

## In progress

- 🔄 1.0 release candidate: scope and criteria in `docs/V1_SCOPE.md` (draft). Open: a 20-document real-world set
  compared with Word (13 so far; open differences in `V1_SCOPE.md`), the core desktop and Android checks (tablet checks run on
  the OnePlus Pad 2026-11-20: all pass after the v0.12.1 fixes; phone checked on the Pixel and the Linux desktop app 2026-11-20; Windows still to do). Released as
  1.0.1 (2026-11-20, the version chosen for 1.0); the criteria in `V1_SCOPE.md` left open are tracked for 1.0.x.
- 🔄 Word comparison follow-ups (`next-todo.md`, "Word comparison"): what is left is screen-only drawing in the
  captures and the items under Later.

## Next

- ⬜ The 1.0 criteria left open (In progress above): more real-world documents compared with Word, the Windows check.
- ✅ 1.2.1: tables break across pages as Word's (widow control in cells, no lone header row), hairline borders as
  tall as Word's (1/8 pt borders, Word's exact cell margins), no drift from rounded TOC rows or whole-pixel text
  boxes, right tabs in footers kept on the line.
- ⬜ Differences left from real documents 6 to 13 (`next-todo.md`): the space before on a page a section break
  starts, autofit tables without cell widths, a page of the report ending 1 px lower than Word's.
- ⬜ Differences left from real documents 4 and 5 (`next-todo.md`, Word comparison 2026-11-26): wider spaces in
  Korean-marked runs; Word's exact justified-line limit (it varies with the text: about one space on lines of one
  repeated letter, up to four on ordinary text; the app uses two).

## Later

- ⏸ A paragraph split between unequal columns, as Word does.
- ⏸ Word UI wave 3 (U30–U38): Draw eraser and lasso, custom watermark, equation modes, mode switch, ruler table
  markers, Thesaurus as a pane, Sharpen/Soften, rare shortcuts (mini toolbar extras and Format Picture pane done).
- ⏸ Android phase 3; iOS not planned yet.
- ⏸ Waiting for a person with the devices: A9 (Pixel and OnePlus Pad check) and the desktop checks in
  `verify-list.md`.

## Known limits

- Aptos (Office's default font) is not installed on Linux: a metric stand-in is used, so theme-font text can wrap
  a little differently from Word.
- The desktop build paints nothing on a headless display; desktop-only checks go to `verify-list.md`.
- Saving .odt and .rtf needs the desktop app (pandoc); .doc is not opened.
