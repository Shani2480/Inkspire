import type { Editor } from "@tiptap/core"
import { noteReferenceOf } from "@/editor/note-labels"
import type { NoteKind } from "@/document/note-numbering"

export type ConvertNotes = "toEndnotes" | "toFootnotes" | "swap"

/** The kind a note becomes, or null when Convert leaves it. */
function target(kind: NoteKind, mode: ConvertNotes): NoteKind | null {
  if (mode === "swap") {
    return kind === "footnote" ? "endnote" : "footnote"
  }
  const to = mode === "toEndnotes" ? "endnote" : "footnote"
  return kind === to ? null : to
}

/**
 * References > Footnotes > Convert…: every footnote to an endnote, every endnote to a footnote, or both swapped,
 * for the notes made in the app and Word's own. A Word note's reference remembers the part its text is in
 * (`from`), so saving moves the text over (`convertedNotes` in the converter). One step to undo. Returns how many
 * notes changed.
 */
export function convertNotes(editor: Editor, mode: ConvertNotes) {
  const tr = editor.state.tr
  let changed = 0
  editor.state.doc.descendants((node, pos) => {
    const reference = noteReferenceOf(node)
    if (!reference) {
      return true
    }
    const to = target(reference.kind, mode)
    if (!to) {
      return false
    }
    if (node.type.name === "note") {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, kind: to })
    } else {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, payload: convertedPayload(String(node.attrs.payload), to) })
    }
    changed += 1
    return false
  })
  if (changed > 0) {
    editor.view.dispatch(tr)
  }
  return changed
}

/** A Word note reference's run with its reference now of kind `to`, remembering where its text was read. */
export function convertedPayload(payload: string, to: NoteKind) {
  try {
    const runs = JSON.parse(payload) as { content?: Record<string, unknown>[] }[]
    for (const run of runs) {
      for (const item of run.content ?? []) {
        if (item.kind === "footnoteReference" || item.kind === "endnoteReference") {
          const was = item.kind === "footnoteReference" ? "footnote" : "endnote"
          const from = (item.from as NoteKind | undefined) ?? was
          item.kind = to === "footnote" ? "footnoteReference" : "endnoteReference"
          if (from === to) {
            delete item.from
          } else {
            item.from = from
          }
        }
      }
    }
    return JSON.stringify(runs)
  } catch {
    return payload
  }
}
