import { Node, mergeAttributes, type Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { Plugin } from "@tiptap/pm/state"
import { sectionAtPosition, type SectionChrome } from "@/document/sections"
import { insertSection, useDocumentStore } from "@/document/store"

export type SectionBreakKind = "nextPage" | "continuous" | "evenPage" | "oddPage"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    sectionBreak: {
      insertSectionBreak: (kind?: SectionBreakKind) => ReturnType
    }
  }
}

export const SectionBreak = Node.create({
  name: "sectionBreak",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      kind: {
        default: "nextPage",
        parseHTML: (element) => {
          const kind = element.getAttribute("data-kind")
          return kind === "continuous" || kind === "evenPage" || kind === "oddPage" ? kind : "nextPage"
        },
        renderHTML: (attributes) => ({ "data-kind": attributes.kind || "nextPage" }),
      },
      sectionId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-section") || "",
        renderHTML: (attributes) => (attributes.sectionId ? { "data-section": attributes.sectionId } : {}),
      },
    }
  },
  parseHTML() {
    return [{ tag: "div[data-section-break]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-section-break": "",
        class: "section-break",
        contenteditable: "false",
      }),
      ["span", { class: "section-break-label" }, "Section Break"],
    ]
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div")
      dom.setAttribute("data-section-break", "")
      dom.className = "section-break"
      dom.contentEditable = "false"
      const label = document.createElement("span")
      label.className = "section-break-label"
      const paint = () => {
        const kind = String(node.attrs.kind || "nextPage") as SectionBreakKind
        label.textContent =
          kind === "continuous"
            ? "Section Break (Continuous)"
            : kind === "evenPage"
              ? "Section Break (Even Page)"
              : kind === "oddPage"
                ? "Section Break (Odd Page)"
                : "Section Break (Next Page)"
        dom.dataset.kind = kind
        if (kind === "continuous") {
          dom.style.breakAfter = "auto"
        } else if (kind === "evenPage") {
          dom.style.breakAfter = "left"
        } else if (kind === "oddPage") {
          dom.style.breakAfter = "right"
        } else {
          dom.style.breakAfter = "page"
        }
      }
      paint()
      dom.append(label)
      return {
        dom,
        update(updated) {
          if (updated.type.name !== "sectionBreak") {
            return false
          }
          node = updated
          paint()
          return true
        },
      }
    }
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        view: () => ({
          update(view, previous) {
            if (!previous.doc.eq(view.state.doc)) {
              followSectionBreaks(previous.doc, view.state.doc)
            }
          },
        }),
      }),
    ]
  },
  addCommands() {
    return {
      insertSectionBreak:
        (kind = "nextPage") =>
        ({ chain, editor }) => {
          const sectionId = crypto.randomUUID()
          // A break that starts a page ends a section of its own, with its own Page Setup (a continuous one is
          // drawn on the pages of the section it is in).
          if (kind !== "continuous" && editor.isEditable) {
            insertSection(sectionId, caretSection(editor)?.key ?? null)
          }
          return chain().insertContent({ type: "sectionBreak", attrs: { kind, sectionId } }).run()
        },
    }
  },
})

/** Sections whose break an edit took away, by key, with where they were, until an edit (undo) brings it back. */
const setAside = new Map<string, { section: SectionChrome; index: number }>()

function breakKeys(doc: ProseNode) {
  const keys = new Set<string>()
  doc.descendants((node) => {
    if (node.type.name === "sectionBreak" && node.attrs.kind !== "continuous" && node.attrs.sectionId) {
      keys.add(String(node.attrs.sectionId))
    }
    return node.isBlock
  })
  return keys
}

/**
 * Keeps the store's sections to those whose break is in the body: deleting a break sets its section aside (it would
 * still count, e.g. its columns in `columnsBlockwise`), and undo bringing the break back restores it where it was.
 * A new document (no key in common with the one before) starts afresh.
 */
export function followSectionBreaks(before: ProseNode, after: ProseNode) {
  const was = breakKeys(before)
  const now = breakKeys(after)
  const removed = [...was].filter((key) => !now.has(key))
  const added = [...now].filter((key) => !was.has(key))
  if (was.size > 0 && removed.length === was.size && added.length > 0) {
    setAside.clear()
    return
  }
  if (removed.length === 0 && !added.some((key) => setAside.has(key))) {
    return
  }
  useDocumentStore.setState((state) => {
    const sections = [...state.sections]
    for (const key of removed) {
      const index = sections.findIndex((item) => item.key === key)
      if (index >= 0) {
        setAside.set(key, { section: sections[index]!, index })
        sections.splice(index, 1)
      }
    }
    for (const key of added) {
      const kept = setAside.get(key)
      if (kept && !sections.some((item) => item.key === key)) {
        sections.splice(Math.min(kept.index, sections.length), 0, kept.section)
        setAside.delete(key)
      }
    }
    return { sections }
  })
}

/** The section breaks of `doc` that start a page, in order: where each is and the key of the section it ends. */
export function pageSectionBreaks(doc: ProseNode): { pos: number; key: string }[] {
  const breaks: { pos: number; key: string }[] = []
  doc.forEach((node, pos) => {
    if (node.type.name === "sectionBreak" && node.attrs.kind !== "continuous") {
      breaks.push({ pos, key: String(node.attrs.sectionId || "") })
    }
  })
  return breaks
}

/** The section the body's caret is in (a section before the last), or `null` for the document's own last section. */
export function caretSection(editor: Editor | null): SectionChrome | null {
  const sections = useDocumentStore.getState().sections
  if (!editor || sections.length === 0) {
    return null
  }
  return sectionAtPosition(sections, pageSectionBreaks(editor.state.doc), editor.state.selection.from)
}
