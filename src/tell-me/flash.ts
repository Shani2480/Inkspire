import { Extension } from "@tiptap/core"
import type { Editor } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

type FlashState = { from: number; to: number } | null

const flashKey = new PluginKey<FlashState>("tellMeFlash")
let clearTimer: number | null = null

export function flashDocumentRange(editor: Editor, from: number, to: number) {
  if (clearTimer != null) {
    window.clearTimeout(clearTimer)
    clearTimer = null
  }
  editor.view.dispatch(editor.state.tr.setMeta(flashKey, { from, to }))
  clearTimer = window.setTimeout(() => {
    clearTimer = null
    if (!editor.isDestroyed) {
      editor.view.dispatch(editor.state.tr.setMeta(flashKey, null))
    }
  }, 900)
}

export const TellMeFlash = Extension.create({
  name: "tellMeFlash",

  addProseMirrorPlugins() {
    return [
      new Plugin<FlashState>({
        key: flashKey,
        state: {
          init: () => null,
          apply(tr, value) {
            if (tr.getMeta(flashKey) !== undefined) {
              return tr.getMeta(flashKey) as FlashState
            }
            if (tr.docChanged) {
              return null
            }
            return value
          },
        },
        props: {
          decorations(state) {
            const flash = flashKey.getState(state)
            if (!flash) {
              return null
            }
            return DecorationSet.create(state.doc, [
              Decoration.inline(flash.from, flash.to, { class: "tell-me-flash" }),
            ])
          },
        },
      }),
    ]
  },
})
