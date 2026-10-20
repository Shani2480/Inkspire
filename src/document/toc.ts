/** Table of contents data shared by the editor node and the Word converter. */

export type TocLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export type TocEntry = {
  level: TocLevel
  text: string
  /** The page number as shown; Word's cached result may be roman or empty. */
  page: string
  /** The bookmark on the heading the entry links to. */
  anchor?: string
}

/** What Word's References > Table of Contents > Automatic Table inserts. */
export const DEFAULT_TOC_INSTRUCTION = 'TOC \\o "1-3" \\h \\z \\u'
export const DEFAULT_TOC_TITLE = "Contents"

export const TOC_LEADERS = ["dot", "hyphen", "underscore", "none"] as const
export type TocLeader = (typeof TOC_LEADERS)[number]

/** What References > Table of Contents > Custom Table of Contents sets. */
export type TocOptions = {
  levels: TocLevel
  /** Entries link to their headings (\h). */
  hyperlinks: boolean
  /** Page numbers are shown (no \n). */
  pageNumbers: boolean
  /** Page numbers sit at the right margin after a leader; otherwise they follow the entry's text. */
  rightAlign: boolean
  leader: TocLeader
}

/** A block or inline as the editor stores it: a ProseMirror node's name and attributes, or document JSON. */
export type TocNodeLike = { type: string; attrs?: Record<string, unknown> }

/** The deepest heading level the TOC instruction shows (\o "1-n"); 3 when it names no outline range. */
export function tocLevels(instruction: string): TocLevel {
  const range = /\\o\s+"?\s*(\d)\s*-\s*(\d)/.exec(instruction)
  const deepest = range ? Number(range[2]) : 3
  return clampLevel(deepest)
}

export function tocOptions(attrs: { instruction?: unknown; leader?: unknown; rightAlign?: unknown }): TocOptions {
  const instruction = String(attrs.instruction || DEFAULT_TOC_INSTRUCTION)
  return {
    levels: tocLevels(instruction),
    hyperlinks: hasSwitch(instruction, "h"),
    pageNumbers: !hasSwitch(instruction, "n"),
    rightAlign: attrs.rightAlign !== false,
    leader: readLeader(attrs.leader),
  }
}

/**
 * The TOC instruction with the options' levels, links, and page numbers, keeping the other switches it has
 * (\z, \u, \t, …) as written.
 */
export function tocInstruction(base: string, options: Pick<TocOptions, "levels" | "hyperlinks" | "pageNumbers">) {
  let instruction = (base || DEFAULT_TOC_INSTRUCTION).trim()
  const range = /\\o(\s+"?\s*(\d)\s*-\s*\d\s*"?)?/.exec(instruction)
  const outline = `\\o "${Math.min(Number(range?.[2] ?? 1), options.levels)}-${options.levels}"`
  instruction = range ? instruction.replace(range[0], outline) : `${instruction} ${outline}`
  instruction = withoutSwitch(withoutSwitch(instruction, "h"), "n")
  if (options.hyperlinks) {
    instruction += " \\h"
  }
  if (!options.pageNumbers) {
    instruction += " \\n"
  }
  return instruction.replace(/\s+/g, " ")
}

export function readLeader(value: unknown): TocLeader {
  return TOC_LEADERS.includes(value as TocLeader) ? (value as TocLeader) : "dot"
}

/** A switch of the instruction outside its quoted arguments. */
function hasSwitch(instruction: string, name: string) {
  return new RegExp(`\\\\${name}(?![a-z])`, "i").test(instruction.replace(/"[^"]*"/g, ""))
}

/** The instruction without a switch and the quoted argument it takes. */
function withoutSwitch(instruction: string, name: string) {
  return instruction.replace(new RegExp(`\\s*\\\\${name}(?![a-z])(\\s+"[^"]*")?`, "gi"), "")
}

/** A paragraph style as far as the table of contents needs it: its id and the style it is based on. */
export type TocStyleLike = { id: string; basedOn?: string }

/**
 * The TOC level of a heading, of a paragraph given an outline level, or of a paragraph whose style is based on a
 * heading style (Heading 1 to 9, through any number of styles); null when it is body text.
 */
export function tocLevelOf(node: TocNodeLike, styles: readonly TocStyleLike[] = []): TocLevel | null {
  if (node.type === "heading") {
    const level = Number(node.attrs?.level)
    return level >= 1 && level <= 9 ? clampLevel(level) : null
  }
  if (node.type === "paragraph") {
    const outline = Number(node.attrs?.outlineLevel || 0)
    if (outline >= 1 && outline <= 9) {
      return clampLevel(outline)
    }
    const named = typeof node.attrs?.namedStyle === "string" ? node.attrs.namedStyle : ""
    return named ? styleHeadingLevel(named, styles) : null
  }
  return null
}

/** The heading level a style is, or is based on. */
export function styleHeadingLevel(id: string, styles: readonly TocStyleLike[]): TocLevel | null {
  const seen = new Set<string>()
  for (let current: string | undefined = id; current && !seen.has(current);) {
    seen.add(current)
    const heading = /^heading-([1-9])$/.exec(current)?.[1]
    if (heading) {
      return clampLevel(Number(heading))
    }
    current = styles.find((style) => style.id === current)?.basedOn
  }
  return null
}

/** The heading's own bookmark (a _Toc one first) among its inline children, which a TOC entry links to. */
export function headingBookmark(children: TocNodeLike[]): string | undefined {
  const names: string[] = []
  for (const child of children) {
    if (child.type !== "wordInline" || child.attrs?.role !== "bookmark") {
      continue
    }
    for (const item of parseArray(child.attrs?.payload)) {
      const record = item as Record<string, unknown> | null
      if (record?.kind === "bookmarkStart" && typeof record.name === "string" && record.name) {
        names.push(record.name)
      }
    }
  }
  return names.find((name) => name.startsWith("_Toc")) ?? names[0]
}

export function readTocEntries(value: unknown): TocEntry[] {
  const parsed = typeof value === "string" ? parseArray(value) : value
  if (!Array.isArray(parsed)) {
    return []
  }
  return parsed.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return []
    }
    const record = item as Record<string, unknown>
    const level = Number(record.level)
    if (!(level >= 1 && level <= 9) || typeof record.text !== "string") {
      return []
    }
    const page = typeof record.page === "number" || typeof record.page === "string" ? String(record.page) : ""
    const entry: TocEntry = { level: clampLevel(level), text: record.text.slice(0, 500), page: page.slice(0, 20) }
    if (typeof record.anchor === "string" && record.anchor) {
      entry.anchor = record.anchor
    }
    return [entry]
  })
}

/** Identifies what a table of contents shows, so an untouched one can be saved exactly as it was read. */
export function tocSignature(attrs: {
  entries: unknown
  instruction: unknown
  title: unknown
  leader?: unknown
  rightAlign?: unknown
}) {
  return JSON.stringify([
    readTocEntries(attrs.entries),
    String(attrs.instruction ?? ""),
    String(attrs.title ?? ""),
    readLeader(attrs.leader),
    attrs.rightAlign !== false,
  ])
}

function clampLevel(level: number): TocLevel {
  return Math.min(9, Math.max(1, Math.round(level))) as TocLevel
}

function parseArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value
  }
  if (typeof value !== "string" || !value) {
    return []
  }
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
