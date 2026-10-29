/**
 * Word's list markers. A list opened from Word carries each level's definition (`data-word-levels`): the marker text
 * with `%1`…`%9` for the levels' numbers, the number format, where numbering starts, the hanging indent the marker
 * sits in, and the bullet's font. The editor numbers the items itself from these, as Word does, so a marker follows
 * edits: an item added, removed or moved to another level.
 */
export type WordLevel = {
  text: string
  format: string
  start: number
  /** The hanging indent in pt: the marker starts this far left of the text. */
  hang: number
  font?: string
}

export function parseWordLevels(value: unknown): WordLevel[] {
  if (typeof value !== "string" || !value) {
    return []
  }
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.map((item) => {
      const level = (item ?? {}) as Partial<WordLevel>
      return {
        text: typeof level.text === "string" ? level.text : "",
        format: typeof level.format === "string" ? level.format : "decimal",
        start: Number.isInteger(level.start) ? level.start! : 1,
        hang: Number.isFinite(level.hang) ? Math.max(0, level.hang!) : 18,
        ...(typeof level.font === "string" && level.font ? { font: level.font } : {}),
      }
    })
  } catch {
    return []
  }
}

/** Word's symbol fonts put their bullets in the private use area; these are the ones Word's bullet library uses. */
const SYMBOL_BULLETS: Record<string, string> = {
  "": "•",
  "": "▪",
  "": "➢",
  "": "✓",
  "": "❖",
  "": "■",
  "": "❑",
  "": "◻",
  "": "➔",
  "": "○",
  "": "✗",
}

const SYMBOL_FONTS = /^(symbol|wingdings( \d)?|webdings)$/i

/**
 * A bullet as it can be drawn without Word's symbol fonts: its Unicode look, and the font to draw it in (none when
 * the character was mapped). Symbol's middle dot (U+00B7) is its bullet too.
 */
export function bulletGlyph(text: string, font?: string): { text: string; font?: string } {
  const mapped = SYMBOL_BULLETS[text]
  if (mapped) {
    return { text: mapped }
  }
  if (font && SYMBOL_FONTS.test(font)) {
    if (text === "·" && /^symbol$/i.test(font)) {
      return { text: "•" }
    }
    // Another symbol: the font's own character, drawn in it where it is installed.
    const code = text.codePointAt(0) ?? 0
    return { text: code >= 0xf000 && code <= 0xf0ff ? String.fromCodePoint(code - 0xf000) : text, font }
  }
  return font ? { text, font } : { text }
}

function letters(value: number, upper: boolean) {
  // Word's letters repeat past z: aa, bb, …
  const count = Math.ceil(value / 26)
  const letter = String.fromCharCode(97 + ((value - 1) % 26))
  const text = letter.repeat(Math.max(1, count))
  return upper ? text.toUpperCase() : text
}

function roman(value: number) {
  const numerals: [number, string][] = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ]
  let rest = value
  let text = ""
  for (const [amount, numeral] of numerals) {
    while (rest >= amount) {
      text += numeral
      rest -= amount
    }
  }
  return text
}

/** A level's number in its Word format. */
export function formatNumber(value: number, format: string) {
  if (value <= 0 && format !== "decimal" && format !== "decimalZero") {
    return String(value)
  }
  switch (format) {
    case "lowerLetter":
      return letters(value, false)
    case "upperLetter":
      return letters(value, true)
    case "lowerRoman":
      return roman(value)
    case "upperRoman":
      return roman(value).toUpperCase()
    case "decimalZero":
      return value < 10 ? `0${value}` : String(value)
    case "ordinal":
      return `${value}${ordinalSuffix(value)}`
    case "numberInDash":
      return `- ${value} -`
    case "none":
      return ""
    default:
      return String(value)
  }
}

function ordinalSuffix(value: number) {
  const tens = value % 100
  if (tens >= 11 && tens <= 13) {
    return "th"
  }
  return value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th"
}

/**
 * Numbers a Word list's items in order: each item's marker from its level and the counts so far. A level's count
 * starts again after an item of a level above it, as Word's do by default.
 */
export class WordNumbering {
  private counts: (number | undefined)[] = []

  constructor(
    private readonly levels: WordLevel[],
    /** Where level 0 starts, when the list continues one before it (its `start`). */
    private readonly firstStart?: number,
  ) {}

  /** The level's definition (the last one given for a level past them). */
  level(index: number): WordLevel | undefined {
    return this.levels[Math.min(index, this.levels.length - 1)]
  }

  /** The next item's marker at `index`, and the level it was drawn from. */
  next(index: number): { text: string; font?: string; level: WordLevel } | null {
    const level = this.level(index)
    if (!level) {
      return null
    }
    const start = (at: number) =>
      at === 0 && this.firstStart !== undefined ? this.firstStart : (this.level(at)?.start ?? 1)
    this.counts[index] = (this.counts[index] ?? start(index) - 1) + 1
    this.counts.length = index + 1
    if (level.format === "bullet") {
      return { ...bulletGlyph(level.text, level.font), level }
    }
    const text = level.text.replace(/%([1-9])/g, (_, digit: string) => {
      const at = Number(digit) - 1
      const value = this.counts[at] ?? start(at)
      return formatNumber(value, this.level(at)?.format ?? "decimal")
    })
    return { text, ...(level.font && !SYMBOL_FONTS.test(level.font) ? { font: level.font } : {}), level }
  }
}

/** A CSS string for `content`. */
export function cssString(text: string) {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\a ")}"`
}
