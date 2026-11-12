import { create } from "zustand"

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

/** Where a match starts or ends: the index of a text piece and the offset in it. */
export type TextPoint = { piece: number; offset: number }

/**
 * Every place `query` occurs in text that comes in pieces (the text nodes of the page, in order), ignoring case; a
 * match may run across pieces, as a word split by formatting does.
 */
export function findInPieces(pieces: string[], query: string): { start: TextPoint; end: TextPoint }[] {
  const needle = query.toLocaleLowerCase()
  if (!needle) {
    return []
  }
  const starts: number[] = []
  let whole = ""
  for (const piece of pieces) {
    starts.push(whole.length)
    whole += piece
  }
  const point = (at: number, end: boolean): TextPoint => {
    // The last piece that starts at or before `at` (for an end, before it), skipping empty pieces.
    let piece = 0
    for (let index = 0; index < starts.length; index += 1) {
      if (pieces[index]!.length > 0 && (end ? starts[index]! < at : starts[index]! <= at)) {
        piece = index
      }
    }
    return { piece, offset: at - starts[piece]! }
  }
  const haystack = whole.toLocaleLowerCase()
  const found: { start: TextPoint; end: TextPoint }[] = []
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + needle.length)) {
    found.push({ start: point(at, false), end: point(at + needle.length, true) })
  }
  return found
}

/**
 * Find in Read Mode (Tools → Find, Ctrl+F): the search box in the read bar and what it found. The page turns to the
 * current match; `move` steps through them.
 */
export const useReadFind = create<{
  open: boolean
  query: string
  count: number
  current: number
  show: () => void
  hide: () => void
  setQuery: (query: string) => void
  setCount: (count: number) => void
  move: (step: 1 | -1) => void
}>((set) => ({
  open: false,
  query: "",
  count: 0,
  current: 0,
  show: () => set({ open: true }),
  hide: () => set({ open: false, query: "", count: 0, current: 0 }),
  setQuery: (query) => set({ query, current: 0 }),
  setCount: (count) => set((state) => ({ count, current: count ? Math.min(state.current, count - 1) : 0 })),
  move: (step) => set((state) => ({ current: state.count ? (state.current + step + state.count) % state.count : 0 })),
}))
