import { decodeXml } from "@/document/docx/xml"
import {
  paragraphsIn,
  type Border,
  type CellMargins,
  type ParagraphProperties,
  type RunProperties,
  type Shading,
  type Style,
  type Table,
  type TableBorders,
  type TableCondition,
  type TableStylePart,
  type WordDocument,
} from "@/document/docx/model"

/** Typefaces of the document theme's major (headings) and minor (body) fonts. */
export type ThemeFonts = {
  majorLatin: string
  minorLatin: string
  majorEastAsia: string
  minorEastAsia: string
  majorBidi: string
  minorBidi: string
}

const NO_THEME: ThemeFonts = {
  majorLatin: "",
  minorLatin: "",
  majorEastAsia: "",
  minorEastAsia: "",
  majorBidi: "",
  minorBidi: "",
}

/**
 * Metric-compatible stand-ins for Office fonts that Linux and macOS often lack, so text wraps as it does in
 * Word when the original is not installed.
 */
const STAND_INS: Record<string, string[]> = {
  calibri: ["Carlito"],
  "calibri light": ["Carlito"],
  cambria: ["Caladea"],
  arial: ["Liberation Sans", "Arimo"],
  "times new roman": ["Liberation Serif", "Tinos"],
  "courier new": ["Liberation Mono", "Cousine"],
  aptos: ["Carlito"],
  "aptos display": ["Carlito"],
}
/**
 * Height of one line in each font as a multiple of its size (ascent, descent and line gap), which is what Word
 * calls single spacing. Fonts not listed use a typical value.
 */
const SINGLE_LINE: Record<string, number> = {
  calibri: 1.22,
  "calibri light": 1.22,
  carlito: 1.22,
  aptos: 1.21,
  "aptos display": 1.21,
  cambria: 1.17,
  caladea: 1.17,
  arial: 1.15,
  "liberation sans": 1.15,
  helvetica: 1.15,
  "times new roman": 1.15,
  "liberation serif": 1.15,
  "courier new": 1.13,
  georgia: 1.14,
  verdana: 1.22,
  tahoma: 1.21,
  "segoe ui": 1.33,
  garamond: 1.12,
  "century gothic": 1.23,
}
const TYPICAL_LINE = 1.17

export function singleLine(face: string | undefined) {
  return SINGLE_LINE[(face ?? "").toLowerCase()] ?? TYPICAL_LINE
}

const SERIF = /cambria|times|georgia|garamond|book antiqua|palatino|serif/i
const MONO = /courier|consolas|mono/i

export function themeFontsOf(doc: WordDocument): ThemeFonts {
  const part = doc.preserved?.parts.find((item) => /\/theme\/theme\d*\.xml$/i.test(item.name))
  if (!part) {
    return NO_THEME
  }
  const xml = decodeXml(part.data)
  const face = (group: "majorFont" | "minorFont", script: "latin" | "ea" | "cs") => {
    const block = new RegExp(`<(?:\\w+:)?${group}>([\\s\\S]*?)</(?:\\w+:)?${group}>`).exec(xml)?.[1] ?? ""
    return new RegExp(`<(?:\\w+:)?${script}\\b[^>]*typeface="([^"]*)"`).exec(block)?.[1] ?? ""
  }
  return {
    majorLatin: face("majorFont", "latin"),
    minorLatin: face("minorFont", "latin"),
    majorEastAsia: face("majorFont", "ea"),
    minorEastAsia: face("minorFont", "ea"),
    majorBidi: face("majorFont", "cs"),
    minorBidi: face("minorFont", "cs"),
  }
}

function themeFace(name: string | undefined, theme: ThemeFonts) {
  if (!name) {
    return undefined
  }
  const major = name.startsWith("major")
  const latin = major ? theme.majorLatin : theme.minorLatin
  if (name.endsWith("EastAsia")) {
    return (major ? theme.majorEastAsia : theme.minorEastAsia) || latin || undefined
  }
  if (name.endsWith("Bidi")) {
    return (major ? theme.majorBidi : theme.minorBidi) || latin || undefined
  }
  return latin || undefined
}

/** The Latin typeface a run shows: a theme font wins over the explicit name, as in Word. */
export function fontOf(fonts: RunProperties["rFonts"], theme: ThemeFonts) {
  return (
    themeFace(fonts?.asciiTheme, theme) ||
    fonts?.ascii ||
    themeFace(fonts?.hAnsiTheme, theme) ||
    fonts?.hAnsi ||
    undefined
  )
}

/** A CSS font-family list: the Word typeface, its metric-compatible stand-ins, and a generic family. */
export function fontStack(face: string) {
  const generic = MONO.test(face) ? "monospace" : SERIF.test(face) ? "serif" : "sans-serif"
  const names = [face, ...(STAND_INS[face.toLowerCase()] ?? [])]
  return [...names.map((name) => `'${name.replace(/'/g, "")}'`), generic].join(", ")
}

type Resolved = { pPr: ParagraphProperties; rPr: RunProperties }

function mergeParagraph(base: ParagraphProperties, next: ParagraphProperties): ParagraphProperties {
  return {
    ...base,
    ...next,
    spacing: base.spacing || next.spacing ? { ...base.spacing, ...next.spacing } : undefined,
    ind: base.ind || next.ind ? { ...base.ind, ...next.ind } : undefined,
  }
}

function mergeRun(base: RunProperties, next: RunProperties): RunProperties {
  return {
    ...base,
    ...next,
    rFonts: base.rFonts || next.rFonts ? { ...base.rFonts, ...next.rFonts } : undefined,
  }
}

/** A style with everything it inherits through basedOn, starting from `start`. */
/** A style's properties with those it is based on (and the document defaults) under them. */
export function resolvedStyle(doc: WordDocument, id: string) {
  const styles = new Map(doc.styles.styles.map((style) => [style.id, style]))
  return resolveStyle(id, styles, { pPr: doc.styles.docDefaults.pPr, rPr: doc.styles.docDefaults.rPr })
}

function resolveStyle(id: string, styles: Map<string, Style>, start: Resolved): Resolved {
  const chain: Style[] = []
  const seen = new Set<string>()
  for (let style = styles.get(id); style && !seen.has(style.id); style = styles.get(style.basedOn ?? "")) {
    seen.add(style.id)
    chain.unshift(style)
  }
  return chain.reduce(
    (resolved, style) => ({ pPr: mergeParagraph(resolved.pPr, style.pPr), rPr: mergeRun(resolved.rPr, style.rPr) }),
    start,
  )
}

function runCss(props: RunProperties, theme: ThemeFonts, complete: boolean) {
  const rules: string[] = []
  const face = fontOf(props.rFonts, theme)
  if (face) {
    rules.push(`font-family: ${fontStack(face)}`)
  }
  if (props.sz) {
    rules.push(`font-size: ${props.sz / 2}pt`)
  } else if (complete) {
    // Word's size when nothing sets one.
    rules.push("font-size: 10pt")
  }
  if (props.color && props.color !== "auto") {
    rules.push(`color: #${props.color}`)
  } else if (complete) {
    rules.push("color: #000000")
  }
  if (props.b !== undefined || complete) {
    rules.push(`font-weight: ${props.b ? "bold" : "normal"}`)
  }
  if (props.i !== undefined || complete) {
    rules.push(`font-style: ${props.i ? "italic" : "normal"}`)
  }
  if (props.caps) {
    rules.push("text-transform: uppercase")
  }
  if (props.smallCaps) {
    rules.push("font-variant: small-caps")
  }
  const lines = [
    props.u && props.u.value !== "none" ? "underline" : "",
    props.strike || props.dstrike ? "line-through" : "",
  ].filter(Boolean)
  if (lines.length > 0) {
    rules.push(`text-decoration: ${lines.join(" ")}`)
  }
  return rules
}

/** Spacing and alignment. Indents only outside lists, which the editor indents itself. */
function paragraphCss(props: ParagraphProperties, complete: boolean, line: number) {
  const rules: string[] = []
  const spacing = props.spacing
  if (spacing?.before !== undefined || complete) {
    rules.push(`margin-top: ${(spacing?.before ?? 0) / 20}pt`)
  }
  if (spacing?.after !== undefined || complete) {
    rules.push(`margin-bottom: ${(spacing?.after ?? 0) / 20}pt`)
  }
  if (spacing?.line !== undefined) {
    const rule = spacing.lineRule
    rules.push(
      rule === "exact" || rule === "atLeast"
        ? `line-height: ${spacing.line / 20}pt`
        : `line-height: ${Math.round((spacing.line / 240) * line * 1000) / 1000}`,
    )
  } else if (complete) {
    rules.push(`line-height: ${line}`)
  }
  if (props.jc) {
    const align = { both: "justify", distribute: "justify", center: "center", right: "right", end: "right" }[
      props.jc as string
    ]
    rules.push(`text-align: ${align ?? "left"}`)
  } else if (complete) {
    rules.push("text-align: left")
  }
  return rules
}

function indentCss(props: ParagraphProperties) {
  const ind = props.ind
  if (!ind) {
    return []
  }
  const rules: string[] = []
  if (ind.left !== undefined) {
    rules.push(`margin-left: ${ind.left / 20}pt`)
  }
  if (ind.right !== undefined) {
    rules.push(`margin-right: ${ind.right / 20}pt`)
  }
  if (ind.hanging) {
    rules.push(`text-indent: -${ind.hanging / 20}pt`)
  } else if (ind.firstLine !== undefined) {
    rules.push(`text-indent: ${ind.firstLine / 20}pt`)
  }
  return rules
}

/**
 * Word drops a paragraph's space before and after next to a paragraph of the same style when either its style or
 * the paragraph itself asks for contextual spacing. Paragraphs in list items are compared through their items.
 * Important, because it also overrides spacing set directly on the paragraph (inline in the editor).
 */
function contextualRules(page: string, same: string, fromStyle: boolean) {
  const own = fromStyle ? same : `${same}[data-context-spacing="1"]`
  return [
    `${page} ${same} + ${own}, ${page} li:has(> ${same}) + li > ${own} { margin-top: 0 !important; }`,
    `${page} ${own}:has(+ ${same}), ${page} li:has(+ li > ${same}) > ${own} { margin-bottom: 0 !important; }`,
  ]
}

function rule(selector: string, declarations: string[]) {
  return declarations.length > 0 ? `${selector} { ${declarations.join("; ")}; }` : ""
}

function cssString(value: string) {
  return value.replace(/["\\]/g, "\\$&")
}

/**
 * CSS that makes the editor show the document as Word does: document defaults and the default paragraph style
 * on the page, each paragraph style on paragraphs carrying its id (data-word-style), heading styles on h1–h6,
 * and character styles on runs carrying theirs (data-word-rstyle). Direct formatting stays inline and wins.
 */
export function documentStyleSheet(doc: WordDocument): string {
  const theme = themeFontsOf(doc)
  const styles = new Map(doc.styles.styles.map((style) => [style.id, style]))
  const defaults: Resolved = { pPr: doc.styles.docDefaults.pPr, rPr: doc.styles.docDefaults.rPr }
  const normal = doc.styles.styles.find((style) => style.type === "paragraph" && style.default) ?? styles.get("Normal")
  const base = normal ? resolveStyle(normal.id, styles, defaults) : defaults
  // :root raises specificity above the app stylesheet's .page-editor rules whatever order they load in.
  const page = ":root .page-editor"
  const line = singleLine(fontOf(base.rPr.rFonts, theme))
  const css = [
    rule(page, [...runCss(base.rPr, theme, true), `--word-single-line: ${line}`]),
    rule(`${page} p, ${page} li > p`, paragraphCss(base.pPr, true, line)),
    rule(`${page} :is(h1, h2, h3, h4, h5, h6)`, [
      ...runCss(base.rPr, theme, true),
      ...paragraphCss(base.pPr, true, line),
    ]),
  ]
  // Rules only for styles that need them: :has() selectors cost style recalculation on every edit.
  const direct = new Set(
    paragraphsIn(doc.blocks)
      .filter((paragraph) => paragraph.pPr.contextualSpacing)
      .map((paragraph) => paragraph.styleId ?? ""),
  )
  if (base.pPr.contextualSpacing || direct.has("")) {
    css.push(...contextualRules(page, "p:not([data-word-style])", base.pPr.contextualSpacing === true))
  }
  for (const style of doc.styles.styles) {
    const fromStyle =
      style.type === "paragraph" && resolveStyle(style.id, styles, defaults).pPr.contextualSpacing === true
    if (fromStyle || direct.has(style.id)) {
      const heading = /^Heading([1-6])$/i.exec(style.id)?.[1]
      const same = heading ? `h${heading}` : `p[data-word-style="${cssString(style.id)}"]`
      css.push(...contextualRules(page, same, fromStyle))
    }
    if (style.type === "paragraph" && style.id !== normal?.id) {
      const resolved = resolveStyle(style.id, styles, defaults)
      const own = singleLine(fontOf(resolved.rPr.rFonts, theme))
      const declarations = [...runCss(resolved.rPr, theme, true), ...paragraphCss(resolved.pPr, true, own)]
      const heading = /^Heading([1-6])$/i.exec(style.id)?.[1]
      const selector = heading ? `${page} h${heading}` : `${page} p[data-word-style="${cssString(style.id)}"]`
      css.push(rule(selector, declarations))
      if (!heading) {
        css.push(rule(`${page} :not(li) > p[data-word-style="${cssString(style.id)}"]`, indentCss(resolved.pPr)))
      }
    } else if (style.type === "table") {
      css.push(...tableStyleCss(page, style, styles, theme, line))
    } else if (style.type === "character") {
      const resolved = resolveStyle(style.id, styles, { pPr: {}, rPr: {} })
      css.push(rule(`${page} [data-word-rstyle="${cssString(style.id)}"]`, runCss(resolved.rPr, theme, false)))
    }
  }
  return css.filter(Boolean).join("\n")
}

/** A Word border as a CSS border shorthand. */
export function borderCss(border: Border | undefined) {
  if (!border || border.value === "none" || border.value === "nil") {
    return "none"
  }
  const width = Math.max((border.sz ?? 4) / 8, 0.25)
  const style =
    border.value === "double"
      ? "double"
      : border.value === "dotted"
        ? "dotted"
        : /dash/i.test(border.value)
          ? "dashed"
          : "solid"
  const color = border.color && border.color !== "auto" ? `#${border.color}` : "#000000"
  // A double line needs room for two strokes and the gap between them.
  return `${style === "double" ? Math.max(width * 3, 2.25) : width}pt ${style} ${color}`
}

/** The colour a cell's shading paints. */
export function shadingColor(shading: Shading | undefined) {
  if (!shading) {
    return undefined
  }
  if (shading.value === "solid" && shading.color && shading.color !== "auto") {
    return `#${shading.color}`
  }
  return shading.fill && shading.fill !== "auto" ? `#${shading.fill}` : undefined
}

function twips(value: number | undefined) {
  return `${(value ?? 0) / 20}pt`
}

/** Custom properties that the base table rules (index.css) place on cell edges and padding. */
export function tableVariables(borders: TableBorders | undefined, margins: CellMargins | undefined) {
  const rules: string[] = []
  for (const side of ["top", "left", "bottom", "right", "insideH", "insideV"] as const) {
    if (borders?.[side]) {
      rules.push(`--wb-${side}: ${borderCss(borders[side])}`)
    }
  }
  for (const side of ["top", "left", "bottom", "right"] as const) {
    const margin = margins?.[side]
    if (margin && margin.type === "dxa") {
      rules.push(`--wc-${side}: ${twips(margin.value)}`)
    }
  }
  return rules
}

/** Borders, padding, shading and alignment of cells. */
export function cellCss(part: {
  borders?: TableBorders
  margins?: CellMargins
  shading?: Shading
  vAlign?: TableStylePart["vAlign"]
}) {
  const rules: string[] = []
  for (const side of ["top", "left", "bottom", "right"] as const) {
    if (part.borders?.[side]) {
      rules.push(`border-${side}: ${borderCss(part.borders[side])}`)
    }
    const margin = part.margins?.[side]
    if (margin && margin.type === "dxa") {
      rules.push(`padding-${side}: ${twips(margin.value)}`)
    }
  }
  const color = shadingColor(part.shading)
  if (color) {
    rules.push(`background-color: ${color}`)
  }
  const diagonals = [
    ["tl2br", "to top right"],
    ["tr2bl", "to top left"],
  ].flatMap(([name, direction]) => {
    const border = part.borders?.[name as "tl2br" | "tr2bl"]
    if (!border || border.value === "none" || border.value === "nil") {
      return []
    }
    const line = borderCss(border).split(" ").pop() ?? "#000000"
    return [
      `linear-gradient(${direction}, transparent calc(50% - 0.75px), ${line} calc(50% - 0.75px), ${line} calc(50% + 0.75px), transparent calc(50% + 0.75px))`,
    ]
  })
  if (diagonals.length > 0) {
    rules.push(`background-image: ${diagonals.join(", ")}`)
  }
  if (part.vAlign) {
    rules.push(`vertical-align: ${part.vAlign === "center" ? "middle" : part.vAlign}`)
  }
  return rules
}

/** Look tokens (data-word-look) for which conditional parts of the table style apply. */
export function tableLookTokens(look: Table["look"]) {
  // Explicit flags win; a look written only as the legacy hex value is read from its bits.
  const explicit = [look?.firstRow, look?.lastRow, look?.firstColumn, look?.lastColumn, look?.noHBand, look?.noVBand]
  const bits = look?.val && explicit.every((value) => value === undefined) ? Number.parseInt(look.val, 16) : undefined
  const flag = (value: boolean | undefined, bit: number) => value ?? (bits !== undefined ? (bits & bit) !== 0 : false)
  if (!look) {
    // Word's look for a table that does not say: header row, first column, no column banding.
    return "firstRow firstColumn noVBand"
  }
  return [
    flag(look.firstRow, 0x20) ? "firstRow" : "",
    flag(look.lastRow, 0x40) ? "lastRow" : "",
    flag(look.firstColumn, 0x80) ? "firstColumn" : "",
    flag(look.lastColumn, 0x100) ? "lastColumn" : "",
    flag(look.noHBand, 0x200) ? "noHBand" : "",
    flag(look.noVBand, 0x400) ? "noVBand" : "",
  ]
    .filter(Boolean)
    .join(" ")
}

/** Which cells each conditional part covers, as [look condition, cell selector] pairs. */
const CONDITION_CELLS: Record<TableCondition, [string, string][]> = {
  band1Vert: [
    [`[data-word-look~="firstColumn"]:not([data-word-look~="noVBand"])`, "tr > td:nth-child(even)"],
    [`:not([data-word-look~="firstColumn"]):not([data-word-look~="noVBand"])`, "tr > td:nth-child(odd)"],
  ],
  band2Vert: [
    [`[data-word-look~="firstColumn"]:not([data-word-look~="noVBand"])`, "tr > td:nth-child(odd)"],
    [`:not([data-word-look~="firstColumn"]):not([data-word-look~="noVBand"])`, "tr > td:nth-child(even)"],
  ],
  band1Horz: [
    [`[data-word-look~="firstRow"]:not([data-word-look~="noHBand"])`, "tr:nth-child(even) > td"],
    [`:not([data-word-look~="firstRow"]):not([data-word-look~="noHBand"])`, "tr:nth-child(odd) > td"],
  ],
  band2Horz: [
    [`[data-word-look~="firstRow"]:not([data-word-look~="noHBand"])`, "tr:nth-child(odd) > td"],
    [`:not([data-word-look~="firstRow"]):not([data-word-look~="noHBand"])`, "tr:nth-child(even) > td"],
  ],
  firstCol: [[`[data-word-look~="firstColumn"]`, "tr > td:first-child"]],
  lastCol: [[`[data-word-look~="lastColumn"]`, "tr > td:last-child"]],
  firstRow: [[`[data-word-look~="firstRow"]`, "tr:first-child > td"]],
  lastRow: [[`[data-word-look~="lastRow"]`, "tr:last-child > td"]],
  nwCell: [[`[data-word-look~="firstRow"][data-word-look~="firstColumn"]`, "tr:first-child > td:first-child"]],
  neCell: [[`[data-word-look~="firstRow"][data-word-look~="lastColumn"]`, "tr:first-child > td:last-child"]],
  swCell: [[`[data-word-look~="lastRow"][data-word-look~="firstColumn"]`, "tr:last-child > td:first-child"]],
  seCell: [[`[data-word-look~="lastRow"][data-word-look~="lastColumn"]`, "tr:last-child > td:last-child"]],
}

/**
 * CSS for a table style. Every selector past the table's style id sits in :where(), so all parts weigh the same
 * and the later, more specific Word part (header row after banding) wins, as in Word. Direct cell formatting is
 * inline and wins over all of them.
 */
function tableStyleCss(page: string, style: Style, styles: Map<string, Style>, theme: ThemeFonts, line: number) {
  // A table style inherits whole parts through basedOn.
  const chain: Style[] = []
  for (let item: Style | undefined = style; item && !chain.includes(item); item = styles.get(item.basedOn ?? "")) {
    chain.unshift(item)
  }
  const whole = chain.reduce<TableStylePart>(
    (merged, item) => {
      const next = item.table?.whole
      return next
        ? {
            pPr: mergeParagraph(merged.pPr, next.pPr),
            rPr: mergeRun(merged.rPr, next.rPr),
            borders: next.borders ?? merged.borders,
            margins: next.margins ?? merged.margins,
            shading: next.shading ?? merged.shading,
            vAlign: next.vAlign ?? merged.vAlign,
          }
        : merged
    },
    { pPr: {}, rPr: {} },
  )
  const table = `${page} table[data-word-table-style="${cssString(style.id)}"]`
  const css = [
    rule(table, tableVariables(whole.borders, whole.margins)),
    rule(`${table} :where(td)`, cellCss({ shading: whole.shading, vAlign: whole.vAlign })),
    // Table style formatting reaches paragraphs that keep the default paragraph style, as in Word.
    rule(`${table} :where(td p:not([data-word-style]))`, [
      ...runCss(whole.rPr, theme, false),
      ...paragraphCss(whole.pPr, false, line),
    ]),
  ]
  for (const condition of Object.keys(CONDITION_CELLS) as TableCondition[]) {
    const part = chain.reduce<TableStylePart | undefined>(
      (found, item) => item.table?.conditions[condition] ?? found,
      undefined,
    )
    if (!part) {
      continue
    }
    for (const [look, cells] of CONDITION_CELLS[condition]) {
      css.push(rule(`${table}:where(${look}) :where(${cells})`, cellCss(part)))
      css.push(
        rule(`${table}:where(${look}) :where(${cells} p)`, [
          ...runCss(part.rPr, theme, false),
          ...paragraphCss(part.pPr, false, line),
        ]),
      )
    }
  }
  return css
}
