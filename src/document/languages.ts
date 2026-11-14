/** Proofing languages with spell check, grammar, and thesaurus support. */
export const DOCUMENT_LANGUAGES = [
  { id: "en-US", label: "English (United States)", thesaurusName: "American English" },
  { id: "en-GB", label: "English (United Kingdom)", thesaurusName: "British English" },
  { id: "nl", label: "Dutch", thesaurusName: "Dutch" },
  { id: "de", label: "German", thesaurusName: "German" },
  { id: "es", label: "Spanish", thesaurusName: "Spanish" },
  { id: "it", label: "Italian", thesaurusName: "Italian" },
  { id: "da", label: "Danish", thesaurusName: "Danish" },
  { id: "fr", label: "French", thesaurusName: "French" },
] as const

export type DocumentLanguageId = (typeof DOCUMENT_LANGUAGES)[number]["id"]

const ALIASES: Record<string, DocumentLanguageId> = {
  en: "en-US",
  "en-us": "en-US",
  "en-gb": "en-GB",
  "en-nl": "en-GB",
  nl: "nl",
  de: "de",
  es: "es",
  it: "it",
  da: "da",
  fr: "fr",
}

export function normalizeDocumentLanguage(id: string | null | undefined): DocumentLanguageId {
  if (!id) {
    return "en-US"
  }
  const exact = DOCUMENT_LANGUAGES.find((item) => item.id === id)
  if (exact) {
    return exact.id
  }
  return ALIASES[id.toLowerCase()] ?? "en-US"
}

export function languageLabel(id: string) {
  return (
    DOCUMENT_LANGUAGES.find((item) => item.id === normalizeDocumentLanguage(id))?.label ?? "English (United States)"
  )
}

export function languageThesaurusName(id: string) {
  return (
    DOCUMENT_LANGUAGES.find((item) => item.id === normalizeDocumentLanguage(id))?.thesaurusName ?? "American English"
  )
}

/** Word's tag (w:lang) for each proofing language: Word writes a language with its region. */
const WORD_TAGS: Record<DocumentLanguageId, string> = {
  "en-US": "en-US",
  "en-GB": "en-GB",
  nl: "nl-NL",
  de: "de-DE",
  es: "es-ES",
  it: "it-IT",
  da: "da-DK",
  fr: "fr-FR",
}

export function wordLanguageTag(id: DocumentLanguageId) {
  return WORD_TAGS[id]
}

/**
 * The proofing language for a tag on text (w:lang, "nl-BE", "de-AT"), or null when the app has no dictionary for it:
 * unlike `normalizeDocumentLanguage`, an unknown language is not checked as English.
 */
export function proofingLanguage(tag: string | null | undefined): DocumentLanguageId | null {
  if (!tag) {
    return null
  }
  const exact = DOCUMENT_LANGUAGES.find((item) => item.id.toLowerCase() === tag.toLowerCase())
  if (exact) {
    return exact.id
  }
  const lower = tag.toLowerCase()
  if (lower.startsWith("en-")) {
    // Word's English variants other than the United States' spell as British English does.
    return "en-GB"
  }
  return ALIASES[lower.split("-")[0]] ?? null
}

/** A language tag's name as Word shows it ("Dutch (Belgium)"); the app's own names for its proofing languages. */
export function languageName(tag: string) {
  const own = DOCUMENT_LANGUAGES.find(
    (item) => item.id.toLowerCase() === tag.toLowerCase() || WORD_TAGS[item.id].toLowerCase() === tag.toLowerCase(),
  )
  if (own) {
    return own.label
  }
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag
  } catch {
    return tag
  }
}
