import type { Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { CellSelection, TableMap } from "@tiptap/pm/tables"
import { currentTable } from "@/editor/table-tools"
import {
  PX_PER_CM,
  marginsValue,
  parseMargins,
  parsePreferredWidth,
  preferredWidthValue,
  presetMargins,
  type Margins,
  type PreferredWidth,
} from "@/editor/table-props"

/**
 * Word's Table Properties dialog (22.10) over the table the selection is in: what each tab shows, kept as a draft
 * while the dialog is open (Previous / Next Row and Column move through the table), and written in one step on OK.
 * Lengths are in centimetres; a preferred width is in centimetres or a percentage of the text width.
 */

export type RowDraft = { pos: number; height: number | null; rule: "atLeast" | "exact"; cantSplit: boolean }
export type ColumnDraft = { width: PreferredWidth | null }

export type TableDraft = {
  prefWidth: PreferredWidth | null
  align: "left" | "center" | "right"
  indent: number
  cellSpacing: number | null
  autoResize: boolean
  margins: Margins
  /** The margins came from Table Options, not from the Narrow / Normal / Wide preset. */
  marginsSet: boolean
  headerRow: boolean
  altTitle: string
  altDesc: string
  rows: RowDraft[]
  columns: ColumnDraft[]
  /** The selected cells' size, vertical alignment and options (Cell tab, Cell Options). */
  cellWidth: PreferredWidth | null
  valign: "top" | "middle" | "bottom"
  cellMargins: Margins | null
  noWrap: boolean
  fitText: boolean
}

export type TableDialogState = {
  tablePos: number
  /** The text width, for percentages. */
  textWidth: number
  /** Which rows and columns the selection covers, first and last: what the Row and Column tabs open on. */
  rowRange: [number, number]
  columnRange: [number, number]
  /** Each selected cell's position. */
  cells: number[]
  /** Every column's width as drawn, in pixels. */
  drawn: number[]
  draft: TableDraft
}

const round = (value: number) => Math.round(value * 100) / 100

function columnWidths(table: ProseNode, map: TableMap, dom: HTMLTableElement | null) {
  const widths: number[] = Array.from({ length: map.width }, () => 0)
  for (let row = 0; row < map.height; row += 1) {
    for (let column = 0; column < map.width; column += 1) {
      const cell = table.nodeAt(map.map[row * map.width + column]!)
      const first = map.map.indexOf(map.map[row * map.width + column]!) % map.width
      const width = Array.isArray(cell?.attrs.colwidth) ? Number(cell.attrs.colwidth[column - first]) : 0
      if (width > 0 && !widths[column]) {
        widths[column] = width
      }
    }
  }
  const drawn = dom?.rows[0]
    ? [...dom.rows[0].cells].flatMap((cell) =>
        Array.from({ length: cell.colSpan || 1 }, () => cell.offsetWidth / (cell.colSpan || 1)),
      )
    : []
  return widths.map((width, index) => width || drawn[index] || 96)
}

export function tableDialogState(editor: Editor): TableDialogState | null {
  const found = currentTable(editor)
  if (!found) {
    return null
  }
  const { node, pos } = found
  const map = TableMap.get(node)
  const start = pos + 1
  const selection = editor.state.selection
  const cells =
    selection instanceof CellSelection
      ? (() => {
          const list: number[] = []
          selection.forEachCell((_cell, cellPos) => list.push(cellPos))
          return list
        })()
      : (() => {
          const $from = selection.$from
          for (let depth = $from.depth; depth > 0; depth -= 1) {
            const name = $from.node(depth).type.name
            if (name === "tableCell" || name === "tableHeader") {
              return [$from.before(depth)]
            }
          }
          return []
        })()
  if (cells.length === 0) {
    return null
  }
  const rects = cells.map((cellPos) => map.findCell(cellPos - start))
  const rowRange: [number, number] = [
    Math.min(...rects.map((rect) => rect.top)),
    Math.max(...rects.map((rect) => rect.bottom - 1)),
  ]
  const columnRange: [number, number] = [
    Math.min(...rects.map((rect) => rect.left)),
    Math.max(...rects.map((rect) => rect.right - 1)),
  ]
  const dom = editor.view.nodeDOM(pos)
  const tableDom = dom instanceof HTMLElement ? (dom.matches("table") ? dom : dom.querySelector("table")) : null
  const page = tableDom?.closest(".page-editor")
  const textWidth = page instanceof HTMLElement ? page.clientWidth : 624
  const drawn = columnWidths(node, map, tableDom as HTMLTableElement | null)
  const rows: RowDraft[] = []
  node.forEach((row, offset) => {
    const height = Number(row.attrs.height)
    rows.push({
      pos: start + offset,
      height: height > 0 ? round(height / PX_PER_CM) : null,
      rule: row.attrs.heightRule === "exact" ? "exact" : "atLeast",
      cantSplit: row.attrs.cantSplit === true,
    })
  })
  const anchor = editor.state.doc.nodeAt(cells[0]!)
  const attrs = node.attrs
  const ownMargins = parseMargins(typeof attrs.margins === "string" ? attrs.margins : null)
  const colwidth = Array.isArray(anchor?.attrs.colwidth) ? Number(anchor.attrs.colwidth[0]) : 0
  return {
    tablePos: pos,
    textWidth,
    rowRange,
    columnRange,
    cells,
    drawn,
    draft: {
      prefWidth: parsePreferredWidth(typeof attrs.prefWidth === "string" ? attrs.prefWidth : null),
      align: attrs.align === "center" || attrs.align === "right" ? attrs.align : "left",
      indent: typeof attrs.indent === "number" ? attrs.indent : 0,
      cellSpacing: typeof attrs.cellSpacing === "number" && attrs.cellSpacing > 0 ? attrs.cellSpacing : null,
      autoResize: attrs.autoResize !== false,
      margins: ownMargins ?? presetMargins(attrs.cellPad),
      marginsSet: ownMargins !== null,
      headerRow: attrs.headerRow === true,
      altTitle: typeof attrs.altTitle === "string" ? attrs.altTitle : "",
      altDesc: typeof attrs.altDesc === "string" ? attrs.altDesc : "",
      rows,
      columns: drawn.map((width) => ({ width: { value: round(width / PX_PER_CM), unit: "cm" as const } })),
      cellWidth: colwidth > 0 ? { value: round(colwidth / PX_PER_CM), unit: "cm" } : null,
      valign: anchor?.attrs.valign === "middle" || anchor?.attrs.valign === "bottom" ? anchor.attrs.valign : "top",
      cellMargins: parseMargins(typeof anchor?.attrs.cellMargins === "string" ? anchor.attrs.cellMargins : null),
      noWrap: anchor?.attrs.noWrap === true,
      fitText: anchor?.attrs.fitText === true,
    },
  }
}

/** A preferred width in pixels: centimetres, or a share of `whole`. */
export function widthPx(width: PreferredWidth, whole: number) {
  return width.unit === "pct" ? (whole * width.value) / 100 : width.value * PX_PER_CM
}

/**
 * The columns' widths after the dialog: each column given a preferred width (Column tab, or the Cell tab for the
 * selected cells' columns) takes it, then a preferred width for the whole table scales them all to it.
 */
export function dialogColumnWidths(state: TableDialogState, draft: TableDraft, before: TableDraft) {
  const widths = state.drawn.slice()
  const tableWidth = widths.reduce((sum, width) => sum + width, 0)
  draft.columns.forEach((column, index) => {
    if (column.width && preferredWidthValue(column.width) !== preferredWidthValue(before.columns[index]?.width)) {
      widths[index] = widthPx(column.width, tableWidth)
    }
  })
  const cellChanged = draft.cellWidth && preferredWidthValue(draft.cellWidth) !== preferredWidthValue(before.cellWidth)
  if (cellChanged && draft.cellWidth) {
    for (let index = state.columnRange[0]; index <= state.columnRange[1]; index += 1) {
      widths[index] = widthPx(draft.cellWidth, tableWidth)
    }
  }
  const tableChanged = draft.prefWidth && preferredWidthValue(draft.prefWidth) !== preferredWidthValue(before.prefWidth)
  if (tableChanged && draft.prefWidth) {
    const target = widthPx(draft.prefWidth, state.textWidth)
    const total = widths.reduce((sum, width) => sum + width, 0)
    return widths.map((width) => Math.max(28, Math.round((width * target) / (total || 1))))
  }
  return widths.map((width) => Math.max(28, Math.round(width)))
}

/** Writes the dialog's draft into the table in one step (one undo). */
export function applyTableDialog(editor: Editor, state: TableDialogState, draft: TableDraft) {
  const { tablePos } = state
  const before = state.draft
  let tr = editor.state.tr
  const table = tr.doc.nodeAt(tablePos)
  if (!table) {
    return false
  }
  tr = tr.setNodeMarkup(tablePos, undefined, {
    ...table.attrs,
    prefWidth: preferredWidthValue(draft.prefWidth),
    align: draft.align,
    indent: draft.align === "left" && draft.indent ? draft.indent : null,
    cellSpacing: draft.cellSpacing && draft.cellSpacing > 0 ? draft.cellSpacing : null,
    autoResize: draft.autoResize,
    margins: draft.marginsSet ? marginsValue(draft.margins) : null,
    headerRow: draft.headerRow,
    altTitle: draft.altTitle,
    altDesc: draft.altDesc,
  })
  for (const row of draft.rows) {
    const node = tr.doc.nodeAt(row.pos)
    if (node?.type.name === "tableRow") {
      tr = tr.setNodeMarkup(row.pos, undefined, {
        ...node.attrs,
        height: row.height ? Math.round(row.height * PX_PER_CM) : null,
        heightRule: row.rule,
        cantSplit: row.cantSplit,
      })
    }
  }
  for (const cellPos of state.cells) {
    const node = tr.doc.nodeAt(cellPos)
    if (node) {
      tr = tr.setNodeMarkup(cellPos, undefined, {
        ...node.attrs,
        valign: draft.valign,
        cellMargins: marginsValue(draft.cellMargins),
        noWrap: draft.noWrap,
        fitText: draft.fitText,
      })
    }
  }
  const widths = dialogColumnWidths(state, draft, before)
  const unchanged = widths.every((width, index) => Math.abs(width - (state.drawn[index] ?? width)) < 1)
  if (!unchanged) {
    const current = tr.doc.nodeAt(tablePos)!
    const map = TableMap.get(current)
    const seen = new Set<number>()
    for (let row = 0; row < map.height; row += 1) {
      for (let column = 0; column < map.width; column += 1) {
        const rel = map.map[row * map.width + column]!
        if (seen.has(rel)) {
          continue
        }
        seen.add(rel)
        const node = current.nodeAt(rel)
        if (!node) {
          continue
        }
        const span = Number(node.attrs.colspan) || 1
        tr = tr.setNodeMarkup(tablePos + 1 + rel, undefined, {
          ...tr.doc.nodeAt(tablePos + 1 + rel)!.attrs,
          colwidth: widths.slice(column, column + span),
        })
      }
    }
  }
  if (tr.docChanged) {
    editor.view.dispatch(tr)
  }
  return true
}
