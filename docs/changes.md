# Changes log

One entry per fix or feature, newest first, written the same session the work lands. Each entry says what was
wrong or missing, what changed, where (files, tests), how it was checked, and what is still open. The longer
story of each feature stays in `next-todo.md` under its section; `verify-list.md` holds what still needs a check
in Word, Chrome or the desktop app.

## 2026-10-26

### Tables: double-click a column border to fit it, text no longer moves on entering a table, live row resizing

- **Missing:** double-clicking a column's right border did nothing; in Word it fits the column to its contents.
  **Changed:** `contentColumnWidth` measures each cell of the column at its unwrapped width (`max-content`, in place
  so the page's fonts count) plus padding and borders; `autoFitColumn` gives the column that width, growing into the
  room the page leaves, then taking from the column to its right down to what that one's contents need, never past
  the page; it is one undo step (`table-tools.ts`, `dblclick` in the border plugin).
- **Bug:** clicking into or out of a table moved its text. The end-of-cell marks (¤) shown while the caret is in the
  table were in the line, so a line that just fit its cell wrapped, and the line grew a pixel. **Changed:** the marks
  are placed out of the flow where they would have been (`position: absolute`, `index.css`), so they take no room.
- **Bug:** dragging a row's border showed the new height only when the mouse was let go: the height set on the row
  was put back by ProseMirror (the row is inside the table's content). **Changed:** while dragging, the height goes in
  a style sheet aimed at that row through a mark on the table element (`paintRow`), and the drag is measured in the
  page's own pixels, so the row follows the mouse at any zoom.
- **Checked** in headless Chrome: 36 cells of mixed length keep their heights on entering and leaving the table; a
  long middle column grew from 208 to 281 px taking the right column down to its text (135 px), a short first column
  shrank to 93 px, Ctrl+Z undid it; a row was 80 px mid-drag (from 40) and stayed 80 px. No unit tests: jsdom has no
  layout to measure.
- **Open:** fitting does not shrink other columns than the right neighbour; columns with merged cells across them
  are measured from their single cells only; Word's table-wide double-click on the left edge is not done.

### Surface charts: 3-D Surface, Wireframe 3-D Surface, Contour, Wireframe Contour (22.6)

- **Missing:** Insert Chart had no Surface, and a Word surface chart opened as an area chart.
- **Changed:** a Surface family (`chart-spec.ts`, new `contour` flag; `filled` off is the wireframe). Coloured by
  value band, one per step of the value axis, listed in the legend as Word does ("0-1", "1-2" …; `surfaceBands`).
  3-D Surface: an oblique view with floor, back and side walls and band gridlines, the grid interpolated and filled
  back to front, or a band-coloured wire mesh. Contour: seen from above, filled by band, or the band edges as lines
  (marching squares). Saved as Word's own `c:surface3DChart` / `c:surfaceChart` with `c:wireframe`, a series axis
  (`c:serAx`) and Word's `c:view3D` (rotX 15 / rotY 20, or straight down for a contour), and read back as the same
  variant, so these round-trip natively. Tests in `chart-expand.test.ts` (bands, drawing, the four variants written
  and read back); the parts test now expects a surface to have no series parts or data labels, as in Word. Checked
  in headless Chrome: the four previews in Insert Chart.
- **Open:** the filled contour's band edges are stepped (sampled, not traced) and the 3-D view's ordering is
  approximate where the surface folds; no rotation (3-D Rotation); band colours past the palette are its shades.

### Treemap and Sunburst charts (22.6)

- **Missing:** Insert Chart had no Treemap or Sunburst, and a chart's data had one column of labels only.
- **Changed:** a chart can carry label columns before its category (`levels` on the spec and the sheet), outermost
  first, as Word's Branch / Stem / Leaf sheet; a blank label skips that level, so a leaf can sit straight under its
  branch. The data sheet shows and edits those columns for these two types (`gridToSheet(grid, labelColumns)`,
  `chart-sheet-dialog.tsx`). The tree is built in `chartTree` (`chart-expand.ts`): sizes from the first shown series,
  rows with no positive size left out, largest first. Treemap: squarified tiles (`squarify`) in the branch's colour
  with Word's overlapping branch label in the corner and the leaf names in theirs, legend of branches on top.
  Sunburst: one ring per level from a small hole, clockwise from twelve o'clock, labels where they fit. Both list the
  branches as points (Format a branch's fill) and have no axes. Word has neither chart outside `chartex`, so the .docx
  gets the leaves as columns (Treemap) or a doughnut (Sunburst); the app reopens them as themselves while Word has not
  changed the data. Word's sample data for both. Tests: tree with a blank stem, hidden and zero rows, squarified tiles
  in proportion with no slivers, drawing, legend, parts, what Word gets, the sheet's label columns, the .docx round
  trip. Checked in headless Chrome: both inserted with the sample.
- **Open:** no `chartex`; no Treemap "banner" parent-label option, no Sunburst label rotation; a new label column
  cannot be added from the sheet (a Treemap made from another chart type has one level until its data is retyped).

### Box & Whisker charts (22.6)

- **Missing:** Insert Chart had no Box & Whisker.
- **Changed:** a Box & Whisker family with Word's sample (three schools' scores, one row per student, the course in
  the first column). Rows with the same category label form a group, and each series gives a box per group
  (`boxGroups` in `chart-expand.ts`). Quartiles use Word's default exclusive median (`boxStats`). Whiskers reach the
  furthest values within 1.5 × the interquartile range, the values beyond are circles, the median is a line and the
  mean an ×; with data labels on, each statistic is labelled beside its box, as in Word. It is drawn by its own
  painter (`boxWhisker` in `chart-spec.ts`) with the value axis, gridlines, course labels and legend. Word has no such
  chart outside `chartex`, so the .docx gets the medians as a clustered column chart, and the app reopens it as Box &
  Whisker while Word has not changed the data. Tests: quartiles for odd and even counts, outliers, grouping, drawing,
  the medians given to Word, the .docx round trip (`chart-expand.test.ts`, `chart-docx.test.ts`). Checked in headless
  Chrome: the Insert Chart preview and the inserted chart with the sample.
- **Open:** no inclusive-median option, no inner points, no `chartex` (Word shows the medians as columns). A React
  "error during concurrent rendering … recovered" is logged on every page load, before and after this change; its
  cause is not yet looked at.

### Histogram, Waterfall and Funnel come back as themselves from a saved .docx (22.6)

- **Bug:** these charts are written to Word's chart part as the chart they are drawn as (bins, running totals,
  centred bars). On reopening, the app's own copy of the chart was used only when its data equalled the chart part's,
  which it never does for these, so they came back as a plain column or bar chart and lost their own data.
- **Changed:** the app's copy is also compared after the same expansion (`chartPictureHtml` in `inlines.ts`), so the
  chart reopens as Histogram, Waterfall or Funnel with the data as typed while Word has not changed it; when Word
  edited the data, Word's chart wins as before. Test in `chart-docx.test.ts` (Histogram, Waterfall, Funnel, Stock),
  failing without the change.

### Stock charts (22.6), and Insert Chart previews each type's own sample

- **Missing:** Insert Chart had no Stock type, and a Word stock chart opened as a plain line chart. The dialog also
  previewed every type with the column sample (a funnel of "Series 1–3").
- **Changed:** a Stock family with High-Low-Close and Open-High-Low-Close, starting from Word's sample prices
  (`chart-spec.ts`). The prices are kept as typed and drawn (`chart-expand.ts`) as Word does: no price lines, a
  solid dark high-low line at each date, with Open the up/down bars (white when the price rose, dark when it fell),
  without Open Close as a tick (new `tick` on a series). The legend shows no line sample for those series, only
  Close's tick. Saved as Word's `c:stockChart` (high-low lines, up/down bars, Close's `dash` marker) and read back as
  Stock, so it round-trips. Insert Chart now previews the chart Insert makes, with that type's own sample data.
  Tests: `chart-expand.test.ts` (variants and samples, drawing, `c:stockChart` written and read back to the same
  variant). Checked in headless Chrome: both variants in the dialog and inserted; Funnel, Waterfall and Histogram
  previews show their own data.

### Built-in engine run live: CPU build on integrated graphics, and a cap on reply length (21.26)

- **Found in the first live run** (Linux x86-64, AMD Radeon 680M, RADV, Mesa 26.2): the app's own download resumed a
  half-finished model and verified it, and the Vulkan engine started in 2 s and rewrote English correctly. But a
  Hebrew translation came back as "????…" and never ended: there was no limit on the reply, so it ran for minutes
  until the context was full. The same request on the CPU path ended properly, and the GPU path was no faster
  (12.3 against 11.2 tokens/s) because integrated graphics share the computer's memory. A newer llama.cpp (b11671)
  on the same GPU was worse.
- **Changed:** the Vulkan build is chosen only for a discrete GPU: NVIDIA, or a card reporting at least 4 GB of its
  own memory (`is_discrete_gpu` in `local_ai.rs`, read from `/sys/class/drm/renderD*/device`; an APU reports only
  its carve-out, 512 MB here). Every request to the built-in engine and to compatible endpoints asks for at most
  4,096 tokens (`max_tokens`), and Ollama for the same (`num_predict`); OpenAI is left alone, as its newer models
  reject `max_tokens`. AI Settings no longer says "No Vulkan graphics card was found" on the CPU build. `install` is
  split so its body (`install_into`) runs from a folder, and an ignored live test (`live_builtin_engine` in `ai.rs`)
  downloads, verifies, starts and streams through the app's own code.
- **Live results after the change (CPU build):** the engine archive (16 MB) installed in 2 s and started in 2 s;
  Qwen2.5 3B: formal rewrite in 4.0 s, a translation in 3.4 s, both ending by themselves; Qwen2.5 7B: started in
  6.7 s, rewrite in 7.2 s, Hebrew translation in 4.2 s (mostly Hebrew; the 3B model mixes other scripts in, which is
  the model's limit, not the app's). Tests: integrated graphics use the CPU build (Radeon APU, Intel), a discrete
  Radeon and NVIDIA use Vulkan; the request body carries the cap.

### Built-in engine: a context size per model, and a plain message when the text is too long (21.26)

- **Missing:** every built-in model ran with an 8,192-token window, while the app sends up to 24,000 characters of
  context. In Hebrew and other scripts that take more tokens per character, or with a long reply, the request
  overflowed and llama-server's raw "exceeds the available context size" was shown.
- **Changed:** each model in `local_ai.rs` has its own `context` (16,384 tokens for the three Qwen2.5 models, which
  take 32K; the cache stays under about a gigabyte even for 7B), passed to `llama-server -c`. A request over any
  provider's window (llama.cpp, OpenAI-style "maximum context length", Anthropic and Ollama "prompt is too long") now
  reads "The text is too long for this model. Select a shorter part of the document, or choose a model with a larger
  context in AI Settings." (`provider_message` in `ai.rs`). Tests: server arguments carry the model's context; the
  three error shapes map to the message and others pass through.

### AI replies no longer garble a character split between network chunks (21.26)

- **Bug:** the streamed reply was decoded chunk by chunk (`String::from_utf8_lossy` on each network chunk in
  `ai.rs`). When a chunk ended in the middle of a multi-byte character (é, Hebrew, an emoji), both halves became
  "�" in the inserted text. Every provider (OpenAI, Anthropic, Ollama, custom endpoints and the built-in engine) went
  through this path.
- **Changed:** `StreamParser` keeps bytes and decodes only whole lines (a line ends at `\n`, which is never inside a
  longer character). Tests: a reply with "Café שלום 😀" cut inside every character, and one byte at a time, for the
  OpenAI, Anthropic and Ollama formats; Ollama and Anthropic streams (pings, `\r\n`, events) across chunks; an
  error in the middle of a stream.

### Header & Footer tab: Previous, Next and Link to Previous

- **Missing:** the tab's Navigation group had only Go to Header and Go to Footer. Word also has Previous, Next and
  Link to Previous.
- **Changed:** Previous and Next step between the header stories in page order (first page, even pages, odd pages;
  `chromeStory` and `chromeStep` in `chrome-editing.ts`), and go to the page where that story first shows; with one
  story both are greyed, as in Word with one section. Link to Previous is listed and greyed with a note: the app has
  one section. Both ribbon layouts; new Previous/Next glyphs (`context-icons.tsx`). The page count is the body
  editor's (while the header is open the tab's editor is the header's). Tests: `chrome-editing.test.ts`. Checked in
  headless Chrome: with Different First Page and Odd & Even on, Next goes page 1 → 2 → 3 and is greyed there,
  Previous comes back.

### A tall header or footer pushes the body away from the page edge (header and footer leftovers)

- **Missing:** the header and footer were a layer of their own over the page. A header taller than the top margin ran
  over the body's text instead of moving it down as Word does (and the same for a footer at the bottom).
- **Changed:** every header and footer box on the pages reports how far it reaches into the page
  (`chrome-editors.tsx`, a `ResizeObserver`; floating pictures are out of the flow and push nothing) to a small store,
  `document/chrome-extent.ts`. `pageMetrics` takes the larger of the margin and that reach, so the body's padding, the
  page gaps, the paginator's page height, the `--page-margin-top/bottom` variables (Header/Footer boundary line,
  rulers) and the column guides all follow it. The paginator lays out again when the reach changes (`pages.ts`; the
  margins are in its signature). The tallest header counts for every page, so a tall first-page header moves the body
  on every page (Word moves it on that page only). Test: `chrome-extent.test.ts`. Checked in headless Chrome: eight
  header lines move the body below them on pages 1 and 2 (three pages become five), emptying the header puts it back;
  eight footer lines push the body up.

### Page Border Options: Align, Always display in front, Surround header and footer (22.4)

- **Missing:** the page border's Options window had only the margins and Measure from. Word's check boxes were not
  shown, read or kept: `w:alignBordersAndEdges`, `w:bordersDoNotSurroundHeader` and `…Footer` in `settings.xml`,
  and `w:zOrder` on `w:pgBorders`. A border measured from the text sat on the margins and did not reach round
  the header and footer as Word's does by default.
- **Changed:** the settings model reads and writes the three settings in schema order (`model.ts`, `wml-read.ts`,
  `wml-write.ts`); the page setup has `borderInFront`, `borderSurroundHeader`, `borderSurroundFooter` and
  `borderAlign` (`page-setup.ts`), mapped both ways in `project.ts` (`w:zOrder="back"` when not in front), and kept
  in the app's own file (fifth `borderplace` field, `header.ts`; older files keep the margins). Measured from the
  text, the border's top and bottom reach to the header and footer unless Surround is off (`pageBorderInset`). The
  Options window (`border-options-dialog.tsx`) has the four check boxes; Align and the two Surround boxes are off
  unless Measure from is Text, as in Word.
- **Not drawn:** Always display in front (the page draws its border under the text either way) and Align paragraph
  borders and table edges; both are kept in the file.
- **Tests:** `page-borders.test.ts` (Word's defaults, settings.xml and `w:zOrder` written and reopened, the inset
  round the header and footer, the app's own file), `borders-shading-dialog.test.tsx` (check boxes, disabled for
  Edge of page). All 802 pass; typecheck, ESLint and Prettier clean.
- **Checked:** headless Chrome: the Options window with the check boxes greyed for Edge of page; measured from Text
  the border reaches up round the header.

### View Gridlines shows only where a cell side has no border

- **Wrong:** the gridline guide was an `outline` on every cell, painted over the borders, so drawn solid lines (a
  new table's, Grid, a Word table's) looked dashed; and a table with no frame turned the guide off altogether, the one
  case where Word shows it.
- **Changed:** the table is its own layer (`isolation: isolate`) and each cell's guide is a dashed `::before` at the
  back of it (`index.css`), so a drawn line covers the guide and it shows only where a side has no border, as in
  Word. A shaded cell also covers it.
- **Tests:** `table-lines.test.ts` (the guide is under the borders; no outline). All 798 pass; ESLint and Prettier
  clean.
- **Checked:** headless Chrome with three new tables: the default one shows its light solid lines, a 3 pt Grid one
  is solid throughout, and one set to None shows the dashed guides.

### Page Border: sides set from the preview (22.4)

- **Missing:** a page border was always drawn on all four sides; Page Border's preview had no edge buttons, and a
  Word page border on some sides only opened as a full box.
- **Changed:** the page setup has `borderSides` (`page-setup.ts`, `pageSides`), kept in the app's own file (fourth
  field of the `borderplace` mark, `header.ts`), read from the sides Word drew and written for the sides set
  (`project.ts`). Each page draws no line on the sides left out (`pageBorderStyle`, `page-canvas.tsx`; also the
  print frame). Page Border's preview has Word's four edge buttons (`design-dialogs.tsx`): a click turns a side off
  or on; from None it draws that side alone; clicking the last side off leaves no border.
- **Tests:** `page-borders.test.ts` (reads Word's two sides, writes only the setup's sides, no line on the others,
  the app's own file), `borders-shading-dialog.test.tsx` (a side off; one side from None). All 797 pass; typecheck,
  ESLint and Prettier clean.
- **Checked:** headless Chrome: Dashed with Left and Right clicked off draws top and bottom only on both pages; the
  preview shows the same.

### A Word cell's fill and pattern: Borders and Shading opens on them, and changes to them show and save (22.4)

- **Wrong / missing:** in a Word document a cell's shading is drawn from Word's own cell style (`wordCell`), which
  the editor merged after the app's attributes, so a new fill on a Word cell did not show (it was saved). Borders and
  Shading opened on no fill and no pattern for such a cell. No Color or a Clear pattern on it fell back to Word's
  shading on save, and setting only the fill or only the pattern lost the other half of Word's `w:shd`.
- **Changed:** Word's cell style is merged first, so what is set in the app is drawn over it (`table-tools.ts`).
  A Word cell carries its shading as `data-word-shading` (fill, pattern, colour; `wordShadingValue` in
  `cell-edits.ts`, written in `project.ts`), only read, never saved; `readScopedBorders` falls back to it. Clearing
  what a Word cell had is kept as `transparent` / `clear` (`shadeScope`), drawn as none. Saving merges what the app
  set with what Word had (`editedShading`), so a fill alone keeps Word's pattern and a cleared cell writes an
  empty `w:shd`. A new pattern on a Word cell with a pattern of its own is drawn inline over it.
- **Tests:** `word-cell-shading.test.ts` (made, saved, opened as a Word document: the dialog reads it; a new fill
  shows and keeps the pattern; clearing both shows and saves none; a new pattern shows and keeps the fill). All 794
  pass; typecheck, ESLint and Prettier clean.
- **Checked:** headless Chrome: opened a .docx with a yellow cell with red stripes; Borders and Shading opened on Dk
  Up Diagonal; a red fill then showed with Word's stripes kept.
- **Open:** clearing the pattern of a Word cell that also has diagonal borders hides its diagonals on screen until
  reopened.

### Borders and Shading > Setting: Grid for a table (22.4, eighth part)

- **Missing:** for a table the Setting column had None, Box, All and Custom; Word's Grid (the chosen line outside,
  thin single lines between the cells) was not there, and a cell could hold only one pen for all its sides.
- **Changed:** a cell has `sidePens`, a pen for some of its sides over its `borderPen` (`table-tools.ts`), drawn per
  side (`--cell-border-top` … in `index.css`) and written per side in `w:tcBorders` (`bordersOf`, `sidePensOf` and
  `sidePensValue` in `cell-edits.ts`). `setBordersOnCells` takes an inside pen; `readScopedBorders` reads it back
  when it differs from the outside one. The dialog lists Grid after All for Apply to: Table, previews the inside
  lines thin, applies the chosen line outside and ½ pt single lines in its colour inside, and opens on Grid when
  Apply to moves to Table. All, the Borders menu and an edge click give a cell one pen again; the Border Painter
  replaces only the side it paints.
- **Tests:** `borders-shading-dialog.test.tsx` (Grid's pens, reopened as Grid, All goes back to one pen),
  `cell-edits.test.ts` (a side's own pen in `w:tcBorders`, drawn reopened); `table-lines.test.ts` updated for the
  per-side rule (the line token still applies). All 790 pass; typecheck, ESLint and Prettier clean.
- **Checked:** headless Chrome: a 3×2 table set to Grid at 3 pt draws 4 px outside and 1 px inside; the preview shows
  the thin inside lines.

### Borders and Shading > Setting: 3-D for a paragraph (22.4, seventh part)

- **Missing:** the Setting column had no 3-D; Word's frame effect on a border (`w:frame`, what 3-D writes) was not
  read or written, so a Word paragraph set to 3-D lost it once edited.
- **Changed:** `Border` has `frame`, read and written after `w:shadow` (`model.ts`, `wml-read.ts`, `wml-write.ts`);
  a paragraph has `borderFrame` (`block-format.ts` on both sides, `home-actions.ts` keys and Clear Formatting). The
  dialog lists 3-D for a paragraph, opens on it and applies it; Box, Shadow or an edge click drops it. The frame
  effect only changes how two-line and 3-D line styles are drawn, none of which the dialog offers, so a 3-D box is
  drawn as the box, as Word draws a single line.
- **Tests:** `paragraph-box.test.ts` (writes `w:frame` on four sides, opens it again, none without it),
  `borders-shading-dialog.test.tsx` (3-D applied, reopened, dropped for Box; not offered in a table), `settingOf`.
  All 788 pass; typecheck, ESLint and Prettier clean.
- **Checked:** headless Chrome: 3-D in the Setting column under Shadow, selected and applied.

### Shading patterns for table cells (22.4, sixth part)

- **Missing:** Shading > Patterns worked for a paragraph or text only; inside a table it was greyed out. A Word
  cell's pattern (`w:shd` val and color) was not drawn, only its fill.
- **Changed:** cells (`ShadedTableCell`, `ShadedTableHeader`) have a `shadingPattern` attribute, drawn through
  `--cell-pattern` so a cell's diagonal lines are laid over it (`table-tools.ts`, `index.css`). `shadeScope` sets the
  fill, the pattern or both on the selected cells or the whole table, leaving what was not changed;
  `readScopedBorders` reads the shared pattern back, so the dialog opens on it. The dialog's pattern controls work for
  Cell and Table. In .docx a cell's fill and pattern are written as one `w:shd` (`shadingOf` in `cell-edits.ts`), and
  a Word cell's pattern is drawn on opening (`cellCss` in `word-styles.ts`; Solid stays the plain colour).
- **Tests:** `cell-edits.test.ts` (writes `w:shd` with the pattern and colour, draws it reopened),
  `border-painter.test.ts` (pattern over the fill, read back, drawn), `borders-shading-dialog.test.tsx` (a cell,
  then the whole table, reopened on it; this replaces the test that patterns were off in a table). All 785 pass;
  typecheck, ESLint and Prettier clean.
- **Checked:** headless Chrome: in a new table, yellow fill with red Dk Up Diagonal on one cell, 25% on the next, and
  Lt Grid with a diagonal border on the third, each on its own cell.
- **Open:** a Word cell's pattern is drawn but not read into the cell's attributes, so the dialog does not open on
  it (as with a Word cell's fill).

### A right-click in a table acts on the cell clicked, not the whole table

- **Wrong:** a right-click anywhere inside a table selected the whole table (`object-context-menu.tsx`,
  `targetAtPoint`), so Borders and Shading with Apply to: Cell, Merge Cells and the other menu commands changed every
  cell instead of the one clicked. Found while checking cell shading patterns in Chrome.
- **Changed:** a right-click in a table puts the caret where it was clicked, as Word does, or keeps the selection
  when the click falls inside it (selected cells stay selected); the table menu still opens.
- **Tests:** `object-context-menu.test.tsx` (the caret lands in the second cell; jsdom's click point is stubbed).
  All 785 pass.
- **Checked:** headless Chrome: a right-click in a new 3×2 table leaves no cells selected, and Borders and Shading
  then shades only that cell.

### Page borders in .docx, with Apply to and Options… (22.4, fifth part)

- **Missing:** a page border lived only in the app's own file. A Word document's page border (`w:pgBorders`) was
  not shown, and a border set in the app was not saved to .docx. Page Border had no Apply to (first page only, all
  except first) and no Options… (margins, Measure from), and the border was always drawn on the text margins.
- **Changed:** the section model reads and writes `w:pgBorders` (display, offsetFrom, zOrder and the four sides) in
  schema order (`model.ts`, `wml-read.ts`, `wml-write.ts`). `project.ts` maps it to the page setup and back: the
  first drawn side gives the line, colour and width; Word's element is written unchanged while the setup still
  says the same, so art borders and per-side lines survive; a change writes the setup's line on all four sides.
  The page setup has `borderDisplay`, `borderFrom` and `borderSpace` (`page-setup.ts`; default Word's 24 pt from
  the edge of the page), kept in the app's own file (`borderplace` mark in `header.ts`; older files keep the
  border on the margins). Each page draws the border only where Apply to says, placed in from the page edge or out
  from the text past its line (`showsPageBorder`, `pageBorderInset`, `page-canvas.tsx`). The Page Border tab and
  the ribbon's Page Borders dialog have Apply to (Whole document, This section, First page only, All except first
  page) and Options… (Margin top/bottom/left/right, Measure from). The Options dialog moved to
  `border-options-dialog.tsx`, shared with the paragraph's. A dialog opened from inside another no longer submits
  the outer one too (`word-dialog.tsx`).
- **Tests:** `page-borders.test.ts` (read, keep Word's element and art, write in order, None drops it, pages,
  placement, the app's own file and older files), a Page Border case in `borders-shading-dialog.test.tsx`. All 782
  pass; typecheck, ESLint and Prettier clean.
- **Checked:** headless Chrome: Dashed, All except first page, Measure from Text: page 1 has no border, page 2's
  sits 24 pt out from the text; the dialog's drop-downs no longer clip their text. Not checked in dark mode or Word.
- **Open:** Art (picture borders) is kept from Word but not drawn or offered; per-side page borders; the Options
  check boxes (Surround header / footer, Always display in front); a section of its own for "This section".

### Borders and Shading > Apply to Text: a box, Word's shadow, fill and pattern round selected text (22.4, fourth part)

- **Missing:** Borders and Shading only applied to a paragraph, cell or table. A run's own box and shading in a Word
  file (`w:bdr`, `w:shd` in `w:rPr`) were not shown, and were lost once the run was edited.
- **Changed:** the run model has `bdr` and `shd`, read and written in schema order (`model.ts`, `wml-read.ts`,
  `wml-write.ts`, which now shares `writeShading`). New `document/docx/text-box.ts` maps them to the editor's
  `textBorder` mark (line, shadow, fill, pattern) and draws it (`data-text-border` span; each wrapped line closed);
  `inlines.ts` shows a run's box and saves the mark, and an edited run keeps Word's own `w:bdr` / `w:shd` while the
  editor shows the same (a wave line stays a wave). The mark is in `character-format.ts`, registered in
  `extensions.ts`. Dialog: Apply to lists Text whenever text is selected and starts on it when part of one paragraph
  is selected; for Text the settings are None, Box and Shadow, the preview is a boxed sample, Options… is off, and
  fill and pattern apply to the text (`editor/text-box.ts`: `applyTextBox` changes only what was touched, piece by
  piece, and drops the mark when nothing is left). Opening the dialog brings back the selection a ribbon click
  dropped (`restoreSelection`), as other ribbon actions do.
- **Checked:** `text-box.test.ts` (mapping both ways, `w:rPr` order, one `w:bdr`, reopen, an edit keeps Word's own
  line), `borders-shading-dialog.test.tsx` (starts on Text, Shadow and fill on the selection only, reopened, None
  keeps the fill). Headless Chrome: a selected word gets the shadowed box and yellow fill, Apply to reads Text 3 runs
  out of 3. 775 tests pass; tsc, ESLint and Prettier clean.
- **Open:** Word's 3-D setting; the box's distance from the text (`w:space` on `w:bdr`) is written as 0 and not
  drawn; text boxes are not compared with Word.

### Borders and Shading > Shading > Patterns: Word's 37 patterns over a paragraph's fill (22.4, third part)

- **Missing:** the Shading tab said "Patterns are not supported". A Word paragraph shaded with a pattern (a
  percentage, stripes, grid or trellis) showed only its fill, and a `w:shd` with `val="solid"` and a colour showed
  nothing of the colour; the pattern was lost when the paragraph was edited.
- **Changed:** new `document/docx/shading-pattern.ts`: Word's list in the dialog's order (Clear, Solid (100%), 5% …
  95% with 12.5 / 37.5 / 62.5 / 87.5, Dk and Lt Horizontal, Vertical, Dwn and Up Diagonal, Grid, Trellis), the
  `shadingPattern` value ("pct25 #c00000", colour left out for Automatic), and the CSS that draws it over the fill
  (a percentage as that share of the colour, the rest as repeating gradients). Paragraphs have `shadingPattern`
  (`editor/block-format.ts`, cleared by Clear Formatting). `.docx`: read from and written to `w:shd` `val` and
  `color`, with `fill="auto"` when there is no fill (`docx/block-format.ts`; fill and pattern change together).
  Dialog: Patterns Style and Color (Automatic) under Fill, drawn in the preview; OK applies only the fill or pattern
  that was changed. Inside a table the pattern controls are disabled (cells keep fill only).
- **Checked:** `shading-pattern.test.ts`, `borders-shading-dialog.test.tsx` (a pattern over a fill, reopened and
  cleared; disabled in a table), `paragraph-box.test.ts` (`w:shd` with pattern, colour and fill, and with none, opened
  again). Headless Chrome: yellow fill with red Dk Up Diagonal, 25% automatic and blue Lt Grid each drawn as set,
  dialog preview matches. 771 tests pass; tsc, ESLint and Prettier clean.
- **Open:** patterns on table cells; percentages are drawn as a flat blend, not Word's dots; not compared with Word.

### Borders and Shading > Options…: a paragraph's box stands Word's distance from its text (22.4, second part)

- **Wrong:** a paragraph's border was drawn right on the edge of its text box, so the box touched the letters and,
  with left or right sides, pushed the text inward. `w:space` (Word's distance from text) was written as 1 pt on
  every side and dropped when a file was read, and the dialog had no Options… button.
- **Changed:** a paragraph's box is drawn by a `::before` layer that stands out by the gap plus the line width, as
  Word draws it, so the text keeps its place; top and bottom gaps add to the paragraph's height (`index.css`, driven
  by `--para-{side}`, `--para-{side}-on`, `--para-space-{side}`, `--para-border-width`). Paragraphs have
  `borderSpace` ("top right bottom left" in points; Word's 1 / 4 / 1 / 4 is the default and is not stored)
  (`editor/block-format.ts`, cleared by Clear Formatting in `home-actions.ts`). `.docx`: `w:space` is read into it
  and written per side, rounded and kept within Word's 0–31 pt (`docx/block-format.ts`); left and right now write
  Word's default 4 pt where 1 pt was written before. Dialog: Options… beside Apply to (paragraph only, disabled for a
  table or cell) opens Border and Shading Options with Top, Bottom, Left and Right "From text" fields
  (`borders-shading-dialog.tsx`).
- **Checked:** `borders-shading-dialog.test.tsx` (Options… sets the gaps; disabled for a table),
  `paragraph-box.test.ts` (gaps written and read back; defaults), `borderSpaceValue`. Headless Chrome: the text of a
  bordered paragraph starts at the same x as the plain paragraphs around it (397 px each), the box stands clear of
  the text, light and dark; the Options dialog fits its two columns (the spin inputs first overflowed the right
  edge; fixed with `min-width: 0`). 765 tests pass; tsc, ESLint and Prettier clean.
- **Open:** Word's "Measure from" (page border) and table cell options are not in the Options dialog; the gap was
  not compared with Word side by side.

### Borders and Shading: a paragraph keeps its pen, and Word's Shadow setting works (22.4, first part)

- **Wrong:** a paragraph's border kept only which sides were drawn: the style, colour and width picked in Borders and
  Shading were dropped, and every paragraph border was saved as Word's thin single line. Shadow was shown disabled.
  Changing only the style, colour or width in the dialog applied nothing (only edge clicks counted). `w:shadow` on a
  border in a Word file was dropped when the file was read, so a shadowed box came back plain after a save even when
  nobody touched it. Opening the dialog again while it was open kept the previous dialog's state (it was keyed by
  its tab).
- **Changed:** paragraphs have `borderPen` (the CSS line, as cells have) and `borderShadow`
  (`editor/block-format.ts`), drawn through `--para-border` and a bottom-right shadow in the line's colour
  (`index.css`), cleared by Clear Formatting. `.docx`: `w:shadow` is read and written on every border (`model.ts`,
  `wml-read.ts`, `wml-write.ts`); a paragraph's pen and shadow are read from its first drawn side and written to each
  side (`docx/block-format.ts`, reusing the cells' `borderOf`); the app's own line still reads back as no pen. Dialog
  (`borders-shading-dialog.tsx`): Shadow is a setting for a paragraph (a box that casts one; clicking one edge makes
  it Custom without the shadow), the preview shows it, the dialog opens on the paragraph's pen and shadow, a new pen
  alone is applied to the lines already drawn, and every opening starts fresh. `penLine` / `parsePen` are shared in
  `table-tools.ts`.
- **Checked:** `borders-shading-dialog.test.tsx` (Shadow with a pen, a pen alone, Custom drops the shadow, setting
  names) and `paragraph-box.test.ts` (pen and `w:shadow="1"` written on all four sides and opened again; the app's
  line opens as no pen). Headless Chrome: Home > Borders > Borders and Shading… > Shadow, Dotted, 1.5 pt draws a
  dotted box with its shadow, light and dark. 761 tests pass; tsc, ESLint and Prettier clean.
- **Open:** the text sits against a paragraph's box (Word keeps `w:space` between them and draws the box outside
  the text); Patterns, Options…, Apply to Text, 3-D, Page Border Art and the page-border scopes are the rest of 22.4.

### The Layout Options button beside a selected object is gone

- **Wrong:** a small square button sat at the top right of a selected picture, shape, text box, chart or 3D model and
  opened the wrap choices; it vanished as soon as it was clicked, and everything it offered is already in the
  object's toolbar (Wrap Text: the wraps, Move with Text / Fix Position on Page, More Layout Options…), the ribbon
  and the right-click menu.
- **Changed:** removed at the owner's request. `src/components/layout-options.tsx` deleted with its mount in
  `page-canvas.tsx`; the object toolbar no longer steps aside for it (`object-bar.tsx`); its CSS is gone. The chart's
  Chart Elements, Chart Styles and Chart Filters buttons used its button class and sat 32 px down to leave it room:
  they now have their own class (`chart-side-button`) and start level with the chart's top.
- **Checked:** headless Chrome: a selected 3D model shows only the toolbar above it, no `.layout-options` element.
  756 tests pass; tsc, ESLint and Prettier clean.
- **Open:** the chart's side buttons in their new place were not seen (the scripted browser could not select a
  chart); listed in `verify-list.md`.

### 3D Model Views: Word's named views, drawn by the viewer; Pause and Scenes icons (22.15)

- **Wrong:** the 3D Model Views gallery was six tiles of the model's picture turned flat in the page (0°, 45°, 90°…),
  unnamed, and picking one set a turn that did not face the camera. Word's gallery shows the model itself from named
  sides. Scenes, Pause, Front, Lighting, Presets and Format 3D Model used the lighting or play glyph, or a table
  glyph.
- **Changed:** `src/editor/model-views.ts`: twelve named views (Front, Back, Left, Right, Top, Bottom, Above/Below
  Front Left/Right, Above Back Left/Right), each a turn of the model in its own frame followed by the turn that
  faces its front to the camera (`viewPose`, with rotation matrices read back as yaw, pitch and roll); a registry
  from a model's node view to its running viewer. The viewer (`three-d-viewer.ts`) turns the model about the
  upright first, then tips it (`YXZ`), now applies `roll`, reports its camera and draws the model in every view at
  96 × 72 (cached until the model, format, size or camera changes). `ModelViewTiles` (`object-menus.tsx`) is the
  one gallery for the ribbon (six a row with Word's arrow stack and the full 4 × 3 menu), the single line ribbon and
  the object bar; until the model has loaded a tile shows its picture tilted that way. New glyphs in
  `context-icons.tsx` (Pause, Scenes, Lighting, 3D Model Views); Play 3D is Pause then Scenes, both large, as in
  Word.
- **Checked:** `model-views.test.ts` (each named side lands square on the camera, side views stay upright, a turn
  reads back as the same pose, the registry). Chrome: a cube shows a square face in Front … Bottom; a cone shows its
  side, its tip (Top) and its base (Bottom); picking Top turns the model; the arrows page to the Above/Below row and
  the menu lists all twelve. 756 tests pass; tsc, ESLint and Prettier clean.
- **Open:** the names are the usual Word view names, not checked against Word's own tooltips; Word's camera and
  rotation from a `.docx` (`am3d:camera`, `am3d:trans`) are still not read. A model turned in the app with both a
  turn and a tip before this change shows slightly differently live (the order of the two turns changed); its saved
  picture does not change.

### Comments: Word's red active range, anchor line and card beside the page (22.18)

- **Wrong:** the open comment's range was tinted in the theme blue with an underline and its card had a grey
  border; Word draws the active range in red with a bracket at each end, outlines the card in red and joins them
  with a line. The card opened over the document, left of the margin marker, and going to a comment (margin marker,
  Review panel, Next/Previous) selected its text, so the selection's blue hid the range's colour.
- **Changed:** `src/editor/comment-anchor.ts`: `commentAnchorPoints` (the line from the range's last line to the
  card: straight when the card is level with it, with a short bend otherwise, none when the card covers the range)
  and `markCommentEnds` (the first and last piece of the active comment carry the brackets, as a range is split
  into several marks where its formatting changes). `comment-markers.tsx` draws the line as a fixed SVG under the
  card and places the card beside the page when there is room, over the document otherwise. `selectComment`
  (`editor/comments.ts`) now puts the caret at the start of the range instead of selecting it. `index.css`: new
  `--app-comment-active` token (light `#c50f1f`, dark `#e5534b`), used by the range, the line, the card and the
  Review panel's active card.
- **Checked:** `comment-anchor.test.ts` (straight, bent, card on the left, card covering the range, bracket
  classes). Chrome: a comment on the last word opens beside the page with the red bracketed range and the line, in
  light and dark; in a 1000 px window the card sits over the page and the line still reaches it. 750 tests pass;
  tsc, ESLint and Prettier clean.
- **Open:** the line is drawn only for the open card, not for the Review panel's cards. A React "error during
  concurrent rendering … able to recover" is logged on every page load once the first-run setup has been answered;
  it is there with this change undone too, so it is older and not yet traced.

### Insert > 3D Models > Online inserts the model picked, not a cube

- **Wrong:** picking a Poly Haven model in the 3D Models library inserted the "cube" preset with the catalog
  thumbnail as its picture; the model file was never downloaded, so the page showed a cube where the tile showed
  a chair. In the desktop app the catalog and the thumbnails were blocked as well: the Content Security Policy
  listed neither Poly Haven's hosts nor Iconify's.
- **Changed:** `src/editor/polyhaven.ts` downloads the model's glTF at the smallest resolution offered with the
  `.bin` and textures it includes (`api.polyhaven.com/files/{id}`, files on `dl.polyhaven.org`, CORS open), and
  `src/editor/gltf-pack.ts` packs them into one `.glb` (buffers and images moved into a single BIN chunk) so the
  viewer, the local-file path and a Word model part all take the same thing. The library
  (`src/components/model-library.tsx`) stays open with the progress in its footer while the file comes in, then
  inserts the model with the thumbnail as its poster; a failure is reported in the footer and leaves the library
  open; the tiles wait meanwhile (`.asset-library-tile:disabled`). `src-tauri/tauri.conf.json`: `connect-src`
  gains `api.polyhaven.com`, `dl.polyhaven.org` and `api.iconify.design`, `img-src` gains `cdn.polyhaven.com`, in
  both `csp` and `devCsp`.
- **Checked:** `gltf-pack.test.ts` (buffers and images packed with their offsets, data URIs, file lookup by path
  or name, a missing file refused, a buffer-less glTF). Chrome: Insert > 3D Models > Online > Arm Chair 01
  downloads and appears as the live, textured chair that turns; tsc, ESLint and Prettier clean.
- **Open:** a model inserted from the library or a local file is still saved to `.docx` as its picture only; the
  `.glb` travels only for a model opened from Word (`modelPart` in `docx/inlines.ts`). The downloaded file is not
  cached, so inserting the same model again downloads it again.

## 2026-10-24

### A Word 3-D model that fails to load no longer turns blank; the desktop app can load it at all

- **Wrong:** reported as "the 3D model did not show up" in f24. In Chrome the model showed (Word's picture for the
  fixtures' stub `.glb`, the live creature for `123.docx`), but two defects stood behind the report. The desktop
  app's Content Security Policy had `blob:` in `img-src` and not in `connect-src`, so the GLTF loader's fetch of
  the model's blob URL was blocked and a Word model could never load there. And the viewer removed the stand-in
  before measuring the loaded scene: a file with no scene (the fixtures' 52-byte `.glb`) threw after the removal,
  leaving an empty view, and the first turn, resize, format change or Play 3D captured that empty canvas as the
  model's picture, which then stood for it in the page, in print and in the saved `.docx` (a turned model is
  written as the app's picture).
- **Changed:** `blob:` added to `connect-src` in both `csp` and `devCsp` (`src-tauri/tauri.conf.json`).
  `src/editor/three-d-fit.ts` (`fitLoadedModel`) measures the loaded scene and says when there is nothing to
  draw; the viewer (`three-d-viewer.ts`) then keeps the stand-in and the picture, takes no snapshot until a model
  has loaded (`modelReady`), carries the pose the stand-in was turned to over to the loaded model, and sets Word's
  picture as the poster before the WebGL renderer is made; the node view (`three-d-model.ts`) shows the picture
  when the viewer cannot start (no WebGL).
- **Checked:** `three-d-fit.test.ts` (no scene, no extent, near units, far units); `model3d-import.test.ts` now runs
  on f22 and f24. Chrome: f24 keeps Word's picture after a turn; `123.docx` turns live. 12 tests pass; tsc and
  ESLint clean.
- **Open:** the desktop app was not run (listed in `verify-list.md`); Word's camera pose and animation are still not
  used, so the live model's pose differs from Word's poster frame.

### Shapes to Word and back (Document1.docx) — commit 8f1c262

- **Wrong:** a Lightning saved from the app opened in Word bigger and at a different slant; a shape added in Word
  (Explosion: 8 Points) did not appear in the app; a bolt turned in Word was reported cut off on reopening.
- **Cause:** the app drew shapes letterboxed in their box while Word stretches a preset over its whole extent;
  the app's lightning geometry was not Word's; `irregularSeal1` had no variant, so it opened as an empty run;
  theme-colour glow and three-stop gradients were not read.
- **Changed:** shape figures stretch to their box (`shapeViewBox` + `preserveAspectRatio="none"`, non-scaling
  strokes, flips and wrap contour on the same box) in `src/editor/insert-blocks.ts`, `shape-style.ts`,
  `wrap-contour.ts`; Lightning and Explosion drawn with Word's `lightningBolt` / `irregularSeal1` geometry;
  `irregularSeal1` → `burst` ("Explosion: 8 Points") in `src/document/docx/shape-import.ts`; first gradient stop
  as fill, theme glow, reflection tolerance in `shape-effects.ts`.
- **Checked:** tests in `shape-import.test.ts`, `shape-write.test.ts` (734 pass); Chrome shows both shapes.
- **Open:** the cut-off bolt was not reproduced in Chrome (desktop app unchecked); the other presets are still
  hand-drawn approximations of Word's geometry.

### Verify list created

- `docs/verify-list.md` collects every "not checked / not verified" note from `next-todo.md`, grouped by the
  environment needed (Word, Chrome, desktop app), with checkboxes.
