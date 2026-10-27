import { gradientStops, gradientVector, wordGradientValue } from "@/editor/shape-style"
import { colorOf } from "@/document/docx/shape-import"

/**
 * The parts of a shape's look that DrawingML has a plain counterpart for, beyond its colours: outer shadows, glow,
 * soft edges, reflections, dashes and two-stop gradients, each written and read back as the app's own choice.
 */
const SHADOW_DIRECTIONS: Record<string, [number, number]> = {
  "outer-br": [3, 3],
  "outer-b": [0, 3],
  "outer-bl": [-3, 3],
  "outer-r": [3, 0],
  "outer-center": [0, 0],
  "outer-l": [-3, 0],
  "outer-tr": [3, -3],
  "outer-t": [0, -3],
  "outer-tl": [-3, -3],
}

/** Word's reflection presets: where the reflection fades out, and its gap in EMU. */
const REFLECTIONS: Record<string, [number, number]> = {
  tight: [55000, 0],
  half: [50000, 0],
  full: [90000, 0],
  "tight-offset": [55000, 50800],
  "half-offset": [50000, 50800],
  "full-offset": [90000, 50800],
}

const EMU_PER_PX = 9525
const EMU_PER_PT = 12700

type Attrs = Record<string, unknown>

/** Whether every effect the shape has can be written as `a:effectLst` (bevel and 3-D rotation cannot). */
export function plainEffects(attrs: Attrs) {
  const shadow = String(attrs.shadow || "")
  return (
    !attrs.bevel &&
    !attrs.rot3d &&
    !attrs.effect &&
    (!shadow || shadow in SHADOW_DIRECTIONS) &&
    (!attrs.reflection || String(attrs.reflection) in REFLECTIONS)
  )
}

const HEX = /^#[0-9a-fA-F]{6}$/

/** The `a:effectLst` for a shape's shadow, glow, soft edges and reflection, or "" when it has none. */
export function effectListXml(attrs: Attrs) {
  const parts: string[] = []
  const shadow = SHADOW_DIRECTIONS[String(attrs.shadow || "")]
  if (shadow) {
    const [dx, dy] = shadow
    const distance = Math.round(Math.hypot(dx, dy) * EMU_PER_PX)
    const direction = Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360) * 60000
    parts.push(
      `<a:outerShdw blurRad="28575" dist="${distance}" dir="${direction}" algn="ctr" rotWithShape="0">` +
        `<a:srgbClr val="000000"><a:alpha val="40000"/></a:srgbClr></a:outerShdw>`,
    )
  }
  const [glowColor, glowSize] = String(attrs.glow || "").split(":")
  if (glowColor && HEX.test(glowColor)) {
    const radius = Math.round((Number(glowSize) || 8) * EMU_PER_PT)
    parts.push(
      `<a:glow rad="${radius}"><a:srgbClr val="${glowColor.slice(1).toUpperCase()}"><a:alpha val="40000"/></a:srgbClr></a:glow>`,
    )
  }
  const soft = Number(attrs.softEdge) || 0
  if (soft > 0) {
    parts.push(`<a:softEdge rad="${Math.round(soft * EMU_PER_PT)}"/>`)
  }
  const reflection = REFLECTIONS[String(attrs.reflection || "")]
  if (reflection) {
    parts.push(
      `<a:reflection blurRad="6350" stA="50000" stPos="0" endA="300" endPos="${reflection[0]}" dist="${reflection[1]}" dir="5400000" fadeDir="5400012" sx="100000" sy="-100000" algn="bl" rotWithShape="0"/>`,
    )
  }
  return parts.length > 0 ? `<a:effectLst>${parts.join("")}</a:effectLst>` : ""
}

/** The effects an `a:effectLst` holds, as the app's own attributes (only what the app itself would have written). */
export function readEffects(properties: string, scheme: Map<string, string> = new Map()) {
  const list = /<a:effectLst>([\s\S]*?)<\/a:effectLst>/.exec(properties)?.[1] ?? ""
  const found = { shadow: "", glow: "", softEdge: 0, reflection: "" }
  const shadow = /<a:outerShdw\b[^>]*\bdist="(\d+)"[^>]*\bdir="(\d+)"/.exec(list)
  if (shadow) {
    const distance = Number(shadow[1]) / EMU_PER_PX
    const angle = (Number(shadow[2]) / 60000) * (Math.PI / 180)
    const dx = Math.round(Math.cos(angle) * distance)
    const dy = Math.round(Math.sin(angle) * distance)
    found.shadow = Object.entries(SHADOW_DIRECTIONS).find(([, [x, y]]) => x === dx && y === dy)?.[0] ?? ""
  }
  const glow = /<a:glow rad="(\d+)">([\s\S]*?)<\/a:glow>/.exec(list)
  const glowColor = glow ? colorOf(glow[2] ?? "", scheme) : ""
  if (glow && glowColor) {
    found.glow = `${glowColor}:${Math.round(Number(glow[1]) / EMU_PER_PT)}`
  }
  const soft = /<a:softEdge rad="(\d+)"/.exec(list)
  if (soft) {
    found.softEdge = Math.round(Number(soft[1]) / EMU_PER_PT)
  }
  const reflection = /<a:reflection\b[^>]*\bendPos="(\d+)"[^>]*\bdist="(\d+)"/.exec(list)
  if (reflection) {
    found.reflection =
      // Word's own presets end a little off these values (Tight ends at 55500), so the nearest one is taken.
      Object.entries(REFLECTIONS).find(
        ([, [end, gap]]) => Math.abs(end - Number(reflection[1])) <= 1000 && gap === Number(reflection[2]),
      )?.[0] ?? ""
  }
  return found
}

/** Word's preset dash for each of the app's outline dashes. */
export const PRESET_DASH: Record<string, string> = {
  "round-dot": "sysDot",
  "square-dot": "sysDash",
  dash: "dash",
  "dash-dot": "dashDot",
  "long-dash": "lgDash",
  "long-dash-dot": "lgDashDot",
  "long-dash-dot-dot": "lgDashDotDot",
}

/** Word dashes its Dash Type list does not offer, read as the nearest one it does. */
const NEAREST_DASH: Record<string, string> = { sysDashDot: "dash-dot", sysDashDotDot: "long-dash-dot-dot" }

export function readDash(line: string) {
  const preset = /<a:prstDash val="(\w+)"/.exec(line)?.[1]
  if (!preset) {
    // A custom dash (a:custDash) shows as a plain dash.
    return /<a:custDash\b/.test(line) ? "dash" : ""
  }
  return Object.entries(PRESET_DASH).find(([, value]) => value === preset)?.[0] ?? NEAREST_DASH[preset] ?? ""
}

const DIRECTIONS = ["down", "up", "right", "left", "diagonal", "diagonal-up", "diagonal-back"]

const hexOf = (xml: string) => {
  const value = /<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(xml)?.[1]
  return value ? `#${value.toLowerCase()}` : ""
}

/**
 * A gradient fill as the app's `fill` and `fillGradient`: one of the app's own presets when it is one the app would
 * have written (a light or dark two-stop gradient in one of its directions), otherwise Word's stops and angle kept
 * whole (`wordGradientValue`), with its first colour as the fill. Null only when a stop's colour cannot be read.
 */
export function readGradient(
  properties: string,
  scheme: Map<string, string> = new Map(),
): { fill: string; gradient: string } | null {
  const body = /<a:gradFill\b[\s\S]*?<\/a:gradFill>/.exec(properties)?.[0]
  if (!body) {
    return null
  }
  return appGradient(body) ?? wordGradient(body, scheme)
}

function wordGradient(body: string, scheme: Map<string, string>) {
  const stops = [...body.matchAll(/<a:gs pos="(\d+)">([\s\S]*?)<\/a:gs>/g)].map((match): [number, string] => [
    Number(match[1]) / 1000,
    colorOf(match[2] ?? "", scheme),
  ])
  if (stops.length < 2 || stops.some(([, color]) => !color)) {
    return null
  }
  stops.sort((a, b) => a[0] - b[0])
  const angle = /<a:lin ang="(\d+)"/.exec(body)?.[1]
  // Word's path gradients (circle, rectangle, shape) all show as a radial one.
  const gradient = wordGradientValue({ angle: angle === undefined ? null : Number(angle) / 60000, stops })
  return { fill: stops[0]![1], gradient }
}

function appGradient(body: string): { fill: string; gradient: string } | null {
  const stops = [...body.matchAll(/<a:gs pos="(\d+)">([\s\S]*?)<\/a:gs>/g)].map((match) => hexOf(match[2] ?? ""))
  if (stops.length !== 2 || stops.some((stop) => !stop)) {
    return null
  }
  let direction = "radial"
  const angle = /<a:lin ang="(\d+)"/.exec(body)?.[1]
  if (angle !== undefined) {
    const degrees = Number(angle) / 60000
    const found = DIRECTIONS.find((name) => {
      const vector = gradientVector(`light-${name}`)
      return (
        vector !== null &&
        Math.round(((Math.atan2(vector[3] - vector[1], vector[2] - vector[0]) * 180) / Math.PI + 360) % 360) === degrees
      )
    })
    if (!found) {
      return null
    }
    direction = found
  } else if (!/<a:path path="circle"/.test(body)) {
    return null
  }
  const [from, to] = stops as [string, string]
  // The base colour the two stops were made from: the later stop of a light gradient, or undoing the dark shading.
  const channels = (hex: string) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16))
  const rebuild = (values: number[]) =>
    `#${values
      .map((value) =>
        Math.max(0, Math.min(255, Math.round(value)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`
  const candidates: [string, string][] = [
    ["light", to],
    ["dark", rebuild(channels(to).map((value) => value / 0.6))],
    ["dark", rebuild(channels(from).map((value) => (value - 63.75) / 0.75))],
  ]
  for (const [tone, base] of candidates) {
    const expected = gradientStops(base, `${tone}-${direction}`)
    if (expected[0] === from && expected[1] === to) {
      return { fill: base, gradient: `${tone}-${direction}` }
    }
  }
  return null
}
