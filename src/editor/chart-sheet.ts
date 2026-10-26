export type ChartSheet = {
  series: string[]
  categories: string[]
  rows: number[][]
  /** Treemap and Sunburst: label columns before the category column, outermost first, a label per row. */
  levels?: string[][]
}

export const DEFAULT_CHART_SHEET = ["|Sales|Expenses", "Q1|12|8", "Q2|18|11", "Q3|15|9", "Q4|22|14"].join("\n")

export const CHART_FAMILIES: { id: string; label: string; items: { id: string; label: string }[] }[] = [
  {
    id: "column",
    label: "Column",
    items: [
      { id: "column", label: "Clustered Column" },
      { id: "column-stacked", label: "Stacked Column" },
      { id: "column-percent", label: "100% Stacked Column" },
    ],
  },
  {
    id: "line",
    label: "Line",
    items: [
      { id: "line", label: "Line" },
      { id: "line-markers", label: "Line with Markers" },
      { id: "line-stacked", label: "Stacked Line" },
    ],
  },
  {
    id: "pie",
    label: "Pie",
    items: [
      { id: "pie", label: "Pie" },
      { id: "doughnut", label: "Doughnut" },
    ],
  },
  {
    id: "bar",
    label: "Bar",
    items: [
      { id: "hbar", label: "Clustered Bar" },
      { id: "hbar-stacked", label: "Stacked Bar" },
      { id: "hbar-percent", label: "100% Stacked Bar" },
    ],
  },
  {
    id: "area",
    label: "Area",
    items: [
      { id: "area", label: "Area" },
      { id: "area-stacked", label: "Stacked Area" },
      { id: "area-percent", label: "100% Stacked Area" },
    ],
  },
  {
    id: "scatter",
    label: "Scatter",
    items: [
      { id: "scatter", label: "Scatter" },
      { id: "scatter-smooth", label: "Scatter with Smooth Lines" },
    ],
  },
]

export const CHART_VARIANTS = CHART_FAMILIES.flatMap((family) => family.items.map((item) => item.id))

const PALETTE = ["#0f6cbd", "#107c10", "#ca5010", "#5b2c8e", "#f5b400", "#d13438"]

export function parseChartSheet(raw: string): ChartSheet {
  const text = raw.trim()
  if (!text || (!text.includes("\n") && !text.includes("|"))) {
    const numbers = text
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item))
    const data = numbers.length ? numbers : [8, 14, 11, 18]
    return {
      series: ["Series 1"],
      categories: data.map((_, index) => `Cat ${index + 1}`),
      rows: data.map((value) => [value]),
    }
  }
  const lines = text.split(/\n/).map((line) => line.split("|"))
  const header = lines[0] ?? []
  const series = header.slice(1).map((name, index) => name.trim() || `Series ${index + 1}`)
  const categories: string[] = []
  const rows: number[][] = []
  lines.slice(1).forEach((line) => {
    if (line.every((cell) => !cell.trim())) {
      return
    }
    categories.push(line[0]?.trim() || `Cat ${categories.length + 1}`)
    rows.push(
      (series.length ? series : ["Series 1"]).map((_, index) => {
        const value = Number(line[index + 1])
        return Number.isFinite(value) ? value : 0
      }),
    )
  })
  if (!series.length) {
    series.push("Series 1")
  }
  if (!rows.length) {
    return parseChartSheet("8,14,11,18")
  }
  return { series, categories, rows }
}

export function serializeChartSheet(sheet: ChartSheet) {
  const header = ["", ...sheet.series].join("|")
  const body = sheet.categories.map((category, index) => [category, ...(sheet.rows[index] ?? []).map(String)].join("|"))
  return [header, ...body].join("\n")
}

export function sheetToGrid(sheet: ChartSheet, columns = 6, rowCount = 10) {
  const grid = Array.from({ length: rowCount }, () => Array.from({ length: columns }, () => ""))
  const outer = sheet.levels?.length ?? 0
  const first = outer + 1
  sheet.series.forEach((name, index) => {
    if (index + first < columns) {
      grid[0][index + first] = name
    }
  })
  sheet.categories.forEach((name, row) => {
    if (row + 1 >= rowCount) {
      return
    }
    sheet.levels?.forEach((level, column) => {
      if (column < columns) {
        grid[row + 1][column] = level[row] ?? ""
      }
    })
    grid[row + 1][outer] = name
    sheet.rows[row]?.forEach((value, column) => {
      if (column + first < columns) {
        grid[row + 1][column + first] = String(value)
      }
    })
  })
  return grid
}

/**
 * The sheet a grid holds. `labelColumns` is how many columns of labels come before the numbers: 1 (the category) for
 * most charts, more for a Treemap or Sunburst, whose blank labels are kept since a blank skips that level.
 */
export function gridToSheet(grid: string[][], labelColumns = 1): ChartSheet {
  const outer = Math.max(0, labelColumns - 1)
  let lastColumn = outer + 1
  let lastRow = 1
  grid.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (cell.trim()) {
        lastColumn = Math.max(lastColumn, columnIndex)
        lastRow = Math.max(lastRow, rowIndex)
      }
    })
  })
  const series = []
  for (let column = outer + 1; column <= lastColumn; column += 1) {
    series.push(grid[0]?.[column]?.trim() || `Series ${column - outer}`)
  }
  const categories: string[] = []
  const rows: number[][] = []
  const levels: string[][] = Array.from({ length: outer }, () => [])
  for (let row = 1; row <= lastRow; row += 1) {
    const label = grid[row]?.[outer]?.trim() ?? ""
    categories.push(outer ? label : label || `Cat ${row}`)
    levels.forEach((level, column) => level.push(grid[row]?.[column]?.trim() ?? ""))
    rows.push(
      series.map((_, index) => {
        const value = Number(grid[row]?.[index + outer + 1])
        return Number.isFinite(value) ? value : 0
      }),
    )
  }
  return outer ? { series, categories, rows, levels } : { series, categories, rows }
}

export function transposeChartSheet(sheet: ChartSheet): ChartSheet {
  const series = sheet.categories
  const categories = sheet.series
  const rows = categories.map((_, category) => series.map((_, serie) => sheet.rows[serie]?.[category] ?? 0))
  return { series, categories, rows }
}

export function chartInner(kind: string, raw: string, accent = "#0f6cbd") {
  const sheet = parseChartSheet(raw)
  const normalized = kind === "bar" ? "column" : kind
  if (normalized === "pie" || normalized === "doughnut") {
    return pieChart(sheet, normalized === "doughnut", accent)
  }
  if (normalized.startsWith("line")) {
    return lineChart(sheet, normalized, accent)
  }
  if (normalized.startsWith("area")) {
    return areaChart(sheet, normalized, accent)
  }
  if (normalized.startsWith("scatter")) {
    return scatterChart(sheet, normalized, accent)
  }
  return barChart(sheet, normalized, accent, normalized.startsWith("hbar"))
}

function scatterChart(sheet: ChartSheet, kind: string, accent: string) {
  const max = Math.max(1, ...sheet.rows.flat())
  const points = sheet.rows.map((row, index) => {
    const x = 18 + (index / Math.max(1, sheet.rows.length - 1)) * 84
    const y = 58 - ((row[0] ?? 0) / max) * 42
    return { x, y, fill: color(0, accent) }
  })
  const dots = points
    .map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="2.4" fill="${point.fill}"/>`)
    .join("")
  const path =
    kind.includes("smooth") && points.length > 1
      ? `<path d="M${points.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" L")}" fill="none" stroke="${accent}" stroke-width="1.4"/>`
      : ""
  return `<rect x="14" y="12" width="92" height="50" fill="none" stroke="#d0d0d0"/>${path}${dots}${legend(sheet, accent)}`
}

function color(index: number, accent: string) {
  if (index === 0) {
    return accent || PALETTE[0]
  }
  return PALETTE[index % PALETTE.length]
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function legend(sheet: ChartSheet, accent: string) {
  if (sheet.series.length < 2) {
    return ""
  }
  return sheet.series
    .map((name, index) => {
      const x = 6 + (index % 3) * 38
      const y = 72 + Math.floor(index / 3) * 7
      return `<rect x="${x}" y="${y}" width="6" height="4" fill="${color(index, accent)}"/><text x="${x + 8}" y="${y + 4}" font-size="5" fill="#444">${escapeXml(name.slice(0, 8))}</text>`
    })
    .join("")
}

function pieChart(sheet: ChartSheet, doughnut: boolean, accent: string) {
  const values = sheet.rows.map((row) => Math.max(0, row[0] ?? 0))
  const total = values.reduce((sum, value) => sum + value, 0) || 1
  let angle = -Math.PI / 2
  const slices = values.map((value, index) => {
    const sweep = (value / total) * Math.PI * 2
    const start = angle
    angle += sweep
    const large = sweep > Math.PI ? 1 : 0
    const x1 = 48 + Math.cos(start) * 22
    const y1 = 36 + Math.sin(start) * 22
    const x2 = 48 + Math.cos(angle) * 22
    const y2 = 36 + Math.sin(angle) * 22
    const fill = color(index, accent)
    return `<path d="M48 36 L${x1.toFixed(2)} ${y1.toFixed(2)} A22 22 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${fill}"/>`
  })
  const hole = doughnut ? `<circle cx="48" cy="36" r="12" fill="#fff"/>` : ""
  const labels = sheet.categories
    .map(
      (name, index) =>
        `<text x="${78}" y="${18 + index * 8}" font-size="5" fill="#444">${escapeXml(name.slice(0, 8))}</text><rect x="70" y="${13 + index * 8}" width="6" height="4" fill="${color(index, accent)}"/>`,
    )
    .join("")
  return `${slices.join("")}${hole}${labels}`
}

function modeOf(kind: string): "plain" | "stacked" | "percent" {
  if (kind.endsWith("percent")) {
    return "percent"
  }
  if (kind.includes("stacked")) {
    return "stacked"
  }
  return "plain"
}

function barChart(sheet: ChartSheet, kind: string, accent: string, horizontal: boolean) {
  const mode = modeOf(kind)
  const categories = sheet.categories
  const count = Math.max(1, categories.length)
  const seriesCount = Math.max(1, sheet.series.length)
  const left = horizontal ? 28 : 14
  const right = 116
  const top = 8
  const bottom = 64
  const span = horizontal ? bottom - top : right - left
  const thickness = span / count
  const max =
    mode === "percent"
      ? 100
      : Math.max(
          1,
          ...sheet.rows.map(
            (row) =>
              row.reduce((sum, value) => sum + Math.max(0, value), mode === "plain" ? 0 : 0) ||
              Math.max(...row.map((value) => Math.max(0, value))),
          ),
        )
  const bars = categories
    .map((_, category) => {
      const row = sheet.rows[category] ?? []
      const total = row.reduce((sum, value) => sum + Math.max(0, value), 0)
      let running = 0
      return sheet.series
        .map((_, serie) => {
          const plain = Math.max(0, row[serie] ?? 0)
          const sized = mode === "percent" ? (plain / (total || 1)) * 100 : plain
          const start = mode === "plain" ? 0 : running
          const end = start + sized
          running = end
          const length = ((end - start) / max) * (horizontal ? right - left : bottom - top)
          const offset = (start / max) * (horizontal ? right - left : bottom - top)
          const band = mode === "plain" ? thickness / (seriesCount + 0.4) : thickness * 0.72
          const slot = mode === "plain" ? serie * band : (thickness - band) / 2
          const fill = color(serie, accent)
          if (horizontal) {
            const y = top + category * thickness + slot
            return `<rect x="${left + offset}" y="${y.toFixed(2)}" width="${Math.max(0, length).toFixed(2)}" height="${Math.max(3, band - 2).toFixed(2)}" fill="${fill}"/>`
          }
          const x = left + category * thickness + slot
          const y = bottom - offset - length
          return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(3, band - 2).toFixed(2)}" height="${Math.max(0, length).toFixed(2)}" fill="${fill}"/>`
        })
        .join("")
    })
    .join("")
  const labels = categories
    .map((name, index) => {
      if (horizontal) {
        return `<text x="2" y="${(top + index * thickness + thickness / 2 + 1.5).toFixed(1)}" font-size="5" fill="#444">${escapeXml(name.slice(0, 4))}</text>`
      }
      const x = left + index * thickness + thickness / 2
      return `<text x="${x.toFixed(1)}" y="69" text-anchor="middle" font-size="5" fill="#444">${escapeXml(name.slice(0, 4))}</text>`
    })
    .join("")
  const axis = horizontal
    ? `<line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="#8a8a8a" stroke-width="0.6"/>`
    : `<line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="#8a8a8a" stroke-width="0.6"/>`
  return `${axis}${bars}${labels}${legend(sheet, accent)}`
}

function pointsFor(sheet: ChartSheet, kind: string, accent: string) {
  const mode = modeOf(kind)
  const left = 16
  const right = 114
  const top = 8
  const bottom = 62
  const count = Math.max(1, sheet.categories.length)
  const step = count <= 1 ? 0 : (right - left) / (count - 1)
  const max =
    mode === "percent"
      ? 100
      : Math.max(
          1,
          ...sheet.rows.flatMap((row) => {
            if (mode === "plain") {
              return row.map((value) => Math.max(0, value))
            }
            return [row.reduce((sum, value) => sum + Math.max(0, value), 0)]
          }),
        )
  const running = sheet.rows.map(() => 0)
  const lines = sheet.series.map((_, serie) =>
    sheet.rows.map((row, index) => {
      const plain = Math.max(0, row[serie] ?? 0)
      const total = row.reduce((sum, value) => sum + Math.max(0, value), 0) || 1
      const previous = running[index]
      running[index] += plain
      const value = mode === "percent" ? (running[index] / total) * 100 : mode === "stacked" ? running[index] : plain
      const baseValue = mode === "percent" ? (previous / total) * 100 : mode === "stacked" ? previous : 0
      const x = left + index * step
      const y = bottom - (value / max) * (bottom - top)
      return { x, y, base: bottom - (baseValue / max) * (bottom - top) }
    }),
  )
  return { lines, left, bottom, accent }
}

function lineChart(sheet: ChartSheet, kind: string, accent: string) {
  const { lines } = pointsFor(sheet, kind, accent)
  const marks = kind === "line-markers"
  const drawn = lines
    .map((line, serie) => {
      const points = line.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")
      const dots = marks
        ? line
            .map(
              (point) =>
                `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="1.6" fill="${color(serie, accent)}"/>`,
            )
            .join("")
        : ""
      return `<polyline points="${points}" fill="none" stroke="${color(serie, accent)}" stroke-width="1.4"/>${dots}`
    })
    .join("")
  return `${drawn}${categoryLabels(sheet)}${legend(sheet, accent)}`
}

function areaChart(sheet: ChartSheet, kind: string, accent: string) {
  const { lines, bottom } = pointsFor(sheet, kind, accent)
  const drawn = lines
    .map((line, serie) => {
      if (line.length === 0) {
        return ""
      }
      const topEdge = line.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")
      const baseEdge = [...line]
        .reverse()
        .map((point) => `${point.x.toFixed(1)},${(kind === "area" ? bottom : point.base).toFixed(1)}`)
        .join(" ")
      return `<polygon points="${topEdge} ${baseEdge}" fill="${color(serie, accent)}" opacity="${kind === "area" ? 0.45 : 0.9}"/>`
    })
    .join("")
  return `${drawn}${categoryLabels(sheet)}${legend(sheet, accent)}`
}

function categoryLabels(sheet: ChartSheet) {
  const count = Math.max(1, sheet.categories.length)
  const left = 16
  const right = 114
  const step = count <= 1 ? 0 : (right - left) / (count - 1)
  return sheet.categories
    .map(
      (name, index) =>
        `<text x="${(left + index * step).toFixed(1)}" y="69" text-anchor="middle" font-size="5" fill="#444">${escapeXml(name.slice(0, 4))}</text>`,
    )
    .join("")
}
