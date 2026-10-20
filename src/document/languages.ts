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
