import { evaluateFormula } from "@/editor/formula"

/**
 * The sheet's cells (`sheetBlock`, Insert > Table > Excel Spreadsheet): a grid of what was typed, with Excel's cell
 * names (A1, AB12) and the formulas Excel and Word share for a small sheet: arithmetic on cells, and SUM, AVERAGE,
 * MIN, MAX and COUNT over cells and ranges (A1:B3).
 */

export const DEFAULT_COLS = 4
export const DEFAULT_ROWS = 4
const MAX_COLS = 52
const MAX_ROWS = 200

export function columnName(index: number) {
  let name = ""
  let value = index + 1
  while (value > 0) {
    const rest = (value - 1) % 26
    name = String.fromCharCode(65 + rest) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

export function columnIndex(name: string) {
  let value = 0
  for (const letter of name.toUpperCase()) {
    value = value * 26 + (letter.charCodeAt(0) - 64)
  }
  return value - 1
}

export function emptyGrid(rows = DEFAULT_ROWS, cols = DEFAULT_COLS) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""))
}

/** The grid kept on the node, made rectangular; an unreadable one is an empty 4 by 4. */
export function parseGrid(raw: string): string[][] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed) && parsed.length > 0) {
      const rows = parsed.slice(0, MAX_ROWS) as unknown[]
      const cols = Math.min(MAX_COLS, Math.max(1, ...rows.map((row) => (Array.isArray(row) ? row.length : 0))))
      return rows.map((row) =>
        Array.from({ length: cols }, (_, index) => String((Array.isArray(row) ? row[index] : "") ?? "")),
      )
    }
  } catch {
    // An empty sheet instead.
  }
  return emptyGrid()
}

export function cellRef(col: number, row: number) {
  return `${columnName(col)}${row + 1}`
}

const REF = /\$?([A-Z]{1,2})\$?(\d{1,4})/
const RANGE = new RegExp(`${REF.source}:${REF.source}`, "gi")
const FUNCTIONS = /\b(SUM|AVERAGE|MIN|MAX|COUNT)\(([^()]*)\)/gi

function numberOf(value: string) {
  const number = Number(value)
  return value.trim() !== "" && Number.isFinite(number) ? number : null
}

/** What a cell shows: its text, or its formula's result ("#ERR" for one that can't be worked out). */
export function resolveCell(grid: string[][], row: number, col: number, visiting = new Set<string>()): string {
  const text = (grid[row]?.[col] ?? "").trim()
  if (!text.startsWith("=")) {
    return text
  }
  const self = cellRef(col, row)
  if (visiting.has(self)) {
    return "#ERR"
  }
  visiting.add(self)
  try {
    const valueAt = (name: string, number: string) => {
      const r = Number(number) - 1
      const c = columnIndex(name)
      if (r < 0 || c < 0 || r >= grid.length || c >= (grid[0]?.length ?? 0)) {
        return ""
      }
      return resolveCell(grid, r, c, visiting)
    }
    let body = text.slice(1)
    // Ranges become the list of their cells' numbers, then each function its result.
    body = body.replace(RANGE, (_match, c1: string, r1: string, c2: string, r2: string) => {
      const values: string[] = []
      const [top, bottom] = [Number(r1), Number(r2)].sort((a, b) => a - b)
      const [left, right] = [columnIndex(c1), columnIndex(c2)].sort((a, b) => a - b)
      for (let r = top!; r <= bottom!; r += 1) {
        for (let c = left!; c <= right!; c += 1) {
          values.push(valueAt(columnName(c), String(r)))
        }
      }
      return values.map((value) => numberOf(value) ?? "_").join(",")
    })
    body = body.replace(new RegExp(REF.source, "gi"), (_match, name: string, number: string) => {
      const value = valueAt(name.toUpperCase(), number)
      return value.startsWith("#") ? "NaN" : String(numberOf(value) ?? "_")
    })
    body = body.replace(FUNCTIONS, (_match, name: string, list: string) => {
      const items = list.split(",").map((item) => item.trim())
      const numbers = items
        .filter((item) => item !== "_" && item !== "")
        .map((item) => {
          const result = evaluateFormula(item)
          return result.ok ? Number(result.value) : Number.NaN
        })
      const kind = name.toUpperCase()
      if (kind === "COUNT") {
        return String(numbers.length)
      }
      if (numbers.length === 0) {
        return "0"
      }
      const value =
        kind === "SUM"
          ? numbers.reduce((sum, item) => sum + item, 0)
          : kind === "AVERAGE"
            ? numbers.reduce((sum, item) => sum + item, 0) / numbers.length
            : kind === "MIN"
              ? Math.min(...numbers)
              : Math.max(...numbers)
      return String(value)
    })
    // A cell with text counts as 0 in arithmetic, as Excel's error aside.
    body = body.replace(/_/g, "0")
    if (/NaN/.test(body)) {
      return "#ERR"
    }
    const result = evaluateFormula(`=${body}`)
    return result.ok ? result.value : "#ERR"
  } finally {
    visiting.delete(self)
  }
}

/**
 * What each cell shows. While the grid is still the one its workbook holds (opened from Word, or saved by Cells), a
 * formula shows the workbook's own result, which covers every function Excel and Cells know. Once the grid changes, the
 * editor works formulas out itself (`resolveCell`); a formula it cannot work out (a function it does not know) keeps the
 * workbook's result while its text is the same, until Cells or Excel calculate it again.
 */
export function shownCells(grid: string[][], workbookGrid?: string | null, workbookValues?: string | null) {
  let values: string[][] | null = null
  let kept: string[][] | null = null
  if (workbookGrid && workbookValues) {
    try {
      values = JSON.parse(workbookValues) as string[][]
      kept = JSON.parse(workbookGrid) as string[][]
    } catch {
      values = null
    }
  }
  const same = Boolean(values) && workbookGrid === JSON.stringify(grid)
  return (row: number, col: number) => {
    const text = grid[row]?.[col] ?? ""
    const result = values?.[row]?.[col]
    if (!text.trim().startsWith("=") || result === undefined) {
      return resolveCell(grid, row, col)
    }
    if (same) {
      return result
    }
    const own = resolveCell(grid, row, col)
    return own === "#ERR" && kept?.[row]?.[col] === text ? result : own
  }
}
