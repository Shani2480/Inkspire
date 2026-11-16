import type { JSONContent } from "@tiptap/core"

/**
 * Insert > Table > Quick Tables: Word's built-in tables, by Word's names and layouts (calendars, a double table, a
 * matrix, a tabular list, tables with subheads). Word's own come from its Building Blocks template; these hold sample
 * text of their own. Each table is described once (`QuickTableCell`) and made into the editor's table, and into the
 * small picture the gallery shows.
 */

export type QuickTableCell = {
  text: string
  bold?: boolean
  italic?: boolean
  color?: string
  fill?: string
  align?: "left" | "center" | "right"
  /** The sides drawn: "all", "none", or some of "top bottom left right". */
  borders?: string
  /** The pen of those sides, in Word's points, style and colour: "0.5 solid #8eaadb". */
  pen?: string
  size?: number
  colspan?: number
}

export type QuickTable = {
  name: string
  description: string
  /** The table's outer frame when no cell draws its own: Word's grid, none, or only a bottom line. */
  frame: "all" | "none" | "bottom"
  rows: QuickTableCell[][]
}

const BLUE = "#4472c4"
const DARK_BLUE = "#1f3864"
const LIGHT_BLUE = "#d9e2f3"
const LINE = "#8eaadb"

const text = (value: string, extra: Partial<QuickTableCell> = {}): QuickTableCell => ({ text: value, ...extra })
const number = (value: string | number, extra: Partial<QuickTableCell> = {}): QuickTableCell => ({
  text: String(value),
  align: "right",
  ...extra,
})

/** The days of a month as calendar rows, Monday first, blanks before the first and after the last day. */
export function monthRows(year: number, month: number) {
  const first = (new Date(year, month, 1).getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  const cells = [
    ...Array.from({ length: first }, () => ""),
    ...Array.from({ length: days }, (_, day) => String(day + 1)),
  ]
  while (cells.length % 7 !== 0) {
    cells.push("")
  }
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7))
}

const MONTH = { year: 2027, month: 6, name: "July" }
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]

function calendarOne(): QuickTable {
  const pen = `0.5 solid ${LINE}`
  return {
    name: "Calendar 1",
    description: "A month with a coloured title and weekday row",
    frame: "none",
    rows: [
      [text(MONTH.name, { colspan: 7, bold: true, size: 18, color: "#ffffff", fill: BLUE, borders: "none" })],
      WEEKDAYS.map((day) =>
        text(day, { bold: true, align: "center", color: DARK_BLUE, fill: LIGHT_BLUE, borders: "none" }),
      ),
      ...monthRows(MONTH.year, MONTH.month).map((week) =>
        week.map((day) => text(day, { align: "center", borders: "bottom", pen })),
      ),
    ],
  }
}

function calendarTwo(): QuickTable {
  return {
    name: "Calendar 2",
    description: "A month under its name, the weekdays underlined",
    frame: "none",
    rows: [
      [text(`${MONTH.name} ${MONTH.year}`, { colspan: 7, bold: true, size: 16, color: BLUE, borders: "none" })],
      WEEKDAYS.map((day) =>
        text(day, { bold: true, align: "right", borders: "bottom", pen: `1.5 solid ${BLUE}`, color: DARK_BLUE }),
      ),
      ...monthRows(MONTH.year, MONTH.month).map((week) =>
        week.map((day, index) => text(day, { align: "right", borders: "none", color: index > 4 ? BLUE : undefined })),
      ),
    ],
  }
}

function doubleTable(): QuickTable {
  const head = (value: string, align: QuickTableCell["align"] = "left") =>
    text(value, { bold: true, color: "#ffffff", fill: BLUE, borders: "none", align })
  const gap = () => text("", { borders: "none" })
  const line = (cells: QuickTableCell[]) =>
    cells.map((cell) => ({ ...cell, borders: "bottom", pen: `0.5 solid ${LINE}` }))
  const rows: [string, number, number, string, number, number][] = [
    ["Central", 412, 188, "Harbour", 236, 97],
    ["Northgate", 305, 141, "Hillside", 198, 84],
    ["Riverside", 287, 132, "Old Town", 174, 66],
    ["Westfield", 254, 109, "Parkway", 151, 58],
  ]
  return {
    name: "Double Table",
    description: "Two lists side by side in one table",
    frame: "none",
    rows: [
      [
        head("Library"),
        head("Morning", "right"),
        head("Evening", "right"),
        gap(),
        head("Library"),
        head("Morning", "right"),
        head("Evening", "right"),
      ],
      ...rows.map(([a, b, c, d, e, f]) => [
        ...line([text(a), number(b), number(c)]),
        gap(),
        ...line([text(d), number(e), number(f)]),
      ]),
    ],
  }
}

function matrix(): QuickTable {
  const places = ["Library", "Lab", "Gym", "Café"]
  const minutes = [
    ["—", "6", "11", "4"],
    ["6", "—", "8", "7"],
    ["11", "8", "—", "9"],
    ["4", "7", "9", "—"],
  ]
  const pen = `0.5 solid ${LINE}`
  return {
    name: "Matrix",
    description: "Rows and columns with the same headings, as a distance chart",
    frame: "none",
    rows: [
      [
        text("Minutes on foot", { italic: true, borders: "bottom", pen }),
        ...places.map((place) => text(place, { bold: true, align: "center", borders: "bottom", pen })),
      ],
      ...places.map((place, row) => [
        text(place, { bold: true, borders: "right", pen }),
        ...minutes[row]!.map((value) => text(value, { align: "center", borders: "none" })),
      ]),
    ],
  }
}

function tabularList(): QuickTable {
  const items: [string, number][] = [
    ["Tent", 1],
    ["Sleeping bags", 3],
    ["Camping stove", 1],
    ["Lanterns", 2],
    ["Water bottles", 4],
    ["First-aid kit", 1],
  ]
  const pen = `0.5 solid ${LINE}`
  return {
    name: "Tabular List",
    description: "Two columns: an item and how many",
    frame: "none",
    rows: [
      [
        text("Item", { bold: true, borders: "bottom", pen: `1.5 solid ${BLUE}` }),
        number("Needed", { bold: true, borders: "bottom", pen: `1.5 solid ${BLUE}` }),
      ],
      ...items.map(([item, count]) => [
        text(item, { borders: "bottom", pen }),
        number(count, { borders: "bottom", pen }),
      ]),
    ],
  }
}

function withSubheads(variant: 1 | 2): QuickTable {
  const groups: [string, [string, number, number][]][] = [
    [
      "Vegetables",
      [
        ["Tomatoes", 42, 118],
        ["Beans", 26, 64],
        ["Courgettes", 18, 71],
      ],
    ],
    [
      "Fruit",
      [
        ["Strawberries", 33, 12],
        ["Raspberries", 8, 29],
      ],
    ],
  ]
  const total = groups.flatMap(([, rows]) => rows).reduce((sum, [, a, b]) => [sum[0]! + a, sum[1]! + b], [0, 0])
  const pen = `0.5 solid ${LINE}`
  const head =
    variant === 1
      ? { bold: true, borders: "bottom", pen: `1.5 solid ${BLUE}`, color: DARK_BLUE }
      : { bold: true, color: "#ffffff", fill: BLUE, borders: "none" }
  const sub =
    variant === 1
      ? { bold: true, italic: true, color: BLUE, borders: "none" }
      : { bold: true, fill: LIGHT_BLUE, color: DARK_BLUE, borders: "none" }
  return {
    name: `With Subheads ${variant}`,
    description:
      variant === 1
        ? "Groups of rows under italic subheads, with a total"
        : "Groups of rows under shaded subheads, with a total",
    frame: "none",
    rows: [
      [text("Community garden, kg", head), number("Spring", head), number("Summer", head)],
      ...groups.flatMap(([group, rows]) => [
        [text(group, { ...sub, colspan: 3 })],
        ...rows.map(([crop, spring, summer]) => [
          text(crop, { borders: "bottom", pen }),
          number(spring, { borders: "bottom", pen }),
          number(summer, { borders: "bottom", pen }),
        ]),
      ]),
      [
        text("Total", { bold: true, borders: "top", pen: `1.5 solid ${BLUE}` }),
        number(total[0]!, { bold: true, borders: "top", pen: `1.5 solid ${BLUE}` }),
        number(total[1]!, { bold: true, borders: "top", pen: `1.5 solid ${BLUE}` }),
      ],
    ],
  }
}

/** Word's built-in Quick Tables, in Word's order. */
export function builtInQuickTables(): QuickTable[] {
  return [calendarOne(), calendarTwo(), doubleTable(), matrix(), tabularList(), withSubheads(1), withSubheads(2)]
}

/** A pen as the editor keeps it (`borderPen`): Word's points as pixels. */
function penCss(pen: string | undefined) {
  if (!pen) {
    return null
  }
  const [width, style, color] = pen.split(" ")
  return `${Number(width) * (4 / 3)}px ${style} ${color}`
}

function cellContent(cell: QuickTableCell): JSONContent {
  const marks: JSONContent["marks"] = []
  if (cell.bold) {
    marks.push({ type: "bold" })
  }
  if (cell.italic) {
    marks.push({ type: "italic" })
  }
  if (cell.color || cell.size) {
    marks.push({
      type: "textStyle",
      attrs: { ...(cell.color ? { color: cell.color } : {}), ...(cell.size ? { fontSize: `${cell.size}pt` } : {}) },
    })
  }
  return {
    type: "paragraph",
    attrs: cell.align && cell.align !== "left" ? { textAlign: cell.align } : {},
    content: cell.text ? [{ type: "text", text: cell.text, ...(marks.length ? { marks } : {}) }] : [],
  }
}

/** The table as the editor's content. */
export function quickTableContent(table: QuickTable): JSONContent {
  return {
    type: "table",
    attrs: { frame: table.frame },
    content: table.rows.map((row) => ({
      type: "tableRow",
      content: row.map((cell) => ({
        type: "tableCell",
        attrs: {
          colspan: cell.colspan ?? 1,
          ...(cell.fill ? { backgroundColor: cell.fill } : {}),
          ...(cell.borders ? { borders: cell.borders } : {}),
          ...(cell.borders && cell.borders !== "none" && cell.pen ? { borderPen: penCss(cell.pen) } : {}),
        },
        content: [cellContent(cell)],
      })),
    })),
  }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** The gallery's picture of the table: the same cells drawn with inline styles, as they look on the page. */
export function quickTablePreview(table: QuickTable): string {
  const rows = table.rows.map((row) => {
    const cells = row.map((cell) => {
      const line = penCss(cell.pen) ?? `1px solid ${LINE}`
      const sides = cell.borders === "all" ? ["top", "right", "bottom", "left"] : (cell.borders ?? "").split(" ")
      const style = [
        "padding:1px 4px",
        cell.fill ? `background:${cell.fill}` : "",
        cell.color ? `color:${cell.color}` : "",
        cell.bold ? "font-weight:700" : "",
        cell.italic ? "font-style:italic" : "",
        cell.size ? `font-size:${Math.round(cell.size * 0.9)}px` : "",
        `text-align:${cell.align ?? "left"}`,
        ...sides
          .filter((side) => ["top", "right", "bottom", "left"].includes(side))
          .map((side) => `border-${side}:${line}`),
      ]
        .filter(Boolean)
        .join(";")
      return `<td${cell.colspan ? ` colspan="${cell.colspan}"` : ""} style="${style}">${escapeHtml(cell.text) || "&nbsp;"}</td>`
    })
    return `<tr>${cells.join("")}</tr>`
  })
  return `<table class="quick-table-preview" style="border-collapse:collapse;width:100%">${rows.join("")}</table>`
}
