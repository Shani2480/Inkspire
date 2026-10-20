import { evaluateFormula } from "@/editor/formula"
import { Node, mergeAttributes } from "@tiptap/core"

const COLS = ["A", "B", "C", "D"]
const ROWS = 4

function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS.length }, () => ""))
}

function parseGrid(raw: string): string[][] {
  try {
    const parsed = JSON.parse(raw) as string[][]
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.map((row) => COLS.map((_, index) => String(row?.[index] ?? "")))
    }
  } catch {
    // fall through
  }
  return emptyGrid()
}

function cellRef(col: number, row: number) {
  return `${COLS[col]}${row + 1}`
}

function resolveValue(grid: string[][], expression: string, visiting: Set<string>): string {
  const text = expression.trim()
  if (!text) {
    return ""
  }
  if (text.startsWith("=")) {
    let body = text.slice(1)
    body = body.replace(/[A-D][1-4]/gi, (ref) => {
      const key = ref.toUpperCase()
      if (visiting.has(key)) {
        return "0"
      }
      const col = COLS.indexOf(key[0])
      const row = Number(key.slice(1)) - 1
      if (col < 0 || row < 0 || row >= ROWS) {
        return "0"
      }
      visiting.add(key)
      const nested = resolveValue(grid, grid[row][col], visiting)
      visiting.delete(key)
      const n = Number(nested)
      return Number.isFinite(n) ? String(n) : "0"
    })
    const result = evaluateFormula(`=${body}`)
    return result.ok ? result.value : "#ERR"
  }
  return text
}

type SheetView = { dom: HTMLElement; inputs: HTMLInputElement[][]; values: HTMLElement[][]; grid: string[][] }

/** Builds the grid once. The view then follows the node in place (`showSheet`), so a cell never loses its focus. */
function buildSheet(grid: string[][], onCommit: (grid: string[][], focus?: string) => void): SheetView {
  const dom = document.createElement("div")
  dom.setAttribute("data-sheet-block", "")
  dom.className = "sheet-block"
  const view: SheetView = { dom, inputs: [], values: [], grid }
  const table = document.createElement("table")
  table.className = "sheet-grid"
  const head = document.createElement("tr")
  head.append(document.createElement("th"))
  COLS.forEach((col) => {
    const th = document.createElement("th")
    th.textContent = col
    head.append(th)
  })
  table.append(head)

  // Writes the cell's text into the node, and moves to another cell once that is done.
  const commit = (row: number, col: number, move?: [number, number]) => {
    const input = view.inputs[row][col]
    const target = move
      ? cellRef(Math.max(0, Math.min(COLS.length - 1, col + move[0])), Math.max(0, Math.min(ROWS - 1, row + move[1])))
      : undefined
    if (input.value !== view.grid[row][col]) {
      const next = view.grid.map((line) => [...line])
      next[row][col] = input.value
      onCommit(next, target)
    } else if (target) {
      focusCell(view, target)
    }
  }

  for (let row = 0; row < ROWS; row += 1) {
    const tr = document.createElement("tr")
    const label = document.createElement("th")
    label.textContent = String(row + 1)
    tr.append(label)
    view.inputs.push([])
    view.values.push([])
    for (let col = 0; col < COLS.length; col += 1) {
      const td = document.createElement("td")
      const input = document.createElement("input")
      input.className = "sheet-cell"
      input.title = cellRef(col, row)
      input.ariaLabel = cellRef(col, row)
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
      view.inputs[row].push(input)
      view.values[row].push(display)
    }
    table.append(tr)
  }
  const hint = document.createElement("p")
  hint.className = "sheet-hint"
  hint.textContent = "Use =A1+B2 style formulas across cells."
  dom.append(table, hint)
  return view
}

function focusCell(view: SheetView, ref: string) {
  const col = COLS.indexOf(ref[0])
  const row = Number(ref.slice(1)) - 1
  const input = view.inputs[row]?.[col]
  input?.focus()
  input?.select()
}

/** Shows a grid in the existing cells; the one being typed in keeps its text. */
function showSheet(view: SheetView, grid: string[][]) {
  view.grid = grid
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS.length; col += 1) {
      const input = view.inputs[row][col]
      if (input !== document.activeElement && input.value !== grid[row][col]) {
        input.value = grid[row][col]
      }
      view.values[row][col].textContent = resolveValue(grid, grid[row][col], new Set())
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
      const view = buildSheet(parseGrid(String(node.attrs.grid || "")), (grid, focus) => {
        const pos = typeof getPos === "function" ? getPos() : null
        if (typeof pos !== "number") {
          return
        }
        pending = focus
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, { grid: JSON.stringify(grid) })
            return true
          })
          .run()
        if (pending) {
          focusCell(view, pending)
          pending = undefined
        }
      })
      showSheet(view, view.grid)
      return {
        dom: view.dom,
        update(updated) {
          if (updated.type.name !== "sheetBlock") {
            return false
          }
          showSheet(view, parseGrid(String(updated.attrs.grid || "")))
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
            .insertContent({ type: "sheetBlock", attrs: { grid: JSON.stringify(emptyGrid()) } })
            .run(),
    }
  },
})
