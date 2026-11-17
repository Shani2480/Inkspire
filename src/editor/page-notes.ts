import type { Node as ProseNode } from "@tiptap/pm/model"
import type { EditorView } from "@tiptap/pm/view"
import type { WordNoteTexts } from "@/document/docx/project"
import { NOTE_MARK } from "@/document/note-numbering"
import { noteReferenceOf } from "@/editor/note-labels"

/**
 * Footnotes at the foot of the page that refers to them and endnotes after the document's last paragraph, as Word
 * draws them. The paginator (`pages.ts`) keeps room for a page's footnotes and draws them in the gap that ends the
 * page; the texts are the opened Word document's own (`noteTexts` in the projection), or an editor note's text.
 */

export type NoteRef = { kind: "footnote" | "endnote"; key: string; label: string; html: string }

let texts: WordNoteTexts = { footnote: {}, endnote: {}, separator: {} }
let version = 0

/** The note texts of the Word document just opened (none for anything else). */
export function setWordNoteTexts(next: WordNoteTexts | undefined) {
  texts = next ?? { footnote: {}, endnote: {}, separator: {} }
  version += 1
  heights.clear()
}

/** Changes whenever other note texts are set, for the paginator's signature. */
export function noteTextsVersion() {
  return version
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** The notes `node` (a top-level block at `offset`) refers to, in order, labelled as `labels` says. */
export function notesIn(node: ProseNode, offset: number, labels: Map<number, string>): NoteRef[] {
  const refs: NoteRef[] = []
  node.descendants((child, at) => {
    const reference = noteReferenceOf(child)
    if (!reference) {
      return true
    }
    const pos = offset + 1 + at
    const label = labels.get(pos) ?? String(child.attrs.text ?? "")
    if (reference.wordId !== undefined) {
      // A Word note's text, from the part it was read from (Convert moves it on save).
      const html = texts[reference.from ?? reference.kind][String(reference.wordId)]
      if (html) {
        refs.push({
          kind: reference.kind,
          key: `w${reference.from ?? reference.kind}${reference.wordId}`,
          label,
          html: html.split(NOTE_MARK).join(escapeHtml(label)),
        })
      }
      return false
    }
    const text = String(child.attrs.text ?? "")
    refs.push({
      kind: reference.kind,
      key: `e${String(child.attrs.id || pos)}`,
      label,
      html: `<p class="note-text"><sup>${escapeHtml(label)}</sup> ${escapeHtml(text)}</p>`,
    })
    return false
  })
  return refs
}

/** Word's own separator: a paragraph holding a rule a third of a page wide. */
const DEFAULT_SEPARATOR = `<p class="note-separator-line"><span class="word-note-separator"></span></p>`

/** The note area's content: the separator, then each note's text. */
export function notesHtml(refs: NoteRef[], kind: "footnote" | "endnote") {
  if (refs.length === 0) {
    return ""
  }
  const separator = texts.separator[kind] || DEFAULT_SEPARATOR
  return `${separator}${refs.map((ref) => ref.html).join("")}`
}

/** A note area for the page (or the document's end). */
export function createNotesBox(refs: NoteRef[], kind: "footnote" | "endnote") {
  const box = document.createElement("div")
  box.className = kind === "footnote" ? "page-notes page-footnotes" : "page-notes page-endnotes"
  box.contentEditable = "false"
  box.innerHTML = notesHtml(refs, kind)
  return box
}

const heights = new Map<string, number>()

/** How tall the note area for `refs` is, drawn in the editor at its text width. */
export function notesHeight(view: EditorView, refs: NoteRef[], kind: "footnote" | "endnote") {
  if (refs.length === 0) {
    return 0
  }
  const key = `${kind}:${view.dom.offsetWidth}:${refs.map((ref) => `${ref.key}=${ref.label}`).join(",")}`
  const known = heights.get(key)
  if (known !== undefined) {
    return known
  }
  const box = createNotesBox(refs, kind)
  box.style.position = "absolute"
  box.style.visibility = "hidden"
  box.style.left = "0"
  box.style.right = "0"
  const observer = (view as EditorView & { domObserver?: { stop: () => void; start: () => void } }).domObserver
  observer?.stop()
  try {
    view.dom.append(box)
    const height = Math.ceil(box.getBoundingClientRect().height / Math.max(0.01, zoomOf(view)))
    heights.set(key, height)
    return height
  } finally {
    box.remove()
    observer?.start()
  }
}

/** The editor's drawn scale (the page zoom), measured. */
function zoomOf(view: EditorView) {
  const width = view.dom.offsetWidth
  return width > 0 ? view.dom.getBoundingClientRect().width / width : 1
}
