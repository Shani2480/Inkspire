import { aiUnavailableReason } from "@/ai/availability"
import { cancelAiRequest, generateAiText, isAiCancelled } from "@/ai/generate"
import { unwrapPlain } from "@/ai/themes"
import { languageThesaurusName } from "@/document/languages"
import { useDocumentStore } from "@/document/store"
import { create } from "zustand"

export const TRANSLATION_LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Danish",
  "Dutch",
  "Portuguese",
  "Arabic",
  "Chinese",
  "Japanese",
  "Hindi",
  "Korean",
] as const

export type ProofingMode = "thesaurus" | "translation"

export type GrammarIssue = {
  text: string
  suggestion: string
  reason: string
}

type ProofingState = {
  open: ProofingMode | null
  running: boolean
  notice: string
  error: string
  synonyms: string[]
  translation: string
  language: string
  requestId: string
  openPanel: (mode: ProofingMode) => void
  closePanel: () => void
  setLanguage: (language: string) => void
  setRunning: (running: boolean) => void
  setNotice: (notice: string) => void
  setError: (error: string) => void
  setSynonyms: (synonyms: string[]) => void
  setTranslation: (translation: string) => void
  setRequestId: (requestId: string) => void
}

const THESAURUS_SYSTEM =
  "Return only a JSON array of up to 8 synonyms in the requested language. Each entry is a short phrase of letters, spaces, or hyphens. No markdown or explanation."

const GRAMMAR_SYSTEM =
  "You are a proofreading assistant. Return only a JSON array of grammar/style issues. Each item must be an object with keys text (exact substring from the input), suggestion (corrected replacement), and reason (short explanation). Use the document language. If there are no issues, return []. No markdown."

const TRANSLATION_SYSTEM = "You translate documents. Return only the translation, with no notes, labels, or markdown."

const WORD = /^[\p{L}][\p{L}'’ -]{0,40}$/u

export const useProofing = create<ProofingState>((set) => ({
  open: null,
  running: false,
  notice: "",
  error: "",
  synonyms: [],
  translation: "",
  language: "Spanish",
  requestId: "",
  openPanel: (open) =>
    set({
      open,
      running: false,
      notice: "",
      error: "",
      synonyms: [],
      translation: "",
      requestId: "",
    }),
  closePanel: () => {
    const requestId = useProofing.getState().requestId
    if (requestId) {
      cancelAiRequest(requestId)
    }
    set({
      open: null,
      running: false,
      notice: "",
      error: "",
      synonyms: [],
      translation: "",
      requestId: "",
    })
  },
  setLanguage: (language) => set({ language }),
  setRunning: (running) => set({ running }),
  setNotice: (notice) => set({ notice }),
  setError: (error) => set({ error }),
  setSynonyms: (synonyms) => set({ synonyms }),
  setTranslation: (translation) => set({ translation }),
  setRequestId: (requestId) => set({ requestId }),
}))

function documentLanguageName() {
  return languageThesaurusName(useDocumentStore.getState().pageSetup.language)
}

export function parseSynonyms(raw: string) {
  const text = unwrapPlain(raw)
  const start = text.indexOf("[")
  const end = text.lastIndexOf("]")
  if (start < 0 || end <= start) {
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) {
    return []
  }
  const synonyms: string[] = []
  for (const item of parsed) {
    if (typeof item !== "string") {
      continue
    }
    const word = item.trim()
    if (!WORD.test(word)) {
      continue
    }
    synonyms.push(word)
    if (synonyms.length === 8) {
      break
    }
  }
  return synonyms
}

export function parseGrammarIssues(raw: string): GrammarIssue[] {
  const text = unwrapPlain(raw)
  const start = text.indexOf("[")
  const end = text.lastIndexOf("]")
  if (start < 0 || end <= start) {
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) {
    return []
  }
  const issues: GrammarIssue[] = []
  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      continue
    }
    const record = item as Record<string, unknown>
    const excerpt = typeof record.text === "string" ? record.text.trim() : ""
    const suggestion = typeof record.suggestion === "string" ? record.suggestion.trim() : ""
    const reason = typeof record.reason === "string" ? record.reason.trim() : ""
    if (!excerpt || !suggestion) {
      continue
    }
    issues.push({ text: excerpt.slice(0, 200), suggestion: suggestion.slice(0, 200), reason: reason.slice(0, 240) })
    if (issues.length === 20) {
      break
    }
  }
  return issues
}

export function isSingleWord(value: string) {
  return WORD.test(value.trim())
}

export async function requestSynonyms(word: string, requestId: string) {
  const reason = await aiUnavailableReason()
  if (reason) {
    return { blocked: reason, synonyms: [] as string[] }
  }
  if (!isSingleWord(word)) {
    return { blocked: "Select a single word.", synonyms: [] as string[] }
  }
  const language = documentLanguageName()
  try {
    const raw = await generateAiText(
      `List synonyms in ${language} for the word below. Reply with a JSON array only.`,
      word.trim(),
      {
        system: THESAURUS_SYSTEM,
        plain: true,
        quiet: true,
        requestId,
      },
    )
    if (isAiCancelled(requestId)) {
      return { blocked: null, synonyms: [] as string[] }
    }
    const synonyms = parseSynonyms(raw)
    if (synonyms.length === 0) {
      return { blocked: "The model did not return any synonyms.", synonyms }
    }
    return { blocked: null, synonyms }
  } catch (error) {
    if (isAiCancelled(requestId) || (error instanceof Error && error.message === "Stopped.")) {
      return { blocked: null, synonyms: [] as string[] }
    }
    throw error
  }
}

export async function requestGrammar(text: string, requestId: string) {
  const reason = await aiUnavailableReason()
  if (reason) {
    return { blocked: reason, issues: [] as GrammarIssue[] }
  }
  const source = text.trim().slice(0, 8_000)
  if (!source) {
    return { blocked: "There is no text to check.", issues: [] as GrammarIssue[] }
  }
  const language = documentLanguageName()
  try {
    const raw = await generateAiText(
      `Proofread the following ${language} text for grammar and clarity. Return a JSON array of issues.`,
      source,
      {
        system: GRAMMAR_SYSTEM,
        plain: true,
        quiet: true,
        requestId,
      },
    )
    if (isAiCancelled(requestId)) {
      return { blocked: null, issues: [] as GrammarIssue[] }
    }
    const issues = parseGrammarIssues(raw)
    return { blocked: null, issues }
  } catch (error) {
    if (isAiCancelled(requestId) || (error instanceof Error && error.message === "Stopped.")) {
      return { blocked: null, issues: [] as GrammarIssue[] }
    }
    throw error
  }
}

export async function requestTranslation(text: string, language: string, requestId: string) {
  const reason = await aiUnavailableReason()
  if (reason) {
    return { blocked: reason, translation: "" }
  }
  if (!TRANSLATION_LANGUAGES.includes(language as (typeof TRANSLATION_LANGUAGES)[number])) {
    return { blocked: "Choose a language.", translation: "" }
  }
  const source = text.trim().slice(0, 8_000)
  if (!source) {
    return { blocked: "There is no text to translate.", translation: "" }
  }
  try {
    const raw = await generateAiText(`Translate into ${language}.`, source, {
      system: TRANSLATION_SYSTEM,
      plain: true,
      quiet: true,
      requestId,
    })
    if (isAiCancelled(requestId)) {
      return { blocked: null, translation: "" }
    }
    const translation = unwrapPlain(raw).slice(0, 20_000).trim()
    if (!translation) {
      return { blocked: "The model did not return a translation.", translation: "" }
    }
    return { blocked: null, translation }
  } catch (error) {
    if (isAiCancelled(requestId) || (error instanceof Error && error.message === "Stopped.")) {
      return { blocked: null, translation: "" }
    }
    throw error
  }
}
