import { readDash, readEffects, readGradient } from "@/document/docx/shape-effects"
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

/** A colour element (`srgbClr` or `schemeClr`, with its shade / tint / lumMod children) as a hex colour. */
export function colorOf(markup: string, scheme: Map<string, string>): string {
  const srgb = /<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(markup)
  const named = /<a:schemeClr val="(\w+)"/.exec(markup)
  let base = srgb ? `#${(srgb[1] ?? "").toLowerCase()}` : ""
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
  const preset = /<a:prstGeom prst="(\w+)"/.exec(shape)?.[1]
  const variant = preset ? VARIANT_OF_PRESET[preset] : undefined
  if (!preset || !variant) {
    return null
  }
  const scheme = schemeColors(themeXml)
  const properties = /<wps:spPr[\s>][\s\S]*?<\/wps:spPr>/.exec(shape)?.[0] ?? ""
  const style = /<wps:style>[\s\S]*?<\/wps:style>/.exec(shape)?.[0] ?? ""
  const reference = (name: string) => new RegExp(`<a:${name} idx="(\\d+)">([\\s\\S]*?)</a:${name}>`).exec(style)

  // The outline element of the shape itself, minus the geometry's own `a:ln` look-alikes (there are none).
  const line = /<a:ln[\s>][\s\S]*?<\/a:ln>|<a:ln [^>]*\/>/.exec(properties)?.[0] ?? ""
  const lineRef = reference("lnRef")
  const fillRef = reference("fillRef")

  const own = properties.replace(line, "")
  const gradient = readGradient(own)
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
  const body = /<w:txbxContent>([\s\S]*?)<\/w:txbxContent>/.exec(shape)?.[1] ?? ""
  const text = [...body.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)]
    .map((paragraph) =>
      [...paragraph[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((item) => unescapeText(item[1] ?? ""))
        .join(""),
    )
    .join("\n")
  const textFont = /<w:rFonts\b[^>]*\bw:ascii="([^"]+)"/.exec(body)?.[1]
  const textColor = /<w:color w:val="([0-9A-Fa-f]{6})"/.exec(body)?.[1]
  const textSize = Number(/<w:sz w:val="(\d+)"/.exec(body)?.[1])
  return {
    preset,
    variant,
    fill,
    stroke,
    strokeWidth: Math.round((emu / 12700) * 100) / 100,
    text,
    textFont: textFont ? unescapeText(textFont) : "",
    textColor: textColor ? `#${textColor.toLowerCase()}` : "",
    textSize: Number.isFinite(textSize) && textSize > 0 ? textSize / 2 : 0,
    textBold: /<w:b\/>|<w:b w:val="(?:1|true)"\/>/.test(body),
    dash: readDash(line),
    gradient: gradient?.gradient ?? "",
    ...effects,
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
  ])
}
