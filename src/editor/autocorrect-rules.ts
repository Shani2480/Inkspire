/**
 * Word's AutoCorrect and AutoFormat As You Type, as pure rules over the text before the caret. The editor plugin
 * (`autocorrect.ts`) calls them as a word ends and applies what they return as its own undo step, so Ctrl+Z right
 * after a correction brings back what was typed, as in Word.
 */

export type AutoCorrectOptions = {
  /** AutoCorrect tab. */
  twoInitialCaps: boolean
  capsSentence: boolean
  capsTableCells: boolean
  capsDays: boolean
  replaceText: boolean
  /** AutoFormat As You Type tab. */
  smartQuotes: boolean
  ordinals: boolean
  dashes: boolean
  autoLinks: boolean
  autoBullets: boolean
  autoNumbers: boolean
}

export const AUTOCORRECT_DEFAULTS: AutoCorrectOptions = {
  twoInitialCaps: true,
  capsSentence: true,
  capsTableCells: true,
  capsDays: true,
  replaceText: true,
  smartQuotes: true,
  ordinals: true,
  dashes: true,
  autoLinks: true,
  autoBullets: true,
  autoNumbers: true,
}

/** Word's built-in Replace text as you type entries (a selection of its list): symbols, then common slips. */
export const BUILT_IN_REPLACEMENTS: [string, string][] = [
  ["(c)", "©"],
  ["(r)", "®"],
  ["(tm)", "™"],
  ["(e)", "€"],
  ["...", "…"],
  [":)", "☺"],
  [":-)", "☺"],
  [":(", "☹"],
  [":-(", "☹"],
  ["-->", "→"],
  ["<--", "←"],
  ["==>", "⇒"],
  ["<==", "⇐"],
  ["<=>", "⇔"],
  ["abbout", "about"],
  ["abotu", "about"],
  ["abouta", "about a"],
  ["accomodate", "accommodate"],
  ["acheive", "achieve"],
  ["acn", "can"],
  ["adn", "and"],
  ["agian", "again"],
  ["alot", "a lot"],
  ["alwasy", "always"],
  ["andthe", "and the"],
  ["apparant", "apparent"],
  ["aren;t", "aren't"],
  ["arguement", "argument"],
  ["becasue", "because"],
  ["becuase", "because"],
  ["beggining", "beginning"],
  ["beleive", "believe"],
  ["bizzare", "bizarre"],
  ["can;t", "can't"],
  ["comming", "coming"],
  ["commitee", "committee"],
  ["completly", "completely"],
  ["could;nt", "couldn't"],
  ["couldnt", "couldn't"],
  ["definately", "definitely"],
  ["didnt", "didn't"],
  ["doesnt", "doesn't"],
  ["dont", "don't"],
  ["embarass", "embarrass"],
  ["enviroment", "environment"],
  ["existance", "existence"],
  ["finaly", "finally"],
  ["foriegn", "foreign"],
  ["freind", "friend"],
  ["goverment", "government"],
  ["hadnt", "hadn't"],
  ["hasnt", "hasn't"],
  ["havent", "haven't"],
  ["hte", "the"],
  ["i", "I"],
  ["i'm", "I'm"],
  ["i've", "I've"],
  ["i'll", "I'll"],
  ["i'd", "I'd"],
  ["immediatly", "immediately"],
  ["independant", "independent"],
  ["isnt", "isn't"],
  ["knowlege", "knowledge"],
  ["libary", "library"],
  ["mispell", "misspell"],
  ["neccessary", "necessary"],
  ["necesary", "necessary"],
  ["noticable", "noticeable"],
  ["occassion", "occasion"],
  ["occured", "occurred"],
  ["occurence", "occurrence"],
  ["ofthe", "of the"],
  ["peice", "piece"],
  ["posession", "possession"],
  ["prefered", "preferred"],
  ["publically", "publicly"],
  ["realy", "really"],
  ["recieve", "receive"],
  ["recomend", "recommend"],
  ["refered", "referred"],
  ["seperate", "separate"],
  ["shouldnt", "shouldn't"],
  ["sucess", "success"],
  ["suprise", "surprise"],
  ["taht", "that"],
  ["teh", "the"],
  ["thier", "their"],
  ["threshhold", "threshold"],
  ["tomorow", "tomorrow"],
  ["tommorow", "tomorrow"],
  ["tounge", "tongue"],
  ["truely", "truly"],
  ["untill", "until"],
  ["wasnt", "wasn't"],
  ["wich", "which"],
  ["wierd", "weird"],
  ["wont", "won't"],
  ["wouldnt", "wouldn't"],
  ["yeild", "yield"],
]

/** Word's First Letter exceptions: a sentence does not start after these abbreviations. */
const SENTENCE_EXCEPTIONS = new Set(
  [
    "a",
    "abbr",
    "abr",
    "acct",
    "addn",
    "adj",
    "adv",
    "al",
    "apr",
    "approx",
    "apt",
    "assn",
    "aug",
    "av",
    "ave",
    "bldg",
    "cf",
    "ch",
    "co",
    "corp",
    "dec",
    "dept",
    "dr",
    "e.g",
    "ed",
    "eds",
    "eg",
    "est",
    "etc",
    "ex",
    "feb",
    "fig",
    "figs",
    "fri",
    "gen",
    "govt",
    "i.e",
    "ie",
    "inc",
    "incl",
    "jan",
    "jr",
    "jul",
    "jun",
    "lt",
    "ltd",
    "mar",
    "max",
    "min",
    "misc",
    "mon",
    "mr",
    "mrs",
    "ms",
    "mt",
    "no",
    "nos",
    "nov",
    "oct",
    "p",
    "pp",
    "pg",
    "prof",
    "rd",
    "rev",
    "sat",
    "sep",
    "sept",
    "sgt",
    "sr",
    "st",
    "sun",
    "thu",
    "thurs",
    "tue",
    "tues",
    "vol",
    "vols",
    "vs",
    "wed",
  ].map((word) => word.toLowerCase()),
)

/** Words of two capitals Word leaves alone (its INitial CAps exceptions). */
const TWO_CAPS_EXCEPTIONS = new Set(["IDs", "PCs", "CDs", "DVDs", "URLs", "APIs", "OSes", "TVs", "CEOs", "PDFs"])

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

/** The characters that end a word and set AutoCorrect off. */
export const WORD_END = /^[\s.,;:!?)\]}"'”’]$/

/** One change to the text before the caret: `from`/`to` are offsets into that text. */
export type Correction = { from: number; to: number; text: string; superscript?: boolean }

const isUpper = (text: string) => text === text.toUpperCase() && text !== text.toLowerCase()
const isLower = (text: string) => text === text.toLowerCase() && text !== text.toUpperCase()

/** A replacement written in the case the entry was typed in: "Teh" → "The", "TEH" → "THE". */
function inCaseOf(typed: string, replacement: string) {
  if (typed.length > 1 && isUpper(typed)) {
    return replacement.toUpperCase()
  }
  if (isUpper(typed[0] ?? "") && !isUpper(replacement[0] ?? "")) {
    return (replacement[0] ?? "").toUpperCase() + replacement.slice(1)
  }
  return replacement
}

/** The opening or closing curly quote for a straight one typed after `before`. */
export function smartQuote(before: string, quote: "'" | '"') {
  const previous = before.slice(-1)
  const opening = previous === "" || /[\s([{—–“‘/-]/.test(previous)
  if (quote === '"') {
    return opening ? "“" : "”"
  }
  return opening ? "‘" : "’"
}

/** Straight apostrophes in a replacement, curly as the smart quotes option would type them. */
export function curlApostrophes(text: string) {
  return text.replace(/'/g, "’")
}

/** Whether `before` (the paragraph's text before a word) ends a sentence, so the next word starts one. */
function startsSentence(before: string) {
  if (!before.trim()) {
    return true
  }
  const match = /(\S+)\s+$/.exec(before)
  if (!match) {
    return false
  }
  const previous = match[1]!
  if (/[!?]["'”’)]*$/.test(previous)) {
    return true
  }
  if (!/[^.]\.["'”’)]*$/.test(previous)) {
    return false
  }
  // "etc." or "Mr." is not the end of a sentence; nor is "e.g." or a web address.
  const word = previous
    .replace(/["'”’)]*$/, "")
    .replace(/\.$/, "")
    .replace(/^["'“‘(]+/, "")
    .toLowerCase()
  return !SENTENCE_EXCEPTIONS.has(word) && !/[@/]|\.\w/.test(word.replace(/^(e\.g|i\.e)$/, ""))
}

/**
 * What AutoCorrect changes in the word that ends `before` (the paragraph's text up to the caret, before the
 * character that ends the word). `entries` is the Replace list; `context.inTable` says the paragraph is in a table cell.
 */
export function correctWord(
  before: string,
  options: AutoCorrectOptions,
  entries: ReadonlyMap<string, string>,
  context: { inTable?: boolean } = {},
): Correction[] {
  const match = /(\S+)$/.exec(before)
  if (!match) {
    return []
  }
  const start = before.length - match[1]!.length
  const token = match[1]!
  // Leading punctuation (an opening bracket or quote) is not part of the word; trailing digits and letters are.
  const lead = /^[("'“‘[{]*/.exec(token)![0].length
  const wordStart = start + lead
  const word = token.slice(lead)
  if (!word) {
    return []
  }
  // Internet and file addresses are left as typed.
  if (/[@/\\]|^www\.|:\/\//i.test(word) || /\.\w/.test(word.replace(/\.$/, ""))) {
    return []
  }
  if (options.replaceText) {
    // An apostrophe already curled by the smart quotes still matches an entry typed with a straight one.
    const key = word.replace(/\u2019/g, "'")
    const replacement = entries.get(key) ?? entries.get(key.toLowerCase())
    if (replacement !== undefined && /[A-Za-z]/.test(word)) {
      // An entry whose key is typed exactly keeps its own case ("i" → "I"); otherwise the typed case is kept.
      const cased = entries.has(key) ? replacement : inCaseOf(key, replacement)
      const text = options.smartQuotes ? curlApostrophes(cased) : cased
      if (text !== word) {
        return [
          { from: wordStart, to: before.length, text: capitalizeIfSentence(before, wordStart, text, options, context) },
        ]
      }
    }
  }
  if (options.ordinals) {
    const ordinal = /^(\d+)(st|nd|rd|th)$/i.exec(word)
    if (ordinal && ordinalSuffix(Number(ordinal[1])) === ordinal[2]!.toLowerCase()) {
      const at = wordStart + ordinal[1]!.length
      return [{ from: at, to: before.length, text: ordinal[2]!, superscript: true }]
    }
  }
  let text = word
  if (options.twoInitialCaps && /^[A-Z]{2}[a-z]+$/.test(word) && word.length > 2 && !TWO_CAPS_EXCEPTIONS.has(word)) {
    text = word[0] + word[1]!.toLowerCase() + word.slice(2)
  }
  if (options.capsDays && DAYS.includes(text.toLowerCase()) && isLower(text[0] ?? "")) {
    text = text[0]!.toUpperCase() + text.slice(1)
  }
  text = capitalizeIfSentence(before, wordStart, text, options, context)
  const corrections: Correction[] = text !== word ? [{ from: wordStart, to: before.length, text }] : []
  if (options.dashes) {
    const dash = dashCorrection(before)
    if (dash) {
      // The dash sits before the word; applied last-first, both offsets stay right.
      corrections.unshift(dash)
    }
  }
  return corrections
}

function capitalizeIfSentence(
  before: string,
  wordStart: number,
  text: string,
  options: AutoCorrectOptions,
  context: { inTable?: boolean },
) {
  const first = text[0] ?? ""
  if (!isLower(first) || /\d/.test(text)) {
    return text
  }
  const preceding = before.slice(0, wordStart)
  const paragraphStart = !preceding.trim()
  const capitalize =
    paragraphStart && context.inTable ? options.capsTableCells : options.capsSentence && startsSentence(preceding)
  if (capitalize) {
    return first.toUpperCase() + text.slice(1)
  }
  return text
}

function ordinalSuffix(value: number) {
  const tens = value % 100
  if (tens >= 11 && tens <= 13) {
    return "th"
  }
  return ["th", "st", "nd", "rd"][value % 10] ?? "th"
}

/**
 * Hyphens with a dash: "word--word" becomes an em dash and "word - word" or "word -- word" an en dash, once the
 * word after them is typed, as Word does.
 */
function dashCorrection(before: string): Correction | null {
  const em = /\w(--)\w+$/.exec(before)
  if (em) {
    const from = em.index + 1
    return { from, to: from + 2, text: "—" }
  }
  const en = /\w (--?) \w+$/.exec(before)
  if (en) {
    const from = en.index + 2
    return { from, to: from + en[1]!.length, text: "–" }
  }
  return null
}

/** A Replace list entry of symbols ("(c)", "-->") that ends `before`: replaced as soon as its last character is typed. */
export function symbolReplacement(before: string, entries: ReadonlyMap<string, string>): Correction | null {
  for (const [key, text] of entries) {
    if (/[A-Za-z0-9]$/.test(key) || key.length < 2 || !before.endsWith(key)) {
      continue
    }
    // "(c)" inside a word's brackets still counts, as in Word; letters only entries wait for the word's end.
    if (key === "..." && before.endsWith("....")) {
      continue
    }
    return { from: before.length - key.length, to: before.length, text }
  }
  return null
}

export type ListTrigger = { kind: "bullet" | "ordered"; marker: string | null; start: number }

/**
 * Automatic bulleted and numbered lists: what a paragraph's text before the space just typed starts. "*", "-" and
 * ">" start bullets; "1.", "1)", "a.", "a)", "A.", "i." and "I." start numbering at that value.
 */
export function listTrigger(paragraphText: string, options: AutoCorrectOptions): ListTrigger | null {
  if (options.autoBullets) {
    const bullet = { "*": "disc", "-": "–", ">": "➢" }[paragraphText]
    if (bullet !== undefined) {
      return { kind: "bullet", marker: paragraphText === "*" ? null : null, start: 1 }
    }
  }
  if (!options.autoNumbers) {
    return null
  }
  const match = /^(\d{1,3}|[a-z]|[A-Z]|[ivx]+|[IVX]+)([.)])$/.exec(paragraphText)
  if (!match) {
    return null
  }
  const value = match[1]!
  if (/^\d+$/.test(value)) {
    return { kind: "ordered", marker: null, start: Number(value) }
  }
  if (/^[ivx]+$/.test(value) && value === "i") {
    return { kind: "ordered", marker: "lower-roman", start: 1 }
  }
  if (/^[IVX]+$/.test(value) && value === "I") {
    return { kind: "ordered", marker: "upper-roman", start: 1 }
  }
  if (/^[a-z]$/.test(value)) {
    return { kind: "ordered", marker: "lower-alpha", start: value.charCodeAt(0) - 96 }
  }
  if (/^[A-Z]$/.test(value)) {
    return { kind: "ordered", marker: "upper-alpha", start: value.charCodeAt(0) - 64 }
  }
  return null
}
