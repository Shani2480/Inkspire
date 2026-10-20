import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

/**
 * Triple-click / triple-tap selects the current visual line (Word-like line select).
 * ProseMirror’s default expands to the whole textblock; we intentionally take the line only.
 */
export const TripleClickSelectAll = Extension.create({
  name: "tripleClickSelectAll",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("tripleClickSelectAll"),
        props: {
          handleTripleClick(view, pos) {
            const range = visualLineRange(view, pos)
            if (!range) {
              return false
            }
            const selection = TextSelection.between(
              view.state.doc.resolve(range.from),
              view.state.doc.resolve(range.to),
            )
            view.dispatch(view.state.tr.setSelection(selection).scrollIntoView())
            view.focus()
            return true
          },
        },
      }),
    ]
  },
})

function visualLineRange(view: EditorView, pos: number) {
  let position = Math.max(0, Math.min(pos, view.state.doc.content.size))
  let $pos = view.state.doc.resolve(position)
  if (!$pos.parent.isTextblock && position > 0) {
    position -= 1
    $pos = view.state.doc.resolve(position)
  }
  if (!$pos.parent.isTextblock) {
    return null
  }
  const blockStart = $pos.start()
  const blockEnd = $pos.end()
  if (blockStart === blockEnd) {
    return { from: blockStart, to: blockEnd }
  }
  const probe = Math.min(Math.max(position, blockStart), blockEnd)
  let top: number
  try {
    top = view.coordsAtPos(probe, -1).top
  } catch {
    return { from: blockStart, to: blockEnd }
  }
  return {
    from: lineEdge(view, blockStart, probe, top, true),
    to: lineEdge(view, probe, blockEnd, top, false),
  }
}

function lineEdge(view: EditorView, lo: number, hi: number, top: number, towardStart: boolean) {
  let low = lo
  let high = hi
  if (towardStart) {
    while (low < high) {
      const mid = (low + high) >> 1
      if (sameLine(view, mid, top)) {
        high = mid
      } else {
        low = mid + 1
      }
    }
    return low
  }
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (sameLine(view, Math.max(lo, mid - 1), top)) {
      low = mid
    } else {
      high = mid - 1
    }
  }
  return low
}

function sameLine(view: EditorView, pos: number, top: number) {
  try {
    return Math.abs(view.coordsAtPos(pos, -1).top - top) <= 3
  } catch {
    return false
  }
}
