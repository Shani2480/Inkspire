import {
  DEFAULT_TOC_INSTRUCTION,
  readTocEntries,
  tocOptions,
  tocSignature,
  type TocEntry,
  type TocLeader,
  type TocLevel,
} from "@/document/toc"
import {
  paragraphsIn,
  type Block,
  type Inline,
  type Paragraph,
  type RawMarkup,
  type Run,
  type RunContent,
  type TabStop,
  type WordDocument,
} from "@/document/docx/model"

/** The editor's table of contents attributes, read from a TOC field in a Word document. */
export type TocRead = {
  /** The index after the last block the table of contents takes. */
  end: number
  entries: TocEntry[]
  instruction: string
  title: string
  leader: TocLeader
  rightAlign: boolean
  /** The blocks as read, with what they showed, written back while the table of contents is unchanged. */
  source: string
}

/** The source blocks of a table of contents, saved as they were read while it shows the same entries. */
type TocSource = { signature: string; blocks: Block[] }

const NO_ENTRIES = "No table of contents entries found."

/**
 * The table of contents that starts at blocks[index]: a Table of Contents content control, or paragraphs from the
 * one that opens a TOC field to the one that closes it. Null when the block does not start one.
 */
export function readTocAt(blocks: Block[], index: number, doc: WordDocument): TocRead | null {
  const block = blocks[index]
  if (block?.kind === "raw" && block.blocks) {
    const start = block.blocks.findIndex((item) => item.kind === "paragraph" && fieldInstruction(item) !== null)
    const field = start < 0 ? null : fieldParagraphs(block.blocks, start)
    if (!field) {
      return null
    }
    const title = block.blocks
      .slice(0, start)
      .flatMap((item) => (item.kind === "paragraph" ? [entryText(item).replace(/\t/g, " ").trim()] : []))
      .filter(Boolean)
      .join(" ")
    return tocRead(field.paragraphs, field.instruction, title, [block], index + 1, doc)
  }
  if (block?.kind !== "paragraph") {
    return null
  }
  const field = fieldParagraphs(blocks, index)
  if (!field) {
    return null
  }
  return tocRead(field.paragraphs, field.instruction, "", blocks.slice(index, field.end), field.end, doc)
}

/** Titles a table of contents is given above its entries, in the languages documents most often come in. */
const TOC_TITLE =
  /^(table of contents|contents|toc|index|inhalt|inhaltsverzeichnis|sommaire|table des mati[eè]res|[ií]ndice|inhoud(sopgave)?|indholdsfortegnelse|innehåll(sförteckning)?|spis treści|sumário)$/i

/** A page number at the end of an entry: after a tab, or after a space when there is no tab. */
const PAGE_AT_END = /^(.*\S)\s+(\d{1,4}|[ivxlcdm]{1,8})$/i

type Heading = { text: string; level: TocLevel }

const headingCache = new WeakMap<WordDocument, Heading[]>()

/**
 * A table of contents without a TOC field, as converters, web pages and copied tables leave them: two or more
 * paragraphs in a row that each are a link to a place in the document (a _Toc bookmark or a heading), or use the
 * TOC 1–9 styles. A paragraph just above with a title such as "Contents" is its title. Levels come from the TOC
 * styles, else the heading each entry names, else the indent.
 */
export function readLooseTocAt(blocks: Block[], index: number, doc: WordDocument): TocRead | null {
  const first = blocks[index]
  if (first?.kind !== "paragraph" || first.sectionBreak) {
    return null
  }
  const titled = TOC_TITLE.test(
    entryText(first)
      .replace(/[:.]\s*$/, "")
      .trim(),
  )
  const start = titled ? index + 1 : index
  if (readTocAt(blocks, start, doc)) {
    // A TOC field (or content control) of its own; its title stays the document's paragraph.
    return null
  }
  const headings = documentHeadings(doc)
  const entries: TocEntry[] = []
  let end = start
  let linked = 0
  let named = 0
  for (; end < blocks.length; end += 1) {
    const block = blocks[end]
    if (block?.kind !== "paragraph" || block.sectionBreak) {
      break
    }
    const entry = looseEntry(block, doc, headings)
    if (!entry) {
      break
    }
    entries.push(entry.entry)
    linked += entry.toc ? 1 : 0
    named += entry.named ? 1 : 0
  }
  // Enough to tell it from a list of links: TOC styles or _Toc links, or most entries naming a heading.
  const enough = entries.length >= 2 && (linked === entries.length || named * 2 >= entries.length)
  if (!enough) {
    return null
  }
  const deepest = Math.max(3, ...entries.map((entry) => entry.level))
  const hyperlinks = entries.some((entry) => entry.anchor)
  const instruction = `TOC \\o "1-${Math.min(9, deepest)}"${hyperlinks ? " \\h" : ""} \\z \\u`
  const title = titled ? entryText(first).trim() : ""
  const tabbed = blocks.slice(start, end).some((block) => block.kind === "paragraph" && entryText(block).includes("\t"))
  const layout = {
    leader: (tabbed ? entryLayout(blocks.slice(start, end) as Paragraph[], doc).leader : "none") as TocLeader,
    rightAlign: tabbed,
  }
  const signature = tocSignature({ entries, instruction, title, ...layout })
  return {
    end,
    entries,
    instruction,
    title,
    ...layout,
    source: JSON.stringify({ signature, blocks: blocks.slice(index, end) } satisfies TocSource),
  }
}

/** An entry of a table of contents without a field, and what shows it is one. */
function looseEntry(paragraph: Paragraph, doc: WordDocument, headings: Heading[]) {
  const styled = entryLevel(paragraph, doc)
  const target = linkTarget(paragraph)
  if (styled === null && target === null) {
    return null
  }
  const text = entryText(paragraph)
  const tab = text.lastIndexOf("\t")
  let label = (tab < 0 ? text : text.slice(0, tab)).replace(/\s+/g, " ").trim()
  let page = tab < 0 ? "" : text.slice(tab + 1).trim()
  let heading = findHeading(headings, label)
  if (tab < 0 && !heading) {
    const split = PAGE_AT_END.exec(label)
    if (split) {
      label = split[1]!
      page = split[2]!
      heading = findHeading(headings, label)
    }
  }
  if (!label) {
    return null
  }
  const indentLevel = Math.round((paragraph.pPr.ind?.left ?? 0) / 220) + 1
  const level = styled ?? heading?.level ?? (Math.min(9, Math.max(1, indentLevel)) as TocLevel)
  const entry: TocEntry = { level, text: label, page }
  if (target) {
    entry.anchor = target
  }
  return { entry, toc: styled !== null || target?.startsWith("_Toc") === true, named: heading !== undefined }
}

/** The place in the document a paragraph made of one link goes to, or null when it has text outside links. */
function linkTarget(paragraph: Paragraph): string | null {
  let target: string | null = null
  for (const inline of paragraph.inlines) {
    if (inline.kind === "hyperlink") {
      const place = inline.anchor ?? (inline.target?.startsWith("#") ? inline.target.slice(1) : undefined)
      if (!place) {
        return null
      }
      target ??= place
      continue
    }
    if (inline.kind === "run" && inline.content.some((item) => item.kind === "text" && item.text.trim())) {
      // A page number after the link is part of an entry; other text is not.
      const text = inline.content
        .map((item) => (item.kind === "text" ? item.text : ""))
        .join("")
        .trim()
      if (!PAGE_AT_END.test(`x ${text}`) || text.includes(" ")) {
        return null
      }
    }
  }
  return target
}

function findHeading(headings: Heading[], label: string) {
  const key = normalize(label)
  return key ? headings.find((heading) => heading.text === key) : undefined
}

function normalize(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase()
}

/** Every heading in the document with its level: Heading 1–9 styles, or an outline level of its own or its style's. */
function documentHeadings(doc: WordDocument): Heading[] {
  const cached = headingCache.get(doc)
  if (cached) {
    return cached
  }
  const levelOf = (paragraph: Paragraph): TocLevel | null => {
    let outline = paragraph.pPr.outlineLvl
    const seen = new Set<string>()
    for (
      let style = doc.styles.styles.find((item) => item.id === paragraph.styleId);
      outline === undefined && style && !seen.has(style.id);
      style = doc.styles.styles.find((item) => item.id === style?.basedOn)
    ) {
      seen.add(style.id)
      const named = /^heading\s?([1-9])$/i.exec(style.id) ?? /^heading ([1-9])$/i.exec(style.name ?? "")
      outline = style.pPr.outlineLvl ?? (named ? Number(named[1]) - 1 : undefined)
    }
    return outline !== undefined && outline >= 0 && outline <= 8 ? ((outline + 1) as TocLevel) : null
  }
  const headings = paragraphsIn(doc.blocks).flatMap((paragraph) => {
    const level = levelOf(paragraph)
    const text = normalize(entryText(paragraph))
    return level && text ? [{ text, level }] : []
  })
  headingCache.set(doc, headings)
  return headings
}

/**
 * The table of contents as Word writes it: a Table of Contents content control holding the title and one TOCn
 * paragraph per entry inside a TOC field, each entry linking to its heading's bookmark with a PAGEREF page number.
 * An unchanged table of contents read from a document is written as it was read.
 */
export function tocBlocks(
  attrs: Record<string, unknown> | undefined,
  anchors: (string | undefined)[],
  textWidth: number,
): Block[] {
  const instruction = String(attrs?.instruction || DEFAULT_TOC_INSTRUCTION)
  const title = String(attrs?.title ?? "")
  const entries = readTocEntries(attrs?.entries)
  const source = readSource(attrs?.source)
  if (source && source.signature === tocSignature({ ...attrs, entries, instruction, title })) {
    return structuredClone(source.blocks)
  }
  const options = tocOptions({ ...attrs, instruction })
  const tabs = options.pageNumbers && options.rightAlign ? [rightTab(options.leader, textWidth)] : undefined
  // Without a right tab stop the page number follows the text after a space.
  const separator: RunContent = tabs ? { kind: "tab" } : { kind: "text", text: " " }
  const paragraphs: Paragraph[] = entries.map((entry, index) => {
    // The bookmark gives the PAGEREF its page; the entry links to it only with \h.
    const anchor = anchors[index]
    const link = (inlines: Inline[]): Inline[] =>
      anchor && options.hyperlinks ? [{ kind: "hyperlink", anchor, history: true, inlines }] : inlines
    if (!options.pageNumbers || !entry.page) {
      return entryParagraph(entry.level, tabs, link([textRun(entry.text)]))
    }
    const label: Inline[] = [textRun(entry.text), { kind: "run", rPr: {}, content: [separator] }]
    const page: Inline[] = anchor
      ? [
          fieldRun({ kind: "fldChar", fieldType: "begin" }),
          fieldRun({ kind: "instrText", text: ` PAGEREF ${anchor} \\h ` }),
          fieldRun({ kind: "fldChar", fieldType: "separate" }),
          textRun(entry.page),
          fieldRun({ kind: "fldChar", fieldType: "end" }),
        ]
      : [textRun(entry.page)]
    return entryParagraph(entry.level, tabs, link([...label, ...page]))
  })
  if (paragraphs.length === 0) {
    paragraphs.push({ kind: "paragraph", pPr: {}, markRPr: {}, inlines: [textRun(NO_ENTRIES)] })
  }
  paragraphs[0]!.inlines.unshift(
    fieldRun({ kind: "fldChar", fieldType: "begin" }),
    fieldRun({ kind: "instrText", text: ` ${instruction} ` }),
    fieldRun({ kind: "fldChar", fieldType: "separate" }),
  )
  paragraphs[paragraphs.length - 1]!.inlines.push(fieldRun({ kind: "fldChar", fieldType: "end" }))
  const heading: Paragraph[] = title
    ? [{ kind: "paragraph", styleId: "TOCHeading", pPr: {}, markRPr: {}, inlines: [textRun(title)] }]
    : []
  const control: RawMarkup = {
    kind: "raw",
    xml:
      '<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/>' +
      "</w:docPartObj></w:sdtPr><w:sdtEndPr/><w:sdtContent/></w:sdt>",
    text: [title, ...entries.map((entry) => `${entry.text}\t${entry.page}`)].filter(Boolean).join("\n"),
    blocks: [...heading, ...paragraphs],
  }
  return [control]
}

function entryParagraph(level: TocLevel, tabs: TabStop[] | undefined, inlines: Inline[]): Paragraph {
  return { kind: "paragraph", styleId: `TOC${level}`, pPr: tabs ? { tabs } : {}, markRPr: {}, inlines }
}

function rightTab(leader: TocLeader, textWidth: number): TabStop {
  return { val: "right", leader: leader === "none" ? undefined : leader, pos: Math.max(1440, Math.round(textWidth)) }
}

function tocRead(
  paragraphs: Paragraph[],
  instruction: string,
  title: string,
  source: Block[],
  end: number,
  doc: WordDocument,
): TocRead {
  const entries = paragraphs.flatMap((paragraph) => {
    const entry = readEntry(paragraph, doc)
    return entry ? [entry] : []
  })
  const layout = entryLayout(paragraphs, doc)
  const signature = tocSignature({ entries, instruction, title, ...layout })
  return {
    end,
    entries,
    instruction,
    title,
    ...layout,
    source: JSON.stringify({ signature, blocks: source } satisfies TocSource),
  }
}

/** The leader and alignment of the page numbers, from the right tab stop of the first entry or of its style. */
function entryLayout(paragraphs: Paragraph[], doc: WordDocument): { leader: TocLeader; rightAlign: boolean } {
  const first = paragraphs.find((paragraph) => entryLevel(paragraph, doc) !== null)
  if (!first) {
    return { leader: "dot", rightAlign: true }
  }
  const style = doc.styles.styles.find((item) => item.id === first.styleId)
  const tabs = first.pPr.tabs ?? style?.pPr.tabs ?? []
  const right = [...tabs].reverse().find((tab) => tab.val === "right")
  if (!right) {
    return { leader: "dot", rightAlign: false }
  }
  const leader =
    right.leader === "hyphen" || right.leader === "underscore" || right.leader === "dot" ? right.leader : "none"
  return { leader, rightAlign: true }
}

/** The paragraphs of the TOC field that opens in blocks[start], through the paragraph that closes it. */
function fieldParagraphs(blocks: Block[], start: number) {
  const first = blocks[start]
  const instruction = first?.kind === "paragraph" ? fieldInstruction(first) : null
  if (instruction === null) {
    return null
  }
  const paragraphs: Paragraph[] = []
  let depth = 0
  for (let index = start; index < blocks.length; index += 1) {
    const block = blocks[index]
    // A section break inside stays with its paragraph, which the editor's table of contents cannot hold.
    if (block?.kind !== "paragraph" || block.sectionBreak) {
      return null
    }
    paragraphs.push(block)
    for (const content of runContents(block.inlines)) {
      if (content.kind === "fldChar" && content.fieldType === "begin") {
        depth += 1
      } else if (content.kind === "fldChar" && content.fieldType === "end") {
        depth -= 1
        if (depth === 0) {
          return { paragraphs, instruction, end: index + 1 }
        }
      }
    }
  }
  return null
}

/** The TOC instruction of a field the paragraph opens with, or null when it does not open with one. */
function fieldInstruction(paragraph: Paragraph): string | null {
  let instruction = ""
  let opened = false
  for (const inline of paragraph.inlines) {
    if (inline.kind !== "run") {
      if (inline.kind === "bookmarkStart" || inline.kind === "bookmarkEnd") {
        continue
      }
      return null
    }
    for (const content of inline.content) {
      if (!opened) {
        if (content.kind !== "fldChar" || content.fieldType !== "begin") {
          return null
        }
        opened = true
      } else if (content.kind === "instrText") {
        instruction += content.text
      } else if (content.kind === "fldChar") {
        const trimmed = instruction.trim()
        return /^TOC\b/i.test(trimmed) ? trimmed : null
      }
    }
  }
  return null
}

function readEntry(paragraph: Paragraph, doc: WordDocument): TocEntry | null {
  const level = entryLevel(paragraph, doc)
  const text = entryText(paragraph)
  const tab = text.lastIndexOf("\t")
  if (level === null && tab < 0) {
    return null
  }
  const label = (tab < 0 ? text : text.slice(0, tab)).replace(/\t/g, " ").replace(/\s+/g, " ").trim()
  if (!label || label === NO_ENTRIES) {
    return null
  }
  const entry: TocEntry = { level: level ?? 1, text: label, page: tab < 0 ? "" : text.slice(tab + 1).trim() }
  const anchor = entryAnchor(paragraph.inlines)
  if (anchor) {
    entry.anchor = anchor
  }
  return entry
}

/** TOC1 to TOC9 by id, or by the built-in names toc 1 to toc 9 a localized document keeps. */
function entryLevel(paragraph: Paragraph, doc: WordDocument): TocLevel | null {
  const id = paragraph.styleId ?? ""
  const name = doc.styles.styles.find((style) => style.id === id)?.name ?? ""
  const match = /^toc\s?([1-9])$/i.exec(id) ?? /^toc ([1-9])$/i.exec(name)
  return match ? (Number(match[1]) as TocLevel) : null
}

/** What the entry shows: its text and tabs, with field instructions left out. */
function entryText(paragraph: Paragraph) {
  let text = ""
  for (const content of runContents(paragraph.inlines, false)) {
    if (content.kind === "text") {
      text += content.text
    } else if (content.kind === "tab") {
      text += "\t"
    }
  }
  return text
}

function entryAnchor(inlines: Inline[]): string | undefined {
  for (const inline of inlines) {
    if (inline.kind === "hyperlink" && inline.anchor) {
      return inline.anchor
    }
  }
  for (const content of runContents(inlines)) {
    const match = content.kind === "instrText" ? /PAGEREF\s+(\S+)/.exec(content.text) : null
    if (match?.[1]) {
      return match[1]
    }
  }
  return undefined
}

/** Run content in order, through links and tracked changes; deleted text is left out unless asked for. */
function runContents(inlines: Inline[], deleted = true): RunContent[] {
  const out: RunContent[] = []
  for (const inline of inlines) {
    if (inline.kind === "run") {
      out.push(...inline.content)
    } else if (inline.kind === "hyperlink" || inline.kind === "ins" || inline.kind === "simpleField") {
      out.push(...runContents(inline.inlines, deleted))
    } else if (inline.kind === "del" && deleted) {
      out.push(...runContents(inline.inlines, deleted))
    }
  }
  return out
}

function textRun(text: string): Run {
  return { kind: "run", rPr: {}, content: text ? [{ kind: "text", text }] : [] }
}

function fieldRun(content: RunContent): Run {
  return { kind: "run", rPr: {}, content: [content] }
}

function readSource(value: unknown): TocSource | null {
  if (typeof value !== "string" || !value) {
    return null
  }
  try {
    const parsed = JSON.parse(value) as Partial<TocSource>
    return typeof parsed.signature === "string" && Array.isArray(parsed.blocks)
      ? { signature: parsed.signature, blocks: parsed.blocks }
      : null
  } catch {
    return null
  }
}
