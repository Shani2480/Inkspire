/**
 * Word's shading patterns (Borders and Shading > Shading > Patterns, 22.4): a `w:shd` value laid over the fill in
 * the pattern's colour. A paragraph keeps one as `shadingPattern`, the value and, when not automatic, its colour
 * ("pct25", "diagStripe #c00000").
 */
export const SHADING_PATTERNS: { value: string; label: string }[] = [
  { value: "clear", label: "Clear" },
  { value: "solid", label: "Solid (100%)" },
  ...[5, 10, 12.5, 15, 20, 25, 30, 35, 37.5, 40, 45, 50, 55, 60, 62.5, 65, 70, 75, 80, 85, 87.5, 90, 95].map(
    (percent) => ({ value: `pct${Math.floor(percent)}`, label: `${percent}%` }),
  ),
  { value: "horzStripe", label: "Dk Horizontal" },
  { value: "vertStripe", label: "Dk Vertical" },
  { value: "reverseDiagStripe", label: "Dk Dwn Diagonal" },
  { value: "diagStripe", label: "Dk Up Diagonal" },
  { value: "horzCross", label: "Dk Grid" },
  { value: "diagCross", label: "Dk Trellis" },
  { value: "thinHorzStripe", label: "Lt Horizontal" },
  { value: "thinVertStripe", label: "Lt Vertical" },
  { value: "thinReverseDiagStripe", label: "Lt Dwn Diagonal" },
  { value: "thinDiagStripe", label: "Lt Up Diagonal" },
  { value: "thinHorzCross", label: "Lt Grid" },
  { value: "thinDiagCross", label: "Lt Trellis" },
]

const KNOWN = new Set(SHADING_PATTERNS.map((pattern) => pattern.value))
/** Word's in-between steps, kept whole in the value's name. */
const HALF_STEPS: Record<string, number> = { pct12: 12.5, pct37: 37.5, pct62: 62.5, pct87: 87.5 }

/** A `shadingPattern` value as its pattern and colour (#rrggbb, or null for Automatic); null for none or Clear. */
export function patternOf(value: unknown): { pattern: string; color: string | null } | null {
  const [pattern, color] = String(value ?? "").split(" ")
  if (!pattern || pattern === "clear" || !KNOWN.has(pattern)) {
    return null
  }
  return { pattern, color: color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null }
}

/** The `shadingPattern` value for a pattern and its colour; null for Clear. */
export function patternValue(pattern: string, color: string | null): string | null {
  return pattern === "clear" || !KNOWN.has(pattern) ? null : color ? `${pattern} ${color.toLowerCase()}` : pattern
}

/** Stripes of the colour across a repeating tile: Dark patterns draw half the tile, Light ones a pixel of it. */
function stripes(direction: string, color: string, thin: boolean, period: number) {
  const line = thin ? 1 : period / 2
  return `repeating-linear-gradient(${direction}, ${color} 0 ${line}px, transparent ${line}px ${period}px)`
}

/**
 * The CSS background-image that draws a pattern over the fill, or null. A percentage is the colour at that share
 * laid over the fill, as the eye blends Word's dots; the others are stripes, grids and trellises.
 */
export function patternImage(value: unknown): string | null {
  const parsed = patternOf(value)
  if (!parsed) {
    return null
  }
  const color = parsed.color ?? "#000000"
  const percent = parsed.pattern === "solid" ? 100 : (HALF_STEPS[parsed.pattern] ?? Number(parsed.pattern.slice(3)))
  if (/^pct\d+$/.test(parsed.pattern) || parsed.pattern === "solid") {
    const tint = `color-mix(in srgb, ${color} ${percent}%, transparent)`
    return `linear-gradient(${tint}, ${tint})`
  }
  const thin = parsed.pattern.startsWith("thin")
  const name = thin ? parsed.pattern.charAt(4).toLowerCase() + parsed.pattern.slice(5) : parsed.pattern
  const across = stripes("to bottom", color, thin, 4)
  const down = stripes("to right", color, thin, 4)
  // Down diagonals run top left to bottom right ("\"), up ones bottom left to top right ("/").
  const fall = stripes("45deg", color, thin, 6)
  const rise = stripes("-45deg", color, thin, 6)
  const images: Record<string, string> = {
    horzStripe: across,
    vertStripe: down,
    reverseDiagStripe: fall,
    diagStripe: rise,
    horzCross: `${across}, ${down}`,
    diagCross: `${fall}, ${rise}`,
  }
  return images[name] ?? null
}
