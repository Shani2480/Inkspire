import { readShapeLook } from "@/document/docx/shape-import"
import { PRESET_DASH, effectListXml, plainEffects } from "@/document/docx/shape-effects"
import { WPS_URI, gradientFill, solid } from "@/document/docx/shape-write"
import { shapeStyleAttributes, textBoxStyleAttributes } from "@/editor/shape-style"

/**
 * Word's text boxes (a `wps:wsp` with `txBox="1"`) as the app's own text boxes, and back. The box's fill, outline,
 * effects, margins, vertical alignment and text direction map onto the text box's attributes; its text is the
 * box's text. A chain of linked boxes keeps all its text in the first box (`wps:txbx id`), the others naming the
 * chain and their place in it (`wps:linkedTxbx id seq`); in the app each box holds what fits in it.
 */

type Attrs = Record<string, unknown>

const EMU_PER_POINT = 12700
const HEX = /^#[0-9a-fA-F]{6}$/

/** Word's place in a chain of linked boxes: the chain's id and the box's place in it (0 for the first). */
export type BoxLink = { id: number; seq: number }

export type WordTextBox = {
  /** The text box's attributes, apart from its size and place. */
  attrs: Attrs
  /** A box Word links from another: it names the chain and its place in it, its text being the first box's. */
  linked: BoxLink | null
  /** The id on the box's own `wps:txbx`, which a chain's first box carries (0 when none is written). */
  txbxId: number
  /** Resize shape to fit text: the box is as high as its text. */
  autoFit: boolean
}

const DIRECTION_OF_VERT: Record<string, string> = {
  vert: "rotate90",
  eaVert: "rotate90",
  vert270: "rotate270",
  wordArtVert: "stacked",
  wordArtVertRtl: "stacked",
}

const VERT_OF_DIRECTION: Record<string, string> = { rotate90: "vert", rotate270: "vert270", stacked: "wordArtVert" }

const VALIGN_OF_ANCHOR: Record<string, string> = { ctr: "middle", b: "bottom" }
const ANCHOR_OF_VALIGN: Record<string, string> = { middle: "ctr", bottom: "b" }

function points(emu: string | undefined, fallback: number) {
  const value = Number(emu)
  return Number.isFinite(value) && emu !== undefined ? Math.round((value / EMU_PER_POINT) * 100) / 100 : fallback
}

/** The text box a Word drawing holds, or null when it is not a text box (`txBox="1"` on a rectangle). */
export function readWordTextBox(xml: string, themeXml: string | null): WordTextBox | null {
  if (!xml.includes("wordprocessingShape")) {
    return null
  }
  const shape = /<wps:wsp[\s>][\s\S]*?<\/wps:wsp>/.exec(xml)?.[0]
  if (!shape || !/<wps:cNvSpPr\b[^>]*\btxBox="(?:1|true)"/.test(shape)) {
    return null
  }
  const preset = /<a:prstGeom prst="(\w+)"/.exec(shape)?.[1]
  if (preset !== "rect" || !/<wps:(?:txbx|linkedTxbx)\b/.test(shape)) {
    return null
  }
  const look = readShapeLook(shape, themeXml)
  const body = /<wps:bodyPr\b[^>]*>/.exec(shape)?.[0] ?? ""
  const bodyAttr = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(body)?.[1]
  const linked = /<wps:linkedTxbx\b[^>]*\bid="(\d+)"[^>]*\bseq="(\d+)"/.exec(shape)
  const attrs: Attrs = {
    fill: look.fill === "none" ? "none" : look.fill || "#ffffff",
    // No outline of its own and none from a style: Word draws none.
    stroke: look.stroke || "none",
    border: look.compound === "dbl" ? "double" : "single",
    strokeWidth: look.stroke === "none" ? 0 : look.strokeWidth,
    strokeDash: look.dash,
    fillGradient: look.gradient,
    ...look.effects,
    insetL: points(bodyAttr("lIns"), 7.2),
    insetT: points(bodyAttr("tIns"), 3.6),
    insetR: points(bodyAttr("rIns"), 7.2),
    insetB: points(bodyAttr("bIns"), 3.6),
    vAlign: VALIGN_OF_ANCHOR[bodyAttr("anchor") ?? ""] ?? "",
    textDirection: DIRECTION_OF_VERT[bodyAttr("vert") ?? ""] ?? "",
    noWrap: bodyAttr("wrap") === "none",
  }
  return {
    attrs,
    linked: linked ? { id: Number(linked[1]), seq: Number(linked[2]) } : null,
    txbxId: Number(/<wps:txbx\b[^>]*\bid="(\d+)"/.exec(shape)?.[1] ?? 0),
    autoFit: /<a:spAutoFit\s*\/>/.test(shape),
  }
}

/** The attributes the mark compares: everything but the box's size, place, chain and the mark itself. */
const MARKED = [
  "fill",
  "border",
  "borderColor",
  "stroke",
  "alt",
  "textAlign",
  ...Object.keys(shapeStyleAttributes()),
  ...Object.keys(textBoxStyleAttributes()),
]

/**
 * What a text box opened from Word is kept by, to tell on save whether the app changed it: its formatting and its
 * text (for a chain's first box, the whole chain's).
 */
export function textBoxMark(box: { attrs?: Attrs; content?: unknown[] }) {
  const attrs = box.attrs ?? {}
  return JSON.stringify([MARKED.map((key) => attrs[key] ?? null), box.content ?? []])
}

function colorOf(value: unknown) {
  const text = String(value ?? "")
  if (text === "none" || text === "transparent") {
    return "none"
  }
  return HEX.test(text) ? text.toLowerCase() : null
}

/** Whether Word draws the box as the app does: a colour or gradient fill, a plain outline, Word's own effects. */
export function plainTextBox(attrs: Attrs) {
  return Boolean(
    !attrs.fillImage &&
    !attrs.texture &&
    !attrs.arrowBegin &&
    !attrs.arrowEnd &&
    !attrs.textFill &&
    !attrs.textOutline &&
    !attrs.textEffect &&
    plainEffects(attrs) &&
    colorOf(attrs.fill || "#ffffff") &&
    colorOf(attrs.stroke || attrs.borderColor || "#d4d4d4"),
  )
}

/**
 * The `a:graphicData` of a text box as Word's own: a rectangle with `txBox="1"`, its fill, outline and effects,
 * the text (`paragraphs`, the `w:p` markup) or, for a box later in a chain, its link, and the body's margins,
 * alignment and direction. Null when Word would not draw it as the app does.
 */
export function wordTextBoxGraphic(
  attrs: Attrs,
  cx: number,
  cy: number,
  rot: number,
  paragraphs: string,
  link: BoxLink | null,
): string | null {
  if (!plainTextBox(attrs)) {
    return null
  }
  const fill = colorOf(attrs.fill || "#ffffff")!
  const noLine = attrs.stroke === "none" || (!attrs.stroke && attrs.border === "none")
  const stroke = colorOf(attrs.stroke || attrs.borderColor || "#d4d4d4")!
  const weight = Number(attrs.strokeWidth) > 0 ? Number(attrs.strokeWidth) : 0.75
  const dash = PRESET_DASH[String(attrs.strokeDash ?? "")]
  const line =
    noLine || stroke === "none"
      ? "<a:ln><a:noFill/></a:ln>"
      : `<a:ln w="${Math.round(weight * EMU_PER_POINT)}"${attrs.border === "double" ? ' cmpd="dbl"' : ""}>` +
        `${solid(stroke)}${dash ? `<a:prstDash val="${dash}"/>` : ""}</a:ln>`
  const gradient = String(attrs.fillGradient ?? "")
  const flips = `${attrs.flipH ? ' flipH="1"' : ""}${attrs.flipV ? ' flipV="1"' : ""}`
  const text =
    link && link.seq > 0
      ? `<wps:linkedTxbx id="${link.id}" seq="${link.seq}"/>`
      : `<wps:txbx${link ? ` id="${link.id}"` : ""}><w:txbxContent>${paragraphs || "<w:p/>"}</w:txbxContent></wps:txbx>`
  const inset = (key: string, fallback: number) =>
    Math.round((Number.isFinite(Number(attrs[key])) ? Number(attrs[key] ?? fallback) : fallback) * EMU_PER_POINT)
  const vert = VERT_OF_DIRECTION[String(attrs.textDirection ?? "")] ?? "horz"
  const anchor = ANCHOR_OF_VALIGN[String(attrs.vAlign ?? "")] ?? "t"
  // A box as high as its text grows with it in Word too; a linked box never does.
  const fit = !Number(attrs.height) && !link ? "<a:spAutoFit/>" : "<a:noAutofit/>"
  return (
    `<a:graphicData uri="${WPS_URI}"><wps:wsp xmlns:wps="${WPS_URI}"><wps:cNvSpPr txBox="1"/><wps:spPr>` +
    `<a:xfrm${rot ? ` rot="${rot}"` : ""}${flips}><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `${gradient ? gradientFill(fill, gradient) : fill === "none" ? "<a:noFill/>" : solid(fill)}${line}${effectListXml(attrs)}` +
    `</wps:spPr>${text}` +
    `<wps:bodyPr rot="0" vert="${vert}" wrap="${attrs.noWrap ? "none" : "square"}" lIns="${inset("insetL", 7.2)}" ` +
    `tIns="${inset("insetT", 3.6)}" rIns="${inset("insetR", 7.2)}" bIns="${inset("insetB", 3.6)}" anchor="${anchor}" ` +
    `anchorCtr="0">${fit}</wps:bodyPr></wps:wsp></a:graphicData>`
  )
}

/** Word's chain ids for the app's chains, per save: a chain opened from Word keeps its own. */
const chainIds = new WeakMap<object, Map<string, number>>()

/** The link a box is written with: its chain's Word id and its place (the app numbers each chain from 0). */
export function boxLink(attrs: Attrs, build: object): BoxLink | null {
  const linkId = String(attrs.linkId ?? "")
  if (!linkId) {
    return null
  }
  const ids = chainIds.get(build) ?? new Map<string, number>()
  chainIds.set(build, ids)
  const word = /^word-(\d+)$/.exec(linkId)
  if (!ids.has(linkId)) {
    // The app's own chains are numbered past any Word's (a short, unsigned id).
    ids.set(linkId, word ? Number(word[1]) : 1000 + ids.size)
  }
  return { id: ids.get(linkId)!, seq: Math.max(0, Math.round(Number(attrs.linkSeq) || 0)) }
}
