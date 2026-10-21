import { useEditingOptions } from "@/document/editing-options"
import { normalizeDocumentLanguage, type DocumentLanguageId } from "@/document/languages"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { refreshDisplayedMarks } from "@/editor/display-refresh"
import { Extension, type Editor } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import nspell from "nspell"

type SpellChecker = ReturnType<typeof nspell>
type CustomDictionaries = Partial<Record<DocumentLanguageId, string[]>>

const SUGGESTION_LIMIT = 5
const WORD_PATTERN = /[\p{L}]+(?:['’][\p{L}]+)*/gu
const CUSTOM_DICTIONARY_KEY = "aiword.custom-dictionaries"

/** Session-only ignores (not persisted). */
const ignoredWords = new Set<string>()
/** Persisted user words, keyed by proofing language. */
const customWords = new Map<DocumentLanguageId, Set<string>>()
const cache = new Map<DocumentLanguageId, SpellChecker>()
const loading = new Map<DocumentLanguageId, Promise<SpellChecker>>()
let activeLanguage: DocumentLanguageId | null = null
let activeSpell: SpellChecker | null = null
let customDictionariesLoaded = false

const DICTIONARY_URLS: Record<DocumentLanguageId, { aff: URL; dic: URL }> = {
  "en-US": {
    aff: new URL("./dictionary/hunspell/en-US/index.aff", import.meta.url),
    dic: new URL("./dictionary/hunspell/en-US/index.dic", import.meta.url),
  },
  "en-GB": {
    aff: new URL("./dictionary/hunspell/en-GB/index.aff", import.meta.url),
    dic: new URL("./dictionary/hunspell/en-GB/index.dic", import.meta.url),
  },
  nl: {
    aff: new URL("./dictionary/hunspell/nl/index.aff", import.meta.url),
    dic: new URL("./dictionary/hunspell/nl/index.dic", import.meta.url),
  },
  de: {
    aff: new URL("./dictionary/hunspell/de/index.aff", import.meta.url),
    dic: new URL("./dictionary/hunspell/de/index.dic", import.meta.url),
  },
  es: {
    aff: new URL("./dictionary/hunspell/es/index.aff", import.meta.url),
    dic: new URL("./dictionary/hunspell/es/index.dic", import.meta.url),
  },
  it: {
    aff: new URL("./dictionary/hunspell/it/index.aff", import.meta.url),
    dic: new URL("./dictionary/hunspell/it/index.dic", import.meta.url),
  },
  da: {
    aff: new URL("./dictionary/hunspell/da/index.aff", import.meta.url),
    dic: new URL("./dictionary/hunspell/da/index.dic", import.meta.url),
  },
  fr: {
    aff: new URL("./dictionary/hunspell/fr/index.aff", import.meta.url),
    dic: new URL("./dictionary/hunspell/fr/index.dic", import.meta.url),
  },
}

function currentLanguage() {
  return normalizeDocumentLanguage(useDocumentStore.getState().pageSetup.language)
}

function readStoredDictionaries(): CustomDictionaries {
  if (typeof localStorage === "undefined") {
    return {}
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_DICTIONARY_KEY) ?? "{}") as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {}
    }
    const result: CustomDictionaries = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) {
        continue
      }
      const lang = normalizeDocumentLanguage(key)
      const words = value
        .filter((item): item is string => typeof item === "string")
        .map(normalizeToken)
        .filter(Boolean)
      result[lang] = [...new Set([...(result[lang] ?? []), ...words])]
    }
    return result
  } catch {
    return {}
  }
}

function ensureCustomDictionariesLoaded() {
  if (customDictionariesLoaded) {
    return
  }
  customDictionariesLoaded = true
  const stored = readStoredDictionaries()
  for (const [lang, words] of Object.entries(stored) as [DocumentLanguageId, string[]][]) {
    customWords.set(lang, new Set(words))
  }
}

function customWordSet(language: DocumentLanguageId) {
  ensureCustomDictionariesLoaded()
  let set = customWords.get(language)
  if (!set) {
    set = new Set()
    customWords.set(language, set)
  }
  return set
}

function persistCustomDictionaries() {
  if (typeof localStorage === "undefined") {
    return
  }
  const payload: CustomDictionaries = {}
  for (const [lang, words] of customWords) {
    if (words.size > 0) {
      payload[lang] = [...words].sort((a, b) => a.localeCompare(b))
    }
  }
  localStorage.setItem(CUSTOM_DICTIONARY_KEY, JSON.stringify(payload))
}

function applyCustomWords(spell: SpellChecker, language: DocumentLanguageId) {
  for (const word of customWordSet(language)) {
    try {
      spell.add(word)
    } catch {
      // Ignore individual add failures; the word still stays in our set.
    }
  }
}

async function loadSpell(language: DocumentLanguageId) {
  const cached = cache.get(language)
  if (cached) {
    return cached
  }
  const pending = loading.get(language)
  if (pending) {
    return pending
  }

  const urls = DICTIONARY_URLS[language]
  const task = Promise.all([
    fetch(urls.aff).then((response) => response.text()),
    fetch(urls.dic).then((response) => response.text()),
  ])
    .then(([aff, dic]) => {
      const spell = nspell(aff, dic)
      applyCustomWords(spell, language)
      cache.set(language, spell)
      loading.delete(language)
      return spell
    })
    .catch((error: unknown) => {
      loading.delete(language)
      console.error(`Spell check dictionary failed to load (${language}).`, error)
      throw error
    })

  loading.set(language, task)
  return task
}

/** Prefetch / switch the Hunspell dictionary for the document proofing language. */
export function ensureDictionary(language?: string) {
  const lang = normalizeDocumentLanguage(language ?? currentLanguage())
  ensureCustomDictionariesLoaded()
  return loadSpell(lang).then((spell) => {
    activeLanguage = lang
    activeSpell = spell
    return spell
  })
}

export function ignoreSpelling(word: string) {
  wordsVersion += 1
  ignoredWords.add(normalizeToken(word))
}

/** Persist a word in the custom dictionary for the active proofing language. */
export function addToDictionary(word: string) {
  const lang = activeLanguage ?? currentLanguage()
  const lower = normalizeToken(word)
  if (!lower || lower.length > 64) {
    return lang
  }
  const set = customWordSet(lang)
  if (!set.has(lower)) {
    wordsVersion += 1
    set.add(lower)
    persistCustomDictionaries()
  }
  const spell = cache.get(lang) ?? activeSpell
  try {
    spell?.add(lower)
  } catch {
    // Keep the persisted entry even if the checker rejects the form.
  }
  return lang
}

export function spellingSuggestions(word: string) {
  if (!activeSpell) {
    return []
  }
  const target = normalizeToken(word)
  if (!target || target.length > 48) {
    return []
  }
  try {
    const own = useEditingOptions.getState().mainDictionaryOnly
      ? customWordSet(activeLanguage ?? currentLanguage())
      : null
    return activeSpell
      .suggest(target)
      .filter((suggestion) => !own?.has(normalizeToken(suggestion)))
      .slice(0, SUGGESTION_LIMIT)
      .map((suggestion) => matchCase(word, suggestion))
  } catch {
    return []
  }
}

function normalizeToken(word: string) {
  return word.normalize("NFC").replace(/’/g, "'").toLowerCase()
}

function knownWord(word: string) {
  if (!activeSpell) {
    return true
  }
  const lower = normalizeToken(word)
  if (!lower || ignoredWords.has(lower)) {
    return true
  }
  const language = activeLanguage ?? currentLanguage()
  if (customWordSet(language).has(lower)) {
    return true
  }
  try {
    if (activeSpell.correct(lower) || activeSpell.correct(word)) {
      return true
    }
  } catch {
    return true
  }
  // English-style possessives / contractions against the stem.
  if (activeLanguage === "en-US" || activeLanguage === "en-GB") {
    if (lower === "won't" || lower === "can't" || lower === "shan't") {
      return true
    }
    const possessive = /^([\p{L}]+)'s$/u.exec(lower)
    if (possessive && activeSpell.correct(possessive[1])) {
      return true
    }
    const contraction = /^([\p{L}]+)(?:n't|'(?:re|ve|ll|d|m))$/u.exec(lower)
    if (contraction && activeSpell.correct(contraction[1])) {
      return true
    }
  }
  return false
}

function matchCase(source: string, suggestion: string) {
  const letters = source.replace(/[^\p{L}]/gu, "")
  if (letters && letters === letters.toUpperCase()) {
    return suggestion.toLocaleUpperCase(activeLanguage ?? "en-US")
  }
  if (letters[0] && letters[0] === letters[0].toLocaleUpperCase(activeLanguage ?? "en-US")) {
    return suggestion.charAt(0).toLocaleUpperCase(activeLanguage ?? "en-US") + suggestion.slice(1)
  }
  return suggestion
}

/** Ranges of a text that are Internet or file addresses, which "Ignore Internet and file addresses" skips. */
const ADDRESS_PATTERN =
  /(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|[A-Za-z]:\\\S*|(?:~|\.{0,2})\/[\w.-]+(?:\/[\w.-]*)+/g

/** Whether the spelling options leave this word unchecked; `text` is the string it sits in, `at` its start. */
export function skippedBySpellingOptions(word: string, text: string, at: number, addresses: [number, number][]) {
  const options = useEditingOptions.getState()
  if (options.ignoreAddresses && addresses.some(([from, to]) => at >= from && at < to)) {
    return true
  }
  const start = Math.max(text.lastIndexOf(" ", at - 1), text.lastIndexOf("\n", at - 1)) + 1
  const spaceAfter = text.indexOf(" ", at + word.length)
  const token = text.slice(start, spaceAfter === -1 ? undefined : spaceAfter)
  if (options.ignoreNumbers && /\d/.test(token)) {
    return true
  }
  const letters = word.replace(/[^\p{L}]/gu, "")
  return (
    options.ignoreUppercase &&
    letters.length > 1 &&
    letters === letters.toUpperCase() &&
    letters !== letters.toLowerCase()
  )
}

function spellDecoration(from: number, to: number) {
  return Decoration.inline(from, to, {
    class: "spell-error",
    "data-spell-from": String(from),
    "data-spell-to": String(to),
  })
}

const spellcheckKey = new PluginKey<DecorationSet | null>("spellcheck")

type SpellMeta = { run?: boolean; clear?: boolean }

/** What was found in a run of text, kept for as long as the run is the same node and nothing that decides it changed. */
const checkedText = new WeakMap<ProseMirrorNode, { key: string; errors: [number, number][] }>()
/** Bumped when a word is ignored or added, which changes what counts as misspelt. */
let wordsVersion = 0

function checkSettingsKey() {
  const options = useEditingOptions.getState()
  return [
    activeLanguage,
    wordsVersion,
    options.ignoreAddresses,
    options.ignoreNumbers,
    options.ignoreUppercase,
    options.flagRepeated,
  ].join("|")
}

/** Underlines for every misspelt word in the document, or null when there are none. */
function spellingDecorations(doc: ProseMirrorNode) {
  if (!activeSpell) {
    return null
  }
  const decorations: Decoration[] = []
  const settings = checkSettingsKey()
  doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock") {
      return false
    }
    if (!node.isText || !node.text || node.marks.some((mark) => mark.type.name === "code")) {
      return
    }
    // Typing changes one paragraph; the words of every other one were checked already.
    const kept = checkedText.get(node)
    if (kept && kept.key === settings) {
      for (const [from, to] of kept.errors) {
        decorations.push(spellDecoration(pos + from, pos + to))
      }
      return
    }
    const errors: [number, number][] = []

    const addresses = [...node.text.matchAll(ADDRESS_PATTERN)].map((found): [number, number] => [
      found.index,
      found.index + found[0].length,
    ])
    let previous = ""
    let previousEnd = -1
    WORD_PATTERN.lastIndex = 0
    let match = WORD_PATTERN.exec(node.text)
    while (match) {
      const word = match[0]
      const skipped = skippedBySpellingOptions(word, node.text, match.index, addresses)
      const repeated =
        !skipped &&
        useEditingOptions.getState().flagRepeated &&
        previous === word.toLowerCase() &&
        /^\s+$/.test(node.text.slice(previousEnd, match.index))
      previous = word.toLowerCase()
      previousEnd = match.index + word.length
      if (repeated || (!skipped && !knownWord(word))) {
        errors.push([match.index, match.index + word.length])
        decorations.push(spellDecoration(pos + match.index, pos + match.index + word.length))
      }
      match = WORD_PATTERN.exec(node.text)
    }
    checkedText.set(node, { key: settings, errors })
  })

  if (decorations.length === 0) {
    return null
  }
  return DecorationSet.create(doc, decorations)
}

/**
 * A manual check's underlines after an edit: words the edit touched lose theirs, since nothing checks them again
 * until the next manual check. Each kept underline's position attributes follow the word.
 */
function withoutEdited(set: DecorationSet, tr: Transaction) {
  const touched: Decoration[] = []
  tr.mapping.maps.forEach((map, index) => {
    const after = tr.mapping.slice(index + 1)
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      const start = after.map(newStart, -1)
      const end = after.map(newEnd, 1)
      // Typing next to a word (a space after it) leaves it alone; typing inside it or replacing it does not.
      touched.push(...set.find(start, end).filter((decoration) => decoration.from < end && decoration.to > start))
    })
  })
  const kept = set.remove(touched)
  return DecorationSet.create(
    tr.doc,
    kept.find().map((decoration) =>
      Decoration.inline(decoration.from, decoration.to, {
        class: "spell-error",
        "data-spell-from": String(decoration.from),
        "data-spell-to": String(decoration.to),
      }),
    ),
  )
}

/**
 * Checks the document's spelling once, for when checking as you type is off. Returns how many words are misspelt.
 */
export async function checkSpellingNow(editor: Editor) {
  await ensureDictionary()
  if (editor.isDestroyed) {
    return 0
  }
  editor.view.dispatch(editor.state.tr.setMeta(spellcheckKey, { run: true } satisfies SpellMeta))
  return spellcheckKey.getState(editor.state)?.find().length ?? 0
}

/** Drops a manual check's underlines, as when checking as you type is switched on or off. */
export function clearManualSpelling(editor: Editor) {
  if (!editor.isDestroyed && spellcheckKey.getState(editor.state)) {
    editor.view.dispatch(editor.state.tr.setMeta(spellcheckKey, { clear: true } satisfies SpellMeta))
  }
}

export const Spellcheck = Extension.create({
  name: "spellcheck",

  addStorage() {
    return { unsubscribe: null as null | (() => void), cancelStart: null as null | (() => void) }
  },

  onCreate() {
    const editor = this.editor
    const reload = () => {
      void ensureDictionary().then(() => {
        refreshDisplayedMarks(editor)
      })
    }
    // Parsing the dictionary holds the main thread for a moment, so at start it waits until the window has been drawn.
    if (window.requestIdleCallback) {
      const idle = window.requestIdleCallback(reload, { timeout: 1500 })
      this.storage.cancelStart = () => window.cancelIdleCallback(idle)
    } else {
      const timer = window.setTimeout(reload, 300)
      this.storage.cancelStart = () => window.clearTimeout(timer)
    }
    this.storage.unsubscribe = useDocumentStore.subscribe((state, previous) => {
      if (state.pageSetup.language !== previous.pageSetup.language) {
        reload()
      }
    })
  },

  onDestroy() {
    this.storage.cancelStart?.()
    this.storage.cancelStart = null
    this.storage.unsubscribe?.()
    this.storage.unsubscribe = null
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet | null>({
        key: spellcheckKey,
        state: {
          init: () => null,
          apply(tr, manual) {
            const meta = tr.getMeta(spellcheckKey) as SpellMeta | undefined
            if (meta?.run) {
              return spellingDecorations(tr.doc) ?? DecorationSet.empty
            }
            if (meta?.clear || !manual) {
              return null
            }
            return tr.docChanged ? withoutEdited(manual.map(tr.mapping, tr.doc), tr) : manual
          },
        },
        props: {
          decorations(state) {
            if (!useViewStore.getState().spellCheck) {
              // Checking as you type is off: show only what "Check Spelling Now" found.
              return spellcheckKey.getState(state) ?? null
            }
            if (!activeSpell) {
              return null
            }

            const language = currentLanguage()
            if (activeLanguage !== language) {
              void ensureDictionary(language)
              return null
            }

            return spellingDecorations(state.doc)
          },
        },
      }),
    ]
  },
})
