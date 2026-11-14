import { Extension, type Editor } from "@tiptap/core"
import type { Node as ProseNode, ResolvedPos } from "@tiptap/pm/model"
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state"
import { applyParagraphStyle } from "@/editor/home-actions"

/**
 * Commands behind Word's keys that have no button of their own: Alt+Shift+Up/Down (move the paragraph), Alt+Shift+
 * Left/Right (promote and demote), F4 / Ctrl+Y (Repeat), Shift+F5 (Go Back), F9 and Ctrl+Shift+F9 (update and unlink
 * fields).
 */

// --- moving paragraphs -------------------------------------------------------------------------------------------

const ITEM_TYPES = new Set(["listItem", "taskItem"])

/** The depth whose nodes move: a list item when the caret is in one, otherwise the paragraph itself. */
function movingDepth($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (ITEM_TYPES.has($pos.node(depth).type.name)) {
      return depth
    }
  }
  return $pos.depth
}

/**
 * Alt+Shift+Up/Down: swaps the selected paragraphs (or list items) with the one above or below, inside the same
 * parent. One undo step; the selection moves with the text.
 */
export function moveParagraph(editor: Editor, direction: -1 | 1) {
  const { state } = editor
  const { $from, $to } = state.selection
  const depth = movingDepth($from)
  if (depth < 1) {
    return false
  }
  const parent = $from.node(depth - 1)
  const first = $from.index(depth - 1)
  // The selection's last block, when it ends in the same parent; otherwise only the first block moves.
  const sameParent =
    $to.depth >= depth - 1 && $to.node(depth - 1) === parent && $to.start(depth - 1) === $from.start(depth - 1)
  const last = sameParent ? $to.index(depth - 1) : first
  const base = $from.start(depth - 1)
  const offset = (index: number) => {
    let pos = base
    for (let child = 0; child < index; child += 1) {
      pos += parent.child(child).nodeSize
    }
    return pos
  }
  const start = offset(first)
  const end = offset(last + 1)
  const tr = state.tr
  let shift: number
  if (direction < 0) {
    if (first === 0) {
      return false
    }
    const before = parent.child(first - 1)
    tr.delete(start - before.nodeSize, start)
    tr.insert(end - before.nodeSize, before)
    shift = -before.nodeSize
  } else {
    if (last + 1 >= parent.childCount) {
      return false
    }
    const after = parent.child(last + 1)
    tr.delete(end, end + after.nodeSize)
    tr.insert(start, after)
    shift = after.nodeSize
  }
  const selection = state.selection
  tr.setSelection(
    selection instanceof NodeSelection
      ? NodeSelection.create(tr.doc, selection.from + shift)
      : TextSelection.create(tr.doc, selection.from + shift, selection.to + shift),
  )
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

// --- promote and demote ------------------------------------------------------------------------------------------

const MAX_HEADING = 6

function headingBefore(state: EditorState, pos: number) {
  let level = 0
  state.doc.nodesBetween(0, pos, (node) => {
    if (node.type.name === "heading") {
      level = Number(node.attrs.level) || 1
    }
    return !node.isTextblock
  })
  return level
}

/**
 * Alt+Shift+Left (promote) and Alt+Shift+Right (demote), as in Word: a list item moves a list level up or down; a
 * heading goes a level up (to Heading 1 at most) or down (past the last level it becomes body text); body text is
 * promoted to the level of the heading above it, or demoted one level below that.
 */
export function promoteDemote(editor: Editor, direction: -1 | 1) {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name
    if (ITEM_TYPES.has(name)) {
      const chain = editor.chain().focus()
      return (direction > 0 ? chain.sinkListItem(name) : chain.liftListItem(name)).run() || true
    }
  }
  const block = $from.parent
  if (block.type.name === "heading") {
    const level = (Number(block.attrs.level) || 1) + direction
    if (level < 1) {
      return true
    }
    if (level > MAX_HEADING) {
      applyParagraphStyle(editor, "normal")
      return true
    }
    return editor
      .chain()
      .focus()
      .setHeading({ level: level as 1 })
      .updateAttributes("heading", { namedStyle: null })
      .run()
  }
  if (block.type.name !== "paragraph") {
    return false
  }
  const above = headingBefore(editor.state, $from.before())
  const level = Math.min(MAX_HEADING, Math.max(1, direction < 0 ? above || 1 : above + 1))
  return editor
    .chain()
    .focus()
    .setHeading({ level: level as 1 })
    .updateAttributes("heading", { namedStyle: null })
    .run()
}

// --- Repeat ------------------------------------------------------------------------------------------------------

type Repeatable = { kind: "command"; run: (editor: Editor) => boolean } | { kind: "typing"; text: string }

let lastAction: Repeatable | null = null

/** A command run from the keyboard (or a ribbon command that opts in) becomes the one F4 repeats. */
export function noteRepeatable(run: (editor: Editor) => boolean) {
  lastAction = { kind: "command", run }
}

/** What F4 would repeat: for tests and the Quick Access Toolbar's Repeat button. */
export function repeatableAction() {
  return lastAction
}

/** F4: does the last command again, or types the last typed text again, at the selection. */
export function repeatLast(editor: Editor) {
  const action = lastAction
  if (!action) {
    return false
  }
  if (action.kind === "typing") {
    return editor.chain().focus().insertContent(action.text).run()
  }
  return action.run(editor)
}

/** Word's Ctrl+Y: Redo while there is something to redo, otherwise Repeat. */
export function redoOrRepeat(editor: Editor) {
  if (editor.can().redo()) {
    return editor.chain().focus().redo().run()
  }
  return repeatLast(editor)
}

// --- Go Back -----------------------------------------------------------------------------------------------------

const GO_BACK_LIMIT = 4

type GoBackState = { positions: number[]; cursor: number }

const goBackKey = new PluginKey<GoBackState>("goBack")

/**
 * Shift+F5: the caret goes back to where the last edits were made, as Word's Go Back does, cycling through the
 * last four places. Places follow later edits; an edit in the same paragraph as the last place replaces it.
 */
export function goBack(editor: Editor) {
  const state = goBackKey.getState(editor.state)
  if (!state || state.positions.length === 0) {
    return false
  }
  const here = editor.state.selection.head
  const sameBlock = (pos: number) => {
    const a = editor.state.doc.resolve(Math.min(pos, editor.state.doc.content.size))
    const b = editor.state.doc.resolve(here)
    return a.parent === b.parent && a.start() === b.start()
  }
  let cursor = state.cursor
  // The first press skips a place in the paragraph the caret is already in.
  if (cursor === 0 && state.positions.length > 1 && sameBlock(state.positions[0]!)) {
    cursor = 1
  }
  const target = Math.min(state.positions[cursor % state.positions.length]!, editor.state.doc.content.size)
  const tr = editor.state.tr
    .setMeta(goBackKey, { cursor: (cursor + 1) % state.positions.length })
    .setSelection(TextSelection.near(editor.state.doc.resolve(target)))
  editor.view.dispatch(tr.scrollIntoView())
  editor.commands.focus()
  return true
}

function blockStart(doc: ProseNode, pos: number) {
  const $pos = doc.resolve(Math.min(pos, doc.content.size))
  return $pos.start()
}

// --- fields ------------------------------------------------------------------------------------------------------

/** The field nodes the editor draws itself; their result is the text of their `.field-value` span. */
const FIELD_NODES = new Set(["dateField", "formulaField", "ifField"])

function fieldsInSelection(editor: Editor) {
  const { from, to } = editor.state.selection
  const found: { pos: number; node: ProseNode }[] = []
  const at = editor.state.doc.nodeAt(from)
  editor.state.doc.nodesBetween(from, Math.max(to, from + (at?.nodeSize ?? 0)), (node, pos) => {
    if (FIELD_NODES.has(node.type.name) || node.type.name === "tableOfContents") {
      found.push({ pos, node })
      return false
    }
    return true
  })
  return found
}

/** F9: updates the fields in the selection (dates, formulas, IF fields, tables of contents). */
export function updateFields(editor: Editor) {
  const fields = fieldsInSelection(editor)
  if (fields.length === 0) {
    return false
  }
  const tr = editor.state.tr
  let toc = false
  for (const { pos, node } of fields) {
    if (node.type.name === "tableOfContents") {
      toc = true
    } else {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, tick: Date.now() })
    }
  }
  if (tr.docChanged) {
    editor.view.dispatch(tr)
  }
  if (toc) {
    editor.commands.updateTableOfContents()
  }
  return true
}

/** Ctrl+Shift+F9: replaces the fields in the selection by their current result, as plain text. */
export function unlinkFields(editor: Editor) {
  const fields = fieldsInSelection(editor).filter(({ node }) => FIELD_NODES.has(node.type.name))
  if (fields.length === 0) {
    return false
  }
  const tr = editor.state.tr
  for (const { pos, node } of [...fields].reverse()) {
    const dom = editor.view.nodeDOM(pos)
    const text =
      (dom instanceof HTMLElement ? dom.querySelector(".field-value")?.textContent || dom.textContent : "") ?? ""
    const marks = editor.state.doc.resolve(pos).marks()
    if (text) {
      tr.replaceWith(pos, pos + node.nodeSize, editor.state.schema.text(text, marks))
    } else {
      tr.delete(pos, pos + node.nodeSize)
    }
  }
  editor.view.dispatch(tr)
  return true
}

// --- the extension -----------------------------------------------------------------------------------------------

/** Keeps Go Back's places and notes typed text for Repeat. */
export const WordKeys = Extension.create({
  name: "wordKeys",
  // Before AutoCorrect, which inserts what it corrects itself, so typed text is still seen for Repeat.
  priority: 1200,

  addProseMirrorPlugins() {
    return [
      new Plugin<GoBackState>({
        key: goBackKey,
        state: {
          init: () => ({ positions: [], cursor: 0 }),
          apply(tr, value, _old, next) {
            const meta = tr.getMeta(goBackKey) as { cursor: number } | undefined
            if (meta) {
              return { ...value, cursor: meta.cursor }
            }
            if (!tr.docChanged || tr.getMeta("addToHistory") === false) {
              return value
            }
            const mapped = value.positions.map((pos) => tr.mapping.map(pos))
            const head = next.selection.head
            const start = blockStart(next.doc, head)
            const others = mapped.filter((pos) => blockStart(next.doc, pos) !== start)
            return { positions: [head, ...others].slice(0, GO_BACK_LIMIT), cursor: 0 }
          },
        },
        props: {
          handleTextInput(_view, from, to, text) {
            // Consecutive typing is one action to repeat; anything else typed elsewhere starts a new one.
            if (lastAction?.kind === "typing" && from === to && typedEnd === from) {
              lastAction = { kind: "typing", text: lastAction.text + text }
            } else {
              lastAction = { kind: "typing", text }
            }
            typedEnd = from + text.length
            return false
          },
        },
      }),
    ]
  },
})

let typedEnd = -1
