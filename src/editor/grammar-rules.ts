import { normalizeDocumentLanguage } from "@/document/languages"

/**
 * Grammar and typing slips the app finds on its own, without a model: spacing and punctuation for every language,
 * and for English a few of the most common grammar slips. Each rule is meant to be right nearly every time it
 * fires; anything that needs judgement is left to the AI check in the Editor pane.
 */

export type GrammarKind = "spacing" | "punctuation" | "capitalization" | "article" | "pronoun" | "ai"

export type GrammarIssue = {
  /** Offsets inside the text that was checked. */
  from: number
  to: number
  /** The text at fault, and what to put in its place; several choices when there are several. */
  text: string
  suggestions: string[]
  message: string
  kind: GrammarKind
}

/** Words that start with a vowel letter but a consonant sound, and the other way round. */
const AN_BEFORE = /^(?:hour|honest|honor|honour|heir|herb|[fhlmnrsx]$|[fhlmnrsx]-|8|11|18|80)/i
const A_BEFORE = /^(?:uni|use|usu|ute|utensil|ubiq|euro|eu|one|once|u[a-z]*$|uk\b|usa\b|unesco)/i

const LETTER = /\p{L}/u

/** Finds the issues in one run of text, as offsets into it. */
export function findGrammarIssues(text: string, language: string): GrammarIssue[] {
  const issues: GrammarIssue[] = []
  if (!text.trim()) {
    return issues
  }
  const lang = normalizeDocumentLanguage(language)
  const english = lang.startsWith("en")

  // Two or more spaces between words.
  for (const match of text.matchAll(/(?<=\S) {2,}(?=\S)/g)) {
    issues.push({
      from: match.index,
      to: match.index + match[0].length,
      text: match[0],
      suggestions: [" "],
      message: "Extra space between words.",
      kind: "spacing",
    })
  }

  // A space before a comma or full stop (French puts one before ; : ! ? so those are left alone there).
  const before = lang === "fr" ? /(?<=\S) +(?=[,.])/g : /(?<=\S) +(?=[,.;:!?])(?![.]{2})/g
  for (const match of text.matchAll(before)) {
    const mark = text[match.index + match[0].length]
    issues.push({
      from: match.index,
      to: match.index + match[0].length,
      text: match[0],
      suggestions: [""],
      message: `No space before “${mark}”.`,
      kind: "punctuation",
    })
  }

  // No space after a comma or full stop between words ("word,word"); numbers (1,000) and addresses are left alone.
  for (const match of text.matchAll(/(?<=\p{L}{2})([,;:!?])(?=\p{L})/gu)) {
    if (/\w[.:]\w/.test(text.slice(match.index - 1, match.index + 2)) && !/[,;!?]/.test(match[1])) {
      continue
    }
    issues.push({
      from: match.index,
      to: match.index + 1,
      text: match[1],
      suggestions: [`${match[1]} `],
      message: `A space after “${match[1]}”.`,
      kind: "punctuation",
    })
  }

  // The same punctuation mark twice (",," or "..", but not an ellipsis).
  for (const match of text.matchAll(/([,;:?!])\1+|(?<!\.)\.\.(?!\.)/g)) {
    issues.push({
      from: match.index,
      to: match.index + match[0].length,
      text: match[0],
      suggestions: [match[0][0]],
      message: "Repeated punctuation.",
      kind: "punctuation",
    })
  }

  if (!english) {
    return sorted(issues)
  }

  // A sentence that starts with a lowercase letter.
  for (const match of text.matchAll(/(?:^|[.!?]\s+)(\p{Ll})/gu)) {
    const at = match.index + match[0].length - 1
    const word = text.slice(at).match(/^\p{L}+/u)?.[0] ?? ""
    // Not a lone letter such as a unit, not a word that is clearly an address or code.
    if (word.length < 2 || /^(?:e\.g|i\.e|www|http)/i.test(text.slice(at))) {
      continue
    }
    issues.push({
      from: at,
      to: at + word.length,
      text: word,
      suggestions: [match[1].toLocaleUpperCase("en") + word.slice(1)],
      message: "A sentence starts with a capital letter.",
      kind: "capitalization",
    })
  }

  // "i" as a word.
  for (const match of text.matchAll(/(?<![\p{L}'’])i(?=\s|$|[,.;:!?]|['’](?:m|ve|ll|d)\b)/gu)) {
    issues.push({
      from: match.index,
      to: match.index + 1,
      text: "i",
      suggestions: ["I"],
      message: "The pronoun “I” is always a capital.",
      kind: "pronoun",
    })
  }

  // "a" before a vowel sound, "an" before a consonant sound.
  for (const match of text.matchAll(/\b([Aa]n?)\s+(?=(\p{L}[\p{L}\d-]*))/gu)) {
    const article = match[1]
    const next = match[2]
    if (!LETTER.test(next)) {
      continue
    }
    // An initialism is said letter by letter: "an MRI", "a UFO".
    const vowelSound = /^[A-Z]{2,}$/.test(next)
      ? /^[AEFHILMNORSX]/.test(next)
      : AN_BEFORE.test(next)
        ? true
        : A_BEFORE.test(next)
          ? false
          : /^[aeiou]/i.test(next)
    const wantAn = vowelSound
    const isAn = article.length === 2
    if (wantAn === isAn) {
      continue
    }
    const fixed = (isAn ? article.slice(0, 1) : `${article}n`).replace(/^a/, article[0])
    issues.push({
      from: match.index,
      to: match.index + article.length,
      text: article,
      suggestions: [fixed],
      message: wantAn ? `“an” before “${next}”.` : `“a” before “${next}”.`,
      kind: "article",
    })
  }

  return sorted(issues)
}

function sorted(issues: GrammarIssue[]) {
  const seen = new Set<string>()
  return issues
    .sort((left, right) => left.from - right.from || left.to - right.to)
    .filter((issue) => {
      const key = `${issue.from}:${issue.to}:${issue.kind}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
}
