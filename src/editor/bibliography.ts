import { Node, mergeAttributes, type Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state"
import {
  NO_SOURCES,
  bibliographyEntries,
  citationInstruction,
  parseCitation,
  type BibEntry,
  type Citation,
} from "@/document/bibliography"
import { useBibliography } from "@/document/bibliography-store"
import { readEntries } from "@/document/docx/bibliography-field"
import { citedTags, citationFormatter } from "@/editor/word-field"

/**
 * Word's bibliography (References > Bibliography): a BIBLIOGRAPHY field listing the document's sources in its style.
 * The node keeps the entries it shows; they follow the sources and the style as they change, and Update Citations and
 * Bibliography brings them up to date, as in Word. One read from a .docx keeps its markup (`source`), saved as read
 * while its entries are unchanged.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    bibliography: {
      /** A CITATION field at the cursor for these sources (Insert Citation). */
      insertCitation: (citation: Citation) => ReturnType
      /** The bibliography at the cursor, under a Heading 1 when `heading` is given (Word's built-in galleries). */
      insertBibliography: (heading?: string) => ReturnType
    }
  }
}

/** The entries the document's bibliography shows now: its sources in its style. */
export function currentEntries(doc: ProseNode): BibEntry[] {
  const { sources, style } = useBibliography.getState()
  return bibliographyEntries(sources, style, citedTags(doc))
}

function paintBibliography(dom: HTMLElement, node: ProseNode) {
  const entries = readEntries(node.attrs.entries)
  dom.className = "document-bibliography"
  dom.replaceChildren()
  if (entries.length === 0) {
    const empty = document.createElement("p")
    empty.className = "document-bibliography-entry"
    empty.textContent = NO_SOURCES
    dom.append(empty)
    return
  }
  for (const entry of entries) {
    const row = document.createElement("p")
    row.className = `document-bibliography-entry${entry.label ? " is-numbered" : ""}`
    if (entry.label) {
      const label = document.createElement("span")
      label.className = "document-bibliography-label"
      label.textContent = entry.label
      row.append(label)
    }
    for (const part of entry.parts) {
      part.text.split("\n").forEach((piece, at) => {
        if (at > 0) {
          row.append(document.createElement("br"))
        }
        if (!piece) {
          return
        }
        if (part.italic) {
          const italic = document.createElement("em")
          italic.textContent = piece
          row.append(italic)
        } else {
          row.append(piece)
        }
      })
    }
    dom.append(row)
  }
}

const entriesText = (node: ProseNode) =>
  readEntries(node.attrs.entries)
    .map((entry) => `${entry.label ? `${entry.label}\t` : ""}${entry.parts.map((part) => part.text).join("")}`)
    .join("\n")

const bibliographyKey = new PluginKey("bibliography")

/** Every bibliography and citation brought up to date (Word's Update Citations and Bibliography). */
export function updateCitationsAndBibliography() {
  useBibliography.getState().update()
}

export const Bibliography = Node.create({
  name: "bibliography",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      entries: {
        default: [] as BibEntry[],
        parseHTML: (element) => readEntries(element.getAttribute("data-bib-entries")),
        renderHTML: (attributes) => ({ "data-bib-entries": JSON.stringify(readEntries(attributes.entries)) }),
      },
      /** The Word markup it was opened from, saved again while its entries are unchanged. */
      source: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-bib-source") ?? "",
        renderHTML: (attributes) => (attributes.source ? { "data-bib-source": String(attributes.source) } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-bibliography]" }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-bibliography": "", class: "document-bibliography" }),
      entriesText(node),
    ]
  },

  renderText({ node }) {
    return entriesText(node)
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div")
      paintBibliography(dom, node)
      return {
        dom,
        ignoreMutation: () => true,
        update(next) {
          if (next.type.name !== "bibliography") {
            return false
          }
          paintBibliography(dom, next)
          return true
        },
      }
    }
  },

  addCommands() {
    return {
      insertCitation:
        (citation) =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.nodes.wordField
          if (!type || citation.tags.length === 0) {
            return false
          }
          if (dispatch) {
            const instr = citationInstruction(citation)
            // The result as it will show, counting this citation (IEEE numbers by order of citing).
            const field = type.create({ instr, result: "" })
            tr.replaceSelectionWith(field, true)
            const result = citationFormatter(tr.doc)(instr)
            tr.doc.descendants((node, pos) => {
              if (node === field || (node.type === type && node.attrs.instr === instr && !node.attrs.result)) {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, result })
                return false
              }
              return true
            })
          }
          return true
        },
      insertBibliography:
        (heading) =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.nodes.bibliography
          if (!type) {
            return false
          }
          if (dispatch) {
            const node = type.create({ entries: currentEntries(state.doc) })
            const nodes = heading
              ? [state.schema.nodes.heading!.create({ level: 1 }, state.schema.text(heading)), node]
              : [node]
            const { $from } = tr.selection
            // After the paragraph the cursor is in, as a block; an empty paragraph is replaced.
            const parent = $from.parent
            if ($from.depth > 0 && parent.isTextblock && parent.content.size === 0) {
              tr.replaceWith($from.before(), $from.after(), nodes)
            } else {
              tr.insert($from.depth > 0 ? $from.after() : $from.pos, nodes)
            }
            let at = -1
            tr.doc.descendants((child, pos) => {
              if (child === node) {
                at = pos
              }
              return at < 0
            })
            if (at >= 0) {
              tr.setSelection(NodeSelection.create(tr.doc, at))
            }
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: bibliographyKey,
        view(view) {
          // A source edited or another style chosen: every bibliography shows it at once, as in Word.
          const unsubscribe = useBibliography.subscribe((next, previous) => {
            if (
              next.sources === previous.sources &&
              next.style === previous.style &&
              next.refresh === previous.refresh
            ) {
              return
            }
            queueMicrotask(() => {
              if (view.isDestroyed) {
                return
              }
              const entries = currentEntries(view.state.doc)
              const tr = view.state.tr
              view.state.doc.descendants((node, pos) => {
                if (node.type.name === "bibliography") {
                  if (JSON.stringify(readEntries(node.attrs.entries)) !== JSON.stringify(entries)) {
                    tr.setNodeMarkup(pos, undefined, { ...node.attrs, entries })
                  }
                  return false
                }
                return true
              })
              if (tr.docChanged) {
                view.dispatch(tr.setMeta("addToHistory", false))
              }
            })
          })
          return { destroy: unsubscribe }
        },
      }),
    ]
  },
})

// --- citations -----------------------------------------------------------------------------------------------------

export type CitationAt = { pos: number; node: ProseNode; citation: Citation }

/** The citation the selection is on (a selected citation, or the one right before the caret). */
export function citationAt(editor: Editor): CitationAt | null {
  const { selection, doc } = editor.state
  const candidates: number[] = []
  if (selection instanceof NodeSelection) {
    candidates.push(selection.from)
  } else {
    candidates.push(selection.from - 1, selection.from)
  }
  for (const pos of candidates) {
    if (pos < 0 || pos >= doc.content.size) {
      continue
    }
    const node = doc.nodeAt(pos)
    if (node?.type.name === "wordField") {
      const citation = parseCitation(String(node.attrs.instr ?? ""))
      if (citation) {
        return { pos, node, citation }
      }
    }
  }
  return null
}

/** Edit Citation: the citation's switches changed (pages, suppressed author / year / title). */
export function editCitation(editor: Editor, at: CitationAt, changes: Partial<Citation>) {
  const instr = citationInstruction({ ...at.citation, ...changes })
  const tr = editor.state.tr.setNodeMarkup(at.pos, undefined, { ...at.node.attrs, instr })
  const result = citationFormatter(tr.doc)(instr)
  tr.setNodeMarkup(at.pos, undefined, { ...at.node.attrs, instr, result })
  editor.view.dispatch(tr)
}

/** Convert citation to static text: the field goes, its result stays as typed text. */
export function citationToText(editor: Editor, at: CitationAt) {
  const text = String(at.node.attrs.result ?? "")
  const tr = editor.state.tr
  if (text) {
    tr.replaceWith(at.pos, at.pos + at.node.nodeSize, editor.schema.text(text, at.node.marks))
  } else {
    tr.delete(at.pos, at.pos + at.node.nodeSize)
  }
  editor.view.dispatch(tr)
}
