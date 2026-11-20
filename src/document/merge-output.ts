import { isMergeField } from "@/document/field-instructions"
import { mergeFieldText } from "@/document/field-results"
import { activeRecords, mergeContext, type MainDocumentType, useMailMerge } from "@/document/mail-merge"
import { fieldValue, type FieldMap, type MergeContext, type MergeEffect } from "@/document/merge-fields"

/**
 * Finish & Merge: the main document once for each recipient, with the merge fields replaced by their text, as Word's
 * Edit Individual Documents makes it ("Letters1"). Checked against Word's own merge in the VM:
 * - an Address Block's lines become paragraphs of their own;
 * - a paragraph that held only merge fields, all empty, is left out (Word's blank line suppression);
 * - NEXT moves to the next record inside one copy (a sheet of labels), and SKIPIF leaves a record out;
 * - fields that are not merge fields (DATE, PAGE) stay fields.
 * Copies are separated by page breaks (Word uses next-page section breaks), except for a directory.
 */

export type JsonNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: JsonNode[]
  marks?: unknown[]
  text?: string
}

export type MergeRange = { kind: "all" } | { kind: "current" } | { kind: "range"; from: number; to: number }

const BLOCK_WITH_INLINES = new Set(["paragraph", "heading"])

function isMerge(node: JsonNode) {
  return node.type === "wordField" && isMergeField(String(node.attrs?.instr ?? ""))
}

/** One paragraph merged: one or more paragraphs (an Address Block's lines), or none when it emptied out. */
function mergeParagraph(node: JsonNode, context: MergeContext, effect: MergeEffect): JsonNode[] {
  const lines: JsonNode[][] = [[]]
  let hadMerge = false
  let hadOther = false
  for (const child of node.content ?? []) {
    if (!isMerge(child)) {
      lines[lines.length - 1]!.push(child)
      if (child.type !== "text" || (child.text ?? "").trim()) {
        hadOther = true
      }
      continue
    }
    hadMerge = true
    const text = mergeFieldText(String(child.attrs?.instr ?? ""), context, effect)
    text.split("\n").forEach((line, index) => {
      if (index > 0) {
        lines.push([])
      }
      if (line) {
        lines[lines.length - 1]!.push({
          type: "text",
          text: line,
          ...(child.marks?.length ? { marks: child.marks } : {}),
        })
      }
    })
  }
  const filled = lines.map((content) => mergeText(content))
  if (hadMerge && !hadOther && filled.every((content) => !content.some((item) => item.type !== "text" || item.text))) {
    return []
  }
  return filled.map((content) => ({ ...node, content }))
}

/** Text nodes next to each other with the same marks, as one (as the editor would keep them). */
function mergeText(content: JsonNode[]) {
  const out: JsonNode[] = []
  for (const item of content) {
    const last = out[out.length - 1]
    if (
      item.type === "text" &&
      last?.type === "text" &&
      JSON.stringify(last.marks ?? []) === JSON.stringify(item.marks ?? [])
    ) {
      out[out.length - 1] = { ...last, text: (last.text ?? "") + (item.text ?? "") }
    } else if (item.type !== "text" || item.text) {
      out.push(item)
    }
  }
  return out
}

function mergeBlocks(blocks: JsonNode[], context: MergeContext, effect: MergeEffect, top = false): JsonNode[] {
  const out: JsonNode[] = []
  for (const [index, block] of blocks.entries()) {
    if (BLOCK_WITH_INLINES.has(block.type)) {
      const merged = mergeParagraph(block, context, effect)
      // A copy's last paragraph stays even when it empties out: in Word it holds the section break (VM, U25).
      out.push(...(merged.length || !top || index < blocks.length - 1 ? merged : [{ ...block, content: [] }]))
    } else if (block.content?.length) {
      const content = mergeBlocks(block.content, context, effect)
      // A table cell keeps a paragraph, as every cell must.
      out.push({
        ...block,
        content: content.length || !/cell|header/i.test(block.type) ? content : [{ type: "paragraph" }],
      })
    } else {
      out.push(block)
    }
  }
  return out
}

/** The places among the active records that a range takes in (Merge to New Document's All, Current record, From…To). */
function rangePlaces(range: MergeRange, count: number, position: number) {
  if (range.kind === "current") {
    return { start: position, end: position }
  }
  if (range.kind === "range") {
    return { start: Math.max(0, range.from - 1), end: Math.min(count - 1, range.to - 1) }
  }
  return { start: 0, end: count - 1 }
}

/** The merged document's content, and how many records went into it. */
export function mergeDocument(
  json: JsonNode,
  range: MergeRange,
  state = useMailMerge.getState(),
  type: MainDocumentType = state.type,
) {
  const active = activeRecords(state)
  const { start, end } = rangePlaces(range, active.length, state.position)
  const copies: JsonNode[][] = []
  let merged = 0
  let place = start
  while (place <= end && place < active.length) {
    const context = { ...mergeContext(state, place, active), blankWhenDone: true }
    const at = context.at
    const effect: MergeEffect = {}
    const content = mergeBlocks(json.content ?? [], context, effect, true)
    if (!effect.skip) {
      copies.push(content.length ? content : [{ type: "paragraph" }])
      merged += at() - place + 1
    }
    place = Math.max(place + 1, at() + 1)
  }
  const content: JsonNode[] = []
  copies.forEach((copy, index) => {
    if (index > 0 && type !== "directory") {
      content.push({ type: "pageBreak" })
    }
    content.push(...copy)
  })
  return {
    json: { ...json, content: content.length ? content : [{ type: "paragraph" }] },
    merged,
    copies: copies.length,
  }
}

/** Check for Errors: merge fields naming a column the list does not have (and Match Fields does not cover). */
export function missingFields(json: JsonNode, fields: string[], fieldMap: FieldMap) {
  const missing = new Map<string, number>()
  const visit = (node: JsonNode) => {
    if (node.type === "wordField") {
      const instr = String(node.attrs?.instr ?? "")
      for (const match of instr.matchAll(/MERGEFIELD\s+(?:"([^"]+)"|([^\s}]+))/gi)) {
        const name = (match[1] ?? match[2] ?? "").trim()
        const record = Object.fromEntries(fields.map((field) => [field, "x"]))
        if (name && !fieldValue(record, name, fieldMap)) {
          missing.set(name, (missing.get(name) ?? 0) + 1)
        }
      }
    }
    node.content?.forEach(visit)
  }
  visit(json)
  return [...missing].map(([name, count]) => ({ name, count }))
}
