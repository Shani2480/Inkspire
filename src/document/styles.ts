import {
  paragraphsIn,
  type ParagraphProperties,
  type RunProperties,
  type Style,
  type StyleCatalog,
  type WordDocument,
} from "@/document/docx/model"
import { fontOf, resolvedStyle, themeFontsOf } from "@/document/docx/word-styles"
import { create } from "zustand"

/**
 * A style the user can apply, change, create or delete. Each document has its own list: Modify Style changes only
 * the open document, unless the user also saves the style as a default for new documents.
 */
export type StyleDef = {
  /** The editor's id: `namedStyle` on a paragraph (headings are h1/h2), `charStyle` on a run. */
  id: string
  name: string
  kind: "paragraph" | "character"
  /** Word's built-ins can be changed and hidden, not deleted. */
  builtIn: boolean
  /** The w:styleId it is saved as in a .docx file. */
  wordId: string
  basedOn?: string
  /** Paragraph styles: the style Enter gives the next paragraph. */
  next?: string
  /** Left out of the Styles gallery. */
  hidden?: boolean
  font: StyleFont
  paragraph: StyleParagraph
  /** Edited or created in this document: shown by the generated stylesheet and written to a saved .docx. */
  changed?: boolean
}

export type StyleFont = {
  family?: string
  /** Points. */
  size?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  /** #rrggbb; absent for the style's own colour. */
  color?: string
}

export type StyleParagraph = {
  align?: "left" | "center" | "right" | "justify"
  /** Points. */
  before?: number
  after?: number
  /** Line spacing as a multiple of single. */
  line?: number
  /** Left indent in centimetres. */
  indent?: number
}

/** The styles of a new document, as the app stylesheet draws them (index.css: .page-editor p, h1, [data-style]). */
export const BUILT_IN_STYLES: StyleDef[] = [
  paragraph("normal", "Normal", "Normal", { size: 12 }, { before: 0, after: 9, line: 1.65 }),
  paragraph("no-spacing", "No Spacing", "NoSpacing", { size: 12 }, { before: 0, after: 0, line: 1 }),
  paragraph("heading-1", "Heading 1", "Heading1", { size: 22, bold: true }, { before: 0, after: 10, line: 1.25 }),
  paragraph("heading-2", "Heading 2", "Heading2", { size: 16, bold: true }, { before: 0, after: 7, line: 1.25 }),
  paragraph("title", "Title", "Title", { size: 28, color: "#2e75b6" }, { before: 0, after: 4, line: 1.15 }),
  paragraph("subtitle", "Subtitle", "Subtitle", { size: 14, color: "#5b5b5b" }, { before: 0, after: 9, line: 1.65 }),
  character("subtle-emphasis", "Subtle Emphasis", "SubtleEmphasis", { italic: true, color: "#666666" }),
  character("emphasis", "Emphasis", "Emphasis", { italic: true }),
  character("intense-emphasis", "Intense Emphasis", "IntenseEmphasis", { bold: true, italic: true, color: "#1f4e79" }),
  character("strong", "Strong", "Strong", { bold: true }),
  paragraph(
    "quote",
    "Quote",
    "Quote",
    { size: 12, italic: true, color: "#404040" },
    { before: 0, after: 9, line: 1.65 },
  ),
]

function paragraph(id: string, name: string, wordId: string, font: StyleFont, para: StyleParagraph): StyleDef {
  return {
    id,
    name,
    kind: "paragraph",
    builtIn: true,
    wordId,
    basedOn: id === "normal" ? undefined : "normal",
    next: "normal",
    font,
    paragraph: para,
  }
}

function character(id: string, name: string, wordId: string, font: StyleFont): StyleDef {
  return { id, name, kind: "character", builtIn: true, wordId, font, paragraph: {} }
}

export function builtInStyle(id: string) {
  return BUILT_IN_STYLES.find((style) => style.id === id)
}

/** An id for a new style from its name, not used by any style in `styles`. */
export function newStyleId(name: string, styles: StyleDef[]) {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "style"
  let id = `custom-${slug}`
  for (let n = 2; styles.some((style) => style.id === id); n += 1) {
    id = `custom-${slug}-${n}`
  }
  return id
}

/** A Word style id for a new style: its name without spaces or symbols, unique among `styles`. */
export function newWordId(name: string, styles: StyleDef[]) {
  const base = name.replace(/[^A-Za-z0-9]+/g, "") || "Style"
  let id = base
  for (let n = 2; styles.some((style) => style.wordId.toLowerCase() === id.toLowerCase()); n += 1) {
    id = `${base}${n}`
  }
  return id
}

/* ---------- Defaults for new documents ---------- */

const DEFAULTS_KEY = "aiword-default-styles"

function readSavedDefaults(): StyleDef[] {
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(isStyleDef) : []
  } catch {
    return []
  }
}

function isStyleDef(value: unknown): value is StyleDef {
  const style = value as StyleDef
  return Boolean(
    style &&
    typeof style.id === "string" &&
    typeof style.name === "string" &&
    (style.kind === "paragraph" || style.kind === "character") &&
    typeof style.wordId === "string" &&
    style.font &&
    style.paragraph,
  )
}

const OLD_FONT_DEFAULT_KEY = "aiword-font-default"

/**
 * Set As Default used to keep the font apart and draw the editor in it, which reached neither saved files nor
 * styles. It now changes the Normal style; a font saved the old way becomes the saved Normal style, once.
 */
function migrateFontDefault() {
  try {
    const raw = localStorage.getItem(OLD_FONT_DEFAULT_KEY)
    if (!raw) {
      return
    }
    localStorage.removeItem(OLD_FONT_DEFAULT_KEY)
    const parsed = JSON.parse(raw) as { family?: unknown; size?: unknown; color?: unknown }
    const normal = mergeStyles(BUILT_IN_STYLES, readSavedDefaults()).find((style) => style.id === "normal")
    if (!normal) {
      return
    }
    const size = Number(parsed.size)
    const font: StyleFont = { ...normal.font }
    if (typeof parsed.family === "string" && parsed.family) {
      font.family = parsed.family
    }
    if (Number.isFinite(size) && size > 0) {
      font.size = size
    }
    if (typeof parsed.color === "string" && /^#[0-9a-f]{6}$/i.test(parsed.color)) {
      font.color = parsed.color
    }
    saveDefaultStyles([{ ...normal, font }])
  } catch {
    // Storage is blocked or the old value is unreadable: nothing to carry over.
  }
}

/** The styles a new document starts with: the built-ins, with the ones the user saved as defaults in their place. */
export function defaultStyles(): StyleDef[] {
  migrateFontDefault()
  return mergeStyles(
    BUILT_IN_STYLES,
    readSavedDefaults().map((style) => ({ ...style, changed: true })),
  )
}

/** Saves these styles as the defaults of new documents, next to (or in place of) those saved before. */
export function saveDefaultStyles(styles: StyleDef[]) {
  const saved = mergeStyles(
    readSavedDefaults(),
    styles.map(({ changed: _changed, ...style }) => style),
  )
  try {
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify(saved))
  } catch {
    // Storage is full or blocked: the styles still apply to this document.
  }
}

/** Goes back to the built-in styles for new documents. */
export function resetDefaultStyles() {
  try {
    localStorage.removeItem(DEFAULTS_KEY)
  } catch {
    // Nothing saved, or storage is blocked.
  }
}

export function savedDefaultIds() {
  return new Set(readSavedDefaults().map((style) => style.id))
}

/** `base` with each style of `over` put in place of the one with its id, and new ones added at the end. */
export function mergeStyles(base: StyleDef[], over: StyleDef[]) {
  const result = base.map((style) => over.find((item) => item.id === style.id) ?? style)
  for (const style of over) {
    if (!result.some((item) => item.id === style.id)) {
      result.push(style)
    }
  }
  return result
}

/* ---------- The open document's styles ---------- */

type StyleState = {
  styles: StyleDef[]
  /** Replaces the list, when a document is created or opened. */
  load: (styles: StyleDef[]) => void
  update: (id: string, patch: Partial<StyleDef>) => void
  add: (style: StyleDef) => void
  remove: (id: string) => void
}

export const useStyleStore = create<StyleState>((set) => ({
  styles: defaultStyles(),
  load: (styles) => set({ styles }),
  update: (id, patch) =>
    set((state) => ({
      styles: state.styles.map((style) => (style.id === id ? { ...style, ...patch, changed: true } : style)),
    })),
  add: (style) => set((state) => ({ styles: [...state.styles, { ...style, changed: true }] })),
  remove: (id) => set((state) => ({ styles: state.styles.filter((style) => style.id !== id) })),
}))

export function findStyle(id: string) {
  return useStyleStore.getState().styles.find((style) => style.id === id)
}

/* ---------- Stylesheet ---------- */

/**
 * CSS for the styles changed or created in this document. Untouched built-ins are left to the app stylesheet (and
 * an opened Word document's own). `:root:root` outranks both, whatever order they load in.
 */
export function styleSheetFor(styles: StyleDef[]) {
  const page = ":root:root .page-editor"
  const rules: string[] = []
  for (const style of styles) {
    if (!style.changed || style.kind !== "paragraph") {
      continue
    }
    const font = fontCss(style.font)
    const block = paragraphCss(style.paragraph)
    if (style.id === "normal") {
      // Normal is the page's own text; other styles inherit what they do not set.
      rules.push(rule(page, font))
      rules.push(rule(`${page} :is(p, li > p):not([data-style]):not([data-word-style])`, block))
      continue
    }
    const heading = /^heading-([1-6])$/.exec(style.id)?.[1]
    const selector = heading
      ? `${page} h${heading}`
      : `${page} p:is([data-style="${cssString(style.id)}"], [data-word-style="${cssString(style.wordId)}"])`
    rules.push(rule(selector, [...font, ...block]))
  }
  return rules.filter(Boolean).join("\n")
}

export function fontCss(font: StyleFont) {
  const css: string[] = []
  if (font.family) {
    css.push(`font-family: ${quoteFamily(font.family)}`)
  }
  if (font.size) {
    css.push(`font-size: ${font.size}pt`)
  }
  if (font.bold !== undefined) {
    css.push(`font-weight: ${font.bold ? 700 : 400}`)
  }
  if (font.italic !== undefined) {
    css.push(`font-style: ${font.italic ? "italic" : "normal"}`)
  }
  if (font.underline !== undefined) {
    css.push(`text-decoration: ${font.underline ? "underline" : "none"}`)
  }
  if (font.color) {
    css.push(`color: ${font.color}`)
  }
  return css
}

export function paragraphCss(para: StyleParagraph) {
  const css: string[] = []
  if (para.align) {
    css.push(`text-align: ${para.align}`)
  }
  if (para.before !== undefined) {
    css.push(`margin-top: ${para.before}pt`)
  }
  if (para.after !== undefined) {
    css.push(`margin-bottom: ${para.after}pt`)
  }
  if (para.line !== undefined) {
    css.push(`line-height: ${para.line}`)
  }
  if (para.indent !== undefined) {
    css.push(`margin-left: ${para.indent}cm`)
  }
  return css
}

function rule(selector: string, declarations: string[]) {
  return declarations.length ? `${selector} { ${declarations.join("; ")} }` : ""
}

function cssString(value: string) {
  return value.replace(/["\\]/g, "\\$&")
}

function quoteFamily(family: string) {
  return /^[\w-]+$/.test(family) ? family : `"${family.replace(/"/g, "")}"`
}

const STYLE_ELEMENT_ID = "document-edited-styles"

/** Keeps a <style> element in step with the open document's changed styles. */
export function showEditedStyles(styles: StyleDef[]) {
  if (typeof document === "undefined") {
    return
  }
  const css = styleSheetFor(styles)
  const existing = document.getElementById(STYLE_ELEMENT_ID)
  if (!css) {
    existing?.remove()
    return
  }
  const element = existing ?? document.createElement("style")
  element.id = STYLE_ELEMENT_ID
  element.textContent = css
  document.head.appendChild(element)
}

/* ---------- Word styles ---------- */

const TWIPS_PER_POINT = 20
const TWIPS_PER_CM = 567

/** A style as Word writes it in styles.xml. */
export function wordStyleFor(style: StyleDef, styles: StyleDef[]): Style {
  const wordIdOf = (id: string | undefined) => styles.find((item) => item.id === id)?.wordId
  const headingLevel = /^heading-([1-6])$/.exec(style.id)?.[1]
  const result: Style = {
    id: style.wordId,
    type: style.kind,
    name: headingLevel ? `heading ${headingLevel}` : style.name,
    pPr: style.kind === "paragraph" ? wordParagraph(style.paragraph) : {},
    rPr: wordRun(style.font),
  }
  if (style.id === "normal") {
    result.default = true
  }
  const basedOn = wordIdOf(style.basedOn)
  if (basedOn && basedOn !== style.wordId) {
    result.basedOn = basedOn
  }
  const next = wordIdOf(style.next)
  if (style.kind === "paragraph" && next) {
    result.next = next
  }
  if (headingLevel) {
    result.pPr.outlineLvl = Number(headingLevel) - 1
  }
  return result
}

function wordParagraph(para: StyleParagraph): ParagraphProperties {
  const pPr: ParagraphProperties = {}
  if (para.align) {
    pPr.jc = para.align === "justify" ? "both" : para.align
  }
  if (para.before !== undefined || para.after !== undefined || para.line !== undefined) {
    pPr.spacing = {
      ...(para.before !== undefined ? { before: Math.round(para.before * TWIPS_PER_POINT) } : {}),
      ...(para.after !== undefined ? { after: Math.round(para.after * TWIPS_PER_POINT) } : {}),
      ...(para.line !== undefined ? { line: Math.round(para.line * 240), lineRule: "auto" as const } : {}),
    }
  }
  if (para.indent !== undefined) {
    pPr.ind = { left: Math.round(para.indent * TWIPS_PER_CM) }
  }
  return pPr
}

function wordRun(font: StyleFont): RunProperties {
  const rPr: RunProperties = {}
  if (font.family) {
    rPr.rFonts = { ascii: font.family, hAnsi: font.family, cs: font.family }
  }
  if (font.size) {
    rPr.sz = Math.round(font.size * 2)
    rPr.szCs = rPr.sz
  }
  if (font.bold !== undefined) {
    rPr.b = font.bold
  }
  if (font.italic !== undefined) {
    rPr.i = font.italic
  }
  if (font.underline !== undefined) {
    rPr.u = { value: font.underline ? "single" : "none" }
  }
  if (font.color) {
    rPr.color = font.color.replace("#", "").toUpperCase()
  }
  return rPr
}

/**
 * The catalog with the document's changed and new styles written into it, in place of Word's own definition when
 * the user changed one, and every style the body refers to (`used` Word ids) added when missing.
 */
export function catalogWithStyles(catalog: StyleCatalog, styles: StyleDef[], used: Set<string>): StyleCatalog {
  const wanted = styles.filter((style) => style.changed || used.has(style.wordId))
  if (wanted.length === 0) {
    return catalog
  }
  const result = [...catalog.styles]
  for (const style of wanted) {
    const index = result.findIndex((item) => item.id.toLowerCase() === style.wordId.toLowerCase())
    if (index >= 0 && !style.changed) {
      continue
    }
    const written = wordStyleFor(style, styles)
    if (index >= 0) {
      // Keep what the model does not cover (and Word's latent attributes) by merging into the source style.
      const source = result[index]!
      result[index] = {
        ...source,
        name: written.name,
        basedOn: written.basedOn ?? source.basedOn,
        next: written.next ?? source.next,
        pPr: { ...source.pPr, ...written.pPr },
        rPr: { ...source.rPr, ...written.rPr },
      }
    } else {
      result.push(written)
    }
  }
  return { ...catalog, styles: result }
}

/** The Word id a paragraph style saves as, or undefined when the editor has no such style. */
export function wordIdForNamedStyle(namedStyle: string, styles: StyleDef[] = useStyleStore.getState().styles) {
  return styles.find((style) => style.id === namedStyle && style.kind === "paragraph")?.wordId
}

/**
 * The styles of an opened Word document: the built-ins as its styles.xml defines them, and the document's own
 * paragraph and character styles that its text uses. None counts as changed, so its own stylesheet keeps drawing
 * them until the user edits one.
 */
export function stylesFromWord(word: WordDocument): StyleDef[] {
  const theme = themeFontsOf(word)
  const byId = new Map(word.styles.styles.map((style) => [style.id.toLowerCase(), style]))
  const fromCatalog = (wordId: string) => {
    const style = byId.get(wordId.toLowerCase())
    if (!style) {
      return null
    }
    const resolved = resolvedStyle(word, style.id)
    return { font: fontFromWord(resolved.rPr, theme), paragraph: paragraphFromWord(resolved.pPr) }
  }
  const result = BUILT_IN_STYLES.map((style) => {
    const read = fromCatalog(style.wordId)
    return read
      ? {
          ...style,
          font: style.kind === "paragraph" ? read.font : { ...style.font, ...read.font },
          paragraph: style.kind === "paragraph" ? read.paragraph : {},
        }
      : style
  })
  const used = new Set(paragraphsIn(word.blocks).map((paragraph) => paragraph.styleId?.toLowerCase() ?? ""))
  for (const paragraph of paragraphsIn(word.blocks)) {
    for (const inline of paragraph.inlines) {
      if (inline.kind === "run" && inline.rPr.rStyle) {
        used.add(inline.rPr.rStyle.toLowerCase())
      }
    }
  }
  for (const style of word.styles.styles) {
    const key = style.id.toLowerCase()
    const structural = /^(heading\d|toc|tocheading|hyperlink|listparagraph|caption)/.test(key)
    const known = result.some((item) => item.wordId.toLowerCase() === key)
    if (known || structural || !used.has(key) || (style.type !== "paragraph" && style.type !== "character")) {
      continue
    }
    const read = fromCatalog(style.id)!
    result.push({
      id: `word-${key}`,
      name: style.name || style.id,
      kind: style.type,
      builtIn: false,
      wordId: style.id,
      basedOn: "normal",
      next: "normal",
      font: read.font,
      paragraph: style.type === "paragraph" ? read.paragraph : {},
    })
  }
  return result
}

function fontFromWord(rPr: RunProperties, theme: ReturnType<typeof themeFontsOf>): StyleFont {
  const font: StyleFont = {}
  const family = fontOf(rPr.rFonts, theme)
  if (family) {
    font.family = family
  }
  if (rPr.sz) {
    font.size = rPr.sz / 2
  }
  if (rPr.b !== undefined) {
    font.bold = rPr.b
  }
  if (rPr.i !== undefined) {
    font.italic = rPr.i
  }
  if (rPr.u) {
    font.underline = rPr.u.value !== "none"
  }
  if (rPr.color && rPr.color !== "auto") {
    font.color = `#${rPr.color.toLowerCase()}`
  }
  return font
}

function paragraphFromWord(pPr: ParagraphProperties): StyleParagraph {
  const para: StyleParagraph = {}
  if (pPr.jc === "center" || pPr.jc === "right" || pPr.jc === "left") {
    para.align = pPr.jc
  } else if (pPr.jc === "both" || pPr.jc === "distribute") {
    para.align = "justify"
  }
  if (pPr.spacing?.before !== undefined) {
    para.before = pPr.spacing.before / TWIPS_PER_POINT
  }
  if (pPr.spacing?.after !== undefined) {
    para.after = pPr.spacing.after / TWIPS_PER_POINT
  }
  if (pPr.spacing?.line !== undefined && (pPr.spacing.lineRule ?? "auto") === "auto") {
    para.line = Math.round((pPr.spacing.line / 240) * 100) / 100
  }
  if (pPr.ind?.left !== undefined) {
    para.indent = Math.round((pPr.ind.left / TWIPS_PER_CM) * 100) / 100
  }
  return para
}

/* ---------- Saved in the app's own HTML files ---------- */

const STYLES_MARK = /<!--\s*aiword-styles:([^ ]*?)\s*-->\n?/

/** The changed and new styles as a comment for the app's HTML format, or "" when there are none. */
export function packStyles(styles: StyleDef[]) {
  const kept = styles.filter((style) => style.changed || !style.builtIn)
  return kept.length ? `<!-- aiword-styles:${encodeURIComponent(JSON.stringify(kept))} -->\n` : ""
}

/** The HTML without its styles comment, and the styles it held merged into the built-ins. */
export function unpackStyles(html: string): { html: string; styles: StyleDef[] | null } {
  const match = html.match(STYLES_MARK)
  if (!match) {
    return { html, styles: null }
  }
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(match[1] ?? ""))
    const kept = Array.isArray(parsed) ? parsed.filter(isStyleDef).map((style) => ({ ...style, changed: true })) : []
    return { html: html.replace(STYLES_MARK, ""), styles: mergeStyles(BUILT_IN_STYLES, kept) }
  } catch {
    return { html: html.replace(STYLES_MARK, ""), styles: null }
  }
}
