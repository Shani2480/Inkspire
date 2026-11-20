import { Extension } from "@tiptap/core"
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state"
import { currentDevice } from "@/lib/device"

/**
 * On a phone or tablet, a selected picture, shape or other object keeps the on-screen keyboard down: nothing is typed
 * into it, and the keyboard covered half the page while its handles were dragged. The keyboard comes back as soon as
 * the caret is in text again.
 */
export function keyboardMode(selection: unknown, device: string) {
  return device !== "desktop" && selection instanceof NodeSelection && !selection.node.isText ? "none" : null
}

export const ObjectKeyboard = Extension.create({
  name: "objectKeyboard",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("objectKeyboard"),
        view: (view) => {
          const apply = () => {
            const mode = keyboardMode(view.state.selection, currentDevice())
            if (mode) {
              view.dom.setAttribute("inputmode", mode)
            } else if (view.dom.hasAttribute("inputmode")) {
              view.dom.removeAttribute("inputmode")
            }
          }
          apply()
          return { update: apply }
        },
      }),
    ]
  },
})
