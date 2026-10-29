/**
 * Word's list markers. A list opened from Word carries each level's definition (`data-word-levels`): the marker text
 * with `%1`…`%9` for the levels' numbers, the number format, where numbering starts, the hanging indent the marker
 * sits in, how it is aligned and what follows it, and its own font, size, colour and weight. The editor numbers the
 * items itself from these, as Word does, so a marker follows edits: an item added, removed or moved to another level.
 */
export type WordLevel = {
  text: string
  format: string
  start: number
  /** The hanging indent in pt: the marker starts this far left of the text. */
  hang: number
  font?: string
  /** w:lvlJc: the marker is centred on, or ends at, the first line's start instead of starting there. */
  justify?: "center" | "right"
  /** w:suff: a space or nothing after the marker instead of a tab. */
  suffix?: "space" | "nothing"
  /** w:isLgl: every number in the text is a decimal. */
  legal?: boolean
  /** w:lvlRestart: the level (1-based) after which this one counts again; 0 never. */
  restart?: number
  /** The marker's own run formatting: size in pt, colour, bold, italic. */
  size?: number
  color?: string
  bold?: boolean
  italic?: boolean
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
        ...(level.justify === "center" || level.justify === "right" ? { justify: level.justify } : {}),
        ...(level.suffix === "space" || level.suffix === "nothing" ? { suffix: level.suffix } : {}),
        ...(level.legal === true ? { legal: true } : {}),
        ...(Number.isInteger(level.restart) && level.restart! >= 0 ? { restart: level.restart } : {}),
        ...(Number.isFinite(level.size) && level.size! > 0 ? { size: level.size } : {}),
        ...(typeof level.color === "string" && /^#[0-9a-f]{6}$/i.test(level.color) ? { color: level.color } : {}),
        ...(typeof level.bold === "boolean" ? { bold: level.bold } : {}),
        ...(typeof level.italic === "boolean" ? { italic: level.italic } : {}),
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
    /** The document's default tab stops in pt, where text after a marker too wide for its indent goes. */
    readonly tab = 36,
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
    // A level below counts again after this one, unless its w:lvlRestart names a level above this one, or 0.
    for (let below = index + 1; below < this.counts.length; below += 1) {
      const restart = this.level(below)?.restart
      if (restart === undefined || (restart > 0 && index < restart)) {
        this.counts[below] = undefined
      }
    }
    if (level.format === "bullet") {
      return { ...bulletGlyph(level.text, level.font), level }
    }
    const text = level.text.replace(/%([1-9])/g, (_, digit: string) => {
      const at = Number(digit) - 1
      const value = this.counts[at] ?? start(at)
      return formatNumber(value, level.legal ? "decimal" : (this.level(at)?.format ?? "decimal"))
    })
    return { text, ...(level.font && !SYMBOL_FONTS.test(level.font) ? { font: level.font } : {}), level }
  }
}

/** A CSS string for `content`. */
export function cssString(text: string) {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\a ")}"`
}

/**
 * The HTML written out of the editor (an .html export, and the PDF, ODT and RTF made from it) with each Word list
 * item's marker as its `list-style-type` string, since the editor draws them as decorations, which the HTML has not.
 */
export function withWordMarkers(html: string) {
  if (!html.includes("data-word-levels") || typeof DOMParser === "undefined") {
    return html
  }
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body
  const lists = [...body.querySelectorAll<HTMLElement>("ul[data-word-levels], ol[data-word-levels]")].filter(
    (list) => !list.parentElement?.closest("[data-word-levels]"),
  )
  for (const list of lists) {
    const levels = parseWordLevels(list.getAttribute("data-word-levels"))
    if (levels.length === 0 || list.hasAttribute("data-marker")) {
      continue
    }
    const start = Number(list.getAttribute("start"))
    const numbering = new WordNumbering(levels, list.tagName === "OL" && start > 0 ? start : undefined)
    const walk = (parent: HTMLElement, depth: number) => {
      for (const item of [...parent.children]) {
        if (!(item instanceof HTMLElement) || item.tagName !== "LI") {
          continue
        }
        const drawn = numbering.next(depth + (Number(item.getAttribute("data-indent")) || 0))
        if (drawn) {
          item.style.listStyleType = cssString(`${drawn.text}${drawn.level.suffix === "nothing" ? "" : " "}`)
        }
        for (const nested of item.querySelectorAll<HTMLElement>(":scope > ul, :scope > ol")) {
          walk(nested, depth + 1)
        }
      }
    }
    walk(list, 0)
  }
  return body.innerHTML
}
