import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"

/** Triple-click / triple-tap selects the whole paragraph, as Word does. */
export const TripleClickSelectAll = Extension.create({
  name: "tripleClickSelectAll",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("tripleClickSelectAll"),
        props: {
          handleTripleClick(view, pos) {
            let $pos = view.state.doc.resolve(Math.max(0, Math.min(pos, view.state.doc.content.size)))
            if (!$pos.parent.isTextblock && pos > 0) {
              $pos = view.state.doc.resolve(pos - 1)
            }
            if (!$pos.parent.isTextblock) {
              return false
            }
            const selection = TextSelection.create(view.state.doc, $pos.start(), $pos.end())
            view.dispatch(view.state.tr.setSelection(selection).scrollIntoView())
            view.focus()
            return true
          },
        },
      }),
    ]
  },
})
