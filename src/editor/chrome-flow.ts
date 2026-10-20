import { Extension } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { isFloating, objectAnchoring, placeFlowObjects } from "@/editor/objects"

/**
 * A header or footer has no pages to lay out, so what the paginator does for the body is done here: an object that
 * moves with text lands at the bottom of the text above it plus its offset (`dy`), measured from the box's corner.
 */
function placeAnchored(view: EditorView) {
  const placements: { pos: number; page: number; y: number }[] = []
  let used = 0
  view.state.doc.forEach((node, pos) => {
    const dom = view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement)) {
      return
    }
    if (!isFloating(node)) {
      used = dom.offsetTop + dom.offsetHeight
      return
    }
    if (objectAnchoring(node.attrs.anchoring) === "move") {
      const from = node.attrs.relative === "margin" ? 0 : used
      placements.push({ pos, page: 1, y: Math.round(from + (Number(node.attrs.dy) || 0)) })
    }
  })
  placeFlowObjects(view, placements)
}

export const ChromeFlow = Extension.create({
  name: "chromeFlow",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        view(view) {
          const frame = requestAnimationFrame(() => placeAnchored(view))
          return {
            update: () => placeAnchored(view),
            destroy: () => cancelAnimationFrame(frame),
          }
        },
      }),
    ]
  },
})
