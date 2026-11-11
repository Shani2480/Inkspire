import { Node, mergeAttributes, type Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
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
