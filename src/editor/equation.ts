import { Node, mergeAttributes } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { BUILT_IN_EQUATIONS } from "@/editor/equation-gallery"
import { texFromTyped } from "@/editor/equation-templates"
import katex from "katex"
import "katex/dist/katex.min.css"

export const EQUATION_PRESETS = BUILT_IN_EQUATIONS

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    equation: {
      insertEquation: (tex: string) => ReturnType
    }
  }
}

function paintEquation(dom: HTMLElement, tex: string) {
  try {
    katex.render(texFromTyped(tex) || "x", dom, { throwOnError: false, displayMode: false })
  } catch {
    dom.textContent = tex
  }
}

export const Equation = Node.create({
  name: "equation",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      tex: {
        default: "x=y",
        parseHTML: (element) => element.getAttribute("data-tex") || "x=y",
        renderHTML: (attributes) => ({ "data-tex": attributes.tex }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-equation]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-equation": "", class: "equation" })]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span")
      dom.className = "equation"
      dom.contentEditable = "false"
      const paint = (current: ProseNode) => paintEquation(dom, String(current.attrs.tex ?? ""))
      paint(node)
      return {
        dom,
        update(next) {
          if (next.type.name !== "equation") {
            return false
          }
          paint(next)
          return true
        },
      }
    }
  },

  addCommands() {
    return {
      insertEquation:
        (tex) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { tex: tex.trim() || "x=y" } }),
    }
  },
})
