import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  cellRef,
  columnIndex,
  columnName,
  emptyGrid,
  parseGrid,
  shownCells,
} from "@/editor/sheet-grid"
import { isTauriRuntime } from "@/lib/platform"
import { Node, mergeAttributes } from "@tiptap/core"

/**
 * Insert > Table > Excel Spreadsheet: a small worksheet in the document, saved as Word keeps one (an embedded Excel
 * workbook, `docx/sheet-object.ts`). Cells hold text, numbers and formulas (`editor/sheet-grid.ts`); Add Row and Add
 * Column grow it, as dragging the sheet's frame does in Word.
 */

type SheetView = {
  dom: HTMLElement
  table: HTMLTableElement
  inputs: HTMLInputElement[][]
  values: HTMLElement[][]
  grid: string[][]
  onCommit: (grid: string[][], focus?: string) => void
}

const rowsOf = (grid: string[][]) => grid.length
const colsOf = (grid: string[][]) => grid[0]?.length ?? 0

/** Builds the frame once; the cells are built again only when the sheet changes size (`showSheet`). */
function buildSheet(
  grid: string[][],
  onCommit: (grid: string[][], focus?: string) => void,
  onEditInCells?: () => void,
): SheetView {
  const dom = document.createElement("div")
  dom.setAttribute("data-sheet-block", "")
  dom.className = "sheet-block"
  const table = document.createElement("table")
  table.className = "sheet-grid"
  const view: SheetView = { dom, table, inputs: [], values: [], grid, onCommit }
  const tools = document.createElement("div")
  tools.className = "sheet-tools"
  const grow = (label: string, make: (grid: string[][]) => string[][]) => {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "sheet-tool"
    button.textContent = label
    button.addEventListener("mousedown", (event) => {
      event.preventDefault()
      event.stopPropagation()
    })
    button.addEventListener("click", () => view.onCommit(make(view.grid)))
    tools.append(button)
  }
  grow("Add Row", (current) => [...current.map((line) => [...line]), current[0]!.map(() => "")])
  grow("Add Column", (current) => current.map((line) => [...line, ""]))
  if (onEditInCells) {
    // As Word opens the worksheet in Excel: in Cells, which saves its changes back here.
    const button = document.createElement("button")
    button.type = "button"
    button.className = "sheet-tool"
    button.textContent = "Edit in Cells"
    button.title = "Open the worksheet in Cells (or double-click its frame); changes saved there come back here"
    button.addEventListener("mousedown", (event) => {
      event.preventDefault()
      event.stopPropagation()
    })
    button.addEventListener("click", onEditInCells)
    tools.append(button)
    // A double-click on the headings or the frame, not in a cell (where it selects a word).
    dom.addEventListener("dblclick", (event) => {
      if (!(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault()
        onEditInCells()
      }
    })
  }
  const hint = document.createElement("span")
  hint.className = "sheet-hint"
  hint.textContent = "Formulas: =A1+B2, =SUM(A1:A4)"
  tools.append(hint)
  dom.append(table, tools)
  buildCells(view)
  return view
}

function buildCells(view: SheetView) {
  const { table, grid } = view
  table.replaceChildren()
  view.inputs = []
  view.values = []
  const rows = rowsOf(grid)
  const cols = colsOf(grid)
  const head = document.createElement("tr")
  head.append(document.createElement("th"))
  for (let col = 0; col < cols; col += 1) {
    const th = document.createElement("th")
    th.textContent = columnName(col)
    head.append(th)
  }
  table.append(head)

  // Writes the cell's text into the node, and moves to another cell once that is done.
  const commit = (row: number, col: number, move?: [number, number]) => {
    const input = view.inputs[row]![col]!
    const target = move
      ? cellRef(
          Math.max(0, Math.min(colsOf(view.grid) - 1, col + move[0])),
          Math.max(0, Math.min(rowsOf(view.grid) - 1, row + move[1])),
        )
      : undefined
    if (input.value !== view.grid[row]![col]) {
      const next = view.grid.map((line) => [...line])
      next[row]![col] = input.value
      view.onCommit(next, target)
    } else if (target) {
      focusCell(view, target)
    }
  }

  for (let row = 0; row < rows; row += 1) {
    const tr = document.createElement("tr")
    const label = document.createElement("th")
    label.textContent = String(row + 1)
    tr.append(label)
    view.inputs.push([])
    view.values.push([])
    for (let col = 0; col < cols; col += 1) {
      const td = document.createElement("td")
      const input = document.createElement("input")
      input.className = "sheet-cell"
      input.title = cellRef(col, row)
      input.ariaLabel = cellRef(col, row)
      input.value = grid[row]![col]!
      const display = document.createElement("span")
      display.className = "sheet-cell-value"
      input.addEventListener("change", () => commit(row, col))
      input.addEventListener("keydown", (event) => {
        const atStart = input.selectionStart === 0 && input.selectionEnd === 0
        const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length
        const move: [number, number] | null =
          event.key === "Enter" || event.key === "ArrowDown"
            ? [0, 1]
            : event.key === "ArrowUp"
              ? [0, -1]
              : event.key === "Tab"
                ? [event.shiftKey ? -1 : 1, 0]
                : event.key === "ArrowLeft" && atStart
                  ? [-1, 0]
                  : event.key === "ArrowRight" && atEnd
                    ? [1, 0]
                    : null
        if (!move) {
          return
        }
        event.preventDefault()
        commit(row, col, move)
      })
      input.addEventListener("mousedown", (event) => event.stopPropagation())
      td.append(input, display)
      tr.append(td)
      view.inputs[row]!.push(input)
      view.values[row]!.push(display)
    }
    table.append(tr)
  }
}

function focusCell(view: SheetView, ref: string) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref)
  const input = match ? view.inputs[Number(match[2]) - 1]?.[columnIndex(match[1]!)] : undefined
  input?.focus()
  input?.select()
}

/** Shows a grid in the existing cells (built again if its size changed); the one being typed in keeps its text. */
function showSheet(view: SheetView, grid: string[][], kept: Record<string, unknown> = {}) {
  const shownAt = shownCells(grid, kept.workbookGrid as string | null, kept.workbookValues as string | null)
  const resized = rowsOf(grid) !== view.inputs.length || colsOf(grid) !== (view.inputs[0]?.length ?? 0)
  view.grid = grid
  if (resized) {
    buildCells(view)
  }
  for (let row = 0; row < rowsOf(grid); row += 1) {
    for (let col = 0; col < colsOf(grid); col += 1) {
      const input = view.inputs[row]![col]!
      if (input !== document.activeElement && input.value !== grid[row]![col]) {
        input.value = grid[row]![col]!
      }
      const shown = shownAt(row, col)
      const value = view.values[row]![col]!
      value.textContent = shown
      // Numbers sit to the right of their cell, as in Excel.
      value.toggleAttribute("data-number", shown.trim() !== "" && Number.isFinite(Number(shown)))
    }
  }
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    sheetBlock: {
      insertSheetBlock: () => ReturnType
    }
  }
}

export const SheetBlock = Node.create({
  name: "sheetBlock",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      grid: {
        default: JSON.stringify(emptyGrid()),
        parseHTML: (element) => element.getAttribute("data-grid") || JSON.stringify(emptyGrid()),
        renderHTML: (attributes) => ({ "data-grid": attributes.grid }),
      },
      // The Word object it was opened from (its run) and the grid as opened: unchanged, it saves as Word wrote it.
      docxKey: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-docx") || null,
        renderHTML: (attributes) => (attributes.docxKey ? { "data-docx": attributes.docxKey } : {}),
      },
      sheetSource: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-sheet-source") || null,
        renderHTML: (attributes) => (attributes.sheetSource ? { "data-sheet-source": attributes.sheetSource } : {}),
      },
      // The workbook behind the sheet (base64), with the grid it holds and the values it shows: the one opened from
      // Word or saved by Cells. Saved as it is while the grid is unchanged, so formatting made in Excel or Cells stays.
      workbook: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-workbook") || null,
        renderHTML: (attributes) => (attributes.workbook ? { "data-workbook": attributes.workbook } : {}),
      },
      workbookGrid: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-workbook-grid") || null,
        renderHTML: (attributes) => (attributes.workbookGrid ? { "data-workbook-grid": attributes.workbookGrid } : {}),
      },
      workbookValues: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-workbook-values") || null,
        renderHTML: (attributes) =>
          attributes.workbookValues ? { "data-workbook-values": attributes.workbookValues } : {},
      },
      // The edit copy this sheet was sent to Cells as (`editor/sheet-cells.ts`); only while the document is open.
      cellsEdit: { default: null, rendered: false },
      // The picture Word shows, made when saving (`documentWithObjectPictures`); never drawn.
      preview: { default: null, rendered: false },
    }
  },
  parseHTML() {
    return [{ tag: "div[data-sheet-block]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-sheet-block": "", class: "sheet-block" })]
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let pending: string | undefined
      const view = buildSheet(
        parseGrid(String(node.attrs.grid || "")),
        (grid, focus) => {
          const pos = typeof getPos === "function" ? getPos() : null
          if (typeof pos !== "number") {
            return
          }
          pending = focus
          editor
            .chain()
            .command(({ tr }) => {
              const current = tr.doc.nodeAt(pos)
              tr.setNodeMarkup(pos, undefined, { ...current?.attrs, grid: JSON.stringify(grid) })
              return true
            })
            .run()
          if (pending) {
            focusCell(view, pending)
            pending = undefined
          }
        },
        isTauriRuntime()
          ? () => {
              const pos = typeof getPos === "function" ? getPos() : null
              if (typeof pos === "number") {
                void import("@/editor/sheet-cells").then(({ editSheetInCells }) => editSheetInCells(editor, pos))
              }
            }
          : undefined,
      )
      showSheet(view, view.grid, node.attrs)
      return {
        dom: view.dom,
        update(updated) {
          if (updated.type.name !== "sheetBlock") {
            return false
          }
          showSheet(view, parseGrid(String(updated.attrs.grid || "")), updated.attrs)
          return true
        },
        // Typing, clicking and moving between cells belong to the grid, not to the document.
        stopEvent: (event) => event.target instanceof HTMLInputElement,
        ignoreMutation: () => true,
      }
    }
  },
  addCommands() {
    return {
      insertSheetBlock:
        () =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: "sheetBlock",
              attrs: { grid: JSON.stringify(emptyGrid(DEFAULT_ROWS, DEFAULT_COLS)) },
            })
            .run(),
    }
  },
})
