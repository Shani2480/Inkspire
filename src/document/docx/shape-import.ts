import { readDash, readEffects, readGradient } from "@/document/docx/shape-effects"
import { presetAdjust, presetSegments } from "@/document/docx/preset-geometry"
import { pathString, pointsFromCustGeom } from "@/editor/shape-points"
/**
 * Word's drawn shapes (21.35): a `wps:wsp` with a preset geometry, read into the values the app's shape object takes
 * (preset, fill, outline). Colours come from the shape's own `spPr`, else from its `wps:style` references resolved
 * against the document theme.
 */

/** Word's preset geometry names and the app's shape variants that draw them. */
export const VARIANT_OF_PRESET: Record<string, string> = {
  rect: "rect",
  roundRect: "round",
  snip1Rect: "snip",
  ellipse: "ellipse",
  triangle: "triangle",
  diamond: "diamond",
  hexagon: "hexagon",
  plus: "plus",
  heart: "heart",
  rightArrow: "arrow",
  leftArrow: "left-arrow",
  upArrow: "up-arrow",
  frame: "frame",
  teardrop: "teardrop",
  round2SameRect: "same-round",
  round2DiagRect: "round-diag",
  snip2SameRect: "snip-corner",
  parallelogram: "parallelogram",
  trapezoid: "trapezoid",
  pentagon: "pentagon",
  octagon: "octagon",
  chevron: "chevron",
  star4: "star4",
  star5: "star",
  star6: "star6",
  star8: "star8",
  downArrow: "down-arrow",
  leftRightArrow: "left-right",
  upDownArrow: "up-down",
  moon: "moon",
  cloud: "cloud",
  donut: "donut",
  lightningBolt: "lightning",
  can: "can",
  smileyFace: "smiley",
  sun: "sun",
  flowChartProcess: "process",
  flowChartDecision: "decision",
  flowChartTerminator: "terminator",
  flowChartDocument: "document",
  notchedRightArrow: "notched",
  wave: "wave",
  plaque: "plaque",
  blockArc: "block-arc",
  noSmoking: "no-sign",
  irregularSeal1: "burst",
}

export type WordShape = {
  preset: string
  variant: string
  /** A freeform's outline as points (see `shape-points.ts`); empty for a preset. */
  points: string
  fill: string
  stroke: string
  /** The outline's weight in points. */
  strokeWidth: number
  /** What the app can show of the rest of the look: its own dash, gradient and effect names (empty when none). */
  text: string
  textColor: string
  textFont: string
  textSize: number
  textBold: boolean
  textItalic: boolean
  /** The app's underline style (solid, double, dotted, dashed, wavy), empty for none. */
  textUnderline: string
  textHighlight: string
  /** left, right or justify; empty is centred. */
  textAlign: string
  dash: string
  gradient: string
  shadow: string
  glow: string
  softEdge: number
  reflection: string
}

/** Line widths of the theme's first three line styles, in EMU (Office's own, when the theme lists none). */
const STYLE_LINE_EMU = [0, 6350, 12700, 19050]

const SCHEME_NAMES: Record<string, string> = { tx1: "dk1", tx2: "dk2", bg1: "lt1", bg2: "lt2" }

export function schemeColors(themeXml: string | null) {
  const colors = new Map<string, string>()
  if (!themeXml) {
    return colors
  }
  const block = /<a:clrScheme[^>]*>([\s\S]*?)<\/a:clrScheme>/.exec(themeXml)?.[1] ?? ""
  for (const match of block.matchAll(/<a:(\w+)>\s*<a:(?:srgbClr val|sysClr val="\w+" lastClr)="([0-9A-Fa-f]{6})"/g)) {
    colors.set(match[1] ?? "", `#${(match[2] ?? "").toLowerCase()}`)
  }
  return colors
}

function channels(hex: string) {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16))
}

function toHex(values: number[]) {
  return `#${values
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`
}

/**
 * The theme fill a shape's style refers to (`a:fillRef` idx 1 to 3: subtle, moderate, intense), with the theme's
 * placeholder colour (phClr) made the reference's own colour. Word's shape styles with a gradient fill this way.
 */
function themeFill(themeXml: string | null, reference: RegExpExecArray | null) {
  const index = Number(reference?.[1])
  if (!themeXml || !reference || !(index >= 1 && index < 1000)) {
    return ""
  }
  const list = /<a:fillStyleLst>([\s\S]*?)<\/a:fillStyleLst>/.exec(themeXml)?.[1] ?? ""
  const fills = [...list.matchAll(/<a:(solidFill|gradFill|noFill|blipFill|pattFill)\b[^>]*?(?:\/>|>[\s\S]*?<\/a:\1>)/g)]
  const color = reference[2] ?? ""
  const named = /<a:schemeClr val="(\w+)"/.exec(color)?.[1]
  const srgb = /<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(color)?.[1]
  const own = named ? `<a:schemeClr val="${named}"` : srgb ? `<a:srgbClr val="${srgb}"` : ""
  return own ? (fills[index - 1]?.[0] ?? "").replace(/<a:schemeClr val="phClr"/g, own) : ""
}

/** DrawingML's preset colours Word writes (`a:prstClr`), such as a text box's black outline. */
const PRESET_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  gray: "#808080",
  grey: "#808080",
}

/** A colour element (`srgbClr`, `schemeClr` or `prstClr`, with its shade / tint / lumMod children) as a hex colour. */
export function colorOf(markup: string, scheme: Map<string, string>): string {
  const srgb = /<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(markup)
  const named = /<a:schemeClr val="(\w+)"/.exec(markup)
  const preset = /<a:prstClr val="(\w+)"/.exec(markup)?.[1]
  let base = srgb ? `#${(srgb[1] ?? "").toLowerCase()}` : (PRESET_COLORS[preset ?? ""] ?? "")
  if (!base && named) {
    const name = named[1] ?? ""
    base = scheme.get(SCHEME_NAMES[name] ?? name) ?? ""
  }
  if (!base) {
    return ""
  }
  let values = channels(base)
  const percent = (name: string) => {
    const found = new RegExp(`<a:${name} val="(\\d+)"`).exec(markup)
    return found ? Number(found[1]) / 100000 : undefined
  }
  const shade = percent("shade")
  if (shade !== undefined) {
    values = values.map((value) => value * shade)
  }
  const tint = percent("tint")
  if (tint !== undefined) {
    values = values.map((value) => 255 - (255 - value) * tint)
  }
  const lumMod = percent("lumMod")
  if (lumMod !== undefined) {
    values = values.map((value) => value * lumMod)
  }
  const lumOff = percent("lumOff")
  if (lumOff !== undefined) {
    values = values.map((value) => value + 255 * lumOff)
  }
  return toHex(values)
}

function unescapeText(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

/** The shape's size in EMU: its own `a:xfrm`, else the drawing's extent, else a square. */
function shapeExtent(shape: string, xml: string): [number, number] {
  const own = /<a:ext cx="(\d+)" cy="(\d+)"/.exec(shape) ?? /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(xml)
  const cx = Number(own?.[1])
  const cy = Number(own?.[2])
  return cx > 0 && cy > 0 ? [cx, cy] : [914400, 914400]
}

/** The shape a `wps:wsp` drawing holds, or null when it is not a shape the app draws (a text box, a freeform). */
export function readWordShape(xml: string, themeXml: string | null): WordShape | null {
  if (!xml.includes("wordprocessingShape")) {
    return null
  }
  const shape = /<wps:wsp[\s>][\s\S]*?<\/wps:wsp>/.exec(xml)?.[0]
  // A real text box (`txBox`) stays whole; a shape with text in it opens as a shape holding that text.
  if (!shape || /<wps:cNvSpPr\b[^>]*\btxBox="(?:1|true)"/.test(shape)) {
    return null
  }
  // A freeform (Word's custom geometry) opens as a shape drawn from its points, which Edit Points can change.
  const custom = /<a:prstGeom\b/.test(shape) ? null : pointsFromCustGeom(shape)
  const named = /<a:prstGeom prst="(\w+)"/.exec(shape)?.[1]
  // A preset the app has no drawing of, or one whose handles Word moved (its own adjust values), opens drawn from
  // Word's own geometry at the shape's size.
  const adjust = named ? presetAdjust(shape) : {}
  const drawn =
    named && (!VARIANT_OF_PRESET[named] || Object.keys(adjust).length > 0)
      ? presetSegments(named, ...shapeExtent(shape, xml), adjust)
      : null
  const outline = custom ?? drawn
  const points = outline ? pathString(outline) : ""
  const preset = custom ? "custom" : named
  const variant = points ? "rect" : preset ? VARIANT_OF_PRESET[preset] : undefined
  if (!preset || !variant) {
    return null
  }
  const look = readShapeLook(shape, themeXml)
  const body = /<w:txbxContent>([\s\S]*?)<\/w:txbxContent>/.exec(shape)?.[1] ?? ""
  const text = [...body.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)]
    .map((paragraph) =>
      [...paragraph[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((item) => unescapeText(item[1] ?? ""))
        .join(""),
    )
    .join("\n")
  const textSize = Number(/<w:sz w:val="(\d+)"/.exec(body)?.[1])
  const textLook = readShapeTextLook(body, themeXml)
  return {
    preset,
    variant,
    points,
    fill: look.fill,
    stroke: look.stroke,
    strokeWidth: look.strokeWidth,
    text,
    textSize: Number.isFinite(textSize) && textSize > 0 ? textSize / 2 : 0,
    ...textLook,
    dash: look.dash,
    gradient: look.gradient,
    ...look.effects,
  }
}

/** The fill, outline and effects of a `wps:wsp`: its own `spPr`, else its `wps:style` references to the theme. */
export function readShapeLook(shape: string, themeXml: string | null) {
  const scheme = schemeColors(themeXml)
  const properties = /<wps:spPr[\s>][\s\S]*?<\/wps:spPr>/.exec(shape)?.[0] ?? ""
  const style = /<wps:style>[\s\S]*?<\/wps:style>/.exec(shape)?.[0] ?? ""
  const reference = (name: string) => new RegExp(`<a:${name} idx="(\\d+)">([\\s\\S]*?)</a:${name}>`).exec(style)

  // The outline element of the shape itself, minus the geometry's own `a:ln` look-alikes (there are none).
  const line = /<a:ln[\s>][\s\S]*?<\/a:ln>|<a:ln [^>]*\/>/.exec(properties)?.[0] ?? ""
  const lineRef = reference("lnRef")
  const fillRef = reference("fillRef")

  const own = properties.replace(line, "")
  const ownFill = /<a:(?:solidFill|gradFill|noFill|blipFill|pattFill)\b/.test(own)
  const gradient = readGradient(own, scheme) ?? (ownFill ? null : readGradient(themeFill(themeXml, fillRef), scheme))
  const ownSolid = /<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(own)?.[1]
  // A gradient the app has no equal of (three stops, theme colours) shows as its first colour.
  const firstStop = /<a:gradFill\b[\s\S]*?<a:gs pos="\d+">([\s\S]*?)<\/a:gs>/.exec(own)?.[1]
  const fill = gradient
    ? gradient.fill
    : /<a:noFill\s*\/>/.test(own)
      ? "none"
      : ownSolid
        ? colorOf(ownSolid, scheme)
        : firstStop
          ? colorOf(firstStop, scheme)
          : fillRef
            ? colorOf(fillRef[2] ?? "", scheme)
            : ""

  const lineSolid = /<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(line)?.[1]
  const stroke = /<a:noFill\s*\/>/.test(line)
    ? "none"
    : lineSolid
      ? colorOf(lineSolid, scheme)
      : lineRef
        ? colorOf(lineRef[2] ?? "", scheme)
        : ""
  const width = Number(/<a:ln [^>]*\bw="(\d+)"/.exec(line)?.[1])
  const styleIndex = Number(lineRef?.[1] ?? 0)
  const emu = Number.isFinite(width) && width > 0 ? width : (STYLE_LINE_EMU[styleIndex] ?? 0)
  const effects = readEffects(properties, scheme)
  return {
    fill,
    stroke,
    strokeWidth: Math.round((emu / 12700) * 100) / 100,
    /** Word's double (or other compound) line. */
    compound: /<a:ln [^>]*\bcmpd="(\w+)"/.exec(line)?.[1] ?? "",
    dash: readDash(line),
    gradient: gradient?.gradient ?? "",
    effects,
  }
}

/** The values a shape figure keeps from Word's reading, to tell later whether the app changed any. */
export function wordShapeMark(shape: WordShape) {
  return shapeLook(shape)
}

/** The look of a shape that the mark compares: preset, colours, weight, dash, gradient and effects. */
export function shapeLook(look: Record<string, unknown>) {
  return JSON.stringify([
    look.variant,
    look.points || "",
    look.fill,
    look.stroke,
    look.strokeWidth,
    look.strokeDash ?? look.dash ?? "",
    look.fillGradient ?? look.gradient ?? "",
    look.shadow || "",
    look.glow || "",
    Number(look.softEdge) || 0,
    look.reflection || "",
    look.text || "",
    look.textColor || "",
    look.textFont || "",
    Number(look.textSize) || 0,
    Boolean(look.textBold),
    // Added later: only when set, so a mark taken before they existed still matches.
    ...(look.textItalic || look.textUnderline || look.textHighlight || look.textAlign
      ? [Boolean(look.textItalic), look.textUnderline || "", look.textHighlight || "", look.textAlign || ""]
      : []),
  ])
}

/** Word's highlight colours (`w:highlight`) as hex. */
export const WORD_HIGHLIGHTS: Record<string, string> = {
  yellow: "#ffff00",
  green: "#00ff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  blue: "#0000ff",
  red: "#ff0000",
  darkBlue: "#000080",
  darkCyan: "#008080",
  darkGreen: "#008000",
  darkMagenta: "#800080",
  darkRed: "#800000",
  darkYellow: "#808000",
  darkGray: "#808080",
  lightGray: "#c0c0c0",
  black: "#000000",
  white: "#ffffff",
}

/** The app's underline styles and Word's `w:u` values for them. */
export const WORD_UNDERLINES: Record<string, string> = {
  solid: "single",
  double: "double",
  dotted: "dotted",
  dashed: "dash",
  wavy: "wave",
}

const THEME_COLOR_SLOTS: Record<string, string> = {
  text1: "dk1",
  text2: "dk2",
  background1: "lt1",
  background2: "lt2",
  dark1: "dk1",
  dark2: "dk2",
  light1: "lt1",
  light2: "lt2",
  hyperlink: "hlink",
  followedHyperlink: "folHlink",
}

const isOn = (body: string, name: string) => new RegExp(`<w:${name}/>|<w:${name} w:val="(?:1|true|on)"/>`).test(body)

/**
 * The look of the text in a shape (`w:txbxContent`), from its first run's properties: font and colour (a theme font
 * or colour through the theme), bold, italic, underline, highlight (or run shading) and the first paragraph's
 * alignment.
 */
export function readShapeTextLook(body: string, themeXml: string | null) {
  const run = /<w:r(?:\s[^>]*)?>\s*<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(body)?.[1] ?? body
  let font = /<w:rFonts\b[^>]*\bw:ascii="([^"]+)"/.exec(run)?.[1] ?? ""
  const themeFont = /<w:rFonts\b[^>]*\bw:asciiTheme="(major|minor)\w*"/.exec(run)?.[1]
  if (!font && themeFont && themeXml) {
    const block = new RegExp(`<a:${themeFont}Font>([\\s\\S]*?)</a:${themeFont}Font>`).exec(themeXml)?.[1] ?? ""
    font = /<a:latin\b[^>]*typeface="([^"]*)"/.exec(block)?.[1] ?? ""
  }
  const color = /<w:color\b([^>]*)\/>/.exec(run)?.[1] ?? ""
  const own = /w:val="([0-9A-Fa-f]{6})"/.exec(color)?.[1]
  let textColor = own ? `#${own.toLowerCase()}` : ""
  const slot = /w:themeColor="(\w+)"/.exec(color)?.[1]
  if (!textColor && slot) {
    const base = schemeColors(themeXml).get(THEME_COLOR_SLOTS[slot] ?? slot)
    if (base) {
      const tint = Number.parseInt(/w:themeTint="([0-9A-Fa-f]{2})"/.exec(color)?.[1] ?? "", 16)
      const shade = Number.parseInt(/w:themeShade="([0-9A-Fa-f]{2})"/.exec(color)?.[1] ?? "", 16)
      textColor = toHex(
        channels(base).map((value) =>
          tint >= 0 ? 255 - (255 - value) * (tint / 255) : shade >= 0 ? value * (shade / 255) : value,
        ),
      )
    }
  }
  const underline = /<w:u w:val="(\w+)"/.exec(run)?.[1] ?? ""
  const highlight = /<w:highlight w:val="(\w+)"/.exec(run)?.[1] ?? ""
  const shading = /<w:shd\b[^>]*\bw:fill="([0-9A-Fa-f]{6})"/.exec(run)?.[1]
  const jc = /<w:jc w:val="(\w+)"/.exec(body)?.[1] ?? "left"
  return {
    textFont: font ? unescapeText(font) : "",
    textColor,
    textBold: isOn(run, "b"),
    textItalic: isOn(run, "i"),
    textUnderline:
      underline && underline !== "none"
        ? (Object.keys(WORD_UNDERLINES).find((key) => WORD_UNDERLINES[key] === underline) ?? "solid")
        : "",
    textHighlight: WORD_HIGHLIGHTS[highlight] ?? (shading ? `#${shading.toLowerCase()}` : ""),
    textAlign: jc === "center" ? "" : jc === "right" || jc === "end" ? "right" : jc === "both" ? "justify" : "left",
  }
}
