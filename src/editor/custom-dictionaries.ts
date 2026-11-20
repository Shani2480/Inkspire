import { create } from "zustand"
import { normalizeDocumentLanguage, type DocumentLanguageId } from "@/document/languages"

/**
 * Options > Proofing > Custom Dictionaries, as Word keeps them: named word lists, each for one language or all of
 * them, each on or off, and one default that Add to Dictionary writes to. Kept in this app's storage (Word keeps
 * .dic files); a Word .dic file can be added.
 */
export type CustomDictionary = {
  id: string
  name: string
  language: DocumentLanguageId | "all"
  enabled: boolean
  words: string[]
}

const KEY = "aiword.custom-dictionaries.v2"
/** Where Add to Dictionary kept words before there were several dictionaries: one list per language. */
const OLD_KEY = "aiword.custom-dictionaries"
const DEFAULT_NAME = "CUSTOM.DIC"
const MAX_WORDS = 20_000

export function normalizeWord(word: string) {
  return word.normalize("NFC").replace(/’/g, "'").trim()
}

function fresh(name = DEFAULT_NAME, words: string[] = []): CustomDictionary {
  return { id: crypto.randomUUID(), name, language: "all", enabled: true, words }
}

function load(): { dictionaries: CustomDictionary[]; defaultId: string } {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null") as {
      dictionaries?: unknown
      defaultId?: unknown
    } | null
    if (parsed && Array.isArray(parsed.dictionaries)) {
      const dictionaries = parsed.dictionaries
        .filter((item): item is CustomDictionary => !!item && typeof item === "object" && typeof item.id === "string")
        .map((item) => ({
          id: item.id,
          name: typeof item.name === "string" && item.name ? item.name : DEFAULT_NAME,
          language: item.language === "all" ? ("all" as const) : normalizeDocumentLanguage(String(item.language)),
          enabled: item.enabled !== false,
          words: Array.isArray(item.words) ? item.words.filter((word) => typeof word === "string") : [],
        }))
      if (dictionaries.length) {
        const defaultId = dictionaries.some((item) => item.id === parsed.defaultId)
          ? String(parsed.defaultId)
          : dictionaries[0]!.id
        return { dictionaries, defaultId }
      }
    }
    // Words added before: every language's list goes into CUSTOM.DIC, for all languages, as Word's own default is.
    const old = JSON.parse(localStorage.getItem(OLD_KEY) ?? "{}") as Record<string, unknown>
    const words = [
      ...new Set(
        Object.values(old)
          .flatMap((value) => (Array.isArray(value) ? value : []))
          .filter((word): word is string => typeof word === "string"),
      ),
    ]
    const first = fresh(
      DEFAULT_NAME,
      words.sort((a, b) => a.localeCompare(b)),
    )
    return { dictionaries: [first], defaultId: first.id }
  } catch {
    const first = fresh()
    return { dictionaries: [first], defaultId: first.id }
  }
}

type State = {
  dictionaries: CustomDictionary[]
  defaultId: string
  /** Replaces the whole set, as the Custom Dictionaries dialog's OK does. */
  replace: (dictionaries: CustomDictionary[], defaultId: string) => void
  /** Add to Dictionary: into the default dictionary. */
  addWord: (word: string) => void
}

function save(state: Pick<State, "dictionaries" | "defaultId">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ dictionaries: state.dictionaries, defaultId: state.defaultId }))
  } catch {
    // Kept for the session only.
  }
}

export const useCustomDictionaries = create<State>((set, get) => ({
  ...(typeof localStorage === "undefined"
    ? (() => {
        const first = fresh()
        return { dictionaries: [first], defaultId: first.id }
      })()
    : load()),
  replace: (dictionaries, defaultId) => {
    const next = dictionaries.length ? dictionaries : [fresh()]
    const id = next.some((item) => item.id === defaultId) ? defaultId : next[0]!.id
    set({ dictionaries: next, defaultId: id })
    save(get())
  },
  addWord: (word) => {
    const clean = normalizeWord(word)
    if (!clean || clean.length > 64) {
      return
    }
    const { dictionaries, defaultId } = get()
    const next = dictionaries.map((item) =>
      item.id === defaultId && !item.words.includes(clean)
        ? { ...item, words: [...item.words, clean].sort((a, b) => a.localeCompare(b)).slice(0, MAX_WORDS) }
        : item,
    )
    set({ dictionaries: next })
    save(get())
  },
}))

/** The words the spelling checker accepts for a language: every dictionary that is on, for it or for all. */
export function activeCustomWords(language: DocumentLanguageId) {
  const out = new Set<string>()
  for (const dictionary of useCustomDictionaries.getState().dictionaries) {
    if (dictionary.enabled && (dictionary.language === "all" || dictionary.language === language)) {
      for (const word of dictionary.words) {
        out.add(normalizeWord(word).toLowerCase())
      }
    }
  }
  return out
}

/**
 * A Word .dic file's words: one per line, in UTF-16 with a byte-order mark as Word writes them, or UTF-8.
 */
export function readDicFile(bytes: Uint8Array) {
  let text: string
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    text = new TextDecoder("utf-16le").decode(bytes.subarray(2))
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    text = new TextDecoder("utf-16be").decode(bytes.subarray(2))
  } else {
    text = new TextDecoder().decode(
      bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes,
    )
  }
  return [
    ...new Set(
      text
        .split(/\r?\n/)
        .map(normalizeWord)
        .filter((word) => word && word.length <= 64),
    ),
  ]
}

export function newDictionary(name: string, words: string[] = []): CustomDictionary {
  return fresh(/\.dic$/i.test(name) ? name : `${name}.dic`, words)
}
