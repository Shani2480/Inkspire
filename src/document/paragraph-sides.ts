/**
 * A Word paragraph whose box sides are drawn with different lines (a red single top, a blue double bottom): each
 * drawn side's w:val, w:sz (eighths of a point) and colour, as "top:single,12,C00000;bottom:double,18,0070C0". The
 * editor draws it (`--para-<side>`) and the converter writes it back; shared so neither imports the other.
 */

export type SideLine = { value: string; sz: number; color: string }

const SIDES = ["top", "right", "bottom", "left"] as const
type Side = (typeof SIDES)[number]

/** The sides of a `borderSides` value; anything malformed is left out. */
export function parseBorderSides(value: unknown): Partial<Record<Side, SideLine>> {
  const sides: Partial<Record<Side, SideLine>> = {}
  if (typeof value !== "string") {
    return sides
  }
  for (const entry of value.split(";")) {
    const match = /^(top|right|bottom|left):([A-Za-z]+),(\d{1,3}),([0-9A-Fa-f]{6}|auto)$/.exec(entry.trim())
    if (match) {
      sides[match[1] as Side] = { value: match[2]!, sz: Number(match[3]), color: match[4]! }
    }
  }
  return sides
}

/** CSS styles a Word line style is drawn with. */
function cssStyle(value: string) {
  if (value === "dotted") {
    return "dotted"
  }
  if (/dash/i.test(value)) {
    return "dashed"
  }
  if (value === "double" || value === "triple" || /^thin|^thick.+Gap$/.test(value)) {
    return "double"
  }
  return "solid"
}

/** A side's line as the CSS shorthand and its width in px. Word draws each line of a double at the full width. */
export function sideCss(line: SideLine) {
  const style = cssStyle(line.value)
  const px = (line.sz / 8 / 0.75) * (style === "double" ? 3 : 1)
  const width = Math.round(Math.max(1, px) * 100) / 100
  const color = line.color === "auto" ? "#000000" : `#${line.color.toLowerCase()}`
  return { pen: `${width}px ${style} ${color}`, width }
}

/** The custom properties `index.css` draws each side of a paragraph's box with. */
export function borderSidesStyle(value: unknown): string[] {
  const sides = parseBorderSides(value)
  return SIDES.flatMap((side) => {
    const line = sides[side]
    if (!line) {
      return []
    }
    const { pen, width } = sideCss(line)
    return [`--para-${side}: ${pen}`, `--para-line-${side}: ${width}px`]
  })
}
