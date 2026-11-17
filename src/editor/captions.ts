import type { Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import { formatSequence, parseInstruction, wordBookmarkName } from "@/document/field-instructions"
import { preservedFieldCode } from "@/editor/field-codes"
import { collectBookmarks, refreshFields } from "@/editor/word-field"
import { paragraphText, sequenceName } from "@/editor/caption-items"

export { captionsOf, sequenceName } from "@/editor/caption-items"

/**
 * Word's Insert Caption (a "Caption" paragraph: label, SEQ field, text) and Cross-reference (REF / PAGEREF fields to a
 * heading, bookmark or caption, through a hidden _Ref bookmark as Word adds one).
 */

// --- labels ------------------------------------------------------------------------------------------------------

export const BUILT_IN_LABELS = ["Equation", "Figure", "Table"]
const LABELS_KEY = "inkspire.captionLabels"

export function customLabels(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(LABELS_KEY) ?? "[]") as unknown
    return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string" && Boolean(item)) : []
  } catch {
    return []
  }
}

function saveLabels(labels: string[]) {
  try {
    localStorage.setItem(LABELS_KEY, JSON.stringify(labels))
  } catch {
    // Kept for this session only.
  }
}

export function captionLabels() {
  return [...new Set([...BUILT_IN_LABELS, ...customLabels()])].sort((a, b) => a.localeCompare(b))
}

export function addCaptionLabel(label: string) {
  const clean = label.replace(/\s+/g, " ").trim().slice(0, 40)
  if (!clean || captionLabels().some((item) => item.toLowerCase() === clean.toLowerCase())) {
    return clean || null
  }
  saveLabels([...customLabels(), clean])
  return clean
}

export function removeCaptionLabel(label: string) {
  saveLabels(customLabels().filter((item) => item !== label))
}

export const NUMBER_FORMATS = [
  { id: "ARABIC", sample: "1, 2, 3, …" },
  { id: "alphabetic", sample: "a, b, c, …" },
  { id: "ALPHABETIC", sample: "A, B, C, …" },
  { id: "roman", sample: "i, ii, iii, …" },
  { id: "ROMAN", sample: "I, II, III, …" },
] as const

export type NumberFormat = (typeof NUMBER_FORMATS)[number]["id"]

// --- where a caption goes ----------------------------------------------------------------------------------------

/** What Insert Caption captions: a selected object or the table the caret is in (Position applies), or nothing. */
export function captionTarget(editor: Editor) {
  const { selection } = editor.state
  if (selection instanceof NodeSelection) {
    const $pos = editor.state.doc.resolve(selection.from)
    const node = selection.node
    if (node.isBlock) {
      return { kind: node.type.name === "table" ? "table" : "object", from: selection.from, to: selection.to } as const
    }
    // A picture in line with text: the paragraph holding it.
    if ($pos.depth > 0) {
      return { kind: "object", from: $pos.before(), to: $pos.after() } as const
    }
  }
  const { $from } = selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "table") {
      return { kind: "table", from: $from.before(depth), to: $from.after(depth) } as const
    }
  }
  return null
}

/** The number the next caption with this label takes at `pos`: one more than the SEQ fields before it. */
export function nextCaptionNumber(doc: ProseNode, label: string, pos: number) {
  const name = sequenceName(label).toLowerCase()
  let count = 0
  doc.descendants((node, at) => {
    if (at >= pos) {
      return false
    }
    const instr =
      node.type.name === "wordField"
        ? String(node.attrs.instr ?? "")
        : node.type.name === "wordInline" && node.attrs.role === "field"
          ? preservedFieldCode(String(node.attrs.payload ?? ""))
          : ""
    const parsed = instr ? parseInstruction(instr) : null
    if (parsed?.kind === "SEQ" && parsed.argument.toLowerCase() === name) {
      count = parsed.switches.has("c") ? count : count + 1
    }
    return true
  })
  return count + 1
}

export type CaptionOptions = {
  label: string
  /** What follows the number, as typed after "Figure 1" in the dialog (": Overview"). */
  text: string
  position: "above" | "below"
  excludeLabel: boolean
  format: NumberFormat
}

/**
 * Insert Caption: a Caption paragraph above or below the selected object or table, or after the caret's paragraph.
 * One undo step; the caret ends after the caption's text.
 */
export function insertCaption(editor: Editor, options: CaptionOptions) {
  const { state } = editor
  const { paragraph } = state.schema.nodes
  const field = state.schema.nodes.wordField
  if (!paragraph || !field) {
    return false
  }
  const target = captionTarget(editor)
  let at: number
  if (target) {
    at = options.position === "above" ? target.from : target.to
  } else {
    const { $to } = state.selection
    at = $to.depth > 0 ? $to.after(1) : state.doc.content.size
  }
  const name = sequenceName(options.label)
  const instr = `SEQ ${name} \\* ${options.format}`
  const number = formatSequence(nextCaptionNumber(state.doc, options.label, at), options.format)
  const content: ProseNode[] = []
  if (!options.excludeLabel) {
    content.push(state.schema.text(`${options.label} `))
  }
  content.push(field.create({ instr, result: number }))
  if (options.text) {
    content.push(state.schema.text(options.text))
  }
  const caption = paragraph.create({ namedStyle: "caption" }, content)
  const tr = state.tr.insert(at, caption)
  tr.setSelection(TextSelection.create(tr.doc, at + caption.nodeSize - 1))
  editor.view.dispatch(tr.scrollIntoView())
  refreshFields(editor)
  editor.commands.focus()
  return true
}

// --- what a cross-reference can point at -------------------------------------------------------------------------

export type ReferenceType = "Heading" | "Bookmark" | (string & {})

export type ReferenceItem = { id: string; text: string; pos: number }

/** The labels in use in the document (SEQ identifiers), with Word's three, for the Reference type list. */
export function referenceLabels(doc: ProseNode) {
  const labels = new Set(captionLabels())
  doc.descendants((node) => {
    if (node.type.name === "wordField") {
      const parsed = parseInstruction(String(node.attrs.instr ?? ""))
      if (parsed.kind === "SEQ" && parsed.argument) {
        labels.add(parsed.argument.replace(/_/g, " "))
      }
    }
    return true
  })
  return [...labels].sort((a, b) => a.localeCompare(b))
}

export function headingsOf(doc: ProseNode): ReferenceItem[] {
  const items: ReferenceItem[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      const indent = "  ".repeat(Math.max(0, (Number(node.attrs.level) || 1) - 1))
      items.push({ id: String(pos), text: `${indent}${paragraphText(node) || "Heading"}`, pos })
      return false
    }
    return true
  })
  return items
}

/** Bookmarks the person can refer to: Word's hidden ones (_Toc, _Ref) left out, as in Word without "Hidden". */
export function bookmarksOf(doc: ProseNode): ReferenceItem[] {
  return [...collectBookmarks(doc).values()]
    .filter((place) => !place.name.startsWith("_"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((place) => ({ id: place.name, text: place.name, pos: place.pos }))
}

export type ReferenceTo =
  | "text" // Heading text, Bookmark text, Entire caption
  | "labelNumber" // Only label and number
  | "captionText" // Only caption text
  | "page" // Page number
  | "aboveBelow" // Above/below

/** The "Insert reference to" choices for a reference type, in Word's order. */
export function referenceChoices(type: ReferenceType): { id: ReferenceTo; label: string }[] {
  if (type === "Heading") {
    return [
      { id: "text", label: "Heading text" },
      { id: "page", label: "Page number" },
      { id: "aboveBelow", label: "Above/below" },
    ]
  }
  if (type === "Bookmark") {
    return [
      { id: "text", label: "Bookmark text" },
      { id: "page", label: "Page number" },
      { id: "aboveBelow", label: "Above/below" },
    ]
  }
  return [
    { id: "text", label: "Entire caption" },
    { id: "labelNumber", label: "Only label and number" },
    { id: "captionText", label: "Only caption text" },
    { id: "page", label: "Page number" },
    { id: "aboveBelow", label: "Above/below" },
  ]
}

function newRefName(doc: ProseNode) {
  const used = collectBookmarks(doc)
  let name: string
  do {
    name = `_Ref${String(Math.floor(100000000 + Math.random() * 899999999))}`
  } while (used.has(name))
  return name
}

/** The range of a paragraph a caption reference covers: all of it, label and number, or the text after them. */
function captionRange(node: ProseNode, pos: number, part: ReferenceTo) {
  const start = pos + 1
  const end = pos + node.nodeSize - 1
  if (part === "text" || part === "page" || part === "aboveBelow") {
    return { from: start, to: end }
  }
  let fieldEnd = -1
  node.forEach((child, offset) => {
    if (fieldEnd < 0 && child.type.name === "wordField" && parseInstruction(String(child.attrs.instr)).kind === "SEQ") {
      fieldEnd = start + offset + child.nodeSize
    }
  })
  if (fieldEnd < 0) {
    return { from: start, to: end }
  }
  if (part === "labelNumber") {
    return { from: start, to: fieldEnd }
  }
  // Only caption text: what follows the number, without the separator (": ", ". ", " - ") Word skips.
  const rest = node.textBetween(fieldEnd - start, node.content.size)
  const skip = /^[\s:.\-–—]*/.exec(rest)?.[0].length ?? 0
  return { from: Math.min(end, fieldEnd + skip), to: end }
}

/**
 * The bookmark a reference points at, adding a hidden _Ref one where none covers the range (a bookmark that already
 * covers exactly the same text is reused). Returns its name, or null when there is nothing to refer to.
 */
function ensureBookmark(editor: Editor, from: number, to: number) {
  const { state } = editor
  const mark = state.schema.marks.bookmark
  if (!mark || to <= from) {
    return null
  }
  const text = state.doc.textBetween(from, to, " ").trim()
  for (const place of collectBookmarks(state.doc).values()) {
    if (place.pos === from && place.text === text) {
      return place.name
    }
  }
  const name = newRefName(state.doc)
  editor.view.dispatch(state.tr.addMark(from, to, mark.create({ id: name })))
  return name
}

export type CrossReference = {
  type: ReferenceType
  to: ReferenceTo
  /** The item: a heading's or caption's position (as text), or a bookmark name. */
  item: string
  hyperlink: boolean
  /** Include above/below: " above" or " below" after a text or page reference. */
  includeAboveBelow: boolean
}

/** Inserts a cross-reference at the selection: the REF or PAGEREF field, its result filled in. One undo step each. */
export function insertCrossReference(editor: Editor, reference: CrossReference) {
  let name: string | null
  if (reference.type === "Bookmark") {
    name = reference.item
  } else {
    const pos = Number(reference.item)
    const node = editor.state.doc.nodeAt(pos)
    if (!node || !node.isTextblock) {
      return false
    }
    const range =
      reference.type === "Heading"
        ? { from: pos + 1, to: pos + node.nodeSize - 1 }
        : captionRange(node, pos, reference.to)
    name = ensureBookmark(editor, range.from, range.to)
  }
  const field = editor.state.schema.nodes.wordField
  if (!name || !field) {
    return false
  }
  const link = reference.hyperlink ? " \\h" : ""
  const fields =
    reference.to === "aboveBelow"
      ? [`REF ${name} \\p${link}`]
      : reference.to === "page"
        ? [`PAGEREF ${name}${link}`]
        : [`REF ${name}${link}`]
  if (reference.includeAboveBelow && reference.to !== "aboveBelow") {
    fields.push(`REF ${name} \\p${link}`)
  }
  const content = fields.flatMap((instr, index) => [
    ...(index > 0 ? [{ type: "text", text: " " }] : []),
    { type: "wordField", attrs: { instr, result: "" } },
  ])
  editor.chain().focus().insertContent(content).run()
  refreshFields(editor)
  return true
}

/** Where a reference's field name points, for "Go to" from the dialog. */
export function bookmarkFor(doc: ProseNode, name: string) {
  return collectBookmarks(doc).get(wordBookmarkName(name)) ?? null
}
