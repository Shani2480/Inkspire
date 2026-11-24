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

## In progress

- 🔄 1.0 release candidate: scope and criteria in `docs/V1_SCOPE.md` (draft). Open: a 20-document real-world set
  compared with Word (3 so far; their three bugs fixed), the core desktop and Android checks (tablet checks run on
  the OnePlus Pad 2026-11-20: all pass after the v0.12.1 fixes; phone checked on the Pixel and the Linux desktop app 2026-11-20; Windows still to do). Released as
  1.0.1 (2026-11-20, the version chosen for 1.0); the criteria in `V1_SCOPE.md` left open are tracked for 1.0.x.
- 🔄 Word comparison follow-ups (`next-todo.md`, "Word comparison"): what is left is screen-only drawing in the
  captures and the items under Later.

## Next

- ⬜ The 1.0 criteria left open (In progress above): more real-world documents compared with Word, the Windows check.

## Later

- ⏸ Pictures drawn inside their line of text (in-line picture nodes; the save already keeps the paragraph whole).
- ⏸ A paragraph split between unequal columns, as Word does.
- ⏸ Word UI wave 3 (U30–U38): Draw eraser and lasso, custom watermark, equation modes, mode switch, ruler table
  markers, mini toolbar extras, Format Picture pane, rare shortcuts.
- ⏸ Android phase 3; iOS not planned yet.
- ⏸ Waiting for a person with the devices: A9 (Pixel and OnePlus Pad check) and the desktop checks in
  `verify-list.md`.

## Known limits

- Aptos (Office's default font) is not installed on Linux: a metric stand-in is used, so theme-font text can wrap
  a little differently from Word.
- The desktop build paints nothing on a headless display; desktop-only checks go to `verify-list.md`.
- Saving .odt and .rtf needs the desktop app (pandoc); .doc is not opened.
