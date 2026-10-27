import { Extension, type Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state"
import { CellSelection, TableMap, cellAround, mergeCells } from "@tiptap/pm/tables"
import type { EditorView } from "@tiptap/pm/view"
import { create } from "zustand"
import { useViewStore } from "@/document/view"

/**
 * Word's Draw Table and Eraser (Table Layout → Draw): with the pencil, a box dragged on the page becomes a table that
 * size and a line dragged across a cell splits it there; with the eraser, a click on the line between two cells
 * merges them. Either stays on until it is clicked again, Escape is pressed, or the other is chosen.
 */
export type TableDrawMode = "draw" | "erase" | null

export const useTableDraw = create<{ mode: TableDrawMode; toggle: (mode: "draw" | "erase") => void; stop: () => void }>(
  (set) => ({
    mode: null,
    toggle: (mode) => set((state) => ({ mode: state.mode === mode ? null : mode })),
    stop: () => set({ mode: null }),
  }),
)

type CellAt = { pos: number; node: ProseNode; left: number; right: number; top: number; bottom: number }

/** Every cell of the table once, with its place on the grid, and its position in the document. */
function cellsOf(table: ProseNode, tablePos: number): CellAt[] {
  const map = TableMap.get(table)
  const start = tablePos + 1
  return [...new Set(map.map)].map((offset) => {
    const rect = map.findCell(offset)
    return { pos: start + offset, node: table.nodeAt(offset)!, ...rect }
  })
}

function widthsOf(cell: ProseNode, from: number, to: number, widths: number[]) {
  const own = Array.isArray(cell.attrs.colwidth) ? (cell.attrs.colwidth as number[]) : null
  return Array.from({ length: to - from }, (_, index) => Math.max(1, Math.round(own?.[index] || widths[from + index] || 1)))
}

/**
 * Splits a cell with an up-and-down line `x` pixels from the table's left edge (Draw Table). `widths` are the grid
 * columns' widths as drawn. A line on a column edge inside a merged cell divides it there; otherwise the column the
 * line crosses becomes two, and the other cells over it widen to span both.
 */
export function splitCellDown(tr: Transaction, tablePos: number, cellPos: number, widths: number[], x: number) {
  const table = tr.doc.nodeAt(tablePos)
  if (!table) {
    return false
  }
  const cells = cellsOf(table, tablePos)
  const target = cells.find((cell) => cell.pos === cellPos)
  if (!target) {
    return false
  }
  // The grid column the line crosses, and how far into it.
  let column = 0
  let edge = 0
  while (column < widths.length - 1 && edge + widths[column]! <= x) {
    edge += widths[column]!
    column += 1
  }
  const inside = x - edge
  const width = widths[column] ?? 0
  const near = 4
  if (column < target.left || column >= target.right) {
    return false
  }
  // On an existing column edge inside a merged cell: the cell divides there, the grid stays.
  const onEdge = inside <= near ? column : width - inside <= near ? column + 1 : -1
  if (onEdge > target.left && onEdge < target.right) {
    const all = widthsOf(target.node, target.left, target.right, widths)
    const split = onEdge - target.left
    tr.setNodeMarkup(target.pos, undefined, {
      ...target.node.attrs,
      colspan: split,
      colwidth: all.slice(0, split),
    })
    const added = target.node.type.createAndFill({
      colspan: target.right - onEdge,
      rowspan: target.node.attrs.rowspan,
      colwidth: all.slice(split),
    })!
    tr.insert(tr.mapping.map(target.pos + target.node.nodeSize), added)
    return true
  }
  if (inside <= near || width - inside <= near) {
    // On the table's own edge or a cell's border: nothing to split.
    return false
  }
  const first = Math.round(inside)
  const second = Math.max(1, Math.round(width - inside))
  let after = 0
  for (const cell of cells) {
    if (column < cell.left || column >= cell.right) {
      continue
    }
    const all = widthsOf(cell.node, cell.left, cell.right, widths)
    const at = column - cell.left
    if (cell.pos === cellPos) {
      tr.setNodeMarkup(cell.pos, undefined, {
        ...cell.node.attrs,
        colspan: at + 1,
        colwidth: [...all.slice(0, at), first],
      })
      after = cell.pos + cell.node.nodeSize
    } else {
      tr.setNodeMarkup(cell.pos, undefined, {
        ...cell.node.attrs,
        colspan: cell.right - cell.left + 1,
        colwidth: [...all.slice(0, at), first, second, ...all.slice(at + 1)],
      })
    }
  }
  const added = target.node.type.createAndFill({
    colspan: target.right - column,
    rowspan: target.node.attrs.rowspan,
    colwidth: [second, ...widthsOf(target.node, target.left, target.right, widths).slice(column - target.left + 1)],
  })!
  tr.insert(after, added)
  return true
}

/**
 * Splits a cell with a side-to-side line through grid row `row` (Draw Table). `onEdge` says the line runs along
 * the top of that row inside a cell spanning several rows, which then divides there; otherwise the row becomes two,
 * and the other cells in it grow to span both.
 */
export function splitCellAcross(tr: Transaction, tablePos: number, cellPos: number, row: number, onEdge: boolean) {
  const table = tr.doc.nodeAt(tablePos)
  if (!table) {
    return false
  }
  const cells = cellsOf(table, tablePos)
  const target = cells.find((cell) => cell.pos === cellPos)
  if (!target || row < target.top || row >= target.bottom) {
    return false
  }
  const rowStart = (index: number) => {
    let pos = tablePos + 1
    for (let at = 0; at < index; at += 1) {
      pos += table.child(at).nodeSize
    }
    return pos
  }
  const cellOf = (rowspan: number) =>
    target.node.type.createAndFill({
      colspan: target.node.attrs.colspan,
      rowspan,
      colwidth: target.node.attrs.colwidth,
    })!
  if (onEdge && row > target.top) {
    // Inside a cell spanning rows, along an existing row's top: the cell divides there.
    tr.setNodeMarkup(target.pos, undefined, { ...target.node.attrs, rowspan: row - target.top })
    // The new cell goes in that row before the first cell that starts to its right.
    const next = cells
      .filter((cell) => cell.top === row && cell.left > target.left)
      .sort((a, b) => a.left - b.left)[0]
    const rowNode = table.child(row)
    const at = next ? next.pos : rowStart(row) + rowNode.nodeSize - 1
    tr.insert(tr.mapping.map(at), cellOf(target.bottom - row))
    return true
  }
  for (const cell of cells) {
    if (row < cell.top || row >= cell.bottom) {
      continue
    }
    tr.setNodeMarkup(cell.pos, undefined, {
      ...cell.node.attrs,
      rowspan: cell.pos === cellPos ? row - cell.top + 1 : cell.bottom - cell.top + 1,
    })
  }
  const rowNode = table.child(row)
  const newRow = rowNode.type.create({ ...rowNode.attrs, height: null }, cellOf(target.bottom - row))
  tr.insert(tr.mapping.map(rowStart(row) + rowNode.nodeSize), newRow)
  return true
}

/** Eraser: merges two cells side by side or one above the other, when together they make a rectangle. */
export function eraseBetween(editor: Editor, first: number, second: number) {
  const $first = editor.state.doc.resolve(first)
  const $second = editor.state.doc.resolve(second)
  const table = $first.node(-1)
  if (table !== $second.node(-1) || table.type.spec.tableRole !== "table") {
    return false
  }
  const map = TableMap.get(table)
  const start = $first.start(-1)
  const rect = map.rectBetween(first - start, second - start)
  if (map.cellsInRect(rect).length !== 2) {
    return false
  }
  // mergeCells works on a cell selection; its steps are taken over so the merge is one undo step that leaves the
  // text cursor in the merged cell, not two cells selected.
  const { state } = editor
  const selected = state.apply(state.tr.setSelection(CellSelection.create(state.doc, first, second)))
  let merged: Transaction | null = null
  mergeCells(selected, (tr) => {
    merged = tr
  })
  if (!merged) {
    return false
  }
  const tr = state.tr
  for (const step of (merged as Transaction).steps) {
    tr.step(step)
  }
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(first, second) + 1)))
  editor.view.dispatch(tr)
  return true
}

/** A table drawn as a box: one cell the box's width and height, set in from the margin as far as it starts. */
export function insertDrawnTable(editor: Editor, at: number, width: number, height: number, indentPx: number) {
  const { schema } = editor.state
  const cell = schema.nodes.tableCell!.createAndFill({ colspan: 1, rowspan: 1, colwidth: [Math.round(width)] })!
  const row = schema.nodes.tableRow!.create({ height: Math.round(height) }, cell)
  const indent = indentPx > 0 ? Math.round((indentPx / (96 / 2.54)) * 100) / 100 : null
  const table = schema.nodes.table!.create(indent ? { indent } : {}, row)
  editor.view.dispatch(editor.state.tr.insert(at, table).scrollIntoView())
  return true
}

/** How far from a cell's border (on screen) a click or a line still counts as on it. */
const NEAR = 6

type CellHit = { cellPos: number; tablePos: number; dom: HTMLElement }

function cellAt(view: EditorView, target: EventTarget | null): CellHit | null {
  const dom = target instanceof Element ? target.closest<HTMLElement>("td, th") : null
  if (!dom || !view.dom.contains(dom)) {
    return null
  }
  const $cell = cellAround(view.state.doc.resolve(view.posAtDOM(dom, 0)))
  return $cell ? { cellPos: $cell.pos, tablePos: $cell.before(-1), dom } : null
}

/** The table's grid columns' left edges on screen, and its right edge, read from the cells that start each column. */
function columnEdges(view: EditorView, table: ProseNode, tablePos: number) {
  const map = TableMap.get(table)
  const edges: (number | null)[] = Array.from({ length: map.width + 1 }, () => null)
  for (const offset of new Set(map.map)) {
    const rect = map.findCell(offset)
    const dom = view.nodeDOM(tablePos + 1 + offset)
    if (dom instanceof HTMLElement) {
      const box = dom.getBoundingClientRect()
      edges[rect.left] ??= box.left
      edges[rect.right] = Math.max(edges[rect.right] ?? box.right, box.right)
    }
  }
  // A column every cell spans past has no edge of its own; it shares the room between its neighbours.
  for (let at = 1; at < edges.length; at += 1) {
    if (edges[at] === null) {
      const next = edges.findIndex((edge, index) => index > at && edge !== null)
      const from = edges[at - 1]!
      edges[at] = from + (edges[next]! - from) / (next - at + 1)
    }
  }
  return edges as number[]
}

function rowEdges(view: EditorView, table: ProseNode, tablePos: number) {
  const edges: { top: number; bottom: number }[] = []
  table.forEach((_row, offset) => {
    const dom = view.nodeDOM(tablePos + 1 + offset)
    const box = dom instanceof HTMLElement ? dom.getBoundingClientRect() : null
    edges.push(box ? { top: box.top, bottom: box.bottom } : { top: 0, bottom: 0 })
  })
  return edges
}

/** A line drawn with the pencil from (x1, y1) to (x2, y2) on screen, inside the cell it started in. */
function drawLine(view: EditorView, hit: CellHit, x1: number, y1: number, x2: number, y2: number) {
  const table = view.state.doc.nodeAt(hit.tablePos)
  if (!table) {
    return false
  }
  const map = TableMap.get(table)
  const rect = map.findCell(hit.cellPos - hit.tablePos - 1)
  const zoom = useViewStore.getState().zoom || 1
  const tr = view.state.tr
  let done: boolean
  if (Math.abs(y2 - y1) >= Math.abs(x2 - x1)) {
    const edges = columnEdges(view, table, hit.tablePos)
    const widths = edges.slice(1).map((edge, index) => (edge - edges[index]!) / zoom)
    done = splitCellDown(tr, hit.tablePos, hit.cellPos, widths, ((x1 + x2) / 2 - edges[0]!) / zoom)
  } else {
    const y = (y1 + y2) / 2
    const rows = rowEdges(view, table, hit.tablePos)
    const row = rows.findIndex((edge, index) => index >= rect.top && index < rect.bottom && y < edge.bottom)
    if (row < 0) {
      return false
    }
    if (y - rows[row]!.top <= NEAR) {
      done = row > rect.top && splitCellAcross(tr, hit.tablePos, hit.cellPos, row, true)
    } else if (rows[row]!.bottom - y <= NEAR) {
      done = row + 1 < rect.bottom && splitCellAcross(tr, hit.tablePos, hit.cellPos, row + 1, true)
    } else {
      done = splitCellAcross(tr, hit.tablePos, hit.cellPos, row, false)
    }
  }
  if (done) {
    view.dispatch(tr)
  }
  return done
}

/** A box drawn with the pencil outside any table: a new table goes after the paragraph the box starts on. */
function drawBox(editor: Editor, left: number, top: number, right: number, bottom: number) {
  const { view } = editor
  const zoom = useViewStore.getState().zoom || 1
  const found = view.posAtCoords({ left, top })
  if (!found) {
    return false
  }
  const $pos = view.state.doc.resolve(found.pos)
  const at = $pos.depth >= 1 ? $pos.after(1) : found.pos
  const block = $pos.depth >= 1 ? view.nodeDOM($pos.before(1)) : null
  const margin = block instanceof HTMLElement ? block.getBoundingClientRect().left : left
  return insertDrawnTable(editor, at, (right - left) / zoom, (bottom - top) / zoom, (left - margin) / zoom)
}

/** Eraser: a click near the border between two cells merges them. */
function eraseAt(editor: Editor, hit: CellHit, x: number, y: number) {
  const box = hit.dom.getBoundingClientRect()
  const sides = [
    { gap: x - box.left, dx: -1, dy: 0 },
    { gap: box.right - x, dx: 1, dy: 0 },
    { gap: y - box.top, dx: 0, dy: -1 },
    { gap: box.bottom - y, dx: 0, dy: 1 },
  ].sort((a, b) => a.gap - b.gap)
  const side = sides[0]!
  if (side.gap > NEAR) {
    return false
  }
  const across = side.gap + NEAR
  const other = cellAt(editor.view, document.elementFromPoint(x + side.dx * across, y + side.dy * across))
  if (!other || other.tablePos !== hit.tablePos || other.cellPos === hit.cellPos) {
    return false
  }
  return eraseBetween(editor, Math.min(hit.cellPos, other.cellPos), Math.max(hit.cellPos, other.cellPos))
}

/** The pencil and eraser on the page: the cursor, the dashed outline while drawing, and what a drag or click does. */
export const TableDrawing = Extension.create({
  name: "tableDrawing",

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey("tableDrawing"),
        view(view) {
          const show = (mode: TableDrawMode) => {
            view.dom.classList.toggle("table-draw-pen", mode === "draw")
            view.dom.classList.toggle("table-draw-eraser", mode === "erase")
          }
          show(useTableDraw.getState().mode)
          const unsubscribe = useTableDraw.subscribe((state) => show(state.mode))
          return {
            destroy() {
              unsubscribe()
              show(null)
            },
          }
        },
        props: {
          handleKeyDown(_view, event) {
            if (event.key === "Escape" && useTableDraw.getState().mode) {
              useTableDraw.getState().stop()
              return true
            }
            return false
          },
          handleDOMEvents: {
            mousedown(view, event) {
              const mode = useTableDraw.getState().mode
              if (!mode || event.button !== 0 || !view.editable) {
                return false
              }
              event.preventDefault()
              const hit = cellAt(view, event.target)
              if (mode === "erase") {
                if (hit) {
                  eraseAt(editor, hit, event.clientX, event.clientY)
                }
                return true
              }
              const startX = event.clientX
              const startY = event.clientY
              const preview = document.createElement("div")
              preview.className = hit ? "table-draw-preview table-draw-line" : "table-draw-preview"
              document.body.append(preview)
              const place = (x: number, y: number) => {
                let left = Math.min(startX, x)
                let top = Math.min(startY, y)
                let width = Math.abs(x - startX)
                let height = Math.abs(y - startY)
                if (hit) {
                  // Inside a cell the pencil draws a straight line, across or down, whichever way it moved most.
                  if (height >= width) {
                    left = (startX + x) / 2
                    width = 0
                  } else {
                    top = (startY + y) / 2
                    height = 0
                  }
                }
                Object.assign(preview.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` })
              }
              place(startX, startY)
              const move = (moved: MouseEvent) => place(moved.clientX, moved.clientY)
              const up = (ended: MouseEvent) => {
                window.removeEventListener("mousemove", move)
                window.removeEventListener("mouseup", up)
                preview.remove()
                const x = ended.clientX
                const y = ended.clientY
                if (hit) {
                  if (Math.max(Math.abs(x - startX), Math.abs(y - startY)) >= 8) {
                    drawLine(view, hit, startX, startY, x, y)
                  }
                } else if (Math.abs(x - startX) >= 16 && Math.abs(y - startY) >= 8) {
                  drawBox(editor, Math.min(startX, x), Math.min(startY, y), Math.max(startX, x), Math.max(startY, y))
                }
              }
              window.addEventListener("mousemove", move)
              window.addEventListener("mouseup", up)
              return true
            },
          },
        },
      }),
    ]
  },
})
