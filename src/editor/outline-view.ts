import { Extension, type Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"

/**
 * Word's Outline view: every paragraph of the body at its outline level (Heading 1 to 9, then body text), with a
 * symbol before it (⊕ a heading with text under it, ⊖ a heading with none, a dot for body text), indented a step a
 * level. Headings collapse and expand a level at a time, Show Level shows only the top levels, and paragraphs are
 * promoted, demoted and moved together with whatever is collapsed under them. What is collapsed is the view's own
 * state, as in Word: it is not saved and is forgotten on leaving the view.
 */

/** Body text, below Heading 9. Show Level's "All Levels" is this level too. */
export const BODY_LEVEL = 10
const MAX_LEVEL = 9
const EDITOR_HEADINGS = 6

export type OutlineOptions = {
  active: boolean
  /** The level Show Level last showed (BODY_LEVEL: All Levels). */
  showLevel: number
  showFormatting: boolean
  firstLineOnly: boolean
}

/**
 * `hidden` holds the collapsed blocks themselves: ProseMirror keeps a block's node through moves, undo and redo, so
 * what was collapsed stays collapsed wherever it goes. A block given a new level is a new node, and is put back.
 */
type OutlineState = OutlineOptions & { hidden: ReadonlySet<ProseNode>; decorations: DecorationSet }

type OutlineMeta = Partial<OutlineOptions> & {
  /** Every block (by its position in the new document) that is collapsed out of sight. */
  hide?: number[]
}

export const outlineKey = new PluginKey<OutlineState>("outlineView")

/** A top-level block's outline level: a heading's, a paragraph's own outline level, else body text. */
export function blockLevel(node: ProseNode) {
  if (node.type.name === "heading") {
    return Math.min(MAX_LEVEL, Math.max(1, Number(node.attrs.level) || 1))
  }
  if (node.type.name === "paragraph") {
    const level = Number(node.attrs.outlineLevel || 0)
    if (level >= 1 && level <= MAX_LEVEL) {
      return level
    }
  }
  return BODY_LEVEL
}

export type OutlineBlock = { pos: number; node: ProseNode; level: number }

export function outlineBlocks(doc: ProseNode): OutlineBlock[] {
  const blocks: OutlineBlock[] = []
  doc.forEach((node, offset) => blocks.push({ pos: offset, node, level: blockLevel(node) }))
  return blocks
}

/** The index past the last block under blocks[index]: up to the next heading of its level or higher. */
export function sectionEnd(blocks: OutlineBlock[], index: number) {
  const level = blocks[index]!.level
  if (level >= BODY_LEVEL) {
    return index + 1
  }
  let end = index + 1
  while (end < blocks.length && blocks[end]!.level > level) {
    end += 1
  }
  return end
}

/** Where the collapsed blocks are in the document now. */
export function hiddenPositions(state: EditorState) {
  const hidden = outlineState(state).hidden
  const positions = new Set<number>()
  if (hidden.size > 0) {
    state.doc.forEach((node, offset) => {
      if (hidden.has(node)) {
        positions.add(offset)
      }
    })
  }
  return positions
}

function hiddenSet(doc: ProseNode, positions: Iterable<number>) {
  const nodes = new Set<ProseNode>()
  for (const pos of positions) {
    const node = pos >= 0 && pos < doc.content.size ? doc.nodeAt(pos) : null
    if (node) {
      nodes.add(node)
    }
  }
  return nodes
}

/** The collapsed blocks still in the document (a deleted one is let go). */
function stillThere(doc: ProseNode, hidden: ReadonlySet<ProseNode>) {
  if (hidden.size === 0) {
    return hidden
  }
  const kept = new Set<ProseNode>()
  doc.forEach((node) => {
    if (hidden.has(node)) {
      kept.add(node)
    }
  })
  return kept
}

function viewDecorations(doc: ProseNode, hiddenNodes: ReadonlySet<ProseNode>) {
  const hidden = new Set<number>()
  doc.forEach((node, offset) => hiddenNodes.has(node) && hidden.add(offset))
  const blocks = outlineBlocks(doc)
  const decorations: Decoration[] = []
  let headingLevel = 0
  blocks.forEach((block, index) => {
    const heading = block.level < BODY_LEVEL
    const end = heading ? sectionEnd(blocks, index) : index + 1
    const depth = heading ? block.level - 1 : headingLevel
    if (heading) {
      headingLevel = block.level
    }
    let collapsed = false
    for (let at = index + 1; at < end && !collapsed; at += 1) {
      collapsed = hidden.has(blocks[at]!.pos)
    }
    const attrs: Record<string, string> = {
      class: "outline-block",
      "data-ol": heading ? (end > index + 1 ? "parent" : "heading") : "body",
      "data-ol-depth": String(Math.min(depth, MAX_LEVEL)),
    }
    if (hidden.has(block.pos)) {
      attrs["data-ol-hidden"] = ""
    }
    if (collapsed) {
      attrs["data-ol-collapsed"] = ""
    }
    decorations.push(Decoration.node(block.pos, block.pos + block.node.nodeSize, attrs))
  })
  return DecorationSet.create(doc, decorations)
}

const EMPTY: OutlineState = {
  active: false,
  showLevel: BODY_LEVEL,
  showFormatting: true,
  firstLineOnly: false,
  hidden: new Set(),
  decorations: DecorationSet.empty,
}

export function outlineState(state: EditorState): OutlineState {
  return outlineKey.getState(state) ?? EMPTY
}

export const outlineActive = (state: EditorState) => outlineState(state).active

function setMeta(tr: Transaction, meta: OutlineMeta) {
  return tr.setMeta(outlineKey, meta)
}

// --- the view's options --------------------------------------------------------------------------------------------

/** Turns the view on or off; leaving it forgets what was collapsed, as Word does. */
export function setOutlineActive(editor: Editor, active: boolean) {
  if (outlineActive(editor.state) === active) {
    return
  }
  editor.view.dispatch(
    setMeta(editor.state.tr, active ? { active, hide: [], showLevel: BODY_LEVEL } : { active, hide: [] }).setMeta(
      "addToHistory",
      false,
    ),
  )
}

export function setOutlineOption(
  editor: Editor,
  option: Partial<Pick<OutlineOptions, "showFormatting" | "firstLineOnly">>,
) {
  editor.view.dispatch(setMeta(editor.state.tr, option).setMeta("addToHistory", false))
}

/** Show Level: only the headings down to `level` (BODY_LEVEL: everything). */
export function showOutlineLevel(editor: Editor, level: number) {
  if (!outlineActive(editor.state)) {
    return false
  }
  const hide = outlineBlocks(editor.state.doc)
    .filter((block) => block.level > level)
    .map((block) => block.pos)
  editor.view.dispatch(setMeta(editor.state.tr, { hide, showLevel: level }).setMeta("addToHistory", false))
  return true
}

// --- what the commands act on ----------------------------------------------------------------------------------------

/**
 * The top-level blocks the selection covers, as [first, last] indices, taking in what is collapsed under the last
 * one (a collapsed heading moves, promotes and demotes with everything under it).
 */
function targets(state: EditorState, blocks: OutlineBlock[], hidden: Set<number>) {
  const { from, to } = state.selection
  const first = Math.max(0, Math.min(blocks.length - 1, state.doc.resolve(from).index(0)))
  let last = Math.max(first, Math.min(blocks.length - 1, state.doc.resolve(Math.max(from, to - 1)).index(0)))
  while (last + 1 < blocks.length && hidden.has(blocks[last + 1]!.pos)) {
    last += 1
  }
  return { first, last }
}

/** The headings that Expand and Collapse act on: those selected, else the heading the caret's text is under. */
function targetHeadings(state: EditorState, blocks: OutlineBlock[], hidden: Set<number>) {
  const { first, last } = targets(state, blocks, hidden)
  const headings: number[] = []
  for (let index = first; index <= last; index += 1) {
    if (blocks[index]!.level < BODY_LEVEL && !hidden.has(blocks[index]!.pos)) {
      headings.push(index)
    }
  }
  if (headings.length === 0) {
    for (let index = first; index >= 0; index -= 1) {
      if (blocks[index]!.level < BODY_LEVEL) {
        headings.push(index)
        break
      }
    }
  }
  return headings
}

// --- levels ----------------------------------------------------------------------------------------------------------

function attrsFor(type: ProseNode["type"], attrs: Record<string, unknown>, extra: Record<string, unknown>) {
  const kept: Record<string, unknown> = {}
  for (const name of Object.keys(type.spec.attrs ?? {})) {
    if (name in extra) {
      kept[name] = extra[name]
    } else if (name in attrs) {
      kept[name] = attrs[name]
    }
  }
  return kept
}

/** Gives the block at `pos` an outline level: Heading 1-6, a paragraph at 7-9 (the editor's headings stop at 6), or body text. */
function setLevel(tr: Transaction, pos: number, level: number) {
  const node = tr.doc.nodeAt(pos)
  if (!node || !node.isTextblock || (node.type.name !== "heading" && node.type.name !== "paragraph")) {
    return
  }
  if (blockLevel(node) === level) {
    return
  }
  const schema = tr.doc.type.schema
  const wordStyle = typeof node.attrs.wordStyle === "string" ? node.attrs.wordStyle : null
  const styleExtra = wordStyle && /^Heading[1-9]$/i.test(wordStyle) ? { wordStyle: null } : {}
  if (level <= EDITOR_HEADINGS) {
    const heading = schema.nodes.heading!
    tr.setNodeMarkup(
      pos,
      heading,
      attrsFor(heading, node.attrs, { level, outlineLevel: "", namedStyle: null, ...styleExtra }),
    )
    return
  }
  const paragraph = schema.nodes.paragraph!
  tr.setNodeMarkup(
    pos,
    paragraph,
    attrsFor(paragraph, node.attrs, {
      outlineLevel: level < BODY_LEVEL ? String(level) : "",
      namedStyle: null,
      ...styleExtra,
    }),
  )
}

/**
 * Changes the levels of the selected paragraphs: `pick` gives a visible block its new level (null leaves it), and
 * what is collapsed under a heading moves by as many levels as the heading did.
 */
function relevel(editor: Editor, pick: (level: number, index: number, blocks: OutlineBlock[]) => number | null) {
  const { state } = editor
  const blocks = outlineBlocks(state.doc)
  if (blocks.length === 0) {
    return false
  }
  const hidden = hiddenPositions(state)
  const { first, last } = targets(state, blocks, hidden)
  const levels = new Map<number, number>()
  let shift = 0
  for (let index = first; index <= last; index += 1) {
    const block = blocks[index]!
    if (!hidden.has(block.pos)) {
      const next = pick(block.level, index, blocks)
      shift = next !== null && block.level < BODY_LEVEL && next < BODY_LEVEL ? next - block.level : 0
      if (next !== null) {
        levels.set(index, next)
      }
    } else if (shift !== 0 && block.level < BODY_LEVEL) {
      levels.set(index, Math.min(MAX_LEVEL, Math.max(1, block.level + shift)))
    }
  }
  const tr = state.tr
  for (const [index, level] of levels) {
    setLevel(tr, blocks[index]!.pos, level)
  }
  if (!tr.docChanged) {
    return false
  }
  // A paragraph given a new level is a new node, which drops its collapsed mark; the blocks keep their places.
  editor.view.dispatch(setMeta(tr, { hide: [...hidden] }).scrollIntoView())
  return true
}

function headingAbove(blocks: OutlineBlock[], index: number) {
  for (let at = index - 1; at >= 0; at -= 1) {
    if (blocks[at]!.level < BODY_LEVEL) {
      return blocks[at]!.level
    }
  }
  return 0
}

/**
 * Promote (-1) and Demote (1): a heading goes a level up or down (Heading 1 to 9); body text is promoted to the level
 * of the heading above it, or demoted one level below that. Body text among selected headings stays body text.
 */
export function outlinePromoteDemote(editor: Editor, direction: -1 | 1) {
  const { state } = editor
  const blocks = outlineBlocks(state.doc)
  const hidden = hiddenPositions(state)
  const { first, last } = blocks.length ? targets(state, blocks, hidden) : { first: 0, last: -1 }
  const anyHeading = blocks.slice(first, last + 1).some((block) => block.level < BODY_LEVEL)
  return (
    relevel(editor, (level, index, all) => {
      if (level < BODY_LEVEL) {
        return Math.min(MAX_LEVEL, Math.max(1, level + direction))
      }
      if (anyHeading) {
        return null
      }
      const above = headingAbove(all, index)
      return Math.min(MAX_LEVEL, Math.max(1, direction < 0 ? above || 1 : above + 1))
    }) || true
  )
}

/** The Outline Level box and Promote to Heading 1 / Demote to Body Text: the selected paragraphs to one level. */
export function setOutlineLevel(editor: Editor, level: number) {
  return relevel(editor, () => level) || true
}

/** The level shown in the Outline Level box: the first selected paragraph's. */
export function selectionLevel(state: EditorState) {
  const index = state.doc.resolve(state.selection.from).index(0)
  const node = index < state.doc.childCount ? state.doc.child(index) : null
  return node ? blockLevel(node) : BODY_LEVEL
}

// --- moving ------------------------------------------------------------------------------------------------------------

/**
 * Move Up and Move Down: the selected paragraphs, with what is collapsed under them, go above the paragraph shown
 * before them, or below the one shown after them (and what is collapsed under that). One undo step.
 */
export function outlineMove(editor: Editor, direction: -1 | 1) {
  const { state } = editor
  const blocks = outlineBlocks(state.doc)
  if (blocks.length < 2) {
    return false
  }
  const hidden = hiddenPositions(state)
  const { first, last } = targets(state, blocks, hidden)
  let insertAt: number
  if (direction < 0) {
    let before = first - 1
    while (before >= 0 && hidden.has(blocks[before]!.pos)) {
      before -= 1
    }
    if (before < 0) {
      return true
    }
    insertAt = blocks[before]!.pos
  } else {
    let after = last + 1
    if (after >= blocks.length) {
      return true
    }
    after += 1
    while (after < blocks.length && hidden.has(blocks[after]!.pos)) {
      after += 1
    }
    insertAt = after < blocks.length ? blocks[after]!.pos : state.doc.content.size
  }
  const start = blocks[first]!.pos
  const end = last + 1 < blocks.length ? blocks[last + 1]!.pos : state.doc.content.size
  const slice = state.doc.slice(start, end)
  const { from, to } = state.selection
  const tr = state.tr.delete(start, end)
  const target = tr.mapping.map(insertAt, direction < 0 ? -1 : 1)
  tr.insert(target, slice.content)
  const offset = target - start
  // The moved blocks are the same nodes, so what was collapsed among them stays collapsed.
  const size = tr.doc.content.size
  const clamp = (pos: number) => Math.max(0, Math.min(size, pos))
  tr.setSelection(TextSelection.between(tr.doc.resolve(clamp(from + offset)), tr.doc.resolve(clamp(to + offset))))
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

// --- expanding and collapsing -------------------------------------------------------------------------------------

/** Collapse: under each target heading, hides the lowest level still shown (body text first, then Heading 9, 8…). */
export function outlineCollapse(editor: Editor) {
  return changeVisibility(editor, (section, hidden) => {
    const shown = section.filter((block) => !hidden.has(block.pos))
    if (shown.length === 0) {
      return
    }
    const lowest = Math.max(...shown.map((block) => block.level))
    section.filter((block) => block.level >= lowest).forEach((block) => hidden.add(block.pos))
  })
}

/** Expand: under each target heading, shows the highest level still hidden. */
export function outlineExpand(editor: Editor) {
  return changeVisibility(editor, (section, hidden) => {
    const out = section.filter((block) => hidden.has(block.pos))
    if (out.length === 0) {
      return
    }
    const highest = Math.min(...out.map((block) => block.level))
    out.filter((block) => block.level === highest).forEach((block) => hidden.delete(block.pos))
  })
}

function changeVisibility(editor: Editor, change: (section: OutlineBlock[], hidden: Set<number>) => void) {
  const { state } = editor
  const plugin = outlineState(state)
  if (!plugin.active) {
    return false
  }
  const blocks = outlineBlocks(state.doc)
  if (blocks.length === 0) {
    return true
  }
  const hidden = hiddenPositions(state)
  for (const index of targetHeadings(state, blocks, hidden)) {
    change(blocks.slice(index + 1, sectionEnd(blocks, index)), hidden)
  }
  editor.view.dispatch(setMeta(state.tr, { hide: [...hidden] }).setMeta("addToHistory", false))
  return true
}

/** A double click on a heading's symbol: everything under it shown, or all of it hidden when it is all shown. */
export function outlineToggle(editor: Editor, index: number) {
  const { state } = editor
  const blocks = outlineBlocks(state.doc)
  const block = blocks[index]
  if (!block || block.level >= BODY_LEVEL) {
    return false
  }
  const hidden = hiddenPositions(state)
  const section = blocks.slice(index + 1, sectionEnd(blocks, index))
  const anyHidden = section.some((item) => hidden.has(item.pos))
  section.forEach((item) => (anyHidden ? hidden.delete(item.pos) : hidden.add(item.pos)))
  editor.view.dispatch(setMeta(state.tr, { hide: [...hidden] }).setMeta("addToHistory", false))
  return true
}

/** A click on a symbol: selects the paragraph and, for a heading, everything under it. */
export function outlineSelect(editor: Editor, index: number) {
  const { state } = editor
  const blocks = outlineBlocks(state.doc)
  const block = blocks[index]
  if (!block) {
    return false
  }
  const end = sectionEnd(blocks, index)
  const last = blocks[end - 1]!
  const from = block.pos + (block.node.isTextblock ? 1 : 0)
  const to = last.pos + last.node.nodeSize - (last.node.isTextblock ? 1 : 0)
  editor.view.dispatch(state.tr.setSelection(TextSelection.between(state.doc.resolve(from), state.doc.resolve(to))))
  editor.view.focus()
  return true
}

// --- the plugin ------------------------------------------------------------------------------------------------------

/** The top-level block a pointer event landed on the symbol of, as an index; null elsewhere. */
function symbolHit(view: EditorView, event: MouseEvent) {
  const target = event.target instanceof Element ? event.target.closest(".outline-block") : null
  if (!target || target.parentElement !== view.dom) {
    return null
  }
  const rect = target.getBoundingClientRect()
  const padding = Number.parseFloat(getComputedStyle(target).paddingLeft) || 0
  if (event.clientX > rect.left + padding) {
    return null
  }
  const pos = view.posAtDOM(target, 0)
  return view.state.doc.resolve(Math.min(pos, view.state.doc.content.size)).index(0)
}

export function createOutlineView(editor: () => Editor | null) {
  return new Plugin<OutlineState>({
    key: outlineKey,
    state: {
      init: () => EMPTY,
      apply(tr, value) {
        const meta = tr.getMeta(outlineKey) as OutlineMeta | undefined
        let next = value
        if (meta) {
          const { hide, ...options } = meta
          next = { ...next, ...options }
          if (hide) {
            next = { ...next, hidden: hiddenSet(tr.doc, hide) }
          } else if (tr.docChanged) {
            next = { ...next, hidden: stillThere(tr.doc, next.hidden) }
          }
        } else if (tr.docChanged) {
          next = { ...next, hidden: stillThere(tr.doc, next.hidden) }
        } else {
          return value
        }
        if (!next.active) {
          return { ...next, decorations: DecorationSet.empty }
        }
        return { ...next, decorations: viewDecorations(tr.doc, next.hidden) }
      },
    },
    props: {
      decorations: (state) => outlineState(state).decorations,
      attributes: (state): Record<string, string> => {
        const plugin = outlineState(state)
        if (!plugin.active) {
          return {}
        }
        return {
          "data-outline-view": "",
          ...(plugin.showFormatting ? {} : { "data-outline-plain": "" }),
          ...(plugin.firstLineOnly ? { "data-outline-first-line": "" } : {}),
        }
      },
      handleDOMEvents: {
        mousedown(view, event) {
          if (!outlineActive(view.state) || event.button !== 0) {
            return false
          }
          const index = symbolHit(view, event)
          const current = editor()
          if (index === null || !current) {
            return false
          }
          event.preventDefault()
          if (event.detail >= 2) {
            outlineToggle(current, index)
          } else {
            outlineSelect(current, index)
          }
          return true
        },
      },
    },
    // The caret never rests in collapsed text: it goes on to the next paragraph shown, or back to the one before.
    appendTransaction(transactions, oldState, newState) {
      const plugin = outlineState(newState)
      if (!plugin.active || !transactions.some((tr) => tr.selectionSet || tr.docChanged)) {
        return null
      }
      const hidden = hiddenPositions(newState)
      if (hidden.size === 0) {
        return null
      }
      const { doc, selection } = newState
      const $head = selection.$head
      const index = $head.index(0)
      const blocks = outlineBlocks(doc)
      if (!blocks[index] || !hidden.has(blocks[index].pos) || !selection.empty) {
        return null
      }
      const forward = selection.head >= oldState.selection.head
      const order = forward
        ? [...blocks.slice(index + 1), ...blocks.slice(0, index).reverse()]
        : [...blocks.slice(0, index).reverse(), ...blocks.slice(index + 1)]
      const visible = order.find((block) => !hidden.has(block.pos) && block.node.isTextblock)
      if (!visible) {
        return null
      }
      const pos = visible.pos > selection.head ? visible.pos + 1 : visible.pos + visible.node.nodeSize - 1
      return newState.tr.setSelection(TextSelection.create(doc, pos))
    },
  })
}

/** In Outline view Tab demotes and Shift+Tab promotes the paragraph, as in Word (not in a table, where Tab moves). */
const outlineTab = (editor: Editor, direction: -1 | 1) => {
  if (!outlineActive(editor.state)) {
    return false
  }
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.spec.tableRole) {
      return false
    }
  }
  return outlinePromoteDemote(editor, direction)
}

export const OutlineView = Extension.create({
  name: "outlineView",
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Tab: () => outlineTab(this.editor, 1),
      "Shift-Tab": () => outlineTab(this.editor, -1),
    }
  },
  addProseMirrorPlugins() {
    return [createOutlineView(() => this.editor)]
  },
})
