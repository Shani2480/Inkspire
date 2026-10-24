# Verify list

Things that were built and unit-tested but **not yet looked at in the real environment**. Each line names
the environment it needs. Tick a line (change `- [ ]` to `- [x]`, add the date) once it has been checked,
or move it to the matching section of `next-todo.md` as a bug if it fails. Nothing here needs new code
until a check fails. Collected on 2026-10-24 from the "not checked / not verified" notes in `next-todo.md`.

## Needs Microsoft Word (open the saved .docx in Word)

- [ ] **Native shapes (20.9 / 22.11 / "Native Word shapes")** — partly checked 2026-10-24 with Document1.docx: Lightning
      and Explosion: 8 Points round-trip (fixed, see next-todo); the other presets still unchecked. — a shape drawn in the app saves as `wps:wsp`
      (preset geometry, fill, outline, size, rotation, flips, wrap, place, `a:prstDash` dashes, two-stop
      `a:gradFill` gradients, `a:effectLst` shadow / glow / soft edges / reflection, and the 2026-10 preset
      batch: arrows, moon, cloud, donut, lightning bolt, can, smiley, sun, flowchart shapes, wave, plaque,
      block arc, no symbol). Open in Word: each preset is the right shape, right colour, right size and place.
      The drawing has no `mc:AlternateContent` VML fallback, so also confirm current Word does not complain.
- [ ] **Charts as real Word charts (20.8 #8)** — save a chart, open in Word, edit it there, save, reopen in
      the app: the chart matches in light and dark. Includes error bars, drop lines, high-low lines, up/down
      bars (`c:errBars` / `c:dropLines` / `c:hiLowLines` / `c:upDownBars`), which were not checked in Word.
- [ ] **SmartArt (22.1)** — SmartArt made in the app saves as its picture with the graphic inside; after save
      and reopen, the new levels, direction and style come back.
- [ ] **Paragraph dialog flags (22.8)** — Suppress line numbers, Don't hyphenate, Textbox Tight wrap, Keep
      lines together, Page break before, Collapsed by default: each round-trips to .docx
      (`w:suppressLineNumbers`, `w:suppressAutoHyphens`, `w:textboxTightWrap`) and Word shows the same.

## Needs Chrome (the web build in a browser)

- [ ] **Chart error bars / drop lines / high-low lines / up-down bars (20.8)** — drawn, offered in Add Chart
      Element and the Chart Elements pane.
- [ ] **Chart axis labels never collide (21.25)** — long category names thin out and truncate; a scatter
      chart's X axis too. Pure SVG, covered by `chart-spec.test.ts` only.
- [ ] **Selection context menu removed (21.31)** — no copy/paste popup on select; the editor's own
      right-click text menu still works.
- [ ] **Embedded chart data sheet (21.32)** — checked in light docked right only. Still to check: dark mode,
      docked left / below / above.
- [ ] **Permanent crop / Compress Pictures (21.47)** — the canvas cut happens and the file actually gets
      smaller (jsdom has no canvas).
- [ ] **Paragraph dialog (22.8)** — Keep with next; page-break-before and keep-lines wiring in `layoutPages`
      (jsdom cannot measure).
- [ ] **Shape Format tab (22.11)** — Insert Shapes rows, Edit Shape menu, Draw Text Box, Text group (Create
      Link greyed with nothing selected), Alt Text, Size launcher: each present and enabled / disabled as in
      Word; WordArt row greys out when the shape has no text; every gallery shape has its yellow adjustment
      handles (Division sign shows three).
- [ ] **Layout Options pane (22.12)** — Tab order inside the pane; general look against screenshot 081612.
- [ ] **Chart side panels (22.14)** — Chart Elements (+), Chart Styles (brush), Chart Filters (funnel): every
      item and the Apply button behave as in Word.
- [ ] **Align menu for objects (22.17)** — Align Right, Center and Bottom with two or more picked objects
      (jsdom has no sizes; only Left and Top are unit-tested).
- [ ] **Comments (22.18)** — card layout against Word's (screenshot 082922).
- [ ] **Breaks menu (22.20)** and **Columns menu (22.21)** — layout against screenshots 082750 / 082741.
- [ ] **Dialog chrome (22.22)** — spin-field widths, tab strip height and preview box sizes of the Columns,
      Paragraph, Borders and Shading and Options dialogs against the screenshots.
- [ ] **Native shapes (see Word section)** — also not looked at in Chrome after the preset batch.

## Needs the desktop app (Tauri build)

- [ ] **Rotated shape from Word (2026-10-24)** — a Lightning turned 185° in Word and reopened was reported cut off;
      fully visible in Chrome after the shape fixes, so check the desktop webview.

- [ ] **Ribbon tab animations (18.7)** — no flicker in the desktop webview.
- [ ] **Open Containing Folder (21.34)** — the file manager actually opens (`ShowItems`); macOS and Windows
      branches untested.
- [ ] **First-run setup wizard (21.42)** — `system_defaults` returns the real author and locale live.

## Known gaps noted alongside (not checks, listed so they are not mistaken for ones)

- Native shapes: the reader does not yet read a dash or gradient back (file keeps it until the shape is
  edited in the app).
- Error bars are one setting for all series, Y direction only; no More Options panes.
- Chart data sheet is held at the top of the window, over the ribbon, when the chart scrolls under it.
