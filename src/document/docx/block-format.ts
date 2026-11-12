import { borderOf, hexOf } from "@/document/docx/cell-edits"
import type { Indent, ParagraphProperties, ShadingValue, Spacing } from "@/document/docx/model"
import { patternImage, patternOf, patternValue } from "@/document/docx/shading-pattern"

/** Editor paragraph attributes (src/editor/block-format.ts, indent.ts, LineHeight, TextAlign) that map to w:pPr. */
export type BlockFormat = {
  textAlign: string
  spaceBefore: number | null
  spaceAfter: number | null
  lineHeight: string | null
  lineRule: string
  indent: number
  indentRight: number
  specialIndent: string
  keepNext: boolean
  keepLines: boolean
  pageBreakBefore: boolean
  widowControl: boolean
  contextualSpacing: boolean
  /** The editor's paragraph border: "all", or sides joined by commas; null for none. */
  suppressLineNumbers: boolean
  dontHyphenate: boolean
  mirrorIndents: boolean
  tightWrap: string
  border: string | null
  /** The line the border is drawn with, as the CSS shorthand ("1px dashed #c00000"); null for the app's own. */
  borderPen: string | null
  /** Word's Shadow setting: the border casts a shadow to the bottom right. */
  borderShadow: boolean
  /** Word's 3-D setting: the border's frame effect. */
  borderFrame: boolean
  /** The gap between the text and each side, in points ("top right bottom left"); null for Word's 1, 4, 1, 4. */
  borderSpace: string | null
  /** The editor's paragraph fill as #rrggbb; null for none. */
  shading: string | null
  /** Word's shading pattern over the fill, as `shading-pattern.ts` keeps it ("pct25 #c00000"); null for Clear. */
  shadingPattern: string | null
}

/** What the editor holds for a paragraph nobody formatted. */
export const PLAIN_BLOCK: BlockFormat = {
  textAlign: "left",
  spaceBefore: null,
  spaceAfter: null,
  lineHeight: null,
  lineRule: "multiple",
  indent: 0,
  indentRight: 0,
  specialIndent: "",
  keepNext: false,
  keepLines: false,
  pageBreakBefore: false,
  widowControl: true,
  contextualSpacing: false,
  suppressLineNumbers: false,
  dontHyphenate: false,
  mirrorIndents: false,
  tightWrap: "none",
  border: null,
  borderPen: null,
  borderShadow: false,
  borderFrame: false,
  borderSpace: null,
  shading: null,
  shadingPattern: null,
}

const TWIPS_PER_POINT = 20
const TWIPS_PER_CM = 1440 / 2.54
const TWIPS_PER_MM = TWIPS_PER_CM / 10
/** One editor indent step is 24px, a quarter inch. */
const TWIPS_PER_INDENT_STEP = 360
const INDENT_STEPS = 8
const AUTO_LINE = 240

/** Fields that change together: the editor keeps line height and its rule, and left and special indent, apart. */
const GROUPS: (keyof BlockFormat)[][] = [
  ["textAlign"],
  ["spaceBefore"],
  ["spaceAfter"],
  ["lineHeight", "lineRule"],
  ["indent"],
  ["specialIndent"],
  ["indentRight"],
  ["keepNext"],
  ["keepLines"],
  ["pageBreakBefore"],
  ["widowControl"],
  ["contextualSpacing"],
  ["suppressLineNumbers"],
  ["dontHyphenate"],
  ["mirrorIndents"],
  ["tightWrap"],
  ["border", "borderPen", "borderShadow", "borderFrame", "borderSpace"],
  ["shading", "shadingPattern"],
]

/**
 * A list paragraph's properties without its left, hanging and first-line indent: the list and its item place the
 * text and the number there, so the paragraph must not indent a second time. Its right indent stays.
 */
export function withoutListIndent(pPr: ParagraphProperties): ParagraphProperties {
  if (!pPr.ind) {
    return pPr
  }
  const ind = compact({ ...pPr.ind, left: undefined, hanging: undefined, firstLine: undefined })
  const shown = { ...pPr }
  delete shown.ind
  return ind ? { ...shown, ind } : shown
}

/** Editor attributes for a paragraph's direct formatting. */
export function blockFromProperties(pPr: ParagraphProperties): BlockFormat {
  const block = { ...PLAIN_BLOCK }
  if (pPr.jc === "center") {
    block.textAlign = "center"
  } else if (pPr.jc === "right" || pPr.jc === "end") {
    block.textAlign = "right"
  } else if (pPr.jc === "both" || pPr.jc === "distribute") {
    block.textAlign = "justify"
  }
  const spacing = pPr.spacing
  if (spacing?.before !== undefined) {
    block.spaceBefore = round(spacing.before / TWIPS_PER_POINT, 2)
  }
  if (spacing?.after !== undefined) {
    block.spaceAfter = round(spacing.after / TWIPS_PER_POINT, 2)
  }
  if (spacing?.line !== undefined) {
    if (spacing.lineRule === "exact" || spacing.lineRule === "atLeast") {
      block.lineRule = spacing.lineRule === "exact" ? "exact" : "at-least"
      block.lineHeight = String(round(spacing.line / TWIPS_PER_POINT, 2))
    } else {
      block.lineHeight = String(round(spacing.line / AUTO_LINE, 2))
    }
  }
  const ind = pPr.ind
  const hanging = ind?.hanging ?? 0
  // The editor's left indent is where the first line starts; Word's is where the other lines start.
  const start = (ind?.left ?? 0) - hanging
  block.indent = Math.max(0, Math.min(INDENT_STEPS, Math.round(start / TWIPS_PER_INDENT_STEP)))
  if (ind?.right) {
    block.indentRight = Math.max(0, round(ind.right / TWIPS_PER_MM, 1))
  }
  if (hanging > 0) {
    block.specialIndent = `hanging:${round(hanging / TWIPS_PER_CM, 2)}`
  } else if (ind?.firstLine) {
    block.specialIndent = `first:${round(ind.firstLine / TWIPS_PER_CM, 2)}`
  }
  block.keepNext = pPr.keepNext === true
  block.keepLines = pPr.keepLines === true
  block.pageBreakBefore = pPr.pageBreakBefore === true
  block.widowControl = pPr.widowControl !== false
  block.contextualSpacing = pPr.contextualSpacing === true
  block.suppressLineNumbers = pPr.suppressLineNumbers === true
  block.dontHyphenate = pPr.suppressAutoHyphens === true
  block.mirrorIndents = pPr.mirrorIndents === true
  block.tightWrap = pPr.textboxTightWrap ?? "none"
  block.border = borderOfProperties(pPr.borders)
  block.borderPen = penOfProperties(pPr.borders)
  block.borderSpace = spaceOfProperties(pPr.borders)
  block.borderShadow = BORDER_SIDES.some((side) => drawn(pPr.borders?.[side]) && pPr.borders?.[side]?.shadow)
  block.borderFrame = BORDER_SIDES.some((side) => drawn(pPr.borders?.[side]) && pPr.borders?.[side]?.frame)
  block.shading = shadingOfProperties(pPr.shading)
  block.shadingPattern = shadingPatternOf(pPr.shading)
  return block
}

const TIGHT_WRAPS = ["none", "allLines", "firstAndLastLine", "firstLineOnly", "lastLineOnly"]
const BORDER_SIDES = ["top", "right", "bottom", "left"] as const
const PARAGRAPH_BORDER_SZ = 6
const PARAGRAPH_BORDER_COLOR = "1C1C1C"

function drawn(border: { value: string } | undefined) {
  return border !== undefined && border.value !== "nil" && border.value !== "none"
}

function borderOfProperties(borders: ParagraphProperties["borders"]): string | null {
  const sides = BORDER_SIDES.filter((side) => drawn(borders?.[side]))
  return sides.length === 4 ? "all" : sides.length > 0 ? sides.join(",") : null
}

const CSS_STYLES: Record<string, string> = { single: "solid", dashed: "dashed", dotted: "dotted", double: "double" }

/**
 * The pen of a paragraph's first drawn side, as the CSS shorthand the editor draws with; null when it is the app's
 * own line (so a border made in the app reads back as it was made).
 */
function penOfProperties(borders: ParagraphProperties["borders"]): string | null {
  const border = BORDER_SIDES.map((side) => borders?.[side]).find(drawn)
  if (!border) {
    return null
  }
  const sz = border.sz ?? 4
  const color = border.color && /^[0-9A-Fa-f]{6}$/.test(border.color) ? border.color.toUpperCase() : "000000"
  if (border.value === "single" && sz === PARAGRAPH_BORDER_SZ && color === PARAGRAPH_BORDER_COLOR) {
    return null
  }
  // w:sz counts eighths of a point; the editor draws in CSS pixels (0.75 pt).
  const px = Math.round((sz / 8 / 0.75) * 100) / 100
  return `${px}px ${CSS_STYLES[border.value] ?? "solid"} #${color.toLowerCase()}`
}

/** Word's gap between a paragraph's text and each side of its box, in points: top, right, bottom, left. */
const DEFAULT_SPACE = [1, 4, 1, 4]

/** The gaps the drawn sides keep (a side not drawn keeps Word's default); null when they are all Word's default. */
function spaceOfProperties(borders: ParagraphProperties["borders"]): string | null {
  const space = BORDER_SIDES.map((side, index) => {
    const border = borders?.[side]
    return drawn(border) && border?.space !== undefined ? border.space : DEFAULT_SPACE[index]
  })
  return space.every((value, index) => value === DEFAULT_SPACE[index]) ? null : space.join(" ")
}

function shadingOfProperties(shading: ParagraphProperties["shading"]): string | null {
  return shading?.fill && /^[0-9A-Fa-f]{6}$/.test(shading.fill) ? `#${shading.fill.toLowerCase()}` : null
}

/** The pattern of a w:shd and its colour, unless automatic; null for Clear. */
function shadingPatternOf(shading: ParagraphProperties["shading"]): string | null {
  if (!shading) {
    return null
  }
  const color = shading.color && /^[0-9A-Fa-f]{6}$/.test(shading.color) ? `#${shading.color}` : null
  return patternValue(shading.value, color)
}

/** The editor's fill (a hex or rgb() colour, as the picker or the browser gives it) as #rrggbb, or null. */
function paragraphFill(css: unknown): string | null {
  const hex = hexOf(css)
  return hex ? `#${hex.toLowerCase()}` : null
}

function bordersFromBlock(block: BlockFormat): ParagraphProperties["borders"] {
  const { border, borderPen: pen, borderShadow: shadow, borderFrame: frame } = block
  if (!border || border === "none") {
    return undefined
  }
  const sides = border === "all" ? [...BORDER_SIDES] : BORDER_SIDES.filter((side) => border.split(",").includes(side))
  const gaps = (block.borderSpace ?? "").split(" ").map(Number)
  const line = pen
    ? borderOf(pen)
    : { value: "single" as const, sz: PARAGRAPH_BORDER_SZ, color: PARAGRAPH_BORDER_COLOR }
  return Object.fromEntries(
    sides.map((side) => {
      const index = BORDER_SIDES.indexOf(side)
      // w:space is whole points, at most 31.
      const space = Math.min(31, Math.max(0, Math.round(gaps.length === 4 ? gaps[index] : DEFAULT_SPACE[index])))
      return [side, { ...line, space, ...(shadow ? { shadow: true } : {}), ...(frame ? { frame: true } : {}) }]
    }),
  )
}

/** HTML attributes the editor's parseHTML rules read back into exactly `block`, plus the source anchor. */
export function blockHtmlAttributes(block: BlockFormat, key?: string) {
  const style: string[] = []
  const data: string[] = []
  if (block.textAlign !== "left") {
    style.push(`text-align: ${block.textAlign}`)
  }
  if (block.spaceBefore !== null) {
    style.push(`margin-top: ${block.spaceBefore}pt`)
  }
  if (block.spaceAfter !== null) {
    style.push(`margin-bottom: ${block.spaceAfter}pt`)
  }
  if (block.lineHeight !== null) {
    style.push(`line-height: ${block.lineHeight}`)
  }
  if (block.lineRule !== "multiple") {
    data.push(`data-line-rule="${block.lineRule}"`)
  }
  if (block.indent > 0) {
    data.push(`data-indent="${block.indent}"`)
  }
  if (block.indentRight > 0) {
    data.push(`data-indent-right="${block.indentRight}"`)
  }
  if (block.specialIndent) {
    data.push(`data-special="${block.specialIndent}"`)
  }
  if (block.keepNext) {
    data.push(`data-keep-next="1"`)
  }
  if (block.keepLines) {
    data.push(`data-keep-lines="1"`)
  }
  if (block.contextualSpacing) {
    data.push(`data-context-spacing="1"`)
  }
  if (block.pageBreakBefore) {
    data.push(`data-page-break-before="1"`)
  }
  if (!block.widowControl) {
    data.push(`data-widow="0"`)
  }
  if (block.suppressLineNumbers) {
    data.push(`data-suppress-lines="1"`)
  }
  if (block.dontHyphenate) {
    data.push(`data-no-hyphen="1"`)
    style.push("hyphens: none")
  }
  if (block.mirrorIndents) {
    data.push(`data-mirror="1"`)
  }
  if (block.tightWrap !== "none") {
    data.push(`data-tight-wrap="${block.tightWrap}"`)
  }
  if (block.border) {
    data.push(`data-border="${block.border}"`)
  }
  if (block.borderPen) {
    style.push(`--para-border: ${block.borderPen}`, `--para-border-color: ${block.borderPen.split(" ")[2] ?? ""}`)
  }
  if (block.borderShadow) {
    data.push(`data-border-shadow="1"`)
  }
  if (block.borderFrame) {
    data.push(`data-border-frame="1"`)
  }
  if (block.borderSpace) {
    data.push(`data-border-space="${block.borderSpace}"`)
  }
  if (block.shading) {
    style.push(`background-color: ${block.shading}`)
  }
  const pattern = patternImage(block.shadingPattern)
  if (pattern) {
    style.push(`background-image: ${pattern}`)
    data.push(`data-shading-pattern="${block.shadingPattern}"`)
  }
  if (key) {
    data.push(`data-docx="${key}"`)
  }
  const attributes = [...(style.length > 0 ? [`style="${style.join("; ")}"`] : []), ...data]
  return attributes.length > 0 ? ` ${attributes.join(" ")}` : ""
}

/** Reads the block attributes out of an editor node's attrs, filling the editor defaults. */
export function blockFromAttrs(attrs: Record<string, unknown> | undefined): BlockFormat {
  const value = attrs ?? {}
  const text = (name: string, fallback: string) =>
    typeof value[name] === "string" && value[name] ? String(value[name]) : fallback
  const number = (name: string) => {
    const raw = value[name]
    const parsed = typeof raw === "number" ? raw : typeof raw === "string" && raw !== "" ? Number(raw) : NaN
    return Number.isFinite(parsed) ? parsed : null
  }
  const flag = (name: keyof BlockFormat) =>
    typeof value[name] === "boolean" ? Boolean(value[name]) : PLAIN_BLOCK[name]
  const lineHeight = value.lineHeight
  return {
    textAlign: text("textAlign", "left"),
    spaceBefore: number("spaceBefore"),
    spaceAfter: number("spaceAfter"),
    lineHeight:
      typeof lineHeight === "string" && lineHeight
        ? lineHeight
        : typeof lineHeight === "number"
          ? String(lineHeight)
          : null,
    lineRule: text("lineRule", "multiple"),
    indent: Math.max(0, Math.min(INDENT_STEPS, Math.round(number("indent") ?? 0))),
    indentRight: Math.max(0, number("indentRight") ?? 0),
    specialIndent: text("specialIndent", ""),
    keepNext: flag("keepNext") as boolean,
    keepLines: flag("keepLines") as boolean,
    pageBreakBefore: flag("pageBreakBefore") as boolean,
    widowControl: flag("widowControl") as boolean,
    contextualSpacing: flag("contextualSpacing") as boolean,
    suppressLineNumbers: flag("suppressLineNumbers") as boolean,
    dontHyphenate: flag("dontHyphenate") as boolean,
    mirrorIndents: flag("mirrorIndents") as boolean,
    tightWrap: TIGHT_WRAPS.includes(text("tightWrap", "none")) ? text("tightWrap", "none") : "none",
    border: text("border", "") && text("border", "") !== "none" ? text("border", "") : null,
    borderPen: text("borderPen", "") || null,
    borderShadow: value.borderShadow === true,
    borderFrame: value.borderFrame === true,
    borderSpace: text("borderSpace", "") || null,
    shading: paragraphFill(value.shading),
    shadingPattern: patternOf(value.shadingPattern) ? text("shadingPattern", "") : null,
  }
}

/**
 * w:pPr for an edited paragraph. Starts from the source paragraph's properties and changes only the fields whose
 * editor value differs from what the source projected to, so unedited values keep Word's exact twips and
 * everything the editor cannot show (tabs, borders, outline level) survives.
 */
export function propertiesFromBlock(
  edited: BlockFormat,
  source: ParagraphProperties | undefined,
  shown: ParagraphProperties | undefined = source,
): ParagraphProperties {
  const base: ParagraphProperties = source ? structuredClone(source) : {}
  // What the editor was given (a list paragraph is shown without its indent); a field that still matches is kept.
  const before = shown ? blockFromProperties(shown) : PLAIN_BLOCK
  const changed = new Set<keyof BlockFormat>()
  for (const group of GROUPS) {
    if (group.some((field) => edited[field] !== before[field])) {
      group.forEach((field) => changed.add(field))
    }
  }
  if (changed.has("textAlign")) {
    base.jc =
      edited.textAlign === "center"
        ? "center"
        : edited.textAlign === "right"
          ? "right"
          : edited.textAlign === "justify"
            ? "both"
            : "left"
  }
  if (changed.has("spaceBefore") || changed.has("spaceAfter") || changed.has("lineHeight")) {
    base.spacing = editedSpacing(base.spacing, edited, changed)
  }
  if (changed.has("indent") || changed.has("specialIndent") || changed.has("indentRight")) {
    base.ind = editedIndent(base.ind, edited, changed)
  }
  for (const field of ["keepNext", "keepLines", "pageBreakBefore", "widowControl", "contextualSpacing"] as const) {
    if (changed.has(field)) {
      base[field] = edited[field]
    }
  }
  if (changed.has("suppressLineNumbers")) {
    base.suppressLineNumbers = edited.suppressLineNumbers
  }
  if (changed.has("dontHyphenate")) {
    base.suppressAutoHyphens = edited.dontHyphenate
  }
  if (changed.has("mirrorIndents")) {
    base.mirrorIndents = edited.mirrorIndents
  }
  if (changed.has("tightWrap")) {
    if (edited.tightWrap === "none") {
      delete base.textboxTightWrap
    } else {
      base.textboxTightWrap = edited.tightWrap as ParagraphProperties["textboxTightWrap"]
    }
  }
  if (changed.has("border")) {
    const borders = bordersFromBlock(edited)
    if (borders) {
      base.borders = borders
    } else {
      delete base.borders
    }
  }
  if (changed.has("shading")) {
    const fill = edited.shading?.replace("#", "").toUpperCase()
    const pattern = patternOf(edited.shadingPattern)
    const hasFill = Boolean(fill && /^[0-9A-F]{6}$/.test(fill))
    if (hasFill || pattern) {
      base.shading = {
        value: (pattern?.pattern ?? "clear") as ShadingValue,
        color: pattern?.color?.replace("#", "").toUpperCase() ?? "auto",
        fill: hasFill ? fill : "auto",
      }
    } else {
      delete base.shading
    }
  }
  return base
}

function editedSpacing(current: Spacing | undefined, edited: BlockFormat, changed: Set<keyof BlockFormat>) {
  const spacing: Spacing = { ...current }
  if (changed.has("spaceBefore")) {
    spacing.before = edited.spaceBefore === null ? undefined : Math.round(edited.spaceBefore * TWIPS_PER_POINT)
  }
  if (changed.has("spaceAfter")) {
    spacing.after = edited.spaceAfter === null ? undefined : Math.round(edited.spaceAfter * TWIPS_PER_POINT)
  }
  if (changed.has("lineHeight")) {
    const amount = edited.lineHeight === null ? NaN : Number.parseFloat(edited.lineHeight)
    if (!Number.isFinite(amount) || amount <= 0) {
      spacing.line = undefined
      spacing.lineRule = undefined
    } else if (edited.lineRule === "exact" || edited.lineRule === "at-least") {
      spacing.line = Math.round(amount * TWIPS_PER_POINT)
      spacing.lineRule = edited.lineRule === "exact" ? "exact" : "atLeast"
    } else {
      spacing.line = Math.round(amount * AUTO_LINE)
      spacing.lineRule = "auto"
    }
  }
  return compact(spacing)
}

function editedIndent(current: Indent | undefined, edited: BlockFormat, changed: Set<keyof BlockFormat>) {
  const ind: Indent = { ...current }
  const oldHanging = ind.hanging ?? 0
  const start = changed.has("indent") ? edited.indent * TWIPS_PER_INDENT_STEP : (ind.left ?? 0) - oldHanging
  if (changed.has("specialIndent")) {
    const [kind, raw] = edited.specialIndent.split(":")
    const amount = Math.round(Number(raw) * TWIPS_PER_CM)
    ind.firstLine = kind === "first" && amount > 0 ? amount : undefined
    ind.hanging = kind === "hanging" && amount > 0 ? amount : undefined
  }
  if (changed.has("indent") || changed.has("specialIndent")) {
    const left = start + (ind.hanging ?? 0)
    ind.left = left > 0 || current?.left !== undefined ? left : undefined
  }
  if (changed.has("indentRight")) {
    const right = Math.round(edited.indentRight * TWIPS_PER_MM)
    ind.right = right > 0 || current?.right !== undefined ? right : undefined
  }
  return compact(ind)
}

function compact<T extends object>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, item]) => item !== undefined)
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined
}

function round(value: number, digits: number) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}
