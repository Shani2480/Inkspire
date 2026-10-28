import { MAX_COLUMNS, columnBoxes, type ColumnWidth } from "@/document/column-widths"
import { COLUMN_GAP_CM } from "@/document/page-setup"
import { restoreSelection } from "@/editor/selection-memory"
import { Node, mergeAttributes, type Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { TextSelection, type EditorState } from "@tiptap/pm/state"

const CM_TO_PX = 96 / 2.54
const MIN_GAP_CM = 0.2
const MAX_GAP_CM = 5
const MIN_COLUMN_CM = 1.27

export function clampColumnGap(value: number) {
  if (!Number.isFinite(value)) {
    return COLUMN_GAP_CM
  }
  return Math.min(MAX_GAP_CM, Math.max(MIN_GAP_CM, Math.round(value * 100) / 100))
}

export function columnMarks(contentPx: number, count: number, gapCm: number) {
  if (count < 2 || contentPx <= 0) {
    return []
  }
  const gapPx = clampColumnGap(gapCm) * CM_TO_PX
  const columnPx = (contentPx - gapPx * (count - 1)) / count
  const marks: { index: number; left: number; width: number; gapLeft: number; gapWidth: number; edge: number }[] = []
  let cursor = 0
  for (let index = 0; index < count; index += 1) {
    const last = index === count - 1
    marks.push({
      index,
      left: cursor,
      width: columnPx,
      gapLeft: cursor + columnPx,
      gapWidth: last ? 0 : gapPx,
      edge: cursor + columnPx,
    })
    cursor += columnPx + (last ? 0 : gapPx)
  }
  return marks
}

/** The ruler's marks for columns of their own widths (unequal columns, 22.7), in the shape `columnMarks` gives. */
export function columnMarksFrom(columns: readonly ColumnWidth[]) {
  return columnBoxes(columns, CM_TO_PX).map((box, index) => ({
    index,
    left: box.x,
    width: box.width,
    gapLeft: box.x + box.width,
    gapWidth: index < columns.length - 1 ? columns[index].space * CM_TO_PX : 0,
    edge: box.x + box.width,
  }))
}

export function gapFromBoundary(contentPx: number, count: number, index: number, edgePx: number) {
  const rest = count - (index + 1)
  const minColumn = MIN_COLUMN_CM * CM_TO_PX
  const minGap = MIN_GAP_CM * CM_TO_PX
  const maxColumn = (contentPx - minGap * (count - 1)) / count
  let column = edgePx
  if (rest > 0) {
    column = edgePx - (index * (contentPx - edgePx)) / rest
  }
  column = Math.min(maxColumn, Math.max(minColumn, column))
  const gapPx = (contentPx - count * column) / (count - 1)
  return clampColumnGap(gapPx / CM_TO_PX)
}

export function findColumnSection(state: EditorState) {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === "columnSection") {
      return {
        pos: $from.before(depth),
        columns: columnCountAttr(node.attrs.columns),
        gap: clampColumnGap(Number(node.attrs.gap) || COLUMN_GAP_CM),
        line: node.attrs.line === true,
      }
    }
  }
  return null
}

export function applyColumnSection(editor: Editor, columns: number) {
  restoreSelection(editor)
  const existing = findColumnSection(editor.state)
  if (existing) {
    const node = editor.state.doc.nodeAt(existing.pos)
    if (!node) {
      return false
    }
    editor.view.dispatch(editor.state.tr.setNodeMarkup(existing.pos, undefined, { ...node.attrs, columns }))
    return true
  }

  const { state } = editor
  const range = state.selection.$from.blockRange(state.selection.$to)
  const type = state.schema.nodes.columnSection
  if (!range || !type || !range.parent.canReplaceWith(range.startIndex, range.endIndex, type)) {
    return false
  }
  const slice = state.doc.slice(range.start, range.end)
  if (slice.content.size === 0) {
    return false
  }
  const section = type.create({ columns, gap: COLUMN_GAP_CM }, slice.content)
  const tr = state.tr.replaceWith(range.start, range.end, section)
  // Keep the cursor inside the new section so it can be found (a select-all would otherwise stay on the document).
  editor.view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(range.start + 1))).scrollIntoView())
  return true
}

/**
 * Columns dialog, Apply to: This point forward. Word starts a new section there; here the blocks from the cursor's
 * to the end of the document become a block of columns, after a column break when "Start new column" is ticked
 * (which, in one column, starts a new page, as Word's new-column section does).
 */
export function applyColumnsFromHere(editor: Editor, columns: number, newColumn = false) {
  restoreSelection(editor)
  const { state } = editor
  const type = state.schema.nodes.columnSection
  const $from = state.selection.$from
  if (!type || $from.depth < 1) {
    return false
  }
  const start = $from.before(1)
  const end = state.doc.content.size
  const content = state.doc.slice(start, end).content
  if (content.size === 0 || !state.doc.canReplaceWith($from.index(0), state.doc.childCount, type)) {
    return false
  }
  const tr = state.tr.replaceWith(start, end, type.create({ columns, gap: COLUMN_GAP_CM }, content))
  let inside = start + 1
  const columnBreak = state.schema.nodes.columnBreak
  if (newColumn && columnBreak) {
    tr.insert(start, columnBreak.create())
    inside += columnBreak.create().nodeSize
  }
  editor.view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(inside))).scrollIntoView())
  return true
}

export function removeColumnSection(editor: Editor) {
  restoreSelection(editor)
  const existing = findColumnSection(editor.state)
  if (!existing) {
    return false
  }
  const node = editor.state.doc.nodeAt(existing.pos)
  if (!node) {
    return false
  }
  editor.view.dispatch(
    editor.state.tr.replaceWith(existing.pos, existing.pos + node.nodeSize, node.content).scrollIntoView(),
  )
  return true
}

export function setColumnSectionGap(editor: Editor, pos: number, gapCm: number) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== "columnSection") {
    return
  }
  const gap = clampColumnGap(gapCm)
  if (clampColumnGap(Number(node.attrs.gap) || COLUMN_GAP_CM) === gap) {
    return
  }
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, gap }))
}

export function setColumnSectionLine(editor: Editor, pos: number, line: boolean) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== "columnSection" || (node.attrs.line === true) === line) {
    return
  }
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, line }))
}

/** A selected-text section's columns: 2 to `MAX_COLUMNS`, always equal. */
function columnCountAttr(value: unknown) {
  const count = Math.round(Number(value))
  return Number.isFinite(count) ? Math.max(2, Math.min(MAX_COLUMNS, count)) : 2
}

export const ColumnSection = Node.create({
  name: "columnSection",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      columns: {
        default: 2,
        parseHTML: (element: HTMLElement) => columnCountAttr(element.getAttribute("data-columns")),
        renderHTML: (attributes: { columns?: number }) => ({
          "data-columns": String(columnCountAttr(attributes.columns)),
        }),
      },
      gap: {
        default: COLUMN_GAP_CM,
        parseHTML: (element: HTMLElement) => clampColumnGap(Number(element.getAttribute("data-gap")) || COLUMN_GAP_CM),
        renderHTML: (attributes: { gap?: number }) => ({
          "data-gap": String(clampColumnGap(Number(attributes.gap) || COLUMN_GAP_CM)),
        }),
      },
      line: {
        default: false,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-line") === "1",
        renderHTML: (attributes: { line?: boolean }) => (attributes.line === true ? { "data-line": "1" } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-column-section]" }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const columns = columnCountAttr(node.attrs.columns)
    const gap = clampColumnGap(Number(node.attrs.gap) || COLUMN_GAP_CM)
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-column-section": "",
        class: "column-section",
        style: `--cols: ${columns}; --gap: ${gap}cm`,
      }),
      0,
    ]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div")
      dom.className = "column-section"
      const guides = document.createElement("div")
      guides.className = "column-guides"
      guides.contentEditable = "false"
      const body = document.createElement("div")
      body.className = "column-section-body"
      dom.append(guides, body)

      const paint = (next: ProseNode) => {
        const columns = columnCountAttr(next.attrs.columns)
        const gap = clampColumnGap(Number(next.attrs.gap) || COLUMN_GAP_CM)
        dom.style.setProperty("--cols", String(columns))
        dom.style.setProperty("--gap", `${gap}cm`)
        dom.dataset.columns = String(columns)
        dom.toggleAttribute("data-line", next.attrs.line === true)
        guides.replaceChildren(
          ...Array.from({ length: columns }, () => {
            const span = document.createElement("span")
            return span
          }),
        )
      }
      paint(node)

      return {
        dom,
        contentDOM: body,
        ignoreMutation(mutation) {
          return mutation.type !== "selection" && guides.contains(mutation.target)
        },
        update(next: ProseNode) {
          if (next.type.name !== "columnSection") {
            return false
          }
          paint(next)
          return true
        },
        selectNode() {
          dom.classList.add("ProseMirror-selectednode")
        },
        deselectNode() {
          dom.classList.remove("ProseMirror-selectednode")
        },
      }
    }
  },
})
