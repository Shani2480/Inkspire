import type { OpcPackage } from "@/document/docx/opc"
import { emptyNumbering, type ParagraphProperties, type StyleCatalog, type WordDocument } from "@/document/docx/model"
import { readWordXml } from "@/document/docx/wml-read"
import {
  fontOf,
  fontStack,
  resolvedStyle,
  themeColor,
  themeColorsOf,
  themeFontsOf,
  type ThemeFonts,
} from "@/document/docx/word-styles"
import { decodeXml } from "@/document/docx/xml"
import type { PageSetup, SpacingPreset } from "@/document/page-setup"
import {
  OFFICE_THEME_XML,
  WORD_COLOR_SCHEMES,
  WORD_FONT_SCHEMES,
  WORD_THEMES,
  type WordColorScheme,
  type WordFontScheme,
} from "@/document/word-design-data"
import { WORD_STYLE_SETS } from "@/document/word-style-sets"

/** The twelve colours of a theme's colour scheme, in the order Word lists them. */
export const SCHEME_SLOTS = [
  "dk1",
  "lt1",
  "dk2",
  "lt2",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "hlink",
  "folHlink",
] as const

/** How Create New Theme Colors names each slot. */
export const SLOT_LABELS = [
  "Text/Background - Dark 1",
  "Text/Background - Light 1",
  "Text/Background - Dark 2",
  "Text/Background - Light 2",
  "Accent 1",
  "Accent 2",
  "Accent 3",
  "Accent 4",
  "Accent 5",
  "Accent 6",
  "Hyperlink",
  "Followed Hyperlink",
]

const THEME_TYPE = "application/vnd.openxmlformats-officedocument.theme+xml"
const THEME_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"
const THEME_PART = /\/theme\/theme\d*\.xml$/i

/* ---------- Custom colours and fonts (Create New Theme Colors / Fonts), kept for every document ---------- */

const CUSTOM_COLORS_KEY = "inkspire-theme-colors"
const CUSTOM_FONTS_KEY = "inkspire-theme-fonts"
const CUSTOM_THEMES_KEY = "inkspire-themes"

function readList<T>(key: string, valid: (item: unknown) => item is T): T[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]")
    return Array.isArray(parsed) ? parsed.filter(valid) : []
  } catch {
    return []
  }
}

function writeList(key: string, items: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items))
  } catch {
    // Storage is blocked: the scheme still applies to this document.
  }
}

const isColorScheme = (item: unknown): item is WordColorScheme =>
  Boolean(item) &&
  typeof (item as WordColorScheme).name === "string" &&
  Array.isArray((item as WordColorScheme).colors) &&
  (item as WordColorScheme).colors.length === 12 &&
  (item as WordColorScheme).colors.every((color) => /^#[0-9a-f]{6}$/i.test(color))

const isFontScheme = (item: unknown): item is WordFontScheme =>
  Boolean(item) &&
  typeof (item as WordFontScheme).name === "string" &&
  typeof (item as WordFontScheme).major === "string" &&
  typeof (item as WordFontScheme).minor === "string"

export function customColorSchemes(): WordColorScheme[] {
  return readList(CUSTOM_COLORS_KEY, isColorScheme).map((item) => ({ ...item, menu: true }))
}

export function customFontSchemes(): WordFontScheme[] {
  return readList(CUSTOM_FONTS_KEY, isFontScheme).map((item) => ({ ...item, menu: true }))
}

/** Saves a custom scheme under its name, replacing one of the same name. */
export function saveCustomColors(scheme: { name: string; colors: string[] }) {
  const kept = customColorSchemes().filter((item) => item.name !== scheme.name)
  writeList(CUSTOM_COLORS_KEY, [
    ...kept,
    { name: scheme.name, colors: scheme.colors.map((color) => color.toLowerCase()) },
  ])
}

export function saveCustomFonts(scheme: { name: string; major: string; minor: string }) {
  const kept = customFontSchemes().filter((item) => item.name !== scheme.name)
  writeList(CUSTOM_FONTS_KEY, [...kept, { name: scheme.name, major: scheme.major, minor: scheme.minor }])
}

export function deleteCustomColors(name: string) {
  writeList(
    CUSTOM_COLORS_KEY,
    customColorSchemes().filter((item) => item.name !== name),
  )
}

export function deleteCustomFonts(name: string) {
  writeList(
    CUSTOM_FONTS_KEY,
    customFontSchemes().filter((item) => item.name !== name),
  )
}

/** A theme the user saved (Save Current Theme…) or opened (Browse for Themes…). */
export type SavedTheme = {
  name: string
  colorsName: string
  colors: string[]
  fontsName: string
  major: string
  minor: string
}

const isSavedTheme = (item: unknown): item is SavedTheme =>
  Boolean(item) &&
  typeof (item as SavedTheme).name === "string" &&
  isColorScheme({ name: (item as SavedTheme).colorsName, colors: (item as SavedTheme).colors }) &&
  isFontScheme({
    name: (item as SavedTheme).fontsName,
    major: (item as SavedTheme).major,
    minor: (item as SavedTheme).minor,
  })

export function customThemes(): SavedTheme[] {
  return readList(CUSTOM_THEMES_KEY, isSavedTheme)
}

export function saveCustomTheme(theme: SavedTheme) {
  writeList(CUSTOM_THEMES_KEY, [...customThemes().filter((item) => item.name !== theme.name), theme])
}

/* ---------- The built-in lists ---------- */

export function colorSchemeNamed(name: string): WordColorScheme | undefined {
  return [...WORD_COLOR_SCHEMES, ...customColorSchemes()].find((item) => item.name === name)
}

export function fontSchemeNamed(name: string): WordFontScheme | undefined {
  return [...WORD_FONT_SCHEMES, ...customFontSchemes()].find((item) => item.name === name)
}

/** A built-in theme with its colours and fonts. */
export function builtInTheme(name: string): SavedTheme | null {
  const theme = WORD_THEMES.find((item) => item.name === name)
  const colors = theme && WORD_COLOR_SCHEMES.find((item) => item.name === theme.colors)
  const fonts = theme && WORD_FONT_SCHEMES.find((item) => item.name === theme.fonts)
  if (!theme || !colors || !fonts) {
    return null
  }
  return {
    name: theme.name,
    colorsName: colors.name,
    colors: colors.colors,
    fontsName: fonts.name,
    major: fonts.major,
    minor: fonts.minor,
  }
}

/* ---------- The design chosen in the app, from the page setup ---------- */

/** The first family of a CSS font stack: the typeface Word is told. */
export function faceOf(stack: string) {
  return (stack.split(",")[0] ?? "").replace(/["']/g, "").trim()
}

/** The CSS stack the page draws a theme font with. */
export function stackOf(face: string) {
  return fontStack(face)
}

/** The page setup fields of a theme: what applying it from the Themes menu sets. */
export function themeSetup(theme: SavedTheme): Partial<PageSetup> {
  return {
    themeName: theme.name,
    colorScheme: theme.colorsName,
    themeColors: theme.colors.join(","),
    fontScheme: theme.fontsName,
    headingFont: stackOf(theme.major),
    bodyFont: stackOf(theme.minor),
  }
}

export function colorSetup(scheme: { name: string; colors: string[] }): Partial<PageSetup> {
  return { colorScheme: scheme.name, themeColors: scheme.colors.join(",") }
}

export function fontSetup(scheme: { name: string; major: string; minor: string }): Partial<PageSetup> {
  return { fontScheme: scheme.name, headingFont: stackOf(scheme.major), bodyFont: stackOf(scheme.minor) }
}

/** The page setup's twelve scheme colours, or null when the document keeps its own. */
export function setupColors(setup: Pick<PageSetup, "themeColors">): string[] | null {
  const colors = setup.themeColors ? setup.themeColors.split(",") : []
  return colors.length === 12 && colors.every((color) => /^#[0-9a-f]{6}$/i.test(color)) ? colors : null
}

/** The theme a document shows: its own theme part (or Word's Office theme) with the choices made in the app. */
export function currentTheme(setup: PageSetup, word: WordDocument | null): SavedTheme {
  const part = themePartXml(word)
  const own = themeOfXml(part ?? OFFICE_THEME_XML)
  const colors = setupColors(setup)
  return {
    name: setup.themeName || own.name,
    colorsName: colors ? setup.colorScheme || own.colorsName : own.colorsName,
    colors: colors ?? own.colors,
    fontsName: setup.fontScheme || own.fontsName,
    major: setup.fontScheme && setup.headingFont ? faceOf(setup.headingFont) : own.major,
    minor: setup.fontScheme && setup.bodyFont ? faceOf(setup.bodyFont) : own.minor,
  }
}

/** True when the app changed anything a theme part holds. */
export function themeChanged(setup: PageSetup) {
  return Boolean(setup.themeName || setupColors(setup) || setup.fontScheme)
}

/* ---------- Theme parts ---------- */

export function themePartXml(word: WordDocument | null) {
  const part = word?.preserved?.parts.find((item) => THEME_PART.test(item.name))
  return part ? decodeXml(part.data) : null
}

/** A theme part's names, colours and Latin fonts. */
export function themeOfXml(xml: string): SavedTheme {
  const colors = themeColorsOf(xml)
  const font = (group: string) => {
    const block = new RegExp(`<(?:\\w+:)?${group}>([\\s\\S]*?)</(?:\\w+:)?${group}>`).exec(xml)?.[1] ?? ""
    return /<(?:\w+:)?latin\b[^>]*typeface="([^"]*)"/.exec(block)?.[1] ?? ""
  }
  return {
    name: unescape(/<(?:\w+:)?theme\b[^>]*\bname="([^"]*)"/.exec(xml)?.[1] ?? "Office Theme"),
    colorsName: unescape(/<(?:\w+:)?clrScheme\b[^>]*\bname="([^"]*)"/.exec(xml)?.[1] ?? "Office"),
    colors: SCHEME_SLOTS.map((slot) => colors[slot]!),
    fontsName: unescape(/<(?:\w+:)?fontScheme\b[^>]*\bname="([^"]*)"/.exec(xml)?.[1] ?? "Office"),
    major: font("majorFont"),
    minor: font("minorFont"),
  }
}

function unescape(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

function escape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * A theme part with the theme's name, colour scheme and Latin fonts swapped in, and everything else (effects,
 * the fonts of other scripts, extensions) as it was. Dark 1 and Light 1 stay system colours when they still match
 * the window colours, as in Word's own themes.
 */
export function themedXml(base: string, theme: SavedTheme) {
  const prefix = /<(\w+):theme\b/.exec(base)?.[1] ?? "a"
  const p = (name: string) => `${prefix}:${name}`
  const slot = (name: string, color: string) => {
    const value = color.replace("#", "").toUpperCase()
    if (name === "dk1" && value === "000000") {
      return `<${p("dk1")}><${p("sysClr")} val="windowText" lastClr="000000"/></${p("dk1")}>`
    }
    if (name === "lt1" && value === "FFFFFF") {
      return `<${p("lt1")}><${p("sysClr")} val="window" lastClr="FFFFFF"/></${p("lt1")}>`
    }
    return `<${p(name)}><${p("srgbClr")} val="${value}"/></${p(name)}>`
  }
  const scheme =
    `<${p("clrScheme")} name="${escape(theme.colorsName)}">` +
    SCHEME_SLOTS.map((name, index) => slot(name, theme.colors[index] ?? "#000000")).join("") +
    `</${p("clrScheme")}>`
  let xml = base.replace(/<(\w+:)?clrScheme\b[\s\S]*?<\/(\w+:)?clrScheme>/, scheme)
  xml = xml.replace(/(<(?:\w+:)?theme\b[^>]*\bname=")[^"]*(")/, `$1${escape(theme.name)}$2`)
  xml = xml.replace(/(<(?:\w+:)?fontScheme\b[^>]*\bname=")[^"]*(")/, `$1${escape(theme.fontsName)}$2`)
  const face = (group: string, typeface: string) => {
    xml = xml.replace(
      new RegExp(`(<(?:\\w+:)?${group}>[\\s\\S]*?<(?:\\w+:)?latin\\b)[^>]*?(/?>)`),
      `$1 typeface="${escape(typeface)}"$2`,
    )
  }
  face("majorFont", theme.major)
  face("minorFont", theme.minor)
  return xml
}

/** The theme fonts and colours the page draws an opened document with, after the app's choices. */
export function designedThemeFonts(word: WordDocument | null, theme: SavedTheme): ThemeFonts {
  const own = word ? themeFontsOf(word) : themeFontsOf({ preserved: undefined } as WordDocument)
  return {
    ...own,
    majorLatin: theme.major,
    minorLatin: theme.minor,
    colors: Object.fromEntries(SCHEME_SLOTS.map((slot, index) => [slot, theme.colors[index]!.toLowerCase()])),
  }
}

/** Writes the theme into the saved package: over its theme part, or as a new one. */
export function writeThemePart(pkg: OpcPackage, theme: SavedTheme) {
  const existing = pkg.parts.find((part) => THEME_PART.test(part.name))
  const base = existing ? decodeXml(existing.data) : OFFICE_THEME_XML
  const data = new TextEncoder().encode(
    `${base.startsWith("<?xml") ? "" : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'}${themedXml(base, theme)}`,
  )
  if (existing) {
    existing.data = data
    return
  }
  const name = "/word/theme/theme1.xml"
  pkg.parts.push({ name, contentType: THEME_TYPE, data })
  if (!pkg.overrides.some((item) => item.partName.toLowerCase() === name)) {
    pkg.overrides.push({ partName: name, contentType: THEME_TYPE })
  }
  let main = pkg.relationships.find((group) => group.source === pkg.mainPartName)
  if (!main) {
    main = { source: pkg.mainPartName, items: [] }
    pkg.relationships.push(main)
  }
  const used = new Set(main.items.map((rel) => rel.id))
  let id = 1
  while (used.has(`rId${id}`)) {
    id += 1
  }
  main.items.push({
    id: `rId${id}`,
    type: THEME_REL,
    target: "theme/theme1.xml",
    targetMode: "Internal",
    partName: name,
  })
}

/** A theme as its own file (.thmx), for Save Current Theme… */
export function thmxEntries(theme: SavedTheme) {
  const encode = (text: string) => new TextEncoder().encode(text)
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
  return [
    {
      name: "[Content_Types].xml",
      data: encode(
        `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          `<Override PartName="/theme/theme/theme1.xml" ContentType="${THEME_TYPE}"/>` +
          '<Override PartName="/theme/theme/themeManager.xml" ContentType="application/vnd.openxmlformats-officedocument.themeManager+xml"/>' +
          "</Types>",
      ),
    },
    {
      name: "_rels/.rels",
      data: encode(
        `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="theme/theme/themeManager.xml"/>' +
          "</Relationships>",
      ),
    },
    {
      name: "theme/theme/themeManager.xml",
      data: encode(`${xml}<a:themeManager xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>`),
    },
    {
      name: "theme/theme/_rels/themeManager.xml.rels",
      data: encode(
        `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="${THEME_REL}" Target="theme1.xml"/>` +
          "</Relationships>",
      ),
    },
    { name: "theme/theme/theme1.xml", data: encode(`${xml}${themedXml(OFFICE_THEME_XML, theme)}`) },
  ]
}

/** The theme in a .thmx file (Browse for Themes…), or null when it holds none. */
export function themeFromThmx(entries: { name: string; data: Uint8Array }[], fileName: string): SavedTheme | null {
  const entry = entries.find((item) => /(^|\/)theme\/theme\/theme\d*\.xml$/i.test(item.name))
  if (!entry) {
    return null
  }
  const theme = themeOfXml(new TextDecoder().decode(entry.data))
  return { ...theme, name: fileName.replace(/\.thmx$/i, "") || theme.name }
}

/* ---------- Style Sets ---------- */

const setCache = new Map<string, StyleCatalog>()

/** A Style Set's document defaults and styles, read as the document's own would be (raw XML kept). */
export function styleSetCatalog(id: string): StyleCatalog | null {
  const cached = setCache.get(id)
  if (cached) {
    return cached
  }
  const set = WORD_STYLE_SETS.find((item) => item.id === id)
  if (!set) {
    return null
  }
  const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
  const word = readWordXml({
    documentXml: `<w:document ${ns}><w:body><w:p/></w:body></w:document>`,
    stylesXml: `<w:styles ${ns}>${set.docDefaults}${set.styles}</w:styles>`,
  })
  setCache.set(id, word.styles)
  return word.styles
}

export const STYLE_SETS = WORD_STYLE_SETS.map((set) => ({ id: set.id, name: set.name }))

/* ---------- Paragraph Spacing ---------- */

/** Word's Paragraph Spacing presets: space before and after in twips, line spacing in 240ths of a line. */
export const SPACING_VALUES: Record<
  Exclude<SpacingPreset, "default">,
  { before: number; after: number; line: number }
> = {
  none: { before: 0, after: 0, line: 240 },
  compact: { before: 0, after: 80, line: 240 },
  tight: { before: 0, after: 120, line: 276 },
  open: { before: 0, after: 200, line: 276 },
  relaxed: { before: 0, after: 120, line: 360 },
  double: { before: 0, after: 160, line: 480 },
}

/* ---------- Applying the design to a document's styles ---------- */

type DesignChoices = Pick<PageSetup, "styleSet" | "spacing" | "fontScheme" | "themeColors" | "themeName">

/**
 * The document's styles after the Design tab: a Style Set's defaults and styles in place of the document's
 * (the rest kept), then the Paragraph Spacing preset on the defaults and Normal. A document made in the app
 * also gets its headings tied to the theme's heading font and accent colour when the theme was chosen, so Word
 * shows them as the page does.
 */
export function designedCatalog(catalog: StyleCatalog, setup: DesignChoices, madeInApp: boolean): StyleCatalog {
  let result = catalog
  const set = setup.styleSet ? styleSetCatalog(setup.styleSet) : null
  if (set) {
    const replaced = new Set(set.styles.map((style) => style.id.toLowerCase()))
    result = {
      ...result,
      docDefaults: structuredClone(set.docDefaults),
      styles: [
        ...result.styles.filter((style) => !replaced.has(style.id.toLowerCase())),
        ...structuredClone(set.styles),
      ],
    }
  } else if (madeInApp && (setup.fontScheme || setup.themeName || setup.themeColors)) {
    result = { ...result, styles: result.styles.map((style) => themedHeading(style, setup)) }
    if (!result.docDefaults.rPr.rFonts) {
      result = {
        ...result,
        docDefaults: {
          ...result.docDefaults,
          rPr: { ...result.docDefaults.rPr, rFonts: { asciiTheme: "minorHAnsi", hAnsiTheme: "minorHAnsi" } },
        },
      }
    }
  }
  if (setup.spacing !== "default") {
    const values = SPACING_VALUES[setup.spacing]
    const spaced = (pPr: ParagraphProperties): ParagraphProperties => ({
      ...pPr,
      spacing: { ...pPr.spacing, before: values.before, after: values.after, line: values.line, lineRule: "auto" },
    })
    result = {
      ...result,
      docDefaults: { ...result.docDefaults, pPr: spaced(result.docDefaults.pPr) },
      styles: result.styles.map((style) =>
        style.type === "paragraph" && (style.default || style.id === "Normal")
          ? { ...style, pPr: spaced(style.pPr) }
          : style,
      ),
    }
  }
  return result
}

function themedHeading(style: StyleCatalog["styles"][number], setup: DesignChoices) {
  const heading = /^(Heading[1-6]|Title)$/.test(style.id)
  if (!heading) {
    return style
  }
  const rPr = { ...style.rPr }
  if ((setup.fontScheme || setup.themeName) && !rPr.rFonts?.ascii && !rPr.rFonts?.asciiTheme) {
    rPr.rFonts = { ...rPr.rFonts, asciiTheme: "majorHAnsi", hAnsiTheme: "majorHAnsi" }
  }
  const colors = setup.themeColors.split(",")
  if (colors.length === 12 && !rPr.color) {
    // The page draws headings in accent 1 darkened by a quarter, and the Title in accent 1.
    const shade = style.id === "Title" ? undefined : "BF"
    rPr.color = (themeColor("accent1", { accent1: colors[4]! }, undefined, shade) ?? colors[4]!)
      .replace("#", "")
      .toUpperCase()
    rPr.colorTheme = { name: "accent1", ...(shade ? { shade } : {}) }
  }
  return { ...style, rPr }
}

/** The colours the page draws a document made in the app with, from the theme's scheme. */
export function designColors(colors: string[]) {
  const accent = colors[4] ?? "#156082"
  return {
    heading: themeColor("accent1", { accent1: accent }, undefined, "BF") ?? accent,
    accent,
    hyperlink: colors[10] ?? "#467886",
  }
}

/** A Word document holding only styles: what a Style Set is drawn from in a document made in the app. */
export function emptyWordDocument(
  styles: StyleCatalog = { docDefaults: { pPr: {}, rPr: {} }, styles: [] },
): WordDocument {
  return {
    blocks: [],
    section: null,
    styles,
    numbering: emptyNumbering(),
    settings: { compatibilityMode: null, rsids: [] },
    notes: [],
  }
}

/** How one style looks in a gallery thumbnail. */
export type StyleLook = {
  family: string
  size: number
  color: string
  bold: boolean
  italic: boolean
  caps: boolean
  /** A rule under the paragraph (Lines Style Sets), as a colour. */
  rule: string
}

/** The Title, Heading 1 and Normal of a set of styles, drawn with a theme: a Style Set gallery thumbnail. */
export function styleLooks(catalog: StyleCatalog, theme: SavedTheme) {
  const word = emptyWordDocument(catalog)
  const fonts = designedThemeFonts(null, theme)
  const look = (id: string): StyleLook => {
    const known = catalog.styles.some((style) => style.id === id)
    const { rPr, pPr } = resolvedStyle(word, known ? id : "Normal")
    const color =
      (rPr.colorTheme && themeColor(rPr.colorTheme.name, fonts.colors, rPr.colorTheme.tint, rPr.colorTheme.shade)) ||
      (rPr.color && rPr.color !== "auto" ? `#${rPr.color}` : "#000000")
    const bottom = pPr.borders?.bottom
    return {
      family: fontStack(fontOf(rPr.rFonts, fonts) ?? theme.minor),
      size: (rPr.sz ?? 20) / 2,
      color,
      bold: Boolean(rPr.b),
      italic: Boolean(rPr.i),
      caps: Boolean(rPr.caps || rPr.smallCaps),
      rule:
        bottom && bottom.value !== "none" && bottom.value !== "nil"
          ? bottom.color && bottom.color !== "auto"
            ? `#${bottom.color}`
            : color
          : "",
    }
  }
  return { title: look("Title"), heading: look("Heading1"), body: look("Normal") }
}
