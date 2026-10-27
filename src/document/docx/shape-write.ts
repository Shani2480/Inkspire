import { VARIANT_OF_PRESET } from "@/document/docx/shape-import"
import { escapeXml, escapeXmlText } from "@/document/docx/xml"
import { shapeMarkup } from "@/editor/insert-blocks"
import { PRESET_DASH, effectListXml, plainEffects } from "@/document/docx/shape-effects"
import { gradientStopList, gradientVector, parseWordGradient } from "@/editor/shape-style"
import { custGeomXml, parsePath } from "@/editor/shape-points"

/**
 * A shape made or formatted in the app, written as Word's own drawing (a `wps:wsp` with a preset geometry, a solid
 * fill and an outline) instead of a picture of it, so Word can edit it. Only shapes Word draws the same way qualify:
 * a preset it knows, a colour or two-stop gradient fill, a plain or dashed outline, and outer shadow, glow, soft
 * edges or reflection. Pictures, textures, arrows, bevel and 3-D rotation stay a picture, as they were.
 */
export const WPS_URI = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape"

/** `plainShapePreset`'s answer for a shape drawn from its own points (`a:custGeom`). */
export const CUSTOM = "custom"

const PRESET_OF_VARIANT = new Map(Object.entries(VARIANT_OF_PRESET).map(([preset, variant]) => [variant, preset]))

const NOT_PLAIN = ["fillImage", "texture", "arrowBegin", "arrowEnd"] as const

type Attrs = Record<string, unknown>

const HEX = /^#[0-9a-fA-F]{6}$/

/** The colours the app draws a shape in when none was chosen: those of its own drawing. */
function drawnColors(variant: string) {
  const markup = shapeMarkup(variant)
  return {
    fill: /\bfill="(#[0-9a-fA-F]{6})"/.exec(markup)?.[1] ?? "#deecf9",
    stroke: /\bstroke="(#[0-9a-fA-F]{6})"/.exec(markup)?.[1] ?? "",
  }
}

function colorOf(value: unknown, fallback: string) {
  const text = String(value ?? "")
  if (!text) {
    return fallback
  }
  if (text === "transparent" || text === "none") {
    return "none"
  }
  return HEX.test(text) ? text.toLowerCase() : null
}

/** The Word preset that draws this shape exactly as the app does, or null when it needs a picture. */
export function plainShapePreset(attrs: Attrs) {
  // A shape with edited points is Word's freeform (custom geometry), whatever it was drawn from.
  const points = typeof attrs.points === "string" && attrs.points ? parsePath(attrs.points) : []
  const preset = points.length > 0 ? CUSTOM : PRESET_OF_VARIANT.get(String(attrs.variant ?? ""))
  if (!preset || NOT_PLAIN.some((key) => attrs[key]) || !plainEffects(attrs)) {
    return null
  }
  const defaults = drawnColors(String(attrs.variant))
  return colorOf(attrs.fill, defaults.fill) !== null && colorOf(attrs.stroke, defaults.stroke) !== null ? preset : null
}

function gradientFill(fill: string, gradient: string) {
  const stops = gradientStopList(fill === "none" ? "" : fill, gradient)
    .map(
      ([offset, hex]) =>
        `<a:gs pos="${Math.round(offset * 100000)}">${solid(hex).replace(/<\/?a:solidFill>/g, "")}</a:gs>`,
    )
    .join("")
  const vector = gradientVector(gradient)
  // Word's own angle is kept as it was; the app's directions are worked out from their vector.
  const degrees =
    parseWordGradient(gradient)?.angle ??
    (vector ? Math.round(((Math.atan2(vector[3] - vector[1], vector[2] - vector[0]) * 180) / Math.PI + 360) % 360) : 0)
  const direction = vector
    ? `<a:lin ang="${Math.round(degrees * 60000)}" scaled="0"/>`
    : `<a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>`
  return `<a:gradFill rotWithShape="1"><a:gsLst>${stops}</a:gsLst>${direction}</a:gradFill>`
}

const solid = (hex: string) => `<a:solidFill><a:srgbClr val="${hex.slice(1).toUpperCase()}"/></a:solidFill>`

/** The text a shape holds as Word's `wps:txbx`, one paragraph per line, centred, and the body that centres it. */
function textBody(attrs: Attrs) {
  const text = String(attrs.text ?? "")
  if (!text) {
    return "<wps:bodyPr/>"
  }
  const color = HEX.test(String(attrs.textColor ?? "")) ? String(attrs.textColor).slice(1).toUpperCase() : ""
  const size = Math.round((Number(attrs.textSize) || 14) * 2)
  const font = String(attrs.textFont ?? "")
    .split(",")[0]!
    .replace(/["']/g, "")
    .trim()
  const fonts = font
    ? `<w:rFonts w:ascii="${escapeXml(font)}" w:hAnsi="${escapeXml(font)}" w:cs="${escapeXml(font)}"/>`
    : ""
  const run = `<w:rPr>${fonts}${attrs.textBold ? "<w:b/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`
  const paragraphs = text
    .split("\n")
    .map(
      (line) =>
        `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>${run}<w:t xml:space="preserve">${escapeXmlText(line)}</w:t></w:r></w:p>`,
    )
    .join("")
  return `<wps:txbx><w:txbxContent>${paragraphs}</w:txbxContent></wps:txbx><wps:bodyPr anchor="ctr"/>`
}

/** The `a:graphicData` of a shape: its geometry, fill and outline at `cx` by `cy` EMU, turned by `rot`. */
export function wordShapeGraphic(attrs: Attrs, cx: number, cy: number, rot = 0): string | null {
  const preset = plainShapePreset(attrs)
  if (!preset) {
    return null
  }
  const defaults = drawnColors(String(attrs.variant))
  const fill = colorOf(attrs.fill, defaults.fill)!
  const stroke = colorOf(attrs.stroke, defaults.stroke)!
  const weight = Number(attrs.strokeWidth) > 0 ? Number(attrs.strokeWidth) : 1.5
  const flips = `${attrs.flipH ? ' flipH="1"' : ""}${attrs.flipV ? ' flipV="1"' : ""}`
  const dash = PRESET_DASH[String(attrs.strokeDash ?? "")]
  const line =
    stroke === "none" || !stroke
      ? "<a:ln><a:noFill/></a:ln>"
      : `<a:ln w="${Math.round(weight * 12700)}"${attrs.strokeDash === "round-dot" ? ' cap="rnd"' : ""}>${solid(stroke)}${dash ? `<a:prstDash val="${dash}"/>` : ""}</a:ln>`
  const gradient = String(attrs.fillGradient ?? "")
  return (
    `<a:graphicData uri="${WPS_URI}"><wps:wsp xmlns:wps="${WPS_URI}"><wps:cNvSpPr/><wps:spPr>` +
    `<a:xfrm${rot ? ` rot="${rot}"` : ""}${flips}><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    (preset === CUSTOM ? custGeomXml(parsePath(String(attrs.points))) : `<a:prstGeom prst="${preset}"><a:avLst/></a:prstGeom>`) +
    `${gradient ? gradientFill(fill, gradient) : fill === "none" ? "<a:noFill/>" : solid(fill)}${line}${effectListXml(attrs)}</wps:spPr>${textBody(attrs)}</wps:wsp></a:graphicData>`
  )
}
