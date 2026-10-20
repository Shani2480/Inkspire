import type { Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { TableMap, cellAround, findTable } from "@tiptap/pm/tables"
import { currentTable, toggleTableStyleOption } from "@/editor/table-tools"

const PX_PER_CM = 96 / 2.54

export function tableLayoutState(editor: Editor) {
  const table = currentTable(editor)
  const row = currentRow(editor)
  const cell = currentCell(editor)
  if (!table || !row || !cell) {
    return null
  }
  const width = Array.isArray(cell.node.attrs.colwidth) ? Number(cell.node.attrs.colwidth[0]) || 0 : 0
  const height = Number(row.node.attrs.height) || 0
  return {
    heightCm: roundCm((height || rowHeight(editor, row.pos)) / PX_PER_CM),
    widthCm: roundCm((width || cellWidth(editor, cell.pos)) / PX_PER_CM),
    gridlines: table.node.attrs.gridlines !== false,
    headerRow: Boolean(table.node.attrs.headerRow),
    vertical: cell.node.attrs.textDir === "vertical",
    cellPad: (table.node.attrs.cellPad === "narrow" || table.node.attrs.cellPad === "wide"
      ? table.node.attrs.cellPad
      : "normal") as CellPad,
    valign: (cell.node.attrs.valign === "middle" || cell.node.attrs.valign === "bottom"
      ? cell.node.attrs.valign
      : "top") as "top" | "middle" | "bottom",
    /** A height was set on the row, so it is not simply as tall as its text. */
    rowHeightSet: Number(row.node.attrs.height) > 0,
  }
}

export type CellPad = "narrow" | "normal" | "wide"

/** What the Table Properties dialog edits (22.10). Heights and widths are in centimetres. */
export type TableProperties = {
  cellPad: CellPad
  gridlines: boolean
  headerRow: boolean
  /** The row height, or null to let the row follow its text. */
  rowHeightCm: number | null
  columnWidthCm: number
  valign: "top" | "middle" | "bottom"
}

/** Applies only what differs from the table's current state, so an unchanged field never rewrites the table. */
export function applyTableProperties(editor: Editor, next: TableProperties): boolean {
  const before = tableLayoutState(editor)
  const table = currentTable(editor)
  const row = currentRow(editor)
  const cell = currentCell(editor)
  if (!before || !table || !row || !cell) {
    return false
  }
  if (next.cellPad !== before.cellPad) {
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(table.pos, undefined, { ...table.node.attrs, cellPad: next.cellPad }),
    )
  }
  if (next.gridlines !== before.gridlines) {
    toggleGridlines(editor)
  }
  if (next.headerRow !== before.headerRow) {
    toggleRepeatHeader(editor)
  }
  if (next.rowHeightCm === null) {
    if (before.rowHeightSet) {
      const current = currentRow(editor)
      if (current) {
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(current.pos, undefined, { ...current.node.attrs, height: null }),
        )
      }
    }
  } else if (!before.rowHeightSet || Math.abs(next.rowHeightCm - before.heightCm) > 0.005) {
    setRowHeightCm(editor, next.rowHeightCm)
  }
  if (Math.abs(next.columnWidthCm - before.widthCm) > 0.005) {
    setColumnWidthCm(editor, next.columnWidthCm)
  }
  if (next.valign !== before.valign) {
    const current = currentCell(editor)
    if (current) {
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(current.pos, undefined, { ...current.node.attrs, valign: next.valign }),
      )
    }
  }
  return true
}

export function setRowHeightCm(editor: Editor, cm: number) {
  const row = currentRow(editor)
  if (!row || !(cm > 0)) {
    return
  }
  const height = Math.max(22, Math.round(cm * PX_PER_CM))
  editor.view.dispatch(editor.state.tr.setNodeMarkup(row.pos, undefined, { ...row.node.attrs, height }))
}

export function setColumnWidthCm(editor: Editor, cm: number) {
  const table = currentTable(editor)
  const cell = currentCell(editor)
  if (!table || !cell || !(cm > 0)) {
    return
  }
  const widths = readWidths(table.node)
  const map = TableMap.get(table.node)
  const rect = map.findCell(cell.pos - table.start)
  widths[rect.left] = Math.max(28, Math.round(cm * PX_PER_CM))
  writeWidths(editor, table, widths)
}

export function distributeRows(editor: Editor) {
  const table = currentTable(editor)
  if (!table) {
    return
  }
  const heights: number[] = []
  table.node.forEach((_row, offset) => {
    heights.push(rowHeight(editor, table.pos + 1 + offset))
  })
  const average = Math.max(22, Math.round(heights.reduce((sum, value) => sum + value, 0) / Math.max(1, heights.length)))
  let tr = editor.state.tr
  table.node.forEach((_row, offset) => {
    const pos = tr.mapping.map(table.pos + 1 + offset)
    const node = tr.doc.nodeAt(pos)
    if (node) {
      tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, height: average })
    }
  })
  editor.view.dispatch(tr)
}

export function distributeColumns(editor: Editor) {
  const table = currentTable(editor)
  if (!table) {
    return
  }
  const widths = readWidths(table.node)
  const average = Math.max(28, Math.round(widths.reduce((sum, value) => sum + value, 0) / Math.max(1, widths.length)))
  writeWidths(
    editor,
    table,
    widths.map(() => average),
  )
}

export function autoFitTable(editor: Editor, mode: "window" | "contents") {
  const table = currentTable(editor)
  if (!table) {
    return
  }
  if (mode === "contents") {
    writeWidths(
      editor,
      table,
      readWidths(table.node).map(() => 0),
      true,
    )
    return
  }
  const dom = editor.view.nodeDOM(table.pos)
  const page = dom instanceof HTMLElement ? dom.closest(".page-editor") : null
  const available = page instanceof HTMLElement ? Math.max(160, page.clientWidth - 8) : 480
  const count = TableMap.get(table.node).width
  const each = Math.max(28, Math.floor(available / Math.max(1, count)))
  writeWidths(
    editor,
    table,
    Array.from({ length: count }, () => each),
  )
}

export function toggleGridlines(editor: Editor) {
  const table = currentTable(editor)
  if (!table) {
    return
  }
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(table.pos, undefined, {
      ...table.node.attrs,
      gridlines: table.node.attrs.gridlines === false,
    }),
  )
}

export function cycleCellMargins(editor: Editor) {
  const table = currentTable(editor)
  if (!table) {
    return
  }
  const current =
    table.node.attrs.cellPad === "narrow" || table.node.attrs.cellPad === "wide" ? table.node.attrs.cellPad : "normal"
  const next = current === "normal" ? "narrow" : current === "narrow" ? "wide" : "normal"
  editor.view.dispatch(editor.state.tr.setNodeMarkup(table.pos, undefined, { ...table.node.attrs, cellPad: next }))
}

export function alignTableCell(
  editor: Editor,
  horizontal: "left" | "center" | "right",
  vertical: "top" | "middle" | "bottom",
) {
  const cell = currentCell(editor)
  if (!cell) {
    return
  }
  const tr = editor.state.tr.setNodeMarkup(cell.pos, undefined, { ...cell.node.attrs, valign: vertical })
  editor.view.dispatch(tr)
  editor.chain().focus().setTextAlign(horizontal).run()
}

export function toggleTextDirection(editor: Editor) {
  const cell = currentCell(editor)
  if (!cell) {
    return
  }
  const textDir = cell.node.attrs.textDir === "vertical" ? "horizontal" : "vertical"
  editor.view.dispatch(editor.state.tr.setNodeMarkup(cell.pos, undefined, { ...cell.node.attrs, textDir }))
}

export function toggleRepeatHeader(editor: Editor) {
  toggleTableStyleOption(editor, "headerRow")
}

export function splitTable(editor: Editor) {
  const table = currentTable(editor)
  const cell = currentCell(editor)
  if (!table || !cell) {
    return
  }
  const map = TableMap.get(table.node)
  const rect = map.findCell(cell.pos - table.start)
  if (rect.top <= 0 || rect.top >= map.height) {
    return
  }
  const rows: ProseNode[] = []
  table.node.forEach((row) => rows.push(row))
  const head = table.node.type.create(table.node.attrs, rows.slice(0, rect.top))
  const rest = table.node.type.create(table.node.attrs, rows.slice(rect.top))
  const after = table.pos + table.node.nodeSize
  let tr = editor.state.tr.insert(after, rest)
  tr = tr.replaceWith(table.pos, after, head)
  editor.view.dispatch(tr)
}

export function sortTable(editor: Editor) {
  const table = currentTable(editor)
  if (!table) {
    return
  }
  const rows: ProseNode[] = []
  table.node.forEach((row) => rows.push(row))
  const start = table.node.attrs.headerRow ? 1 : 0
  const body = rows.slice(start).sort((left, right) => rowText(left).localeCompare(rowText(right)))
  const next = table.node.type.create(table.node.attrs, [...rows.slice(0, start), ...body])
  editor.view.dispatch(editor.state.tr.replaceWith(table.pos, table.pos + table.node.nodeSize, next))
}

export function convertTableToText(editor: Editor) {
  const table = currentTable(editor)
  if (!table) {
    return
  }
  const paragraph = editor.schema.nodes.paragraph
  if (!paragraph) {
    return
  }
  const blocks: ProseNode[] = []
  table.node.forEach((row) => {
    const cells: string[] = []
    row.forEach((cell) => cells.push(cell.textContent))
    const text = cells.join("\t")
    blocks.push(paragraph.create(null, text ? editor.schema.text(text) : null))
  })
  editor.view.dispatch(editor.state.tr.replaceWith(table.pos, table.pos + table.node.nodeSize, blocks))
}

export function insertColumnSum(editor: Editor) {
  const table = currentTable(editor)
  const cell = currentCell(editor)
  if (!table || !cell) {
    return
  }
  const map = TableMap.get(table.node)
  const rect = map.findCell(cell.pos - table.start)
  let sum = 0
  for (let row = 0; row < rect.top; row += 1) {
    const node = table.node.nodeAt(map.positionAt(row, rect.left, table.node))
    const value = Number(String(node?.textContent || "").replace(/[^0-9.-]/g, ""))
    if (Number.isFinite(value)) {
      sum += value
    }
  }
  const paragraph = editor.schema.nodes.paragraph
  if (!paragraph) {
    return
  }
  const from = cell.pos + 1
  const to = cell.pos + cell.node.nodeSize - 1
  const text = String(Math.round(sum * 100) / 100)
  editor.view.dispatch(editor.state.tr.replaceWith(from, to, paragraph.create(null, editor.schema.text(text))))
}

export function clearCellBorders(editor: Editor) {
  const cell = currentCell(editor)
  if (!cell) {
    return
  }
  editor.view.dispatch(editor.state.tr.setNodeMarkup(cell.pos, undefined, { ...cell.node.attrs, borders: "none" }))
}

function currentRow(editor: Editor) {
  const $from = editor.state.selection.$from
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "tableRow") {
      return { pos: $from.before(depth), node: $from.node(depth) }
    }
  }
  return null
}

function currentCell(editor: Editor) {
  const $cell = cellAround(editor.state.selection.$from)
  const table = $cell ? findTable($cell) : null
  if (!$cell || !table) {
    return null
  }
  const node = editor.state.doc.nodeAt($cell.pos)
  if (!node) {
    return null
  }
  return { pos: $cell.pos, node, table }
}

function readWidths(table: ProseNode) {
  const map = TableMap.get(table)
  return Array.from({ length: map.width }, (_, column) => {
    const cell = table.nodeAt(map.positionAt(0, column, table))
    const width = Array.isArray(cell?.attrs.colwidth) ? Number(cell.attrs.colwidth[0]) : 0
    return width > 0 ? width : 96
  })
}

function writeWidths(
  editor: Editor,
  table: { node: ProseNode; pos: number; start: number },
  widths: number[],
  clear = false,
) {
  const map = TableMap.get(table.node)
  const seen = new Set<number>()
  let tr = editor.state.tr
  for (let row = 0; row < map.height; row += 1) {
    for (let column = 0; column < map.width; column += 1) {
      const relative = map.positionAt(row, column, table.node)
      if (seen.has(relative)) {
        continue
      }
      seen.add(relative)
      const pos = tr.mapping.map(table.start + relative)
      const node = tr.doc.nodeAt(pos)
      if (!node) {
        continue
      }
      const span = Math.max(1, Number(node.attrs.colspan) || 1)
      const colwidth = clear ? null : widths.slice(column, column + span).map((value) => Math.round(value))
      tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, colwidth })
    }
  }
  editor.view.dispatch(tr)
}

function rowHeight(editor: Editor, pos: number) {
  const dom = editor.view.nodeDOM(pos)
  return dom instanceof HTMLElement ? Math.max(22, Math.round(dom.getBoundingClientRect().height)) : 28
}

function cellWidth(editor: Editor, pos: number) {
  const dom = editor.view.nodeDOM(pos)
  return dom instanceof HTMLElement ? Math.max(28, Math.round(dom.getBoundingClientRect().width)) : 96
}

function rowText(row: ProseNode) {
  let text = ""
  row.forEach((cell) => {
    if (!text) {
      text = cell.textContent
    }
  })
  return text
}

function roundCm(value: number) {
  return Math.round(value * 100) / 100
}
