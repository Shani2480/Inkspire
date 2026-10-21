import type { CitationSource } from "@/document/sources"

type Entry = Omit<CitationSource, "id">

type CslName = { family?: string; given?: string; literal?: string }
type CslItem = { author?: CslName[]; title?: string; issued?: { "date-parts"?: unknown[][] } }

function cslAuthor(names: CslName[] | undefined) {
  return (names ?? [])
    .map((name) => name.literal || [name.family, name.given].filter(Boolean).join(", "))
    .filter(Boolean)
    .join("; ")
}

function fromCsl(items: unknown[]): Entry[] {
  return items.flatMap((raw) => {
    const item = raw as CslItem
    const author = cslAuthor(item.author)
    const year = String(item.issued?.["date-parts"]?.[0]?.[0] ?? "")
    return author ? [{ author, title: String(item.title ?? ""), year }] : []
  })
}

/** The value of one BibTeX field, with its braces or quotes taken off. */
function bibField(body: string, name: string) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(\\{((?:[^{}]|\\{[^{}]*\\})*)\\}|"([^"]*)"|(\\w+))`, "i").exec(body)
  const value = match?.[2] ?? match?.[3] ?? match?.[4] ?? ""
  return value.replace(/[{}]/g, "").replace(/\s+/g, " ").trim()
}

function fromBibtex(text: string): Entry[] {
  const entries: Entry[] = []
  for (const chunk of text.split(/^\s*@/m).slice(1)) {
    if (/^(comment|preamble|string)\b/i.test(chunk)) {
      continue
    }
    const author = bibField(chunk, "author").replace(/\s+and\s+/gi, "; ")
    if (author) {
      entries.push({ author, title: bibField(chunk, "title"), year: bibField(chunk, "year") })
    }
  }
  return entries
}

/** Sources from a CSL-JSON or BibTeX file, in the form the Sources list keeps. Anything else gives none. */
export function parseCitations(text: string): Entry[] {
  const trimmed = text.trim()
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed) as unknown
      return fromCsl(Array.isArray(data) ? data : [data])
    } catch {
      return []
    }
  }
  return fromBibtex(trimmed)
}
