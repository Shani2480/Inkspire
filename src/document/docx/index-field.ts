import {
  DEFAULT_INDEX_INSTRUCTION,
  indexLines,
  indexOptions,
  readIndexEntries,
  type IndexEntry,
  type IndexPage,
} from "@/document/index-field"
import { readLeader, type TocLeader } from "@/document/toc"
import { entryText, fieldParagraphs, fieldRun, textRun } from "@/document/docx/toc"
import type { Block, Inline, Paragraph, RunProperties, WordDocument } from "@/document/docx/model"

/**
 * Word's INDEX field as blocks: one "index 1" / "index 2" paragraph per line inside the field. An index read from a
 * document keeps its blocks and is written back as read while it shows the same entries.
 */

export type IndexRead = {
  end: number
  instruction: string
  entries: IndexEntry[]
  leader: TocLeader
  source: string
}

type IndexSource = { signature: string; blocks: Block[] }

const NO_ENTRIES = "No index entries found."

export function indexSignature(attrs: { instruction?: unknown; entries?: unknown; leader?: unknown }) {
  return JSON.stringify({
    instruction: String(attrs.instruction || DEFAULT_INDEX_INSTRUCTION).trim(),
    entries: readIndexEntries(attrs.entries).map((entry) => [
      entry.main,
      entry.sub ?? "",
      entry.pages.map((p) => p.text),
    ]),
    leader: readLeader(attrs.leader),
  })
}

/** The INDEX field that starts at blocks[index], or null. */
export function readIndexAt(blocks: Block[], index: number, doc: WordDocument): IndexRead | null {
  if (blocks[index]?.kind !== "paragraph") {
    return null
  }
  const field = fieldParagraphs(blocks, index, "INDEX")
  if (!field) {
    return null
  }
  const entries: IndexEntry[] = []
  let main = ""
  let leader: TocLeader = "dot"
  for (const paragraph of field.paragraphs) {
    const level = indexLevel(paragraph, doc)
    if (level === null) {
      continue
    }
    const tab = paragraph.pPr.tabs?.find((stop) => stop.val === "right")
    if (tab) {
      leader = tab.leader === "hyphen" || tab.leader === "underscore" || tab.leader === "dot" ? tab.leader : "none"
    }
    const line = readLine(entryText(paragraph))
    if (!line || line.text === NO_ENTRIES) {
      continue
    }
    if (level === 1) {
      main = line.text
      entries.push({ main, pages: line.pages })
    } else if (main) {
      entries.push({ main, sub: line.text, pages: line.pages })
    }
  }
  const signature = indexSignature({ instruction: field.instruction, entries, leader })
  return {
    end: field.end,
    instruction: field.instruction,
    entries,
    leader,
    source: JSON.stringify({ signature, blocks: blocks.slice(index, field.end) } satisfies IndexSource),
  }
}

function indexLevel(paragraph: Paragraph, doc: WordDocument): 1 | 2 | null {
  const id = paragraph.styleId ?? ""
  const name = doc.styles.styles.find((style) => style.id === id)?.name ?? ""
  const match = /^index\s?([1-9])$/i.exec(id) ?? /^index ([1-9])$/i.exec(name)
  if (!match) {
    return null
  }
  return Number(match[1]) === 1 ? 1 : 2
}

const PAGE = String.raw`(?:\d+|[ivxlcdm]+)(?:\s*[–-]\s*(?:\d+|[ivxlcdm]+))?`

/** "Term, 3, 5–7", "Term<tab>3", "Term. See Other" → the term and its pages. */
function readLine(text: string): { text: string; pages: IndexPage[] } | null {
  const clean = text.replace(/\s+$/, "")
  if (!clean.trim()) {
    return null
  }
  const see = /^(.*?)\.\s+(See(?: also)?\s+.+)$/.exec(clean)
  if (see) {
    return { text: see[1]!.trim(), pages: [{ text: see[2]!.trim(), see: true }] }
  }
  const match = new RegExp(String.raw`^(.*?)(?:,\s*|\t+)(${PAGE}(?:,\s*${PAGE})*)$`, "i").exec(clean)
  if (!match) {
    return { text: clean.replace(/\t/g, " ").trim(), pages: [] }
  }
  return {
    text: match[1]!.replace(/\t/g, " ").trim(),
    pages: match[2]!.split(/,\s*/).map((page) => ({ text: page.trim() })),
  }
}

/** The index as Word writes it. */
export function indexBlocks(attrs: Record<string, unknown> | undefined, textWidth: number): Block[] {
  const instruction = String(attrs?.instruction || DEFAULT_INDEX_INSTRUCTION)
  const entries = readIndexEntries(attrs?.entries)
  const source = readSource(attrs?.source)
  if (source && source.signature === indexSignature({ ...attrs, instruction, entries })) {
    return structuredClone(source.blocks)
  }
  const options = indexOptions({ instruction, leader: attrs?.leader })
  const rightAligned = options.rightAlign && !options.runIn
  const tabs = rightAligned
    ? [
        {
          val: "right" as const,
          leader: options.leader === "none" ? undefined : options.leader,
          pos: Math.max(1440, Math.round(textWidth / Math.max(1, options.columns))),
        },
      ]
    : undefined
  const paragraphs: Paragraph[] = indexLines(entries, options).map((line) => {
    const inlines: Inline[] = []
    line.parts.forEach((part, index) => {
      if (index > 0) {
        inlines.push(textRun(index === 1 ? ": " : "; "))
      }
      inlines.push(textRun(part.text))
      const pages = part.pages ?? []
      if (pages.length === 0) {
        return
      }
      if (pages[0]?.see) {
        inlines.push(textRun(". "))
      } else if (rightAligned && line.parts.length === 1) {
        inlines.push({ kind: "run", rPr: {}, content: [{ kind: "tab" }] })
      } else {
        inlines.push(textRun(", "))
      }
      pages.forEach((page, at) => {
        if (at > 0) {
          inlines.push(textRun(", "))
        }
        if (page.see) {
          // Word sets the "See" of a cross-reference in italic; the rest is the text as typed.
          const see = /^See(?: also)?\b/.exec(page.text)?.[0] ?? ""
          if (see) {
            inlines.push({ kind: "run", rPr: { i: true }, content: [{ kind: "text", text: see }] })
          }
          inlines.push(textRun(page.text.slice(see.length)))
          return
        }
        const rPr: RunProperties = {}
        if (page.bold) {
          rPr.b = true
        }
        if (page.italic) {
          rPr.i = true
        }
        inlines.push({ kind: "run", rPr, content: [{ kind: "text", text: page.text }] })
      })
    })
    return { kind: "paragraph", styleId: `Index${line.level}`, pPr: tabs ? { tabs } : {}, markRPr: {}, inlines }
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
  return paragraphs
}

function readSource(value: unknown): IndexSource | null {
  try {
    const parsed = JSON.parse(String(value || "")) as Partial<IndexSource>
    return typeof parsed.signature === "string" && Array.isArray(parsed.blocks) ? (parsed as IndexSource) : null
  } catch {
    return null
  }
}
