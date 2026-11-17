import { Extension, type Editor } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state"
import { parseListIndent, type ListIndent } from "@/editor/lists"
import { parseWordLevels } from "@/editor/word-markers"

/** The numbered list around the caret: the list, and the item the caret is in (its index and position). */
export type ListAt = { pos: number; node: ProseMirrorNode; index: number; itemPos: number }

/** Lists nested in a list item count with their parent list's levels, not as lists of their own. */
function isTopLevel(state: EditorState | { doc: ProseMirrorNode }, pos: number) {
  const $pos = state.doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "listItem") {
      return false
    }
  }
  return true
}

/** The innermost numbered list holding the selection's start, or null. */
export function numberedListAt(state: EditorState): ListAt | null {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === "orderedList") {
      return {
        pos: $from.before(depth),
        node,
        index: $from.index(depth),
        itemPos: $from.posAtIndex($from.index(depth), depth),
      }
    }
  }
  return null
}

/** First-level items: the ones a list's next number counts (an item given an indent sits a level deeper). */
function firstLevelItems(list: ProseMirrorNode) {
  let count = 0
  list.forEach((item) => {
    if (item.type.name === "listItem" && !(Number(item.attrs.indent) > 0)) {
      count += 1
    }
  })
  return count
}

/** Where a list's first item would be numbered if it counted on from the lists before it of its family. */
function numbersBefore(doc: ProseMirrorNode, end: number, family: string) {
  let next: number | null = null
  doc.nodesBetween(0, end, (node, pos) => {
    if (node.isTextblock || node.type.name === "listItem") {
      return false
    }
    if (node.type.name === "orderedList" && pos < end && (node.attrs.listFamily ?? "") === family) {
      next = (Number(node.attrs.start) || 1) + firstLevelItems(node)
      return false
    }
    return true
  })
  return next
}

/** The first-level numbered list before this one, any family: the one Continue Numbering joins. */
function previousList(doc: ProseMirrorNode, end: number) {
  let found: { pos: number; node: ProseMirrorNode } | null = null
  doc.nodesBetween(0, end, (node, pos) => {
    if (node.isTextblock || node.type.name === "listItem") {
      return false
    }
    if (node.type.name === "orderedList" && pos < end) {
      found = { pos, node }
      return false
    }
    return true
  })
  return found as { pos: number; node: ProseMirrorNode } | null
}

/**
 * Splits the list before the caret's item when it is not the first, so that item and the ones after it form the
 * list that restarts (Word's Restart at 1 on the third item numbers it 1, and the first two keep theirs). Returns
 * the position of the list that holds the item afterwards.
 */
function splitAtItem(tr: Transaction, at: ListAt) {
  if (at.index === 0) {
    return at.pos
  }
  tr.split(at.itemPos, 1)
  return tr.mapping.map(at.itemPos) - 1
}

function setList(tr: Transaction, pos: number, attrs: Record<string, unknown>) {
  const node = tr.doc.nodeAt(pos)
  if (node?.type.name === "orderedList") {
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs })
  }
}

/** Word's Restart at 1 (or Set Numbering Value's "Start new list" at `value`) from the caret's item. */
export function restartNumbering(editor: Editor, value = 1) {
  const at = numberedListAt(editor.state)
  if (!at) {
    return false
  }
  const tr = editor.state.tr
  const pos = splitAtItem(tr, at)
  setList(tr, pos, { start: Math.max(0, Math.floor(value)), continueList: false })
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

/** True when there is a numbered list before the caret's for Continue Numbering to join. */
export function canContinueNumbering(state: EditorState) {
  const at = numberedListAt(state)
  return Boolean(at && isTopLevel(state, at.pos) && previousList(state.doc, at.pos))
}

/** First-level items of the caret's list before the caret's item. */
function itemsBefore(at: ListAt) {
  let before = 0
  at.node.forEach((item, _offset, index) => {
    if (index < at.index && !(Number(item.attrs.indent) > 0)) {
      before += 1
    }
  })
  return before
}

/**
 * Word's Continue Numbering: the caret's whole list counts on from the numbered list before it, taking that list's
 * family and number format. With `value` (Set Numbering Value's "Advance value"), the caret's item gets that number.
 */
export function continueNumbering(editor: Editor, value?: number) {
  const at = numberedListAt(editor.state)
  if (!at || !isTopLevel(editor.state, at.pos)) {
    return false
  }
  const previous = previousList(editor.state.doc, at.pos)
  if (!previous) {
    return false
  }
  const tr = editor.state.tr
  const { marker, scheme, wordList, wordIndent, wordTab, wordLevels, listFamily } = previous.node.attrs
  const shared = { marker, scheme, wordList, wordIndent, wordTab, wordLevels, listFamily }
  if (value === undefined) {
    const start = numbersBefore(editor.state.doc, at.pos, String(listFamily ?? "")) ?? 1
    setList(tr, at.pos, { ...shared, continueList: true, start })
  } else {
    setList(tr, at.pos, { ...shared, continueList: false, start: Math.max(0, Math.floor(value) - itemsBefore(at)) })
  }
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

/** The number the caret's item would get by continuing the list before it (Set Numbering Value's default). */
export function continuedValue(state: EditorState) {
  const at = numberedListAt(state)
  const previous = at && isTopLevel(state, at.pos) ? previousList(state.doc, at.pos) : null
  if (!at || !previous) {
    return null
  }
  return (numbersBefore(state.doc, at.pos, String(previous.node.attrs.listFamily ?? "")) ?? 1) + itemsBefore(at)
}

/** The number the caret's item shows now. */
export function currentValue(state: EditorState) {
  const at = numberedListAt(state)
  return at ? (Number(at.node.attrs.start) || 1) + itemsBefore(at) : 1
}

/** Every continuing list's start, from the lists before it of its family: one transaction's worth of fixes. */
function fixStarts(doc: ProseMirrorNode, tr: Transaction) {
  const next = new Map<string, number>()
  let changed = false
  doc.descendants((node, pos) => {
    if (node.isTextblock || node.type.name === "listItem") {
      return false
    }
    if (node.type.name !== "orderedList") {
      return true
    }
    const family = String(node.attrs.listFamily ?? "")
    let start = Number(node.attrs.start) || 1
    const counted = next.get(family)
    if (node.attrs.continueList && counted !== undefined && counted !== start) {
      start = counted
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, start })
      changed = true
    }
    next.set(family, start + firstLevelItems(node))
    return false
  })
  return changed
}

/** Keeps a list that continues another numbered on from it as items are added, removed or moved above it. */
export const ListNumbering = Extension.create({
  name: "listNumbering",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("listNumbering"),
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((tr) => tr.docChanged)) {
            return null
          }
          const tr = state.tr
          // Appended to the edit that moved the numbers, so it is undone with it.
          return fixStarts(state.doc, tr) ? tr : null
        },
      }),
    ]
  },
})

/** The outermost list (numbered or bulleted) around the selection's start: the one Adjust List Indents changes. */
export function listAt(state: EditorState): { pos: number; node: ProseMirrorNode } | null {
  const { $from } = state.selection
  for (let depth = 1; depth <= $from.depth; depth += 1) {
    const node = $from.node(depth)
    if (node.type.name === "orderedList" || node.type.name === "bulletList") {
      return { pos: $from.before(depth), node }
    }
  }
  return null
}

/** A list's text indent as drawn, in pt: its own, its Word indent's, or the page's CSS. */
function drawnTextIndent(editor: Editor, pos: number, node: ProseMirrorNode) {
  const own = String(node.attrs.wordIndent ?? "").match(/^padding-left: (\d+(?:\.\d+)?)pt/)
  if (own) {
    return Number(own[1])
  }
  const dom = editor.view.nodeDOM(pos)
  const padding = dom instanceof HTMLElement ? parseFloat(getComputedStyle(dom).paddingLeft) : NaN
  return Number.isFinite(padding) && padding > 0 ? padding * 0.75 : 18
}

/** What Adjust List Indents opens with for the caret's list's first level. */
export function readListIndent(editor: Editor): ListIndent | null {
  const at = listAt(editor.state)
  if (!at) {
    return null
  }
  const own = parseListIndent(at.node.attrs.listIndent)
  if (own) {
    return own
  }
  const level = at.node.attrs.marker ? undefined : parseWordLevels(at.node.attrs.wordLevels)[0]
  const text = drawnTextIndent(editor, at.pos, at.node)
  const hang = level?.hang ?? 18
  return {
    number: Math.max(0, Math.round((text - hang) * 100) / 100),
    text: Math.round(text * 100) / 100,
    follow: level?.suffix ?? "tab",
    tab: null,
  }
}

/** Word's Adjust List Indents: the caret's list's first level gets its marker and text where they are given. */
export function adjustListIndents(editor: Editor, indent: ListIndent) {
  const at = listAt(editor.state)
  if (!at) {
    return false
  }
  const tr = editor.state.tr
  tr.setNodeMarkup(at.pos, undefined, { ...at.node.attrs, listIndent: JSON.stringify(indent) })
  // Items that had a hanging indent or left indent of their own take the level's now, as in Word.
  at.node.forEach((item, offset) => {
    if (
      item.type.name === "listItem" &&
      !(Number(item.attrs.indent) > 0) &&
      (item.attrs.wordOwnHang !== null || item.attrs.wordShift !== null)
    ) {
      tr.setNodeMarkup(at.pos + 1 + offset, undefined, { ...item.attrs, wordOwnHang: null, wordShift: null })
    }
  })
  editor.view.dispatch(tr.scrollIntoView())
  return true
}
