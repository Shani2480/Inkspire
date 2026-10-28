# Changes log

One entry per fix or feature, newest first, written the same session the work lands. Each entry says what was
wrong or missing, what changed, where (files, tests), how it was checked, and what is still open. The longer
story of each feature stays in `next-todo.md` under its section; `verify-list.md` holds what still needs a check
in Word, Chrome or the desktop app.

## 2026-10-28

### Resizing pictures with a finger no longer turns into a scroll (Android tablet)

- **What was wrong:** on the tablet, dragging a resize handle worked for a moment and then the page scrolled and the
  picture went back to its old size. The handles had the default `touch-action`, so Chrome took the drag over as a
  pan once the finger had moved far enough and sent `pointercancel`, which the resize treated as Esc.
- **What changed:** `index.css` sets `touch-action: none` on `.image-resize`, `.image-crop-handle` and a selected
  `.object-frame` (an unselected picture still scrolls under a swipe). `object-resize.ts` and `picture-crop.ts`
  capture the pointer on the handle, and a `pointercancel` now keeps the size or crop reached so far; only Esc
  puts the original back.
- **Tests:** 178 files, 1179 tests pass; typecheck and lint clean.
- **Checked:** not on a touch device; see the verify list.
- **Open:** table column resizing comes from prosemirror-tables, which listens for mouse events, so a finger may
  not resize columns at all; not looked at.

### v0.1.3: Word covers open as written, with the Android APK built from the android branch

- **What was wrong:** v0.1.2 opened a centred cover picture at the left, drew footer pictures placed relative to
  the margin off the page, showed a TOC control without Word's gallery as run-together text, and rewrote table
  cell widths on save (see the two entries below).
- **What changed:** version 0.1.3 in `package.json`, `package-lock.json`, `Cargo.toml`, `Cargo.lock`,
  `tauri.conf.json` and the Flatpak metainfo; tagged `v0.1.3`. The fix was cherry-picked onto main; the android
  branch has it and merges main for the version.
- **Tests:** 177 files, 1174 tests pass on main; 178 files, 1179 on android.
- **Checked:** the release workflow's jobs and the assets on the release (see the session's report).
- **Open:** none.

### Pictures centred by their paragraph style; table cell widths kept on save

- **What was wrong:** (1) a picture alone in a paragraph took only the paragraph's own `w:jc`, so one centred by its
  style (a "Figure" style, say) opened at the left. (2) Saving rewrote every cell's `w:tcW` to the sum of its grid
  columns, even with the columns untouched; Word's preferred cell widths often differ from the grid (the Cursor
  brief's cover table: 2337/340 against a grid of 2124/328).
- **What changed:** `project.ts` `pictureAlign` resolves the alignment through the paragraph, its style's basedOn
  chain and the default paragraph style, on open and on save (`Build.wordStyles` carries the source's styles);
  setting such a picture to the left writes `w:jc="left"` over the style. Table cells keep the source cell's
  `w:tcW` while the table's grid is as read; a resized table still gets the new grid's widths.
- **Tests:** `cover-layout.test.ts` (style-centred picture opens centred and saves without its own `w:jc`; set to
  left it saves `w:jc="left"`; cell widths kept with columns unchanged; resized columns get the new widths).
  178 files, 1179 tests pass; typecheck and lint clean.
- **Checked:** the Cursor brief saved untouched: `document.xml`, header and footer identical to the source apart from
  revision ids and `w:lastRenderedPageBreak`; Open XML validator 0 errors.
- **Not changed:** `w:lastRenderedPageBreak` is still dropped on purpose (`wml-read.ts`): it is Word's cache of
  where it last broke pages, rewritten on every Word save, and would be stale after an edit in the app.

### A Word brief opened with its cover logo at the left, no footer and its table of contents as plain text

- **What was wrong:** a user's Word file (cover page with a centred logo, a footer picture, a TOC) showed three
  faults. (1) A picture alone in a centred paragraph opened at the left margin: the editor's pictures are blocks
  with no paragraph, and the paragraph's alignment was dropped. (2) A header or footer picture placed "relative to
  margin" was measured from the footer box's top instead of the page's top margin, so the footer picture (10.3"
  below the margin) was drawn off the page. (3) The TOC's content control had only `w:alias="Table of Contents"`,
  no `docPartObj/docPartGallery`, so it was not read as a table of contents and its entries ran together.
- **What changed:** pictures take `textAlign` (TextAlign's types in `extensions.ts` now include `image`, so the
  ribbon's align buttons work on a selected picture); `project.ts` opens a picture-only paragraph's `jc` onto the
  image and saves an edited alignment back to `w:jc` (an unchanged one stays as read); `objects.ts` draws a centred
  or right-aligned picture as a block with auto margins, and marks margin-relative frames `data-relative="margin"`;
  `chrome-editors.tsx` gives each header/footer box `--chrome-margin` (page top margin minus the box's top), which
  `index.css` adds to such frames. `wml-read.ts` `isTocControl` also accepts any content control holding a TOC field.
- **Tests:** `cover-layout.test.ts` (centred picture opens centred and saves unchanged; an alignment set in the
  editor is saved; a left picture is untouched; a TOC control with only an alias opens as a TOC and saves as read).
  178 files, 1175 tests pass; typecheck clean.
- **Checked:** the file in the dev app (headless Chrome): cover logo centred at 2.23" (Word: 2.23"), header logo at
  6.87"/0.09" (Word: 6.86"/0.08"), footer picture at 11.06" from the top (Word: 11.03"), TOC with 16 entries, levels,
  dot leaders and Update Table. Saved untouched: header and footer parts identical to the source apart from revision
  ids, body unchanged from before the fix; Open XML validator 0 errors.
- **Open:** not opened in Word itself. (The two items first left open here are fixed in the entry above.)

### v0.1.2: the ribbon dialog fix, the Index crash fix and touch pinch, with the Android APK built by the workflow

- **What was wrong:** v0.1.1's installers had dialogs from the ribbon hidden under the document, Insert Index and
  Insert Table of Authorities crashing, and a pinch zooming the whole interface on touch screens.
- **What changed:** version 0.1.2 in `package.json`, `package-lock.json`, `Cargo.toml`, `Cargo.lock`,
  `tauri.conf.json` and the Flatpak metainfo; tagged `v0.1.2`. The release workflow's Android job runs for the
  first time.
- **Tests:** 177 files, 1171 tests pass on main.
- **Checked:** the release workflow's jobs and the assets on the release (see the session's report).
- **Open:** none.

### Insert Index and Insert Table of Authorities crashed with the cursor in a paragraph

- **What was wrong:** both commands inserted their block at the cursor and then selected the node at that
  position; inside a paragraph the block lands after the paragraph, so nothing was there and the command threw
  "Cannot read properties of null (reading 'nodeSize')" and inserted nothing.
- **What changed:** `index-entry.ts` `insertDocumentIndex` and `authorities.ts` `insertAuthoritiesTable` select the
  block where it actually went.
- **Tests:** `index-insert.test.ts` (both commands from the middle of a paragraph; both threw before the fix).
- **Checked:** found by the ribbon sweep (see the dialogs entry below); 177 files, 1171 tests pass.
- **Open:** none.

### Pinching on a touch screen zoomed the whole interface

- **What was wrong:** on the Android tablet (and any touch screen) a two-finger pinch scaled the whole page like a
  website: ribbon, title bar and all.
- **What changed:** `index.html`'s viewport no longer lets the page zoom (`maximum-scale=1, user-scalable=no`), and
  `app-menu.ts` turns a two-finger pinch into document zoom through `zoomGesture`, around the point between the
  fingers, as Ctrl+wheel and a touchpad pinch already did. On Android, `MainActivity` also turns off the WebView's
  own zoom.
- **Tests:** none (a touch gesture).
- **Checked:** in Chrome emulating an Android tablet with touch, a pinch drove the status bar from 100% to 200%
  while `visualViewport.scale` stayed 1.
- **Open:** check on a real tablet.

### Dialogs opened from the ribbon were hidden under the document (3D Models showed as a strip in the ribbon)

- **What was wrong:** Insert > 3D Models (and Icons, SmartArt, Bookmark, Online Video, Symbol, Equation, and any
  dialog a ribbon tab opens) drew inside the ribbon's tab panel, whose `will-change: opacity` (kept against the
  WebKitGTK fade blink) makes it a layer of its own: the document painted over the dialog, leaving at most the
  part over the ribbon visible.
- **What changed:** `DialogFrame` (`word-dialog.tsx`) and the Icons, 3D Models and SmartArt libraries render
  through `createPortal` into `document.body`.
- **Tests:** `word-dialog.test.tsx` (a dialog opened inside a tab panel lands on the page; fails without the fix).
  175 files pass.
- **Checked:** in Chrome against the dev server, a script clicked every ribbon button and every "…" menu item on
  each tab and tested that the dialog's centre and title bar are topmost: all 13 Insert dialogs and 45 on the
  other tabs open over the document.
- **Open:** that sweep logged `Cannot read properties of null (reading 'nodeSize')`: Insert Index and Insert Table
  of Authorities, fixed above.

### v0.1.1: a macOS .dmg, and the installers carry the content security policy fix

- **What was wrong:** no Mac build; the v0.1.0 installers blocked runtime styles and the spell-check dictionaries.
- **What changed:**
  - `release.yml`: a `macos` job on `macos-latest` builds `--target universal-apple-darwin --bundles dmg` (Apple
    Silicon and Intel in one app) and uploads it; publishing waits for it.
  - `tauri.conf.json`: `bundle.macOS` with ad-hoc signing (`signingIdentity: "-"`, no Developer ID yet, so not
    notarized) and macOS 11 as the minimum.
  - Version 0.1.1 in `package.json`, `package-lock.json`, `Cargo.toml`, `Cargo.lock`, `tauri.conf.json` and the
    Flatpak metainfo.
  - README and release notes: a macOS row and steps (drag to Applications; right-click Open, or Open Anyway in
    Privacy & Security, the first time).
- **Tests:** none new; CI green.
- **Checked:** `cargo check` for `aarch64-apple-darwin` cannot run here (objc2 needs Apple's SDK); the release
  run on GitHub's macOS runner is the build check.
- **Fixed on the first run:** the macOS build stopped at `libc::prctl` in `local_ai.rs` (Linux only, guarded by
  `cfg(unix)`); now `cfg(any(target_os = "linux", target_os = "android"))`.
- **Open:** a Developer ID and notarization (removes the first-start block); nobody has started the .dmg on a Mac
  yet.

### Installed builds: inline styles and the spell-check dictionaries were blocked by the content security policy

- **What was wrong:** only in built apps (the .deb, AppImage, Flatpak, Windows installer and Android), not in
  `tauri dev`:
  - `index.html` has an inline `<style>`, so Tauri added a nonce to `style-src`; with a nonce the webview ignores
    `'unsafe-inline'`, and styles the app sets at runtime were refused ("Refused to apply inline style").
  - `connect-src` had neither `'self'` nor `data:`, so the Hunspell dictionaries (bundled files, the small ones
    inlined as `data:` URLs) could not be fetched: "Spell check dictionary failed to load", no red underlines.
- **What changed:** `tauri.conf.json`: `dangerousDisableAssetCspModification: ["style-src"]`, and `'self'` and
  `data:` in the production `connect-src`.
- **Tests:** none (configuration); vitest and cargo tests pass.
- **Checked:** on the Android tablet emulator, before and after: the CSP errors in the console are gone and the
  dictionary loads. The desktop builds use the same configuration.
- **Open:** a v0.1.1 release would carry this to the installers.

### Install instructions for the v0.1.0 installers

- **What was wrong:** the README's Download section was one paragraph; it did not say how to install each file.
- **What changed:** README "Download and install": a table of the four files, then steps for the Windows setup
  .exe (SmartScreen, per-user install, uninstall), the .deb (`apt install`, dependencies, removal), the Flatpak
  (adding Flathub, install, run, what it can reach), the AppImage (FUSE 2), and what the first start asks. "Setup"
  is renamed "Build from source". WINDOWS.md points people who only want to use the app to the installer.
- **Tests:** none (documentation only).
- **Checked:** the published .deb's package name (`inkspire`), binary and dependencies; the published Flatpak
  installed, started and was removed again.
- **Open:** the installers stay on the GitHub release, not in the repository (the AppImage alone is over GitHub's
  100 MB file limit).

### Installers: .deb, AppImage, Flatpak and Windows setup .exe published from a release workflow

- **What was wrong:** there were no downloadable builds; `npm run tauri build` also stopped at once because the npm
  `@tauri-apps/plugin-fs` (2.6) did not match the Rust crate (2.7), and the binary was named `tauri-app`.
- **What changed:**
  - `package.json`: `@tauri-apps/plugin-fs` ^2.7.1.
  - `tauri.conf.json`: `mainBinaryName` `inkspire`; bundle category, descriptions, publisher, licence and homepage.
  - `.github/workflows/release.yml`: on a `v*` tag, a draft release; .deb and AppImage built on Ubuntu 22.04;
    a Flatpak built from that .deb in the GNOME 50 flatpak-builder container; an NSIS setup .exe on Windows; then
    the release is published. `.github/release-notes.md` holds the install table.
  - `packaging/flatpak/`: the manifest (GNOME 50 runtime, Wayland/X11, network, home folder, Secret Service for
    the keys) and AppStream metainfo.
  - README: Download section and the release workflow under CI. GitHub About: description and topics.
- **Tests:** typecheck clean.
- **Checked:** local `tauri build` of the .deb (10 MB) and AppImage (117 MB); the Flatpak built from the local
  .deb (9.5 MB), installed, started and stayed running, then uninstalled.
- **Open:** the Windows installer is not code-signed (SmartScreen warns); x86_64 only, no macOS or ARM builds.

### README: screenshots and a feature tour for the public repository

- **What was wrong:** the README had no pictures of the app and its feature list predated charts, SmartArt, shapes
  with wrapping, and review.
- **What changed:** eight screenshots in `docs/images/` (overview, charts, SmartArt, shapes and wrapping, review,
  AI chat, File view, dark mode), taken from the web build at 1600x1000; the feature list is brought up to date and
  a Tour section shows each screenshot.
- **Tests:** none (documentation only).
- **Checked:** each screenshot viewed before adding; the README renders the images by relative path.
- **Open:** the screenshots come from the web build, so the native title bar of the desktop app is not shown.

### Verify-list run in Chrome: Paragraph dialog writes only what changed, chart sheet aligns like Excel

- **What was wrong:**
  - Paragraph dialog: OK wrote every field, not only those changed. Ticking Keep with next alone also set Line
    Spacing 1.15, which is tighter than the editor's default line, and spacing after 8 pt; the paragraph's lines
    shrank and, at a page foot, Keep with next then left it behind.
  - Chart data sheet: every cell but column A and row 1 was right-aligned, so text (a treemap's stems and leaves)
    sat to the right like numbers.
- **What changed:**
  - `paragraph-dialog.tsx`: the dialog remembers the values it opened with; `changedAttrs` keeps only the
    attributes whose fields changed (both line spacing attributes when either line field changed), and the outline
    level is only set when it changed.
  - `chart-sheet-dialog.tsx` and `index.css`: a cell holding a number is marked `data-number` and right-aligned;
    the rest are left-aligned, as in Excel.
- **Tests:** `paragraph-dialog.test.ts` (Keep with next alone writes only `keepNext`; a line spacing change writes
  both line attributes; nothing changed writes nothing).
- **Checked:** in headless Chrome:
  - Keep with next on the last paragraph of page 1 moves it to page 2 with the next one; the paragraph's other
    attributes are as before.
  - Page break before works.
  - The treemap sheet shows text left and sizes right; retyping a stem regroups the data.
  - Also run through, with no change needed:
    - Chart side buttons, the Chart Elements items (Error Bars, Lines, Up/Down Bars), and long axis labels.
    - The chart sheet in dark mode.
    - The right-click text menu.
    - Compress Pictures with Delete cropped areas.
    - Align Right, Center and Bottom on two picked shapes.
    - The Shape Format tab's states.
- **Open:**
  - The Paragraph dialog shows 1.15 as the line spacing of a paragraph that has none, while the editor draws
    those at 1.65.
  - A shape with text keeps the WordArt row off.
  - Shapes have no yellow adjustment handles.
  - Only the last of several picked objects shows handles.
  - (All in `next-todo.md`.)

### SmartArt Format: Shape Effects, Text Outline and several shapes at once

- **What was wrong:** the SmartArt Format tab changed one shape at a time and had no Shape Effects or Text
  Outline.
- **What changed:**
  - `smartart-model.ts`: a shape's look takes `effect` (Shadow, Glow, Soft Edges, `SMARTART_EFFECTS`) and
    `outline` (a text outline colour); an effect the app does not know is dropped on reading.
  - `smartart.ts`: Ctrl+click or Shift+click on a shape adds it to (or takes it from) the shapes the Format tab
    changes; they show a selection outline (`data-picked`). A plain click starts over with one shape.
    `pickedItems` lists the active shape and those picked with it.
  - `smartart-format-tab.tsx`: Shape Effects in Shape Styles and Text Outline in WordArt Styles, on both ribbon
    layouts. Every change (Change Shape, Larger, Smaller, the fills, outlines and effects) goes to all picked
    shapes; Larger and Smaller step each shape from its own size. The picks stay for the next change.
  - `index.css`: the effects drawn on a shape, and the picked outline.
- **Tests:** `smartart-model.test.ts`: effect and outline set, saved and read back, an unknown effect dropped;
  `pickedItems` keeps the active shape first and drops repeats and indexes past the end.
- **Checked:** in Chrome (headless): Ctrl+clicked North and South with Sales; all three took Shadow, then Glow,
  and a text outline; the others stayed as they were.
- **Open:** the effects and text outline stay in the app's own attributes; the Word diagram's drawing part does not
  carry them yet, so Word shows those shapes without them.

### SmartArt saved as Word's own diagram, and Word's SmartArt opened editable

- **What was wrong:**
  - A SmartArt graphic went into a .docx as a picture with the app's graphic hidden inside it, so Word showed a
    picture it could not edit.
  - SmartArt Word made always opened as a picture here, even in a layout the app has.
- **What changed:**
  - `smartart-write.ts` (new) writes the five parts of a SmartArt diagram:
    - The data model: one point per item, each joined to its parent by Word's `parOf` connection.
    - A layout definition for each of the app's 14 layouts. Word's own layout id is used where the app's layout
      matches one (Basic Block List, Vertical Bullet List, Basic Process, Basic Chevron Process, Step Up Process,
      Basic Cycle, Hierarchy, Basic Radial, Basic Venn, Basic Pyramid); the other four use the app's own id.
    - Word's own Simple Fill quick style and Colorful Accent 1 colours, copied from a file Word saved
      (`smartart-defs.ts`).
    - A drawing part with each shape where the app draws it. It is measured when saving
      (`object-pictures.ts` `smartArtShapes`), so programs that show the saved drawing show the app's graphic.
  - `readDiagramData` reads the items and their levels back.
  - `inlines.ts` `smartArtRun` saves a SmartArt graphic this way, with the app's own graphic kept in `docPr`.
  - A graphic opened from Word goes back as Word's own drawing and parts while its text, levels, size and place are
    unchanged. With its text changed, it gets a new data model and drawing but keeps Word's layout, quick style and
    colours.
  - On opening, `diagramGraphicObject` decides what a diagram opens as:
    - A diagram the app saved opens as the app's graphic, with Word's text if Word changed it.
    - A Word diagram in a layout the app has opens as an editable graphic in the theme's accent colour.
    - Other layouts (for example Circle Relationship) still open as a picture.
- **Tests:** `smartart-write.test.ts`:
  - Data model round trip: nested levels, `&`, a two-line item.
  - Every layout has a definition under its own id.
  - The drawing part reads back.
  - The five parts are written with their relationships and content types, and the graphic reopens as the app's.
  - Text Word changed is taken on opening.

  All 1159 tests pass.

- **Checked:**
  - Saved the app's Process and Hierarchy graphics from headless Chrome through the app's own save path. The Open XML
    validator finds 0 errors in them, and in a file holding all 14 layouts.
  - LibreOffice draws the saved graphics with the same boxes, colours and text as the app.
  - Reopened in the app, the Hierarchy graphic is editable again.
- **Open:**
  - Not opened in Word.
  - The layout definitions are the app's own. They are written to the schema but not compared with Word's, so
    Word may lay the graphic out differently from the app (it uses its own definition if it trusts Word's layout
    ids).
  - Not carried into Word's data model:
    - Each shape's own look from the Format tab.
    - Pictures in Picture layouts.
    - The app's accent colour (Word uses the theme's Accent 1).
  - The Process arrows are missing from the drawing part.

### Edit Wrap Points, and Word's wrap outline kept

- **What was wrong:**
  - Wrap Text → Edit Wrap Points was always greyed out.
  - Word's own wrap outline (`wp:wrapPolygon`) was neither read nor written: a Tight picture from Word wrapped by the
    outline the app found, and every Tight or Through object was saved with its rectangle.
- **What changed:**
  - `objects.ts`: floating objects have `wrapPoints` (the outline as points in Word's 21600 box over the object) and
    `wrapEdited`.
  - `wrap-contour.ts`: an object with wrap points wraps by them (`rowsOfPolygon`), else by its drawing as before;
    `polygonOfRows` turns the found outline into a few points to start editing from.
  - `edit-wrap-points.ts` (new): Edit Wrap Points for a floating object with Tight or Through wrap (not turned).
    It draws the outline as a red dashed line with black handles over the object. Drag a handle to move its point;
    drag the line to add a point there; Ctrl+click a handle to delete its point (three stay). Each change is one undo
    step and reflows the text; Escape or a click away ends it. The Wrap Text menu (every ribbon and the floating
    toolbar) starts it.
  - `wml-read.ts`, `inlines.ts`: `wp:wrapPolygon` is read with its `edited` flag (Word's closing point dropped) and
    written back closed, edited="1" after Edit Wrap Points; an object with no outline of its own still gets its
    rectangle. A changed outline counts as a changed layout, so the drawing is written anew.
- **Tests:** `wrap-contour.test.ts` (polygon bands, outline to points and back, parsing, add and delete),
  `floating.test.ts` (outline written closed and read back; the rectangle by default). All 1154 tests pass.
- **Checked:**
  - Headless Chrome: a 200 px square picture with Tight wrap. Wrap Text → Edit Wrap Points showed four handles.
    Dragging the bottom-right one in made the outline a triangle, and the text moved in along the diagonal (seen
    with the picture faded). Escape ended it.
  - The Open XML validator finds no errors in a saved file with an edited outline.
- **Open:**
  - Not for turned objects; the menu says so.
  - The outline isn't checked in Word.
  - Word may scale picture outlines differently from the plain 21600 box assumed here.
  - Text still flows on one side of the object only.

### Shape text: italic, underline, highlight, alignment, and Word's theme fonts and colours

- **What was wrong:**
  - With a shape selected, Home's Italic, Underline, Text Highlight Color and the alignment buttons acted on nothing;
    only size, bold, colour and font reached the shape's text. Ctrl+B, Ctrl+I and Ctrl+U did not reach it either.
  - Text Word wrote in a theme font or colour (`w:asciiTheme`, `w:themeColor`) opened in the default font and
    colour, and its italic, underline, highlight and alignment were dropped.
- **What changed:**
  - `insert-blocks.ts`: new figure attributes `textItalic`, `textUnderline` (a style: solid, double, dotted,
    dashed, wavy), `textHighlight` and `textAlign` (empty is centred), drawn by `styleShapeText`; a highlight marks
    the text's lines, not the box.
  - `shape-text.ts`: `toggleItalic`, `toggleUnderline`, `applyUnderline`, `applyHighlight`, `applyAlign` act on a
    selected shape's text, else on the selection. The Home tab (both layouts), the Underline and Highlight menus,
    the Mini Toolbar, the Quick Access Toolbar and the keyboard shortcuts use them; `use-active-marks.ts` shows the
    shape's state on the buttons.
  - `shape-write.ts`: `w:i`, `w:u` with Word's style, `w:highlight` for Word's highlight colours (other colours as
    the run's `w:shd`), and `w:jc` from the alignment.
  - `shape-import.ts` `readShapeTextLook`: reads them back from the first run, and resolves a theme font through the
    theme's major or minor latin face and a theme colour through the colour scheme with its tint or shade.
- **Tests:** `shape-text.test.ts` (set and clear each), `shape-write.test.ts` (written and read back; shading for
  other colours; theme font, theme colour, tint, Word's own value first). All 1148 tests pass.
- **Checked in headless Chrome:** a rectangle with text, Ctrl+I, Ctrl+U, Home → Align Right and Text Highlight
  Color: the text is italic, underlined, highlighted and at the right, and Italic and Align Right show as on.
- **Open:** the Font dialog, strikethrough, sub/superscript and character spacing for shape text; formatting part of
  the text (the look is the whole text's); not checked in Word.

### Broken table rows: header row repeated, centred cells, pictures and nested tables

- **What was wrong:**
  - A row that broke across pages went on at the next page's top without the table's header row, though the table
    repeats it (Repeat as header row); a row that moved whole to the next page that way also lost it.
  - A vertically centred cell in a broken row moved its text as the gaps grew, so the page showed other lines than
    those measured.
  - A row holding a picture, a nested table or another object never broke; it moved whole.
- **What changed:**
  - `pages.ts`: `splitRow` takes the header row's height. On each page the row goes on to, every cell's gap is that
    much taller and the first cell's gap draws a copy of the header row (`headerCopy`: the table's own attributes,
    column widths and first row, read-only); a row moved whole gets the header row as other rows do.
  - `page-grid.ts` `cutSplitRows`: the table's cut ends above the copy, which is lined up with the table's left edge
    and width.
  - `index.css`: a broken row's cells are drawn top-aligned while broken.
  - `splittable` no longer refuses rows with objects: `rowCellLines` counts each picture, nested table or other block
    object in a cell (not floating ones) as one line the break goes before, never through.
- **Tests:** `pages.test.ts` (rows with a picture or nested table may break; Allow row to break off keeps them
  whole). All 1145 tests pass.
- **Checked in headless Chrome:** a two-column table with Header Row on, its second row broken from page 2 to 3:
  Head A / Head B drawn across the full width at the top of page 3, the row's rest under it; a 160-line row over four
  pages has the header on each; a cell with text, a picture and more text breaks before the picture, which starts the
  next page under the header.
- **Open:** Word may centre a short cell of a broken row over the whole row; here it is drawn at the top. The header
  copy is not clickable (as Word's repeated header). A nested table taller than a page is not split inside itself.

### SmartArt: a Format tab, and Hierarchy drawn as a tree

- **What was wrong:**
  - A SmartArt graphic brought only the SmartArt Design tab. Word also has a Format tab for the shape and the graphic.
  - Hierarchy drew its outline levels as an indented column, not as a tree.
- **What changed:**
  - `smartart-format-tab.tsx` (new), shown as Format beside SmartArt Design. It acts on the shape the caret was
    last in:
    - Shapes: Change Shape (Rectangle, Rounded Rectangle, Oval, Hexagon, Diamond, Parallelogram), Larger, Smaller.
    - Shape Styles: Shape Fill, Shape Outline. WordArt Styles: Text Fill. Automatic goes back to the graphic's
      colours.
    - Arrange (Position, Wrap Text, Bring Forward, Send Backward, Selection Pane, Align, Rotate) and Size (Height,
      Width) act on the whole graphic, as for other objects. Both ribbon layouts.
  - `smartart-model.ts`: each item can carry its own look (`SmartArtLook`, `withLook`). It is kept in a new `looks`
    attribute and stays with its item through Add Shape, Promote, Demote and Move.
  - `smartart.ts`: Hierarchy draws each item over a row of the items under it, joined by elbow lines in the
    graphic's colour (`growTree`). The text order is unchanged, so typing and the Text Pane work as before.
- **Tests:** `smartart-model.test.ts` (a look set, merged and cleared; Larger/Smaller steps; looks through save
  attributes and moves). All 1144 tests pass.
- **Checked in Chrome:** a Hierarchy of six items over three levels draws as a tree. Format → Change Shape → Oval,
  Shape Fill and Larger twice on "Sales" made it a filled, larger oval, with the lines still meeting each shape.
- **Open:**
  - Shape Effects, WordArt quick styles and Text Outline are not on the tab.
  - Only one shape is acted on at a time.
  - The single line ribbon's Format tab was not looked at.
  - SmartArt made in the app is still saved to `.docx` as a picture carrying the graphic.

### 3-D models from Word open in Word's pose and stay Word's models when turned

- **What was wrong:**
  - A Word 3-D model opened facing the app's camera in its rest pose, not as Word showed it. `am3d:rot` was not
    read, and an animated model (the creature in `123.docx`) stood with its eyes shut and legs straight.
  - Turned in the app, the model was saved as the app's picture with the `.glb` inside, so Word no longer saw a
    3-D model.
- **What changed:**
  - `model-views.ts`: `wordModelPose` and `wordModelRot` turn Word's `am3d:rot` into the viewer's yaw, pitch and
    roll and back. Word looks at the model from the front and turns it about x, then y, then z (`Rz·Ry·Rx`); the
    front is then faced to the viewer's camera, as for the named views.
    - Found by drawing the real model in all 48 orders and signs and comparing each outline with Word's own picture:
      Rz·Ry·Rx with Word's signs overlaps 84%, the next best 77%.
  - `inlines.ts`: a model opens at that pose. Turned in the app and saved, it goes back as Word's drawing with the
    new `am3d:rot`, and the app's picture of it replaces Word's raster and fallback picture (`addPicture`, shared
    with new pictures). Resized or moved, it is still saved as the app's picture.
  - `three-d-viewer.ts`: a loaded model with animations stands as the first frame of its first one, as Word shows it.
- **Tests:**
  - `model-views.test.ts`: Word's turn to pose and back; no turn is the model faced to the camera.
  - `model3d-import.test.ts`: opens at Word's pose; a turned save keeps `am3d:model3d` and the `.glb`, writes the
    new turn and a new picture, and reopens at the same yaw.
  - All 1141 tests pass.
- **Checked:**
  - The validator on `123.docx` with its model turned and saved: only the three chart errors Word's own file also has.
  - In Chrome, `123.docx`: the creature opens turned and posed as in Word's picture, legs apart and eye open.
- **Open:**
  - Word frames the model a little larger (its camera distance and `objViewport` are not used).
  - Word's lights (`am3d:ptLight`) are not used, and the animation is not played.
  - Not opened in Word after a turn.

### Table rows break across pages, and Fit text is drawn

- **What was wrong:**
  - A table row never broke across pages. A row that did not fit moved whole to the next page, and a row taller
    than a page ran off its foot. Word breaks a row inside its cells unless Allow row to break across pages is off.
  - Fit text (Table Properties → Cell → Options…) was saved to .docx but not drawn.
- **What changed:**
  - `pages.ts`: a row that runs past the page's foot and may break (`splittable`: not "cant split", cells holding
    only text and lists) is broken inside its cells (`splitRow`). Each cell breaks at its first line that does not
    fit and goes on at the top of the next page, and again for a row taller than a page. A row none of whose first
    lines fit starts the next page.
    - The break is one page break carrying a gap per cell (`PageBreak.cells`, drawn as `.page-gap-cell`).
    - Later layouts leave those gaps out when measuring rows (`rowStretch`, `outerHeight`).
    - A table that is a single row now breaks too.
  - `page-grid.ts` `cutSplitRows`: the band between the pages is cut out of the table with a mask, so its borders
    and shading stop at one page's foot. The row's cells draw their bottom border at the foot and again at the next
    page's top (`--row-cut`).
  - `table-fit-text.ts` (new): in a Fit text cell each paragraph stays on one line. Short text has its letter
    spacing widened to run the cell's width; long text is narrowed (`scaleX`) so its characters don't run into
    each other.
- **Tests:** `pages.test.ts` (`splittable`: text rows break; "cant split", pictures and nested tables don't). The
  layout needs a real browser. All 1139 tests pass.
- **Checked in Chrome:**
  - A two-cell row across pages 2 and 3: the long cell goes on at the top of page 3, the borders close and reopen,
    and the grey band is clear.
  - The same row with Allow row to break off: it moves whole to page 3.
  - A 160-line cell runs over five pages.
  - Typing in the broken cell keeps the layout steady.
  - Fit text: "Short" spaced across the cell, a long sentence narrowed into it.
- **Open:**
  - The header row is not drawn again above the part of a broken row on the next page.
  - A cell whose text is vertically centred or at the bottom is broken as if it were at the top.
  - Rows holding pictures or nested tables still move whole.
  - Not compared against Word.

### Line Numbers: Restart Each Section and Suppress for Current Paragraph

- **What was wrong:**
  - Layout → Line Numbers had no Restart Each Section or Suppress for Current Paragraph, as Word's menu has.
  - A Word section with `w:lnNumType w:restart="newSection"` opened as Continuous and was numbered straight on.
- **What changed:**
  - `PageSetup.lineNumberRestart` is now `"continuous" | "page" | "section"` (`lineNumberRestart()` normalizes
    it). The app's file header writes `aiword-lines:section`.
  - `.docx`: `newSection` opens as Restart Each Section and is written back as Word's `newSection`. Word's
    unchanged element is still kept as it was.
  - Drawing (`collectLineNumbers` in `pages.ts`): with Restart Each Section, numbering starts again at Start at
    after each section break.
  - The Line Numbers menu has Restart Each Section and Suppress for Current Paragraph. The latter toggles the
    paragraph's `suppressLineNumbers` (Word's `w:suppressLineNumbers`, already read and written) and shows as on
    when the paragraph at the cursor has it. The Line Numbers options dialog has a Restart Each Section choice.
- **Tests:** `line-numbers.test.ts` (newSection written and read back; kept in the app's own file header). All 1137
  tests pass.
- **Checked in Chrome:** four lines with a continuous section break after the third. Restart Each Section numbered
  them 1, 2, 3, 1, 2. Suppress for Current Paragraph on the first line dropped its number.
- **Open:** Word restarts per section by each section's own `w:lnNumType`. The app has one setting for the whole
  document, so a file where only some sections number lines opens with all of them numbered alike.

### Word's shapes: every preset opens as a shape, and floating shapes beside text open too

- **What was wrong:**
  - A Word shape whose preset the app has no drawing of opened as nothing but its text. About 140 of Word's 186
    presets are like that, among them callouts, math signs, flowchart symbols, ribbons, scrolls and gears.
  - A preset whose handles were moved in Word (a rounder corner, a callout's tail elsewhere) was drawn with the
    app's defaults.
  - A floating shape in a paragraph that had text did not open as a shape at all.
- **What changed:**
  - `src/document/docx/preset-geometry.json` (150 KB, 26 KB gzipped, in the lazily loaded `.docx` code) holds
    every preset's adjust values, guide formulas and paths from ECMA-376's presetShapeDefinitions. It is built by
    `docs/shapes/build-preset-geometry.mjs` from Apache OpenOffice's copy (Apache License 2.0).
  - `preset-geometry.ts` evaluates them at the shape's size:
    - all of DrawingML's formula operators and built-in guides;
    - arcs from visual angles, as Word draws them, turned into cubic curves;
    - paths with their own coordinate size;
    - the shape's own `a:avLst` values.
      The result is the app's freeform points.
  - `readWordShape`: such a shape opens as a freeform drawn from that outline, keeping its fill, outline, effects
    and text. Saved without changes it goes back as Word's own preset. After Edit Points or a resize it is Word's
    `a:custGeom`.
  - `shapePictureHtml`: a floating shape among a paragraph's text opens as the block before the paragraph, as
    floating pictures do. On saving it goes back to its place among the text. One in line with text still stays
    text.
- **Tests:**
  - `preset-geometry.test.ts`: guides, adjust values, arcs, a callout's tail, reading `a:avLst`, opening
    `cloudCallout`, an adjusted `roundRect`.
  - `shape-import.test.ts`: a Frame among text keeps its paragraph whole and saves back between the same words; a
    `wedgeRoundRectCallout` opens from its geometry and saves back as `prst="wedgeRoundRectCallout"`.
- **Checked in Chrome:**
  - All 186 presets drawn in a grid look as Word's.
  - A file with a Divide sign among text and an oval callout opens with both shapes and the paragraph whole.
- **Open:**
  - Not compared with Word side by side.
  - A shape drawn this way is a freeform in the app (Edit Points), not a preset with handles. Resizing stretches
    it instead of working out the guides again.
  - Parts Word only outlines (an arc, a connector's line) or only fills are drawn as the rest of the shape is.
  - A shape in line with text in a paragraph with text still opens as its text.

### Columns as in Word: Left and Right, a width and spacing per column, more than three columns, This point forward

- **What was wrong:**
  - Layout → Columns had One, Two and Three only, and the Columns dialog took one spacing for every column, up to
    three columns. Word's Left and Right presets, a width per column and "Equal column width" were missing.
  - A Word document with unequal columns (`w:cols w:equalWidth="0"` and its `w:col` widths) opened with equal
    columns and was saved back with them: the widths were lost.
  - The browser's columns are always equal, so unequal ones could not be drawn.
  - Apply to had no "This point forward" and "Start new column" was missing.
- **What changed:**
  - `src/document/column-widths.ts` (new): Word's presets (Left and Right: the narrow column is one of three equal
    columns, the wide one the other two and the space between, 1.83" and 4.17" on Letter), the most half-inch
    columns that fit (up to 12), page columns fitted to a changed text width, and editing one column's width or
    spacing (the next column gives or takes the difference; with equal columns the spacing gives way).
  - Page setup: `columns` is now 1–12 and `columnWidths` holds each column's width and the space after it when
    they are not equal. `.docx`: read from and written as `w:cols w:equalWidth="0"` with its `w:col` list (what
    Word wrote stays when the widths are unchanged); the app's own files keep it as `aiword-colwidths`.
  - Drawing (`pages.ts`): equal columns are still the browser's columns. Unequal ones are drawn block by block:
    the page layout picks each top-level block's column, measuring it at that column's width (with the DOM
    observer held), and the block is drawn across to its column and up to the column's top (`--col-x`,
    `--col-top`, `--col-w` on a `column-cell` decoration). The page gap after a page starts higher by as much. A
    paragraph or list that does not fit the rest of a column goes whole to the next one.
  - Columns dialog (`columns-dialog.tsx`) as Word's: the five presets as tiles, Number of columns, Line between,
    Width and spacing with a row per column, Equal column width, Apply to (Whole document, This point forward,
    Selected text), Start new column, and a preview at the columns' widths. This point forward puts the rest of the
    document into a block of columns, after a column break when Start new column is ticked.
  - Layout → Columns lists One, Two, Three, Left and Right with their glyphs and highlights the one in use.
  - The ruler shows unequal columns, and dragging a column marker resizes that column and the next. The page's
    column guides and Line between follow the widths, and a picture fits the column it is in.
- **Tests:** `column-widths.test.ts` (presets, fitting, resizing, ruler drag), `column-line.test.ts` (`w:col` written,
  read back, Word's widths kept, the app's header), `columns-dialog.test.tsx` (Left, unequal width edit, five
  columns, This point forward with Start new column), `page-setup.test.ts` (up to 12 columns).
- **Checked:**
  - In Chrome: Left, Right and equal Two on a 40-paragraph document. Each column starts at the page's top, page 2
    starts at its margin, and equal columns look as before.
  - The dialog and menu were looked at.
  - A saved Left file has 0 errors in the Open XML validator, and LibreOffice draws it with a narrow and a wide
    column and the line between.
- **Open:**
  - Not opened in Word.
  - In unequal columns a paragraph is never split between columns (Word splits it). One taller than a whole
    column runs on to the next page in the same column.
  - Tables keep their own width there. Blocks are measured afresh on every layout (no cache), which is slower on
    long documents.
  - Selected text and This point forward give equal columns only, and they are still not written to `.docx`.
  - Multiple Pages view draws any page columns wrongly: equal ones already did before this change.
  - Already happening before this change: React reports "an error during concurrent rendering" on every load.

## 2026-10-27

### Maps round 3: states and provinces of nine more countries, Best Fit on the mainland, Word's own Map kept

- **What was wrong:**
  - A Filled Map knew countries and US states only: Canadian provinces, Australian states or German Länder
    matched nothing.
  - Best Fit put a label at the centroid of the whole region and judged the fit by its bounding box, so France's
    label was pulled towards French Guiana and a region with islands looked roomier than it is.
  - Albers away from the United States drew nothing (`geoAlbersUsa` leaves out everything else), and with "Only
    regions with data" the neighbours were drawn whole, over the title.
  - Word's Map sits behind `Requires="cx4"`, which the reader did not understand: every Word map opened as Word's
    fallback picture, never as a map. Tests used cx1 fixtures, so nothing noticed.
  - An edited map was always saved as a picture, so a map from Word stopped being Word's map.
- **What changed:**
  - `src/editor/map-regions.json` (121 KB, loaded with the other outlines): Natural Earth's 1:10m admin-1 states and
    provinces (public domain) of Canada, Australia, Germany, Brazil, India, China, Mexico, South Africa and Japan,
    a TopoJSON per country simplified on its own scale, small islands left out. Each region has its English name,
    its other names ("Bayern", "Québec") and its ISO 3166-2 code ("BY", "ON", "NSW"; Natural Earth's own postal
    codes are wrong in places). Built by `docs/maps/build-map-regions.mjs` (`tools/` and `scripts/` are ignored).
  - `chart-map.ts`:
    - `matchRegion` and `regionCountries`;
    - `drawMap` picks the level most categories name (countries first on a tie, then US states, then a country's
      regions) and shows the whole country round them, as for US states;
    - Albers elsewhere is an equal-area cone fitted to the area shown;
    - `labelSpot`: the label goes on the region's largest piece (signed ring areas, so an outline cut at the
      antimeridian is not taken for a hole), at the point furthest inside on a 24-line grid, centred on the
      stretch across that line; the room is the stretch's width and twice the distance to the nearest edge.
  - `chart-spec.ts`: the map's shapes are clipped to the plot.
  - `mce.ts`, `chartex-xml.ts`: cx4 understood and written for a Map. `chartExXml` writes a Map: regions,
    `colorVal` values or `colorStr` text, Series Color (`valueColors`, `valueColorPositions` with `cx:mid`), label
    layout and the geography. The reader also takes `cx:mid` (Word's), not only `midPosition`.
  - `inlines.ts`: `wordMapRun` writes an edited Word map back as Word's Map, carrying Word's `cx:geography` with
    Bing's outlines (`cx:geoCache`) and the app's picture as the fallback, while every region is one Word had; a
    new region, or a map made in the app, is still a picture. `chartExChoice` is the chartex `mc:AlternateContent`
    for both.
- **Native Map without Word's cache (investigated, not done):** Word's outlines are Bing's binary data, which the
  app cannot make. `cx:geoCache` is optional in the schema, and Excel writers that leave it out report that Excel
  looks the regions up on Bing when the file opens, but that was not checked in Word, and offline Word would show an
  empty map where the picture shows one. So maps made in the app stay pictures.
- **Tests:** `chart-map.test.ts` (regions by name and code, Canada and Australia, countries win a tie, Albers in
  Germany; labels on France's mainland and outside Lesotho), `chartex.test.ts` (a Word Map behind cx4 opens as a
  map; changed, it is written back as Word's with its cache, cx4 and a picture fallback; a new region gives the
  picture). 1114 tests pass; the type-check and eslint are clean.
- **Checked:** two saved edited Word maps (diverging and two-colour, labels, Robinson, data only) pass the Open XML
  validator with no errors (the first try caught `minPosition`). Drawn in Chrome: Canada, Germany (Berlin and
  Hamburg included), Australia, Brazil, Germany on Albers clipped to the plot, and the world with labels inside
  their regions.
- **Open:** not opened in Word. No counties, UK nations, French or Spanish regions; Canada's labels are small at
  the default size, as its Arctic takes the room.

### Charts against Word's menus: Funnel's axes, the secondary axis, Primary Minor Vertical gridlines, chartex axes

- **What was wrong:**
  - Add Chart Element offered Funnel the same Axes, Axis Titles and Gridlines as a column chart; Word offers only
    Primary Vertical (the category names) and no axis titles or gridlines. The app also drew a value axis and
    gridlines on a new funnel.
  - There was no Secondary Vertical choice under Axes for a Pareto or a chart with a series on the secondary axis,
    so its right axis could not be hidden.
  - Gridlines had three choices; Word has four (Primary Major Horizontal, Primary Major Vertical, Primary Minor
    Horizontal, Primary Minor Vertical), in that order.
  - Word's chartex charts (Histogram, Pareto, Waterfall, Box & Whisker, Funnel) were written without the axes'
    `hidden`, their titles or gridlines, and those were not read back.
- **What changed:**
  - `chart-spec.ts`: `axes.secondary` (shown unless false) and `gridlines.minorVertical`; minor vertical
    gridlines are drawn between the major ones (category centres, or midway between a scatter chart's ticks); the
    secondary axis is left out when `axes.secondary` is false.
  - `chart-expand.ts`: a funnel draws no value axis, gridlines or axis titles.
  - `chart-menus.tsx` (`chartElements`): Funnel's Axes has only Primary Vertical, its Axis Titles and Gridlines
    are off; Secondary Vertical is offered when the chart is a Pareto or a series is on the secondary axis;
    Primary Minor Vertical added, the four in Word's order.
  - `chart-xml.ts`: the secondary value axis is `c:delete`d when hidden; the category axis writes
    `c:minorGridlines` for Primary Minor Vertical; both are read back.
  - `chartex-xml.ts`: each axis is written with `hidden`, its title (`cx:title`) and its major/minor gridlines;
    `readAxes` reads them back.
- **Tests:** `chart-menus.test.ts` (Funnel's menu; Secondary Vertical and the four gridlines), `chartex.test.ts`
  (axes, titles and gridlines round trip), `chart-docx.test.ts` (minor vertical gridlines and a hidden secondary
  axis round trip). 1111 tests pass; the type-check is clean.
- **Checked:** a saved .docx with a Pareto (secondary hidden, axis titles, all gridlines), a column chart with
  minor vertical gridlines and a hidden secondary axis, and a funnel passes the Open XML validator with no errors.
  Drawn in Chrome: the funnel with only its category names, the column chart's minor vertical gridlines, and the
  Pareto with and without its right axis.
- **Open:** not opened in Word. Secondary axis titles (Secondary Horizontal/Vertical under Axis Titles) and the
  Data Labels choices for the chartex kinds were not compared with Word.

### Customize Ribbon round 2: Reset ▾, a main tab's own groups, the user's groups on the single line

- **What was wrong:**
  - Reset put back everything at once.
  - A main tab's own groups were listed greyed and could not be removed or moved.
  - On the single line ribbon, the user's groups sat off the end of the row (portalled into a toolbar that
    clips), and the user's tabs were drawn as classic groups.
- **What changed:**
  - Reset ▾ (`customize-dialog.tsx`), as in Word:
    - Quick Access Toolbar page: Reset only Quick Access Toolbar, Reset all customizations;
    - Customize Ribbon page: Reset only selected Ribbon tab (off for a tab the user made), Reset all
      customizations.
    - The tree's selection moved up into the dialog for this.
  - `ribbon-layout.ts`:
    - `hiddenGroups` and `groupOrder` per main tab; the tab's own groups are named `own:<name>` by their
      `data-group`.
    - `groupKeys` gives the tab's groups in order; groups it does not know yet go at the end.
    - `moveItem` and `newGroup` place groups among the tab's own; `removeItem` removes one of the tab's own.
    - `resetTab` puts a main tab back.
    - All of it is saved, exported and read back.
  - Tree: under a main tab its groups are listed in ribbon order, the tab's own (by caption, from the last classic
    drawing, `tabGroups`) and the user's together; the tab's own can be selected, moved and removed, not renamed.
  - Classic ribbon (`MainTabGroups`): CSS `order` puts the tab's groups in the order given, and removed groups are
    hidden. A MutationObserver keeps this when a group collapses or expands with the width.
  - Single line:
    - `SingleLineBar` reads the tab it is on (`RibbonTabContext`), leaves out removed groups and adds the user's
      groups as line commands (16 px icons, kept on the row before the tab's least used);
    - the user's tabs draw as a single line (`CustomTabLine`);
    - Home's Find and Add-ins line groups carry the classic names, so removing Editing removes Find.
- **Tests:**
  - `ribbon-layout.test.ts`: a new test for moving, removing and resetting a main tab's own groups.
  - `customize-dialog.test.tsx`: the three Reset choices.
  - Full suite: 1107 passing.
- **How checked:**
  - Chrome, classic ribbon:
    - Home's groups listed;
    - Font moved after Paragraph, Editing removed, a group of the user's moved up to after Clipboard;
    - the ribbon shows Clipboard, Quick, Paragraph, Font, Styles, Add-ins.
  - Chrome, single line: Find left out, the user's Save and Bold on the row, and the user's tab as a single line.
- **Open:**
  - The single line has groups of its own, so only removal (where the names match) carries over to it, not the
    order.
  - Built-in groups cannot be renamed, and a removed one comes back only through Reset.
  - "For this document" (a toolbar kept in the .docx, Word's customUI part) is not done.

### Word's text boxes open as text boxes; linked boxes saved as Word's chains

- **What was wrong:** a Word text box (`wps:wsp` with `txBox="1"`) opened as a grey atom showing its text in the
  line, which could not be edited. The app's own text boxes were saved as pictures, so Word could not edit them,
  and linked boxes reached Word as unlinked pictures.
- **What changed:**
  - Reading (`wml-read.ts`): a drawing whose text box holds only paragraphs of text keeps them (`boxParagraphs`);
    a box later in a chain (`wps:linkedTxbx`) gets none. A box holding a table, a picture or a content control
    stays whole, as before.
  - `src/document/docx/word-text-box.ts` (new):
    - `readWordTextBox`: fill, outline (colour, weight, double line, dash), gradient and effects through the
      shape reader (`readShapeLook`, split out of `readWordShape`), margins, Align Text (`anchor`), Text Direction
      (`vert`), Do not wrap, Resize shape to fit text, and the chain (`wps:txbx id`, `wps:linkedTxbx id seq`).
    - `wordTextBoxGraphic`: the app's box as Word's own (`txBox="1"` rectangle, `wps:txbx` or `wps:linkedTxbx`,
      `wps:bodyPr`), when Word draws it the same way; picture or texture fills, text fill/outline/effects, bevel
      and 3-D rotation still go as the picture.
    - `textBoxMark`: the formatting and text a box opened with, to tell on save whether it was changed.
  - Projection (`inlines.ts`): the box opens as a picture carrying the text box, its text as HTML read into it
    on restore (`object-pictures.ts`), at Word's size and place. The first box of a chain gets the whole text and
    flows it on into the others, as in Word.
  - Saving: an unchanged box (same mark, size, place and turn) goes back as Word wrote it, VML fallback and all.
    A changed or new box is written as Word's text box: each line a paragraph, in the box's alignment. Links and
    comment ranges inside are kept as plain text. A chain's text is put in its first box (`chainsAsWord`); the
    others are written as `wps:linkedTxbx`, numbered from 1000 for the app's chains.
  - A floating object goes back to its place among its paragraph's text while the text before it is unchanged
    (`placeFloats` in `project.ts`); before, it moved to the paragraph's start.
  - Text boxes:
    - Align Left, Center, Right and Justify now work on the box's text (TextAlign covers `textBox`);
    - they keep their source run (`docxKey`);
    - DrawingML preset colours (`a:prstClr`, such as Word's black text box outline) are read.
- **Tests:** `word-text-box.test.ts` (4): the attribute reading; Word's f14 box opened, then saved untouched in
  place; an edited box saved as Word's own with its new text and centring, opened again; a chain saved as Word's
  and opened linked.
- **How checked:**
  - Full suite: 1106 passing.
  - Chrome:
    - f14's box opens as a 200 × 80 text box;
    - an app chain saved and reopened flows the same words into each box;
    - the Open XML validator reports 0 errors on the saved file.
- **Open:**
  - A text box holds one paragraph in the app, so Word's paragraphs come in as lines. Only the first paragraph's
    alignment is kept, and paragraph spacing and styles inside are lost once the box is edited.
  - VML-only text boxes (`w:pict`, from Word 2007 and earlier) stay whole.
  - Not opened in Word yet.

### Customize Ribbon: New Tab, New Group, Rename, moving commands, Commands Not in the Ribbon

- **What was wrong:** the Customize Ribbon page only had a check box per main tab. There was no New Tab, New
  Group, Rename or moving, and no "Commands Not in the Ribbon" list.
- **What changed:**
  - `src/document/ribbon-layout.ts` (new): the user's tabs (`CustomTab`, placed after a main tab), groups on main
    tabs (`customGroups`) and names for main tabs (`tabNames`), with pure operations:
    - `newTab` (with a New Group, straight after the selected tab), `newGroup`;
    - `renameItem` (a blank name gives a main tab its own back);
    - `addToGroup` (after the selected command, once a group), `removeItem` (only what the user made);
    - `moveItem`: commands within a group and over its edge into the next group, groups within the tab, the
      user's tabs past the main tabs but never before Home;
    - `tabOrder`, and `readLayout`, which drops bad shapes and commands that are gone.
  - `customize.ts`:
    - the customization holds the layout, saved with the rest;
    - exported as format version 2 (version 1 files still import);
    - a ribbon command's look is kept while a group or the toolbar holds it (`usedLooks`).
  - The Customize Ribbon page (`customize-dialog.tsx`, 720 px wide):
    - "Choose commands from" with "Commands Not in the Ribbon" (the toolbar's commands on no tab; also on the
      Quick Access Toolbar page);
    - Add and Remove;
    - a tree of tabs with show check boxes, expanding to the tab's own groups (greyed, read from the ribbon) and
      the user's groups and commands, marked "(Custom)" as in Word;
    - New Tab, New Group, Rename… (an inline Display name box: Enter keeps, Esc gives up) and Move Up/Down.
  - `word-dialog.tsx`: the dialog frame leaves Esc to an element marked `data-own-escape`.
  - Ribbon:
    - The tabs follow `tabOrder` with the names given.
    - The user's tabs are drawn by `custom-groups.tsx`; groups on a main tab are portalled to the end of that
      tab's toolbar.
    - A ribbon command in a user's group presses the ribbon's own button, as the toolbar does.
    - The quick commands run as they do on the toolbar.
    - `ribbon-commands.ts` leaves the copies (`data-group="custom:…"`) out of `ribbonCommandAt` and `buttonFor`,
      so a copy never presses itself.
- **Tests:** 1102 in all.
  - `ribbon-layout.test.ts` (new, 5): order, rename, add, the moves, remove, read and export.
  - `customize-dialog.test.tsx`: New Tab, Add from Commands Not in the Ribbon, Rename with Esc and Enter, kept on
    OK; the check box test now uses "Show Review".
  - `customize.test.ts`: version 2.
- **How checked (headless Chrome):**
  - Commands Not in the Ribbon lists New, Open, Save, Save As, Print, Undo, Redo, Ask AI.
  - A new tab after Insert with Bold (from Home) and Save, renamed "My Tools"; Bold there bolds the selection.
  - A new group on Home with Print, at Home's end.
  - Review renamed "Check"; the tab row reads Home | Insert | My Tools | Design | Layout | References | Check |
    View | Help | AI Tools.
  - Reopening shows the tree.
  - Esc in Rename keeps the dialog open; a second Esc closes it.
- **Open:**
  - "For this document".
  - Moving or hiding a main tab's own groups.
  - "Reset only selected Ribbon tab".
  - Custom groups in the single line ribbon are drawn as classic groups.
  - Not checked in the desktop app.

### Filled Map: US states, diverging colours, values as text, Best Fit labels

- **What was wrong:**
  - Filled Map drew countries only.
  - The colour scale had two colours only.
  - A value typed as text became 0.
  - Map labels were None or Show all; Word also has Best Fit.
- **What changed:**
  - `chart-map.ts`:
    - The US states (`us-atlas` states-10m, the 50 states and DC) load with the countries, in their own build chunk
      (114 kB).
    - `matchState` matches a state's name, its postal code ("TX") or "Washington DC".
    - The map draws states when more categories name a state than a country, as Word picks the data's level
      (Georgia is then the state).
    - The new Albers projection (`geoAlbersUsa`, Alaska and Hawaii moved in) is Automatic for states, which show
      the whole country unless Only regions with data is chosen.
    - Each region's drawn size is returned for Best Fit.
  - `chart-spec.ts`:
    - `ChartSeries.texts` holds values typed as text.
    - `mapDiverging`, `mapMidpoint`, and `mapColors.mid` (default `#ffeb84`); `mapColorOf`, `mapMidpoint` and
      `mapTextValues`.
    - The painter colours text values one colour per different text, from the chart's colours, with a legend of
      swatches in place of the scale.
    - The diverging scale goes through the Midpoint colour at the midpoint (halfway unless set), with a third
      gradient stop in the legend.
    - Best Fit writes a label only where it fits inside the region's bounds.
  - `chart-sheet.ts`: `ChartSheet.texts`. `gridToSheet` keeps cells that are not numbers, `sheetToGrid` shows them
    again, and `specToSheet`/`withSheet` carry them, so text typed in Edit Data stays.
  - Format pane Series Options:
    - Albers in Map projection; Best Fit only in Map labels;
    - Series Color Sequential (2-color) or Diverging (3-color), with Midpoint colour and Midpoint value (Auto);
    - a note in place of the colours when the values are text.
  - `chartex-xml.ts` reads Word's map:
    - `cx:valueColors` (min, mid, max) and `cx:valueColorPositions count="3"` with the midpoint as a number or a
      percentage;
    - `strDim type="colorStr"` text values;
    - `regionLabelLayout bestFitOnly`.
- **Tests:** 1096 in all.
  - `chart-map.test.ts`: states and Albers, the diverging colours (and the gradient stop), text colours and
    legend, the sheet round trip, Best Fit against Show all.
  - `chartex.test.ts`: reading Word's diverging colours, midpoint, text values and Best Fit.
- **How checked:**
  - Headless Chrome: seven states on a diverging scale with Best Fit names, Alaska and Hawaii under the others;
    the same as West/South/Northeast/Midwest text values with a bottom legend of swatches; the pane shows the
    category note.
  - Open XML SDK validator: 0 errors on a saved text-valued state map (saved as its picture).
- **Open:**
  - Word's percentage midpoint is read as 0–1 or 0–100, as the format's scale was not checked against a file
    from Word.
  - No counties, provinces or other countries' regions.
  - The text values and diverging scale go to Word only inside the picture's own copy of the chart.

### Charts: what Word's 2016 kinds offer, Waterfall colours in the fallback, 3-D pie Height

- **What was wrong:**
  - Add Chart Element and Chart Elements (+) offered Error Bars, Data Table and Trendline on Histogram, Waterfall,
    Funnel, Box & Whisker, Treemap, Sunburst and Map, which Word does not.
  - Treemap and Sunburst also offered Axes, Axis Titles and Gridlines.
  - The Format pane offered Trendline and Plot on secondary axis on them.
  - A Waterfall point's own colour was only in the chartex part: the ordinary chart other programs show drew
    the bar in its series colour.
  - 3-D pie had no Height.
- **What changed:**
  - `chart-spec.ts`: `chartHasAxes` (no axes on pie, doughnut, map, treemap or sunburst; `chartParts` uses it) and
    `isStatisticChart` (Word's 2016 kinds and the map).
  - `chart-menus.tsx` `chartElements` disables Axes, Axis Titles and Gridlines without axes, and Error Bars, Data
    Table and Trendline on those kinds.
  - `chart-format-pane.tsx` hides Trendline and the secondary axis there.
  - `chart-xml.ts`: the stacked-column Waterfall writes a `c:dPt` for each bar with its point's own fill (from
    `pointColumns`).
  - 3-D pie Height (% of base) is the rim's thickness:
    - drawn by `pie3d`;
    - written as `c:hPercent` between `rotX` and `rotY`, and read back;
    - in the 3-D Rotation section, with no Autoscale (a pie's axes are never at right angles).
- **Tests:** 1092 in all.
  - `chart-menus.test.ts` (new): what Add Chart Element offers per kind.
  - Fallback `c:dPt` in `chartex.test.ts`.
  - Pie `hPercent` write/read in `chart-docx.test.ts`.
  - Rim thickness against the radius in `chart-spec.test.ts`.
- **How checked:**
  - Headless Chrome: a Treemap's Add Chart Element greys out Axes, Axis Titles, Data Table, Gridlines and every
    line element; a 3-D pie's Height field set to 250% draws a thicker rim.
  - Open XML SDK validator: 0 errors on a saved 3-D pie at 250% and a Waterfall with a coloured point.
- **Open:** not compared with Word's own menus per kind (Funnel's single axis, Histogram's gridline choices).

### Linked text boxes: deleting, copying, the right-click menu and undo

- **What was wrong:** deleting a box in the middle of a chain lost the text it held. A copied box was pasted still
  in its chain, so two boxes claimed the same place. Create Link was only on the ribbon. Typing that a flow carried
  into the next box undid in two steps, as history only groups typing next to the last.
- **What changed (`src/editor/text-box-link.ts`):**
  - `keepDeletedText`, run from the `TextBoxFlow` plugin's `appendTransaction` when a step deletes a whole linked box.
    The deleted box's text goes to the end of the box before it in what is left of the chain, or to the start of
    the first box left when none is before. A chain left with one box is unlinked. The flow then spreads the text
    again. Moving a box (deleted and put back with the same place) changes nothing. Undo and redo are left alone,
    as they bring their own steps back.
  - `unlinkSlice` in `transformPasted`: a pasted box stands alone. A box dragged within the document keeps its link.
  - One undo step for typing that crosses boxes. The plugin state notes when a chain's text was last typed or
    flowed. Typing in a chain within 500 ms of that joins the same undo step, via `appendedTransaction` set in
    `filterTransaction`. `asFlow` (exported for the tests) marks a flow.
  - Right-click menu on a text box (`object-context-menu.tsx`): "Create Text Box Link", or "Break Forward Link"
    when the box passes its text on, as in Word.
- **Tests:** three in `text-box-link.test.ts` (1091 in all):
  - deleting the middle box and then the first;
  - a copied box's attributes;
  - the crossing undo, which fails without the grouping.
- **How checked:** headless Chrome, three boxes linked from the right-click menu:
  - typing ran into the second box and undid in one Ctrl+Z, and redo brought it back;
  - deleting the middle box kept its text, and undo brought the box back;
  - a pasted copy was unlinked.
- **Open:** Word's own linked boxes (`wps:linkedTxbx`) are not read, as Word's text boxes open as shapes with
  text, not as the app's text boxes.

### Map charts: Filled Map

- **Missing:** Insert Chart had no Map. A Word document's map chart (`cx:regionMap`) opened only as its fallback
  picture.
- **Changed:**
  - **Map → Filled Map** in Insert Chart and Change Chart Type, in Word's place (after X Y). The sample is sales by
    country.
  - **Drawing.** Each category names a country, matched by its own name or a common other one (USA, UK, Czech
    Republic, DR Congo, Ivory Coast, with or without a leading "the", case, accents or punctuation).
    - Countries are coloured by value from the Minimum colour to the Maximum: unset, a pale and the full series
      colour.
    - The countries around them are drawn in grey, and the legend is the colour scale with the lowest and highest
      values (vertical at the side, horizontal above or below).
    - Data labels put the value on each country, and Map labels the name.
    - Each country is a point: it can be picked and filled on its own.
    - Names that match no country are left out.
  - **Options** (Format Data Series → Series Options):
    - Map projection: Automatic, which is Miller for the whole world and Mercator for a part; Mercator; Miller;
      Robinson.
    - Map area: Automatic or Only regions with data (fitted to the countries with data), or World (without
      Antarctica unless it has data).
    - Map labels: None or Show all.
    - Series Color: Minimum and Maximum.
    - The pane shows no trendline and no secondary axis for a map, and Chart Elements shows no axes.
  - **Outlines:** Natural Earth's countries at 1:110m, from the `world-atlas` package (177 countries), turned into
    shapes with `topojson-client` and projected with `d3-geo` (all ISC; the data is public domain).
    - The outlines are a separate 108 KB file (40 KB gzipped), loaded the first time a map is drawn. Until then the
      chart shows "Loading map…", and every map on the page and in the gallery is drawn again once they arrive
      (`onMapCountries`).
  - **.docx:**
    - A map is saved as its picture, carrying the chart, and opens as the map again. Word's own map chart needs
      Bing's geography data in the file.
    - Word's map charts are read: data, projection, area (`viewedRegionType`) and labels. An unchanged one goes
      back to Word as it came.
  - Files: `src/editor/chart-map.ts` (outlines, name matching, projections, `drawMap`), `filledMap` and
    `mapColors` in `src/editor/chart-spec.ts`, `src/document/docx/chartex-xml.ts`, `src/document/docx/inlines.ts`,
    `MapOptions` in `src/components/chart-format-pane.tsx`.
- **Tests:**
  - `chart-map.test.ts`: "Loading map…" then the drawing; a point per country; the scale; colours along it; a
    point's own fill; name matching; unmatched names; area; each projection.
  - `chartex.test.ts`: Word's `regionMap` read with its options; a map saved as a picture and reopened as the
    same chart.
  - `chart-spec.test.ts`: every variant now includes the map. All 1088 tests pass.
- **Checked:**
  - In Chrome, Insert Chart → Map showed the Filled Map preview, and OK inserted it.
  - Format Data Series set Robinson, World and Show all, and the names appeared on the countries. The part list
    named each country.
  - The production build puts the outlines in their own chunk. The Open XML validator reports 0 errors on a
    saved map.
- **Open:**
  - No states, provinces or postal codes: countries only.
  - No Albers projection.
  - No category (text) values: values are numbers.
  - No Diverging (3-color) scale.
  - No Best Fit labels.
  - Small countries are missing at 1:110m.
  - Word sees a picture, not its own map chart.

### Customize the Ribbon and Quick Access Toolbar: Import/Export

- **Missing:** Word's Import/Export was not in the dialog. The desktop app could not write a settings file:
  `write_document` takes document types only.
- **Changed:**
  - The dialog has an **Import/Export ▾** button beside Reset, with Word's two items.
  - **Export all customizations** saves the toolbar, the tab choices, the toolbar position and labels, and the
    ribbon buttons on the toolbar to `Inkspire Customizations.json`, marked as one (`exportCustomization`).
  - **Import customization file** reads such a file through the same checks as a saved arrangement. Unknown
    commands are dropped (`importCustomization`), and another JSON file is refused with a note. What is imported
    fills the dialog; OK keeps it and Cancel does not, so nothing changes behind the user's back.
  - Desktop app: two new Rust commands, `read_settings_file` and `write_settings_file`. Their path check
    (`assert_settings_path`) allows only an absolute `.json` path without `..`. Reads stop at 4 MB, and writes go
    beside the file first, then rename, as documents do. The document commands are unchanged.
  - Browser: export downloads the file, and import uses the file picker (`saveSettingsFile`, `openSettingsFile`
    in `src/lib/file-io.ts`).
  - Escape on a menu opened from a dialog now closes the menu, not the dialog (`word-dialog.tsx`).
- **Tests:**
  - `customize.test.ts`: round trip, other JSON refused, unknown commands dropped.
  - `customize-dialog.test.tsx`: export, import kept only on OK, a wrong file noted.
  - Rust: `settings_files_are_json_only`.
- **Checked in Chrome:** Export downloaded the file with the toolbar's commands. Importing an edited copy showed
  Undo, Redo, a separator and Print in the dialog, and OK hid the Review tab as the file said. All 1084 tests
  pass, and the Rust test passes.
- **Open:**
  - Not tried in the desktop app (the native file dialogs and the new commands).
  - The file is the app's own JSON, not Word's `.exportedUI`.

### Text boxes: Create Link and Break Link

- **Missing:** Shape Format → Text → Create Link was always greyed out. Text could not flow from one text box to
  another.
- **Changed:**
  - **Create Link** (enabled on a text box) gives the pointer a link cursor. The next click on an empty text box
    in no chain links it; Escape or a click elsewhere gives up. As in Word, the target must be empty and unlinked,
    and a box whose height followed its text keeps the height it had.
  - On a box that passes its text on, the button is **Break Link** (with its own icon). That box keeps the text
    from the boxes after it, clipped. Those boxes are emptied and stay linked to each other if two or more are left.
  - **Flow:** each box holds the share of the chain's text that fits in it, so text is typed and selected where
    it is seen. After every change, and when fonts load or the window resizes, the chain is flowed again: text
    that no longer fits moves on, and text that fits again comes back.
    - The break falls at the start of a word, found by halving with an off-screen probe drawn like the box.
    - The cursor goes with the text it was in.
    - The last box clips the rest (`overflow: clip`, so it does not scroll to the caret).
    - Each reflow joins the change that caused it in the undo history (`appendedTransaction`), so undo and redo
      never show a half-flowed chain.
  - Files: `src/editor/text-box-link.ts` (chains, `canLinkTo`, `linkTextBoxes`, `breakTextBoxLink`,
    `flowBreaks`, `flowChain`, the `TextBoxFlow` extension and `startLinking`); `linkId`/`linkSeq` on the text box
    in `src/editor/objects.ts`; the ribbon in `src/components/ribbon/shape-format-tab.tsx`.
- **Tests:** `text-box-link.test.ts`:
  - which boxes can be linked, and the attributes and heights set;
  - breaks at word starts, a box that grows, a word longer than a box;
  - text and cursor moved, nothing to do when already flowed, text coming back;
  - undo of typing together with its flow;
  - Break Link.
- **Checked in Chrome:**
  - Two 180×90 boxes: Create Link, then a click on the second, linked them, and the button became Break Link.
  - Typing past the first box carried the text and the cursor into the second. The second clipped the end and
    showed its start.
  - Deleting text from the first box pulled text back.
  - Undo stepped back through the typing, the link and the first typing; redo replayed them.
  - Break Link put all the text in the first box.
  - All 1082 tests pass.
- **Open:**
  - Undo takes typing back in two steps when the cursor crossed into the next box.
  - Deleting a box in the middle of a chain loses its share of the text.
  - A copied box keeps its chain.
  - Word's own linked text boxes (`wps:linkedTxbx`) are not read. The app's text boxes go to Word as pictures,
    each with its share of the text, and reopen linked from the app's copy (not checked in a saved file).
  - Create Link is not on the right-click menu.

### 3-D charts: Height (% of base) and Autoscale

- **Missing:** a 3-D chart's Height could not be set, and Word's `c:hPercent` was lost on opening.
- **Changed:** Format Chart Area / Plot Area → 3-D Rotation adds Autoscale and Height (% of base), 5–500%.
  - They behave as in Word: Autoscale can be used only with Right Angle Axes, and Height is greyed while
    Autoscale is on. Unchecking Autoscale starts at 100%.
  - The chart's front is drawn as tall as that share of its width, centred in the room there is. If it would be
    taller than the room, it is drawn narrower instead. Reset clears Height too.
  - Saved as `c:hPercent` between `c:rotX` and `c:rotY` (none is Autoscale) and read back, except for 3-D pie.
  - `heightPercent` and `chartView3d(...).height` in `src/editor/chart-spec.ts`; `src/document/docx/chart-xml.ts`;
    `src/components/chart-format-pane.tsx`. `NumberField` and the pane's `Check` take `disabled`.
- **Tests:**
  - `chart-spec.test.ts`: Height clamped; a low Height draws a flatter front; too tall draws narrower.
  - `chart-docx.test.ts`: `hPercent` written in place, read back, and absent for Autoscale.
- **Checked:**
  - In Chrome, on a 3-D Clustered Column: Autoscale was on with Height greyed. Unchecking it and typing 40 set
    it. Turning off Right Angle Axes greyed Autoscale and left Height on.
  - The Open XML validator reports 0 errors. All tests pass.
- **Open:**
  - 3-D pie has no Height (Word's thickness).
  - How tall Word draws a given Height was not compared in Word.

### Edit Points: the box grows while dragging

- **Wrong:** while a point, curve handle or segment was being dragged, the outline was drawn outside the shape's
  old box. The box, its handles and the text around it only caught up on release.
- **Changed:** each move writes the shape with its box fitted to the outline, as on release, so the box grows and
  shrinks while dragging (a floating shape's corner moves too, so the point stays under the pointer). These moves
  are not undo steps. On release the shape is put back as it was and the whole drag is written as one step. The
  drag is measured in the box it started in (`press`, `preview`, `release` and `fitted` in
  `src/editor/edit-points.ts`).
- **Tests:** `edit-points.test.ts`: a point dragged 50 then 60 pixels out of a 100-pixel box makes it 150 tall
  during the drag and 160 after, Edit Points stays on, and one undo gives back the shape as it was.
- **Checked in Chrome:** a floating triangle's top point dragged 70 pixels up grew the box to 160 then 170 pixels
  during and after the drag, the point under the pointer; one Ctrl+Z restored it. All 1076 tests pass.
- **Open:** an inline shape grows down from its line, as Word's does, so the dragged point is not under the
  pointer while it grows.

### Waterfall Set as total, Box & Whisker options, colours in Word's chartex charts

- **Missing:**
  - A Waterfall point could not be set as a total; the app always added its own total after the last point, and
    Word's totals in the middle of a chart were dropped (only a last one was understood).
  - Waterfall bars could not be picked or coloured one by one, and a bar below or across zero was drawn from zero.
  - Box & Whisker had no Series Options: inner points, outlier points, mean markers and mean line were fixed, and
    quartiles were always exclusive.
  - The chartex part had no colours, so Word drew a Waterfall in its theme colours, not green and red.
- **Changed:**
  - `waterfallTotals` on the chart: each point set as total stands from zero to its value, and the running total
    goes on from it. A chart from before has none set and keeps its added total. Setting one on such a chart
    first makes that total a row of its own, so the chart looks the same (`setWaterfallTotal`). The Waterfall
    sample now has its Total as a row set as total, as Word's does.
  - A Waterfall's bars are its points (`pointColumns` on the drawn chart). Click one: Format Point shows "Set as
    total", and its Fill colours that bar. Bars below zero hang from their top, and one across zero is drawn as a
    piece each side (two more series in the drawn chart, only when needed).
  - Format Data Series on a Box & Whisker: Show inner points, outlier points, mean markers, mean line, and
    Inclusive or Exclusive median (`box`, `boxOptions`; `boxStats` takes the method and returns the inner
    points). The mean line joins each series' means.
  - chartex: totals written as `cx:subtotals` and read back (all of them, the rows kept). Box options as
    `cx:visibility` and `cx:statistics quartileMethod`, read back where they differ from Word's. A series' fill as
    `cx:spPr`. A Waterfall's points each get a `cx:dataPt` with the colour the app draws (green, red, grey, or the
    point's own); on reading, only colours other than those come back. Hidden series and rows are left out and
    the colour keys move with them (`chartExData`).
  - Opening: a chart from before Set as total still opens as the app's own chart (its data is compared with
    `chartExData` too), in `src/document/docx/inlines.ts`.
  - Files: `src/editor/chart-spec.ts`, `src/editor/chart-expand.ts`, `src/document/docx/chartex-xml.ts`,
    `src/components/chart-format-pane.tsx`.
- **Tests:** `chart-expand.test.ts` (totals in the running total, below and across zero, Set as total on an old
  chart, bars as points with their own fill, inclusive quartiles, inner points, each Box option drawn);
  `chartex.test.ts` (totals, dataPt colours, Box options and series colour written and read back, colour keys
  after a hidden series). All 1075 tests pass.
- **Checked:** in Chrome, clicking the Waterfall's "Returns" bar selected Point "Returns"; Set as total drew it
  from zero (−15) and the bars after it floated from −15 across zero. Box & Whisker with inner points, mean line
  and inclusive median drew them. The Open XML validator reports 0 errors on a document with these charts, and
  LibreOffice draws the fallbacks.
- **Open:** the fallback chart has no per-point colours. Word itself was not used to look at the result. Data
  labels on a Waterfall bar across zero label its two pieces.

### Edit Points: drag the outline to bend it

- **Missing:** only a segment's curve handles could bend it; Word also lets the line or curve itself be dragged.
  A plain press on the outline did nothing in Edit Points.
- **Changed:** dragging the outline bends that line or curve. The point grabbed follows the pointer, and both
  handles move to make it so, the nearer one more. A straight line, or a close's line, becomes a curve first.
  Ctrl+click still adds a point, and the outline's cursor is now the move cursor (`bendSegment` in
  `src/editor/shape-points.ts`; `onOutlineDown` in `src/editor/edit-points.ts`).
- **Tests:** `shape-points.test.ts`: a line bent through the dragged point with its ends in place; a curve
  grabbed a quarter of the way along; a close's line made a curve of its own.
- **Checked in Chrome:** dragging a rectangle's bottom edge 40 pixels down bent it into a curve, the box grew to
  fit, and Edit Points stayed on. All tests pass.

### Pie of Pie "Other" label and Gap Width; 3-D Depth, Right Angle Axes and Perspective

- **Missing:**
  - Pie of Pie's Other slice had no category name in its label.
  - The gap between the two plots was fixed.
  - A 3-D chart's Depth, Right Angle Axes and Perspective could not be set, and Word's values were lost on
    opening.
- **Changed:**
  - Other's label reads "Other", as in Word.
  - Gap Width (0–500%, 100 unset) in Format Data Series moves the second plot out. The two plots are now laid out
    together and centred (`ofPieGap`). It is saved as `c:gapWidth` and read back.
  - Format Chart Area / Plot Area → 3-D Rotation adds Right Angle Axes, Perspective (shown when the axes are not
    at right angles, with a note that it is drawn here without perspective) and Depth (% of base), which is
    drawn. Reset clears them too.
  - Word's own view is the default (`chartView3d`): right-angle axes except for "deep" charts and 3-D Line,
    perspective 15°, depth 100%. Saved in `c:view3D` (`depthPercent`, `rAngAx`, `perspective` in half degrees)
    and read back only where they differ.
- **Tests:**
  - `chart-spec.test.ts`: the Other label; the gap moves the second plot; view defaults and limits; Depth draws
    deeper.
  - `chart-docx.test.ts`: the view written and read back, defaults left unset, the gap round trip.
  - All tests pass.
- **Checked:**
  - Chrome: Depth 200 and Right Angle Axes from the pane (Perspective hides), and Gap Width 300 on a Bar of Pie.
  - Open XML SDK validator: 0 errors on a document with the new view settings, of-pie splits and gaps.
- **Still open:**
  - Perspective is not drawn.
  - Height (% of base) and Autoscale are not offered.

### Word's own chartex charts for Histogram, Pareto, Waterfall, Funnel, Box & Whisker, Treemap and Sunburst; Pareto

- **Wrong:**
  - These were saved only as the ordinary chart they look like (columns, stacked bars), so Word showed a plain
    column or bar chart, without its bins, quartiles or levels.
  - Word's own charts of these kinds did not open as charts: the reader skipped the `mc:Choice` that holds them.
  - There was no Pareto chart.
- **Changed:**
  - **Saving:** a chart of these kinds is saved as Word's chartex chart (`/word/charts/chartExN.xml`, its own
    relationship and content type, and a workbook with the data as typed). It sits in an `mc:AlternateContent`
    (`Requires="cx1"`, or `"cx2"` for Funnel) whose Fallback is the ordinary chart we wrote before, so LibreOffice
    and older Word still show it.
  - **What the chartex part holds:**
    - Histogram bins: aggregation for By Category; binning with `binSize` or `binCount` and the underflow and
      overflow limits.
    - Pareto: a `paretoLine` series on a percentage axis.
    - Waterfall: the total the app draws, as a last point marked as a subtotal.
    - Box & Whisker: exclusive quartiles. Treemap and Sunburst: their levels, innermost first.
    - Title, legend and data labels.
  - **Opening:** `cx1` and `cx2` are understood, so Word's chart is read from the chartex part (`readChartEx`). The
    app's own copy still wins while the data is unchanged. A Map is not read.
  - **Pareto:** a new variant under Histogram (Insert Chart, Change Chart Type). Bars run from the largest down,
    with a line of the running share on a 0–100% axis; Word's sample is binned by category.
  - Files: `src/document/docx/chartex-xml.ts` (new); `inlines.ts` (save and open); `mce.ts`; `chart-xml.ts`
    (the workbook can hold the raw data with level columns, and the fallback Pareto has a 0–100% second axis);
    `chart-spec.ts` and `chart-expand.ts` (Pareto).
- **Tests:**
  - `chartex.test.ts` (new): each kind written and read back as the same variant with the same data; each kind's
    layout; every bin setting; a chart as Word writes it (rich title, `auto` limits, no workbook; a Map read as
    nothing); the AlternateContent, relationship, content type and raw workbook in a saved document.
  - Opening its own charts as they were, and a file with the app's copy taken out, read from the chartex part.
  - `mce.test.ts` now expects the chartex Choice to be read rather than its fallback.
  - All tests pass.
- **Checked:**
  - Open XML SDK validator (Microsoft 365 schema): 0 errors on a document with every kind and bin setting. The
    first run found `binCount` and `axisId` written with a `val` attribute where the schema wants element text;
    fixed.
  - LibreOffice opens all of them from the fallback.
  - Chrome: Pareto in Insert Chart and drawn in the document.
- **Still open:**
  - Not opened in Word yet.
  - Fill colours and fonts are left to Word's chartex style (a Waterfall's green and red are not written).
  - A Waterfall's other "set as total" points are not read. Box & Whisker's mean line, inner points and
    quartile method are not options in the app.
  - Region Map is not read.

### Histogram bins, and Pie of Pie / Bar of Pie split by value, percentage or custom points

- **Missing:**
  - A histogram had fixed automatic bins: no bin width, number of bins, overflow or underflow bin, and no By
    Category. Its automatic count used Sturges' rule, where Word uses Scott's.
  - Pie of Pie and Bar of Pie split only by position and could not change the second plot's size.
  - Found while doing this: with a blank value, Histogram, Waterfall and Funnel paired values with the wrong
    categories, because the blank's category was not left out with it.
- **Changed:**
  - Format Axis on a histogram has Word's Bins section: By Category, Automatic, Bin width, Number of bins, and an
    Overflow and Underflow bin with their values. The boxes show the width and count in use.
  - Automatic is Scott's rule, as in Word. Each bin takes the values above its start up to its end, the first its
    start too; the overflow bin is labelled ">x" and the underflow bin "≤x". At most 500 bins are drawn.
    (`histogramBins`, `scottWidth`, `histogramValues` in `src/editor/chart-expand.ts`; `bins` on the chart.)
  - Format Data Series on Pie of Pie and Bar of Pie has Split Series By (Position, Value, Percentage value,
    Custom). Position has "Values in second plot", Value and Percentage have "Values less than", and Custom has
    "Point belongs to" on a clicked slice; Custom starts from the current split. Also Second Plot Size (5–200%).
    "Angle of first slice" is hidden there, as Word hides it.
  - The second plot takes the points in their own order wherever they sit. With nothing to put in it, the pie is
    drawn whole. (`ofPieSecond`, `ofPieThreshold`, `ofPieSize` in `src/editor/chart-spec.ts`.)
  - Saved as Word's `splitType` val, percent or cust, with `splitPos` or `custSplit`/`secondPiePt`, and
    `secondPieSize`; read back the same (`src/document/docx/chart-xml.ts`).
  - `numbers()` in `chart-expand.ts` keeps each value with its own category.
- **Tests:**
  - `chart-expand.test.ts`: Scott's rule, bin width, number of bins, overflow and underflow, By Category, the
    500-bin cap, and categories kept in step with blank values.
  - `chart-spec.test.ts`: each split mode, drawing by value, a pie drawn whole, and the second plot's size.
  - `chart-docx.test.ts`: the value, percentage and custom splits and the plot size written and read back.
  - All tests pass.
- **Checked in Chrome:**
  - Histogram: Number of bins 5 gave five bins of 3.9, and Overflow bin added ">23.5".
  - Bar of Pie: Values less than 2 put the two small quarters in the bar. Custom kept them, and a clicked slice
    went to the second plot with "Point belongs to". Second Plot Size 120% grew the bar.
- **Still open:**
  - Other's data label has no category name, where Word writes "Other".
  - Word's "auto" split opens as a split by position.
  - A histogram is still saved as a column chart (no `chartex`), so Word does not see its bin settings.
  - No Pareto chart.
  - Gap Width between the two plots is fixed.

### Edit Points: curve handles and Word's point and segment menus

- **Missing:** Edit Points could only move, add and delete points. There were no curve handles, no Smooth,
  Straight or Corner points, and no way to open or close a path or change a segment.
- **Changed:**
  - Clicking a point picks it and shows its curve handles, on lines out from the point. Dragging one bends the
    curve. A Smooth point's other handle turns to stay opposite at the same length, a Straight point's turns and
    keeps its own length, and a Corner point's stays put.
  - Right-clicking a point gives Delete Point, Open Path, Close Path, Smooth Point, Straight Point, Corner Point
    and Exit Edit Points. Smooth and Straight make the lines either side into curves, with the handles set along
    the way from the point before to the point after.
  - Right-clicking the outline gives Add Point, Delete Segment, Open Path (cut where clicked), Close Path,
    Straight Segment, Curved Segment and Exit Edit Points.
  - A point's kind is read from how its handles lie; one set from the menu is remembered while editing, so a
    Corner point whose handles happen to be in line still moves them apart.
  - Escape with the menu open closes only the menu.
  - Model: `src/editor/shape-points.ts` (`nearestSegment`, `startOf`, `figureOf`, `handlesAt`, `pointKind`,
    `moveHandle`, `setSegmentKind`, `setPointKind`, `openPath`, `closePath`, `deleteSegment`). Overlay:
    `src/editor/edit-points.ts`.
  - The ribbon's right-click menu moved into `src/components/command-menu.tsx` (`openCommandMenu`), so Edit
    Points can open it too.
- **Tests:** `shape-points.test.ts`: kinds read from handles; dragging handles for each kind; making a corner
  Smooth, including a closed figure's first point; straight and curved segments, including the close's line;
  opening and closing paths; deleting segments from closed and open paths.
- **Checked in Chrome:**
  - A rectangle's corner made Smooth. Dragging its handle moved the other one opposite, and Corner Point let one
    move alone.
  - On the outline: Curved Segment, Delete Segment (the path opened there) and Close Path.
  - Escape on the menu left Edit Points on, and Exit Edit Points ended it.
  - The Quick Access Toolbar's right-click menu still works.
  - All tests pass.
- **Still open:**
  - A segment cannot be dragged to bend it; only its handles can.
  - Point kinds are not saved: Word's file has no place for them, so they are read from the handles on opening.
  - Open paths are still filled, as Word fills them.

### 3-D Rotation for 3-D charts

- **Missing:** a 3-D chart was always drawn and saved at Word's default view (X 15°, Y 20°; a 3-D pie X 30°). A
  turned chart from Word opened at the default view and was saved back at it.
- **Changed:** `rotX` and `rotY` on the chart (`chartRotation` in `src/editor/chart-spec.ts` gives Word's view
  when they are unset, and keeps them in Word's ranges).
  - Drawing: a cartesian chart's depth follows the rotation, scaled from Word's view (Y sets how far the walls go
    to the side, X how far up). A pie flattens and thickens towards X 0° and is a circle at 90°; Y turns it.
  - Saving: `c:view3D` carries the chart's own `rotX`/`rotY`; reading keeps them only where they differ from
    Word's view (`src/document/docx/chart-xml.ts`).
  - Format Chart Area / Plot Area → Options has a 3-D Rotation section (X Rotation, Y Rotation, Reset) on 3-D
    charts (`src/components/chart-format-pane.tsx`).
  - Change Chart Type keeps the rotation for another 3-D chart of the same kind; a pie's view is not a column's.
- **Tests:** `chart-spec.test.ts` (defaults, ranges, drawing straight on and from above, Change Chart Type),
  `chart-docx.test.ts` (written into `view3D`, read back, Word's view left unset). All tests pass.
- **Checked in Chrome:** 3-D Column, Clustered Column, Area and Pie drawn at several rotations; X 40 / Y 60 typed
  in the pane turned the chart and was stored; Reset went back to 15 / 20.
- **Still open:** a view from below (X under 0°) or from the left (Y past 180°) is drawn straight on, since the
  walls are only drawn going back up to the right. No Perspective, Right Angle Axes, Depth or Height settings.
  Not opened in Word or LibreOffice.

### Edit Points: the box fits the outline

- **Wrong:** a point dragged outside a shape's box was drawn outside it, and a shape whose outline was pulled in
  kept its old box.
- **Changed:** after each change in Edit Points, the box is fitted to the outline as Word fits it
  (`fitPoints` and `pathBounds` in `src/editor/shape-points.ts`, used by the overlay's commit).
  - Curves are measured by how far they reach, not by their control points.
  - The points are spread over the new box, and the shape takes the new width and height.
  - A floating shape's corner (`x`, and `y` or `dy` by how it is anchored) moves so the points that were not
    dragged stay where they were on the page, whatever the shape's turn and flips. A position set by an
    alignment is left alone. An inline shape grows where it sits in the text.
  - A straight line keeps its box across it.
- **Tests:** `shape-points.test.ts`: no change when it fits; growing; shrinking; points that were not dragged stay
  put under three turns and flips; curve reach; a straight line.
- **Checked in Chrome:** dragging a triangle's top point up out of the box grew the shape from 72 to 92 pixels
  tall, with the outline filling it. Add, delete and undo still work. All tests pass.
- **Still open:** while dragging, the preview still draws outside the old box until the drag ends (done later the
  same day: the box grows while dragging).

### Edit Points: the resize and rotate handles step aside

- **Wrong:** while a shape's points were edited, its resize, rotate and move handles stayed on top of the point
  handles. A corner point sat under a resize handle and was hard to grab.
- **Changed:** the shape being edited is marked (`data-editing-points`, set by the Edit Points overlay in
  `src/editor/edit-points.ts`), and CSS hides its handles until Edit Points ends, as Word does.
- **Checked in Chrome:** none of the 9 handles show while editing a triangle's points, and all 9 are back after
  Escape. Drag, add, delete and undo still work. Dark mode was checked for this session's new UI (the toolbar below
  the ribbon, its right-click menu, Change Chart Type, Edit Points).

### Chart thumbnails read like Word's

- **Wrong:** the small chart pictures crammed the chart's text into a few pixels and squeezed its plot. This hit
  the Insert tab's Chart menu, the Chart Styles and Quick Layout galleries, and the Insert Chart and Change Chart
  Type tiles. They looked like smudges.
- **Changed** (`ChartThumb` in `chart-menus.tsx`):
  - A thumbnail is drawn as a chart at least 320 wide and shrunk to fit, so text and plot keep their share.
  - Under 140 pixels, each piece of text is drawn as a faint bar where it sits, as Word's gallery thumbnails do
    (`textAsBars`). The title, legend and labels still show where a layout puts them.
- **Tests:** `chart-thumb.test.ts` (bars placed by anchor, part, colour and turn kept; no text left in a drawn chart).
- **Checked in Chrome** (at 2× zoom): the Chart menu, the Insert Chart tiles, Chart Styles and Quick Layout. All 1035
  tests pass.

### Chart templates: Save as Template… and Templates in Insert Chart

- **Missing:** Word's chart templates. You could not keep a chart's type and look to use again.
- **Changed:**
  - **Save as Template…** on a chart's right-click menu: asks for a name and keeps the chart's type, elements, style
    and formatting under it. A template of the same name is replaced (`src/editor/chart-templates.ts`).
  - **Templates** in Insert Chart and Change Chart Type, after Recent. It shows each template drawn as it would
    come out, and has Delete Template. With none saved it says how to make one.
    - Inserting a template brings the data it was saved with (`insertFigure` now takes a chart's spec).
    - Applying one to a chart keeps that chart's data, titles and series names (`applyChartTemplate`). Each series
      takes the options of the template's series in its place (its type and axis in a combo, its trendline), and
      extra series take the last one's.
  - Templates are kept in this browser or profile, as Word keeps them in the user's Charts folder.
- **Tests:** `chart-templates.test.ts` (save, replace by name, delete, bad saved data ignored; applying keeps the
  data and takes the look and series options).
- **Checked in Chrome:** saved a restyled 3-D pie as "Quarterly", then used Change Chart Type → Templates on a
  column chart. It became the 3-D pie in style 3 with the column chart's data and title. All 1034 tests pass.
- **Still open:** no .crtx import or export, so templates do not move to or from Word. Insert Chart has no "Manage
  Templates" folder view (Delete Template stands in for it).

### Stock charts with Volume

- **Missing:** Word's Volume-High-Low-Close and Volume-Open-High-Low-Close stock charts.
- **Changed:**
  - **New variants:** both are in Insert Chart and Change Chart Type, with Word's sample data (a Volume column
    before the prices). The spec gets a `volume` flag.
  - **Drawing:** the first series is the volume, drawn as columns on the left value axis. The prices go on a second
    axis on the right, with high-low lines and the Close tick, or up/down bars with Open (`stock` in
    `src/editor/chart-expand.ts`).
  - **.docx:** written as Word writes it, a `c:barChart` of the volume on the first axes, then the `c:stockChart` on
    the second axes. A Word stock chart with a bar group before it opens as the Volume variant.
- **Tests:** `chart-expand.test.ts` (sample series; volume as columns and prices on the second axis; drawn with both
  axes and up/down bars; saved and read back as the same variant).
- **Checked:** all four stock variants drawn in Chrome. Both Volume charts saved to a .docx and opened in
  LibreOffice, which drew the volume columns on the left axis and the prices on the right. All 1031 tests pass.
- **Still open:** the volume columns use the app's default gap width, so they are a little narrower than Word's.
  Not opened in Word itself.

### Charts: the 3-D variants, Pie of Pie and Bar of Pie

- **Missing:** Insert Chart had none of Word's 3-D charts, and no Pie of Pie or Bar of Pie.
- **Changed:**
  - **New variants** in Insert Chart and Change Chart Type (`CHART_FAMILIES` in `src/editor/chart-spec.ts`):
    - **Column:** 3-D Clustered Column, 3-D Stacked Column, 3-D 100% Stacked Column, 3-D Column.
    - **Line:** 3-D Line.
    - **Pie:** 3-D Pie, Pie of Pie, Bar of Pie.
    - **Bar:** 3-D Clustered, Stacked and 100% Stacked Bar.
    - **Area:** 3-D Area, 3-D Stacked Area, 3-D 100% Stacked Area.
  - **The spec:** two new fields.
    - `threeD`: "front" for a chart drawn as it is but with depth; "deep" for 3-D Column, 3-D Line and 3-D Area,
      where each series is a row of its own, the first at the front.
    - `ofPie` ("pie" or "bar") and `ofPieSplit`, the number of last points drawn again (default half the points,
      at most three).
  - **3-D drawing:** an oblique view going back up to the right, as Word's default rotation.
    - The plot area becomes a back wall, a side wall and a floor, with gridlines running across the floor and
      along the back.
    - Bars are boxes with a lighter top and darker side. Areas get a top and an end. 3-D Line is a ribbon with a
      front edge.
    - Farther rows are drawn first.
  - **3-D Pie:** tilted 30°, with the rim showing at the front.
  - **Pie of Pie / Bar of Pie:** the first points and an Other slice facing the second plot, the last points as a
    smaller pie or a stacked bar, joined to Other by two lines.
  - **.docx** (`chart-xml.ts`): written as Word's own `c:bar3DChart` (shape box; grouping `standard` for a deep
    chart), `c:line3DChart`, `c:area3DChart`, `c:pie3DChart` and `c:ofPieChart`.
    - Each has `c:view3D` (perspective for a deep chart, right-angle axes otherwise, 30° for the pie) and the walls.
    - A deep chart also gets a `c:serAx`; a front chart's third axis id is 0, as Word writes.
    - An of-pie chart is split by position, with `splitPos`, `secondPieSize` 75 and `serLines`.
    - Word's 3-D and of-pie charts open as these variants, keeping Word's split.
- **Also fixed:** a lint error in `table-draw.ts` (an unused first value).
- **Tests:**
  - `chart-docx.test.ts`: each of the 12 saved and opened as the same variant; Word's elements, axes and view;
    the split kept.
  - `chart-spec.test.ts`: walls and faces drawn; the of-pie split and its second plot.
- **Checked:**
  - In Chrome: the new tiles and previews in Insert Chart, and Bar of Pie inserted.
  - All nine saved to a .docx and opened in LibreOffice, which drew each as a real 3-D, Pie of Pie or Bar of Pie
    chart.
  - All 1029 tests pass.
- **Still open:**
  - 3-D Rotation (X, Y, perspective) can't be changed, and the series axis of a deep chart is not labelled.
  - A 3-D Pie's slices show no cut faces when exploded.
  - Of-pie: only the split by position (not by value, percentage or custom), and Other takes the next palette
    colour.
  - Stock with Volume, Map and Templates are still not done.
  - Not opened in Word itself.

### Quick Access Toolbar: any ribbon command, below the ribbon, with labels

- **Missing:** the Quick Access Toolbar could hold only eleven commands (New, Open, Save, Undo, Bold…). Word lets any
  ribbon button go on it, can put it below the ribbon, and can show each command's name.
- **Changed:**
  - **Add to Quick Access Toolbar:** right-click any ribbon button. The menu offers Add (or Remove, when it is there),
    Customize Quick Access Toolbar…, Show Quick Access Toolbar Below/Above the Ribbon and Customize the Ribbon….
    Right-click a toolbar button to remove it.
  - **Running a ribbon command from the toolbar:** the toolbar presses the ribbon's own button, so it does just what
    the ribbon does (`src/components/ribbon/ribbon-commands.ts`).
    - A plain button runs where it is, even while its tab is hidden.
    - A button that opens a menu or gallery (Table, Columns) brings its tab to the front first, so the menu opens
      under it.
    - A command from a tool tab (Picture Format, Table Layout…) is greyed while that tab is not there.
  - The icon is copied from the ribbon when the command is added, with the ribbon's colours, and kept with the
    settings. A saved icon is cleaned to plain SVG before it is drawn.
  - **Customize dialog:** "Choose commands from" lists Popular Commands, All Commands and each tab's commands (read
    from the ribbon). New check boxes: Show Quick Access Toolbar below the Ribbon, Always show command labels. The
    toolbar's ▾ menu gains Show Below/Above the Ribbon and Hide Quick Access Toolbar.
  - Each ribbon panel carries `data-ribbon-tab` and its tab's name; the ribbon registers how to bring a tab forward.
- **Tests:** `ribbon-commands.test.ts` (finding a command, one of each per tab, running it and not when off, cleaning
  icons), `customize.test.ts` (ribbon commands, position and labels read back; looks of removed commands dropped).
- **Checked in Chrome:** right-click Page Break → Add; it inserted a page break from the toolbar while Home was in
  front. Table from the toolbar brought Insert forward with its grid open. Moved the toolbar below the ribbon and
  added Columns from the dialog's Layout Tab list with labels on. All of it was still there after a reload. All
  1014 tests pass.
- **Still open:**
  - Import/Export of customizations. The desktop app writes only document file types, so it needs a Rust-side
    change.
  - New Tab, New Group, Rename and moving ribbon groups or commands.
  - "For this document" (the toolbar is for all documents).
  - A ribbon command whose button is renamed in a later version drops off the toolbar's working set (it stays
    greyed until removed).
  - Commands of the Simplified ribbon layout use its own button names.

### Edit Points and Convert to Freeform

- **Missing:** Edit Points and Convert to Freeform (Shape Format → Edit Shape) were disabled, since shapes could
  only be drawn from the gallery.
- **Changed:**
  - **Shapes from points:** a shape can now hold its own outline as points (the figure's `points` attribute, an
    SVG path in a 0–100 box stretched to the shape). `src/editor/shape-points.ts` reads the gallery's drawings
    (rects, rounded rects, ellipses, circles, polygons, polylines, lines and paths, with arcs as curves) into
    points, and moves, deletes and adds points.
  - **Edit Points** (Edit Shape menu and the shape's right-click menu): black handles on each point over the shape,
    turned and flipped with it (`src/editor/edit-points.ts`).
    - Drag a handle to move the point. The shape redraws as it is dragged.
    - Ctrl+click a point to delete it; Ctrl+click the outline to add one there (a curve is split where clicked).
    - Each change is one undo step. Escape, or a click away from the shape, ends it.
  - **Convert to Freeform:** turns a gallery shape into points without changing how it looks.
  - Change Shape draws the new gallery shape and drops the points.
  - **.docx:** a shape with points is written as Word's freeform (`a:custGeom` with moveTo, lnTo, cubicBezTo and
    close in place of `a:prstGeom`). Word's freeforms open as points. Their arcs and quadratic curves are read as
    curves. Geometry built from guide formulas is still drawn as a rectangle.
- **Fixed on the way:** a shape's drawing changing (as Edit Points redraws it) was read by ProseMirror as an edit,
  which moved the selection off the shape. The figure node view now ignores changes to its drawing
  (`ignoreMutation` in `insert-blocks.ts`).
- **Tests:** `shape-points.test.ts` (every gallery shape converts; move, delete, add; custGeom both ways),
  `edit-points.test.ts` (convert, start and stop), and a save and reopen of a freeform in `shape-write.test.ts`.
- **Checked:** in Chrome on a triangle: drag the top point, Ctrl+click the base to add a point, Ctrl+click it to
  delete it, Escape, then undo one change at a time. All 1009 tests pass.
- **Still open:**
  - A point dragged outside the shape's box is drawn outside it. Word grows the box to fit.
  - Word's right-click menu on a point (Smooth, Straight and Corner Point, Open/Close Path) and its curve handles
    are not done.
  - Not opened in Word itself.

### Crop: Crop to Shape, Aspect Ratio, Fill and Fit; pictures stretch to their box as in Word

- **Missing:** Crop was a plain button. Word's Crop is a split button with Crop to Shape, Aspect Ratio, Fill and Fit.
- **Changed:**
  - **The menu:** Crop on Picture Format (both ribbon layouts) is now a split button. The picture still crops;
    the arrow opens Crop, Crop to Shape ▸, Aspect Ratio ▸, Fill and Fit (`CropMenu` in `picture-menus.tsx`).
  - **Crop to Shape:**
    - Offers the shape gallery, leaving out lines and the few shapes Word has no preset for (`croppableShape`).
    - The picture's `frame` attribute now names any shape. Rounded and oval stay as before
      (`src/editor/picture-shape.ts`).
    - The picture shows through a CSS mask made from the shape's drawing, stretched as Word stretches a preset.
      The mask combines with soft edges.
    - A picture border follows the shape's outline, drawn as an SVG over the picture, since a CSS outline would be
      masked away.
    - In .docx it is the picture's own `a:prstGeom` (e.g. `star5`, `heart`), and Word's geometry opens as the same
      frame.
    - A Word picture whose shape is unchanged is still written from its source drawing.
  - **Aspect Ratio:** 1:1, the portrait and landscape ratios Word offers. Crops to the largest centred part of the
    whole picture at that ratio and opens crop mode to adjust or apply (`aspectRatioCrop`).
  - **Fill / Fit:** keep the frame and scale the picture in it, centred (`fillCrop`, `fitCrop`). Fill covers the
    frame. Fit shows all of the picture with empty room beside it.
    - That needed negative crop: `cropOf` now allows down to -100 %, and a drag cannot crop back past the empty
      room.
    - It is written as a negative `a:srcRect`, as Word writes Fit, and read back.
- **Fixed alongside:** `.page-editor img { object-fit: contain }` letterboxed any picture sized out of proportion.
  Word stretches it, and the file says so. Pictures on the page now fill their box (`.page-image img`).
- **Tests:**
  - `picture-crop.test.ts`: aspect ratios from the whole picture, Fill and Fit with the frame kept, the drag limit
    after Fit, the frame/preset names, which shapes are offered, and the mask.
  - `floating.test.ts`: `star5` and `ellipse` written and read back, and Fit's negative `a:srcRect` written and
    read back.
  - 997 tests pass.
- **Checked in Chrome** (from the Picture Format ribbon):
  - Crop ▸ Crop to Shape ▸ Heart drew the picture as a heart.
  - Aspect Ratio ▸ 1:1 on the 300×200 picture gave 200×200 with a sixth off each side, in crop mode.
  - Fit left a quarter of empty room above and below.
  - A red 3 pt border followed a heart, and a dashed one followed a star.
- **Open:**
  - The cropped-away parts drawn faint in crop mode are hidden outside the shape.
  - The picture bar's Crop button is not a split button.
  - Not yet opened in Word (verify-list).

### Equations are saved to Word, Word's equations open to edit, and Display / Inline switches

- **Wrong:** an equation made in the app was dropped when saving to .docx, because `inlinesFromEditor` had no case
  for the `equation` node. An equation from Word was kept as raw markup that showed only as plain text and could
  not be edited. There was no way to put an equation on a line of its own.
- **Changed:**
  - New `src/document/docx/omml.ts` converts between the editor's LaTeX and Word's Office Math (OMML), both ways.
    - It covers fractions (bar, no bar, linear), scripts and pre-scripts, radicals, large operators (with limits
      under/over or at the side), brackets with `\middle`, matrices, cases, aligned rows, functions,
      `\lim`/`\max`/`\min`, accents, over/under bars, braces, `\overset`/`\underset`, arrows with text, boxes,
      `\text`, bold and upright runs, and about 150 symbols.
    - On reading, a property Word leaves out takes Word's default: parentheses, an integral, a hat.
    - Unknown elements are read for their text, so nothing disappears.
  - Opening: an `m:oMath` / `m:oMathPara` becomes an editable equation. It keeps Word's markup and the LaTeX it was
    read as (`omml`, `ommlTex`).
  - Saving: an equation whose LaTeX and layout are unchanged goes back exactly as Word wrote it; otherwise it is
    written from the LaTeX (`equationOmml`). Generated markup declares `xmlns:m` itself, since a new document's
    root does not.
  - The equation node has a `display` attribute: centred on its own line and drawn full size, saved as
    `m:oMathPara`. The Equation tab has Change to Display / Change to Inline (both ribbon layouts). Insert
    Equation on an empty line makes a display equation, as Word does.
- **Tests:**
  - `omml.test.ts` (114). Every structure template, symbol and gallery equation is written as well-formed OMML,
    reads back as LaTeX that KaTeX draws, and writes the same OMML again. There are checks per element, Word's
    defaults, a Word-written quadratic formula, another prefix, and bad input.
  - `edit-fidelity.test.ts` (2 new). The f17 fixture opens as `x=\frac{a+b}{c}` (display) and saves byte for
    byte as Word wrote it; once edited, it saves the new fraction and reopens with it. An app equation, inline and
    display, saves as `m:oMath` / `m:oMathPara` and reopens.
  - 990 tests pass.
- **Checked in Chrome:**
  - The f17 equation opened drawn as a fraction, centred.
  - An equation inserted on an empty line was centred; one inserted after text sat in the line.
  - Change to Inline on the Equation tab moved the display equation into the line.
- **Open:**
  - Not yet opened in Word. Saved equations should be checked there (verify-list).
  - Word's linear format (UnicodeMath) and Professional/Linear switching are not done.
  - `m:oMathPara` justification (`m:jc`) is not read.
  - Word math run styles other than plain, bold and upright (script, fraktur, double-struck as styles) are read as
    plain.

### Draw Table and Eraser draw and erase as Word's do; a table's indent shows again

- **Missing:** Draw Table only put in a 3×3 table, and Eraser took the borders off the cell holding the cursor.
  Word's Draw Table is a pencil: a box dragged on the page becomes a table that size, and a line dragged in a cell
  splits it. Its Eraser merges the two cells on either side of the line you click.
- **Changed:** new `src/editor/table-draw.ts`.
  - `useTableDraw` is the mode store. Draw Table and Eraser on the Table Layout tab (both ribbon layouts) and Draw
    Table in Table Design → Borders now switch the pencil or eraser on and off. The active one shows as pressed.
    Escape or a second click puts it down. The page shows a pencil or eraser cursor.
  - A box drawn outside a table becomes a one-cell table the box's size (column width, row height). It is set in
    from the margin as far as the box starts, and goes after the paragraph the box starts on (`insertDrawnTable`).
  - A line down through a cell adds a grid column there, and the other cells over that column widen to span both
    halves (`splitCellDown`). On an existing column edge inside a merged cell, the cell divides there instead.
    A line across does the same with rows (`splitCellAcross`).
  - A click within 6 px of the border between two cells merges them, when the two make a rectangle by themselves
    (`eraseBetween`). Each action is one undo step, and the eraser leaves the cursor in the merged cell.
  - The pointer handling is the `TableDrawing` extension. It works from screen rectangles divided by the zoom.
  - `clearCellBorders` (the old Eraser stand-in) is gone.
- **Fixed alongside:** `drawTableFloat` cleared `margin-left` on every table that does not float, right after
  `applyTableProps` drew the indent. So no table's indent showed, including tables from Word with `w:tblInd`. It
  now leaves `margin-left` alone (`table-float.ts`).
- **Tests:** `table-draw.test.ts` (9): both splits, the edge cases, the eraser, one undo step, and the drawn table's
  size and indent. The indent test fails without the float fix. `table-design-menus.test.tsx` now checks that Draw
  Table picks up the pencil. 874 tests pass.
- **Checked in Chrome:**
  - From the Table Layout ribbon, with the pencil on, a line down cell "a" gave `a _ b / c(span 2) d`, and a line
    across "b" gave a new row with "a" and its new neighbour spanning both.
  - A box under "Below" became a table 40 px in.
  - The eraser on the line between "a" and its neighbour merged them. Escape put it down, and one undo brought the
    split back.
- **Open:**
  - Word's pencil can also draw a line along an existing border to put back a border taken off, and it can draw
    diagonals. Neither is done.
  - A box drawn beside text in Word makes a floating table; here it always goes in the text after the paragraph.
  - Lines across several cells split only the cell the line starts in.

### Line numbering: Start at, Count by and From text; numbers show at once

- **Missing:** the app numbered every line from 1 at a fixed distance. Word's Start at, Count by and From text
  were kept in the file but not drawn or editable. The ribbon menu had no Line Numbering Options….
- **Bug:** turning line numbers on (or any Page Setup change that leaves the page size alone) drew nothing until
  the next edit. The page layout skipped its run when the page grid looked unchanged.
- **Changed:**
  - `PageSetup` has `lineNumberStart`, `lineNumberCountBy` and `lineNumberDistance` (`page-setup.ts`). They are
    read from `w:lnNumType` (Word's `start` counts from 0) and written back (`docx/project.ts`), keeping Word's
    element while unchanged.
  - The Line Numbers dialog has Start at, From text (cm, 0 for Auto) and Count by (`design-dialogs.tsx`).
  - Layout → Line Numbers → Line Numbering Options… opens Page Setup on its Layout tab
    (`requestPageSetup("layout")`).
  - `collectLineNumbers` counts from Start at and shows every Count-by-th line. `--line-number-gap` sets the
    distance.
  - A Page Setup change now always lays the pages out again (`pages.ts`).
- **Checked:** `line-numbers.test.ts` writes 5, 5 and 1.27 cm as `w:start="4"`, `w:countBy="5"` and
  `w:distance="720"`, and reads them back. In Chrome, through the menu and dialogs, count by 5 shows 5 and 10, the
  1 cm distance moves the numbers out, and Continuous shows numbers at once (before: none until an edit). Full
  suite passing.
- **Open:** Restart each section (the app has one section's setup); not opened in Word.

### Column breaks are saved; two stale notes corrected

- **Bug:** a column break (Layout → Breaks → Column, Ctrl+Shift+Enter) was dropped when saving to .docx, so it was
  gone on reopening.
- **Changed (`docx/project.ts`):**
  - A column break is written as Word's paragraph holding only `<w:br w:type="column"/>`.
  - On open, such a paragraph becomes the editor's column break again (`breakOnly`, shared with page breaks).
- **Checked:** a save-and-reopen test in `column-line.test.ts`. Full suite passing.
- **Corrected:** next-todo 20.6 said shapes, charts and 3D models still save in line and the Layout dialog has no
  Text Wrapping tab. Both were already done. A save in Chrome of a floating native shape, a shape saved as a
  picture and a chart wrote `wp:anchor` for each.
- **Open:**
  - A column break in the middle of a Word paragraph opens as a line break.
  - Unequal columns (Left and Right presets, per-column widths) can't be drawn with the browser's equal columns.

### Word's remaining formatting keys

- **Missing:** Ctrl+Shift+D (double underline), Ctrl+Shift+K (small caps), Ctrl+Shift+H (hidden), Ctrl+T and
  Ctrl+Shift+T (hanging indent), Ctrl+Q (reset paragraph formatting) and Ctrl+Shift+V (paste formatting). The
  formats themselves were already in the Font and Paragraph dialogs.
- **Changed:**
  - `src/editor/shortcuts.ts` adds the seven keys:
    - The character ones toggle the same settings the Font dialog sets.
    - Ctrl+T steps the hanging indent 1.27 cm, from the first paragraph chosen.
    - Ctrl+Q puts the paragraph's own formatting back to its defaults and keeps character formatting.
  - Ctrl+Shift+C is now Word's Copy Formatting, which Ctrl+Shift+V pastes. It used to arm the format painter; the
    button still does.
  - `captureFormat` and `applyFormat` (`home-actions.ts`) are shared by the painter and the new pair.
- **Checked:** `shortcuts.test.ts` covers each key. While writing those tests, Ctrl+T with everything selected
  never got past one step; that is fixed. In Chrome every key was pressed on real text.
- **Open:** in a browser tab, Ctrl+T and Ctrl+Q may be taken by the browser; the desktop app gets them.

### Tables break across pages; floating tables split and keep apart

- **Bug:** no table broke across pages. One taller than the room left moved to the next page whole and ran off
  its bottom, over the gap between pages (seen with a 60-row table: rows drawn in the page gap). So a floating
  table could not split either. Floating tables with Allow overlap off still covered each other.
- **Changed (`src/editor/pages.ts`):**
  - A table that overruns the page is measured row by row (`tableRows`; rows joined by a merged cell are one
    piece). `placeRows` breaks before the first row that does not fit.
  - The gap between the rows is a row of its own (`createRowGap`), kept clear of the table's borders and shading
    (`index.css`). With Repeat as header row, a copy of the first row follows it (`repeatedHeader`), and the layout
    counts its height.
  - A cached table that no longer fits where it now starts is measured again.
  - A floating table that moves with text but would run past its page goes into the text at its place across
    (`flow` placement; `drawTableFloat` leaves it there) and breaks the same way.
  - `clearOfFloats` (`table-float.ts`) moves a floating table with Allow overlap off down past the floating tables
    already on its page.
- **Backlog:** text on both sides of a floating table (next-todo, Future features): the browser's floats allow one
  side only.
- **Checked:** `table-float.test.ts` covers `clearOfFloats`. In Chrome:
  - A 60-row table puts rows 1-40 on page 1 and 41 on page 2, with none cut by the page edge, and repeats its
    header row.
  - Typing four lines into row 38 moves row 39 to page 2, and the caret stays in the cell.
  - A 60-row floating table splits the same way at its 1 cm offset.
  - Of two floating tables at the same place, the one with overlap off sits below the other.
  - Full suite 859 passing. A React "error during concurrent rendering" message logs while typing in a table, with
    or without this change: it predates the change and is still open.
- **Open:** a row taller than a page is not split; "Allow row to break across pages" is not honoured; text beside
  a split floating table's first part; not checked in the desktop app or against Word.

### Word's own gradients and dashes on shapes open as they are

- **Bug:** a shape the app filled with a gradient or dashed already saved and reopened correctly (22.11). A gradient
  Word made did not: the reader only knew the app's two-stop presets, so Word's usual gradients (three stops, theme
  colours, any angle, or a theme gradient from a shape style's `a:fillRef`) opened as one flat colour. Word's
  `sysDashDot`, `sysDashDotDot` and custom dashes opened solid. Seen on `Document1.docx`'s Explosion.
- **Changed:**
  - A gradient that is none of the app's presets is kept whole in `fillGradient` as
    `word:<angle|radial>:<pos>#hex;…` (`wordGradientValue`, `parseWordGradient` and `gradientStopList` in
    `src/editor/shape-style.ts`). Shapes (SVG) and text boxes (CSS) draw every stop at Word's angle.
  - `readGradient` (`docx/shape-effects.ts`) falls back to it, with theme colours resolved.
  - `themeFill` (`docx/shape-import.ts`) reads the theme fill a style's `a:fillRef` names, with `phClr` made the
    reference's colour.
  - `gradientFill` (`docx/shape-write.ts`) writes every stop and Word's exact angle.
  - `readDash` maps `sysDashDot` to Dash Dot, `sysDashDotDot` to Long Dash Dot Dot, and `a:custDash` to Dash.
- **Checked:** `shape-write.test.ts` covers multi-stop and angle, writing back, a file save and reopen, the theme
  fillRef gradient, and the dashes. The theme-gradient test in `shape-import.test.ts` now expects the three stops.
  In Chrome, a copy of `Document1.docx` draws the Explosion with Word's three orange stops, dark at the bottom.
  Full suite 857 passing.
- **Open:** per-stop transparency is dropped; rectangle and shape path gradients draw as radial; not compared in
  Word side by side.

### Narrow and Wide cell margins are saved to .docx

- **Bug:** Table Layout → Cell Margins and Table Properties' Narrow / Normal / Wide only set an app-only `cellPad`
  flag. Nothing wrote it to .docx, so a Wide table reopened as Normal. On a table opened from Word with its own
  margins, those margins were drawn over the preset, so choosing Narrow or Wide changed nothing. (Custom table
  margins and per-cell margins were already saved and reopened; a save probe confirmed it.)
- **Changed:** `presetAttrs` and `presetOf` (`src/editor/table-props.ts`). A preset now sets the table's default
  cell margins (Normal clears them, Word's default), and the preset shown is read back from the margins.
  `cycleCellMargins` and `applyTableProperties` (`table-layout.ts`) use them. Saving (`docx/project.ts`) also writes
  the margins of a table that only carries the old flag.
- **Checked:** `table-props.test.ts` covers Narrow and Wide written as `w:tblCellMar` and reopened as the same preset,
  the old flag alone, Normal left out, and other margins counting as Normal. In Chrome, cycling Cell Margins on a
  new table draws 1/3 px, 10/14 px and Word's 0/7 px. Full suite 852 passing.
- **Open:** not opened in Word itself.

### Mail merge taken out of the app, kept on the backlog

- **Why:** Preview Results never filled the recipient's values into the page and the fields were not saved as
  Word's, so the owner chose to take the feature out until it can be finished.
- **Changed:** the Mailings tab is gone from both ribbon layouts and from Customize Ribbon's tab list. Removed:
  `src/components/ribbon/mailings-tab.tsx`, `src/document/mail-merge.ts`, `src/editor/merge-field.ts` (the
  `mergeField` mark; text that had one keeps its words), the Mailings line icons, their tooltips, the merge-field
  CSS and the `highlightMerge` view state. A saved Customize setting that hid Mailings is ignored, as for any
  unknown tab.
- **Backlog:** next-todo.md, Future features, "Mail merge (Mailings tab)", with where the last version is in git
  and what it lacked.
- **Checked:** types, lint, full suite (849 passing).

### Every ribbon tab slides in, not just Home

- **Bug:** the tab slide only showed when switching to or from Home (and the File view); every other switch had no
  motion. A tab put behind is hidden by React's `Activity` at once (an inline `display: none`), but the update that
  marks its panel `hidden` waits until the ribbon is idle. The slide took the first panel without `hidden`, which
  was always Home's, so it animated Home's hidden panel. The ribbon's scroll arrows looked up their toolbar the
  same way.
- **Changed:** `shownTabPanel` (`src/components/ribbon/tab-motion.ts`) also skips panels Activity has hidden; the
  slide and the scroll arrows (`ribbon.tsx`) both use it.
- **Checked:** `tab-motion.test.tsx` now puts a just-hidden panel first, and failed before the fix. In Chrome,
  Insert, Layout, Home, References, Review and View each start their own panel's slide. Full suite 849 passing.
- **Open:** confirm in the desktop app.

### Animations back, drawn frame by frame, so they no longer jump in the desktop app

- **Bug:** the previous fix turned every entrance off in the Linux desktop app, and the app felt dead ("animation is
  completely gone in all"). Recording the app's own engine (WebKitGTK 2.54's MiniBrowser on a hidden Xvfb display,
  ffmpeg x11grab at 60 fps, frames diffed with PIL) showed the real faults:
  - When a CSS animation or transition ends, WebKitGTK shows one stale frame from its start: the ribbon tab jumped
    back, the Office tooltip faded for a frame.
  - When an element goes from having a `translate` to having none, it draws one stale frame of it: a ribbon menu
    jumped up 3 px after settling.
  - Fluent's decelerate curve over 120-150 ms is over 80% done by the first frame the webview draws (about 30 fps
    there), so the motion was never seen, only a snap.
- **Changed:**
  - Every entrance is drawn from script a frame at a time: `playFrames` and `playEntrance` (`motion.ts`), started for
    dialogs, menus, popovers, tooltips, the File pane and page, and context menus by one observer in
    `src/document/entrances.ts` (installed in `main.tsx`). The ribbon tab slide uses it too (`tab-motion.ts`), as
    does the new document fade-in cover.
  - The clock starts a frame in, after the slow frame that lays the new content out. The curve is
    `cubic-bezier(0.2, 0, 0, 1)` over 150-260 ms.
  - An entrance ends on `opacity: 1` and a `0px 0px` translate written on the element, instead of removing them.
  - The CSS keyframes, the ribbon menus' transition, and the UI kit's animate-in classes on popovers and tooltips
    are gone (`index.css`, `ui/popover.tsx`, `ui/tooltip.tsx`). `data-no-entrance` and `isWebKitGtk` are removed.
    The Options switch and reduced motion still stop it all.
- **Checked:** in WebKitGTK, recordings of tab switches, the Margins menu and its tooltip, Page Setup, File and File >
  New: an automatic scan for one-frame jump-backs finds none, and the frames show each entrance moving. 849 tests
  pass (tab motion and entrance tests rewritten).
- **Open:** confirm in the desktop app with a GPU (the Xvfb display renders in software).

### No entrance motion in the Linux desktop app; the tab underline moves with its tab

- **Bug** (from `screenshots/ribbon.mp4`, recorded with the fix below): switching tabs in the desktop app showed a
  blank ribbon for one or two frames, then the new tab already in place, then about 120 ms later one frame of it
  shifted and faded again. WebKitGTK shows animated content at its end state first and replays a frame of the
  start afterwards, so the slide was never seen, only the blank frame and the jump. The same is expected of every
  CSS entrance: menus, dialogs, the File view. The underline also trailed the content by two frames, fading
  between tabs (a 120 ms transition).
- **Changed:**
  - In the Linux desktop app (`isWebKitGtk`, `platform.ts`), `main.tsx` sets `data-no-entrance` on the root.
    `index.css` then turns off the tab slide, menu, dialog and File view entrances, as reduced motion does.
    `prefersReducedMotion` honours it too: no tab-motion phases, no document fade-in cover, no ribbon height
    animation. Hover and other transitions are untouched. Browsers keep the motion.
  - The ribbon tab underline moves at once (`index.css`).
- **Checked:** headless Chrome with the attribute set as the desktop app does: the switch sets no motion phase and
  runs no animation; without it the slide still plays. The underline has no running transition. New tab-motion test;
  844 tests pass.
- **Open:** confirm in the desktop app.

### Ribbon tab slide still stuttered in the desktop app

- **Bug:** after the tab-switch fix above, the slide still stuttered in the desktop app. At 6x CPU slowdown (about
  the desktop webview's speed) the first frame after a click took 90-110 ms: style and layout for the newly shown
  tab, plus the ribbon's own render. The 150 ms slide started with the click, so most of it ran before anything was
  drawn and it showed as a jump, followed by 33-67 ms frames.
- **Changed** (`tab-motion.ts`, `ribbon.tsx`, `index.css`):
  - The new tab's first frame is drawn with its commands unseen (`data-tab-motion="waiting"`, opacity 0), and the
    slide starts on the frame after it (`"on"`, two animation frames later), so all of it plays on cheap frames.
  - The attribute is set on the card element directly instead of through React state, so the ribbon does not
    render again in the middle of the slide.
  - Under reduced motion the tab shows at once.
- **Checked:** headless Chrome at 6x CPU slowdown: the slide's frames are now 17 ms with an occasional 33 ms one,
  against runs of 33-67 ms before. Tab motion tests rewritten against the element; 843 tests pass.
- **Open:** confirm in the desktop app.

### Launch, File view and ribbon tab switches no longer stutter (desktop app)

- **Bug** (from the screencast `screenshots/Screencast_20261026_205830.mp4`):
  - At launch, an empty grey splash card with "Starting..." showed before its picture.
  - Then for about a third of a second the splash, the start screen and the editor were drawn through one another:
    a grey ghost of the start screen over the document, and a stale splash frame.
  - Closing the File view after Blank document showed it half transparent, with the page as a pale box through it.
  - Switching ribbon tabs lagged: the new tab was built from scratch on every switch, 30-116 ms in Chrome and
    several times that in WebKitGTK.
- **Changed:**
  - The splash card stays hidden until its picture loads, and the splash goes the moment the app is ready instead
    of fading out over the start screen (`splash-screen.tsx`, `index.css`).
  - The File view covers the window at once; only its pane and page slide in. The start screen the app opens on
    has no motion at all (`is-instant`), and closing is instant, as in Word (`backstage.tsx`; the whole-window fade
    in and `motion-slide-out` are gone).
  - The ten main ribbon tabs stay built once shown, hidden behind the one in front (`Activity` and `keepMounted` in
    `ribbon.tsx`), and the rest are built while the app is idle after launch. Each is wrapped in `memo`, so the
    hidden ones never draw while typing. The ribbon scroll buttons now watch the toolbar of the tab in front. The
    tab content keeps its compositing layer, like dialogs and menus, so the end of the slide-in does not blink.
- **Checked:** headless Chrome: a tab switch is now one frame (16-25 ms to paint, from 31-116 ms). At launch the
  splash card is hidden while empty, then shows its picture, then the start screen appears at full opacity with no
  animation. File opened later runs only the pane and page slides; Escape removes it at once. Typing 135 characters costs about 0.6 ms
  more per keystroke in browser style work from the larger hidden ribbon DOM (no script runs for the hidden tabs).
  2 new splash tests; 842 tests pass.
- **Open:** confirm in the desktop app (verify-list).

### A pill over a table's last row on hover (desktop app)

- **Bug:** hovering over a table's last row showed a rounded "pill" box that did nothing when clicked. It was the
  desktop webview's overlay scrollbar: a table made in the app sat in a wrapper with `overflow-x: auto`, and a
  table only a few pixels wider than the text (its borders, rounding, or columns resized past the margin) made the
  wrapper scrollable. WebKitGTK then shows its scrollbar over the bottom of the table on hover.
- **Changed:** the wrapper never scrolls (`overflow: visible`, `index.css`). As in Word, and as tables opened from
  Word already did, a table wider than the text runs past the margin.
- **Checked:** headless Chrome: a 631 px table in the 624 px text area left the wrapper scrollable before the change
  and not after. Found from the screenshot `screenshots/error.png`. 840 tests pass.

### Text wraps around tables (Table Properties > Around, Table Positioning, dragging the move handle)

- **Missing:** Text wrapping Around and Positioning... in Table Properties were disabled; a table could only sit in
  the text. **Changed**, as in Word:
  - **Around** makes the text flow beside the table. Its default place follows the table's alignment (Left at its
    indent, Center, Right), moving with its paragraph, 0.32 cm from the text at the sides. With Around, the
    Alignment tiles place the table across its column, and Indent from left is off.
  - **Table Positioning** (`table-properties-dialog.tsx`) has the Horizontal Position (Left, Right, Center, Inside,
    Outside or a distance) relative to Column, Margin or Page, and the Vertical Position (Top, Bottom, Center,
    Inside, Outside or a distance) relative to Margin, Page or Paragraph. It also has the distances from the text,
    Move with text, Allow overlap, and Remove Positioning.
  - **Dragging the move handle** moves the table to where it is dropped: an in-line table becomes one text wraps
    around. It is anchored to the paragraph it lands on, by the same rule dragged pictures use
    (`table-float-drag.ts`). A click on the handle still selects the table.
- **How it works:** the table's `float` attribute (`table-float.ts`) holds where it sits. The paginator places it
  like a floating picture (`pages.ts`): the table is drawn out of the text at its place on the page, and the text
  gets a float beside it on its roomier side (or only above and below when neither side has room for a line).
  The position goes on the `<table>` element, whose attribute changes the table view ignores, so the editor never
  redraws it. Tables placed on the page or margin take their room before the text above their paragraph is laid
  out.
- **.docx:** saved and read as `w:tblpPr` (distances, anchors, `tblpX`/`tblpXSpec`, `tblpY`/`tblpYSpec`) and
  `w:tblOverlap` (`wml-read.ts`, `wml-write.ts`, `table-props-docx.ts`). Word's defaults when it leaves values out
  are across from the column and down from the margin. A table nobody moved is written back exactly as it was
  read.
- **Checked:** `table-float.test.ts` (defaults, places, sides), `docx/table-props.test.ts` (Word's values, round
  trip), `table-properties-dialog.test.tsx` (Around, Positioning, Remove Positioning, the Position box).
  Headless Chrome:
  - Around on a 3×2 table: the paragraph's first line starts beside it, past the gap.
  - Right / Top of the margin with Move with text off: the table sits at the top right and the text wraps beside it.
  - Dragging an in-line table by its handle: it floats exactly where it was released (689, 484) and the text wraps
    around it.

  840 tests pass.

- **Open:**
  - Word also puts text on the narrower side of a table placed in the middle of the page; here text takes only the
    roomier side, as for floating pictures, because the page's lines can't run on both sides of one object.
  - A floating table is not split across pages.
  - Allow overlap is saved but not acted on: floating tables are not kept apart.

### Right-clicking a selected table, column or row keeps it selected

- **Bug:** right-clicking a fully selected table, column or row dropped the selection, so the menu looked as if it
  would act on one cell. The table menu decided whether the click was inside the selection from the selection's
  `from` and `to`, which for a cell selection cover only its first cell. Every other selected cell counted as
  outside, and the caret moved there. Also, with cells selected, a right-click in the text outside the table was
  taken by the table menu's "act on the selection" fallback, so it showed nothing useful and kept the cells selected.
- **Changed:** `insideSelection` (`object-context-menu.tsx`) checks each selected cell. A right-click on a selected
  cell keeps the selection; anywhere else in the table the caret moves to the click. Outside the table the text menu
  opens and moves the caret there (`text-context-menu.tsx`), as in Word.
- **Checked:** unit test in `table-properties-dialog.test.tsx`. Headless Chrome: whole table (6 cells), a column and
  a row each stay selected through a right-click on them; a right-click on another cell, or in the text below,
  unselects them and opens a single menu.

## 2026-10-26

### Table Properties: on the table's right-click, laid out as Word's dialog

- **Missing:** right-clicking a selected table offered only a small form (alignment, a column width), and the
  Table Properties dialog from the ribbon was a simplified one. **Changed:** "Table Properties..." on the table
  right-click menu (and on the text menu inside a table) opens Word's dialog (`table-properties-dialog.tsx`):
  - **Table:** Size (Preferred width, Measure in Centimeters / Percent), Alignment (Left / Center / Right tiles,
    Indent from left), Text wrapping (None; Around and Positioning... shown but disabled, since floating tables are
    not built), Borders and Shading... and Options... (Table Options: default cell margins, Allow spacing between
    cells, Automatically resize to fit contents).
  - **Row:** "Row N:" or "Rows 1-2:", Specify height, Row height is At least / Exactly, Allow row to break across
    pages, Repeat as header row (first row only), Previous Row / Next Row.
  - **Column:** "Column N:", Preferred width and Measure in, Previous Column / Next Column.
  - **Cell:** Preferred width, Vertical alignment tiles (Top / Center / Bottom), Options... (Cell Options: Same as
    the whole table, cell margins, Wrap text, Fit text).
  - **Alt Text:** Title, Description.
- The dialog keeps a draft (`table-dialog.ts`) and OK writes it in one transaction, so one undo. An untouched dialog
  changes nothing.
- The new settings are table, row and cell attributes (`table-props.ts`), drawn by the table view and `index.css`,
  and saved and reopened in .docx (`table-props-docx.ts`, `wml-read.ts`, `wml-write.ts`, `project.ts`):
  `w:tblW`, `w:tblInd`, `w:tblCellSpacing`, `w:tblCellMar`, `w:tblLayout` fixed, `w:cantSplit`, `w:trHeight`
  hRule, `w:tcMar`, `w:noWrap` and `w:tcFitText`. Word's exact value is kept while the editor still shows the same
  centimetres.
- **Bugs found while doing this:**
  - A right-click in a table opened the table menu and the text menu together, with the text menu drawn over it.
    The table menu now takes the right-click first (capture phase) and the text menu leaves a right-click already
    taken.
  - Every table action on the right-click menu moved the caret to the clicked point, dropping a cell selection. A
    right-click inside the selection now keeps it, as in Word.
- **Checked:** `table-properties-dialog.test.tsx` (draft, one-step apply and undo, tabs, Previous / Next Row, Table
  and Cell Options), `docx/table-props.test.ts` (values, exact-value keeping, .docx round trip). Headless Chrome: a
  selected 2×3 table, right-click shows a single menu with Table Properties...; each tab and both option dialogs
  were looked at; indent 1 cm, cell spacing, a 0.3 cm top margin and Center vertical alignment applied to all six
  cells, and one undo removed them. 831 tests pass.
- **Open:** text wrapping around a table (Around, Positioning...); Fit text is saved but not drawn (the text is not
  squeezed into the cell); a preferred width is applied by resizing the columns once, not kept as a live rule.

### Tables in a header or footer could not be clicked into or resized

- **Bug:** while a header or footer was open, its margin's zone (`.page-chrome-zone`, z-index 3, the double-click
  target that opens it) lay over the header's content (z-index 2). A click in a header table's cell, or a drag of its
  border, reached the zone instead of the editor: the zone only reopened the header with the caret at its end, so the
  table could not be typed in, and resizing never reached the table either.
- **Changed:** the header or footer being edited is raised over the zone (`.is-chrome-editing .chrome-box.is-live`,
  `index.css`); the zone still takes clicks in the rest of the margin, which open that page's header.
- **Checked** in headless Chrome: a 2×2 table pasted into the header takes typing in a cell, a row border dragged
  20 → 50 px and a column border 311 → 231 px, typing still lands in the cells after each, and the closed header's
  copy shows the edited table.

### Tables: fit every column of a selected table, and fit a row to its contents, by double-clicking a border

- **Missing:** with the whole table selected, double-clicking a column border fitted only that column; double-clicking
  a row border did nothing. **Changed:** with every cell selected (`wholeTableSelected`), any column border fits all
  columns (`autoFitAllColumns`): each gets its unwrapped width when they all fit the page, otherwise at least its
  longest word and the rest of the page in proportion to how much wider it would like to be (`sharedColumnWidths`).
  Double-clicking a row's bottom border clears its set height so it fits its contents, every row's when the whole
  table is selected (`autoFitRows`). Each is one undo step (`table-tools.ts`).
- **Checked:** unit tests for the sharing (`table-resize.test.ts`); in headless Chrome, a selected 3-column table went
  from 208/208/208 to 93/336/135 px, and a row dragged to 70 px went back to 20 px on a double-click.

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
