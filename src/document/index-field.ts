import { parseInstruction } from "@/document/field-instructions"
import { readLeader, type TocLeader } from "@/document/toc"

/**
 * Word's index, shared by the editor and the .docx converter: XE fields mark the entries ({ XE "Main:Sub" \b }), and
 * an INDEX field lists them with their pages ({ INDEX \e "<tab>" \c "2" }). The index keeps the result it was last
 * updated to, as Word's does until F9.
 */

/** A page number of an entry, or a cross-reference ("See Other") in its place. */
export type IndexPage = { text: string; bold?: boolean; italic?: boolean; see?: boolean }

export type IndexEntry = { main: string; sub?: string; pages: IndexPage[] }

/** What one XE field says. */
export type XeEntry = {
  main: string
  sub?: string
  bold?: boolean
  italic?: boolean
  /** Cross-reference text (\t "See Other") instead of a page number. */
  see?: string
  /** A bookmark whose pages make a range (\r). */
  range?: string
}

/** What References > Insert Index writes with Word's defaults: two columns, indented, page numbers after a comma. */
export const DEFAULT_INDEX_INSTRUCTION = 'INDEX \\c "2" \\z "1033"'

export type IndexOptions = {
  /** Subentries on the main entry's line ("Main: Sub, 3; Other, 5"), \r; else indented below it. */
  runIn: boolean
  columns: number
  /** Page numbers at the right margin after a tab leader (\e "<tab>"). */
  rightAlign: boolean
  leader: TocLeader
}

export function parseXe(instr: string): XeEntry | null {
  const parsed = parseInstruction(instr)
  if (parsed.kind !== "XE" || !parsed.argument.trim()) {
    return null
  }
  const [main = "", ...rest] = parsed.argument.split(":")
  const entry: XeEntry = { main: main.trim() }
  const sub = rest.join(":").trim()
  if (sub) {
    entry.sub = sub
  }
  if (parsed.switches.has("b")) {
    entry.bold = true
  }
  if (parsed.switches.has("i")) {
    entry.italic = true
  }
  const see = parsed.switches.get("t")
  if (see) {
    entry.see = see
  }
  const range = parsed.switches.get("r")
  if (range) {
    entry.range = range
  }
  return entry.main ? entry : null
}

const quote = (text: string) => text.replace(/"/g, "'")

export function xeInstruction(entry: XeEntry): string {
  const text = entry.sub ? `${quote(entry.main)}:${quote(entry.sub)}` : quote(entry.main)
  return [
    `XE "${text}"`,
    entry.see ? `\\t "${quote(entry.see)}"` : "",
    !entry.see && entry.range ? `\\r ${entry.range}` : "",
    entry.bold ? "\\b" : "",
    entry.italic ? "\\i" : "",
  ]
    .filter(Boolean)
    .join(" ")
}

export function indexOptions(attrs: { instruction?: unknown; leader?: unknown }): IndexOptions {
  const parsed = parseInstruction(String(attrs.instruction || DEFAULT_INDEX_INSTRUCTION))
  const columns = Number(parsed.switches.get("c") ?? 1)
  return {
    runIn: parsed.switches.has("r"),
    columns: Number.isFinite(columns) ? Math.min(4, Math.max(1, Math.round(columns))) : 1,
    rightAlign: parsed.switches.get("e") === "\t",
    leader: readLeader(attrs.leader),
  }
}

/** The INDEX instruction for the options, keeping the switches the dialog does not set (\z, \h, \b, …). */
export function indexInstruction(base: string, options: Omit<IndexOptions, "leader">) {
  const parsed = parseInstruction(base || DEFAULT_INDEX_INSTRUCTION)
  const kept = [...parsed.switches].filter(([name]) => !["r", "c", "e"].includes(name))
  const parts = ["INDEX"]
  if (options.runIn) {
    parts.push("\\r")
  }
  if (options.rightAlign && !options.runIn) {
    parts.push('\\e "\t"')
  }
  if (options.columns > 1) {
    parts.push(`\\c "${options.columns}"`)
  }
  for (const [name, value] of kept) {
    parts.push(value ? `\\${name} "${value}"` : `\\${name}`)
  }
  return parts.join(" ")
}

export function readIndexEntries(value: unknown): IndexEntry[] {
  let parsed = value
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(parsed)) {
    return []
  }
  return parsed.flatMap((item) => {
    const record = item as Partial<IndexEntry> | null
    if (!record || typeof record.main !== "string") {
      return []
    }
    const pages = Array.isArray(record.pages)
      ? record.pages.filter((page): page is IndexPage => typeof page?.text === "string")
      : []
    return [{ main: record.main, ...(record.sub ? { sub: String(record.sub) } : {}), pages }]
  })
}

const compare = (left: string, right: string) => left.localeCompare(right, undefined, { sensitivity: "base" })

/**
 * The entries an index lists from the marked places, in order: one per main entry and subentry, sorted as Word sorts
 * (case and accents ignored), each with its pages in document order, a page once per formatting.
 */
export function indexEntries(marks: { entry: XeEntry; page: string; endPage?: string }[]): IndexEntry[] {
  const byKey = new Map<string, IndexEntry>()
  for (const { entry, page, endPage } of marks) {
    const key = `${entry.main.toLowerCase()}\u0000${(entry.sub ?? "").toLowerCase()}`
    const found = byKey.get(key) ?? { main: entry.main, ...(entry.sub ? { sub: entry.sub } : {}), pages: [] }
    byKey.set(key, found)
    const item: IndexPage = entry.see
      ? { text: entry.see, see: true }
      : { text: endPage && endPage !== page ? `${page}–${endPage}` : page }
    if (entry.bold && !entry.see) {
      item.bold = true
    }
    if (entry.italic && !entry.see) {
      item.italic = true
    }
    const same = found.pages.some(
      (other) => other.text === item.text && !!other.bold === !!item.bold && !!other.italic === !!item.italic,
    )
    if (!same) {
      found.pages.push(item)
    }
  }
  // Main entries that only have subentries still get a line of their own.
  for (const entry of [...byKey.values()]) {
    const key = `${entry.main.toLowerCase()}\u0000`
    if (entry.sub && !byKey.has(key)) {
      byKey.set(key, { main: entry.main, pages: [] })
    }
  }
  return [...byKey.values()].sort(
    (left, right) =>
      compare(left.main, right.main) ||
      (left.sub ? 1 : 0) - (right.sub ? 1 : 0) ||
      compare(left.sub ?? "", right.sub ?? ""),
  )
}

/** One line of the index as printed: the entry's text and its pages, indented one level for a subentry. */
export type IndexLine = { level: 1 | 2; parts: { text: string; pages?: IndexPage[] }[] }

/** The lines the index shows: indented (a line per subentry) or run-in (subentries on their main entry's line). */
export function indexLines(entries: IndexEntry[], options: Pick<IndexOptions, "runIn">): IndexLine[] {
  const lines: IndexLine[] = []
  for (const entry of entries) {
    if (!entry.sub) {
      lines.push({ level: 1, parts: [{ text: entry.main, pages: entry.pages }] })
      continue
    }
    const main = lines[lines.length - 1]
    if (options.runIn && main && main.parts[0]?.text === entry.main) {
      main.parts.push({ text: entry.sub, pages: entry.pages })
    } else {
      lines.push({ level: 2, parts: [{ text: entry.sub, pages: entry.pages }] })
    }
  }
  return lines
}

/** A line as text, the way Word prints it: "Main, 3, 5", "Main\t3, 5" right-aligned, "Main: Sub, 3; Other, 5". */
export function indexLineText(line: IndexLine, options: Pick<IndexOptions, "rightAlign" | "runIn">) {
  const pages = (part: IndexLine["parts"][number]) => {
    const list = (part.pages ?? []).map((page) => page.text)
    if (list.length === 0) {
      return ""
    }
    const see = part.pages?.[0]?.see
    return `${see ? ". " : options.rightAlign && !options.runIn ? "\t" : ", "}${list.join(", ")}`
  }
  const [first, ...rest] = line.parts
  if (!first) {
    return ""
  }
  if (rest.length === 0) {
    return `${first.text}${pages(first)}`
  }
  return `${first.text}${pages(first)}: ${rest.map((part) => `${part.text}${pages(part)}`).join("; ")}`
}
