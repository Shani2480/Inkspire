import type { Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"

/**
 * Word's Find and Replace over the document: each paragraph's whole text is searched (so a match may cross bold or
 * colour changes), with Word's search options (More >>) and its special characters (^t, ^p, ^?…). Matches map back
 * to document positions.
 */

export type TextRange = { from: number; to: number }

/** A match, with the groups a wildcard search captured for \1…\9 in the replacement. */
export type FindMatch = TextRange & { text: string; groups: string[] }

export type FindOptions = {
  matchCase: boolean
  wholeWord: boolean
  wildcards: boolean
  soundsLike: boolean
  wordForms: boolean
  prefix: boolean
  suffix: boolean
  ignorePunctuation: boolean
  ignoreSpace: boolean
}

export const FIND_DEFAULTS: FindOptions = {
  matchCase: false,
  wholeWord: false,
  wildcards: false,
  soundsLike: false,
  wordForms: false,
  prefix: false,
  suffix: false,
  ignorePunctuation: false,
  ignoreSpace: false,
}

/** The characters the text model gives what is not text: a paragraph's end, a tab, a line break, an object. */
const PARAGRAPH = " "
const TAB = "\t"
const LINE = "\u000b"
const OBJECT = "￼"

type TextModel = { text: string; starts: number[]; ends: number[] }

/** The document as one string, every character with its document position (start and end). */
export function textModel(doc: ProseNode): TextModel {
  let text = ""
  const starts: number[] = []
  const ends: number[] = []
  // Where the last paragraph's content ended; null before the first.
  let previousEnd: number | null = null
  doc.descendants((node, pos) => {
    if (!node.isTextblock) {
      return true
    }
    if (previousEnd !== null) {
      // The paragraph mark between the last block and this one: from the end of one to the start of the next.
      text += PARAGRAPH
      starts.push(previousEnd)
      ends.push(pos + 1)
    }
    previousEnd = pos + node.nodeSize - 1
    node.forEach((child, offset) => {
      const at = pos + 1 + offset
      if (child.isText) {
        const value = child.text ?? ""
        for (let index = 0; index < value.length; index += 1) {
          text += value[index]
          starts.push(at + index)
          ends.push(at + index + 1)
        }
        return
      }
      const name = child.type.name
      text += name === "docTab" ? TAB : name === "hardBreak" ? LINE : OBJECT
      starts.push(at)
      ends.push(at + child.nodeSize)
    })
    return false
  })
  return { text, starts, ends }
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")

/** Word's special characters in Find what (More >> > Special). */
const FIND_SPECIALS: Record<string, string> = {
  p: PARAGRAPH,
  t: TAB,
  l: LINE,
  "?": "[^\\u2029]",
  "#": "\\p{Nd}",
  $: "\\p{L}",
  w: "[\\s\\u00a0]+",
  s: "\\u00a0",
  "~": "\\u2011",
  "-": "\\u00ad",
  "=": "\\u2013",
  "+": "\\u2014",
  g: OBJECT,
  "^": "\\^",
}

/** The specials menu: what each code finds, in Word's words. */
export const SPECIAL_CHARACTERS: { code: string; label: string; find: boolean; replace: boolean }[] = [
  { code: "^p", label: "Paragraph Mark", find: true, replace: true },
  { code: "^t", label: "Tab Character", find: true, replace: true },
  { code: "^?", label: "Any Character", find: true, replace: false },
  { code: "^#", label: "Any Digit", find: true, replace: false },
  { code: "^$", label: "Any Letter", find: true, replace: false },
  { code: "^^", label: "Caret Character", find: true, replace: true },
  { code: "^&", label: "Find What Text", find: false, replace: true },
  { code: "^+", label: "Em Dash", find: true, replace: true },
  { code: "^=", label: "En Dash", find: true, replace: true },
  { code: "^g", label: "Graphic", find: true, replace: false },
  { code: "^l", label: "Manual Line Break", find: true, replace: true },
  { code: "^-", label: "Optional Hyphen", find: true, replace: true },
  { code: "^~", label: "Nonbreaking Hyphen", find: true, replace: true },
  { code: "^s", label: "Nonbreaking Space", find: true, replace: true },
  { code: "^w", label: "White Space", find: true, replace: false },
]

const PUNCTUATION = "[\\p{P}\\p{S}]*"
const SPACE = "[\\s\\u00a0]*"

/** One character of Find what, with the ignore options between characters. */
function literalPattern(query: string, options: FindOptions) {
  const parts: string[] = []
  for (let index = 0; index < query.length; index += 1) {
    const char = query[index]!
    if (char === "^" && index + 1 < query.length) {
      const code = query[index + 1]!
      const special = FIND_SPECIALS[code]
      if (special !== undefined) {
        parts.push(special)
        index += 1
        continue
      }
    }
    if (options.ignoreSpace && /\s/.test(char)) {
      continue
    }
    if (options.ignorePunctuation && /[\p{P}\p{S}]/u.test(char)) {
      continue
    }
    parts.push(escapeRegex(char))
  }
  const between = (options.ignorePunctuation ? PUNCTUATION : "") + (options.ignoreSpace ? SPACE : "")
  return between ? parts.join(between) : parts.join("")
}

/**
 * Word's wildcards as a regular expression: ? one character, * any run, [abc] [a-z] [!x] sets, {n} {n,} {n,m} and @
 * repeats, < and > a word's start and end, ( ) groups for \1, and \ before a character to find it.
 */
export function wildcardPattern(query: string) {
  let out = ""
  for (let index = 0; index < query.length; index += 1) {
    const char = query[index]!
    if (char === "\\" && index + 1 < query.length) {
      out += escapeRegex(query[index + 1]!)
      index += 1
    } else if (char === "?") {
      out += "[^\\u2029]"
    } else if (char === "*") {
      out += "[^\\u2029]*?"
    } else if (char === "@") {
      out += "+"
    } else if (char === "<") {
      out += "(?<![\\p{L}\\p{N}_])"
    } else if (char === ">") {
      out += "(?![\\p{L}\\p{N}_])"
    } else if (char === "[") {
      const end = query.indexOf("]", index + 1)
      if (end < 0) {
        out += "\\["
        continue
      }
      const body = query.slice(index + 1, end)
      const negated = body.startsWith("!")
      const set = (negated ? body.slice(1) : body).replace(/[\\\]^]/g, "\\$&")
      out += `[${negated ? "^" : ""}${set}]`
      index = end
    } else if (char === "{") {
      const end = query.indexOf("}", index + 1)
      const body = end > 0 ? query.slice(index + 1, end).replace(/;/g, ",") : ""
      if (/^\d+(,\d*)?$/.test(body)) {
        out += `{${body}}`
        index = end
      } else {
        out += "\\{"
      }
    } else if (char === "(" || char === ")") {
      out += char
    } else if (char === "^" && index + 1 < query.length && FIND_SPECIALS[query[index + 1]!] !== undefined) {
      out += FIND_SPECIALS[query[index + 1]!]
      index += 1
    } else {
      out += escapeRegex(char)
    }
  }
  return out
}

/** Soundex: words that sound alike in English share it ("Smith" and "Smyth"). */
export function soundex(word: string) {
  const letters = word.toUpperCase().replace(/[^A-Z]/g, "")
  if (!letters) {
    return ""
  }
  const codes: Record<string, string> = {
    B: "1",
    F: "1",
    P: "1",
    V: "1",
    C: "2",
    G: "2",
    J: "2",
    K: "2",
    Q: "2",
    S: "2",
    X: "2",
    Z: "2",
    D: "3",
    T: "3",
    L: "4",
    M: "5",
    N: "5",
    R: "6",
  }
  let out = letters[0]!
  let last = codes[letters[0]!] ?? ""
  for (const letter of letters.slice(1)) {
    const code = codes[letter] ?? ""
    if (code && code !== last) {
      out += code
    }
    if (letter !== "H" && letter !== "W") {
      last = code
    }
  }
  return (out + "000").slice(0, 4)
}

const IRREGULAR: string[][] = [
  ["be", "is", "am", "are", "was", "were", "been", "being"],
  ["have", "has", "had", "having"],
  ["do", "does", "did", "done", "doing"],
  ["go", "goes", "went", "gone", "going"],
  ["make", "makes", "made", "making"],
  ["take", "takes", "took", "taken", "taking"],
  ["write", "writes", "wrote", "written", "writing"],
  ["see", "sees", "saw", "seen", "seeing"],
  ["give", "gives", "gave", "given", "giving"],
  ["get", "gets", "got", "gotten", "getting"],
  ["run", "runs", "ran", "running"],
  ["buy", "buys", "bought", "buying"],
  ["think", "thinks", "thought", "thinking"],
  ["child", "children"],
  ["man", "men"],
  ["woman", "women"],
  ["person", "people"],
  ["good", "better", "best"],
]

/** The forms of an English word that Find all word forms looks for: its plural, past and -ing forms. */
export function wordForms(word: string) {
  const lower = word.toLowerCase()
  const irregular = IRREGULAR.find((forms) => forms.includes(lower))
  if (irregular) {
    return irregular
  }
  let stem = lower
  for (const [ending, base] of [
    ["ies", "y"],
    ["ied", "y"],
    ["ing", ""],
    ["ed", ""],
    ["es", ""],
    ["s", ""],
  ] as const) {
    if (lower.length > ending.length + 2 && lower.endsWith(ending)) {
      stem = lower.slice(0, -ending.length) + base
      break
    }
  }
  const forms = new Set([lower, stem])
  const consonantY = /[^aeiou]y$/.test(stem)
  const silentE = stem.endsWith("e")
  const base = consonantY ? stem.slice(0, -1) : stem
  forms.add(consonantY ? `${base}ies` : /(s|x|z|ch|sh)$/.test(stem) ? `${stem}es` : `${stem}s`)
  forms.add(consonantY ? `${base}ied` : silentE ? `${stem}d` : `${stem}ed`)
  forms.add(silentE ? `${stem.slice(0, -1)}ing` : `${stem}ing`)
  if (/[^aeiou][aeiou][bdgmnprt]$/.test(stem)) {
    const last = stem.slice(-1)
    forms.add(`${stem}${last}ed`)
    forms.add(`${stem}${last}ing`)
  }
  return [...forms]
}

const WORD_BEFORE = "(?<![\\p{L}\\p{N}_])"
const WORD_AFTER = "(?![\\p{L}\\p{N}_])"

/** The regular expression Find what and the options make, and a test each match must also pass. */
export function findPattern(
  query: string,
  options: FindOptions,
): { regex: RegExp; accept?: (text: string) => boolean } | null {
  if (!query) {
    return null
  }
  if (options.wildcards) {
    try {
      // Word's wildcard searches always match case.
      return { regex: new RegExp(wildcardPattern(query), "gu") }
    } catch {
      return null
    }
  }
  if (options.soundsLike) {
    const code = soundex(query)
    return code ? { regex: /[\p{L}']+/gu, accept: (text) => soundex(text) === code } : null
  }
  let source: string
  if (options.wordForms && /^[\p{L}']+$/u.test(query.trim())) {
    source = `(?:${wordForms(query.trim()).map(escapeRegex).join("|")})`
    source = WORD_BEFORE + source + WORD_AFTER
  } else {
    source = literalPattern(query, options)
    if (!source) {
      return null
    }
    if (options.wholeWord || options.prefix) {
      source = WORD_BEFORE + source
    }
    if (options.wholeWord || options.suffix) {
      source += WORD_AFTER
    }
  }
  const matchCase = options.matchCase && !options.wordForms
  try {
    return { regex: new RegExp(source, matchCase ? "gu" : "giu") }
  } catch {
    return null
  }
}

/** Every match of `query` in the document, in order. `options` true or false is the old Match case flag. */
export function findMatches(doc: ProseNode, query: string, options: Partial<FindOptions> | boolean = {}): FindMatch[] {
  const resolved: FindOptions =
    typeof options === "boolean" ? { ...FIND_DEFAULTS, matchCase: options } : { ...FIND_DEFAULTS, ...options }
  const pattern = findPattern(query, resolved)
  if (!pattern) {
    return []
  }
  const model = textModel(doc)
  const matches: FindMatch[] = []
  for (const match of model.text.matchAll(pattern.regex)) {
    const text = match[0]
    if (!text || (pattern.accept && !pattern.accept(text))) {
      continue
    }
    const start = match.index ?? 0
    const end = start + text.length - 1
    matches.push({
      from: model.starts[start]!,
      to: model.ends[end]!,
      text,
      groups: match.slice(1).map((group) => group ?? ""),
    })
  }
  return matches
}

export function findTextRanges(editor: Editor, query: string, options: Partial<FindOptions> | boolean = {}) {
  return findMatches(editor.state.doc, query, options)
}

type ReplacePiece = { kind: "text"; text: string } | { kind: "tab" } | { kind: "line" } | { kind: "paragraph" }

/** Replace with, with Word's codes: ^p ^t ^l ^& ^^ and the dashes and spaces, and \1…\9 after a wildcard search. */
export function replacementPieces(replacement: string, match: Pick<FindMatch, "text" | "groups">, wildcards: boolean) {
  const pieces: ReplacePiece[] = []
  let text = ""
  const flush = () => {
    if (text) {
      pieces.push({ kind: "text", text })
      text = ""
    }
  }
  const plain: Record<string, string> = { "^": "^", "+": "—", "=": "–", s: " ", "~": "‑", "-": "­" }
  for (let index = 0; index < replacement.length; index += 1) {
    const char = replacement[index]!
    const next = replacement[index + 1]
    if (char === "^" && next !== undefined) {
      if (next === "p" || next === "t" || next === "l") {
        flush()
        pieces.push({ kind: next === "p" ? "paragraph" : next === "t" ? "tab" : "line" })
        index += 1
        continue
      }
      if (next === "&") {
        text += match.text
        index += 1
        continue
      }
      if (plain[next] !== undefined) {
        text += plain[next]
        index += 1
        continue
      }
    }
    if (wildcards && char === "\\" && next !== undefined && /[1-9]/.test(next)) {
      text += match.groups[Number(next) - 1] ?? ""
      index += 1
      continue
    }
    text += char
  }
  flush()
  return pieces
}

/** Replaces each match (last first, so earlier positions stay right), keeping the formatting where it starts. */
export function replaceTextRanges(
  editor: Editor,
  ranges: (TextRange & Partial<Pick<FindMatch, "text" | "groups">>)[],
  replacement: string,
  wildcards = false,
) {
  if (ranges.length === 0) {
    return false
  }
  const { schema } = editor.state
  const tr = editor.state.tr
  for (const range of [...ranges].sort((left, right) => right.from - left.from)) {
    const marks = tr.doc.resolve(Math.min(range.from + 1, range.to)).marks()
    const text = range.text ?? tr.doc.textBetween(range.from, range.to, "\n")
    const pieces = replacementPieces(replacement, { text, groups: range.groups ?? [] }, wildcards)
    tr.delete(range.from, range.to)
    let at = range.from
    for (const piece of pieces) {
      if (piece.kind === "text") {
        tr.insert(at, schema.text(piece.text, marks))
        at += piece.text.length
      } else if (piece.kind === "paragraph") {
        tr.split(at)
        at += 2
      } else {
        const type = piece.kind === "tab" ? schema.nodes.docTab : schema.nodes.hardBreak
        if (type) {
          tr.insert(at, type.create())
          at += 1
        } else {
          tr.insert(at, schema.text(piece.kind === "tab" ? "\t" : "\n", marks))
          at += 1
        }
      }
    }
  }
  editor.view.dispatch(tr)
  return true
}
