import { create } from "zustand"
import { DOCUMENT_LANGUAGES, normalizeDocumentLanguage, type DocumentLanguageId } from "@/document/languages"

/**
 * Options > Language > Office authoring languages and proofing: the languages the person writes in, in order, the
 * first being the preferred one. New documents are checked in the preferred language. Every language the app lists
 * has its proofing tools installed (the dictionaries come with the app).
 */
const KEY = "aiword.authoring-languages"

type State = {
  /** Preferred first. */
  authoring: DocumentLanguageId[]
  /** The person chose the preferred language here (otherwise new documents keep the app's default). */
  chosen: boolean
  replace: (authoring: DocumentLanguageId[], chosen: boolean) => void
}

function browserLanguage(): DocumentLanguageId {
  const tag = typeof navigator !== "undefined" ? navigator.language : "en-US"
  return normalizeDocumentLanguage(tag)
}

function load(): Pick<State, "authoring" | "chosen"> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null") as { authoring?: unknown; chosen?: unknown } | null
    const known = new Set<string>(DOCUMENT_LANGUAGES.map((item) => item.id))
    const authoring = Array.isArray(parsed?.authoring)
      ? [...new Set(parsed.authoring.filter((id): id is DocumentLanguageId => typeof id === "string" && known.has(id)))]
      : []
    if (authoring.length) {
      return { authoring, chosen: parsed?.chosen === true }
    }
  } catch {
    // Fall through to the default.
  }
  return { authoring: [browserLanguage()], chosen: false }
}

export const useLanguageSettings = create<State>((set) => ({
  ...(typeof localStorage === "undefined" ? { authoring: ["en-US"] as DocumentLanguageId[], chosen: false } : load()),
  replace: (authoring, chosen) => {
    const next = authoring.length ? [...new Set(authoring)] : [browserLanguage()]
    set({ authoring: next, chosen })
    try {
      localStorage.setItem(KEY, JSON.stringify({ authoring: next, chosen }))
    } catch {
      // Kept for the session only.
    }
  },
}))

/** The proofing language new documents start in, when the person set a preferred one; null otherwise. */
export function preferredAuthoringLanguage(): DocumentLanguageId | null {
  const { authoring, chosen } = useLanguageSettings.getState()
  return chosen ? (authoring[0] ?? null) : null
}
