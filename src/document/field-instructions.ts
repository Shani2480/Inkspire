/**
 * Word field instructions shared by the editor and the .docx converter: parsing (`SEQ Figure \* ARABIC`), the
 * fields the editor keeps as its own (captions and cross-references), number formats and bookmark names.
 */

export const FIELD_KINDS = ["SEQ", "REF", "PAGEREF", "XE"] as const

/**
 * Switches that take a value, by field: \* format, \@ date picture and \# number picture everywhere; SEQ's \r reset
 * and \s heading level; XE's \t cross-reference text, \r page-range bookmark and \f entry type; INDEX's separators,
 * columns (\c), bookmark (\b), heading (\h), letter range (\p), entry type (\f) and language (\z).
 */
const VALUE_SWITCHES: Record<string, string[]> = {
  SEQ: ["r", "s"],
  XE: ["t", "r", "f"],
  INDEX: ["b", "c", "d", "e", "f", "g", "h", "k", "l", "p", "s", "z"],
}

export type FieldInstruction = { kind: string; argument: string; switches: Map<string, string> }

/** Splits an instruction into its kind, first argument and switches (`\* ARABIC`, `\r 3`, `\h`). */
export function parseInstruction(instr: string): FieldInstruction {
  const tokens = [...instr.trim().matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2] ?? "")
  const kind = (tokens.shift() ?? "").toUpperCase()
  const valued = ["*", "@", "#", ...(VALUE_SWITCHES[kind] ?? [])]
  let argument = ""
  const switches = new Map<string, string>()
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!
    if (token.startsWith("\\")) {
      const name = token.slice(1)
      const value = tokens[index + 1]
      if (valued.includes(name) && value !== undefined && !value.startsWith("\\")) {
        switches.set(name, value)
        index += 1
      } else {
        switches.set(name, "")
      }
    } else if (!argument) {
      argument = token
    }
  }
  return { kind, argument, switches }
}

export function isAppField(instr: string) {
  return (FIELD_KINDS as readonly string[]).includes(parseInstruction(instr).kind)
}

/** A number in a SEQ field's format: 1, A, a, I, i. */
export function formatSequence(value: number, format = "ARABIC") {
  switch (format) {
    case "ALPHABETIC":
      return letters(value).toUpperCase()
    case "alphabetic":
      return letters(value)
    case "ROMAN":
      return roman(value).toUpperCase()
    case "roman":
      return roman(value)
    default:
      return String(value)
  }
}

function letters(value: number) {
  // Word's A…Z, AA…ZZ, AAA…: the letter repeated.
  if (value < 1) {
    return ""
  }
  const letter = String.fromCharCode(97 + ((value - 1) % 26))
  return letter.repeat(Math.floor((value - 1) / 26) + 1)
}

function roman(value: number) {
  if (value < 1 || value > 3999) {
    return String(value)
  }
  const table: [number, string][] = [
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
  let out = ""
  let rest = value
  for (const [amount, text] of table) {
    while (rest >= amount) {
      out += text
      rest -= amount
    }
  }
  return out
}

/** The Word bookmark name for a name the editor allows: letters, digits and _ only, 40 at most, a letter first. */
export function wordBookmarkName(name: string) {
  const clean = name.replace(/[^\p{L}\p{N}_]/gu, "_").slice(0, 40)
  return /^[\p{L}_]/u.test(clean) ? clean : `B${clean}`.slice(0, 40)
}
