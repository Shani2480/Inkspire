import { useEditingOptions } from "@/document/editing-options"
import { loadQuickParts } from "@/editor/quick-parts"
import { Extension, type Editor } from "@tiptap/core"
import type { ResolvedPos } from "@tiptap/pm/model"
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"
import { create } from "zustand"

/**
 * Options > Advanced > Editing options that change how selecting, moving the cursor, clicking and pasting work, as
 * Word does them: select entire words, smart paragraph selection, smart cursoring, click and type, the Paste
 * Options button and AutoComplete.
 */

const WORD_CHAR = /[\p{L}\p{N}_'’]/u

function charBefore($pos: ResolvedPos) {
  return $pos.parentOffset > 0 ? $pos.parent.textBetween($pos.parentOffset - 1, $pos.parentOffset, "", "￼") : ""
}

function charAfter($pos: ResolvedPos) {
  const size = $pos.parent.content.size
  return $pos.parentOffset < size ? $pos.parent.textBetween($pos.parentOffset, $pos.parentOffset + 1, "", "￼") : ""
}

/** Where the word around a position starts and ends, inside its paragraph. */
function wordBounds(state: EditorState, pos: number) {
  let start = state.doc.resolve(pos)
  while (WORD_CHAR.test(charBefore(start))) {
    start = state.doc.resolve(start.pos - 1)
  }
  let end = state.doc.resolve(pos)
  while (WORD_CHAR.test(charAfter(end))) {
    end = state.doc.resolve(end.pos + 1)
  }
  return { from: start.pos, to: end.pos }
}

/**
 * "When selecting, automatically select entire word": a drag that reaches past one word selects whole words at both
 * ends. A selection inside one word stays as dragged, so part of a word can still be selected.
 */
export function wholeWordSelection(state: EditorState, anchor: number, head: number) {
  const from = Math.min(anchor, head)
  const to = Math.max(anchor, head)
  const $from = state.doc.resolve(from)
  const $to = state.doc.resolve(to)
  if (!$from.parent.isTextblock || !$to.parent.isTextblock) {
    return null
  }
  const sameBlock = $from.sameParent($to)
  const text = sameBlock ? $from.parent.textBetween($from.parentOffset, $to.parentOffset, "", "￼") : ""
  if (sameBlock && ![...text].some((char) => !WORD_CHAR.test(char))) {
    return null
  }
  const start = wordBounds(state, from).from
  const end = wordBounds(state, to).to
  if (start === from && end === to) {
    return null
  }
  return anchor <= head ? { anchor: start, head: end } : { anchor: end, head: start }
}

/**
 * Smart paragraph selection: a selection of whole paragraphs takes their paragraph marks with it, so deleting it
 * removes the paragraphs instead of leaving empty ones behind. The range to delete, or null.
 */
export function wholeParagraphRange(state: EditorState) {
  const { selection } = state
  if (!(selection instanceof TextSelection) || selection.empty) {
    return null
  }
  const { $from, $to } = selection
  if (
    !$from.parent.isTextblock ||
    !$to.parent.isTextblock ||
    $from.parentOffset !== 0 ||
    $to.parentOffset !== $to.parent.content.size ||
    $from.depth !== $to.depth ||
    $from.node($from.depth - 1) !== $to.node($to.depth - 1)
  ) {
    return null
  }
  const container = $from.node($from.depth - 1)
  const blocks = $to.indexAfter($to.depth - 1) - $from.index($from.depth - 1)
  // The last paragraph mark of a cell or of the document can't be deleted.
  if (blocks >= container.childCount) {
    return null
  }
  return { from: $from.before(), to: $to.after() }
}

function scrollParent(node: HTMLElement) {
  for (let el: HTMLElement | null = node.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el)
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
      return el
    }
  }
  return null
}

/**
 * Smart cursoring: after scrolling away from the cursor, an arrow key moves it onto the page in view instead of
 * scrolling back to where it was.
 */
function smartCursor(view: EditorView, event: KeyboardEvent) {
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown"].includes(event.key)) {
    return false
  }
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
    return false
  }
  const scroller = scrollParent(view.dom)
  if (!scroller) {
    return false
  }
  const box = scroller.getBoundingClientRect()
  let caret: { top: number; bottom: number; left: number }
  try {
    caret = view.coordsAtPos(view.state.selection.head)
  } catch {
    return false
  }
  if (caret.bottom >= box.top && caret.top <= box.bottom) {
    return false
  }
  const page = view.dom.getBoundingClientRect()
  const left = Math.min(Math.max(caret.left, page.left + 2), page.right - 2)
  // Onto the first line in view, as Word puts it: the top of the window, or the top of the text when that is lower.
  for (const top of [Math.max(box.top, page.top) + 12, box.top + box.height / 3, box.top + box.height / 2]) {
    const found = view.posAtCoords({ left, top })
    if (found) {
      view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(found.pos))))
      return true
    }
  }
  return false
}

/**
 * Click and type: a double click in the empty part of the page below the text adds empty paragraphs down to it and
 * puts the cursor there, aligned left, centred or right by where the click was across the page.
 */
function clickAndType(view: EditorView, event: MouseEvent) {
  const { doc, schema } = view.state
  const last = doc.lastChild
  const paragraph = schema.nodes.paragraph
  if (!last || !paragraph) {
    return false
  }
  const lastDom = view.nodeDOM(doc.content.size - last.nodeSize) as HTMLElement | null
  if (!lastDom?.getBoundingClientRect) {
    return false
  }
  const lastBox = lastDom.getBoundingClientRect()
  const page = view.dom.getBoundingClientRect()
  if (event.clientY < lastBox.bottom + 4 || event.clientX < page.left || event.clientX > page.right) {
    return false
  }
  const width = page.right - page.left
  const align =
    Math.abs(event.clientX - (page.left + width / 2)) < width * 0.12
      ? "center"
      : event.clientX > page.right - width * 0.15
        ? "right"
        : null
  // One empty paragraph first, to measure how tall each is in this document's Normal style.
  const end = doc.content.size
  let tr = view.state.tr.insert(end, paragraph.create())
  view.dispatch(tr)
  const added = view.nodeDOM(end) as HTMLElement | null
  // From the end of the text to the end of the new paragraph: its height with the spacing around it.
  const height = Math.max(8, (added?.getBoundingClientRect().bottom ?? lastBox.bottom + 20) - lastBox.bottom)
  const count = Math.min(200, Math.max(1, Math.ceil((event.clientY - lastBox.bottom) / height)))
  tr = view.state.tr
  for (let i = 1; i < count; i += 1) {
    tr.insert(tr.doc.content.size, paragraph.create())
  }
  const target = tr.doc.content.size - 2
  if (align) {
    tr.setNodeAttribute(target, "textAlign", align)
  }
  tr.setSelection(TextSelection.create(tr.doc, target + 1))
  view.dispatch(tr.scrollIntoView())
  view.focus()
  return true
}

/* ---------- AutoComplete ---------- */

const MONTHS = ["January", "February", "March", "April", "June", "July", "August", "September", "October", "November", "December"]
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

export type Completion = { from: number; to: number; label: string; text?: string; html?: string }

/**
 * Show AutoComplete suggestions: after four letters of a month, a weekday or an AutoText entry's name, a tip offers
 * the whole of it, and Enter puts it in.
 */
export function completionFor(typed: string): Omit<Completion, "from" | "to"> | null {
  if (typed.length < 4) {
    return null
  }
  const lower = typed.toLowerCase()
  for (const word of [...MONTHS, ...DAYS]) {
    if (word.length > typed.length && word.toLowerCase().startsWith(lower)) {
      const text = typed === typed.toUpperCase() ? word.toUpperCase() : word
      return { label: text, text }
    }
  }
  for (const part of loadQuickParts()) {
    if (part.gallery === "AutoText" && part.name.length > typed.length && part.name.toLowerCase().startsWith(lower)) {
      return { label: part.name, html: part.html }
    }
  }
  return null
}

const completeKey = new PluginKey<Completion | null>("autoComplete")

function findCompletion(state: EditorState): Completion | null {
  const { selection } = state
  if (!selection.empty || !selection.$head.parent.isTextblock) {
    return null
  }
  const $head = selection.$head
  if (WORD_CHAR.test(charAfter($head))) {
    return null
  }
  const before = $head.parent.textBetween(Math.max(0, $head.parentOffset - 64), $head.parentOffset, "", "￼")
  const typed = /[\p{L}\p{N}]+$/u.exec(before)?.[0] ?? ""
  const found = completionFor(typed)
  return found ? { ...found, from: $head.pos - typed.length, to: $head.pos } : null
}

function acceptCompletion(editor: Editor, completion: Completion) {
  if (completion.html) {
    editor.chain().focus().insertContentAt({ from: completion.from, to: completion.to }, completion.html).run()
  } else if (completion.text) {
    const { state, view } = editor
    const marks = state.doc.resolve(completion.to).marks()
    view.dispatch(
      state.tr.replaceWith(completion.from, completion.to, state.schema.text(completion.text, marks)).setMeta(completeKey, "done"),
    )
  }
}

function completionTip(completion: Completion) {
  const tip = document.createElement("span")
  tip.className = "autocomplete-tip"
  tip.contentEditable = "false"
  tip.setAttribute("role", "tooltip")
  const label = document.createElement("span")
  label.textContent = completion.label
  const hint = document.createElement("span")
  hint.className = "autocomplete-hint"
  hint.textContent = " (Press ENTER to Insert)"
  tip.append(label, hint)
  return tip
}

/* ---------- Paste Options ---------- */

export type PastedClip = { html?: string; text?: string }

/** The pasted range and what was pasted, while the Paste Options button shows. */
export const usePasteOptions = create<{
  range: { from: number; to: number } | null
  clip: PastedClip | null
  /** The editor pasted into: the document, or a header or footer. */
  view: EditorView | null
  menuOpen: boolean
  setMenuOpen: (open: boolean) => void
}>((set) => ({
  range: null,
  clip: null,
  view: null,
  menuOpen: false,
  setMenuOpen: (menuOpen) => set({ menuOpen }),
}))

let nextClip: PastedClip | null = null

/** Called by the paste handler with the clipboard of the paste about to happen. */
export function notePaste(clip: PastedClip) {
  nextClip = clip
}

export const pasteRangeKey = new PluginKey<{ from: number; to: number } | null>("pasteOptions")

function isPaste(tr: Transaction) {
  return tr.getMeta("paste") === true || tr.getMeta("uiEvent") === "paste"
}

/** Hides the Paste Options button (Esc, or a choice that ends it). */
export function dismissPasteOptions(view: EditorView) {
  view.dispatch(view.state.tr.setMeta(pasteRangeKey, "clear"))
}

function syncPasteOptions(view: EditorView) {
  const range = pasteRangeKey.getState(view.state) ?? null
  const store = usePasteOptions.getState()
  if (range) {
    if (range !== store.range) {
      const clip = nextClip ?? (store.view === view ? store.clip : null)
      nextClip = null
      usePasteOptions.setState({ range, clip, view })
    }
  } else if (store.view === view && store.range) {
    // Only the editor that was pasted into ends its button; the header and footer editors have their own state.
    usePasteOptions.setState({ range: null, clip: null, view: null, menuOpen: false })
  }
}

export const SmartEditing = Extension.create({
  name: "smartEditing",
  priority: 1000,

  onDestroy() {
    if (usePasteOptions.getState().view === this.editor.view) {
      usePasteOptions.setState({ range: null, clip: null, view: null, menuOpen: false })
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    let pointer: { x: number; y: number } | null = null
    return [
      new Plugin({
        key: new PluginKey("smartEditing"),
        props: {
          handleKeyDown(view, event) {
            const options = useEditingOptions.getState()
            if (
              (event.key === "Backspace" || event.key === "Delete") &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey &&
              options.smartParagraphSelection
            ) {
              const range = wholeParagraphRange(view.state)
              if (range) {
                const tr = view.state.tr.delete(range.from, range.to)
                const at = Math.min(tr.mapping.map(range.from), tr.doc.content.size)
                tr.setSelection(TextSelection.near(tr.doc.resolve(at)))
                view.dispatch(tr.scrollIntoView())
                return true
              }
            }
            return options.smartCursoring ? smartCursor(view, event) : false
          },
          handleDoubleClick(view, _pos, event) {
            return useEditingOptions.getState().clickAndType ? clickAndType(view, event) : false
          },
          handleDOMEvents: {
            // What the clipboard held, for the Paste Options button, before any paste handler takes it.
            paste(_view, event) {
              if (event.clipboardData) {
                notePaste({
                  html: event.clipboardData.getData("text/html") || undefined,
                  text: event.clipboardData.getData("text/plain") || undefined,
                })
              }
              return false
            },
            mousedown(_view, event) {
              pointer = event.button === 0 && event.detail === 1 && !event.shiftKey ? { x: event.clientX, y: event.clientY } : null
              return false
            },
            mouseup(view, event) {
              const start = pointer
              pointer = null
              if (!start || !useEditingOptions.getState().selectEntireWord) {
                return false
              }
              if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) {
                return false
              }
              // After the editor has read the selection the drag made.
              setTimeout(() => {
                const { selection } = view.state
                if (view.isDestroyed || !(selection instanceof TextSelection) || selection.empty) {
                  return
                }
                const next = wholeWordSelection(view.state, selection.anchor, selection.head)
                if (next) {
                  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, next.anchor, next.head)))
                }
              }, 0)
              return false
            },
          },
        },
      }),
      new Plugin<Completion | null>({
        key: completeKey,
        state: {
          init: () => null,
          apply(tr, value, _old, next) {
            if (tr.getMeta(completeKey) === "done" || tr.getMeta(completeKey) === "dismiss") {
              return null
            }
            if (!useEditingOptions.getState().autoComplete) {
              return null
            }
            if (tr.docChanged && !isPaste(tr)) {
              return findCompletion(next)
            }
            return tr.selectionSet ? null : value
          },
        },
        props: {
          decorations(state) {
            const completion = completeKey.getState(state)
            return completion
              ? DecorationSet.create(state.doc, [
                  Decoration.widget(completion.to, () => completionTip(completion), { side: 1, ignoreSelection: true }),
                ])
              : null
          },
          handleKeyDown(view, event) {
            const completion = completeKey.getState(view.state)
            if (!completion) {
              return false
            }
            if ((event.key === "Enter" || event.key === "F3") && !event.shiftKey && !event.ctrlKey && !event.altKey) {
              acceptCompletion(editor, completion)
              return true
            }
            if (event.key === "Escape") {
              view.dispatch(view.state.tr.setMeta(completeKey, "dismiss"))
              return true
            }
            return false
          },
        },
      }),
      new Plugin<{ from: number; to: number } | null>({
        key: pasteRangeKey,
        state: {
          init: () => null,
          apply(tr, value, old, next) {
            if (tr.getMeta(pasteRangeKey) === "clear") {
              return null
            }
            if (isPaste(tr)) {
              const from = tr.mapping.map(old.selection.from, -1)
              const to = next.selection.to
              return useEditingOptions.getState().pasteOptionsButton && to > from ? { from, to } : null
            }
            // Transactions other plugins append to the paste (tidying attributes) only move the range.
            if (value && tr.getMeta("appendedTransaction")) {
              return { from: tr.mapping.map(value.from, -1), to: tr.mapping.map(value.to, 1) }
            }
            return tr.docChanged ? null : value
          },
        },
        // Plugins are registered again now and then (a new view of this plugin), so each one starts by syncing.
        view: (view) => {
          syncPasteOptions(view)
          return { update: syncPasteOptions }
        },
        props: {
          handleKeyDown(view, event) {
            if (event.key === "Escape" && pasteRangeKey.getState(view.state)) {
              dismissPasteOptions(view)
              return false
            }
            return false
          },
        },
      }),
    ]
  },
})
