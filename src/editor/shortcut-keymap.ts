import { comboFromEvent, NOT_REPEATED, shortcutFor } from "@/editor/shortcuts"
import { noteRepeatable } from "@/editor/word-keys"
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
            if (found.blocked) {
              return true
            }
            const done = found.def.run(editor)
            if (done && !NOT_REPEATED.has(found.def.id)) {
              noteRepeatable(found.def.run)
            }
            return done
          },
        },
      }),
    ]
  },
})
