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

function paintEquation(dom: HTMLElement, tex: string, display: boolean) {
  const draw = (katex: NonNullable<ReturnType<typeof katexIfLoaded>>) => {
    try {
      katex.render(texFromTyped(tex) || "x", dom, { throwOnError: false, displayMode: display })
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
      /** On a line of its own, centred and drawn full size (Word's Display), rather than in the line of text. */
      display: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-display") === "1",
        renderHTML: (attributes) => (attributes.display ? { "data-display": "1" } : {}),
      },
      /**
       * Word's own markup for an equation read from a .docx, and the LaTeX it was read as: while the LaTeX is
       * unchanged the equation is saved as Word wrote it (see `equationOmml`).
       */
      omml: {
        default: null as string | null,
        parseHTML: (element) => element.getAttribute("data-omml"),
        renderHTML: (attributes) => (attributes.omml ? { "data-omml": attributes.omml } : {}),
      },
      ommlTex: {
        default: null as string | null,
        parseHTML: (element) => element.getAttribute("data-omml-tex"),
        renderHTML: (attributes) => (attributes.ommlTex ? { "data-omml-tex": attributes.ommlTex } : {}),
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
      const paint = (current: ProseNode) => {
        const display = current.attrs.display === true
        dom.classList.toggle("equation-display", display)
        paintEquation(dom, String(current.attrs.tex ?? ""), display)
      }
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
        ({ commands, state }) =>
          // On an empty line Word makes a display equation, set apart and centred; within text, an inline one.
          commands.insertContent({
            type: this.name,
            attrs: { tex: tex.trim() || "x=y", display: state.selection.$from.parent.content.size === 0 },
          }),
    }
  },
})
