import type { Node as ProseNode } from "@tiptap/pm/model"
import type { EditorView } from "@tiptap/pm/view"
import type { WordNoteTexts } from "@/document/docx/project"

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

/** The note a Word note reference's payload (its w:r) points at. */
function wordReference(payload: unknown): { kind: "footnote" | "endnote"; id: number } | null {
  if (typeof payload !== "string" || !payload) {
    return null
  }
  try {
    const runs = JSON.parse(payload) as { content?: { kind?: string; id?: number }[] }[]
    for (const run of Array.isArray(runs) ? runs : []) {
      for (const item of run.content ?? []) {
        if ((item.kind === "footnoteReference" || item.kind === "endnoteReference") && typeof item.id === "number") {
          return { kind: item.kind === "footnoteReference" ? "footnote" : "endnote", id: item.id }
        }
      }
    }
  } catch {
    return null
  }
  return null
}

/** The notes `node` refers to, in order; editor notes are numbered from `counts`, which this advances. */
export function notesIn(node: ProseNode, counts: { footnote: number; endnote: number }): NoteRef[] {
  const refs: NoteRef[] = []
  const visit = (child: ProseNode) => {
    if (child.type.name === "wordInline" && child.attrs.role === "note") {
      const target = wordReference(child.attrs.payload)
      const html = target ? texts[target.kind][String(target.id)] : undefined
      if (target && html) {
        refs.push({ kind: target.kind, key: `w${target.id}`, label: String(child.attrs.text ?? ""), html })
      }
      return false
    }
    if (child.type.name === "note") {
      const kind = child.attrs.kind === "endnote" ? "endnote" : "footnote"
      counts[kind] += 1
      const label = kind === "footnote" ? String(counts[kind]) : romanNumeral(counts[kind])
      const text = String(child.attrs.text ?? "")
      refs.push({
        kind,
        key: `e${String(child.attrs.id || counts[kind])}`,
        label,
        html: `<p class="note-text"><sup>${escapeHtml(label)}</sup> ${escapeHtml(text)}</p>`,
      })
      return false
    }
    return true
  }
  node.descendants(visit)
  return refs
}

function romanNumeral(value: number) {
  const numerals: [number, string][] = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ]
  let rest = Math.max(1, Math.floor(value))
  let out = ""
  for (const [amount, numeral] of numerals) {
    while (rest >= amount) {
      out += numeral
      rest -= amount
    }
  }
  return out
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
