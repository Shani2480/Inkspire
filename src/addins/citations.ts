import { makeTag, parseNames, type BibSource, type NameList, type SourceType } from "@/document/bibliography"

/**
 * Sources from a reference manager's export (CSL-JSON or BibTeX), as Word's sources: the type, the people, and the
 * fields Word has (title, year, journal, volume, issue, pages, publisher, city, URL, DOI).
 */

type CslName = { family?: string; given?: string; literal?: string }
type CslItem = {
  type?: string
  author?: CslName[]
  editor?: CslName[]
  title?: string
  "container-title"?: string
  publisher?: string
  "publisher-place"?: string
  volume?: string | number
  issue?: string | number
  page?: string
  URL?: string
  DOI?: string
  edition?: string | number
  issued?: { "date-parts"?: unknown[][] }
}

const CSL_TYPES: Record<string, SourceType> = {
  book: "Book",
  chapter: "BookSection",
  "article-journal": "JournalArticle",
  "article-magazine": "ArticleInAPeriodical",
  "article-newspaper": "ArticleInAPeriodical",
  "paper-conference": "ConferenceProceedings",
  report: "Report",
  webpage: "InternetSite",
  "post-weblog": "DocumentFromInternetSite",
  patent: "Patent",
  legal_case: "Case",
  motion_picture: "Film",
  interview: "Interview",
  song: "SoundRecording",
  graphic: "Art",
}

const BIBTEX_TYPES: Record<string, SourceType> = {
  book: "Book",
  inbook: "BookSection",
  incollection: "BookSection",
  article: "JournalArticle",
  inproceedings: "ConferenceProceedings",
  conference: "ConferenceProceedings",
  proceedings: "ConferenceProceedings",
  techreport: "Report",
  phdthesis: "Report",
  mastersthesis: "Report",
  online: "InternetSite",
  misc: "Misc",
}

function cslNames(names: CslName[] | undefined): NameList | undefined {
  const list = names ?? []
  const literal = list.length === 1 && list[0]?.literal && !list[0].family ? list[0].literal : undefined
  if (literal) {
    return { people: [], corporate: literal }
  }
  const people = list
    .map((name) => {
      if (name.family || name.given) {
        const [first = "", ...middle] = (name.given ?? "").split(/\s+/).filter(Boolean)
        return { last: name.family ?? "", first, middle: middle.join(" ") }
      }
      return parseNames(name.literal ?? "").people[0]
    })
    .filter((person): person is NonNullable<typeof person> => Boolean(person))
  return people.length > 0 ? { people } : undefined
}

function finish(sources: BibSource[]) {
  const tags: string[] = []
  for (const source of sources) {
    source.tag = makeTag(source, tags)
    tags.push(source.tag)
  }
  return sources
}

const text = (value: unknown) => (value === undefined || value === null ? "" : String(value).trim())

function fromCsl(items: unknown[]): BibSource[] {
  return finish(
    items.flatMap((raw): BibSource[] => {
      const item = raw as CslItem
      const author = cslNames(item.author)
      if (!author) {
        return []
      }
      const type = CSL_TYPES[item.type ?? ""] ?? (item.type ? "Misc" : "Book")
      const container =
        type === "BookSection"
          ? "BookTitle"
          : type === "JournalArticle"
            ? "JournalName"
            : type === "ArticleInAPeriodical"
              ? "PeriodicalTitle"
              : type === "ConferenceProceedings"
                ? "ConferenceName"
                : type === "InternetSite" || type === "DocumentFromInternetSite"
                  ? "InternetSiteTitle"
                  : ""
      const fields: Record<string, string> = {
        Title: text(item.title),
        Year: text(item.issued?.["date-parts"]?.[0]?.[0]),
        ...(container ? { [container]: text(item["container-title"]) } : {}),
        Publisher: text(item.publisher),
        City: text(item["publisher-place"]),
        Volume: text(item.volume),
        Issue: text(item.issue),
        Pages: text(item.page),
        Edition: text(item.edition),
        URL: text(item.URL),
        DOI: text(item.DOI),
      }
      const editor = cslNames(item.editor)
      return [
        {
          tag: "",
          type,
          names: { Author: author, ...(editor ? { Editor: editor } : {}) },
          fields: Object.fromEntries(Object.entries(fields).filter(([, value]) => value)),
        },
      ]
    }),
  )
}

/** The value of one BibTeX field, with its braces or quotes taken off. */
function bibField(body: string, name: string) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(\\{((?:[^{}]|\\{[^{}]*\\})*)\\}|"([^"]*)"|(\\w+))`, "i").exec(body)
  const value = match?.[2] ?? match?.[3] ?? match?.[4] ?? ""
  return value.replace(/[{}]/g, "").replace(/\s+/g, " ").trim()
}

function fromBibtex(input: string): BibSource[] {
  const sources: BibSource[] = []
  for (const chunk of input.split(/^\s*@/m).slice(1)) {
    const kind = /^(\w+)/.exec(chunk)?.[1]?.toLowerCase() ?? ""
    if (kind === "comment" || kind === "preamble" || kind === "string") {
      continue
    }
    const author = bibField(chunk, "author")
    if (!author) {
      continue
    }
    const type = BIBTEX_TYPES[kind] ?? "Misc"
    const fields: Record<string, string> = {
      Title: bibField(chunk, "title"),
      Year: bibField(chunk, "year"),
      JournalName: type === "JournalArticle" ? bibField(chunk, "journal") : "",
      BookTitle: type === "BookSection" ? bibField(chunk, "booktitle") : "",
      ConferenceName: type === "ConferenceProceedings" ? bibField(chunk, "booktitle") : "",
      Publisher: bibField(chunk, "publisher") || bibField(chunk, "institution") || bibField(chunk, "school"),
      City: bibField(chunk, "address"),
      Volume: bibField(chunk, "volume"),
      Issue: bibField(chunk, "number"),
      Pages: bibField(chunk, "pages").replace(/--/g, "-"),
      Edition: bibField(chunk, "edition"),
      URL: bibField(chunk, "url"),
      DOI: bibField(chunk, "doi"),
    }
    const editor = bibField(chunk, "editor")
    sources.push({
      tag: "",
      type,
      names: { Author: parseNames(author), ...(editor ? { Editor: parseNames(editor) } : {}) },
      fields: Object.fromEntries(Object.entries(fields).filter(([, value]) => value)),
    })
  }
  return finish(sources)
}

/** Sources from a CSL-JSON or BibTeX file. Anything else gives none. */
export function parseCitations(input: string): BibSource[] {
  const trimmed = input.trim()
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
