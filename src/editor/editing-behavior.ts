import { useEditingOptions } from "@/document/editing-options"
import { openExternal } from "@/document/help"
import { Extension } from "@tiptap/core"
import { Fragment, Slice, type Mark } from "@tiptap/pm/model"
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

/** Marks that Merge Formatting keeps: emphasis and links. Fonts, sizes, colours and highlights come from the destination. */
const MERGE_KEEPS = new Set(["bold", "italic", "underline", "strike", "link", "subscript", "superscript", "code"])

function filterMarks(fragment: Fragment, keep: (mark: Mark) => boolean): Fragment {
  const nodes: ReturnType<Fragment["child"]>[] = []
  fragment.forEach((node) => {
    const content = node.content.size ? filterMarks(node.content, keep) : node.content
    nodes.push(node.mark(node.marks.filter(keep)).copy(content))
  })
  return Fragment.fromArray(nodes)
}

/** A pasted slice with its character formatting reduced to what Merge Formatting keeps. */
export function mergedSlice(slice: Slice) {
  return new Slice(
    filterMarks(slice.content, (mark) => MERGE_KEEPS.has(mark.type.name)),
    slice.openStart,
    slice.openEnd,
  )
}

const FOLLOWED = /^(https?:|mailto:|tel:)/i

/** Opens a link: a web or mail address in the system, a `#name` link by scrolling to its bookmark. */
function followLink(href: string) {
  if (FOLLOWED.test(href)) {
    void openExternal(href)
  } else if (href.startsWith("#")) {
    document.getElementById(`bm-${href.slice(1).replace(/[^a-zA-Z0-9_-]/g, "-")}`)?.scrollIntoView({ block: "center" })
  }
}

function handleTextInput(view: EditorView, from: number, to: number, text: string) {
  const options = useEditingOptions.getState()
  const { state } = view
  if (from !== to && !options.typingReplacesSelection && state.selection.from === from && state.selection.to === to) {
    // Word's choice of not replacing: the text goes in front, and the selection stays on what it held.
    const tr = state.tr.insertText(text, from, from)
    tr.setSelection(TextSelection.create(tr.doc, from + text.length, to + text.length))
    view.dispatch(tr.scrollIntoView())
    return true
  }
  if (from === to && options.overtype) {
    const next = state.doc.resolve(from).nodeAfter
    if (next?.isText) {
      const tr = state.tr.insertText(text, from, from + 1)
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + text.length)).scrollIntoView())
      return true
    }
  }
  return false
}

/** Plain text as paragraphs, one for each line, open at both ends so the first and last join the paragraphs around them. */
function textSlice(view: EditorView, text: string) {
  const { paragraph } = view.state.schema.nodes
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  const nodes = lines.map((line) => paragraph!.create(null, line ? view.state.schema.text(line) : null))
  return new Slice(Fragment.from(nodes), 1, 1)
}

function handlePaste(view: EditorView, event: ClipboardEvent, slice: Slice) {
  const options = useEditingOptions.getState()
  const html = event.clipboardData?.getData("text/html") ?? ""
  const choice = html.includes("data-pm-slice") ? options.pasteSameDocument : options.pasteOtherPrograms
  if (choice === "text") {
    const text = event.clipboardData?.getData("text/plain") ?? ""
    if (!text) {
      return false
    }
    event.preventDefault()
    view.dispatch(view.state.tr.replaceSelection(textSlice(view, text)).scrollIntoView().setMeta("paste", true))
    return true
  }
  if (choice === "merge") {
    event.preventDefault()
    view.dispatch(view.state.tr.replaceSelection(mergedSlice(slice)).scrollIntoView().setMeta("paste", true))
    return true
  }
  return false
}

/** Options > Advanced > Editing options that change how typing, dragging, clicking and pasting behave (22.9). */
export const EditingBehavior = Extension.create({
  name: "editingBehavior",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("editingBehavior"),
        props: {
          handleTextInput,
          handlePaste,
          handleKeyDown(_view, event) {
            if (event.key === "Insert" && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
              const options = useEditingOptions.getState()
              if (options.insertKeyOvertype) {
                options.set({ overtype: !options.overtype })
                return true
              }
            }
            return false
          },
          handleClick(view, pos, event) {
            const link = view.state.doc
              .resolve(pos)
              .marks()
              .find((mark) => mark.type.name === "link")
            const href = link ? String(link.attrs.href ?? "") : ""
            const follow = useEditingOptions.getState().ctrlClickLink ? event.ctrlKey || event.metaKey : true
            if (!href || !follow || event.button !== 0) {
              return false
            }
            followLink(href)
            return true
          },
          handleDOMEvents: {
            dragstart(view, event) {
              const { selection } = view.state
              if (!useEditingOptions.getState().dragAndDrop && selection instanceof TextSelection && !selection.empty) {
                event.preventDefault()
                return true
              }
              return false
            },
          },
        },
      }),
    ]
  },
})
