import { comboFromEvent, shortcutFor } from "@/editor/shortcuts"
import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"

/** Word's keyboard shortcuts, and the user's own, for the editor. First in line, so they win over the editor's. */
export const ShortcutKeymap = Extension.create({
  name: "shortcutKeymap",
  priority: 1100,

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey("shortcutKeymap"),
        props: {
          handleKeyDown: (_view, event) => {
            const combo = comboFromEvent(event)
            if (
              !combo ||
              (!event.ctrlKey && !event.metaKey && !event.altKey && !/^(F\d+)$/.test(combo.split("+").pop()!))
            ) {
              return false
            }
            const found = shortcutFor(combo)
            if (!found) {
              return false
            }
            event.preventDefault()
            return found.blocked ? true : found.def.run(editor)
          },
        },
      }),
    ]
  },
})
