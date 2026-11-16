/**
 * Word's underline types (w:u w:val), in the order the Font dialog lists them, with the editor's id for each and how
 * CSS draws it. The editor's ids for the five it had before stay as they were (solid, double, dotted, dashed, wavy),
 * so documents and settings from earlier versions read the same; the others use Word's own value.
 *
 * Word spells two heavy ones its own way (dashDotHeavy, dashDotDotHeavy; ECMA-376 ST_Underline).
 * CSS has no dot-dash, long dash or double wave: those draw as the nearest line (dashed, wavy) and save as what
 * they are. Heavy lines draw thicker. Words only draws under the words and not the spaces (a decoration per word).
 */

export type UnderlineKind = {
  id: string
  word: string
  label: string
  css: "solid" | "double" | "dotted" | "dashed" | "wavy"
  heavy?: boolean
}

export const UNDERLINE_KINDS: UnderlineKind[] = [
  { id: "solid", word: "single", label: "Single", css: "solid" },
  { id: "words", word: "words", label: "Words only", css: "solid" },
  { id: "double", word: "double", label: "Double", css: "double" },
  { id: "thick", word: "thick", label: "Thick", css: "solid", heavy: true },
  { id: "dotted", word: "dotted", label: "Dotted", css: "dotted" },
  { id: "dottedHeavy", word: "dottedHeavy", label: "Dotted heavy", css: "dotted", heavy: true },
  { id: "dashed", word: "dash", label: "Dash", css: "dashed" },
  { id: "dashedHeavy", word: "dashedHeavy", label: "Dash heavy", css: "dashed", heavy: true },
  { id: "dashLong", word: "dashLong", label: "Long dash", css: "dashed" },
  { id: "dashLongHeavy", word: "dashLongHeavy", label: "Long dash heavy", css: "dashed", heavy: true },
  { id: "dotDash", word: "dotDash", label: "Dot dash", css: "dashed" },
  { id: "dotDashHeavy", word: "dashDotHeavy", label: "Dot dash heavy", css: "dashed", heavy: true },
  { id: "dotDotDash", word: "dotDotDash", label: "Dot dot dash", css: "dashed" },
  { id: "dotDotDashHeavy", word: "dashDotDotHeavy", label: "Dot dot dash heavy", css: "dashed", heavy: true },
  { id: "wavy", word: "wave", label: "Wave", css: "wavy" },
  { id: "wavyHeavy", word: "wavyHeavy", label: "Wave heavy", css: "wavy", heavy: true },
  { id: "wavyDouble", word: "wavyDouble", label: "Wave double", css: "wavy" },
]

/** The Home tab's Underline menu, as Word's: the common lines, each drawn as it looks. */
export const RIBBON_UNDERLINES: { id: string; label: string }[] = [
  { id: "solid", label: "Underline" },
  { id: "double", label: "Double underline" },
  { id: "thick", label: "Thick underline" },
  { id: "dotted", label: "Dotted underline" },
  { id: "dashed", label: "Dashed underline" },
  { id: "dotDash", label: "Dot-dash underline" },
  { id: "dotDotDash", label: "Dot-dot-dash underline" },
  { id: "wavy", label: "Wave underline" },
]

export function underlineKind(id: string | null | undefined) {
  return UNDERLINE_KINDS.find((kind) => kind.id === id) ?? UNDERLINE_KINDS[0]!
}

/** The editor's id for Word's value (single for anything unknown). */
export function underlineIdOfWord(value: string) {
  return UNDERLINE_KINDS.find((kind) => kind.word === value)?.id ?? "solid"
}

export function wordUnderlineOf(id: string | null | undefined) {
  return underlineKind(id).word
}

/** CSS declarations that draw an underline of this kind (and colour). */
export function underlineCss(id: string | null | undefined, color?: string | null) {
  const kind = underlineKind(id)
  const rules = [kind.id === "words" ? "text-decoration-line: none" : "text-decoration-line: underline"]
  if (kind.css !== "solid") {
    rules.push(`text-decoration-style: ${kind.css}`)
  }
  if (kind.heavy) {
    rules.push("text-decoration-thickness: max(2px, 0.1em)")
  }
  if (color) {
    rules.push(`text-decoration-color: ${color}`)
  }
  return rules.join("; ")
}

/** A colour as Word writes it (RRGGBB), from the CSS the editor keeps (#rgb, #rrggbb or rgb()). */
export function wordColorOf(color: string | null | undefined) {
  if (!color) {
    return undefined
  }
  const value = color.trim()
  const hex = /^#?([0-9a-f]{6})$/i.exec(value)?.[1] ?? /^#([0-9a-f]{3})$/i.exec(value)?.[1]?.replace(/./g, "$&$&")
  if (hex) {
    return hex.toUpperCase()
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(value)
  if (rgb) {
    return rgb
      .slice(1, 4)
      .map((part) => Math.min(255, Number(part)).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  }
  return undefined
}
