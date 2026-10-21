import { Node, mergeAttributes } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { BUILT_IN_EQUATIONS } from "@/editor/equation-gallery"
import { texFromTyped } from "@/editor/equation-templates"
import { katexIfLoaded, loadKatex } from "@/lib/katex-lazy"

export const EQUATION_PRESETS = BUILT_IN_EQUATIONS

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    equation: {
      insertEquation: (tex: string) => ReturnType
    }
  }
}

function paintEquation(dom: HTMLElement, tex: string) {
  const draw = (katex: NonNullable<ReturnType<typeof katexIfLoaded>>) => {
    try {
      katex.render(texFromTyped(tex) || "x", dom, { throwOnError: false, displayMode: false })
    } catch {
      dom.textContent = tex
    }
  }
  const ready = katexIfLoaded()
  if (ready) {
    draw(ready)
    return
  }
  // The source shows until the library arrives, which is moments after the first equation is asked for.
  dom.textContent = tex
  void loadKatex().then((katex) => {
    if (dom.isConnected) {
      draw(katex)
    }
  })
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
