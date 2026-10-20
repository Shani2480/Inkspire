import type { Editor } from "@tiptap/core"
import { Table, TableCell, TableHeader, TableRow, TableView } from "@tiptap/extension-table"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state"
import { CellSelection, TableMap, addColumn, addRow, cellAround, findTable } from "@tiptap/pm/tables"
import type { EditorView } from "@tiptap/pm/view"

const backgroundColor = {
  default: null as string | null,
  parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
  renderHTML: (attributes: { backgroundColor?: string | null }) =>
    attributes.backgroundColor ? { style: `background-color: ${attributes.backgroundColor}` } : {},
}

/** "all", "none", or the sides drawn, such as "top left". */
const borders = {
  default: null as string | null,
  parseHTML: (element: HTMLElement) => element.getAttribute("data-borders") || null,
  renderHTML: (attributes: { borders?: string | null }) =>
    attributes.borders ? { "data-borders": attributes.borders } : {},
}

/** The pen a cell's borders were drawn with, as the CSS border shorthand. */
const borderPen = {
  default: null as string | null,
  parseHTML: (element: HTMLElement) => element.style.getPropertyValue("--cell-border") || null,
  renderHTML: (attributes: { borderPen?: string | null }) =>
    attributes.borderPen
      ? {
          style: `--cell-border: ${attributes.borderPen}; --cell-border-color: ${attributes.borderPen.split(" ")[2] ?? "#404040"}`,
        }
      : {},
}

const textDir = {
  default: "horizontal" as string,
  parseHTML: (element: HTMLElement) =>
    element.getAttribute("data-text-dir") === "vertical" ? "vertical" : "horizontal",
  renderHTML: (attributes: { textDir?: string }) =>
    attributes.textDir === "vertical" ? { "data-text-dir": "vertical", style: "writing-mode: vertical-rl" } : {},
}

const valign = {
  default: "top" as string,
  parseHTML: (element: HTMLElement) => {
    const value = element.getAttribute("data-valign")
    return value === "middle" || value === "bottom" ? value : "top"
  },
  renderHTML: (attributes: { valign?: string }) =>
    attributes.valign === "middle" || attributes.valign === "bottom" ? { "data-valign": attributes.valign } : {},
}

export class StyledTableView extends TableView {
  constructor(node: ProseNode, cellMinWidth: number, view?: EditorView, HTMLAttributes?: Record<string, unknown>) {
    super(node, cellMinWidth, view, HTMLAttributes)
    applyTableStyleDom(this.table, node)
  }

  update(node: ProseNode) {
    if (!super.update(node)) {
      return false
    }
    applyTableStyleDom(this.table, node)
    return true
  }
}

function applyTableStyleDom(table: HTMLTableElement, node: ProseNode) {
  const colors = lookColors(String(node.attrs.look || "plain"))
  const frame = node.attrs.frame === "none" || node.attrs.frame === "bottom" ? node.attrs.frame : "all"
  table.dataset.look = colors.id
  table.dataset.frame = frame
  table.style.setProperty("--table-header", colors.header)
  table.style.setProperty("--table-band", colors.band)
  table.style.setProperty("--table-soft", colors.soft)
  setStyleFlag(table, "header-row", node.attrs.headerRow)
  setStyleFlag(table, "banded-rows", node.attrs.bandedRows)
  setStyleFlag(table, "first-column", node.attrs.firstColumn)
  setStyleFlag(table, "banded-columns", node.attrs.bandedColumns)
  setStyleFlag(table, "total-row", node.attrs.totalRow)
  setStyleFlag(table, "last-column", node.attrs.lastColumn)
  table.dataset.gridlines = node.attrs.gridlines === false ? "0" : "1"
  const pad = node.attrs.cellPad === "narrow" || node.attrs.cellPad === "wide" ? node.attrs.cellPad : "normal"
  table.dataset.cellPad = pad
  applyWordTable(table, node)
}

/** The table view draws its own <table>, so the Word attributes are copied onto it here. */
function applyWordTable(table: HTMLTableElement, node: ProseNode) {
  const word = node.attrs.wordTable === true
  setStyleFlag(table, "word-table", word)
  const style = typeof node.attrs.wordTableStyle === "string" ? node.attrs.wordTableStyle : ""
  if (word && style) {
    table.dataset.wordTableStyle = style
  } else {
    delete table.dataset.wordTableStyle
  }
  if (word) {
    table.dataset.wordLook = String(node.attrs.wordLook ?? "")
  } else {
    delete table.dataset.wordLook
  }
  for (const name of [...table.style].filter((item) => item.startsWith("--wb-") || item.startsWith("--wc-"))) {
    table.style.removeProperty(name)
  }
  for (const [name, value] of cssDeclarations(word ? String(node.attrs.wordFrame ?? "") : "")) {
    if (name.startsWith("--wb-") || name.startsWith("--wc-")) {
      table.style.setProperty(name, value)
    }
  }
}

function cssDeclarations(css: string) {
  return css
    .split(";")
    .map((item) => item.split(/:(.*)/s).map((part) => part.trim()))
    .filter((pair): pair is [string, string] => Boolean(pair[0] && pair[1]))
}

/** Word's own attributes for a table opened from a .docx: shown as Word draws it, never written back. */
const wordTableAttributes = {
  wordTable: {
    default: false,
    parseHTML: (element: HTMLElement) => element.getAttribute("data-word-table") === "1",
    renderHTML: (attributes: { wordTable?: boolean }) => (attributes.wordTable ? { "data-word-table": "1" } : {}),
  },
  wordTableStyle: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => element.getAttribute("data-word-table-style"),
    renderHTML: (attributes: { wordTableStyle?: string | null }) =>
      attributes.wordTableStyle ? { "data-word-table-style": attributes.wordTableStyle } : {},
  },
  wordLook: {
    default: "",
    parseHTML: (element: HTMLElement) => element.getAttribute("data-word-look") ?? "",
    renderHTML: (attributes: { wordLook?: string }) =>
      attributes.wordLook ? { "data-word-look": attributes.wordLook } : {},
  },
  wordFrame: {
    default: "",
    parseHTML: (element: HTMLElement) => element.getAttribute("data-word-frame") ?? "",
    renderHTML: (attributes: { wordFrame?: string }) =>
      attributes.wordFrame ? { "data-word-frame": attributes.wordFrame, style: attributes.wordFrame } : {},
  },
}

/** A Word cell's borders and margins, as inline CSS. */
const wordCell = {
  default: "",
  parseHTML: (element: HTMLElement) => element.getAttribute("data-word-cell") ?? "",
  renderHTML: (attributes: { wordCell?: string }) =>
    attributes.wordCell ? { "data-word-cell": attributes.wordCell, style: attributes.wordCell } : {},
}

function setStyleFlag(table: HTMLTableElement, name: string, on: unknown) {
  if (on) {
    table.setAttribute(`data-${name}`, "1")
    return
  }
  table.removeAttribute(`data-${name}`)
}

export const FramedTable = Table.extend({
  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), rowResizing()]
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      frame: {
        default: "all",
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute("data-frame")
          return value === "none" || value === "bottom" ? value : "all"
        },
        renderHTML: (attributes: { frame?: string }) => ({
          "data-frame": attributes.frame === "none" || attributes.frame === "bottom" ? attributes.frame : "all",
        }),
      },
      look: {
        default: "plain",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-look") || "plain",
        renderHTML: (attributes: { look?: string }) => {
          const colors = lookColors(attributes.look)
          return {
            "data-look": colors.id,
            style: `--table-header: ${colors.header}; --table-band: ${colors.band}; --table-soft: ${colors.soft}`,
          }
        },
      },
      headerRow: styleFlag("header-row"),
      bandedRows: styleFlag("banded-rows"),
      firstColumn: styleFlag("first-column"),
      bandedColumns: styleFlag("banded-columns"),
      totalRow: styleFlag("total-row"),
      lastColumn: styleFlag("last-column"),
      gridlines: {
        default: true,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-gridlines") !== "0",
        renderHTML: (attributes: { gridlines?: boolean }) => ({
          "data-gridlines": attributes.gridlines === false ? "0" : "1",
        }),
      },
      ...wordTableAttributes,
      cellPad: {
        default: "normal",
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute("data-cell-pad")
          return value === "narrow" || value === "wide" ? value : "normal"
        },
        renderHTML: (attributes: { cellPad?: string }) => ({
          "data-cell-pad":
            attributes.cellPad === "narrow" || attributes.cellPad === "wide" ? attributes.cellPad : "normal",
        }),
      },
    }
  },
})

function styleFlag(name: string) {
  return {
    default: false,
    parseHTML: (element: HTMLElement) => element.getAttribute(`data-${name}`) === "1",
    renderHTML: (attributes: Record<string, unknown>) => {
      const key = name.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
      return attributes[key] ? { [`data-${name}`]: "1" } : {}
    },
  }
}

export const ShadedTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor,
      borders,
      borderPen,
      textDir,
      valign,
      wordCell,
    }
  },
})

export const ShadedTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor,
      borders,
      borderPen,
      textDir,
      valign,
      wordCell,
    }
  },
})

export const SizedTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      height: {
        default: null as number | null,
        parseHTML: (element: HTMLElement) => {
          const value = Number.parseFloat(element.style.height)
          return Number.isFinite(value) ? value : null
        },
        renderHTML: (attributes: { height?: number | null }) =>
          attributes.height ? { style: `height: ${attributes.height}px` } : {},
      },
    }
  },
})

export const TABLE_LOOKS = [
  { id: "plain", label: "Plain Table", header: "#1f4e79", band: "#deecf9", soft: "#d6e3f0", body: "" },
  { id: "grid", label: "Grid Table", header: "#2e75b6", band: "#f2f2f2", soft: "#dde6f2", body: "#ffffff" },
  { id: "banded", label: "Banded Table", header: "#1f4e79", band: "#deecf9", soft: "#d6e3f0", body: "#ffffff" },
  { id: "list", label: "List Table", header: "#548235", band: "#e2efda", soft: "#e2efda", body: "#ffffff" },
  { id: "orange", label: "Orange Table", header: "#c55a11", band: "#fbe5d6", soft: "#f8cbad", body: "#ffffff" },
  { id: "gold", label: "Gold Table", header: "#bf8f00", band: "#fff2cc", soft: "#ffe699", body: "#ffffff" },
  { id: "gray", label: "Gray Table", header: "#595959", band: "#ededed", soft: "#d9d9d9", body: "#ffffff" },
  { id: "navy", label: "Navy Table", header: "#203864", band: "#d9e2f3", soft: "#b4c6e7", body: "#ffffff" },
  { id: "teal", label: "Teal Table", header: "#1b7a8c", band: "#dff1f4", soft: "#b9e0e7", body: "#ffffff" },
  { id: "green", label: "Green Table", header: "#375623", band: "#e2efda", soft: "#c6e0b4", body: "#ffffff" },
  { id: "red", label: "Red Table", header: "#a42b2b", band: "#f8dede", soft: "#f0b8b8", body: "#ffffff" },
  { id: "purple", label: "Purple Table", header: "#5b3a8e", band: "#e6def2", soft: "#cdbfe6", body: "#ffffff" },
  { id: "slate", label: "Slate Table", header: "#44546a", band: "#d6dce4", soft: "#adb9ca", body: "#ffffff" },
  { id: "black", label: "Dark Table", header: "#262626", band: "#e7e6e6", soft: "#bfbfbf", body: "#ffffff" },
] as const

export type TableLook = (typeof TABLE_LOOKS)[number]["id"]
export type TableStyleOption = "headerRow" | "totalRow" | "firstColumn" | "lastColumn" | "bandedRows" | "bandedColumns"

function lookColors(look?: string) {
  return TABLE_LOOKS.find((item) => item.id === look) ?? TABLE_LOOKS[0]
}

export function tableStyleOptions(editor: Editor) {
  const table = currentTable(editor)
  if (!table) {
    return null
  }
  const attrs = table.node.attrs
  return {
    headerRow: Boolean(attrs.headerRow),
    totalRow: Boolean(attrs.totalRow),
    lastColumn: Boolean(attrs.lastColumn),
    bandedRows: Boolean(attrs.bandedRows),
    firstColumn: Boolean(attrs.firstColumn),
    bandedColumns: Boolean(attrs.bandedColumns),
  }
}

export function toggleTableStyleOption(editor: Editor, option: TableStyleOption) {
  const table = currentTable(editor)
  if (!table) {
    return
  }
  const next = !table.node.attrs[option]
  writeTableAttrs(editor, table, { ...table.node.attrs, [option]: next })
  if (option === "headerRow") {
    syncHeaderRow(editor, next)
  }
}

export function currentTable(editor: Editor) {
  return findTable(editor.state.selection.$from)
}

export function tableSelectionAnchor(editor: Editor) {
  const selection = editor.state.selection
  const $cell = selection instanceof CellSelection ? selection.$anchorCell : cellAround(selection.$from)
  const table = $cell ? findTable($cell) : null
  if (!$cell || !table) {
    return null
  }
  const map = TableMap.get(table.node)
  const rect = map.findCell($cell.pos - table.start)
  const columnSelection = selection instanceof CellSelection && selection.isColSelection()
  const rowSelection = selection instanceof CellSelection && selection.isRowSelection()
  return {
    row: rect.top,
    col: rect.left,
    columnSelection,
    rowSelection,
  }
}

function tableRect(editor: Editor) {
  const table = currentTable(editor)
  if (!table) {
    return null
  }
  const map = TableMap.get(table.node)
  return {
    map,
    tableStart: table.start,
    table: table.node,
    left: 0,
    top: 0,
    right: map.width,
    bottom: map.height,
  }
}

export function insertTableColumn(editor: Editor, index: number) {
  const rect = tableRect(editor)
  if (!rect || index < 0 || index > rect.map.width) {
    return
  }
  editor.view.dispatch(addColumn(editor.state.tr, rect, index))
}

export function insertTableRow(editor: Editor, index: number) {
  const rect = tableRect(editor)
  if (!rect || index < 0 || index > rect.map.height) {
    return
  }
  editor.view.dispatch(addRow(editor.state.tr, rect, index))
}

export function selectTablePart(editor: Editor, part: "cell" | "row" | "column" | "table") {
  const $cell = cellAround(editor.state.selection.$from)
  const table = $cell ? findTable($cell) : currentTable(editor)
  if (!$cell || !table) {
    return
  }
  if (part === "cell") {
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, $cell.pos, $cell.pos)))
    return
  }
  const map = TableMap.get(table.node)
  const rect = map.findCell($cell.pos - table.start)
  const anchor =
    part === "column"
      ? table.start + map.positionAt(0, rect.left, table.node)
      : table.start + map.positionAt(part === "table" ? 0 : rect.top, 0, table.node)
  const head =
    part === "column"
      ? table.start + map.positionAt(map.height - 1, rect.left, table.node)
      : table.start + map.positionAt(part === "table" ? map.height - 1 : rect.top, map.width - 1, table.node)
  const selection =
    part === "column"
      ? CellSelection.colSelection(editor.state.doc.resolve(head), editor.state.doc.resolve(anchor))
      : part === "row"
        ? CellSelection.rowSelection(editor.state.doc.resolve(head), editor.state.doc.resolve(anchor))
        : CellSelection.create(editor.state.doc, anchor, head)
  editor.view.dispatch(editor.state.tr.setSelection(selection))
}

export function paintTable(editor: Editor, look: TableLook) {
  const table = currentTable(editor)
  if (!table || !lookColors(look)) {
    return
  }
  writeTableAttrs(editor, table, {
    ...table.node.attrs,
    look,
    headerRow: true,
    bandedRows: look === "grid" || look === "banded",
    firstColumn: look === "list",
    bandedColumns: false,
    totalRow: false,
    lastColumn: false,
  })
  syncHeaderRow(editor, true)
}

function writeTableAttrs(
  editor: Editor,
  table: { node: ProseNode; pos: number; start: number },
  attrs: Record<string, unknown>,
) {
  let tr = clearCellBackgrounds(editor.state.tr, table)
  tr = tr.setNodeMarkup(tr.mapping.map(table.pos), undefined, attrs)
  editor.view.dispatch(tr)
}

function clearCellBackgrounds(tr: Transaction, table: { node: ProseNode; start: number }) {
  const map = TableMap.get(table.node)
  const seen = new Set<number>()
  for (let row = 0; row < map.height; row += 1) {
    for (let col = 0; col < map.width; col += 1) {
      const relative = map.positionAt(row, col, table.node)
      if (seen.has(relative)) {
        continue
      }
      seen.add(relative)
      const pos = tr.mapping.map(table.start + relative)
      const node = tr.doc.nodeAt(pos)
      if (!node?.attrs.backgroundColor) {
        continue
      }
      tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, backgroundColor: null })
    }
  }
  return tr
}

function syncHeaderRow(editor: Editor, on: boolean) {
  const table = currentTable(editor)
  const first = table?.node.firstChild?.firstChild
  if (!table || !first) {
    return
  }
  if ((first.type.name === "tableHeader") === on) {
    return
  }
  if (editor.can().toggleHeaderRow()) {
    editor.chain().focus().toggleHeaderRow().run()
  }
}

export function shadeCells(editor: Editor, color: string | null) {
  const selection = editor.state.selection
  let tr = editor.state.tr
  const paint = (node: ProseNode, pos: number) => {
    tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, backgroundColor: color })
  }
  if (selection instanceof CellSelection) {
    selection.forEachCell(paint)
  } else {
    const $cell = cellAround(selection.$from)
    const node = $cell ? editor.state.doc.nodeAt($cell.pos) : null
    if (!$cell || !node) {
      return
    }
    paint(node, $cell.pos)
  }
  editor.view.dispatch(tr)
}

export function paintCellBorders(editor: Editor, cell: Element) {
  const pos = editor.view.posAtDOM(cell, 0)
  const $pos = editor.state.doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth)
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup($pos.before(depth), undefined, { ...node.attrs, borders: "all" }),
      )
      return
    }
  }
}

export type BorderKind =
  | "bottom"
  | "top"
  | "left"
  | "right"
  | "none"
  | "all"
  | "outside"
  | "inside"
  | "insideH"
  | "insideV"
  | "diagDown"
  | "diagUp"

/** The line the Borders menu draws with, as Word's pen: weight in points, colour and style. */
export type BorderPen = { width: number; color: string; style: string }

export const BORDER_WEIGHTS = [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6]
export const BORDER_STYLES = ["solid", "dashed", "dotted", "double"]
export const DEFAULT_PEN: BorderPen = { width: 0.5, color: "#404040", style: "solid" }

const SIDES = ["top", "right", "bottom", "left"] as const
type Side = (typeof SIDES)[number]

const DIAGONALS = ["diagDown", "diagUp"] as const
type Diagonal = (typeof DIAGONALS)[number]

function cellDiagonals(value: unknown): Set<Diagonal> {
  return new Set(typeof value === "string" ? DIAGONALS.filter((name) => value.split(" ").includes(name)) : [])
}

/** The `borders` value for a cell's sides and diagonals: "all" only when all four sides and no diagonal are drawn. */
export function bordersValue(sides: Set<Side>, diagonals: Set<Diagonal>): string | null {
  if (sides.size === 4 && diagonals.size === 0) {
    return "all"
  }
  return (
    [...SIDES.filter((side) => sides.has(side)), ...DIAGONALS.filter((name) => diagonals.has(name))].join(" ") || null
  )
}

function cellSides(value: unknown): Set<Side> {
  if (value === "all") {
    return new Set(SIDES)
  }
  return new Set(typeof value === "string" ? SIDES.filter((side) => value.split(" ").includes(side)) : [])
}

/** Draws the chosen borders on the selected cells, or the cell the cursor is in. */
export function applyBorders(editor: Editor, kind: BorderKind, pen: BorderPen = DEFAULT_PEN) {
  const selection = editor.state.selection
  const $cell = selection instanceof CellSelection ? selection.$anchorCell : cellAround(selection.$from)
  const table = $cell ? findTable($cell) : null
  if (!$cell || !table) {
    return
  }
  const map = TableMap.get(table.node)
  const cells: number[] = []
  if (selection instanceof CellSelection) {
    selection.forEachCell((_node, pos) => cells.push(pos - table.start))
  } else {
    cells.push($cell.pos - table.start)
  }
  const rects = cells.map((offset) => map.findCell(offset))
  const top = Math.min(...rects.map((rect) => rect.top))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))
  const left = Math.min(...rects.map((rect) => rect.left))
  const right = Math.max(...rects.map((rect) => rect.right))
  const line = `${pen.width * (4 / 3)}px ${pen.style} ${pen.color}`
  const diagonalOnAll =
    (kind === "diagDown" || kind === "diagUp") &&
    cells.every((offset) => cellDiagonals(table.node.nodeAt(offset)?.attrs.borders).has(kind))
  let tr = editor.state.tr
  cells.forEach((offset, index) => {
    const rect = rects[index]
    const node = table.node.nodeAt(offset)
    if (!node) {
      return
    }
    const edges: Record<Side, boolean> = {
      top: rect.top === top,
      bottom: rect.bottom === bottom,
      left: rect.left === left,
      right: rect.right === right,
    }
    const add = new Set<Side>()
    if (kind === "all") {
      SIDES.forEach((side) => add.add(side))
    } else if (kind === "outside") {
      SIDES.filter((side) => edges[side]).forEach((side) => add.add(side))
    } else if (kind === "inside") {
      SIDES.filter((side) => !edges[side]).forEach((side) => add.add(side))
    } else if (kind === "insideH") {
      ;(["top", "bottom"] as const).filter((side) => !edges[side]).forEach((side) => add.add(side))
    } else if (kind === "insideV") {
      ;(["left", "right"] as const).filter((side) => !edges[side]).forEach((side) => add.add(side))
    } else if (kind !== "none" && kind !== "diagDown" && kind !== "diagUp" && edges[kind]) {
      add.add(kind)
    }
    let next: string | null
    if (kind === "none") {
      next = "none"
    } else {
      const sides = node.attrs.borders === "none" ? new Set<Side>() : cellSides(node.attrs.borders)
      const diagonals = node.attrs.borders === "none" ? new Set<Diagonal>() : cellDiagonals(node.attrs.borders)
      add.forEach((side) => sides.add(side))
      if (kind === "diagDown" || kind === "diagUp") {
        // A diagonal toggles: it comes off when every selected cell already has it.
        if (diagonalOnAll) {
          diagonals.delete(kind)
        } else {
          diagonals.add(kind)
        }
      }
      next = bordersValue(sides, diagonals) ?? node.attrs.borders
    }
    tr = tr.setNodeMarkup(table.start + offset, undefined, {
      ...node.attrs,
      borders: next,
      borderPen: kind === "none" ? null : line,
    })
  })
  editor.view.dispatch(tr)
}

/** The edges of the Borders and Shading dialog's preview: the outer sides, the lines between cells, the diagonals. */
export type BorderEdge = Side | "insideH" | "insideV" | Diagonal

/** What a Borders and Shading dialog applies to in a table: the selected cells or the whole table. */
export type TableScope = "cell" | "table"

/** Whether the selection is in a table, and so can take Cell and Table as its Apply to choices. */
export function inTable(editor: Editor): boolean {
  const selection = editor.state.selection
  return Boolean(selection instanceof CellSelection || cellAround(selection.$from))
}

function scopedCells(editor: Editor, scope: TableScope) {
  const selection = editor.state.selection
  const $cell = selection instanceof CellSelection ? selection.$anchorCell : cellAround(selection.$from)
  const table = $cell ? findTable($cell) : null
  if (!$cell || !table) {
    return null
  }
  const map = TableMap.get(table.node)
  const offsets: number[] = []
  if (scope === "table") {
    new Set(map.map).forEach((offset) => offsets.push(offset))
  } else if (selection instanceof CellSelection) {
    selection.forEachCell((_node, pos) => offsets.push(pos - table.start))
  } else {
    offsets.push($cell.pos - table.start)
  }
  return { table, map, offsets }
}

/**
 * Sets the borders of the selected cells (or the whole table) to exactly `edges`, as the dialog's preview shows them,
 * replacing what was there: an edge between two cells follows `insideH` / `insideV`, an edge on the outside of the
 * selection follows its own side. The pen applies to every line drawn.
 */
export function setBordersOnCells(editor: Editor, scope: TableScope, edges: Set<BorderEdge>, pen: BorderPen): boolean {
  const found = scopedCells(editor, scope)
  if (!found) {
    return false
  }
  const { table, map, offsets } = found
  const rects = offsets.map((offset) => map.findCell(offset))
  const top = Math.min(...rects.map((rect) => rect.top))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))
  const left = Math.min(...rects.map((rect) => rect.left))
  const right = Math.max(...rects.map((rect) => rect.right))
  const line = `${pen.width * (4 / 3)}px ${pen.style} ${pen.color}`
  let tr = editor.state.tr
  offsets.forEach((offset, index) => {
    const rect = rects[index]
    const node = table.node.nodeAt(offset)
    if (!node) {
      return
    }
    const sides = new Set<Side>()
    if (edges.has(rect.top === top ? "top" : "insideH")) sides.add("top")
    if (edges.has(rect.bottom === bottom ? "bottom" : "insideH")) sides.add("bottom")
    if (edges.has(rect.left === left ? "left" : "insideV")) sides.add("left")
    if (edges.has(rect.right === right ? "right" : "insideV")) sides.add("right")
    const diagonals = new Set<Diagonal>(DIAGONALS.filter((name) => edges.has(name)))
    const value = bordersValue(sides, diagonals)
    tr = tr.setNodeMarkup(table.start + offset, undefined, {
      ...node.attrs,
      borders: value ?? "none",
      borderPen: value ? line : null,
    })
  })
  editor.view.dispatch(tr)
  return true
}

/** The pen of a `borderPen` value (`1.33px dashed #404040`), as Word's weight in points. */
function parsePen(value: unknown): BorderPen | null {
  const match = typeof value === "string" ? /^([\d.]+)px\s+(\S+)\s+(.+)$/.exec(value.trim()) : null
  if (!match) {
    return null
  }
  const width = Math.round(Number(match[1]) * 0.75 * 100) / 100
  return { width: BORDER_WEIGHTS.includes(width) ? width : DEFAULT_PEN.width, style: match[2], color: match[3] }
}

/**
 * The borders and fill the cells in `scope` have now, so Borders and Shading opens on what is drawn: an edge counts when
 * every cell along it has it (the exact reverse of `setBordersOnCells`), the pen is the first drawn line's, and the fill
 * is shared by every cell or none.
 */
export function readScopedBorders(editor: Editor, scope: TableScope) {
  const found = scopedCells(editor, scope)
  if (!found) {
    return null
  }
  const { table, map, offsets } = found
  const cells = offsets.map((offset) => {
    const rect = map.findCell(offset)
    const attrs = table.node.nodeAt(offset)?.attrs ?? {}
    return { rect, sides: cellSides(attrs.borders), diagonals: cellDiagonals(attrs.borders), attrs }
  })
  const top = Math.min(...cells.map((cell) => cell.rect.top))
  const bottom = Math.max(...cells.map((cell) => cell.rect.bottom))
  const left = Math.min(...cells.map((cell) => cell.rect.left))
  const right = Math.max(...cells.map((cell) => cell.rect.right))
  const every = (test: (cell: (typeof cells)[number]) => boolean) => cells.length > 0 && cells.every(test)
  const edges = new Set<BorderEdge>()
  const edge = (name: BorderEdge, cellsOnIt: typeof cells, side: Side) => {
    if (cellsOnIt.length > 0 && cellsOnIt.every((cell) => cell.sides.has(side))) {
      edges.add(name)
    }
  }
  edge(
    "top",
    cells.filter((cell) => cell.rect.top === top),
    "top",
  )
  edge(
    "bottom",
    cells.filter((cell) => cell.rect.bottom === bottom),
    "bottom",
  )
  edge(
    "left",
    cells.filter((cell) => cell.rect.left === left),
    "left",
  )
  edge(
    "right",
    cells.filter((cell) => cell.rect.right === right),
    "right",
  )
  edge(
    "insideH",
    cells.filter((cell) => cell.rect.top !== top),
    "top",
  )
  edge(
    "insideV",
    cells.filter((cell) => cell.rect.left !== left),
    "left",
  )
  for (const name of DIAGONALS) {
    if (every((cell) => cell.diagonals.has(name))) {
      edges.add(name)
    }
  }
  const pen = cells.map((cell) => parsePen(cell.attrs.borderPen)).find(Boolean) ?? DEFAULT_PEN
  const fills = new Set(
    cells.map((cell) => (typeof cell.attrs.backgroundColor === "string" ? cell.attrs.backgroundColor : null)),
  )
  return { edges, pen, fill: fills.size === 1 ? [...fills][0] : null }
}

/** The fill of the selected cells or of every cell in the table; null clears it. */
export function shadeScope(editor: Editor, scope: TableScope, color: string | null): boolean {
  const found = scopedCells(editor, scope)
  if (!found) {
    return false
  }
  let tr = editor.state.tr
  for (const offset of found.offsets) {
    const node = found.table.node.nodeAt(offset)
    if (node) {
      tr = tr.setNodeMarkup(found.table.start + offset, undefined, { ...node.attrs, backgroundColor: color })
    }
  }
  editor.view.dispatch(tr)
  return true
}

/** Word's Border Styles gallery: ready-made pens of style, weight and colour. */
export const BORDER_STYLE_PRESETS: { label: string; pen: BorderPen }[] = [
  { label: "Thin line", pen: { width: 0.5, color: "#000000", style: "solid" } },
  { label: "Medium line", pen: { width: 1.5, color: "#000000", style: "solid" } },
  { label: "Thick line", pen: { width: 3, color: "#000000", style: "solid" } },
  { label: "Grey line", pen: { width: 0.75, color: "#7f7f7f", style: "solid" } },
  { label: "Dashed", pen: { width: 0.75, color: "#000000", style: "dashed" } },
  { label: "Dotted", pen: { width: 1, color: "#000000", style: "dotted" } },
  { label: "Double line", pen: { width: 2.25, color: "#000000", style: "double" } },
  { label: "Blue accent", pen: { width: 1.5, color: "#156082", style: "solid" } },
  { label: "Orange accent", pen: { width: 1.5, color: "#e97132", style: "solid" } },
  { label: "Green accent", pen: { width: 1.5, color: "#196b24", style: "solid" } },
  { label: "Red dashed", pen: { width: 1, color: "#c00000", style: "dashed" } },
  { label: "Heavy blue", pen: { width: 4.5, color: "#0f9ed5", style: "solid" } },
]

/** The side of a cell rectangle that a point is closest to. */
export function nearestCellSide(
  rect: { left: number; right: number; top: number; bottom: number },
  x: number,
  y: number,
): Side {
  const distances: [Side, number][] = [
    ["top", Math.abs(y - rect.top)],
    ["right", Math.abs(x - rect.right)],
    ["bottom", Math.abs(y - rect.bottom)],
    ["left", Math.abs(x - rect.left)],
  ]
  return distances.reduce((best, next) => (next[1] < best[1] ? next : best))[0]
}

/**
 * The Border Painter: draws `pen` on the edge of the cell under the point, the edge it is closest to. Returns false
 * when the point is not over a table cell.
 */
export function paintCellEdge(editor: Editor, x: number, y: number, pen: BorderPen): boolean {
  const hit = editor.view.posAtCoords({ left: x, top: y })
  if (!hit) {
    return false
  }
  const $cell = cellAround(editor.state.doc.resolve(hit.pos))
  if (!$cell) {
    return false
  }
  const node = $cell.nodeAfter
  const dom = editor.view.nodeDOM($cell.pos)
  if (!node || !(dom instanceof HTMLElement)) {
    return false
  }
  const side = nearestCellSide(dom.getBoundingClientRect(), x, y)
  const sides = node.attrs.borders === "none" ? new Set<Side>() : cellSides(node.attrs.borders)
  const diagonals = node.attrs.borders === "none" ? new Set<Diagonal>() : cellDiagonals(node.attrs.borders)
  sides.add(side)
  const line = `${pen.width * (4 / 3)}px ${pen.style} ${pen.color}`
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup($cell.pos, undefined, {
      ...node.attrs,
      borders: bordersValue(sides, diagonals),
      borderPen: line,
    }),
  )
  return true
}

export function setTableFrame(editor: Editor, frame: "all" | "none" | "bottom") {
  const table = currentTable(editor)
  if (!table) {
    return
  }
  const node = editor.state.doc.nodeAt(table.pos)
  if (!node) {
    return
  }
  editor.view.dispatch(editor.state.tr.setNodeMarkup(table.pos, undefined, { ...node.attrs, frame }))
}

export function setCellDirection(editor: Editor, direction: "horizontal" | "vertical") {
  const $cell = cellAround(editor.state.selection.$from)
  if (!$cell) {
    return
  }
  const node = editor.state.doc.nodeAt($cell.pos)
  if (!node) {
    return
  }
  editor.view.dispatch(editor.state.tr.setNodeMarkup($cell.pos, undefined, { ...node.attrs, textDir: direction }))
}

export function tableElement(editor: Editor, pos: number) {
  const dom = editor.view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) {
    return null
  }
  if (dom.tagName === "TABLE") {
    return dom
  }
  return dom.querySelector("table")
}

export function cellNode(doc: ProseNode, pos: number) {
  return doc.nodeAt(pos)
}

const rowResizeKey = new PluginKey<{ row: number }>("rowResizing")
const EDGE = 6
const MIN_ROW = 22
const MIN_COLUMN = 28

type ColumnHit = {
  kind: "column"
  table: HTMLTableElement
  tablePos: number
  index: number
  widths: number[]
}

type RowHit = {
  kind: "row"
  pos: number
  height: number
  row: HTMLTableRowElement
}

type GridHit = ColumnHit | RowHit

type GridDrag =
  | { kind: "column"; table: HTMLTableElement; tablePos: number; index: number; startX: number; widths: number[] }
  | { kind: "row"; pos: number; startY: number; startHeight: number; row: HTMLTableRowElement }

function nodePos(view: EditorView, dom: Node, name: string) {
  const found = view.posAtDOM(dom, 0)
  const $pos = view.state.doc.resolve(found)
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === name) {
      return $pos.before(depth)
    }
  }
  return null
}

function columnWidths(table: HTMLTableElement) {
  const first = table.rows[0]
  if (!first) {
    return []
  }
  const widths: number[] = []
  for (const cell of first.cells) {
    const span = cell.colSpan || 1
    const share = cell.getBoundingClientRect().width / span
    for (let index = 0; index < span; index += 1) {
      widths.push(share)
    }
  }
  return widths
}

function nearestEdge(pointer: number, edges: number[]) {
  let best = -1
  let distance = EDGE + 1
  edges.forEach((edge, index) => {
    const next = Math.abs(pointer - edge)
    if (next <= EDGE && next < distance) {
      best = index
      distance = next
    }
  })
  return best === -1 ? null : { index: best, distance }
}

function gridHit(view: EditorView, event: MouseEvent): GridHit | null {
  const target = event.target
  if (!(target instanceof Element)) {
    return null
  }
  const table = target.closest("table")
  if (!(table instanceof HTMLTableElement) || !view.dom.contains(table)) {
    return null
  }
  const bounds = table.getBoundingClientRect()
  if (
    event.clientX < bounds.left - 2 ||
    event.clientX > bounds.right + 2 ||
    event.clientY < bounds.top - 2 ||
    event.clientY > bounds.bottom + 2
  ) {
    return null
  }
  const widths = columnWidths(table)
  let left = bounds.left
  const columnEdges = widths.map((width) => {
    left += width
    return left
  })
  const rowEdges = [...table.rows].map((row) => row.getBoundingClientRect().bottom)
  const column = nearestEdge(event.clientX, columnEdges)
  const row = nearestEdge(event.clientY, rowEdges)
  if (column && (!row || column.distance <= row.distance)) {
    const tablePos = nodePos(view, table, "table")
    if (tablePos == null) {
      return null
    }
    return { kind: "column", table, tablePos, index: column.index, widths }
  }
  if (!row) {
    return null
  }
  const element = table.rows[row.index]
  if (!element) {
    return null
  }
  const pos = nodePos(view, element, "tableRow")
  if (pos == null) {
    return null
  }
  return { kind: "row", pos, height: element.getBoundingClientRect().height, row: element }
}

function paintColumns(table: HTMLTableElement, widths: number[]) {
  const columns = table.querySelector("colgroup")
  if (!columns) {
    return
  }
  const cols = [...columns.children]
  widths.forEach((width, index) => {
    const col = cols[index]
    if (col instanceof HTMLElement) {
      col.style.width = `${Math.round(width)}px`
    }
  })
  const total = Math.round(widths.reduce((sum, width) => sum + width, 0))
  table.style.width = `${total}px`
  table.style.minWidth = `${total}px`
}

function columnWidthsAt(start: number[], index: number, delta: number) {
  const next = start.slice()
  if (index < 0 || index >= start.length) {
    return next
  }
  if (index >= start.length - 1) {
    next[index] = Math.max(MIN_COLUMN, start[index] + delta)
    return next
  }
  const limited = Math.max(MIN_COLUMN - start[index], Math.min(start[index + 1] - MIN_COLUMN, delta))
  next[index] = start[index] + limited
  next[index + 1] = start[index + 1] - limited
  return next
}

function writeColumnWidths(view: EditorView, tablePos: number, widths: number[]) {
  const table = view.state.doc.nodeAt(tablePos)
  if (!table) {
    return
  }
  const map = TableMap.get(table)
  const origin = tablePos + 1
  let tr = view.state.tr
  const seen = new Set<number>()
  for (let row = 0; row < map.height; row += 1) {
    for (let col = 0; col < map.width; col += 1) {
      const rel = map.map[row * map.width + col]
      if (seen.has(rel)) {
        continue
      }
      if (col > 0 && map.map[row * map.width + col - 1] === rel) {
        continue
      }
      if (row > 0 && map.map[(row - 1) * map.width + col] === rel) {
        continue
      }
      seen.add(rel)
      const node = tr.doc.nodeAt(origin + rel)
      if (!node) {
        continue
      }
      const span = Number(node.attrs.colspan) || 1
      const colwidth = widths.slice(col, col + span).map((value) => Math.round(value))
      tr = tr.setNodeMarkup(origin + rel, undefined, { ...node.attrs, colwidth })
    }
  }
  if (tr.docChanged) {
    view.dispatch(tr)
  }
}

function paintRow(row: HTMLTableRowElement, height: number) {
  row.style.height = `${height}px`
  row.style.minHeight = `${height}px`
}

function rowResizing() {
  let drag: GridDrag | null = null
  return new Plugin({
    key: rowResizeKey,
    state: {
      init: () => ({ row: -1 }),
      apply(tr, value) {
        const meta = tr.getMeta(rowResizeKey)
        return meta ?? value
      },
    },
    props: {
      attributes(state) {
        const pluginState = rowResizeKey.getState(state)
        const attrs: { [name: string]: string } = {}
        if (pluginState && pluginState.row > -1) {
          attrs.class = "row-resize-cursor"
        }
        return attrs
      },
      handleDOMEvents: {
        mousemove(view, event) {
          if (drag) {
            return true
          }
          const current = rowResizeKey.getState(view.state)
          const hit = gridHit(view, event)
          const next = hit?.kind === "row" ? hit.pos : -1
          if (current?.row !== next) {
            view.dispatch(view.state.tr.setMeta(rowResizeKey, { row: next }))
          }
          return false
        },
        mouseleave(view) {
          if (drag) {
            return true
          }
          const current = rowResizeKey.getState(view.state)
          if (current && current.row > -1) {
            view.dispatch(view.state.tr.setMeta(rowResizeKey, { row: -1 }))
          }
          return false
        },
        mousedown(view, event) {
          if (event.button !== 0 || drag) {
            return false
          }
          const hit = gridHit(view, event)
          if (!hit) {
            return false
          }
          event.preventDefault()
          const previousCursor = document.body.style.cursor
          const previousSelect = document.body.style.userSelect
          document.body.style.userSelect = "none"
          if (hit.kind === "column") {
            drag = {
              kind: "column",
              table: hit.table,
              tablePos: hit.tablePos,
              index: hit.index,
              startX: event.clientX,
              widths: hit.widths,
            }
            document.body.style.cursor = "col-resize"
          } else {
            drag = { kind: "row", pos: hit.pos, startY: event.clientY, startHeight: hit.height, row: hit.row }
            document.body.style.cursor = "row-resize"
          }
          const move = (pointer: MouseEvent) => {
            const active = drag
            if (!active) {
              return
            }
            if (active.kind === "column") {
              paintColumns(active.table, columnWidthsAt(active.widths, active.index, pointer.clientX - active.startX))
              return
            }
            paintRow(active.row, Math.max(MIN_ROW, Math.round(active.startHeight + pointer.clientY - active.startY)))
          }
          const up = (pointer: MouseEvent) => {
            window.removeEventListener("mousemove", move)
            window.removeEventListener("mouseup", up)
            document.body.style.cursor = previousCursor
            document.body.style.userSelect = previousSelect
            const active = drag
            drag = null
            if (!active) {
              return
            }
            if (active.kind === "column") {
              writeColumnWidths(
                view,
                active.tablePos,
                columnWidthsAt(active.widths, active.index, pointer.clientX - active.startX),
              )
              view.dispatch(view.state.tr.setMeta(rowResizeKey, { row: -1 }))
              return
            }
            active.row.style.height = ""
            active.row.style.minHeight = ""
            const height = Math.max(MIN_ROW, Math.round(active.startHeight + pointer.clientY - active.startY))
            const node = view.state.doc.nodeAt(active.pos)
            let tr = view.state.tr
            if (node && node.type.name === "tableRow") {
              tr = tr.setNodeMarkup(active.pos, undefined, { ...node.attrs, height })
            }
            view.dispatch(tr.setMeta(rowResizeKey, { row: -1 }))
          }
          window.addEventListener("mousemove", move)
          window.addEventListener("mouseup", up)
          return true
        },
      },
    },
  })
}
