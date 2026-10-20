import { Node, mergeAttributes } from "@tiptap/core"

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
        ({ chain }) =>
          chain()
            .insertContent({
              type: "sectionBreak",
              attrs: { kind, sectionId: crypto.randomUUID() },
            })
            .run(),
    }
  },
})
