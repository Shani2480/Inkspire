/**
 * Word's sources, citations and bibliography (References > Citations & Bibliography), as Word keeps them: sources in
 * a custom XML part (`b:Sources`), each citation a CITATION field, the bibliography a BIBLIOGRAPHY field. Citations
 * and entries are formatted as Word's own styles format them (APA, Chicago, Harvard - Anglia, IEEE, MLA, Turabian),
 * checked against Word's output. Shared by the .docx converter and the editor, so it holds no editor code.
 */

export const BIBLIOGRAPHY_NS = "http://schemas.openxmlformats.org/officeDocument/2006/bibliography"

// --- sources -----------------------------------------------------------------------------------------------------

export type Person = { last: string; first: string; middle: string }
/** A name field: people, or a corporate author (Word's "Corporate Author" box). */
export type NameList = { people: Person[]; corporate?: string }

export const NAME_ROLES = [
  "Author",
  "BookAuthor",
  "Editor",
  "Translator",
  "Compiler",
  "Composer",
  "Conductor",
  "Performer",
  "Writer",
  "Director",
  "Producer",
  "Interviewee",
  "Interviewer",
  "Inventor",
  "Artist",
  "Counsel",
] as const
export type NameRole = (typeof NAME_ROLES)[number]

export type BibSource = {
  tag: string
  /** Empty for a placeholder (Insert Citation > Add New Placeholder…): a tag with nothing else yet. */
  type: SourceType | ""
  names: Partial<Record<NameRole, NameList>>
  /** Text fields by Word's element name (Title, Year, City, Publisher, …). */
  fields: Record<string, string>
  guid?: string
  /** Elements the app has no field for (LCID, a source's own lang), written back as read. */
  other?: string[]
}

export const SOURCE_TYPES = [
  { id: "Book", label: "Book" },
  { id: "BookSection", label: "Book Section" },
  { id: "JournalArticle", label: "Journal Article" },
  { id: "ArticleInAPeriodical", label: "Article in a Periodical" },
  { id: "ConferenceProceedings", label: "Conference Proceedings" },
  { id: "Report", label: "Report" },
  { id: "InternetSite", label: "Web site" },
  { id: "DocumentFromInternetSite", label: "Document From Web site" },
  { id: "ElectronicSource", label: "Electronic Source" },
  { id: "Art", label: "Art" },
  { id: "SoundRecording", label: "Sound Recording" },
  { id: "Performance", label: "Performance" },
  { id: "Film", label: "Film" },
  { id: "Interview", label: "Interview" },
  { id: "Patent", label: "Patent" },
  { id: "Case", label: "Case" },
  { id: "Misc", label: "Miscellaneous" },
] as const
export type SourceType = (typeof SOURCE_TYPES)[number]["id"]

/** A field of the Create Source dialog: a text field by element name, or a name role. */
export type SourceField = { key: string; label: string; name?: true; example?: string }

const F = (key: string, label: string, example?: string): SourceField => ({
  key,
  label,
  ...(example ? { example } : {}),
})
const N = (key: NameRole, label: string): SourceField => ({ key, label, name: true })

const AUTHOR = N("Author", "Author")
const TITLE = F("Title", "Title", "How to Write Bibliographies")
const YEAR = F("Year", "Year", "2006")
const MONTH = F("Month", "Month", "June")
const DAY = F("Day", "Day", "30")
const CITY = F("City", "City", "Chicago")
const PUBLISHER = F("Publisher", "Publisher", "Adventure Works Press")
const PAGES = F("Pages", "Pages", "50-62")
const ACCESSED = [
  F("YearAccessed", "Year Accessed"),
  F("MonthAccessed", "Month Accessed"),
  F("DayAccessed", "Day Accessed"),
]
const URL = F("URL", "URL", "https://example.org/page")

/** The fields Word's Create Source dialog shows for each type, as it shows them for APA. */
const RECOMMENDED: Record<SourceType, SourceField[]> = {
  Book: [AUTHOR, TITLE, YEAR, CITY, PUBLISHER],
  BookSection: [AUTHOR, TITLE, F("BookTitle", "Book Title"), YEAR, PAGES, CITY, PUBLISHER],
  JournalArticle: [AUTHOR, TITLE, F("JournalName", "Journal Name"), YEAR, PAGES],
  ArticleInAPeriodical: [AUTHOR, TITLE, F("PeriodicalTitle", "Periodical Title"), YEAR, MONTH, DAY, PAGES],
  ConferenceProceedings: [
    AUTHOR,
    TITLE,
    PAGES,
    YEAR,
    F("ConferenceName", "Conference Publication Name"),
    CITY,
    PUBLISHER,
  ],
  Report: [AUTHOR, TITLE, YEAR, PUBLISHER, CITY],
  InternetSite: [
    AUTHOR,
    F("Title", "Name of Web Page"),
    F("InternetSiteTitle", "Name of Web Site"),
    YEAR,
    MONTH,
    DAY,
    ...ACCESSED,
    URL,
  ],
  DocumentFromInternetSite: [
    AUTHOR,
    F("Title", "Name of Web Page"),
    F("InternetSiteTitle", "Name of Web Site"),
    YEAR,
    MONTH,
    DAY,
    ...ACCESSED,
    URL,
  ],
  ElectronicSource: [AUTHOR, TITLE, YEAR, CITY, F("ProductionCompany", "Production Company")],
  Art: [N("Artist", "Artist"), TITLE, YEAR, F("Institution", "Institution"), CITY],
  SoundRecording: [
    N("Composer", "Composer"),
    N("Performer", "Performer"),
    TITLE,
    F("ProductionCompany", "Production Company"),
    YEAR,
    CITY,
  ],
  Performance: [N("Writer", "Writer"), N("Performer", "Performer"), TITLE, F("Theater", "Theater"), CITY, YEAR],
  Film: [N("Director", "Director"), N("Performer", "Performer"), TITLE, F("Distributor", "Distributor"), YEAR],
  Interview: [N("Interviewee", "Interviewee"), N("Interviewer", "Interviewer"), TITLE, YEAR, MONTH, DAY],
  Patent: [
    N("Inventor", "Inventor"),
    TITLE,
    F("CountryRegion", "Country/Region"),
    F("PatentNumber", "Patent Number"),
    YEAR,
    MONTH,
    DAY,
  ],
  Case: [
    F("Title", "Case Name"),
    F("CaseNumber", "Case Number"),
    F("Court", "Court"),
    YEAR,
    MONTH,
    DAY,
    F("Reporter", "Reporter"),
  ],
  Misc: [AUTHOR, TITLE, YEAR, CITY, PUBLISHER],
}

/** What "Show All Bibliography Fields" adds, after the type's own fields. */
const MORE: SourceField[] = [
  N("Editor", "Editor"),
  N("Translator", "Translator"),
  F("StateProvince", "State/Province"),
  F("CountryRegion", "Country/Region"),
  F("Volume", "Volume"),
  F("NumberVolumes", "Number of Volumes"),
  F("Issue", "Issue"),
  F("Edition", "Edition"),
  F("ShortTitle", "Short Title"),
  F("StandardNumber", "Standard Number"),
  F("DOI", "DOI"),
  ...ACCESSED,
  URL,
  F("Medium", "Medium"),
  F("Comments", "Comments"),
]

const EXTRA_FOR: Partial<Record<SourceType, SourceField[]>> = {
  BookSection: [N("BookAuthor", "Book Author")],
  Report: [F("ThesisType", "Report Type"), F("Department", "Department"), F("Institution", "Institution")],
  SoundRecording: [N("Conductor", "Conductor"), F("AlbumTitle", "Album Title")],
  Film: [N("Producer", "Producer"), N("Writer", "Writer")],
  Case: [N("Counsel", "Counsel")],
}

export function sourceFields(type: SourceType, all: boolean): SourceField[] {
  const own = RECOMMENDED[type]
  if (!all) {
    return own
  }
  const seen = new Set(own.map((field) => field.key))
  const extra = [...(EXTRA_FOR[type] ?? []), ...MORE].filter((field) => !seen.has(field.key) && seen.add(field.key))
  return [...own, ...extra]
}

export const isPlaceholder = (source: BibSource) => !source.type

export function emptyNames(): NameList {
  return { people: [] }
}

/** Word's display of a name list in its boxes: "Smith, John A.; Jones, Mary" or the corporate name. */
export function namesText(list: NameList | undefined) {
  if (!list) {
    return ""
  }
  if (list.corporate) {
    return list.corporate
  }
  return list.people
    .map((person) => [person.last, [person.first, person.middle].filter(Boolean).join(" ")].filter(Boolean).join(", "))
    .join("; ")
}

/** "Smith, John A.; Jones, Mary" (or "John A. Smith") typed in a name box, as people. */
export function parseNames(text: string): NameList {
  const people = text
    .split(/;|\band\b/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part): Person => {
      if (part.includes(",")) {
        const [last = "", rest = ""] = part.split(",", 2).map((item) => item.trim())
        const [first = "", ...middle] = rest.split(/\s+/).filter(Boolean)
        return { last, first, middle: middle.join(" ") }
      }
      const words = part.split(/\s+/)
      const last = words.pop() ?? ""
      const [first = "", ...middle] = words
      return { last, first, middle: middle.join(" ") }
    })
  return { people }
}

/** The first author-like name list: the author, or the type's own (artist, composer, director…). */
export function mainNames(source: BibSource): NameList | undefined {
  const order: NameRole[] = [
    "Author",
    "Artist",
    "Composer",
    "Writer",
    "Director",
    "Interviewee",
    "Inventor",
    "Performer",
  ]
  for (const role of order) {
    const list = source.names[role]
    if (list && (list.corporate || list.people.length > 0)) {
      return list
    }
  }
  return undefined
}

/** Word's tag: three letters of the first author's last name (or the title) and the year's last two digits. */
export function makeTag(source: BibSource, taken: Iterable<string>) {
  const names = mainNames(source)
  const word = (names?.corporate || names?.people[0]?.last || source.fields.Title || "Src").replace(
    /[^\p{L}\p{N}]/gu,
    "",
  )
  const base = `${word.slice(0, 3)}${(source.fields.Year ?? "").replace(/\D/g, "").slice(-2)}` || "Src"
  const used = new Set([...taken].map((tag) => tag.toLowerCase()))
  if (!used.has(base.toLowerCase())) {
    return base
  }
  for (let n = 1; ; n += 1) {
    if (!used.has(`${base}${n}`.toLowerCase())) {
      return `${base}${n}`
    }
  }
}

export function placeholderTag(taken: Iterable<string>) {
  const used = new Set([...taken].map((tag) => tag.toLowerCase()))
  for (let n = 1; ; n += 1) {
    if (!used.has(`placeholder${n}`)) {
      return `Placeholder${n}`
    }
  }
}

// --- styles ------------------------------------------------------------------------------------------------------

export type BibStyleId = "APA" | "Chicago" | "Harvard" | "IEEE" | "MLA" | "Turabian"

export const BIB_STYLES: {
  id: BibStyleId
  label: string
  styleName: string
  selectedStyle: string
  version: string
}[] = [
  {
    id: "APA",
    label: "APA Sixth Edition",
    styleName: "APA",
    selectedStyle: "\\APASixthEditionOfficeOnline.xsl",
    version: "6",
  },
  {
    id: "Chicago",
    label: "Chicago Sixteenth Edition",
    styleName: "Chicago",
    selectedStyle: "\\CHICAGO.XSL",
    version: "16",
  },
  {
    id: "Harvard",
    label: "Harvard - Anglia 2008",
    styleName: "Harvard - Anglia",
    selectedStyle: "\\HarvardAnglia2008OfficeOnline.xsl",
    version: "2008",
  },
  { id: "IEEE", label: "IEEE 2006", styleName: "IEEE", selectedStyle: "\\IEEE2006OfficeOnline.xsl", version: "2006" },
  {
    id: "MLA",
    label: "MLA Seventh Edition",
    styleName: "MLA",
    selectedStyle: "\\MLASeventhEditionOfficeOnline.xsl",
    version: "7",
  },
  {
    id: "Turabian",
    label: "Turabian Sixth Edition",
    styleName: "Turabian",
    selectedStyle: "\\TURABIAN.XSL",
    version: "6",
  },
]

/** The style a document's Sources element names (its file or its name), APA when it names none the app has. */
export function styleFromWord(selectedStyle?: string, styleName?: string): BibStyleId {
  const file = (selectedStyle ?? "").toLowerCase().replace(/^.*[\\/]/, "")
  const found =
    BIB_STYLES.find((style) => style.selectedStyle.slice(1).toLowerCase() === file) ??
    BIB_STYLES.find((style) => style.styleName.toLowerCase() === (styleName ?? "").toLowerCase()) ??
    BIB_STYLES.find((style) => file.startsWith(style.id.toLowerCase()))
  return found?.id ?? "APA"
}

export const styleInfo = (id: BibStyleId) => BIB_STYLES.find((style) => style.id === id) ?? BIB_STYLES[0]!

// --- Word's XML --------------------------------------------------------------------------------------------------

function escape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function unescape(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
}

type El = { name: string; attrs: Record<string, string>; children: El[]; text: string; xml: string }

/** A small reader for the Sources part: element names without their prefix, text, and each element's own markup. */
function parseXml(xml: string): El | null {
  const root: El = { name: "#root", attrs: {}, children: [], text: "", xml: "" }
  const stack: { el: El; start: number }[] = [{ el: root, start: 0 }]
  const pattern = /<(\/?)([A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)([^>]*?)(\/?)>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|([^<]+)/g
  for (let match = pattern.exec(xml); match; match = pattern.exec(xml)) {
    const [whole, closing, , name, rest, selfClosing, text] = match
    const top = stack[stack.length - 1]!
    if (text !== undefined) {
      top.el.text += unescape(text)
      continue
    }
    if (!name) {
      continue
    }
    if (closing) {
      const done = stack.pop()
      if (done && stack.length > 0) {
        done.el.xml = xml.slice(done.start, match.index + whole.length)
      }
      continue
    }
    const attrs: Record<string, string> = {}
    for (const attr of (rest ?? "").matchAll(/([\w.:-]+)\s*=\s*"([^"]*)"/g)) {
      attrs[attr[1]!.replace(/^.*:/, "")] = unescape(attr[2]!)
    }
    const el: El = { name: name, attrs, children: [], text: "", xml: whole }
    top.el.children.push(el)
    if (!selfClosing) {
      stack.push({ el, start: match.index })
    }
  }
  return root.children[0] ?? null
}

const child = (el: El | undefined, name: string) => el?.children.find((item) => item.name === name)

function readNameList(el: El | undefined): NameList | undefined {
  if (!el) {
    return undefined
  }
  const corporate = child(el, "Corporate")?.text.trim()
  if (corporate) {
    return { people: [], corporate }
  }
  const people = (child(el, "NameList")?.children ?? [])
    .filter((item) => item.name === "Person")
    .map((person) => ({
      last: child(person, "Last")?.text.trim() ?? "",
      first: child(person, "First")?.text.trim() ?? "",
      middle: child(person, "Middle")?.text.trim() ?? "",
    }))
  return people.length > 0 ? { people } : undefined
}

export type SourcesPart = {
  sources: BibSource[]
  selectedStyle?: string
  styleName?: string
}

/** A Sources part (customXml item) as Word writes it; null when the XML is not one. */
export function readSourcesXml(xml: string): SourcesPart | null {
  const root = parseXml(xml)
  if (!root || root.name !== "Sources") {
    return null
  }
  const sources: BibSource[] = []
  for (const el of root.children.filter((item) => item.name === "Source")) {
    const source: BibSource = { tag: "", type: "", names: {}, fields: {} }
    for (const item of el.children) {
      if (item.name === "Tag") {
        source.tag = item.text.trim()
      } else if (item.name === "SourceType") {
        const type = item.text.trim()
        source.type = SOURCE_TYPES.some((entry) => entry.id === type) ? (type as SourceType) : "Misc"
      } else if (item.name === "Guid") {
        source.guid = item.text.trim()
      } else if (item.name === "Author") {
        for (const role of item.children) {
          const list = readNameList(role)
          if ((NAME_ROLES as readonly string[]).includes(role.name) && list) {
            source.names[role.name as NameRole] = list
          }
        }
      } else if (item.name === "RefOrder") {
        // Written again from the citations' order.
      } else if (item.children.length === 0) {
        source.fields[item.name] = item.text.trim()
      } else {
        ;(source.other ??= []).push(item.xml)
      }
    }
    if (source.tag) {
      sources.push(source)
    }
  }
  return { sources, selectedStyle: root.attrs.SelectedStyle, styleName: root.attrs.StyleName }
}

function nameListXml(role: string, list: NameList) {
  if (list.corporate) {
    return `<b:${role}><b:Corporate>${escape(list.corporate)}</b:Corporate></b:${role}>`
  }
  const people = list.people
    .map(
      (person) =>
        `<b:Person>${person.last ? `<b:Last>${escape(person.last)}</b:Last>` : ""}${
          person.first ? `<b:First>${escape(person.first)}</b:First>` : ""
        }${person.middle ? `<b:Middle>${escape(person.middle)}</b:Middle>` : ""}</b:Person>`,
    )
    .join("")
  return `<b:${role}><b:NameList>${people}</b:NameList></b:${role}>`
}

/** Word's Sources part: the document's sources with each one's place in the citation order (RefOrder). */
export function sourcesXml(sources: BibSource[], style: BibStyleId, order: string[] = []) {
  const info = styleInfo(style)
  const ranks = refOrders(sources, order)
  const body = sources
    .map((source) => {
      const names = NAME_ROLES.flatMap((role) => {
        const list = source.names[role]
        return list && (list.corporate || list.people.length > 0) ? [nameListXml(role, list)] : []
      })
      const fields = Object.entries(source.fields)
        .filter(([key, value]) => value.trim() && /^[A-Za-z]\w*$/.test(key))
        .map(([key, value]) => `<b:${key}>${escape(value)}</b:${key}>`)
      return [
        "<b:Source>",
        `<b:Tag>${escape(source.tag)}</b:Tag>`,
        source.type ? `<b:SourceType>${source.type}</b:SourceType>` : "",
        source.guid ? `<b:Guid>${escape(source.guid)}</b:Guid>` : "",
        names.length > 0 ? `<b:Author>${names.join("")}</b:Author>` : "",
        ...fields,
        ...(source.other ?? []),
        `<b:RefOrder>${ranks.get(source.tag) ?? 0}</b:RefOrder>`,
        "</b:Source>",
      ].join("")
    })
    .join("")
  return (
    `<?xml version="1.0" standalone="no"?><b:Sources xmlns:b="${BIBLIOGRAPHY_NS}" xmlns="${BIBLIOGRAPHY_NS}" ` +
    `SelectedStyle="${escape(info.selectedStyle)}" StyleName="${escape(info.styleName)}" Version="${info.version}">` +
    `${body}</b:Sources>`
  )
}

/** Each source's number: cited ones in the order first cited, then the rest as listed (Word's RefOrder). */
export function refOrders(sources: BibSource[], order: string[]) {
  const ranks = new Map<string, number>()
  const known = new Map(sources.map((source) => [source.tag.toLowerCase(), source.tag]))
  for (const tag of order) {
    const found = known.get(tag.toLowerCase())
    if (found && !ranks.has(found)) {
      ranks.set(found, ranks.size + 1)
    }
  }
  for (const source of sources) {
    if (!ranks.has(source.tag)) {
      ranks.set(source.tag, ranks.size + 1)
    }
  }
  return ranks
}

// --- the CITATION field ------------------------------------------------------------------------------------------

export type Citation = {
  tags: string[]
  pages?: string
  prefix?: string
  suffix?: string
  volume?: string
  noAuthor?: boolean
  noYear?: boolean
  noTitle?: boolean
  /** \l, the language id Word writes (1033). */
  lcid?: string
}

/** `CITATION Smi20 \l 1033 \p 12 \m Bro19` → its sources and switches. \m may repeat. */
export function parseCitation(instr: string): Citation | null {
  const tokens = [...instr.trim().matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2] ?? "")
  if ((tokens.shift() ?? "").toUpperCase() !== "CITATION") {
    return null
  }
  const out: Citation = { tags: [] }
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!
    const value = () => {
      const next = tokens[index + 1]
      if (next === undefined || next.startsWith("\\")) {
        return ""
      }
      index += 1
      return next
    }
    switch (token.toLowerCase()) {
      case "\\l":
        out.lcid = value()
        break
      case "\\p":
        out.pages = value()
        break
      case "\\f":
        out.prefix = value()
        break
      case "\\s":
        out.suffix = value()
        break
      case "\\v":
        out.volume = value()
        break
      case "\\m": {
        const tag = value()
        if (tag) {
          out.tags.push(tag)
        }
        break
      }
      case "\\n":
        out.noAuthor = true
        break
      case "\\y":
        out.noYear = true
        break
      case "\\t":
        out.noTitle = true
        break
      default:
        if (!token.startsWith("\\") && out.tags.length === 0) {
          out.tags.push(token)
        }
    }
  }
  return out.tags.length > 0 ? out : null
}

const quoteArg = (value: string) => (/[\s"]/.test(value) || !value ? `"${value.replace(/"/g, "")}"` : value)

/** A citation as Word writes its instruction: `CITATION Smi20 \p 12 \l 1033 \m Bro19`. */
export function citationInstruction(citation: Citation) {
  const [first, ...more] = citation.tags
  const parts = ["CITATION", first ?? ""]
  if (citation.pages) {
    parts.push("\\p", quoteArg(citation.pages))
  }
  if (citation.prefix) {
    parts.push("\\f", quoteArg(citation.prefix))
  }
  if (citation.suffix) {
    parts.push("\\s", quoteArg(citation.suffix))
  }
  if (citation.volume) {
    parts.push("\\v", quoteArg(citation.volume))
  }
  if (citation.noAuthor) {
    parts.push("\\n")
  }
  if (citation.noYear) {
    parts.push("\\y")
  }
  if (citation.noTitle) {
    parts.push("\\t")
  }
  parts.push("\\l", citation.lcid || "1033")
  for (const tag of more) {
    parts.push("\\m", tag)
  }
  return parts.join(" ")
}

// --- formatting --------------------------------------------------------------------------------------------------

/** A run of an entry; "\n" in its text is a line break (Word's w:br). */
export type TextPart = { text: string; italic?: boolean }
export type BibEntry = { tag: string; label?: string; parts: TextPart[] }

export const INVALID_SOURCE = "Invalid source specified."

const initial = (name: string) =>
  name
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => `${part[0]!.toUpperCase()}.`)
    .join(" ")
const initials = (person: Person) => [initial(person.first), initial(person.middle)].filter(Boolean).join(" ")
const fullFirst = (person: Person) => [person.first, person.middle].filter(Boolean).join(" ")

/** Joins with commas and a last separator: "A, B and C" / "A, B, & C" (`serial` keeps the comma before it). */
function series(items: string[], last: string, serial: boolean) {
  if (items.length <= 1) {
    return items[0] ?? ""
  }
  if (items.length === 2) {
    return `${items[0]}${serial ? "," : ""}${last}${items[1]}`
  }
  return `${items.slice(0, -1).join(", ")}${serial ? "," : ""}${last}${items[items.length - 1]}`
}

/** Ends a piece with a full stop unless it already ends with one. */
const stop = (text: string) => (/[.?!]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`)

type Context = { style: BibStyleId; sources: BibSource[]; numbers: Map<string, number> }

function findSource(sources: BibSource[], tag: string) {
  const lower = tag.toLowerCase()
  return sources.find((source) => source.tag.toLowerCase() === lower)
}

/**
 * Whether a cited author needs initials to tell them apart (APA's "Smith J. A., 2020"): another source's first author
 * shares the last name but not the first names.
 */
function ambiguous(person: Person, sources: BibSource[]) {
  return sources.some((source) => {
    const other = mainNames(source)?.people[0]
    return (
      other &&
      other.last.toLowerCase() === person.last.toLowerCase() &&
      fullFirst(other).toLowerCase() !== fullFirst(person).toLowerCase()
    )
  })
}

function citedAuthor(source: BibSource, context: Context) {
  const list = mainNames(source)
  if (list?.corporate) {
    return list.corporate
  }
  const people = list?.people ?? []
  const { style } = context
  if (people.length === 0) {
    return style === "Harvard" ? "Anon." : (source.fields.Title ?? "")
  }
  const lasts = people.map((person) => person.last)
  if (people.length === 1) {
    const person = people[0]!
    if (style !== "Harvard" && ambiguous(person, context.sources)) {
      return style === "APA" ? `${person.last} ${initials(person)}` : `${initials(person)} ${person.last}`
    }
    return person.last
  }
  switch (style) {
    case "APA":
      return people.length >= 6 ? `${lasts[0]} et al.` : series(lasts, ", & ", false).replace(/^([^,]+), & /, "$1 & ")
    case "Harvard":
      return people.length === 2 ? `${lasts[0]} & ${lasts[1]}` : `${lasts[0]}, et al.`
    default:
      return people.length >= 4 ? `${lasts[0]}, et al.` : series(lasts, " and ", false)
  }
}

const pagesLabel = (pages: string) => (/[-–,]/.test(pages) ? `pp. ${pages}` : `p. ${pages}`)

/** One source's part of a citation, without the brackets. */
function citationPart(source: BibSource, citation: Citation, context: Context) {
  const { style } = context
  const author = citation.noAuthor ? "" : citedAuthor(source, context)
  const noAuthor = !mainNames(source)
  // A source without author is cited by its title; \t suppresses that too.
  const who = noAuthor && citation.noTitle && style !== "Harvard" ? "" : author
  const year = citation.noYear || style === "MLA" ? "" : (source.fields.Year ?? "")
  const volume = citation.volume ? `vol. ${citation.volume}` : ""
  if (style === "MLA") {
    return [who, volume, citation.pages ?? ""].filter(Boolean).join(" ")
  }
  if (style === "Chicago" || style === "Turabian") {
    const head = [who, year].filter(Boolean).join(" ")
    return [head, volume, citation.pages ?? ""].filter(Boolean).join(", ")
  }
  return [who, year, volume, citation.pages ? pagesLabel(citation.pages) : ""].filter(Boolean).join(", ")
}

/** What a CITATION field shows in a style, as Word shows it. */
export function formatCitation(instr: string | Citation, context: Context) {
  const citation = typeof instr === "string" ? parseCitation(instr) : instr
  if (!citation) {
    return INVALID_SOURCE
  }
  const found = citation.tags.map((tag) => findSource(context.sources, tag) ?? null)
  if (context.style === "IEEE") {
    if (found.some((source) => !source || isPlaceholder(source))) {
      return INVALID_SOURCE
    }
    const numbers = found.map((source) => context.numbers.get(source!.tag) ?? 0)
    const pages = citation.pages ? `, ${pagesLabel(citation.pages)}` : ""
    return `[${numbers.join(", ")}${pages}]`
  }
  if (found.some((source) => !source)) {
    return INVALID_SOURCE
  }
  const parts = found.map((source, index) =>
    isPlaceholder(source!) ? source!.tag : citationPart(source!, index === 0 ? citation : { tags: [] }, context),
  )
  const joiner = context.style === "Chicago" || context.style === "Turabian" ? ", " : "; "
  const prefix = citation.prefix ?? ""
  const suffix = citation.suffix ?? ""
  return `(${prefix}${parts.join(joiner)}${suffix})`
}

// --- bibliography entries ----------------------------------------------------------------------------------------

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/** Month text as typed ("March", "3", "Mar"). */
function monthName(value: string | undefined) {
  const text = (value ?? "").trim()
  if (/^\d+$/.test(text)) {
    return MONTHS[Number(text) - 1] ?? text
  }
  return MONTHS.find((month) => month.toLowerCase().startsWith(text.toLowerCase()) && text.length >= 3) ?? text
}

/** "March 5, 2021" (US) or "5 March 2021" (day first), leaving out what is missing. */
function dateText(year?: string, month?: string, day?: string, dayFirst = false) {
  const m = monthName(month)
  if (dayFirst) {
    return [day, m, year].filter(Boolean).join(" ")
  }
  const monthDay = [m, day].filter(Boolean).join(" ")
  return [monthDay, year].filter(Boolean).join(", ")
}

/** Builds an entry piece by piece: plain text and italic runs, merged when adjacent and alike. */
class Line {
  parts: TextPart[] = []
  add(text: string | undefined, italic = false) {
    if (!text) {
      return this
    }
    const last = this.parts[this.parts.length - 1]
    if (last && Boolean(last.italic) === italic) {
      last.text += text
    } else {
      this.parts.push(italic ? { text, italic: true } : { text })
    }
    return this
  }
  get text() {
    return this.parts.map((part) => part.text).join("")
  }
}

function listedNames(list: NameList | undefined, style: BibStyleId, role: "lead" | "editor" = "lead") {
  if (!list) {
    return ""
  }
  if (list.corporate) {
    return list.corporate
  }
  const people = list.people
  if (people.length === 0) {
    return ""
  }
  if (role === "editor") {
    // "A. White" (APA, Harvard) or "Ann White"
    return series(
      people.map((person) =>
        style === "APA" || style === "Harvard" || style === "IEEE"
          ? `${initials(person)} ${person.last}`
          : `${fullFirst(person)} ${person.last}`,
      ),
      " and ",
      false,
    )
  }
  switch (style) {
    case "APA": {
      const names = people.map((person) => [person.last, initials(person)].filter(Boolean).join(", "))
      return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`
    }
    case "Harvard": {
      const names = people.map((person) => [person.last, initials(person)].filter(Boolean).join(", "))
      return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`
    }
    case "IEEE":
      return series(
        people.map((person) => [initials(person), person.last].filter(Boolean).join(" ")),
        " and ",
        false,
      )
    default: {
      const [first, ...rest] = people
      const names = [
        [first!.last, fullFirst(first!)].filter(Boolean).join(", "),
        ...rest.map((person) => [fullFirst(person), person.last].filter(Boolean).join(" ")),
      ]
      return series(names, " and ", style === "Chicago" || style === "Turabian")
    }
  }
}

const where = (city?: string, publisher?: string) => [city, publisher].filter(Boolean).join(": ")

/** The publisher-like field of a type (production company, institution, distributor…). */
function publisherOf(source: BibSource) {
  const f = source.fields
  return f.Publisher || f.ProductionCompany || f.Institution || f.Distributor || f.Theater || f.Court || ""
}

/** The container a part sits in: a book, journal, periodical, proceedings or web site. */
function containerOf(source: BibSource) {
  const f = source.fields
  return f.BookTitle || f.JournalName || f.PeriodicalTitle || f.ConferenceName || f.InternetSiteTitle || ""
}

const isPart = (type: BibSource["type"]) =>
  type === "BookSection" ||
  type === "JournalArticle" ||
  type === "ArticleInAPeriodical" ||
  type === "ConferenceProceedings"
const isWeb = (type: BibSource["type"]) => type === "InternetSite" || type === "DocumentFromInternetSite"

function apaEntry(source: BibSource) {
  const f = source.fields
  const line = new Line()
  const names = listedNames(mainNames(source), "APA")
  const date =
    isWeb(source.type) || source.type === "ArticleInAPeriodical"
      ? [f.Year, dateText(undefined, f.Month, f.Day)].filter(Boolean).join(", ")
      : (f.Year ?? "")
  const title = f.Title ?? ""
  const edition = f.Edition ? ` (${f.Edition} ed.)` : ""
  if (names) {
    line.add(`${stop(names)} (${date || "n.d."}). `)
  } else if (title && !isPart(source.type)) {
    line.add(edition ? title : stop(title), true).add(`${edition ? `${edition}.` : ""} (${date || "n.d."}).`)
  }
  const place = where(f.City, publisherOf(source))
  if (source.type === "JournalArticle" || source.type === "ArticleInAPeriodical") {
    line.add(`${stop(title)} `)
    const volume = f.Volume ? `, ${f.Volume}` : ""
    line.add(`${containerOf(source)}${volume}`, true)
    line.add(`${f.Issue ? `(${f.Issue})` : ""}${f.Pages ? `, ${f.Pages}` : ""}.`)
  } else if (source.type === "BookSection") {
    const editors = listedNames(source.names.Editor, "APA", "editor")
    line.add(`${stop(title)} In ${editors ? `${editors} (Ed.), ` : ""}`)
    line.add(f.BookTitle, true)
    line.add(`${f.Pages ? ` (pp. ${f.Pages})` : ""}.${place ? ` ${place}.` : ""}`)
  } else if (source.type === "ConferenceProceedings") {
    line.add(`${stop(title)} `)
    line.add(f.ConferenceName, true)
    line.add(`${f.Pages ? ` (pp. ${f.Pages})` : ""}.${place ? ` ${place}.` : ""}`)
  } else if (isWeb(source.type)) {
    if (names) {
      line.add(title, true)
    }
    const accessed = dateText(f.YearAccessed, f.MonthAccessed, f.DayAccessed)
    const site = f.InternetSiteTitle
    if (f.URL) {
      line.add(`. Retrieved ${accessed ? `${accessed}, ` : ""}from ${site ? `${site}: ` : ""}${f.URL}`)
    } else {
      line.add(".")
    }
  } else {
    if (names) {
      line.add(edition ? title : stop(title), true)
      if (edition) {
        line.add(`${edition}.`)
      }
    }
    line.add(place ? ` ${place}.` : "")
  }
  return line
}

function mlaEntry(source: BibSource) {
  const f = source.fields
  const line = new Line()
  const names = listedNames(mainNames(source), "MLA")
  if (names) {
    line.add(`${stop(names)} `)
  }
  const title = f.Title ?? ""
  const pubYear = [where(f.City, publisherOf(source)), f.Year].filter(Boolean).join(", ")
  if (source.type === "JournalArticle" || source.type === "ArticleInAPeriodical") {
    line.add(`"${stop(title)}" `)
    line.add(containerOf(source), true)
    const number = [f.Volume, f.Issue].filter(Boolean).join(".")
    line.add(`${number ? ` ${number}` : ""}${f.Year ? ` (${f.Year})` : ""}${f.Pages ? `: ${f.Pages}` : ""}.`)
  } else if (source.type === "BookSection" || source.type === "ConferenceProceedings") {
    line.add(`"${stop(title)}" `)
    line.add(containerOf(source), true)
    const editors = listedNames(source.names.Editor, "MLA", "editor")
    line.add(`.${editors ? ` Ed. ${editors}.` : ""}${pubYear ? ` ${pubYear}.` : ""}${f.Pages ? ` ${f.Pages}.` : ""}`)
  } else if (isWeb(source.type)) {
    line.add(title, true)
    const published = dateText(f.Year, f.Month, f.Day, true)
    const accessed = dateText(f.YearAccessed, f.MonthAccessed, f.DayAccessed, true)
    line.add(`.${published ? ` ${published}.` : ""}${accessed ? ` ${accessed}.` : ""}${f.URL ? ` <${f.URL}>.` : ""}`)
  } else {
    line.add(title, true)
    const kind = f.ThesisType ? ` ${stop(f.ThesisType)}` : ""
    line.add(`.${kind}${f.Edition ? ` ${f.Edition}.` : ""}${pubYear ? ` ${pubYear}.` : ""}`)
  }
  return line
}

function chicagoEntry(source: BibSource, turabian: boolean) {
  const f = source.fields
  const line = new Line()
  const names = listedNames(mainNames(source), turabian ? "Turabian" : "Chicago")
  const style = turabian ? "Turabian" : "Chicago"
  if (names) {
    line.add(`${stop(names)} `)
  }
  if (!turabian && f.Year) {
    line.add(`${f.Year}. `)
  }
  const title = f.Title ?? ""
  const place = where(f.City, publisherOf(source))
  const tail = (text: string) => (turabian && f.Year ? [text, f.Year].filter(Boolean).join(", ") : text)
  if (source.type === "JournalArticle" || source.type === "ArticleInAPeriodical") {
    line.add(`"${stop(title)}" `)
    line.add(containerOf(source), true)
    if (turabian) {
      line.add(`${f.Volume ? ` ${f.Volume}` : ""}${f.Issue ? `, no. ${f.Issue}` : ""}${f.Year ? ` (${f.Year})` : ""}`)
    } else {
      line.add(`${f.Volume ? ` ${f.Volume}` : ""}${f.Issue ? ` (${f.Issue})` : ""}`)
    }
    line.add(`${f.Pages ? `: ${f.Pages}` : ""}.`)
  } else if (source.type === "BookSection") {
    const editors = listedNames(source.names.Editor, style, "editor")
    line.add(`"${stop(title)}" In `)
    line.add(f.BookTitle, true)
    line.add(
      `${editors ? `, edited by ${editors}` : ""}${f.Pages ? `, ${f.Pages}` : ""}.${place ? ` ${stop(tail(place))}` : ""}`,
    )
  } else if (source.type === "ConferenceProceedings") {
    line.add(`"${stop(title)}" `)
    line.add(f.ConferenceName, true)
    line.add(`.${place ? ` ${stop(tail(place))}` : ""}${f.Pages ? ` ${f.Pages}.` : ""}`)
  } else if (isWeb(source.type)) {
    line.add(title, true)
    const accessed = dateText(f.YearAccessed, f.MonthAccessed, f.DayAccessed)
    if (turabian) {
      const published = dateText(f.Year, f.Month, f.Day)
      line.add(
        `.${published ? ` ${published}.` : ""}${f.URL ? ` ${f.URL}` : ""}${accessed ? ` (accessed ${accessed})` : ""}.`,
      )
    } else {
      const published = dateText(undefined, f.Month, f.Day)
      line.add(
        `.${published ? ` ${published}.` : ""}${accessed ? ` Accessed ${accessed}.` : ""}${f.URL ? ` ${f.URL}.` : ""}`,
      )
    }
  } else {
    line.add(title, true)
    const kind = f.ThesisType ? ` ${f.ThesisType},` : ""
    const edition = f.Edition ? ` ${f.Edition}.` : ""
    const rest = tail(place)
    line.add(`.${kind}${edition}${rest ? ` ${stop(rest)}` : ""}`)
  }
  return line
}

function harvardEntry(source: BibSource) {
  const f = source.fields
  const line = new Line()
  const names = listedNames(mainNames(source), "Harvard") || "Anon."
  line.add(`${names}, ${f.Year || "n.d."}. `)
  const title = f.Title ?? ""
  const place = where(f.City, publisherOf(source))
  if (source.type === "JournalArticle" || source.type === "ArticleInAPeriodical") {
    line.add(`${stop(title)} `)
    line.add(`${containerOf(source)},`, true)
    line.add(`${f.Volume ? ` ${f.Volume}` : ""}${f.Issue ? `(${f.Issue})` : ""}${f.Pages ? `, pp. ${f.Pages}` : ""}.`)
  } else if (source.type === "BookSection") {
    const editors = listedNames(source.names.Editor, "Harvard", "editor")
    line.add(`${stop(title)} In: ${editors ? `${editors}, ed. ` : ""}`)
    line.add(stop(f.BookTitle ?? ""), true)
    line.add(`${place ? ` ${place}` : ""}${f.Pages ? `, pp. ${f.Pages}` : ""}.`)
  } else if (source.type === "ConferenceProceedings") {
    line.add(`${stop(title)}${f.City ? ` ${f.City}` : ""}${publisherOf(source) ? `, ${publisherOf(source)}` : ""}`)
    line.add(`${f.Pages ? `, pp. ${f.Pages}` : ""}.`)
  } else if (isWeb(source.type)) {
    line.add(stop(title), true)
    const accessed = dateText(f.YearAccessed, f.MonthAccessed, f.DayAccessed, true)
    // Word breaks the line before "Available at" and before "[Accessed".
    line.add(`${f.URL ? ` [Online] \nAvailable at: ${f.URL}` : ""}${accessed ? `\n[Accessed ${accessed}]` : ""}.`)
  } else if (source.type === "Report") {
    line.add(`${title},`, true)
    line.add(place ? ` ${place}.` : "")
  } else {
    line.add(stop(title), true)
    line.add(`${f.Edition ? ` ${f.Edition} ed.` : ""}${place ? ` ${place}.` : ""}`)
  }
  return line
}

function ieeeEntry(source: BibSource) {
  const f = source.fields
  const line = new Line()
  const names = listedNames(mainNames(source), "IEEE")
  if (names) {
    line.add(`${names}, `)
  }
  const title = f.Title ?? ""
  if (source.type === "JournalArticle" || source.type === "ArticleInAPeriodical") {
    line.add(`"${title}," `)
    line.add(`${containerOf(source)},`, true)
    const bits = [
      f.Volume ? `vol. ${f.Volume}` : "",
      f.Issue ? `no. ${f.Issue}` : "",
      f.Pages ? `pp. ${f.Pages}` : "",
      f.Year,
    ]
    line.add(` ${bits.filter(Boolean).join(", ")}.`)
  } else if (source.type === "BookSection") {
    const editors = listedNames(source.names.Editor, "IEEE", "editor")
    line.add(`"${title}," in `)
    line.add(f.BookTitle, true)
    const bits = [
      editors ? `${editors}, Ed.` : "",
      f.City,
      publisherOf(source),
      f.Year,
      f.Pages ? `pp. ${f.Pages}` : "",
    ]
    line.add(`, ${bits.filter(Boolean).join(", ")}.`)
  } else if (source.type === "ConferenceProceedings") {
    line.add(`"${title}," in `)
    line.add(f.ConferenceName, true)
    line.add(`, ${[f.City, f.Year].filter(Boolean).join(", ")}.`)
  } else if (source.type === "Report") {
    line.add(`"${title}," ${[publisherOf(source), f.City, f.Year].filter(Boolean).join(", ")}.`)
  } else if (isWeb(source.type)) {
    const published = dateText(f.Year, f.Month, f.Day, true)
    const accessed = dateText(f.YearAccessed, f.MonthAccessed, f.DayAccessed, true)
    line.add(`"${title},"${published ? ` ${published}.` : ""}${f.URL ? ` [Online]. Available: ${f.URL}.` : ""}`)
    line.add(accessed ? ` [Accessed ${accessed}].` : "")
  } else {
    line.add(title, true)
    const bits = [f.Edition ? `${f.Edition} ed.` : "", [f.City, publisherOf(source)].filter(Boolean).join(": "), f.Year]
    line.add(`, ${bits.filter(Boolean).join(", ")}.`)
  }
  return line
}

export function entryFor(source: BibSource, style: BibStyleId): TextPart[] {
  switch (style) {
    case "MLA":
      return mlaEntry(source).parts
    case "Chicago":
      return chicagoEntry(source, false).parts
    case "Turabian":
      return chicagoEntry(source, true).parts
    case "Harvard":
      return harvardEntry(source).parts
    case "IEEE":
      return ieeeEntry(source).parts
    default:
      return apaEntry(source).parts
  }
}

const plain = (parts: TextPart[]) => parts.map((part) => part.text).join("")

/**
 * The bibliography's entries: every source in the document's list but placeholders, in the style's order —
 * alphabetical by the entry's text, or for IEEE by number (cited first, in the order cited).
 */
export function bibliographyEntries(sources: BibSource[], style: BibStyleId, order: string[] = []): BibEntry[] {
  const real = sources.filter((source) => !isPlaceholder(source))
  if (style === "IEEE") {
    const numbers = refOrders(real, order)
    return [...real]
      .sort((a, b) => (numbers.get(a.tag) ?? 0) - (numbers.get(b.tag) ?? 0))
      .map((source) => ({ tag: source.tag, label: `[${numbers.get(source.tag)}]`, parts: entryFor(source, style) }))
  }
  // Word sorts by the authors' names run together ("Smith John A." before "Smith John Jones Mary"), then the year and
  // title; a source without author by its title (Harvard: as "Anon.").
  const key = (source: BibSource, parts: TextPart[]) => {
    const names = mainNames(source)
    const who = names
      ? names.corporate ||
        names.people.map((person) => [person.last, person.first, person.middle].filter(Boolean).join(" ")).join(" ")
      : style === "Harvard"
        ? "Anon."
        : (source.fields.Title ?? "")
    return [who, source.fields.Year ?? "", source.fields.Title ?? "", plain(parts)].join("").toLowerCase()
  }
  return real
    .map((source) => {
      const parts = entryFor(source, style)
      return { entry: { tag: source.tag, parts }, key: key(source, parts) }
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((item) => item.entry)
}

/** The context a citation is formatted in: the document's sources, its style, and IEEE's numbers. */
export function citationContext(sources: BibSource[], style: BibStyleId, order: string[] = []) {
  const real = sources.filter((source) => !isPlaceholder(source))
  return { style, sources, numbers: refOrders(real, order) }
}

export const NO_SOURCES = "There are no sources in the current document."
