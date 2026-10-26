import type { Border, BorderValue, Shading, ShadingValue, TableBorders } from "@/document/docx/model"
import { patternOf, patternValue } from "@/document/docx/shading-pattern"

/** A CSS colour as the six hex digits .docx uses, or undefined when it is not a plain colour. */
export function hexOf(css: unknown) {
  if (typeof css !== "string") {
    return undefined
  }
  const text = css.trim().toLowerCase()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text)
  if (short) {
    return `${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase()
  }
  if (/^#[0-9a-f]{6}$/.test(text)) {
    return text.slice(1).toUpperCase()
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(text)
  if (rgb) {
    return rgb
      .slice(1, 4)
      .map((part) => Math.min(255, Number(part)).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  }
  return undefined
}

/** The fill and pattern the editor gave a cell (backgroundColor, shadingPattern), as w:shd. */
export function shadingOf(backgroundColor: unknown, shadingPattern?: unknown): Shading | undefined {
  const fill = hexOf(backgroundColor)
  const pattern = patternOf(shadingPattern)
  if (!fill && !pattern) {
    return undefined
  }
  return {
    value: (pattern?.pattern ?? "clear") as ShadingValue,
    color: hexOf(pattern?.color) ?? "auto",
    fill: fill ?? "auto",
  }
}

const PEN_STYLES: Record<string, BorderValue> = {
  solid: "single",
  dashed: "dashed",
  dotted: "dotted",
  double: "double",
}

/** One border from a pen written as the CSS shorthand ("1px solid #404040"). */
export function borderOf(pen: unknown): Border {
  const [width = "", style = "solid", color = ""] = typeof pen === "string" ? pen.split(/\s+/) : []
  const points = Number.parseFloat(width) * 0.75
  return {
    value: PEN_STYLES[style] ?? "single",
    // w:sz counts eighths of a point, from 2 to 96.
    sz: Number.isFinite(points) ? Math.min(96, Math.max(2, Math.round(points * 8))) : 4,
    space: 0,
    color: hexOf(color) ?? "auto",
  }
}

/** A Word cell's fill and pattern from its `wordShading`. */
export function wordShadingOf(value: unknown): { fill: string | null; pattern: string | null } {
  const [fill, pattern, color] = typeof value === "string" ? value.split(" ") : []
  return {
    fill: fill && fill !== "-" ? fill : null,
    pattern: pattern && pattern !== "-" ? patternValue(pattern, color && color !== "-" ? color : null) : null,
  }
}

/** A Word cell's shading as its `wordShading` value: "fill pattern color", each "-" when it has none; null for none. */
export function wordShadingValue(shading: Shading | undefined): string | null {
  if (!shading) {
    return null
  }
  const hex = (value: string | undefined) => (value && /^[0-9A-Fa-f]{6}$/.test(value) ? `#${value.toLowerCase()}` : "-")
  const fill = hex(shading.fill)
  const pattern = patternOf(shading.value) ? shading.value : "-"
  const color = pattern === "-" ? "-" : hex(shading.color)
  return fill === "-" && pattern === "-" ? null : `${fill} ${pattern} ${color}`
}

/**
 * A cell's w:shd from what the app set (backgroundColor, shadingPattern) over what the Word cell had (`wordShading`):
 * undefined when the app set neither, so the cell keeps Word's own; a cleared fill is "transparent", a cleared pattern
 * "clear".
 */
export function editedShading(attrs: Record<string, unknown> | undefined): Shading | undefined {
  const fill = attrs?.backgroundColor
  const pattern = attrs?.shadingPattern
  if (fill == null && pattern == null) {
    return undefined
  }
  const word = wordShadingOf(attrs?.wordShading)
  return (
    shadingOf(fill ?? word.fill, pattern ?? word.pattern) ??
    (attrs?.wordShading ? { value: "clear", color: "auto", fill: "auto" } : undefined)
  )
}

const SIDE_NAMES = ["top", "left", "bottom", "right"] as const

const CELL_SIDES = ["top", "right", "bottom", "left"] as const
type CellSide = (typeof CELL_SIDES)[number]

/** A `sidePens` value as the pen of each side it names. */
export function sidePensOf(value: unknown): Partial<Record<CellSide, string>> {
  const pens: Partial<Record<CellSide, string>> = {}
  for (const part of typeof value === "string" ? value.split(";") : []) {
    const [side, pen] = part.split("=")
    if ((CELL_SIDES as readonly string[]).includes(side) && pen?.trim()) {
      pens[side as CellSide] = pen.trim()
    }
  }
  return pens
}

/** The `sidePens` value for some sides' pens; null for none. */
export function sidePensValue(pens: Partial<Record<CellSide, string>>) {
  return (
    CELL_SIDES.filter((side) => pens[side])
      .map((side) => `${side}=${pens[side]}`)
      .join(";") || null
  )
}

/**
 * The cell borders the editor drew (borders and borderPen, with any side's own pen from `sidePens`), as w:tcBorders.
 */
export function bordersOf(
  borders: unknown,
  pen: unknown,
  sidePens: Partial<Record<string, string>> = {},
): TableBorders | undefined {
  if (typeof borders !== "string" || borders === "") {
    return undefined
  }
  if (borders === "none") {
    return { top: { value: "nil" }, left: { value: "nil" }, bottom: { value: "nil" }, right: { value: "nil" } }
  }
  const tokens = borders.split(" ")
  const sides: string[] = borders === "all" ? [...SIDE_NAMES] : SIDE_NAMES.filter((side) => tokens.includes(side))
  // The two diagonals of a cell (21.30): "diagDown" runs top-left to bottom-right, "diagUp" top-right to bottom-left.
  if (tokens.includes("diagDown")) {
    sides.push("tl2br")
  }
  if (tokens.includes("diagUp")) {
    sides.push("tr2bl")
  }
  if (sides.length === 0) {
    return undefined
  }
  const border = borderOf(pen)
  return Object.fromEntries(sides.map((side) => [side, sidePens[side] ? borderOf(sidePens[side]) : { ...border }]))
}
