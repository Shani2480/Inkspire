import { readDash, readEffects } from "@/document/docx/shape-effects"
import { colorOf, schemeColors } from "@/document/docx/shape-import"

const EMU_PER_PX = 9525
const EMU_PER_PT = 12700

/** The app's shadow directions (Picture Effects > Shadow), each an offset of 3 px. */
const SHADOWS: [string, number, number][] = [
  ["outer-br", 3, 3],
  ["outer-b", 0, 3],
  ["outer-bl", -3, 3],
  ["outer-r", 3, 0],
  ["outer-l", -3, 0],
  ["outer-tr", 3, -3],
  ["outer-t", 0, -3],
  ["outer-tl", -3, -3],
]

/** Word's outer shadow as the nearest of the app's directions: its own presets have other distances and blurs. */
function nearestShadow(list: string) {
  const found = /<a:outerShdw\b([^>]*)>/.exec(list)
  if (!found) {
    return ""
  }
  const attrs = found[1] ?? ""
  const distance = Number(/\bdist="(\d+)"/.exec(attrs)?.[1] ?? 0) / EMU_PER_PX
  if (distance < 0.5) {
    return "outer-center"
  }
  const angle = (Number(/\bdir="(\d+)"/.exec(attrs)?.[1] ?? 0) / 60000) * (Math.PI / 180)
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  let best = SHADOWS[0]!
  let score = -Infinity
  for (const item of SHADOWS) {
    const length = Math.hypot(item[1], item[2])
    const dot = (item[1] * dx + item[2] * dy) / length
    if (dot > score) {
      score = dot
      best = item
    }
  }
  return best[0]
}

/**
 * A picture's formatting as Word wrote it, as the picture's own attributes (`picture-format.ts`): brightness and
 * contrast (`a:lum`), a recolour (`a:grayscl`, `a:biLevel`, Washout's `a:lum`), transparency (`a:alphaModFix`), the
 * border (`a:ln` of `pic:spPr`) and the shadow, glow, soft edges and reflection (`a:effectLst`). Only what is set is
 * returned; the writer compares with it to keep Word's own drawing when nothing was changed.
 */
export function readPictureLook(xml: string, themeXml: string | null) {
  const look: Record<string, string | number> = {}
  const blip = /<a:blip\b[^>]*>([\s\S]*?)<\/a:blip>/.exec(xml)?.[1] ?? ""
  const lum = /<a:lum\b([^>]*)\/?>/.exec(blip)?.[1]
  if (lum !== undefined) {
    const bright = Number(/\bbright="(-?\d+)"/.exec(lum)?.[1] ?? 0)
    const contrast = Number(/\bcontrast="(-?\d+)"/.exec(lum)?.[1] ?? 0)
    if (bright === 70000 && contrast === -70000) {
      look.recolor = "washout"
    } else {
      if (bright) {
        look.brightness = Math.max(-100, Math.min(100, Math.round(bright / 1000)))
      }
      if (contrast) {
        look.contrast = Math.max(-100, Math.min(100, Math.round(contrast / 1000)))
      }
    }
  }
  if (/<a:grayscl\s*\/>/.test(blip)) {
    look.recolor = "grayscale"
  } else if (/<a:biLevel\b/.test(blip)) {
    look.recolor = "black-white"
  }
  const alpha = /<a:alphaModFix\b[^>]*\bamt="(\d+)"/.exec(blip)?.[1]
  if (alpha !== undefined) {
    const transparency = Math.max(0, Math.min(100, Math.round(100 - Number(alpha) / 1000)))
    if (transparency) {
      look.transparency = transparency
    }
  }

  const properties = /<pic:spPr\b[\s\S]*?<\/pic:spPr>/.exec(xml)?.[0] ?? ""
  const scheme = schemeColors(themeXml)
  const line = /<a:ln\b[^>]*>[\s\S]*?<\/a:ln>/.exec(properties)?.[0] ?? ""
  const lineFill = /<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(line)?.[1]
  const border = lineFill ? colorOf(lineFill, scheme) : ""
  if (/^#[0-9a-f]{6}$/i.test(border)) {
    look.border = border.toLowerCase()
    const width = Number(/<a:ln\b[^>]*\bw="(\d+)"/.exec(line)?.[1])
    if (Number.isFinite(width) && width > 0) {
      look.borderWidth = Math.round((width / EMU_PER_PT) * 100) / 100
    }
    // The picture's border has three dashes: a round dot, a dash, or solid.
    const dash = readDash(line)
    if (dash) {
      look.borderDash = dash === "round-dot" || dash === "square-dot" ? "dot" : "dash"
    }
  }

  const list = /<a:effectLst>([\s\S]*?)<\/a:effectLst>/.exec(properties)?.[1] ?? ""
  if (list) {
    const effects = readEffects(properties, scheme)
    const shadow = effects.shadow || nearestShadow(list)
    if (shadow) {
      look.shadow = shadow
    }
    if (effects.glow) {
      look.glow = effects.glow
    }
    if (effects.softEdge) {
      look.softEdge = effects.softEdge
    }
    if (effects.reflection || /<a:reflection\b/.test(list)) {
      look.reflection = effects.reflection || "tight"
    }
  }
  return look
}

/** The editor's HTML attribute for each of the picture's attributes `readPictureLook` reads. */
export function pictureLookHtml(look: Record<string, string | number>) {
  return Object.entries(look)
    .map(([key, value]) => ` data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${String(value)}"`)
    .join("")
}
