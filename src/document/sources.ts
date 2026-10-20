const KEY = "aiword-sources"
const STYLE_KEY = "aiword-citation-style"

export type CitationSource = {
  id: string
  author: string
  title: string
  year: string
}

export type CitationStyle = "apa" | "mla" | "chicago" | "ieee"

export const CITATION_STYLES: { id: CitationStyle; label: string }[] = [
  { id: "apa", label: "APA" },
  { id: "mla", label: "MLA" },
  { id: "chicago", label: "Chicago" },
  { id: "ieee", label: "IEEE" },
]

export function loadCitationStyle(): CitationStyle {
  if (typeof localStorage === "undefined") {
    return "apa"
  }
  const value = localStorage.getItem(STYLE_KEY)
  return CITATION_STYLES.some((item) => item.id === value) ? (value as CitationStyle) : "apa"
}

export function saveCitationStyle(style: CitationStyle) {
  localStorage.setItem(STYLE_KEY, style)
}

export function formatCitation(source: CitationSource, style: CitationStyle, index = 1) {
  const author = source.author.trim() || "Author"
  const year = source.year.trim()
  if (style === "mla") {
    return `(${author})`
  }
  if (style === "chicago") {
    return year ? `(${author} ${year})` : `(${author})`
  }
  if (style === "ieee") {
    return `[${index}]`
  }
  return year ? `(${author}, ${year})` : `(${author})`
}

export function formatBibliographyEntry(source: CitationSource, style: CitationStyle, index = 1) {
  const author = source.author.trim() || "Author"
  const title = source.title.trim() || "Untitled"
  const year = source.year.trim()
  if (style === "mla") {
    return `${author}. <em>${title}</em>.${year ? ` ${year}.` : ""}`
  }
  if (style === "chicago") {
    return `${author}. ${year ? `${year}. ` : ""}<em>${title}</em>.`
  }
  if (style === "ieee") {
    return `[${index}] ${author}, “${title},”${year ? ` ${year}.` : ""}`
  }
  return `${author}${year ? ` (${year})` : ""}. ${title}.`
}

function read(): CitationSource[] {
  if (typeof localStorage === "undefined") {
    return []
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(
      (item): item is CitationSource =>
        !!item &&
        typeof item === "object" &&
        typeof (item as CitationSource).id === "string" &&
        typeof (item as CitationSource).author === "string",
    )
  } catch {
    return []
  }
}

function write(sources: CitationSource[]) {
  localStorage.setItem(KEY, JSON.stringify(sources.slice(0, 80)))
}

export function loadSources() {
  return read()
}

export function saveSource(source: Omit<CitationSource, "id"> & { id?: string }) {
  const author = source.author.trim().slice(0, 80)
  const title = source.title.trim().slice(0, 120)
  const year = source.year.trim().slice(0, 8)
  if (!author) {
    return read()
  }
  const current = read()
  if (source.id) {
    write(current.map((item) => (item.id === source.id ? { id: item.id, author, title, year } : item)))
  } else {
    write([{ id: crypto.randomUUID(), author, title, year }, ...current])
  }
  return read()
}

export function deleteSource(id: string) {
  write(read().filter((item) => item.id !== id))
  return read()
}
