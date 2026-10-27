# Verify list

Things that were built and unit-tested but **not yet looked at in the real environment**. Each line names
the environment it needs. Tick a line (change `- [ ]` to `- [x]`, add the date) once it has been checked,
or move it to the matching section of `next-todo.md` as a bug if it fails. Nothing here needs new code
until a check fails. Collected on 2026-10-24 from the "not checked / not verified" notes in `next-todo.md`.

## Needs Microsoft Word (open the saved .docx in Word)

- [ ] **Tables text wraps around (22.10, 2026-10-27)** — a table set to Around, one at Right / Top of the margin and
      one dragged into a paragraph open in Word at the same places with the text wrapped the same way; a Word document
      with floating tables opens in the app with them in place.
- [ ] **Table Properties (22.10, 2026-10-26)** — a table given an indent, cell spacing, default and cell margins,
      Exactly row height, no break across pages, No wrap and a percent width opens in Word with the same values in
      its Table Properties; a Word table with these set opens in the app's dialog with them.
- [ ] **Surface charts (22.6, 2026-10-26)** — each of the four variants saved from the app opens in Word as that
      surface type with the same bands; a Word surface or contour chart opens in the app as the same variant.
- [ ] **Treemap and Sunburst (22.6, 2026-10-26)** — saved from the app, they open in Word as a column chart and a
      doughnut of the leaves.
- [ ] **Box & Whisker (22.6, 2026-10-26)** — a Box & Whisker chart saved from the app opens in Word as a clustered
      column chart of the medians (Word cannot be given the box itself without `chartex`).
- [ ] **Stock charts (22.6, 2026-10-26)** — a High-Low-Close and an Open-High-Low-Close chart saved from the app open
      in Word as stock charts (Change Chart Type shows Stock) with the same lines, ticks and up/down bars; a Word
      stock chart opens in the app as Stock.
- [ ] **Tall header pushes the body (2026-10-26)** — a Word document whose header is taller than the top margin starts
      its body text at the same place in the app as in Word, and has the same number of pages.
- [ ] **Page border Options check boxes (22.4, 2026-10-26)** — Surround header off, Always display in front off and
      Align on, set in the app, open in Word's Options window the same; a border measured from text reaches round
      the header in both.
- [ ] **Page border on some sides (22.4, 2026-10-26)** — a page border set in the app to top and bottom only opens in
      Word the same (Page Border preview shows two sides); a Word page border on some sides opens so in the app.
- [ ] **Edited Word cell shading (22.4, 2026-10-26)** — in a Word table with a patterned cell, a new fill set in the
      app saves with Word's pattern kept, and No Color + Clear saves an unshaded cell, as Word shows them.
- [ ] **Table Grid border (22.4, 2026-10-26)** — a table set to Grid at 3 pt in the app opens in Word with the thick
      outside and ½ pt inside lines.
- [ ] **Paragraph 3-D border (22.4, 2026-10-26)** — a paragraph set to 3-D in the app opens in Word with Borders and
      Shading showing 3-D; a Word paragraph set to 3-D keeps it after an edit and save in the app.
- [ ] **Cell shading patterns (22.4, 2026-10-26)** — cells given yellow + red Dk Up Diagonal, 25% and Lt Grid in the
      app open in Word with the same shading (Shading tab shows the pattern); a Word table with patterned cells looks
      the same in the app.
- [ ] **Page borders in Word (22.4, 2026-10-26)** — a dashed red page border set in the app to All except first
      page, 24 pt from the edge of the page, opens in Word the same (Page Border tab shows it); one measured from
      Text sits as far from the text as in the app; a Word page border (and an Art one) is shown or kept after a
      save from the app.
- [ ] **Borders and shading on text (22.4, 2026-10-26)** — a word boxed with Shadow and a yellow fill in the app opens
      in Word the same (Borders and Shading shows Apply to: Text); a Word run with a box and shading looks the same in
      the app and keeps its line after an edit elsewhere in the paragraph.
- [ ] **Paragraph shading patterns (22.4, 2026-10-26)** — a paragraph with yellow fill and red Dk Up Diagonal, one
      with 25% and one with Lt Grid open in Word with the same pattern (Shading tab shows it); a Word paragraph with a
      pattern looks the same in the app (percentages are a flat tint here).
- [ ] **Paragraph border distance from text (22.4, 2026-10-26)** — a paragraph set in Options… to 6 / 12 pt opens in
      Word with the same gap (Options shows it); a Word paragraph's box sits as far from its text in the app as in
      Word.
- [ ] **Paragraph border pen and Shadow in Word (22.4, 2026-10-26)** — a paragraph given Shadow, Dotted, 1.5 pt,
      red in the app opens in Word with the same box (Borders and Shading shows Shadow); a Word paragraph with a
      shadowed border keeps it after a save from the app.
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

- [ ] **No pill over a table's last row (2026-10-27)** — in the desktop app, hover over the last row of a table as
      wide as the text, and of one widened past the margin: no scrollbar shows.
- [x] **Tables text wraps around, Table Positioning, dragging a table (22.10, 2026-10-27)** — checked 2026-10-27 in
      headless Chrome.
- [ ] **Same, in the desktop app** — drag a table by its move handle at 150% zoom; a floating table near the foot of
      a page, and on page 2.
- [x] **Right-click keeps a selected table, column or row (2026-10-27)** — checked 2026-10-27 in headless Chrome.
- [x] **Table Properties dialog and right-click (22.10, 2026-10-26)** — checked 2026-10-26 in headless Chrome.
- [ ] **Table Properties, in the desktop app** — right-click a selected table: one menu, Table Properties... opens
      with the selection kept.
- [x] **Stock charts and Insert Chart previews (22.6, 2026-10-26)** — checked 2026-10-26 in headless Chrome.
- [x] **Box & Whisker chart (22.6, 2026-10-26)** — checked 2026-10-26 in headless Chrome.
- [x] **Treemap and Sunburst charts (22.6, 2026-10-26)** — checked 2026-10-26 in headless Chrome.
- [x] **Surface chart previews (22.6, 2026-10-26)** — checked 2026-10-26 in headless Chrome.
- [x] **Table column auto-fit, steady cell marks, live row resize (22.10, 2026-10-26)** — checked 2026-10-26 in headless Chrome.
- [ ] **Header and footer tables (2026-10-26)** — in the desktop app, insert a table in the header and in the footer, type in its cells, drag its row and column borders, close and reopen.
- [ ] **Same, in the desktop app** — double-click a column border, click in and out of a table with long cell text, drag a row border at 150% zoom; select the whole table and double-click a column border and a row border.
- [ ] **Treemap / Sunburst data sheet (22.6, 2026-10-26)** — Edit Data shows Branch, Stem, Leaf and Size columns; retyping a stem regroups the tiles.
- [x] **Header & Footer Previous / Next (2026-10-26)** — checked 2026-10-26 in headless Chrome.
- [x] **Tall header or footer pushes the body (2026-10-26)** — checked 2026-10-26 in headless Chrome.
- [x] **Page border Options check boxes (22.4, 2026-10-26)** — checked 2026-10-26 in headless Chrome.
- [x] **View Gridlines under drawn borders (2026-10-26)** — checked 2026-10-26 in headless Chrome (light).
- [x] **Page Border sides from the preview (22.4, 2026-10-26)** — checked 2026-10-26 in headless Chrome.
- [x] **Word cell shading in Borders and Shading (22.4, 2026-10-26)** — checked 2026-10-26 in headless Chrome.
- [x] **Grid setting in Borders and Shading (22.4, 2026-10-26)** — checked 2026-10-26 in headless Chrome.
- [x] **3-D setting in Borders and Shading (22.4, 2026-10-26)** — checked 2026-10-26 in headless Chrome.
- [x] **Cell shading patterns (22.4, 2026-10-26)** — checked 2026-10-26 in headless Chrome (light).
- [x] **Right-click in a table keeps to the cell (2026-10-26)** — checked 2026-10-26 in headless Chrome.
- [x] **Page Border Apply to and Options (22.4, 2026-10-26)** — checked 2026-10-26 in headless Chrome (light).
- [x] **Apply to Text in Borders and Shading (22.4, 2026-10-26)** — checked 2026-10-26 in headless Chrome.
- [x] **Shading Patterns in Borders and Shading (22.4, 2026-10-26)** — checked 2026-10-26 in headless Chrome.
- [x] **Paragraph box gap and Border and Shading Options (22.4, 2026-10-26)** — checked 2026-10-26 in headless
      Chrome, light and dark.
- [x] **Paragraph Shadow border from Borders and Shading (22.4, 2026-10-26)** — checked 2026-10-26 in headless
      Chrome, light and dark.
- [ ] **Chart side buttons level with the chart's top (2026-10-26)** — select a chart: Chart Elements, Chart Styles
      and Chart Filters sit beside its top right edge, styled as before, each opening its panel.
- [x] **3D Model Views gallery (22.15, 2026-10-26)** — checked 2026-10-26 in Chrome with a cube and a cone: named
      tiles drawn from each side, Top applied, paging and the full menu.
- [x] **Comment anchor line and red active range (22.18, 2026-10-26)** — checked 2026-10-26 in Chrome, light and
      dark, wide and 1000 px windows.
- [x] **Online 3D model inserts the model picked (2026-10-26)** — checked 2026-10-26 in Chrome (Arm Chair 01 loads live with its texture) — Insert > 3D Models > Online, pick a model: the
      footer counts the download, the library closes, the model (not a cube) appears and turns.
- [x] **3-D model whose file has nothing to draw keeps Word's picture (2026-10-24)** — checked 2026-10-24 in Chrome
      with f24 (stub `.glb`) and `123.docx` (live model).
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

- [ ] **Built-in engine on a discrete GPU (21.26, 2026-10-26)** — on a computer with an NVIDIA card or a Radeon with
      4 GB or more, AI Settings says the engine uses the graphics card, and a Hebrew translation is real text that
      ends (not "????"). On integrated graphics it says "Uses your processor".
- [ ] **Built-in engine context (21.26, 2026-10-26)** — with the built-in engine downloaded, rewrite a long section
      (about 20,000 characters): it answers instead of failing; `engine.log` shows `n_ctx = 16384`.
- [ ] **AI reply in Hebrew or with accents (21.26, 2026-10-26)** — ask any provider to rewrite a paragraph in Hebrew
      (or French): the inserted text has no "�" in it.
- [ ] **3D Model Views tiles in the desktop webview (22.15, 2026-10-26)** — the tiles are drawn with WebGL; check
      they appear (and fall back to the tilted picture without WebGL).
- [ ] **Online 3D models and icons in the desktop webview (2026-10-26)** — Insert > 3D Models > Online lists
      Poly Haven with thumbnails and inserts the model picked; Insert > Icons lists Iconify. Both hosts were missing
      from the desktop CSP before.
- [ ] **3-D model from Word loads in the desktop webview (2026-10-24)** — open `123.docx` in the desktop app: the
      creature loads live and turns with the orbit handle (CSP `connect-src` now allows `blob:`; before, only Word's
      picture showed and a turn blanked it). Also open `f24_paragraph_exceptions.docx` (stub `.glb`): Word's picture
      stays after a turn.

- [ ] **Rotated shape from Word (2026-10-24)** — a Lightning turned 185° in Word and reopened was reported cut off;
      fully visible in Chrome after the shape fixes, so check the desktop webview.

- [ ] **Ribbon tab animations (18.7)** — no flicker in the desktop webview.
- [ ] **Launch and ribbon in the desktop app (2026-10-27)** — launch: the splash shows with its picture (never an
      empty card), then the start screen at once with no ghosting or stale frames. Blank document: File closes at
      once. File again: it is opaque from the first frame and its pane slides in. Click through the ribbon tabs: each
      switches at once with no blink at the end of the slide. Since: no blank ribbon frame and no late jump on a
      switch, the underline moves with the tab. Menus, tooltips, dialogs and File slide or fade in visibly and never
      jump after settling (checked in WebKitGTK on a software display; confirm with the GPU).
      Every tab slides in, not only Home; the scroll arrows follow the tab in front on a narrow window.
- [ ] **Open Containing Folder (21.34)** — the file manager actually opens (`ShowItems`); macOS and Windows
      branches untested.
- [ ] **First-run setup wizard (21.42)** — `system_defaults` returns the real author and locale live.

- [ ] **Narrow / Wide cell margins in Word (2026-10-27)** — set Wide on a table, save, open in Word: Table
      Properties → Options shows 0.26 cm top/bottom and 0.37 cm left/right; reopened in the app, Cell Margins is Wide.

- [ ] **Word's gradients on shapes (2026-10-27)** — a shape Word filled with a multi-stop or theme gradient
      (Shape Styles' lower rows, or Format Shape → Gradient) opens with the same colours and direction; change its
      outline in the app, save, and Word still shows the same gradient.

- [ ] **Tables across pages (2026-10-27)** — a long table breaks between rows at the page end, no row cut by the
      page edge; with Repeat as header row its first row shows again on the next page; typing in a row near the end
      of a page moves rows over. A long floating table breaks the same way, at its place across. Two floating
      tables, the second with Allow overlap off, do not cover each other. Checked in Chrome; check the desktop app
      and against Word with a .docx.

- [ ] **Formatting keys (2026-10-27)** — in the desktop app: Ctrl+Shift+D / K / H, Ctrl+T / Ctrl+Shift+T, Ctrl+Q,
      and Ctrl+Shift+C then Ctrl+Shift+V on another selection. Checked in Chrome by pressing them.

- [ ] **Line numbering options (2026-10-27)** — Start at 5, Count by 5, From text 1 cm in Word, open in the app:
      numbers 5, 10… at the same distance; change them in the app, save, and Word's Line Numbers dialog shows the same.

## Draw Table and Eraser (2026-10-27)

- Desktop app: Table Layout → Draw Table shows the pencil cursor (WebKitGTK may fall back to the crosshair).
  Drag a box below a paragraph and a table that size appears, set in as far as the box started. Drag a line down
  and across a cell and the cell splits. Escape puts the pencil down.
- Eraser: clicking the line between two cells merges them, and one Ctrl+Z splits them again.
- Save a document with a drawn and split table, open it in Word: the column widths, the row height, the indent and
  the merged cells are as drawn.
- A table from Word with an indent (Table Properties → Indent from left) now shows set in. Check one in Chrome
  and in the desktop app.

## Equations in Word (2026-10-27)

- Save a document with an inline equation (A=πr²), a display one (the Quadratic Formula), a matrix, cases, a sum
  with limits and an integral. Open it in Word: each should be a real Word equation that Word can edit, drawn as
  in the app, with inline equations in the line and display ones centred.
- Open a Word document with equations, change none of them, and save: Word shows them unchanged. Change one and
  save: Word shows the change.
- Desktop app: equations draw (KaTeX fonts load in WebKitGTK), and Change to Display / Inline works.

## Crop to Shape, Aspect Ratio, Fill and Fit (2026-10-27)

- Save pictures cropped to a heart, a star and an oval, one cropped 16:9, and one set to Fit. Open the file in Word:
  - Each shows the same shape and crop.
  - Fit shows empty room beside the picture.
  - A picture border follows the shape.
- Open a Word document with a picture already cropped to a shape. It shows that shape here and is saved unchanged.
- Desktop app: the shape mask and the border along it draw in WebKitGTK.

## Edit Points and Convert to Freeform (2026-10-27)

- Edit the points of a triangle, a rounded rectangle and a heart (move, add and delete points), and convert a star
  to a freeform. Save and open the file in Word: each shape is the same outline, and Word's Edit Points shows the
  same points.
- Open a Word document with a freeform drawn in Word (Insert → Shapes → Freeform). It shows the same outline here,
  and Edit Points shows its points.
- Edit Points on a rotated and a flipped shape: the handles sit on the shape and drag the right way.
- Desktop app: the handles show, drag, and Ctrl+click adds and deletes in WebKitGTK.

## Quick Access Toolbar with ribbon commands (2026-10-27)

- Desktop app: right-click a ribbon button → Add to Quick Access Toolbar, then use it from the title bar: a plain
  command (Page Break), one with a menu (Table, Columns) and one from a tool tab (Crop with a picture selected).
- Move the toolbar below the ribbon and turn on command labels; check light and dark mode and the Simplified ribbon.
- Dark mode: icons added in light mode keep their accent colours; check they still read on the dark title bar.

## 3-D charts, Pie of Pie and Bar of Pie (2026-10-27)

- Save one of each new chart and open the file in Word: each is the same kind (Change Chart Type shows it), with
  the same data. Pie of Pie and Bar of Pie put the same last points in the second plot.
- Compare each with Word's own chart of the same data, side by side.
- Open Word's 3-D charts and an of-pie chart split by value: what each opens as here.
- Desktop app: the 3-D drawing in WebKitGTK.
- Chart templates in the desktop app: save one, restart the app, and it is still under Templates.
- Save Volume-High-Low-Close and Volume-Open-High-Low-Close and open them in Word: the same variants, the volume on
  the left axis and the prices on the right. Open Word's own Volume stock chart here.
- The Chart button's own menu on Insert draws its six thumbnails cramped (seen while checking; not changed here).

## Known gaps noted alongside (not checks, listed so they are not mistaken for ones)

- Native shapes: a gradient's transparency per stop, path gradients other than a circle (shown as radial) and
  Word's custom dashes (shown as a plain dash) are approximated.
- Error bars are one setting for all series, Y direction only; no More Options panes.
- Chart data sheet is held at the top of the window, over the ribbon, when the chart scrolls under it.
