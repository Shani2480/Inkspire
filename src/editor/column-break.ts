import { Node, mergeAttributes } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columnBreak: {
      setColumnBreak: () => ReturnType
    }
  }
}

export const ColumnBreak = Node.create({
  name: "columnBreak",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "div[data-column-break]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-column-break": "",
        class: "column-break",
      }),
    ]
  },

  addNodeView() {
    return () => {
      const dom = document.createElement("div")
      dom.setAttribute("data-column-break", "")
      dom.className = "column-break"
      dom.contentEditable = "false"
      const label = document.createElement("span")
      label.className = "column-break-label"
      label.textContent = "Column Break"
      dom.append(label)
      return {
        dom,
        ignoreMutation: () => true,
        selectNode() {
          dom.classList.add("ProseMirror-selectednode")
        },
        deselectNode() {
          dom.classList.remove("ProseMirror-selectednode")
        },
      }
    }
  },

  // Word's Ctrl+Shift+Enter.
  addKeyboardShortcuts() {
    return {
      "Mod-Shift-Enter": () => this.editor.commands.setColumnBreak(),
    }
  },

  addCommands() {
    return {
      setColumnBreak:
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
          return true
        },
    }
  },
})
