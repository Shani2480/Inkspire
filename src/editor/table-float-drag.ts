import type { Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { TextSelection, type Transaction } from "@tiptap/pm/state"
import { TableMap } from "@tiptap/pm/tables"
import { pageMetrics } from "@/document/page-setup"
import { useDocumentStore } from "@/document/store"
import { editorPoint, isFloating, pagePoint } from "@/editor/objects"
import { defaultFloat, parseFloatValue, type TableFloat } from "@/editor/table-float"
import { PX_PER_CM } from "@/editor/table-props"
import { tableColumnWidths, tableElement } from "@/editor/table-tools"

/**
 * Dragging a table by its move handle, as in Word: the table becomes one text wraps around (if it was not already),
 * lands where it is dropped, and is anchored to the paragraph it now sits on.
 */

const cm = (px: number) => Math.round((px / PX_PER_CM) * 100) / 100

/** Gives every cell its column's drawn width, so the table keeps its size once it is out of the text. */
function fixColumns(tr: Transaction, pos: number, table: ProseNode, widths: number[]) {
  const map = TableMap.get(table)
  const seen = new Set<number>()
  for (let index = 0; index < map.map.length; index += 1) {
    const rel = map.map[index]!
    if (seen.has(rel)) {
      continue
    }
    seen.add(rel)
    const cell = table.nodeAt(rel)
    if (!cell || (Array.isArray(cell.attrs.colwidth) && cell.attrs.colwidth.every((width: number) => width > 0))) {
      continue
    }
    const column = index % map.width
    const span = Number(cell.attrs.colspan) || 1
    tr.setNodeMarkup(pos + 1 + rel, undefined, {
      ...cell.attrs,
      colwidth: widths.slice(column, column + span).map((width) => Math.round(width)),
    })
  }
}

/** Moves the table at `pos` so its top-left corner is at the screen point (`left`, `top`). */
export function dropFloatingTable(editor: Editor, pos: number, left: number, top: number) {
  const view = editor.view
  const node = view.state.doc.nodeAt(pos)
  const element = tableElement(editor, pos)
  if (node?.type.name !== "table" || !(element instanceof HTMLTableElement)) {
    return false
  }
  const metrics = pageMetrics(useDocumentStore.getState().pageSetup)
  const point = editorPoint(view, left, top)
  const placed = pagePoint(point.left, point.top)
  // The paragraph it is anchored to: the last block on that page starting above its top, or the page's first.
  const before = parseFloatValue(node.attrs.float)
  // A table still in the text leaves it, and what follows moves up: measure the paragraphs as they will be, with the
  // table out of the text for the moment (its own attributes, which the editor leaves alone).
  const lifted = !before && !element.dataset.float
  if (lifted) {
    element.dataset.float = "1"
    element.style.position = "absolute"
  }
  let target: { pos: number; top: number } | null = null
  let first: { pos: number; top: number } | null = null
  view.state.doc.forEach((child, offset) => {
    if (offset === pos || isFloating(child) || (child.type.name === "table" && child.attrs.float)) {
      return
    }
    const dom = view.nodeDOM(offset)
    if (!(dom instanceof HTMLElement)) {
      return
    }
    const rect = dom.getBoundingClientRect()
    const at = editorPoint(view, rect.left + 1, rect.top)
    const block = pagePoint(at.left, at.top)
    if (block.page !== placed.page) {
      return
    }
    first ??= { pos: offset, top: block.y }
    if (block.y <= placed.y + 1) {
      target = { pos: offset, top: block.y }
    }
  })
  if (lifted) {
    delete element.dataset.float
    element.style.position = ""
  }
  const anchor = (target ?? first) as { pos: number; top: number } | null
  const base = before ?? defaultFloat("left", 0)
  const float: TableFloat = {
    ...base,
    h: cm(placed.x + (base.hFrom === "page" ? metrics.marginLeft : 0)),
    v:
      base.vFrom === "paragraph"
        ? cm(placed.y - (anchor?.top ?? 0))
        : cm(placed.y + (base.vFrom === "page" ? metrics.marginTop : 0)),
  }
  const tr = view.state.tr
  if (!before) {
    fixColumns(tr, pos, node, tableColumnWidths(element))
  }
  tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)!.attrs, float })
  const moved = tr.doc.nodeAt(pos)!
  const insertAt = anchor ? anchor.pos : null
  let at = pos
  if (insertAt !== null && insertAt !== pos + moved.nodeSize && insertAt !== pos) {
    tr.delete(pos, pos + moved.nodeSize)
    at = tr.mapping.slice(tr.steps.length - 1).map(insertAt, -1)
    tr.insert(at, moved)
  }
  tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)))
  view.dispatch(tr.scrollIntoView())
  return true
}
