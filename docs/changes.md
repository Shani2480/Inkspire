# Changes log

One entry per fix or feature, newest first, written the same session the work lands. Each entry says what was
wrong or missing, what changed, where (files, tests), how it was checked, and what is still open. The longer
story of each feature stays in `next-todo.md` under its section; `verify-list.md` holds what still needs a check
in Word, Chrome or the desktop app.

## 2026-10-26

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
