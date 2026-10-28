/** One column of the page (cm): its width and the space after it (Columns dialog: Width and spacing, 22.7). */
export type ColumnWidth = { width: number; space: number }

/** The Columns menu's and dialog's presets. */
export type ColumnPreset = "one" | "two" | "three" | "left" | "right"

export const COLUMN_PRESET_NAMES = { one: "One", two: "Two", three: "Three", left: "Left", right: "Right" } as const

/** Word's narrowest column, half an inch. */
export const MIN_COLUMN_CM = 1.27
/** The most columns the Columns dialog takes; a page fits fewer when they would be narrower than half an inch. */
export const MAX_COLUMNS = 12

const round = (value: number) => Math.round(value * 100) / 100

export function equalColumns(contentCm: number, count: number, gapCm: number): ColumnWidth[] {
  const width = (contentCm - gapCm * (count - 1)) / count
  return Array.from({ length: count }, (_, index) => ({
    width: round(width),
    space: index < count - 1 ? round(gapCm) : 0,
  }))
}

/**
 * Word's presets: Left and Right are two columns, the narrow one as wide as one of three equal columns and the
 * other as wide as the two others with the space between them (1.83" and 4.17" on Letter with 0.5" spacing).
 */
export function presetColumns(preset: ColumnPreset, contentCm: number, gapCm: number) {
  if (preset === "left" || preset === "right") {
    const narrow = (contentCm - 2 * gapCm) / 3
    const wide = contentCm - gapCm - narrow
    const widths =
      preset === "left"
        ? [
            { width: round(narrow), space: round(gapCm) },
            { width: round(wide), space: 0 },
          ]
        : [
            { width: round(wide), space: round(gapCm) },
            { width: round(narrow), space: 0 },
          ]
    return { count: 2, widths }
  }
  return { count: preset === "three" ? 3 : preset === "two" ? 2 : 1, widths: undefined }
}

/** Which preset the columns match, if any (the Columns menu's highlighted row and the dialog's preset). */
export function columnPreset(
  count: number,
  widths: readonly ColumnWidth[] | undefined,
  contentCm: number,
  gapCm: number,
): ColumnPreset | null {
  if (!widths || widths.length !== count) {
    return count === 1 ? "one" : count === 2 ? "two" : count === 3 ? "three" : null
  }
  if (count !== 2) {
    return null
  }
  for (const preset of ["left", "right"] as const) {
    const expected = presetColumns(preset, contentCm, widths[0].space || gapCm).widths ?? []
    if (
      expected.length === 2 &&
      expected.every((column, index) => Math.abs(column.width - widths[index].width) < 0.05)
    ) {
      return preset
    }
  }
  return null
}

/** The most columns of at least half an inch with `gapCm` between them that fit the text width. */
export function maxColumnCount(contentCm: number, gapCm: number) {
  const fit = Math.floor((contentCm + gapCm) / (MIN_COLUMN_CM + gapCm) + 1e-6)
  return Math.max(1, Math.min(MAX_COLUMNS, fit))
}

/**
 * The page's columns: Word's own widths when they are not equal, otherwise equal ones. Widths that no longer fill the
 * text width (the paper or margins changed since) are scaled to it, keeping the spaces.
 */
export function pageColumns(
  count: number,
  gapCm: number,
  widths: readonly ColumnWidth[] | undefined,
  contentCm: number,
): ColumnWidth[] {
  if (count < 2) {
    return [{ width: round(contentCm), space: 0 }]
  }
  if (!widths || widths.length !== count) {
    return equalColumns(contentCm, count, gapCm)
  }
  const spaces = widths.slice(0, -1).reduce((sum, column) => sum + column.space, 0)
  const total = widths.reduce((sum, column) => sum + column.width, 0)
  if (Math.abs(total + spaces - contentCm) < 0.02) {
    return widths.map((column, index) => ({ width: column.width, space: index < count - 1 ? column.space : 0 }))
  }
  const factor = (contentCm - spaces) / total
  if (!(factor > 0)) {
    return equalColumns(contentCm, count, gapCm)
  }
  return widths.map((column, index) => ({
    width: round(column.width * factor),
    space: index < count - 1 ? column.space : 0,
  }))
}

/** Each column's left edge and width in pixels from the text's left edge. */
export function columnBoxes(columns: readonly ColumnWidth[], pxPerCm: number) {
  let x = 0
  return columns.map((column) => {
    const box = { x: x * pxPerCm, width: column.width * pxPerCm }
    x += column.width + column.space
    return box
  })
}

/**
 * Sets one column's width or the space after it, as typed in the Columns dialog. With equal columns every column
 * follows (the spacing gives way to a new width). Otherwise the next column (the one before, for the last) gives or
 * takes the difference, never going below half an inch.
 */
export function resizeColumn(
  columns: readonly ColumnWidth[],
  index: number,
  field: "width" | "space",
  value: number,
  contentCm: number,
  equal: boolean,
): ColumnWidth[] {
  const count = columns.length
  if (count < 2 || !Number.isFinite(value)) {
    return columns.map((column) => ({ ...column }))
  }
  if (equal) {
    if (field === "space") {
      const gap = Math.max(0, Math.min(value, (contentCm - count * MIN_COLUMN_CM) / (count - 1)))
      return equalColumns(contentCm, count, gap)
    }
    const width = Math.max(MIN_COLUMN_CM, Math.min(value, contentCm / count))
    return equalColumns(contentCm, count, (contentCm - count * width) / (count - 1))
  }
  const next = columns.map((column) => ({ ...column }))
  if (field === "space" && index >= count - 1) {
    return next
  }
  const giver = field === "space" || index < count - 1 ? index + 1 : index - 1
  const current = field === "width" ? next[index].width : next[index].space
  const floor = field === "width" ? MIN_COLUMN_CM : 0
  const wanted = Math.max(floor, value)
  const change = Math.min(wanted - current, next[giver].width - MIN_COLUMN_CM)
  if (field === "width") {
    next[index].width = round(current + change)
  } else {
    next[index].space = round(current + change)
  }
  next[giver].width = round(next[giver].width - change)
  return next
}

/**
 * Moves the right edge of column `index` to `edgeCm` from the text's left edge (a column marker dragged on the ruler):
 * the column grows or shrinks and the next one gives or takes the difference.
 */
export function moveColumnEdge(columns: readonly ColumnWidth[], index: number, edgeCm: number): ColumnWidth[] {
  if (index < 0 || index >= columns.length - 1) {
    return columns.map((column) => ({ ...column }))
  }
  const left = columns.slice(0, index).reduce((sum, column) => sum + column.width + column.space, 0)
  const width = edgeCm - left
  return resizeColumn(columns, index, "width", width, 0, false)
}

/** Whether every column is as wide as the first and every space as the first space. */
export function columnsAreEqual(columns: readonly ColumnWidth[]) {
  return columns.every(
    (column, index) =>
      Math.abs(column.width - columns[0].width) < 0.02 &&
      (index === columns.length - 1 || Math.abs(column.space - columns[0].space) < 0.02),
  )
}
