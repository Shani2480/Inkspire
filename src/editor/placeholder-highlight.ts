import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

const placeholderPattern = /\[[^\[\]\r\n]{1,80}\]/g

export const PlaceholderHighlight = Extension.create({
  name: "placeholderHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("placeholderHighlight"),
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) {
                return
              }
              placeholderPattern.lastIndex = 0
              for (const match of node.text.matchAll(placeholderPattern)) {
                const from = pos + (match.index ?? 0)
                decorations.push(
                  Decoration.inline(from, from + match[0].length, {
                    class: "template-placeholder",
                  }),
                )
              }
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
