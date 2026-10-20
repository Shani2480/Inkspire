import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

const key = new PluginKey<boolean>("inactiveSelection")

/**
 * Keeps selected text visibly selected while focus is somewhere else (the AI chat, a dialog, the ribbon), as Word
 * does, so a person can select a passage and then type a request about it without the selection seeming to vanish.
 */
export const InactiveSelection = Extension.create({
  name: "inactiveSelection",

  addProseMirrorPlugins() {
    return [
      new Plugin<boolean>({
        key,
        state: {
          init: () => true,
          apply: (transaction, focused) => {
            const next = transaction.getMeta(key) as boolean | undefined
            return next === undefined ? focused : next
          },
        },
        props: {
          decorations(state) {
            const { selection } = state
            if (key.getState(state) !== false || selection.empty || !(selection instanceof TextSelection)) {
              return null
            }
            return DecorationSet.create(state.doc, [
              Decoration.inline(selection.from, selection.to, { class: "inactive-selection" }),
            ])
          },
          handleDOMEvents: {
            focus: (view) => {
              view.dispatch(view.state.tr.setMeta(key, true))
              return false
            },
            blur: (view) => {
              view.dispatch(view.state.tr.setMeta(key, false))
              return false
            },
          },
        },
      }),
    ]
  },
})
