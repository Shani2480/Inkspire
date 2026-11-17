import { create } from "zustand"
import type { WordDocument } from "@/document/docx/model"
import { readSourcesPart } from "@/document/docx/sources-part"
import { BIB_STYLES, styleFromWord, type BibSource, type BibStyleId } from "@/document/bibliography"

/**
 * The open document's sources (Source Manager's Current List) and bibliography style, as Word keeps them in the
 * document; and the Master List, which Word keeps for the user across documents (here in the app's local storage).
 * `edited` once the list or the style changed, so a save writes the sources part; until then it stays as read.
 */
type BibliographyState = {
  sources: BibSource[]
  style: BibStyleId
  edited: boolean
  /** Bumped by Update Citations and Bibliography, so the editor brings every citation up to date. */
  refresh: number
  setStyle: (style: BibStyleId) => void
  /** Adds or replaces (by `replacing`, else by tag) a source in the document's list. */
  putSource: (source: BibSource, replacing?: string) => void
  removeSource: (tag: string) => void
  update: () => void
}

const STYLE_KEY = "inkspire.bibliography.style"
const MASTER_KEY = "inkspire.bibliography.master"
const OLD_SOURCES_KEY = "aiword-sources"
const OLD_STYLE_KEY = "aiword-citation-style"

function storage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}

/** The style new documents start with: the one last chosen, as in Word. */
function lastStyle(): BibStyleId {
  const store = storage()
  const saved = store?.getItem(STYLE_KEY) ?? ""
  if (BIB_STYLES.some((style) => style.id === saved)) {
    return saved as BibStyleId
  }
  const old = (store?.getItem(OLD_STYLE_KEY) ?? "").toUpperCase()
  return old === "MLA" ? "MLA" : old === "CHICAGO" ? "Chicago" : old === "IEEE" ? "IEEE" : "APA"
}

const sameTag = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export const useBibliography = create<BibliographyState>((set) => ({
  sources: [],
  style: lastStyle(),
  edited: false,
  refresh: 0,
  setStyle: (style) => {
    try {
      storage()?.setItem(STYLE_KEY, style)
    } catch {
      // Remembered for this session only.
    }
    set((state) => (state.style === style ? state : { style, edited: true, refresh: state.refresh + 1 }))
  },
  putSource: (source, replacing) =>
    set((state) => {
      const at = state.sources.findIndex((item) => sameTag(item.tag, replacing ?? source.tag))
      const sources =
        at >= 0 ? state.sources.map((item, index) => (index === at ? source : item)) : [...state.sources, source]
      return { sources, edited: true, refresh: state.refresh + 1 }
    }),
  removeSource: (tag) =>
    set((state) => ({
      sources: state.sources.filter((item) => !sameTag(item.tag, tag)),
      edited: true,
      refresh: state.refresh + 1,
    })),
  update: () => set((state) => ({ refresh: state.refresh + 1 })),
}))

/** An opened document's sources and style; a new document starts with none, in the last style used. */
export function applyOpenedSources(word: WordDocument | null) {
  const part = readSourcesPart(word)
  useBibliography.setState({
    sources: part?.sources ?? [],
    style: part ? styleFromWord(part.selectedStyle, part.styleName) : lastStyle(),
    edited: false,
  })
}

/** What a save writes: the sources and style when the app changed them. */
export function sourcesForSave() {
  const state = useBibliography.getState()
  return state.edited ? { sources: state.sources, style: state.style } : undefined
}

// --- the Master List ---------------------------------------------------------------------------------------------

/** Sources kept by the first version of the app (author, title, year), as books. */
function oldSources(): BibSource[] {
  try {
    const parsed = JSON.parse(storage()?.getItem(OLD_SOURCES_KEY) ?? "[]") as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.flatMap((item: { author?: unknown; title?: unknown; year?: unknown }): BibSource[] => {
      const author = typeof item?.author === "string" ? item.author.trim() : ""
      if (!author) {
        return []
      }
      const words = author.split(/\s+/)
      const last = words.pop() ?? ""
      const title = typeof item.title === "string" ? item.title : ""
      const year = typeof item.year === "string" ? item.year : ""
      return [
        {
          tag: `${last.slice(0, 3)}${year.slice(-2)}`,
          type: "Book",
          names: { Author: { people: [{ last, first: words.shift() ?? "", middle: words.join(" ") }] } },
          fields: { ...(title ? { Title: title } : {}), ...(year ? { Year: year } : {}) },
        },
      ]
    })
  } catch {
    return []
  }
}

export function loadMasterList(): BibSource[] {
  try {
    const raw = storage()?.getItem(MASTER_KEY)
    if (raw === null || raw === undefined) {
      return oldSources()
    }
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is BibSource =>
            Boolean(item) &&
            typeof (item as BibSource).tag === "string" &&
            typeof (item as BibSource).fields === "object",
        )
      : []
  } catch {
    return []
  }
}

export function saveMasterList(sources: BibSource[]) {
  try {
    storage()?.setItem(MASTER_KEY, JSON.stringify(sources.slice(0, 2000)))
  } catch {
    // Kept for this session only.
  }
}

/** Adds or replaces a source in the Master List (Word copies each new source there too). */
export function putMasterSource(source: BibSource, replacing?: string) {
  const list = loadMasterList()
  const at = list.findIndex((item) => sameTag(item.tag, replacing ?? source.tag))
  const next = at >= 0 ? list.map((item, index) => (index === at ? source : item)) : [...list, source]
  saveMasterList(next)
  return next
}
