import { Mark, Node, mergeAttributes, type Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { NodeSelection, type EditorState } from "@tiptap/pm/state"
import {
  DEFAULT_INDEX_INSTRUCTION,
  indexEntries,
  indexLineText,
  indexLines,
  indexOptions,
  parseXe,
  readIndexEntries,
  xeInstruction,
  type IndexEntry as IndexItem,
  type XeEntry,
} from "@/document/index-field"
import { readLeader, type TocLeader } from "@/document/toc"
import { pageLabelAt } from "@/editor/toc"
import { collectBookmarks } from "@/editor/word-field"

/**
 * References > Index: Mark Entry puts an XE field after the marked text, and Insert Index lists the entries with
 * their pages as Word's INDEX field does. The index shows what it was last updated to (Update Index, F9).
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indexEntry: {
      /** Marks the selection (or `entry`) as an index entry: an XE field after the selection. */
      markIndexEntry: (entry?: string | XeEntry) => ReturnType
      insertDocumentIndex: (settings?: IndexSettings) => ReturnType
      updateDocumentIndex: () => ReturnType
    }
  }
}

export type IndexSettings = { instruction?: string; leader?: TocLeader }

/** The editor's older index marks, read so documents that have them still list them. */
export const IndexEntry = Mark.create({
  name: "indexEntry",
  excludes: "",
  inclusive: false,
  addAttributes() {
    return {
      term: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-index") || element.textContent || "",
        renderHTML: (attributes) => ({ "data-index": attributes.term || "" }),
      },
    }
  },
  parseHTML() {
    return [{ tag: "span[data-index]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "index-entry" }), 0]
  },
})

/** Every marked place in document order: XE fields (and the older marks), each with its page. */
export function collectIndex(doc: ProseNode, pageAt: (pos: number) => string | null) {
  const marks: { entry: XeEntry; page: string; endPage?: string }[] = []
  let bookmarks: ReturnType<typeof collectBookmarks> | null = null
  const page = (pos: number) => pageAt(pos) ?? "1"
  let lastMark: { term: string; end: number } | null = null
  doc.descendants((node, pos) => {
    if (node.type.name === "wordField") {
      const entry = parseXe(String(node.attrs.instr ?? ""))
      if (entry) {
        const item: (typeof marks)[number] = { entry, page: page(pos) }
        if (entry.range) {
          bookmarks ??= collectBookmarks(doc)
          const place = bookmarks.get(entry.range)
          if (place) {
            item.page = page(place.pos)
            item.endPage = page(place.end)
          }
        }
        marks.push(item)
      }
      return false
    }
    const mark = node.isText ? node.marks.find((item) => item.type.name === "indexEntry") : undefined
    if (mark) {
      const term = String(mark.attrs.term || node.text || "")
        .replace(/\s+/g, " ")
        .trim()
      // One entry per marked run, though the run may be split by other formatting.
      if (term && !(lastMark && lastMark.term === term && lastMark.end === pos)) {
        marks.push({ entry: { main: term }, page: page(pos) })
      }
      lastMark = { term, end: pos + node.nodeSize }
    }
    return true
  })
  return indexEntries(marks)
}

function paintIndex(dom: HTMLElement, node: ProseNode) {
  const options = indexOptions(node.attrs)
  const entries = readIndexEntries(node.attrs.entries)
  dom.className = `document-index${options.rightAlign && !options.runIn ? "" : " is-inline"}`
  dom.dataset.leader = options.leader
  dom.style.columnCount = options.columns > 1 ? String(options.columns) : ""
  dom.replaceChildren()
  if (entries.length === 0) {
    const empty = document.createElement("p")
    empty.className = "document-index-empty"
    empty.textContent = "No index entries found."
    dom.append(empty)
    return
  }
  for (const line of indexLines(entries, options)) {
    const row = document.createElement("p")
    row.className = "document-index-row"
    row.dataset.level = String(line.level)
    line.parts.forEach((part, index) => {
      if (index > 0) {
        row.append(index === 1 ? ": " : "; ")
      }
      const label = document.createElement("span")
      label.className = "document-index-label"
      label.textContent = part.text
      row.append(label)
      const pages = part.pages ?? []
      if (pages.length === 0) {
        return
      }
      const rightAligned = options.rightAlign && !options.runIn && line.parts.length === 1
      if (pages[0]?.see) {
        row.append(". ")
      } else if (rightAligned) {
        const leader = document.createElement("span")
        leader.className = "document-index-leader"
        row.append(leader)
      } else {
        row.append(", ")
      }
      pages.forEach((item, at) => {
        if (at > 0) {
          row.append(", ")
        }
        const span = document.createElement("span")
        span.className = "document-index-page"
        if (item.see) {
          const lead = /^See(?: also)?\b/.exec(item.text)?.[0] ?? ""
          const see = document.createElement("i")
          see.textContent = lead
          span.append(see, item.text.slice(lead.length))
        } else {
          span.textContent = item.text
          span.style.fontWeight = item.bold ? "bold" : ""
          span.style.fontStyle = item.italic ? "italic" : ""
        }
        row.append(span)
      })
    })
    dom.append(row)
  }
}

/** The index as plain lines (for the clipboard, find, word count). */
function indexText(node: ProseNode) {
  const options = indexOptions(node.attrs)
  return indexLines(readIndexEntries(node.attrs.entries), options)
    .map((line) => indexLineText(line, options))
    .join("\n")
}

function indexPositions(state: EditorState) {
  const { selection } = state
  if (selection instanceof NodeSelection && selection.node.type.name === "documentIndex") {
    return [selection.from]
  }
  const positions: number[] = []
  state.doc.descendants((node, pos) => {
    if (node.type.name === "documentIndex") {
      positions.push(pos)
    }
    return node.isBlock && !node.isTextblock
  })
  return positions
}

export const DocumentIndex = Node.create({
  name: "documentIndex",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      instruction: {
        default: DEFAULT_INDEX_INSTRUCTION,
        parseHTML: (element) => element.getAttribute("data-index-instruction") || DEFAULT_INDEX_INSTRUCTION,
        renderHTML: (attributes) => ({ "data-index-instruction": String(attributes.instruction || "") }),
      },
      entries: {
        default: [] as IndexItem[],
        parseHTML: (element) => readIndexEntries(element.getAttribute("data-index-entries")),
        renderHTML: (attributes) => ({
          "data-index-entries": JSON.stringify(readIndexEntries(attributes.entries)),
        }),
      },
      leader: {
        default: "dot" as TocLeader,
        parseHTML: (element) => readLeader(element.getAttribute("data-index-leader")),
        renderHTML: (attributes) => ({ "data-index-leader": readLeader(attributes.leader) }),
      },
      /** The Word markup it was opened from, saved again while the index is unchanged. */
      source: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-index-source") ?? "",
        renderHTML: (attributes) => (attributes.source ? { "data-index-source": String(attributes.source) } : {}),
      },
    }
  },
  parseHTML() {
    return [{ tag: "div[data-document-index]" }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-document-index": "", class: "document-index" }),
      indexText(node),
    ]
  },
  renderText({ node }) {
    return indexText(node)
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div")
      paintIndex(dom, node)
      return {
        dom,
        ignoreMutation: () => true,
        update(next) {
          if (next.type.name !== "documentIndex") {
            return false
          }
          paintIndex(dom, next)
          return true
        },
      }
    }
  },
  addCommands() {
    return {
      markIndexEntry:
        (entry) =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.nodes.wordField
          const selected = state.doc
            .textBetween(state.selection.from, state.selection.to, " ")
            .replace(/\s+/g, " ")
            .trim()
          const xe: XeEntry =
            typeof entry === "object" ? entry : { main: (entry ?? selected).replace(/\s+/g, " ").trim() }
          if (!type || !xe.main) {
            return false
          }
          if (dispatch) {
            // Word puts the field after the marked text.
            tr.insert(state.selection.to, type.create({ instr: xeInstruction(xe), result: "" }))
          }
          return true
        },
      insertDocumentIndex:
        (settings = {}) =>
        ({ editor, state, tr, dispatch }) => {
          const type = state.schema.nodes.documentIndex
          if (!type) {
            return false
          }
          if (!dispatch) {
            return true
          }
          const entries = collectIndex(state.doc, (pos) => pageLabelAt(editor, pos))
          const { selection } = state
          if (selection instanceof NodeSelection && selection.node.type.name === "documentIndex") {
            tr.setNodeMarkup(selection.from, undefined, { ...selection.node.attrs, ...settings, entries, source: "" })
            return true
          }
          const node = type.create({ ...settings, entries })
          tr.insert(state.selection.to, node)
          // Inside a paragraph the block lands after it, not at the cursor: select it where it went.
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
          return true
        },
      updateDocumentIndex:
        () =>
        ({ editor, state, tr, dispatch }) => {
          const positions = indexPositions(state)
          if (positions.length === 0) {
            return false
          }
          if (dispatch) {
            const entries = collectIndex(state.doc, (pos) => pageLabelAt(editor, pos))
            for (const pos of positions) {
              const node = tr.doc.nodeAt(pos)
              if (node?.type.name === "documentIndex") {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, entries })
              }
            }
          }
          return true
        },
    }
  },
})

/** Mark All: an XE field after every place the text occurs (whole words, matching case), once per paragraph. */
export function markAllIndexEntries(editor: Editor, text: string, entry: XeEntry) {
  const needle = text.trim()
  const type = editor.schema.nodes.wordField
  if (!needle || !type) {
    return 0
  }
  const places: number[] = []
  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) {
      return true
    }
    let found = -1
    node.forEach((child, childOffset) => {
      if (found >= 0 || !child.isText) {
        return
      }
      const at = wordAt(child.text ?? "", needle)
      if (at >= 0) {
        found = pos + 1 + childOffset + at + needle.length
      }
    })
    if (found >= 0) {
      places.push(found)
    }
    return false
  })
  const tr = editor.state.tr
  for (const place of places.reverse()) {
    tr.insert(place, type.create({ instr: xeInstruction(entry), result: "" }))
  }
  editor.view.dispatch(tr)
  return places.length
}

function wordAt(text: string, needle: string) {
  let from = 0
  for (;;) {
    const at = text.indexOf(needle, from)
    if (at < 0) {
      return -1
    }
    const before = text[at - 1] ?? " "
    const after = text[at + needle.length] ?? " "
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) {
      return at
    }
    from = at + 1
  }
}
