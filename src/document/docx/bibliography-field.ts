import type { BibEntry, TextPart } from "@/document/bibliography"
import { fieldRun } from "@/document/docx/toc"
import type { Block, ContentControl, Inline, Paragraph, Run, RunContent } from "@/document/docx/model"

/**
 * Word's BIBLIOGRAPHY field as blocks: one "Bibliography" paragraph per entry (IEEE: a two-column table of number and
 * entry), inside a bibliography content control. A bibliography read from a document keeps its blocks and is
 * written back as read while it shows the same entries.
 */

export type BibliographyRead = { end: number; entries: BibEntry[]; source: string }

type BibliographySource = { signature: string; blocks: Block[] }

export const bibliographySignature = (entries: unknown) =>
  JSON.stringify(
    readEntries(entries).map((entry) => [
      entry.label ?? "",
      entry.parts.map((part) => [part.text.replace(/\s+$/, ""), Boolean(part.italic)]),
    ]),
  )

/** Entries kept on the editor's node, checked. */
export function readEntries(value: unknown): BibEntry[] {
  let items: unknown = value
  if (typeof value === "string") {
    try {
      items = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(items)) {
    return []
  }
  return items.flatMap((item): BibEntry[] => {
    const entry = item as Partial<BibEntry>
    if (!entry || !Array.isArray(entry.parts)) {
      return []
    }
    const parts = entry.parts
      .filter((part): part is TextPart => Boolean(part) && typeof part.text === "string")
      .map((part) => (part.italic ? { text: part.text, italic: true } : { text: part.text }))
    return [{ tag: String(entry.tag ?? ""), ...(entry.label ? { label: String(entry.label) } : {}), parts }]
  })
}

const isBibliographyControl = (xml: string) =>
  /<(?:\w+:)?sdtPr\b[\s\S]*?<(?:\w+:)?bibliography\s*\/>[\s\S]*?<\/(?:\w+:)?sdtPr>/.test(xml.slice(0, 2000))

/** Every run in a block's inlines, through links, fields and revisions. */
function runsOf(inlines: Inline[]): Run[] {
  return inlines.flatMap((inline): Run[] => {
    if (inline.kind === "run") {
      return [inline]
    }
    if ("inlines" in inline && Array.isArray(inline.inlines)) {
      return runsOf(inline.inlines)
    }
    return []
  })
}

/** A paragraph's visible text as entry parts (italic kept), leaving out the field's own codes. */
function paragraphParts(paragraph: Paragraph): TextPart[] {
  const parts: TextPart[] = []
  let inCode = 0
  for (const run of runsOf(paragraph.inlines)) {
    for (const content of run.content) {
      if (content.kind === "fldChar") {
        inCode =
          content.fieldType === "begin"
            ? inCode + 1
            : content.fieldType === "separate"
              ? Math.max(0, inCode - 1)
              : inCode
        continue
      }
      if (inCode > 0) {
        continue
      }
      const text =
        content.kind === "text"
          ? content.text
          : content.kind === "tab"
            ? "\t"
            : content.kind === "break" && content.breakType === "textWrapping"
              ? "\n"
              : ""
      if (!text) {
        continue
      }
      const italic = Boolean(run.rPr.i)
      const last = parts[parts.length - 1]
      if (last && Boolean(last.italic) === italic) {
        last.text += text
      } else {
        parts.push(italic ? { text, italic } : { text })
      }
    }
  }
  return parts
}

function cellText(blocks: Block[]) {
  return blocks
    .flatMap((block) => (block.kind === "paragraph" ? paragraphParts(block) : []))
    .map((part) => part.text)
    .join("")
    .trim()
}

/** The entries shown in blocks inside a bibliography: paragraphs, or IEEE's rows of number and entry. */
function entriesIn(blocks: Block[]): BibEntry[] {
  const entries: BibEntry[] = []
  for (const block of blocks) {
    if (block.kind === "paragraph") {
      const parts = paragraphParts(block)
      if (parts.some((part) => part.text.trim())) {
        entries.push({ tag: "", parts })
      }
    } else if (block.kind === "table") {
      for (const row of block.rows) {
        const [label, entry] = row.cells
        if (!label || !entry) {
          continue
        }
        const parts = entry.blocks.flatMap((item) => (item.kind === "paragraph" ? paragraphParts(item) : []))
        entries.push({ tag: "", label: cellText(label.blocks), parts })
      }
    }
  }
  return entries
}

function fieldDepth(block: Block, depth: number) {
  const paragraphs: Paragraph[] =
    block.kind === "paragraph"
      ? [block]
      : block.kind === "table"
        ? block.rows.flatMap((row) =>
            row.cells.flatMap((cell) => cell.blocks.filter((item) => item.kind === "paragraph")),
          )
        : []
  let current = depth
  for (const paragraph of paragraphs) {
    for (const run of runsOf(paragraph.inlines)) {
      for (const content of run.content) {
        if (content.kind === "fldChar" && content.fieldType === "begin") {
          current += 1
        } else if (content.kind === "fldChar" && content.fieldType === "end") {
          current -= 1
        }
      }
    }
  }
  return current
}

function opensBibliographyField(block: Block | undefined) {
  if (block?.kind !== "paragraph") {
    return false
  }
  let opened = false
  let instruction = ""
  for (const run of runsOf(block.inlines)) {
    for (const content of run.content) {
      if (content.kind === "fldChar" && content.fieldType === "begin" && !opened) {
        opened = true
      } else if (opened && content.kind === "instrText") {
        instruction += content.text
      } else if (opened && content.kind === "fldChar") {
        return /^\s*BIBLIOGRAPHY\b/i.test(instruction)
      } else if (!opened && content.kind === "text" && content.text.trim()) {
        return false
      }
    }
  }
  return false
}

/**
 * A bibliography that starts at blocks[index]: Word's bibliography content control (kept whole, as the reader keeps
 * typed controls), or a BIBLIOGRAPHY field over paragraphs and, for IEEE, a table.
 */
export function readBibliographyAt(blocks: Block[], index: number): BibliographyRead | null {
  const first = blocks[index]
  if (first?.kind === "raw" && isBibliographyControl(first.xml)) {
    const entries = entriesIn(first.blocks ?? [])
    return { end: index + 1, entries, source: sourceOf(entries, [first]) }
  }
  if (!opensBibliographyField(first)) {
    return null
  }
  let depth = 0
  for (let at = index; at < blocks.length; at += 1) {
    const block = blocks[at]!
    if (block.kind === "raw" || (block.kind === "paragraph" && block.sectionBreak)) {
      return null
    }
    depth = fieldDepth(block, depth)
    if (depth <= 0) {
      const taken = blocks.slice(index, at + 1)
      const entries = entriesIn(taken)
      return { end: at + 1, entries, source: sourceOf(entries, taken) }
    }
  }
  return null
}

function sourceOf(entries: BibEntry[], blocks: Block[]) {
  return JSON.stringify({ signature: bibliographySignature(entries), blocks } satisfies BibliographySource)
}

function readSource(value: unknown): BibliographySource | null {
  try {
    const parsed = JSON.parse(String(value || "")) as Partial<BibliographySource>
    return typeof parsed.signature === "string" && Array.isArray(parsed.blocks) ? (parsed as BibliographySource) : null
  } catch {
    return null
  }
}

function partRuns(parts: TextPart[]): Run[] {
  const runs: Run[] = []
  for (const part of parts) {
    const content: RunContent[] = []
    part.text.split("\n").forEach((piece, at) => {
      if (at > 0) {
        content.push({ kind: "break", breakType: "textWrapping" })
      }
      if (piece) {
        content.push({ kind: "text", text: piece })
      }
    })
    if (content.length > 0) {
      runs.push({ kind: "run", rPr: part.italic ? { i: true, iCs: true } : {}, content })
    }
  }
  return runs
}

const NO_SOURCES_TEXT = "There are no sources in the current document."

/**
 * The bibliography as Word writes it. An unchanged one goes back as read; a new or updated one is a BIBLIOGRAPHY
 * field over "Bibliography" paragraphs with a 0.5" hanging indent (IEEE: number, tab, entry), in a bibliography
 * content control unless the field it was read from had none.
 */
export function bibliographyBlocks(attrs: Record<string, unknown> | undefined, controlId: number): Block[] {
  const entries = readEntries(attrs?.entries)
  const source = readSource(attrs?.source)
  if (source && source.signature === bibliographySignature(entries)) {
    return structuredClone(source.blocks)
  }
  const numbered = entries.some((entry) => entry.label)
  const paragraphs: Paragraph[] = entries.map((entry) => ({
    kind: "paragraph",
    styleId: "Bibliography",
    pPr: numbered
      ? { ind: { left: 720, hanging: 720 }, tabs: [{ val: "left", pos: 720 }] }
      : { ind: { left: 720, hanging: 720 } },
    markRPr: {},
    inlines: [
      ...(entry.label
        ? [{ kind: "run", rPr: {}, content: [{ kind: "text", text: entry.label }, { kind: "tab" }] } as Run]
        : []),
      ...partRuns(entry.parts),
    ],
  }))
  if (paragraphs.length === 0) {
    paragraphs.push({
      kind: "paragraph",
      styleId: "Bibliography",
      pPr: {},
      markRPr: {},
      inlines: [{ kind: "run", rPr: {}, content: [{ kind: "text", text: NO_SOURCES_TEXT }] }],
    })
  }
  paragraphs[0]!.inlines.unshift(
    fieldRun({ kind: "fldChar", fieldType: "begin" }),
    fieldRun({ kind: "instrText", text: " BIBLIOGRAPHY " }),
    fieldRun({ kind: "fldChar", fieldType: "separate" }),
  )
  // Word ends the field in a paragraph of its own.
  paragraphs.push({
    kind: "paragraph",
    pPr: {},
    markRPr: {},
    inlines: [fieldRun({ kind: "fldChar", fieldType: "end" })],
  })
  const first = source?.blocks[0]
  const outer: ContentControl[] = first?.controls ?? []
  const inControl = !source || first?.kind === "raw"
  const control: ContentControl = {
    open: `<w:sdt><w:sdtPr><w:id w:val="${controlId}"/><w:bibliography/></w:sdtPr><w:sdtContent>`,
    close: "</w:sdtContent></w:sdt>",
  }
  for (const paragraph of paragraphs) {
    const controls = inControl ? [...outer, control] : outer
    if (controls.length > 0) {
      paragraph.controls = structuredClone(controls)
    }
  }
  return paragraphs
}
