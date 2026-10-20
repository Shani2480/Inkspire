import { revealCaretPage } from "@/editor/page-break"
import { pageMetrics } from "@/document/page-setup"
import { useDocumentStore } from "@/document/store"
import { Node, mergeAttributes } from "@tiptap/core"
import { Fragment } from "@tiptap/pm/model"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import { canSplit } from "@tiptap/pm/transform"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blankPage: {
      setBlankPage: () => ReturnType
    }
  }
}

export const BlankPage = Node.create({
  name: "blankPage",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "div[data-blank-page]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-blank-page": "", class: "blank-page" })]
  },

  addNodeView() {
    return () => {
      const dom = document.createElement("div")
      dom.dataset.blankPage = ""
      dom.className = "blank-page"
      const sync = () => {
        dom.style.height = `${pageMetrics(useDocumentStore.getState().pageSetup).contentHeight}px`
      }
      sync()
      const unsubscribe = useDocumentStore.subscribe((state, previous) => {
        if (state.pageSetup !== previous.pageSetup) {
          sync()
        }
      })
      return {
        dom,
        ignoreMutation: () => true,
        destroy() {
          unsubscribe()
        },
      }
    }
  },

  addCommands() {
    return {
      setBlankPage:
        () =>
        ({ state, tr }) => {
          const pageBreak = state.schema.nodes.pageBreak
          const blankPage = state.schema.nodes.blankPage
          if (!pageBreak || !blankPage) {
            return false
          }

          let pos = state.selection.from
          if (state.selection instanceof NodeSelection && state.selection.node.type === pageBreak) {
            pos = state.selection.from + state.selection.node.nodeSize
          }
          const $start = tr.doc.resolve(pos)
          const splitsParagraph =
            $start.parent.isTextblock && $start.parentOffset > 0 && $start.parentOffset < $start.parent.content.size
          if (splitsParagraph) {
            if (!canSplit(tr.doc, pos)) {
              return false
            }
            tr.split(pos)
            pos = tr.mapping.map(pos)
          }

          const $from = tr.doc.resolve(pos)
          const insertAt = $from.parent.isTextblock
            ? $from.parentOffset === 0
              ? $from.before()
              : $from.after()
            : $from.pos
          const leadingBreak = tr.doc.resolve(insertAt).nodeBefore?.type === pageBreak ? [] : [pageBreak.create()]
          const block = Fragment.from([...leadingBreak, blankPage.create(), pageBreak.create()])
          tr.insert(insertAt, block)
          const after = insertAt + block.size
          const paragraph = state.schema.nodes.paragraph
          if (paragraph && !tr.doc.nodeAt(after)) {
            tr.insert(after, paragraph.create())
          }
          const caret = TextSelection.findFrom(tr.doc.resolve(Math.min(after, tr.doc.content.size)), 1, true)
          if (caret) {
            tr.setSelection(caret)
          }
          revealCaretPage(tr)
          return true
        },
    }
  },
})
