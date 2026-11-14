import { Extension, type Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { formatNoteNumber, restartsAt, type NoteKind, type NoteSettings } from "@/document/note-numbering"
import { useNoteSettings } from "@/document/note-settings"

/**
 * The number every footnote and endnote reference shows, in the document's options (number format, start at,
 * restart each section or page), counting the notes made in the app and Word's own together, as Word numbers them.
 * A custom mark shows itself and takes no number.
 */

export type NoteReference = {
  kind: NoteKind
  /** A Word note's id in its part (the part it was read from, before any Convert). */
  wordId?: number
  /** The part a converted Word note's text is still in. */
  from?: NoteKind
  custom?: string
}

/** A Word note reference's run (a wordInline payload): which note, of which kind, and its custom mark. */
export function wordNoteReference(payload: unknown, text = ""): NoteReference | null {
  if (typeof payload !== "string" || !payload) {
    return null
  }
  try {
    const runs = JSON.parse(payload) as {
      content?: { kind?: string; id?: number; customMarkFollows?: boolean; from?: string }[]
    }[]
    for (const run of Array.isArray(runs) ? runs : []) {
      for (const item of run.content ?? []) {
        if ((item.kind === "footnoteReference" || item.kind === "endnoteReference") && typeof item.id === "number") {
          const kind = item.kind === "footnoteReference" ? "footnote" : "endnote"
          return {
            kind,
            wordId: item.id,
            ...(item.from === "footnote" || item.from === "endnote" ? { from: item.from } : {}),
            ...(item.customMarkFollows ? { custom: text } : {}),
          }
        }
      }
    }
  } catch {
    return null
  }
  return null
}

/** A note reference node (made in the app, or Word's), or null for anything else. */
export function noteReferenceOf(node: ProseNode): NoteReference | null {
  if (node.type.name === "note") {
    const mark = String(node.attrs.mark ?? "")
    return { kind: node.attrs.kind === "endnote" ? "endnote" : "footnote", ...(mark ? { custom: mark } : {}) }
  }
  if (node.type.name === "wordInline" && node.attrs.role === "note") {
    return wordNoteReference(node.attrs.payload, String(node.attrs.text ?? ""))
  }
  return null
}

/** Each note reference's label by position. `breaks` are the paginator's page starts, for Restart each page. */
export function noteLabels(doc: ProseNode, settings: NoteSettings, breaks: readonly number[] = []) {
  const labels = new Map<number, string>()
  const last = { footnote: { section: -1, page: -1, count: 0 }, endnote: { section: -1, page: -1, count: 0 } }
  let section = 0
  doc.descendants((node, pos) => {
    if (node.type.name === "sectionBreak") {
      section += 1
      return false
    }
    const reference = noteReferenceOf(node)
    if (!reference) {
      return true
    }
    if (reference.custom !== undefined) {
      labels.set(pos, reference.custom)
      return false
    }
    const options = settings[reference.kind]
    const state = last[reference.kind]
    const page = breaks.filter((at) => at <= pos).length
    const first = state.section < 0
    if (first || restartsAt(options.numRestart, section !== state.section, page !== state.page)) {
      state.count = 0
    }
    state.count += 1
    state.section = section
    state.page = page
    labels.set(pos, formatNoteNumber(options.numStart + state.count - 1, options.numFmt))
    return false
  })
  return labels
}

const cache = new WeakMap<ProseNode, { key: string; labels: Map<number, string> }>()

/** The labels for the editor's document now, computed once per document, options and page breaks. */
export function currentNoteLabels(editor: Editor) {
  const doc = editor.state.doc
  const settings = useNoteSettings.getState().settings
  const breaks: number[] = (editor.storage as { pagination?: { breaks?: number[] } }).pagination?.breaks ?? []
  const key = `${JSON.stringify(settings)}|${settings.footnote.numRestart === "eachPage" || settings.endnote.numRestart === "eachPage" ? breaks.join(",") : ""}`
  const cached = cache.get(doc)
  if (cached?.key === key) {
    return cached.labels
  }
  const labels = noteLabels(doc, settings, breaks)
  cache.set(doc, { key, labels })
  return labels
}

/** The labels for a view's document (the paginator has the view, not the editor). */
export function labelsForView(view: EditorView) {
  const editor = (view.dom as HTMLElement & { editor?: Editor }).editor
  if (editor && editor.view === view) {
    return currentNoteLabels(editor)
  }
  return noteLabels(view.state.doc, useNoteSettings.getState().settings)
}

/** The node views drawing a note reference, repainted when the numbering may have changed. */
const painters = new Set<() => void>()

export function watchNoteLabel(paint: () => void) {
  painters.add(paint)
  return () => painters.delete(paint)
}

function repaint() {
  for (const paint of painters) {
    paint()
  }
}

/**
 * Repaints every note reference when the document changes (a note added before others renumbers them all) and
 * when the footnote and endnote options change.
 */
export const NoteLabels = Extension.create({
  name: "noteLabels",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("noteLabels"),
        view: (view) => {
          let pages = ""
          const pageStarts = () =>
            (
              (view.dom as HTMLElement & { editor?: Editor }).editor?.storage as { pagination?: { breaks?: number[] } }
            )?.pagination?.breaks?.join(",") ?? ""
          const stop = useNoteSettings.subscribe((state, previous) => {
            if (state.settings !== previous.settings) {
              repaint()
            }
          })
          return {
            update: (current, previous) => {
              // Restart each page follows the pages, which the paginator sets after the document changed.
              const now = pageStarts()
              if (!current.state.doc.eq(previous.doc) || now !== pages) {
                pages = now
                repaint()
              }
            },
            destroy: stop,
          }
        },
      }),
    ]
  },
})
