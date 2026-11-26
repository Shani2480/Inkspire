import { fontFamilies, fontLines } from "@/document/docx/font-metrics"
import { fontAvailable } from "@/document/optional-fonts"
import { gridLineStyleSheet, leadBase, multipleLineVars, ruleLineHeight, wordDescent } from "@/document/line-lead"
import { patternImage, patternValue } from "@/document/docx/shading-pattern"
import { decodeXml } from "@/document/docx/xml"
import {
  defaultsOf,
  mergeFonts,
  paragraphsIn,
  resolveRunProperties,
  type Border,
  type CellMargins,
  type ParagraphProperties,
  type RunProperties,
  type Shading,
  type ThemeColorRef,
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
  /** The theme's colour scheme by slot (dk1, lt1, dk2, lt2, accent1–6, hlink, folHlink), #rrggbb. */
  colors: Record<string, string>
}

/** Word's Office theme colours, used when a document has no theme part. */
export const OFFICE_THEME_COLORS: Record<string, string> = {
  dk1: "#000000",
  lt1: "#ffffff",
  dk2: "#0e2841",
  lt2: "#e8e8e8",
  accent1: "#156082",
  accent2: "#e97132",
  accent3: "#196b24",
  accent4: "#0f9ed5",
  accent5: "#a02b93",
  accent6: "#4ea72e",
  hlink: "#467886",
  folHlink: "#96607d",
}

/** The colour-scheme slot each of w:color's theme colour names reads. */
const THEME_SLOTS: Record<string, string> = {
  dark1: "dk1",
  text1: "dk1",
  light1: "lt1",
  background1: "lt1",
  dark2: "dk2",
  text2: "dk2",
  light2: "lt2",
  background2: "lt2",
  hyperlink: "hlink",
  followedHyperlink: "folHlink",
}

/**
 * A theme colour as Word draws it: the scheme's colour with its luminance scaled (shade) or moved toward white
 * (tint) in HSL, e.g. accent1 #4472C4 with shade BF is #2F5496.
 */
export function themeColor(
  name: string,
  colors: Record<string, string>,
  tint?: string,
  shade?: string,
): string | undefined {
  const base = colors[THEME_SLOTS[name] ?? name]
  if (!base) {
    return undefined
  }
  if (!tint && !shade) {
    return base
  }
  const [h, s, l] = toHsl(base)
  let light = l
  if (shade) {
    light = l * (parseInt(shade, 16) / 255)
  }
  if (tint) {
    const t = parseInt(tint, 16) / 255
    light = light * t + (1 - t)
  }
  return fromHsl(h, s, Math.max(0, Math.min(1, light)))
}

function toHsl(hex: string): [number, number, number] {
  const value = parseInt(hex.replace("#", ""), 16)
  const r = ((value >> 16) & 255) / 255
  const g = ((value >> 8) & 255) / 255
  const b = (value & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) {
    return [0, 0, l]
  }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}

function fromHsl(h: number, s: number, l: number) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    const v = x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p
    return Math.floor(v * 255 + 1e-6)
      .toString(16)
      .padStart(2, "0")
  }
  return `#${s === 0 ? channel(l).repeat(3) : channel(h + 1 / 3) + channel(h) + channel(h - 1 / 3)}`
}

/** The colour scheme of a theme part (theme1.xml), by slot. */
export function themeColorsOf(xml: string): Record<string, string> {
  const scheme = /<(?:\w+:)?clrScheme\b[\s\S]*?<\/(?:\w+:)?clrScheme>/.exec(xml)?.[0]
  if (!scheme) {
    return { ...OFFICE_THEME_COLORS }
  }
  const colors: Record<string, string> = {}
  for (const slot of Object.keys(OFFICE_THEME_COLORS)) {
    const block = new RegExp(`<(?:\\w+:)?${slot}>([\\s\\S]*?)</(?:\\w+:)?${slot}>`).exec(scheme)?.[1] ?? ""
    const value = /lastClr="([0-9A-Fa-f]{6})"/.exec(block)?.[1] ?? /val="([0-9A-Fa-f]{6})"/.exec(block)?.[1]
    colors[slot] = value ? `#${value.toLowerCase()}` : OFFICE_THEME_COLORS[slot]!
  }
  return colors
}

/** Without a theme part, Word draws theme fonts from its own Office theme. */
const NO_THEME: ThemeFonts = {
  majorLatin: "Aptos Display",
  minorLatin: "Aptos",
  majorEastAsia: "",
  minorEastAsia: "",
  majorBidi: "",
  minorBidi: "",
  colors: OFFICE_THEME_COLORS,
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
  // Within half a percent of Arial Nova Cond's widths (Android has it as sans-serif-condensed).
  "arial nova cond": ["Roboto Condensed", "sans-serif-condensed"],
  // Same widths as Arial Narrow (Helvetica Narrow's metrics).
  "arial narrow": ["Liberation Sans Narrow", "Nimbus Sans Narrow"],
}
/**
 * Height of one line in each font as a multiple of its size (ascent, descent and line gap), which is what Word
 * calls single spacing. Fonts not listed use a typical value.
 */
const SINGLE_LINE: Record<string, number> = {
  calibri: 1.22,
  "calibri light": 1.22,
  carlito: 1.22,
  aptos: 1.22,
  "aptos display": 1.22,
  symbol: 1.22,
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
  const key = (face ?? "").toLowerCase()
  const known = fontLines.get(key)?.line ?? SINGLE_LINE[key]
  if (known !== undefined) {
    return known
  }
  // A font the page cannot draw is drawn in Word's substitute, so its lines are the substitute's.
  const substitute = face && !STAND_INS[key] ? wordSubstitute(face) : undefined
  return substitute && !drawable(face!) ? SINGLE_LINE[substitute[0]!.toLowerCase()]! : TYPICAL_LINE
}

const drawn = new Map<string, boolean>()
function drawable(face: string) {
  const key = face.toLowerCase()
  if (!drawn.has(key)) {
    drawn.set(key, fontAvailable(face))
  }
  return drawn.get(key)!
}

/**
 * The font Word draws in place of one it does not have, with its same-width stand-in: Cambria for a font the
 * document's font table calls roman (or a serif by name, where the table says nothing), Calibri for any other.
 * Symbol and monospaced fonts keep their own fallbacks.
 */
function wordSubstitute(face: string): string[] | undefined {
  const family = fontFamilies.get(face.toLowerCase())
  if (family === "decorative" || /symbol|wingdings|webdings|dings/i.test(face) || MONO.test(face)) {
    return undefined
  }
  return family === "roman" || (!family && SERIF.test(face)) ? ["Cambria", "Caladea"] : ["Calibri", "Carlito"]
}

/** How far a font rises above its baseline in Word's line, as a fraction of its size; undefined for a font not listed. */
export function wordAscent(face: string | undefined) {
  const key = (face ?? "").toLowerCase()
  const line = fontLines.get(key)?.line ?? SINGLE_LINE[key]
  return line === undefined ? undefined : Math.round((line - wordDescent(face)) * 1000) / 1000
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
    colors: themeColorsOf(xml),
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
  const roman = SERIF.test(face) || fontFamilies.get(face.toLowerCase()) === "roman"
  const generic = MONO.test(face) ? "monospace" : roman ? "serif" : "sans-serif"
  const names = [face, ...(STAND_INS[face.toLowerCase()] ?? wordSubstitute(face) ?? [])]
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
    rFonts: mergeFonts(base.rFonts, next.rFonts),
  }
}

/**
 * Word draws text of automatic colour white on dark shading and black elsewhere. A dark fill (a cell's, a
 * paragraph's) sets the colour its automatic text inherits; "" for a light or unknown fill.
 */
export function autoColorRule(fill: string | null | undefined) {
  const value = (fill ?? "").trim()
  const hex = /^#?([0-9a-f]{6})$/i.exec(value)?.[1]
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value)
  const channels = hex
    ? [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16))
    : rgb && (rgb[4] === undefined || Number(rgb[4]) > 0.5)
      ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
      : null
  if (!channels) {
    return ""
  }
  const [red, green, blue] = channels as [number, number, number]
  return 0.299 * red + 0.587 * green + 0.114 * blue < 128 ? "--word-auto-color: #ffffff" : ""
}

/** Toggles (and a colour) a run can switch off against its styles, as `data-run-off` tokens (index.css draws them). */
const OFF_TOKENS = ["b", "i", "caps", "smallCaps", "u", "strike", "color"] as const
export type RunOffToken = (typeof OFF_TOKENS)[number]

const shownCache = new WeakMap<WordDocument, Map<string, { para: RunProperties; char: RunProperties }>>()

/** The paragraph style a paragraph without its own takes (Word's default paragraph style). */
export function defaultParagraphStyleId(doc: WordDocument) {
  return doc.styles.styles.find((style) => style.type === "paragraph" && style.default)?.id ?? "Normal"
}

/**
 * What the document stylesheet shows a run as, before its direct formatting: its paragraph style's run properties
 * (inherited) and its character style's (on the run's own span, so they win).
 */
function shownByStyles(doc: WordDocument, paragraphStyleId: string, rStyle: string | undefined) {
  let cache = shownCache.get(doc)
  if (!cache) {
    cache = new Map()
    shownCache.set(doc, cache)
  }
  const key = `${paragraphStyleId}\u0000${rStyle ?? ""}`
  const known = cache.get(key)
  if (known) {
    return known
  }
  const styles = new Map(doc.styles.styles.map((style) => [style.id, style]))
  const defaults: Resolved = { pPr: defaultsOf(doc.styles).pPr, rPr: defaultsOf(doc.styles).rPr }
  const para = resolveStyle(paragraphStyleId, styles, defaults).rPr
  const char = rStyle ? resolveStyle(rStyle, styles, { pPr: {}, rPr: {} }).rPr : {}
  const shown = { para, char }
  cache.set(key, shown)
  return shown
}

/**
 * The toggles the stylesheet would show on a run that Word draws without: a run that turns off its style's bold
 * or italic (`<w:b w:val="0"/>` in a bold heading), or a character style's bold over a bold paragraph style, which
 * Word's toggle rule cancels (17.7.3). Underline and strike only from a character style: a decoration drawn on the
 * paragraph cannot be taken off a part of it.
 */
export function runOffTokens(doc: WordDocument, paragraphStyleId: string | undefined, rPr: RunProperties) {
  const pStyle = paragraphStyleId ?? defaultParagraphStyleId(doc)
  const { para, char } = shownByStyles(doc, pStyle, rPr.rStyle)
  const effective = resolveRunProperties({
    styles: doc.styles,
    paragraphStyleId: pStyle,
    characterStyleId: rPr.rStyle,
    direct: rPr,
  })
  const underlined = (props: RunProperties) => (props.u ? props.u.value !== "none" : undefined)
  const struck = (props: RunProperties) =>
    props.strike === undefined && props.dstrike === undefined ? undefined : Boolean(props.strike || props.dstrike)
  const shown: Record<RunOffToken, boolean> = {
    b: (char.b ?? para.b) === true,
    i: (char.i ?? para.i) === true,
    caps: (char.caps ?? para.caps) === true,
    smallCaps: (char.smallCaps ?? para.smallCaps) === true,
    u: underlined(char) === true,
    strike: struck(char) === true,
    // A colour from a style that the run sets back to automatic.
    color: Boolean((char.color ?? para.color) && (char.color ?? para.color) !== "auto"),
  }
  const drawn: Record<RunOffToken, boolean> = {
    b: effective.b === true,
    i: effective.i === true,
    caps: effective.caps === true,
    smallCaps: effective.smallCaps === true,
    u: underlined(effective) === true,
    strike: struck(effective) === true,
    color: Boolean(effective.color && effective.color !== "auto"),
  }
  return OFF_TOKENS.filter((token) => shown[token] && !drawn[token])
}

/** A style with everything it inherits through basedOn, starting from `start`. */
/** A style's properties with those it is based on (and the document defaults) under them. */
export function resolvedStyle(doc: WordDocument, id: string) {
  const styles = new Map(doc.styles.styles.map((style) => [style.id, style]))
  return resolveStyle(id, styles, { pPr: defaultsOf(doc.styles).pPr, rPr: defaultsOf(doc.styles).rPr })
}

/**
 * The room Word gives a paragraph holding only a picture, which the editor draws as the picture alone: the space
 * before and after (pt), and how much taller than the picture its line is (pt). With multiple spacing that is the
 * extra share of a text line in the paragraph's font (a 24 pt picture at 1.16 lines of 12 pt Aptos is 26.3 pt tall in
 * Word); at least, the line's height over the picture's (`least`, decided once the picture's height is known).
 * Exact spacing is left out: Word cuts the picture to the line, which the editor does not.
 */
export function pictureLineSpace(
  doc: WordDocument,
  paragraph: { styleId?: string; pPr: ParagraphProperties; markRPr?: RunProperties },
  themeFonts?: ThemeFonts,
) {
  const styles = new Map(doc.styles.styles.map((style) => [style.id, style]))
  const normal = doc.styles.styles.find((style) => style.type === "paragraph" && style.default)
  const start = { pPr: defaultsOf(doc.styles).pPr, rPr: defaultsOf(doc.styles).rPr }
  const id = paragraph.styleId && styles.has(paragraph.styleId) ? paragraph.styleId : normal?.id
  const style = id ? resolveStyle(id, styles, start) : start
  const spacing = { ...style.pPr.spacing, ...paragraph.pPr.spacing }
  // Space between paragraphs of one style left out (a List Paragraph's): taken as next to its own style, as a
  // picture in a list is.
  const contextual = (paragraph.pPr.contextualSpacing ?? style.pPr.contextualSpacing) === true
  const rPr = mergeRun(style.rPr, paragraph.markRPr ?? {})
  const size = (rPr.sz ?? 20) / 2
  const line = singleLine(fontOf(rPr.rFonts, themeFonts ?? themeFontsOf(doc))) * size
  const rule = spacing.lineRule
  const round = (value: number) => Math.round(value * 100) / 100
  return {
    before: contextual ? 0 : round((spacing.before ?? 0) / 20),
    after: contextual ? 0 : round((spacing.after ?? 0) / 20),
    extra: !rule || rule === "auto" ? round(Math.max(0, ((spacing.line ?? 240) / 240 - 1) * line)) : 0,
    least: rule === "atLeast" ? round((spacing.line ?? 0) / 20) : 0,
    // An exact line keeps its height whatever it holds: the picture stands on its baseline and is cut at its top.
    exact: rule === "exact" ? round((spacing.line ?? 0) / 20) : 0,
  }
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
  const fromTheme =
    props.colorTheme && themeColor(props.colorTheme.name, theme.colors, props.colorTheme.tint, props.colorTheme.shade)
  if (props.color && props.color !== "auto") {
    rules.push(`color: ${fromTheme ?? `#${props.color}`}`)
  } else if (complete) {
    // Automatic colour: black, or white on dark shading (`autoColorRule`).
    rules.push("color: var(--word-auto-color, #000000)")
  }
  if (props.b !== undefined || complete) {
    rules.push(`font-weight: ${props.b ? "bold" : "normal"}`)
  }
  if (props.i !== undefined || complete) {
    rules.push(`font-style: ${props.i ? "italic" : "normal"}`)
  }
  // Word kerns only text whose w:kern asks for it, from that size up; the browser kerns everything unless told.
  if (props.kern !== undefined || complete) {
    const size = props.sz ?? 20
    rules.push(`font-kerning: ${props.kern && size >= props.kern ? "normal" : "none"}`)
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
  // Superscript and subscript (the Footnote Reference style): raised or lowered, at about two thirds the size.
  if (props.vertAlign === "superscript" || props.vertAlign === "subscript") {
    rules.push(`vertical-align: ${props.vertAlign === "superscript" ? "super" : "sub"}`)
    rules.push(`font-size: ${props.sz ? `${Math.round((props.sz / 2) * 0.65 * 100) / 100}pt` : "0.65em"}`)
  }
  return rules
}

/** Spacing and alignment. Indents only outside lists, which the editor indents itself. */
function paragraphCss(props: ParagraphProperties, complete: boolean, line: number, colors?: Record<string, string>) {
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
      ...(rule === "exact" || rule === "atLeast"
        ? ruleLineHeight(rule, spacing.line / 20)
        : [
            // Of the font the paragraph's text is in (editor/word-lead.ts sets it on a paragraph all in another font).
            `line-height: calc(var(--word-single-line, ${line}) * ${Math.round((spacing.line / 240) * 1000) / 1000})`,
            "--word-run-line: initial",
            ...multipleLineVars(Math.round((spacing.line / 240) * 1000) / 1000),
          ]),
    )
  } else if (complete) {
    rules.push(`line-height: var(--word-single-line, ${line})`, ...multipleLineVars(1))
  }
  // Word's place for the text in a taller line; not on a paragraph with a top or bottom line, which pads itself.
  const ruled = [props.borders?.top, props.borders?.bottom].some(
    (border) => border && border.value !== "none" && border.value !== "nil",
  )
  if (ruled) {
    // The box pads itself: no trim, and no room for the text's place on the sides without a line.
    rules.push("text-box-trim: none")
    for (const side of ["top", "bottom"] as const) {
      const border = props.borders?.[side]
      if (!border || border.value === "none" || border.value === "nil") {
        rules.push(`padding-${side}: 0`)
      }
    }
  } else if (spacing?.lineRule === "exact" || spacing?.lineRule === "atLeast") {
    rules.push(`--lead-base: ${leadBase(spacing.lineRule)}`)
  }
  if (props.jc) {
    const align = { both: "justify", distribute: "justify", center: "center", right: "right", end: "right" }[
      props.jc as string
    ]
    rules.push(`text-align: ${align ?? "left"}`)
  } else if (complete) {
    rules.push("text-align: left")
  }
  // A style's lines and fill (the rule under a Lines Style Set's headings), with the room Word leaves to the text.
  for (const side of ["top", "bottom", "left", "right"] as const) {
    const border = props.borders?.[side]
    if (border && border.value !== "none" && border.value !== "nil") {
      rules.push(`border-${side}: ${borderCss(border, colors)}`, `padding-${side}: ${border.space ?? 0}pt`)
    }
  }
  const fill = props.shading ? shadingColor(props.shading, colors) : null
  if (fill) {
    rules.push(`background-color: ${fill}`)
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
  // A cell's first and last paragraph, alone or in a list (`p` stands for the paragraph).
  const firstIn = (p: string) => [`${p}:first-child`, `:is(ul, ol):first-child > li:first-child > ${p}:first-child`]
  const lastIn = (p: string) => [`${p}:last-child`, `:is(ul, ol):last-child > li:last-child > ${p}:last-child`]
  const cell = ":is(td, th)"
  const pairs = (left: string[], right: string[]) => left.flatMap((a) => right.map((b) => [a, b] as const))
  return [
    `${page} ${same} + ${own}, ${page} li:has(> ${same}) + li > ${own} { margin-top: 0 !important; }`,
    `${page} ${own}:has(+ ${same}), ${page} li:has(+ li > ${same}) > ${own} { margin-bottom: 0 !important; }`,
    // In a table Word compares paragraphs in document order, cell after cell, and each row ends with a mark of its
    // own (measured in Word, 2026-11-17): a cell's paragraph is compared with the cell before or after it in its
    // row; a row's first cell keeps its space before (after the mark) and its last cell its space after, except
    // the first row's first cell, compared with the paragraph before the table.
    pairs(lastIn(same), firstIn(own))
      .map(([before, first]) => `${page} ${cell}:has(> ${before}) + ${cell} > ${first}`)
      .join(", ") + " { margin-top: 0 !important; }",
    pairs(lastIn(own), firstIn(same))
      .map(([last, after]) => `${page} ${cell}:has(+ ${cell} > ${after}) > ${last}`)
      .join(", ") + " { margin-bottom: 0 !important; }",
    // …and before a table whose first cell starts with a paragraph of the same style, either way.
    ...firstIn(same).map((first) => {
      const table = `:is(.tableWrapper, table) tr:first-child > ${cell}:first-child > ${first}`
      return `${page} ${own}:has(+ ${table}), ${page} :is(ul, ol):has(+ ${table}) > li:last-child > ${own}:last-child { margin-bottom: 0 !important; }`
    }),
    ...firstIn(own).map((first) => {
      const table = `:is(.tableWrapper, table) tr:first-child > ${cell}:first-child > ${first}`
      return `${page} ${same} + ${table}, ${page} :is(ul, ol):has(> li:last-child > ${same}:last-child) + ${table} { margin-top: 0 !important; }`
    }),
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
export function documentStyleSheet(doc: WordDocument, themeFonts?: ThemeFonts): string {
  const theme = themeFonts ?? themeFontsOf(doc)
  const styles = new Map(doc.styles.styles.map((style) => [style.id, style]))
  const defaults: Resolved = { pPr: defaultsOf(doc.styles).pPr, rPr: defaultsOf(doc.styles).rPr }
  const normal = doc.styles.styles.find((style) => style.type === "paragraph" && style.default) ?? styles.get("Normal")
  const base = normal ? resolveStyle(normal.id, styles, defaults) : defaults
  // :root raises specificity above the app stylesheet's .page-editor rules whatever order they load in.
  const page = ":root .page-editor"
  const line = singleLine(fontOf(base.rPr.rFonts, theme))
  const css = [
    rule(page, [
      ...runCss(base.rPr, theme, true),
      `--word-single-line: ${line}`,
      `--word-descent: ${wordDescent(fontOf(base.rPr.rFonts, theme))}`,
    ]),
    rule(`${page} p, ${page} li > p`, paragraphCss(base.pPr, true, line, theme.colors)),
    rule(`${page} :is(h1, h2, h3, h4, h5, h6)`, [
      ...runCss(base.rPr, theme, true),
      ...paragraphCss(base.pPr, true, line, theme.colors),
    ]),
    // A text box's text, and a page break's line, are Normal paragraphs in Word: their lines are Normal's, not the
    // page's own default.
    rule(
      `${page} :is(.text-box-body, [data-page-break])`,
      paragraphCss(base.pPr, true, line, theme.colors).filter((declaration) =>
        /^(line-height|--word-line|--lead)/.test(declaration),
      ),
    ),
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
      const face = fontOf(resolved.rPr.rFonts, theme)
      const own = singleLine(face)
      const declarations = [
        ...runCss(resolved.rPr, theme, true),
        // A multiple of lines is of this style's font, as in Word.
        `--word-single-line: ${own}`,
        `--word-descent: ${wordDescent(face)}`,
        ...paragraphCss(resolved.pPr, true, own, theme.colors),
      ]
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
  // Line numbers are drawn in the Line Number character style, which starts from the document defaults (not Normal).
  const lineNumber = styles.has("LineNumber") ? resolveStyle("LineNumber", styles, defaults) : defaults
  css.push(rule(`${page} .line-number`, runCss({ ...lineNumber.rPr, vertAlign: undefined }, theme, true)))
  // A body on a line grid sets its lines on the grid, as Word does (document/line-lead.ts gridLineStyleSheet).
  const grid = doc.section
  if (grid?.gridType && grid.gridType !== "default" && grid.linePitch) {
    const offGrid = doc.styles.styles
      .filter(
        (style) => style.type === "paragraph" && resolveStyle(style.id, styles, defaults).pPr.snapToGrid === false,
      )
      .map((style) => style.id)
    if (base.pPr.snapToGrid === false) {
      offGrid.push("")
    }
    css.push(gridLineStyleSheet(grid.linePitch / 20, doc.settings.adjustLineHeightInTable === true, offGrid))
  }
  return css.filter(Boolean).join("\n")
}

/** A Word border as a CSS border shorthand. */
export function borderCss(border: Border | undefined, colors?: Record<string, string>) {
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
  const fromTheme = border.colorTheme && colors && themeRefColor(border.colorTheme, colors)
  const color = fromTheme ?? (border.color && border.color !== "auto" ? `#${border.color}` : "#000000")
  // A double line needs room for two strokes and the gap between them.
  return `${style === "double" ? Math.max(width * 3, 2.25) : width}pt ${style} ${color}`
}

/** The colour a cell's shading paints. */
export function shadingColor(shading: Shading | undefined, colors?: Record<string, string>) {
  if (!shading) {
    return undefined
  }
  if (shading.value === "solid" && shading.color && shading.color !== "auto") {
    return (shading.colorTheme && colors && themeRefColor(shading.colorTheme, colors)) || `#${shading.color}`
  }
  if (!shading.fill || shading.fill === "auto") {
    return undefined
  }
  // Word draws a theme fill from the theme, whatever hex was saved with it (a Style Set's, or an older theme's).
  return (shading.fillTheme && colors && themeRefColor(shading.fillTheme, colors)) || `#${shading.fill}`
}

function themeRefColor(ref: ThemeColorRef, colors: Record<string, string>) {
  return themeColor(ref.name, colors, ref.tint, ref.shade)
}

function twips(value: number | undefined) {
  return `${(value ?? 0) / 20}pt`
}

/** Custom properties that the base table rules (index.css) place on cell edges and padding. */
export function tableVariables(
  borders: TableBorders | undefined,
  margins: CellMargins | undefined,
  colors?: Record<string, string>,
) {
  const rules: string[] = []
  for (const side of ["top", "left", "bottom", "right", "insideH", "insideV"] as const) {
    if (borders?.[side]) {
      rules.push(`--wb-${side}: ${borderCss(borders[side], colors)}`)
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

/** The pattern a cell's w:shd lays over its fill (22.4), as a CSS background-image; null for none or Solid. */
function shadingPatternImage(shading: Shading | undefined) {
  // Solid is drawn as the colour itself (`shadingColor`).
  if (!shading || shading.value === "solid") {
    return null
  }
  const color = shading.color && /^[0-9A-Fa-f]{6}$/.test(shading.color) ? `#${shading.color}` : null
  return patternImage(patternValue(shading.value, color))
}

/** Borders, padding, shading and alignment of cells. */
export function cellCss(
  part: {
    borders?: TableBorders
    margins?: CellMargins
    shading?: Shading
    vAlign?: TableStylePart["vAlign"]
  },
  colors?: Record<string, string>,
) {
  const rules: string[] = []
  for (const side of ["top", "left", "bottom", "right"] as const) {
    if (part.borders?.[side]) {
      rules.push(`border-${side}: ${borderCss(part.borders[side], colors)}`)
    }
    const margin = part.margins?.[side]
    if (margin && margin.type === "dxa") {
      rules.push(`padding-${side}: ${twips(margin.value)}`)
    }
  }
  const color = shadingColor(part.shading, colors)
  if (color) {
    rules.push(`background-color: ${color}`)
    const auto = autoColorRule(color)
    if (auto) {
      rules.push(auto)
    }
  }
  const diagonals = [
    ["tl2br", "to top right"],
    ["tr2bl", "to top left"],
  ].flatMap(([name, direction]) => {
    const border = part.borders?.[name as "tl2br" | "tr2bl"]
    if (!border || border.value === "none" || border.value === "nil") {
      return []
    }
    const line = borderCss(border, colors).split(" ").pop() ?? "#000000"
    return [
      `linear-gradient(${direction}, transparent calc(50% - 0.75px), ${line} calc(50% - 0.75px), ${line} calc(50% + 0.75px), transparent calc(50% + 0.75px))`,
    ]
  })
  const pattern = shadingPatternImage(part.shading)
  if (diagonals.length > 0 || pattern) {
    rules.push(`background-image: ${[...diagonals, ...(pattern ? [pattern] : [])].join(", ")}`)
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
    rule(table, tableVariables(whole.borders, whole.margins, theme.colors)),
    rule(`${table} :where(td)`, cellCss({ shading: whole.shading, vAlign: whole.vAlign }, theme.colors)),
    // Table style formatting reaches paragraphs that keep the default paragraph style, as in Word.
    rule(`${table} :where(td p:not([data-word-style]))`, [
      ...runCss(whole.rPr, theme, false),
      ...paragraphCss(whole.pPr, false, line, theme.colors),
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
      css.push(rule(`${table}:where(${look}) :where(${cells})`, cellCss(part, theme.colors)))
      css.push(
        rule(`${table}:where(${look}) :where(${cells} p)`, [
          ...runCss(part.rPr, theme, false),
          ...paragraphCss(part.pPr, false, line, theme.colors),
        ]),
      )
    }
  }
  return css
}
