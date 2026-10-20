export type PageView = 1 | 2 | 4 | 8

export function pageGridColumns(pageView: number) {
  if (pageView === 2) return 2
  if (pageView === 4 || pageView === 8) return 4
  return 1
}

/**
 * Empty places before the first page. A two-page spread is a book: page 1 is alone on the right, then 2 | 3, 4 | 5,
 * so an odd page is always on the right and an even page on the left, as in Word's print layout.
 */
export function pageGridLead(pageView: number) {
  return pageView === 2 ? 1 : 0
}

export function pageGridRows(pageCount: number, pageView: number) {
  const columns = pageGridColumns(pageView)
  return Math.max(1, Math.ceil((Math.max(1, pageCount) + pageGridLead(pageView)) / columns))
}

export function pageGridCell(index: number, pageView: number, xStride: number, yStride: number) {
  const columns = pageGridColumns(pageView)
  if (columns <= 1) {
    return { column: 0, row: index, left: 0, top: index * yStride }
  }
  const place = index + pageGridLead(pageView)
  const column = place % columns
  const row = Math.floor(place / columns)
  return { column, row, left: column * xStride, top: row * yStride }
}
