import { Mark, Node, mergeAttributes } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { NodeSelection } from "@tiptap/pm/state"
import { chainWithSelection } from "@/editor/selection-memory"

export const AUTHORITY_CATEGORIES = [
  "Cases",
  "Statutes",
  "Other Authorities",
  "Rules",
  "Treatises",
  "Regulations",
  "Constitutional Provisions",
] as const

export type AuthorityCategory = (typeof AUTHORITY_CATEGORIES)[number]

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    authorities: {
      markAuthority: (category?: AuthorityCategory, text?: string) => ReturnType
      insertAuthoritiesTable: () => ReturnType
      updateAuthoritiesTable: () => ReturnType
    }
  }
}

export const AuthorityMark = Mark.create({
  name: "authority",
  excludes: "",
  inclusive: false,
  addAttributes() {
    return {
      category: {
        default: "Cases",
        parseHTML: (element) => element.getAttribute("data-authority-cat") || "Cases",
        renderHTML: (attributes) => ({ "data-authority-cat": attributes.category || "Cases" }),
      },
      text: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-authority") || element.textContent || "",
        renderHTML: (attributes) => ({ "data-authority": attributes.text || "" }),
      },
    }
  },
  parseHTML() {
    return [{ tag: "span[data-authority]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "authority-mark" }), 0]
  },
})

function collectAuthorities(doc: ProseNode) {
  const groups = new Map<string, Set<string>>()
  doc.descendants((node) => {
    if (!node.isText) {
      return
    }
    for (const mark of node.marks) {
      if (mark.type.name !== "authority") {
        continue
      }
      const category = String(mark.attrs.category || "Other Authorities")
      const text = String(mark.attrs.text || node.text || "")
        .replace(/\s+/g, " ")
        .trim()
      if (!text) {
        continue
      }
      const bucket = groups.get(category) ?? new Set<string>()
      bucket.add(text)
      groups.set(category, bucket)
    }
  })
  return AUTHORITY_CATEGORIES.flatMap((category) => {
    const items = [...(groups.get(category) ?? [])].sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" }),
    )
    return items.length ? [{ category, items }] : []
  })
}

function paintAuthorities(dom: HTMLElement, doc: ProseNode) {
  dom.className = "authorities-table"
  dom.replaceChildren()
  const title = document.createElement("p")
  title.className = "authorities-title"
  title.textContent = "Table of Authorities"
  dom.append(title)
  const groups = collectAuthorities(doc)
  if (groups.length === 0) {
    const empty = document.createElement("p")
    empty.textContent = "No citations marked yet."
    dom.append(empty)
    return
  }
  for (const group of groups) {
    const heading = document.createElement("p")
    heading.className = "authorities-heading"
    heading.textContent = group.category
    dom.append(heading)
    for (const item of group.items) {
      const line = document.createElement("p")
      line.className = "authorities-row"
      line.textContent = item
      dom.append(line)
    }
  }
}

export const AuthoritiesTable = Node.create({
  name: "authoritiesTable",
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
    return [{ tag: "div[data-authorities-table]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-authorities-table": "", class: "authorities-table" })]
  },
  addNodeView() {
    return ({ editor }) => {
      const dom = document.createElement("div")
      const paint = () => paintAuthorities(dom, editor.state.doc)
      paint()
      const onUpdate = () => paint()
      editor.on("update", onUpdate)
      return {
        dom,
        update(next) {
          if (next.type.name !== "authoritiesTable") {
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
      markAuthority:
        (category, text) =>
        ({ editor, state }) => {
          const selected = state.doc.textBetween(state.selection.from, state.selection.to, " ").trim()
          const value = (text ?? selected).replace(/\s+/g, " ").trim().slice(0, 160)
          const cat = category && AUTHORITY_CATEGORIES.includes(category) ? category : "Cases"
          if (!value) {
            return false
          }
          const chain = chainWithSelection(editor)
          if (state.selection.empty) {
            return chain
              .insertContent({
                type: "text",
                text: value,
                marks: [{ type: "authority", attrs: { category: cat, text: value } }],
              })
              .run()
          }
          return chain.setMark("authority", { category: cat, text: value }).run()
        },
      insertAuthoritiesTable:
        () =>
        ({ state, tr }) => {
          const type = state.schema.nodes.authoritiesTable
          if (!type) {
            return false
          }
          const node = type.create({ stamp: Date.now() })
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
      updateAuthoritiesTable:
        () =>
        ({ state, tr }) => {
          let updated = false
          state.doc.descendants((node, pos) => {
            if (node.type.name === "authoritiesTable") {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, stamp: Date.now() })
              updated = true
            }
          })
          return updated
        },
    }
  },
})
