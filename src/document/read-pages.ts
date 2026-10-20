/** Read Mode lays the text in columns that run sideways; a "page" is one screenful of them. */

export const READ_COLUMN_GAP = 64

/** Pixels from one page to the next: the width of the view plus the gap that separates the last column from the next. */
export function readPageStep(viewWidth: number, gap = READ_COLUMN_GAP) {
  return Math.max(1, viewWidth + gap)
}

/** How many pages a run of columns `scrollWidth` wide makes when each screen shows `viewWidth`. */
export function readPageCount(scrollWidth: number, viewWidth: number, gap = READ_COLUMN_GAP) {
  const step = readPageStep(viewWidth, gap)
  // Whole screens run to a multiple of the step less nothing: n screens are n * view + (n - 1) * gap wide, so adding
  // one gap makes n steps. The small allowance keeps a pixel of rounding from adding a blank page.
  return Math.max(1, Math.ceil((scrollWidth + gap) / step - 0.05))
}

/** The page (from 0) a scroll position is on. */
export function readPageAt(scrollLeft: number, viewWidth: number, gap = READ_COLUMN_GAP) {
  return Math.max(0, Math.round(scrollLeft / readPageStep(viewWidth, gap)))
}

export const READ_COLUMN_WIDTHS = { narrow: 340, default: 460, wide: 620 } as const
