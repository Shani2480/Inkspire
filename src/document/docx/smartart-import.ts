/**
 * A SmartArt graphic Word saved (21.36), drawn from the pre-rendered shapes in its drawing part
 * (`dsp:drawing`, the part Word itself shows): each shape's geometry, fill, outline and text, in the frame's own
 * coordinates. The graphic is shown, not edited; the five diagram parts stay as they were on save.
 */
import { colorOf, schemeColors } from "@/document/docx/shape-import"

/** The relationship id of a diagram's data part, from the graphic's `dgm:relIds`. */
export function diagramDataRelId(drawingXml: string) {
  return /<(?:\w+:)?relIds\b[^>]*\br:dm="([^"]+)"/.exec(drawingXml)?.[1]
}

/** The relationship id of the pre-rendered drawing, named in the data part's `dsp:dataModelExt`. */
export function diagramDrawingRelId(dataXml: string) {
  return /<(?:\w+:)?dataModelExt\b[^>]*\brelId="([^"]+)"/.exec(dataXml)?.[1]
}

const EMU_PER_PT = 12700

function escapeText(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** The outline of a preset geometry in a box of w × h, as an SVG path. Unknown presets are the box itself. */
function presetPath(preset: string, w: number, h: number): string {
  const rect = `M0 0H${w}V${h}H0Z`
  switch (preset) {
    case "rect":
      return rect
    case "roundRect": {
      const r = Math.min(w, h) * 0.16667
      return `M${r} 0H${w - r}Q${w} 0 ${w} ${r}V${h - r}Q${w} ${h} ${w - r} ${h}H${r}Q0 ${h} 0 ${h - r}V${r}Q0 0 ${r} 0Z`
    }
    case "ellipse": {
      const rx = w / 2
      const ry = h / 2
      return `M0 ${ry}A${rx} ${ry} 0 1 0 ${w} ${ry}A${rx} ${ry} 0 1 0 0 ${ry}Z`
    }
    case "triangle":
      return `M${w / 2} 0L${w} ${h}H0Z`
    case "diamond":
      return `M${w / 2} 0L${w} ${h / 2}L${w / 2} ${h}L0 ${h / 2}Z`
    case "hexagon":
      return `M${w * 0.25} 0H${w * 0.75}L${w} ${h / 2}L${w * 0.75} ${h}H${w * 0.25}L0 ${h / 2}Z`
    case "parallelogram":
      return `M${w * 0.25} 0H${w}L${w * 0.75} ${h}H0Z`
    case "trapezoid":
      return `M${w * 0.2} 0H${w * 0.8}L${w} ${h}H0Z`
    case "chevron":
      return `M0 0H${w * 0.7}L${w} ${h / 2}L${w * 0.7} ${h}H0L${w * 0.3} ${h / 2}Z`
    case "homePlate":
      return `M0 0H${w * 0.75}L${w} ${h / 2}L${w * 0.75} ${h}H0Z`
    case "rightArrow":
      return `M0 ${h * 0.25}H${w * 0.6}V0L${w} ${h / 2}L${w * 0.6} ${h}V${h * 0.75}H0Z`
    case "leftArrow":
      return `M${w} ${h * 0.25}H${w * 0.4}V0L0 ${h / 2}L${w * 0.4} ${h}V${h * 0.75}H${w}Z`
    case "upArrow":
      return `M${w * 0.25} ${h}V${h * 0.4}H0L${w / 2} 0L${w} ${h * 0.4}H${w * 0.75}V${h}Z`
    case "downArrow":
      return `M${w * 0.25} 0V${h * 0.6}H0L${w / 2} ${h}L${w} ${h * 0.6}H${w * 0.75}V0Z`
    case "plus":
      return `M${w / 3} 0H${(w * 2) / 3}V${h / 3}H${w}V${(h * 2) / 3}H${(w * 2) / 3}V${h}H${w / 3}V${(h * 2) / 3}H0V${h / 3}H${w / 3}Z`
    default:
      return rect
  }
}

function fillOf(properties: string, style: string, scheme: Map<string, string>) {
  const own = properties.replace(/<a:ln[\s>][\s\S]*?<\/a:ln>/, "")
  if (/<a:noFill\s*\/>/.test(own)) {
    return "none"
  }
  const solid = /<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(own)?.[1]
  if (solid) {
    return colorOf(solid, scheme) || "none"
  }
  const reference = /<a:fillRef idx="\d+">([\s\S]*?)<\/a:fillRef>/.exec(style)?.[1]
  return reference ? colorOf(reference, scheme) || "none" : "none"
}

function lineOf(properties: string, style: string, scheme: Map<string, string>) {
  const line = /<a:ln[\s>][\s\S]*?<\/a:ln>/.exec(properties)?.[0] ?? ""
  if (/<a:noFill\s*\/>/.test(line)) {
    return { stroke: "none", width: 0 }
  }
  const solid = /<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(line)?.[1]
  const reference = /<a:lnRef idx="\d+">([\s\S]*?)<\/a:lnRef>/.exec(style)?.[1]
  const stroke = solid ? colorOf(solid, scheme) : reference ? colorOf(reference, scheme) : ""
  const width = Number(/<a:ln [^>]*\bw="(\d+)"/.exec(line)?.[1] ?? 0)
  return { stroke: stroke || "none", width }
}

/** The shape's text as SVG, centred in the box the drawing gives it (`dsp:txXfrm`, else the shape's own). */
function textOf(shape: string, box: { x: number; y: number; w: number; h: number }, color: string) {
  const body = /<dsp:txBody>([\s\S]*?)<\/dsp:txBody>/.exec(shape)?.[1] ?? ""
  const lines: { text: string; size: number }[] = []
  for (const paragraph of body.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? []) {
    const text = [...paragraph.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((match) => match[1] ?? "").join("")
    if (!text) {
      continue
    }
    const size = Number(
      /<a:rPr[^>]*\bsz="(\d+)"/.exec(paragraph)?.[1] ?? /<a:endParaRPr[^>]*\bsz="(\d+)"/.exec(paragraph)?.[1] ?? 1800,
    )
    lines.push({ text, size: (size / 100) * EMU_PER_PT })
  }
  if (lines.length === 0) {
    return ""
  }
  const total = lines.reduce((sum, line) => sum + line.size * 1.2, 0)
  let y = box.y + box.h / 2 - total / 2
  const fill = /<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(body)
  const ink = color || (fill ? "" : "#ffffff")
  return lines
    .map((line) => {
      y += line.size * 1.2
      return `<text x="${box.x + box.w / 2}" y="${y - line.size * 0.25}" font-size="${line.size}" text-anchor="middle" fill="${ink}" font-family="sans-serif">${escapeText(line.text)}</text>`
    })
    .join("")
}

/** The graphic as an SVG of the frame's size (cx × cy EMU), or null when the drawing holds no shapes. */
export function renderDiagramDrawing(drawingXml: string, themeXml: string | null, cx: number, cy: number) {
  const scheme = schemeColors(themeXml)
  const shapes = drawingXml.match(/<dsp:sp\b[\s\S]*?<\/dsp:sp>/g) ?? []
  if (shapes.length === 0) {
    return null
  }
  const parts: string[] = []
  for (const shape of shapes) {
    const properties = /<dsp:spPr[\s>][\s\S]*?<\/dsp:spPr>/.exec(shape)?.[0] ?? ""
    const style = /<dsp:style>[\s\S]*?<\/dsp:style>/.exec(shape)?.[0] ?? ""
    const frame = /<a:xfrm([^>]*)><a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"/.exec(properties)
    if (!frame) {
      continue
    }
    const [, flags = "", ox = "0", oy = "0", ew = "0", eh = "0"] = frame
    const x = Number(ox)
    const y = Number(oy)
    const w = Number(ew)
    const h = Number(eh)
    const preset = /<a:prstGeom prst="(\w+)"/.exec(properties)?.[1] ?? "rect"
    const turn = Number(/\brot="(-?\d+)"/.exec(flags)?.[1] ?? 0) / 60000
    const flipH = /\bflipH="(1|true)"/.test(flags)
    const flipV = /\bflipV="(1|true)"/.test(flags)
    const line = lineOf(properties, style, scheme)
    const transform = [
      `translate(${x} ${y})`,
      turn || flipH || flipV
        ? `translate(${w / 2} ${h / 2}) rotate(${turn}) scale(${flipH ? -1 : 1} ${flipV ? -1 : 1}) translate(${-w / 2} ${-h / 2})`
        : "",
    ]
      .filter(Boolean)
      .join(" ")
    parts.push(
      `<path transform="${transform}" d="${presetPath(preset, w, h)}" fill="${fillOf(properties, style, scheme)}" ` +
        `stroke="${line.stroke}" stroke-width="${line.width}"/>`,
    )
    const text = /<dsp:txXfrm><a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"/.exec(shape)
    const box = text
      ? { x: Number(text[1]), y: Number(text[2]), w: Number(text[3]), h: Number(text[4]) }
      : { x, y, w, h }
    const fontRef = /<a:fontRef[^>]*>([\s\S]*?)<\/a:fontRef>/.exec(style)?.[1] ?? ""
    parts.push(textOf(shape, box, fontRef ? colorOf(fontRef, scheme) : ""))
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cx} ${cy}" width="${Math.round(cx / 9525)}" ` +
    `height="${Math.round(cy / 9525)}">${parts.join("")}</svg>`
  )
}
