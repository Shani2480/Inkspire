import { POINTS_BOX, type Point, type Segment } from "@/editor/shape-points"
import PRESETS from "@/document/docx/preset-geometry.json"

/**
 * DrawingML's preset shapes worked out as Word draws them (21.35): the adjust values, guide formulas and paths of
 * ECMA-376's presetShapeDefinitions (`preset-geometry.json`, built by `docs/shapes/build-preset-geometry.mjs`),
 * evaluated at the shape's size, as points the app's freeform shape draws.
 */

type Value = number | string
type Command = [string, ...Value[]]
type PresetPath = { w?: number; h?: number; f?: 0; s?: 0; c: Command[] }
type Preset = { a?: [string, string][]; g?: [string, string][]; p: PresetPath[] }

const SHAPES = PRESETS as unknown as Record<string, Preset>

/** An angle in DrawingML's 60000ths of a degree, in radians. */
const radians = (angle: number) => (angle / 60000) * (Math.PI / 180)
/** Radians as DrawingML's 60000ths of a degree. */
const angleOf = (value: number) => (value * 180 * 60000) / Math.PI

export function hasPresetGeometry(name: string) {
  return Object.prototype.hasOwnProperty.call(SHAPES, name)
}

/** The built-in guides every formula may use: the shape's edges, centre, fractions of its sides and angles. */
function builtIns(w: number, h: number) {
  const ss = Math.min(w, h)
  const ls = Math.max(w, h)
  const values = new Map<string, number>([
    ["w", w],
    ["h", h],
    ["l", 0],
    ["t", 0],
    ["r", w],
    ["b", h],
    ["hc", w / 2],
    ["vc", h / 2],
    ["ss", ss],
    ["ls", ls],
    ["cd2", 10800000],
    ["cd4", 5400000],
    ["cd8", 2700000],
    ["3cd4", 16200000],
    ["3cd8", 8100000],
    ["5cd8", 13500000],
    ["7cd8", 18900000],
  ])
  return { values, sides: { w, h, ss, ls } as Record<string, number> }
}

/** A guide formula ("*\/ w adj1 100000", w times adj1 over 100000) with its arguments looked up. */
function evaluate(formula: string, lookup: (name: string) => number) {
  const [op, ...args] = formula.trim().split(/\s+/)
  const [x = 0, y = 0, z = 0] = args.map(lookup)
  switch (op) {
    case "val":
      return x
    case "*/":
      return z === 0 ? 0 : (x * y) / z
    case "+-":
      return x + y - z
    case "+/":
      return z === 0 ? 0 : (x + y) / z
    case "?:":
      return x > 0 ? y : z
    case "abs":
      return Math.abs(x)
    case "at2":
      return angleOf(Math.atan2(y, x))
    case "cat2":
      return x * Math.cos(Math.atan2(z, y))
    case "sat2":
      return x * Math.sin(Math.atan2(z, y))
    case "cos":
      return x * Math.cos(radians(y))
    case "sin":
      return x * Math.sin(radians(y))
    case "tan":
      return x * Math.tan(radians(y))
    case "max":
      return Math.max(x, y)
    case "min":
      return Math.min(x, y)
    case "mod":
      return Math.sqrt(x * x + y * y + z * z)
    case "pin":
      return y < x ? x : y > z ? z : y
    case "sqrt":
      return Math.sqrt(Math.max(0, x))
    default:
      return 0
  }
}

/** The point on an ellipse at a visual angle (the angle of the ray from its centre), as DrawingML's arcs take it. */
function ellipseParameter(wR: number, hR: number, angle: number) {
  return Math.atan2(wR * Math.sin(angle), hR * Math.cos(angle))
}

/** Cubic curves for an elliptical arc from parameter `from` to `to` about `centre`, a quarter turn at most each. */
function arcCurves(centre: Point, wR: number, hR: number, from: number, to: number): Segment[] {
  const pieces = Math.max(1, Math.ceil(Math.abs(to - from) / (Math.PI / 2) - 1e-9))
  const step = (to - from) / pieces
  const k = (4 / 3) * Math.tan(step / 4)
  const at = (t: number): Point => [centre[0] + wR * Math.cos(t), centre[1] + hR * Math.sin(t)]
  const segments: Segment[] = []
  for (let index = 0; index < pieces; index += 1) {
    const a = from + step * index
    const b = a + step
    const start = at(a)
    const end = at(b)
    segments.push({
      kind: "C",
      c1: [start[0] - k * wR * Math.sin(a), start[1] + k * hR * Math.cos(a)],
      c2: [end[0] + k * wR * Math.sin(b), end[1] - k * hR * Math.cos(b)],
      to: end,
    })
  }
  return segments
}

/**
 * The preset's outline at `w` by `h` (any unit; Word's are EMU), its adjust values overridden by the shape's own
 * (`adjust`, as Word writes them in `a:avLst`), as points in the app's 100 by 100 box. Paths that are only filled
 * or only outlined are drawn as the rest are. Null for a name that is not a preset.
 */
export function presetSegments(
  name: string,
  w: number,
  h: number,
  adjust: Record<string, number> = {},
): Segment[] | null {
  const shape = SHAPES[name]
  if (!shape || !(w > 0) || !(h > 0)) {
    return null
  }
  const { values, sides } = builtIns(w, h)
  const lookup = (key: string): number => {
    if (/^-?\d+(?:\.\d+)?$/.test(key)) {
      return Number(key)
    }
    const known = values.get(key)
    if (known !== undefined) {
      return known
    }
    // wd2, hd4, ssd8, ...: a side divided by a number.
    const divided = /^(w|h|ss|ls)d(\d+)$/.exec(key)
    if (divided) {
      return sides[divided[1]!]! / Number(divided[2])
    }
    return 0
  }
  for (const [guide, formula] of shape.a ?? []) {
    values.set(guide, guide in adjust ? adjust[guide]! : evaluate(formula, lookup))
  }
  for (const [guide, formula] of shape.g ?? []) {
    values.set(guide, evaluate(formula, lookup))
  }
  const read = (value: Value | undefined) => (typeof value === "number" ? value : lookup(value ?? "0"))
  const box = (x: number, y: number, pathW: number, pathH: number): Point => [
    Math.round((x / pathW) * POINTS_BOX * 100) / 100,
    Math.round((y / pathH) * POINTS_BOX * 100) / 100,
  ]
  const segments: Segment[] = []
  for (const path of shape.p) {
    // A path with its own size has its coordinates in that size, stretched to the shape's.
    const pathW = path.w ?? w
    const pathH = path.h ?? h
    let current: Point = [0, 0]
    let start: Point = [0, 0]
    for (const [kind, ...args] of path.c) {
      if (kind === "M" || kind === "L") {
        current = [read(args[0]), read(args[1])]
        if (kind === "M") {
          start = current
        }
        segments.push({ kind, to: box(current[0], current[1], pathW, pathH) })
      } else if (kind === "C" || kind === "Q") {
        const coords = args.map(read)
        const points: Point[] = []
        for (let index = 0; index + 1 < coords.length; index += 2) {
          points.push([coords[index]!, coords[index + 1]!])
        }
        if (kind === "Q" && points.length === 2) {
          // A quadratic curve as the cubic that draws it.
          const [control, end] = points as [Point, Point]
          const c1: Point = [
            current[0] + (2 / 3) * (control[0] - current[0]),
            current[1] + (2 / 3) * (control[1] - current[1]),
          ]
          const c2: Point = [end[0] + (2 / 3) * (control[0] - end[0]), end[1] + (2 / 3) * (control[1] - end[1])]
          segments.push({
            kind: "C",
            c1: box(c1[0], c1[1], pathW, pathH),
            c2: box(c2[0], c2[1], pathW, pathH),
            to: box(end[0], end[1], pathW, pathH),
          })
          current = end
        } else if (kind === "C" && points.length === 3) {
          const [c1, c2, end] = points as [Point, Point, Point]
          segments.push({
            kind: "C",
            c1: box(c1[0], c1[1], pathW, pathH),
            c2: box(c2[0], c2[1], pathW, pathH),
            to: box(end[0], end[1], pathW, pathH),
          })
          current = end
        }
      } else if (kind === "A") {
        const [wR, hR, stAng, swAng] = args.map(read) as [number, number, number, number]
        if (!(wR > 0) || !(hR > 0)) {
          continue
        }
        const from = ellipseParameter(wR, hR, radians(stAng))
        let to = ellipseParameter(wR, hR, radians(stAng + swAng))
        // The parameters run the way the swing does, a full turn for a full circle.
        if (swAng > 0) {
          while (to <= from + 1e-9) to += 2 * Math.PI
          if (swAng >= 21600000) to = from + 2 * Math.PI
        } else if (swAng < 0) {
          while (to >= from - 1e-9) to -= 2 * Math.PI
          if (swAng <= -21600000) to = from - 2 * Math.PI
        } else {
          continue
        }
        const centre: Point = [current[0] - wR * Math.cos(from), current[1] - hR * Math.sin(from)]
        for (const curve of arcCurves(centre, wR, hR, from, to)) {
          if (curve.kind === "C") {
            segments.push({
              kind: "C",
              c1: box(curve.c1[0], curve.c1[1], pathW, pathH),
              c2: box(curve.c2[0], curve.c2[1], pathW, pathH),
              to: box(curve.to[0], curve.to[1], pathW, pathH),
            })
          }
        }
        current = [centre[0] + wR * Math.cos(to), centre[1] + hR * Math.sin(to)]
      } else if (kind === "Z") {
        segments.push({ kind: "Z" })
        current = start
      }
    }
  }
  return segments.length > 0 ? segments : null
}

/** The adjust values a `a:prstGeom` sets in its `a:avLst` (`<a:gd name="adj" fmla="val 25000"/>`). */
export function presetAdjust(xml: string): Record<string, number> {
  const list = /<a:prstGeom\b[\s\S]*?<\/a:prstGeom>/.exec(xml)?.[0] ?? ""
  const adjust: Record<string, number> = {}
  for (const match of list.matchAll(/<a:gd name="(\w+)" fmla="val (-?\d+)"\s*\/>/g)) {
    adjust[match[1]!] = Number(match[2])
  }
  return adjust
}
