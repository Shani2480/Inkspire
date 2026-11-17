/**
 * How footnotes and endnotes are placed and numbered, as Word keeps it in w:footnotePr / w:endnotePr (in settings,
 * and in a section's w:sectPr): position, number format, the number to start at and when numbering restarts.
 * Shared by the .docx converter and the editor, so it holds no editor code.
 */

/** Where a Word note's own number goes in its text, swapped for the number the editor labels the note with. */
export const NOTE_MARK = "\uE000"

export type NoteKind = "footnote" | "endnote"
export type NotePosition = "pageBottom" | "beneathText" | "sectEnd" | "docEnd"
export type NoteRestart = "continuous" | "eachSect" | "eachPage"

export type NoteProps = {
  pos?: NotePosition
  numFmt?: string
  numStart?: number
  numRestart?: NoteRestart
}

export type NoteSettings = Record<NoteKind, Required<NoteProps>>

/** Word's defaults: footnotes 1, 2, 3 at the page bottom; endnotes i, ii, iii at the end of the document. */
export const NOTE_DEFAULTS: NoteSettings = {
  footnote: { pos: "pageBottom", numFmt: "decimal", numStart: 1, numRestart: "continuous" },
  endnote: { pos: "docEnd", numFmt: "lowerRoman", numStart: 1, numRestart: "continuous" },
}

export const NOTE_POSITIONS: Record<NoteKind, { value: NotePosition; label: string }[]> = {
  footnote: [
    { value: "pageBottom", label: "Bottom of page" },
    { value: "beneathText", label: "Below text" },
  ],
  endnote: [
    { value: "docEnd", label: "End of document" },
    { value: "sectEnd", label: "End of section" },
  ],
}

export const NOTE_FORMATS: { value: string; label: string }[] = [
  { value: "decimal", label: "1, 2, 3, …" },
  { value: "lowerLetter", label: "a, b, c, …" },
  { value: "upperLetter", label: "A, B, C, …" },
  { value: "lowerRoman", label: "i, ii, iii, …" },
  { value: "upperRoman", label: "I, II, III, …" },
  { value: "chicago", label: "*, †, ‡, §, …" },
]

export const NOTE_RESTARTS: { value: NoteRestart; label: string }[] = [
  { value: "continuous", label: "Continuous" },
  { value: "eachSect", label: "Restart each section" },
  { value: "eachPage", label: "Restart each page" },
]

const POSITIONS = new Set<string>(["pageBottom", "beneathText", "sectEnd", "docEnd"])
const RESTARTS = new Set<string>(["continuous", "eachSect", "eachPage"])

/** A note kind's settings with Word's defaults for what is not set; a section's own override the document's. */
export function noteSettingsOf(kind: NoteKind, ...layers: (NoteProps | undefined)[]): Required<NoteProps> {
  const out = { ...NOTE_DEFAULTS[kind] }
  for (const layer of layers) {
    if (!layer) {
      continue
    }
    if (layer.pos && POSITIONS.has(layer.pos)) {
      out.pos = layer.pos
    }
    if (layer.numFmt) {
      out.numFmt = layer.numFmt
    }
    if (layer.numStart !== undefined && layer.numStart >= 1) {
      out.numStart = layer.numStart
    }
    if (layer.numRestart && RESTARTS.has(layer.numRestart)) {
      out.numRestart = layer.numRestart
    }
  }
  return out
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
  let rest = Math.max(1, Math.floor(value))
  let out = ""
  for (const [amount, numeral] of numerals) {
    while (rest >= amount) {
      out += numeral
      rest -= amount
    }
  }
  return out
}

const CHICAGO = ["*", "†", "‡", "§"]

/** A note number in Word's format: a, b … z, aa, bb (Word repeats the letter); *, †, ‡, §, **, ††… */
export function formatNoteNumber(value: number, numFmt: string) {
  const n = Math.max(1, Math.floor(value))
  switch (numFmt) {
    case "lowerLetter":
    case "upperLetter": {
      const letter = String.fromCharCode(97 + ((n - 1) % 26)).repeat(Math.floor((n - 1) / 26) + 1)
      return numFmt === "upperLetter" ? letter.toUpperCase() : letter
    }
    case "lowerRoman":
      return roman(n)
    case "upperRoman":
      return roman(n).toUpperCase()
    case "chicago":
      return CHICAGO[(n - 1) % 4]!.repeat(Math.floor((n - 1) / 4) + 1)
    default:
      return String(n)
  }
}

/** Where numbering starts again for a note, given what changed since the last note of its kind. */
export function restartsAt(restart: NoteRestart, newSection: boolean, newPage: boolean) {
  return (restart === "eachSect" && newSection) || (restart === "eachPage" && newPage)
}
