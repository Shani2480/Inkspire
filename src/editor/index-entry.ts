import { Mark, Node, mergeAttributes } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { NodeSelection } from "@tiptap/pm/state"
import { chainWithSelection } from "@/editor/selection-memory"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indexEntry: {
      markIndexEntry: (term?: string) => ReturnType
      insertDocumentIndex: () => ReturnType
      updateDocumentIndex: () => ReturnType
    }
  }
}

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

function collectIndex(doc: ProseNode) {
  const counts = new Map<string, number>()
  doc.descendants((node) => {
    if (!node.isText) {
      return
    }
    for (const mark of node.marks) {
      if (mark.type.name !== "indexEntry") {
        continue
      }
      const term = String(mark.attrs.term || node.text || "")
        .replace(/\s+/g, " ")
        .trim()
      if (!term) {
        continue
      }
      counts.set(term, (counts.get(term) ?? 0) + 1)
    }
  })
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { sensitivity: "base" }))
    .map(([term, count]) => ({ term, count }))
}

function paintIndex(dom: HTMLElement, doc: ProseNode) {
  dom.className = "document-index"
  dom.replaceChildren()
  const title = document.createElement("p")
  title.className = "document-index-title"
  title.textContent = "Index"
  dom.append(title)
  const rows = collectIndex(doc)
  if (rows.length === 0) {
    const empty = document.createElement("p")
    empty.textContent = "No index entries yet."
    dom.append(empty)
    return
  }
  for (const row of rows) {
    const line = document.createElement("p")
    line.className = "document-index-row"
    line.textContent = `${row.term}\t${row.count}`
    dom.append(line)
  }
}

export const DocumentIndex = Node.create({
  name: "documentIndex",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      stamp: {
        default: 0,
        parseHTML: (element) => Number(element.getAttribute("data-stamp")) || 0,
        renderHTML: (attributes) => ({ "data-stamp": String(attributes.stamp ?? 0) }),
      },
    }
  },
  parseHTML() {
    return [{ tag: "div[data-document-index]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-document-index": "", class: "document-index" })]
  },
  addNodeView() {
    return ({ editor }) => {
      const dom = document.createElement("div")
      const paint = () => paintIndex(dom, editor.state.doc)
      paint()
      const onUpdate = () => paint()
      editor.on("update", onUpdate)
      return {
        dom,
        update(next) {
          if (next.type.name !== "documentIndex") {
            return false
          }
          paint()
          return true
        },
        destroy() {
          editor.off("update", onUpdate)
        },
      }
    }
  },
  addCommands() {
    return {
      markIndexEntry:
        (term) =>
        ({ editor, state }) => {
          const selected = state.doc.textBetween(state.selection.from, state.selection.to, " ").trim()
          const value = (term ?? selected).replace(/\s+/g, " ").trim().slice(0, 80)
          if (!value) {
            return false
          }
          const chain = chainWithSelection(editor)
          if (state.selection.empty) {
            return chain
              .insertContent({ type: "text", text: value, marks: [{ type: "indexEntry", attrs: { term: value } }] })
              .run()
          }
          return chain.setMark("indexEntry", { term: value }).run()
        },
      insertDocumentIndex:
        () =>
        ({ state, tr }) => {
          const type = state.schema.nodes.documentIndex
          if (!type) {
            return false
          }
          const node = type.create({ stamp: Date.now() })
          const pos = state.selection.to
          tr.insert(pos, node)
          tr.setSelection(NodeSelection.create(tr.doc, pos))
          return true
        },
      updateDocumentIndex:
        () =>
        ({ state, tr }) => {
          let updated = false
          state.doc.descendants((node, pos) => {
            if (node.type.name === "documentIndex") {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, stamp: Date.now() })
              updated = true
            }
          })
          return updated
        },
    }
  },
})
