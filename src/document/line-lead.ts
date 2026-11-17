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

const TEXT_BLOCKS = ":is(p, h1, h2, h3, h4, h5, h6)"
const UNBOXED = ':not([data-border], [data-border-between="1"])'

/**
 * The page's rules (index.css holds a copy; line-lead.test.ts keeps them the same). Each paragraph's --lead-base is
 * a multiple's unless a Word style (its style sheet) or its own spacing says otherwise; paragraphs with a box pad
 * themselves, and those holding something taller than their text (editor/word-lead.ts) keep the browser's place.
 */
export function leadStyleSheet() {
  return [
    `.page-editor ${TEXT_BLOCKS} {\n  --lead-base: ${leadBase("multiple")};\n}`,
    `.page-editor ${TEXT_BLOCKS}:not([data-word-tall]) {\n  text-box-trim: trim-both;\n  text-box-edge: cap alphabetic;\n  padding-top: max(0pt, calc(var(--lead-base) - 1cap));\n  padding-bottom: max(0pt, calc(1lh - var(--lead-base)));\n}`,
    `:root:root .page-editor ${TEXT_BLOCKS}[data-word-lead]${UNBOXED} {\n  --lead-base: ${leadBase("multiple")};\n}`,
    `:root:root .page-editor ${TEXT_BLOCKS}[data-line-rule="exact"]${UNBOXED} {\n  --lead-base: ${leadBase("exact")};\n}`,
    `:root:root .page-editor ${TEXT_BLOCKS}[data-line-rule="at-least"]${UNBOXED} {\n  --lead-base: ${leadBase("atLeast")};\n}`,
  ].join("\n\n")
}

/** Word's descent below the baseline in a single line, as a fraction of the font size (measured in Word). */
const DESCENT: Record<string, number> = {
  aptos: 0.282,
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
  return DESCENT[(face ?? "").toLowerCase()] ?? TYPICAL_DESCENT
}
