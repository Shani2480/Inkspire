import { Node, mergeAttributes } from "@tiptap/core"
import { Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      setPageBreak: () => ReturnType
    }
  }
}

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "div[data-page-break]" }, { tag: "div.page-break" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-page-break": "",
        class: "page-break",
      }),
    ]
  },

  addProseMirrorPlugins() {
    return [revealPagePlugin()]
  },

  // Word's Ctrl+Enter (Cmd+Enter on macOS).
  addKeyboardShortcuts() {
    return {
      "Mod-Enter": () => this.editor.commands.setPageBreak(),
    }
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ commands, state, tr }) => {
          const { $from } = state.selection
          const splitsParagraph =
            $from.parent.isTextblock && $from.parentOffset > 0 && $from.parentOffset < $from.parent.content.size
          if (splitsParagraph && !commands.splitBlock()) {
            return false
          }
          if (!commands.insertContent({ type: this.name })) {
            return false
          }

          const selected = tr.doc.nodeAt(tr.selection.from)
          if (selected?.type.name === this.name) {
            const after = tr.selection.from + selected.nodeSize
            const paragraph = state.schema.nodes.paragraph
            if (paragraph && !tr.doc.nodeAt(after)) {
              tr.insert(after, paragraph.create())
            }
            const caret = TextSelection.findFrom(tr.doc.resolve(after), 1, true)
            if (caret) {
              tr.setSelection(caret)
            }
          }
          revealCaretPage(tr)
          return true
        },
    }
  },
})

const revealKey = new PluginKey<number>("revealCaretPage")

/** Marks a transaction whose caret starts a new page: once the pages are laid out, that page is brought into view. */
export function revealCaretPage(tr: Transaction) {
  return tr.setMeta(revealKey, true)
}

/** Frames to wait for the pages to settle before giving up. */
const MAX_FRAMES = 90
/** Space left above the page's top edge when it is scrolled to. */
const PAGE_MARGIN = 24

/**
 * As in Word, a page break shows the new page with the caret on it. The pages are laid out a few frames after the
 * edit, so the scroll waits until the caret has stopped moving.
 */
function revealPagePlugin() {
  return new Plugin<number>({
    key: revealKey,
    state: {
      init: () => 0,
      apply: (tr, count) => (tr.getMeta(revealKey) ? count + 1 : count),
    },
    view() {
      let seen = 0
      let frame = 0
      return {
        update(view) {
          const count = revealKey.getState(view.state) ?? 0
          if (count === seen) {
            return
          }
          seen = count
          cancelAnimationFrame(frame)
          let last = Number.NaN
          let steady = 0
          let frames = 0
          const step = () => {
            if (view.isDestroyed) {
              return
            }
            const top = caretTop(view)
            steady = top === last ? steady + 1 : 0
            last = top
            frames += 1
            if (steady >= 3 || frames >= MAX_FRAMES) {
              showCaretPage(view)
              return
            }
            frame = requestAnimationFrame(step)
          }
          frame = requestAnimationFrame(step)
        },
        destroy() {
          cancelAnimationFrame(frame)
        },
      }
    },
  })
}

function caretTop(view: EditorView) {
  try {
    return Math.round(view.coordsAtPos(view.state.selection.head).top)
  } catch {
    return Number.NaN
  }
}

function showCaretPage(view: EditorView) {
  const scroller = view.dom.closest<HTMLElement>("#document-scroll")
  if (!scroller) {
    view.focus()
    return
  }
  const caret = view.coordsAtPos(view.state.selection.head)
  const box = scroller.getBoundingClientRect()
  const sheet = [...scroller.querySelectorAll<HTMLElement>(".page-sheet")].find((element) => {
    const rect = element.getBoundingClientRect()
    return caret.top >= rect.top && caret.top <= rect.bottom
  })
  const pageTop = sheet?.getBoundingClientRect().top ?? caret.top
  const caretShown = caret.top >= box.top && caret.bottom <= box.bottom
  const pageTopShown = pageTop >= box.top && pageTop <= box.bottom
  if (!caretShown || !pageTopShown) {
    scroller.scrollTop += pageTop - box.top - PAGE_MARGIN
  }
  view.focus()
}
