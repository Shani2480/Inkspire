import type { Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"

/**
 * A heading and the text under it, up to the next heading of the same or a higher level, as Word's Navigation pane
 * moves them when a heading is dragged. Only headings at the document's top level have sections; a heading inside
 * a table or text box is listed but stays where it is.
 */
export type HeadingSection = { pos: number; end: number; level: number; text: string; movable: boolean }

export function headingSections(doc: ProseNode): HeadingSection[] {
  const sections: HeadingSection[] = []
  doc.descendants((node, pos, parent) => {
    if (node.type.name !== "heading") {
      return true
    }
    sections.push({
      pos,
      end: pos + node.nodeSize,
      level: Number(node.attrs.level) || 1,
      text: node.textContent.trim() || "Heading",
      movable: parent === doc,
    })
    return false
  })
  // A top-level heading's section runs to the next top-level heading at its level or above, or the document's end.
  for (const [index, section] of sections.entries()) {
    if (!section.movable) {
      continue
    }
    const next = sections.slice(index + 1).find((other) => other.movable && other.level <= section.level)
    section.end = next ? next.pos : doc.content.size
  }
  return sections
}

/** The heading whose section holds `pos`: the last heading at or before it. */
export function currentHeading(sections: HeadingSection[], pos: number) {
  let current: HeadingSection | null = null
  for (const section of sections) {
    if (section.pos <= pos) {
      current = section
    }
  }
  return current
}

/**
 * Moves the section of the heading at `headingPos` to just before the heading at `beforePos` (null: to the end of
 * the document). One undo step. Refused when the target lies inside the section itself.
 */
export function moveSection(editor: Editor, headingPos: number, beforePos: number | null) {
  const sections = headingSections(editor.state.doc)
  const section = sections.find((item) => item.pos === headingPos && item.movable)
  if (!section) {
    return false
  }
  const target = beforePos ?? editor.state.doc.content.size
  if (target >= section.pos && target <= section.end) {
    return false
  }
  if (beforePos !== null && !sections.some((item) => item.pos === beforePos && item.movable)) {
    return false
  }
  const slice = editor.state.doc.slice(section.pos, section.end)
  const tr = editor.state.tr.delete(section.pos, section.end)
  const at = tr.mapping.map(target, -1)
  tr.insert(at, slice.content)
  editor.view.dispatch(tr.scrollIntoView())
  return true
}
