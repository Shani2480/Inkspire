# Changes log

One entry per fix or feature, newest first, written the same session the work lands. Each entry says what was
wrong or missing, what changed, where (files, tests), how it was checked, and what is still open. The longer
story of each feature stays in `next-todo.md` under its section; `verify-list.md` holds what still needs a check
in Word, Chrome or the desktop app.

## 2026-10-26

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
