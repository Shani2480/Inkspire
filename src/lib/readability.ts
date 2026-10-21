/** Syllables in an English word, by counting runs of vowels and dropping a silent final e. Good enough for the scores. */
export function countSyllables(word: string) {
  const letters = word.toLowerCase().replace(/[^a-z]/g, "")
  if (letters.length <= 3) {
    return letters ? 1 : 0
  }
  const stem = letters.replace(/(?:[^aeiouy]es|[^aeiouytd]ed|[^aeiouyl]e)$/, (end) => end.slice(0, 1))
  return Math.max(1, stem.match(/[aeiouy]+/g)?.length ?? 1)
}

export type Readability = {
  words: number
  sentences: number
  /** Flesch Reading Ease: higher is easier; 60 to 70 is plain English. */
  ease: number
  /** Flesch-Kincaid Grade Level: the school grade needed to follow the text. */
  grade: number
}

const round = (value: number) => Math.round(value * 10) / 10

/** Word's readability statistics for a piece of text; null when it has no word or no sentence. */
export function readability(text: string): Readability | null {
  const words = text.match(/[A-Za-z0-9][A-Za-z0-9’']*/g) ?? []
  const sentences = text.split(/[.!?]+(?:\s|$)/).filter((part) => /[A-Za-z0-9]/.test(part)).length
  if (words.length === 0 || sentences === 0) {
    return null
  }
  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0)
  const perSentence = words.length / sentences
  const perWord = syllables / words.length
  return {
    words: words.length,
    sentences,
    ease: round(206.835 - 1.015 * perSentence - 84.6 * perWord),
    grade: round(0.39 * perSentence + 11.8 * perWord - 15.59),
  }
}
