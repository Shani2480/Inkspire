import type { Node as ProseNode } from "@tiptap/pm/model"
import { parseInstruction } from "@/document/field-instructions"
import { preservedFieldCode } from "@/editor/field-codes"

/** The captions in a document (paragraphs holding a SEQ field), shared by Cross-reference and Table of Figures. */

export type CaptionItem = {
  id: string
  /** The whole caption: "Figure 1: Sales". */
  text: string
  /** What follows the label and number, without the separator: "Sales". */
  body: string
  pos: number
}

/** A label as a SEQ identifier: Word's identifiers have no spaces. */
export function sequenceName(label: string) {
  return label.trim().replace(/\s+/g, "_")
}

function childText(child: ProseNode) {
  if (child.isText) {
    return child.text ?? ""
  }
  if (child.type.name === "wordField") {
    return String(child.attrs.result ?? "")
  }
  if (child.type.name === "wordInline") {
    return String(child.attrs.text ?? "")
  }
  return child.type.name === "docTab" ? "\t" : ""
}

function clean(text: string) {
  return text
    .replace(/\u200b/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** The SEQ identifier a field node counts, or null. */
export function sequenceOf(child: ProseNode) {
  const instr =
    child.type.name === "wordField"
      ? String(child.attrs.instr ?? "")
      : child.type.name === "wordInline" && child.attrs.role === "field"
        ? preservedFieldCode(String(child.attrs.payload ?? ""))
        : ""
  const parsed = instr ? parseInstruction(instr) : null
  return parsed?.kind === "SEQ" && parsed.argument ? parsed.argument.toLowerCase() : null
}

export function paragraphText(node: ProseNode) {
  let text = ""
  node.forEach((child) => {
    text += childText(child)
  })
  return clean(text)
}

/** Every caption of a label, in document order. */
export function captionsOf(doc: ProseNode, label: string): CaptionItem[] {
  const name = sequenceName(label).toLowerCase()
  const items: CaptionItem[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) {
      return true
    }
    let found = false
    let body = ""
    node.forEach((child) => {
      if (found) {
        body += childText(child)
      } else if (sequenceOf(child) === name) {
        found = true
      }
    })
    if (found) {
      // Word's \a table leaves out "Figure 1" and the separator typed after it (": ", ". ", " - ").
      body = clean(body).replace(/^[\s:.\-–—]+/, "")
      items.push({ id: String(pos), text: paragraphText(node), body, pos })
    }
    return false
  })
  return items
}
