import { Extension } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"

/**
 * An In margin drop cap hangs wholly left of the text, as Word's, so the lines beside it start at the text's edge.
 * CSS can't know how wide the letter is drawn (its size follows the lines it drops), so it is measured after each
 * draw and given to the paragraph as `--drop-w`, a decoration: the DOM ProseMirror owns is never written to.
 */

type Widths = Map<number, number>
type WidthState = { widths: Widths; decorations: DecorationSet }

const key = new PluginKey<WidthState>("dropCapWidth")

function marginCaps(doc: ProseNode) {
  const found: number[] = []
  doc.descendants((node, pos) => {
    if (node.attrs.dropCap === "margin") {
      found.push(pos)
    }
    return !node.isTextblock
  })
  return found
}

function build(doc: ProseNode, widths: Widths): WidthState {
  const decorations: Decoration[] = []
  for (const pos of marginCaps(doc)) {
    const node = doc.nodeAt(pos)
    const width = widths.get(pos)
    if (node && width) {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { style: `--drop-w: ${width}px` }))
    }
  }
  return { widths, decorations: decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty }
}

/** The drawn width of each margin drop cap's letter, in layout pixels (unaffected by zoom). */
function measure(view: EditorView) {
  const widths: Widths = new Map()
  for (const pos of marginCaps(view.state.doc)) {
    const element = view.nodeDOM(pos)
    if (!(element instanceof HTMLElement) || !element.offsetWidth) {
      continue
    }
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const text = walker.nextNode()
    if (!text?.textContent) {
      continue
    }
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, [...text.textContent][0]!.length)
    const zoom = element.getBoundingClientRect().width / element.offsetWidth || 1
    const width = range.getBoundingClientRect().width / zoom
    if (width > 0) {
      widths.set(pos, Math.round(width * 10) / 10)
    }
  }
  return widths
}

function same(left: Widths, right: Widths) {
  return left.size === right.size && [...left].every(([pos, width]) => Math.abs((right.get(pos) ?? -1) - width) < 0.5)
}

export const DropCapWidth = Extension.create({
  name: "dropCapWidth",

  addProseMirrorPlugins() {
    return [
      new Plugin<WidthState>({
        key,
        state: {
          init: (_, state) => build(state.doc, new Map()),
          apply: (tr, old) => {
            const widths = tr.getMeta(key) as Widths | undefined
            if (widths) {
              return build(tr.doc, widths)
            }
            if (!tr.docChanged) {
              return old
            }
            const mapped: Widths = new Map()
            for (const [pos, width] of old.widths) {
              mapped.set(tr.mapping.map(pos), width)
            }
            return build(tr.doc, mapped)
          },
        },
        props: {
          decorations: (state) => key.getState(state)?.decorations,
        },
        view(view) {
          let frame = 0
          const check = () => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(() => {
              if (view.isDestroyed) {
                return
              }
              const widths = measure(view)
              if (!same(widths, key.getState(view.state)?.widths ?? new Map())) {
                view.dispatch(view.state.tr.setMeta(key, widths).setMeta("addToHistory", false))
              }
            })
          }
          check()
          return {
            update: check,
            destroy: () => cancelAnimationFrame(frame),
          }
        },
      }),
    ]
  },
})
