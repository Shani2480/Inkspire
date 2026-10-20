import { useViewStore } from "@/document/view"
import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

const SPACE = 32
const TAB = 9
const NBSP = 160

export const FormattingMarks = Extension.create({
  name: "formattingMarks",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("formattingMarks"),
        props: {
          decorations(state) {
            if (!useViewStore.getState().showFormattingMarks) {
              return null
            }

            const decorations: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (node.type.name === "docTab") {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: "fmt-tab",
                    "data-fmt": String(pos),
                  }),
                )
                return
              }

              if (node.type.name === "hardBreak") {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: "fmt-break",
                    "data-fmt": String(pos),
                  }),
                )
                return
              }

              if (node.type.name === "pageBreak") {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: "fmt-page-break",
                    "data-fmt": String(pos),
                  }),
                )
                return false
              }

              if (!node.isText || !node.text) {
                return
              }

              for (let index = 0; index < node.text.length; index += 1) {
                const code = node.text.charCodeAt(index)
                let className: string | null = null
                if (code === SPACE) {
                  className = "fmt-space"
                } else if (code === TAB) {
                  className = "fmt-tab"
                } else if (code === NBSP) {
                  className = "fmt-nbsp"
                }
                if (!className) {
                  continue
                }
                const from = pos + index
                decorations.push(
                  Decoration.inline(from, from + 1, {
                    class: className,
                    "data-fmt": String(from),
                  }),
                )
              }
            })

            if (decorations.length === 0) {
              return null
            }
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
