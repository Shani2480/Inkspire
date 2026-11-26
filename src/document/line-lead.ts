import { fontLines } from "@/document/docx/font-metrics"
/**
 * Where Word puts the text inside a line taller than the font's single line. CSS centres a line's text, splitting the
 * extra space above and below; Word does not:
 * - a multiple (1.15, 1.5, 2 lines) keeps the text where a single line has it, and all the extra space goes below;
 * - an exact height puts the baseline at 80% of the line;
 * - an "at least" height taller than the text puts all the extra space above (the baseline a descent above the foot).
 * Measured in Word for Arial, Aptos, Calibri, Cambria and others (2026-11-17).
 *
 * The paragraph is trimmed to its first line's cap height and its last line's baseline (text-box-trim) and padded
 * back by Word's distances, so its height stays a whole number of lines and only the text moves. The font's single
 * line and descent come from --word-single-line and --word-descent (fractions of the font size), set per style.
 * A list marker that rises above the text (Symbol's bullet) makes its line taller by the difference, all above the
 * text and not scaled by a multiple, as in Word (--word-marker-lift, index.css).
 */
export type LeadRule = "multiple" | "exact" | "atLeast"

const SINGLE_BASELINE = "1em * (var(--word-single-line, 1.17) - var(--word-descent, 0.22))"

/** Where Word puts the first line's baseline, from the top of the line, as a CSS length (--lead-base). */
export function leadBase(rule: LeadRule) {
  if (rule === "exact") {
    return "0.8lh"
  }
  if (rule === "atLeast") {
    return `max(1lh - var(--word-descent, 0.22) * 1em, ${SINGLE_BASELINE})`
  }
  return `calc(${SINGLE_BASELINE})`
}

/**
 * The line height of an exact or at-least line (Word measured 2026-11-17). Exact: the given height whatever the
 * text, larger runs neither stretch it nor move it (their line height 0 through --word-run-line). At least: the
 * height, or the text's own single line where it is taller, and a larger run's line where that is taller still.
 */
export function ruleLineHeight(rule: "exact" | "atLeast", points: number) {
  const height = rule === "exact" ? `${points}pt` : `max(${points}pt, calc(var(--word-single-line, 1.17) * 1em))`
  return [
    `line-height: ${height}`,
    // On a document grid an exact line stays as it is; an at-least line is the height or the text's line rounded up
    // to whole grid lines (gridLineStyleSheet).
    rule === "exact"
      ? `--word-grid-line: ${height}`
      : `--word-grid-line: max(${points}pt, round(up, calc(var(--word-single-line, 1.17) * 1em), var(--word-grid, 1pt)))`,
    rule === "exact" ? "--word-grid-lead: 0.8lh" : `--word-grid-lead: ${leadBase("atLeast")}`,
    rule === "exact" ? "--word-run-line: 0" : "--word-run-line: calc(var(--word-single-line, 1.17) * 1em)",
    // A paragraph mixing sizes keeps this line (its strut); its runs are not shifted.
    "--word-lines: 1",
    `--word-mixed-strut: ${height}`,
  ]
}

/**
 * A multiple of lines, for a paragraph whose text mixes sizes (data-word-mixed): Word makes such a line the tallest
 * run's single line times the multiple, with the baseline where the highest run's ascent puts it and all the extra
 * below. Each run's box is that run's own line (single line times the multiple), lowered by its extra above and its
 * text drawn back up (index.css); the paragraph's own strut is none, as it would split its extra above and below.
 */
export function multipleLineVars(lines: number | string) {
  return [
    `--word-lines: ${lines}`,
    "--word-mixed-strut: 0",
    // On a document grid: the grid line times the multiple, or the text's own line rounded up to whole grid lines
    // where that is taller (gridLineStyleSheet).
    `--word-grid-line: max(calc(var(--word-grid, 0pt) * ${lines}), round(up, calc(var(--word-single-line, 1.17) * 1em), var(--word-grid, 1pt)))`,
    "--word-grid-lead: initial",
  ]
}

/**
 * A section on a line grid (w:docGrid w:type="lines", measured in Word 2026-11-26): a line spaced in multiples is the
 * grid's pitch times the multiple, or the text's single line rounded up to whole pitches where that is taller (a
 * 16 pt line on an 18 pt grid takes two); an at-least line is its height or the text's line rounded up likewise; an
 * exact line keeps its height. Word centres the text's single line in a grid line. Table text is on the grid only
 * with the adjustLineHeightInTable compatibility option. A paragraph mixing sizes, one off the grid (w:snapToGrid="0",
 * its own or its style's), or one given a line height that carries no grid line, keeps its own.
 */
export function gridLineStyleSheet(pitchPoints: number, inTables: boolean, offGridStyles: string[] = []) {
  // Off the grid: its own w:snapToGrid="0", or a style's that the paragraph does not turn back on.
  const off = offGridStyles.map(
    (id) =>
      `${id ? `[data-word-style="${id.replace(/["\\]/g, "\\$&")}"]` : ":not([data-word-style])"}:not([data-snap-to-grid="1"])`,
  )
  const blocks = `.page-editor ${TEXT_BLOCKS}:not([data-word-mixed], [data-snap-to-grid="0"], [style*="line-height:"]:not([style*="--word-grid-line"])${off.map((item) => `, ${item}`).join("")})`
  const outside = inTables ? "" : ":not(td *, th *)"
  return [
    `:root .page-editor {\n  --word-grid: ${pitchPoints}pt;\n}`,
    `:root:root:root ${blocks}${outside} {\n  line-height: var(--word-grid-line) !important;\n  --lead-base: var(--word-grid-lead, calc((1lh + var(--word-single-line, 1.17) * 1em) / 2 - var(--word-descent, 0.22) * 1em)) !important;\n}`,
  ].join("\n\n")
}

const TEXT_BLOCKS = ":is(p, h1, h2, h3, h4, h5, h6)"
const UNBOXED = ':not([data-border], [data-border-between="1"])'

/**
 * The page's rules (index.css holds a copy; line-lead.test.ts keeps them the same). Each paragraph's --lead-base is
 * a multiple's unless a Word style (its style sheet) or its own spacing says otherwise; paragraphs with a box pad
 * themselves, and those holding something taller than their text (editor/word-lead.ts) are not trimmed: one with an
 * object keeps the browser's place, one mixing sizes places each run as Word does (multipleLineVars).
 */
export function leadStyleSheet() {
  return [
    `.page-editor ${TEXT_BLOCKS} {\n  --lead-base: ${leadBase("multiple")};\n}`,
    `.page-editor ${TEXT_BLOCKS}:not([data-word-tall]) {\n  text-box-trim: trim-both;\n  text-box-edge: cap alphabetic;\n  padding-top: max(0pt, calc(var(--lead-base) - 1cap + var(--word-marker-lift, 0pt)));\n  padding-bottom: max(0pt, calc(1lh - var(--lead-base)));\n}`,
    `:root:root .page-editor ${TEXT_BLOCKS}[data-word-lead]${UNBOXED} {\n  --lead-base: ${leadBase("multiple")};\n}`,
    `:root:root .page-editor ${TEXT_BLOCKS}[data-line-rule="exact"]${UNBOXED} {\n  --lead-base: ${leadBase("exact")};\n}`,
    `:root:root .page-editor ${TEXT_BLOCKS}[data-line-rule="at-least"]${UNBOXED} {\n  --lead-base: ${leadBase("atLeast")};\n}`,
    `:root:root .page-editor ${TEXT_BLOCKS}[data-word-mixed] {\n  line-height: var(--word-mixed-strut, 0) !important;\n}`,
    `.page-editor ${TEXT_BLOCKS}[data-word-mixed] .word-lead-run {\n  --lead-shift: calc((1 - var(--word-lines, 1)) * var(--word-single-line, 1.17) * 0.5em);\n  position: relative;\n  top: var(--lead-shift);\n  vertical-align: var(--lead-shift);\n  line-height: var(--word-run-line, calc(var(--word-single-line, 1.17) * var(--word-lines, 1) * 1em));\n}`,
    // A tab is a box of 1em on the baseline, above the runs' text: it is left out of the line's height.
    `.page-editor ${TEXT_BLOCKS}[data-word-mixed] .doc-tab {\n  margin-top: -1em;\n}`,
  ].join("\n\n")
}

/** Word's descent below the baseline in a single line, as a fraction of the font size (measured in Word). */
const DESCENT: Record<string, number> = {
  aptos: 0.282,
  symbol: 0.215,
  "aptos display": 0.282,
  calibri: 0.27,
  "calibri light": 0.27,
  cambria: 0.222,
  "times new roman": 0.21,
  arial: 0.204,
  georgia: 0.216,
  verdana: 0.204,
  "segoe ui": 0.246,
  "courier new": 0.3,
  tahoma: 0.204,
  garamond: 0.258,
  "century gothic": 0.222,
  consolas: 0.252,
  "book antiqua": 0.282,
}
const TYPICAL_DESCENT = 0.23

export function wordDescent(face: string | undefined) {
  const key = (face ?? "").toLowerCase()
  return fontLines.get(key)?.descent ?? DESCENT[key] ?? TYPICAL_DESCENT
}
