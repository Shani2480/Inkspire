# Changes log

One entry per fix or feature, newest first, written the same session the work lands. Each entry says what was
wrong or missing, what changed, where (files, tests), how it was checked, and what is still open. The longer
story of each feature stays in `next-todo.md` under its section; `verify-list.md` holds what still needs a check
in Word, Chrome or the desktop app.

## 2026-10-24

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
