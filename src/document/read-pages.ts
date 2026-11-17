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

export type Point = { x: number; y: number }

/** Corners of a polygon passed to `clip-path`: always this many, so one shape can move smoothly into the next. */
const SHAPE_POINTS = 6

/**
 * A page `w` x `h` folded over like a sheet of paper: its `corner` (a right-hand corner) drawn to `to`, the fold
 * running between them, square to the line joining them (every point of the folded part lands as far from the fold
 * on the other side). `top` is the part of the page still lying flat, `flap` the part folded over (in the page's
 * own coordinates) and `matrix` the CSS matrix that mirrors it across the fold onto where it lies; `turned` is how far
 * the page has gone over, 0 to 1.
 */
export function foldShapes(w: number, h: number, corner: Point, to: Point) {
  const page = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]
  const dx = to.x - corner.x
  const dy = to.y - corner.y
  const length = Math.hypot(dx, dy)
  const turned = Math.min(1, Math.max(0, (corner.x - to.x) / (2 * w)))
  if (length < 0.5) {
    // Nothing folded yet: a fold at the corner's own edge, so the shapes go on smoothly from here.
    return {
      top: fill(page, corner),
      flap: fill([], corner),
      matrix: [-1, 0, 0, 1, 2 * corner.x, 0],
      mirror: { x: corner.x, y: corner.y, angle: Math.PI },
      turned,
    }
  }
  const n = { x: dx / length, y: dy / length }
  const middle = { x: (to.x + corner.x) / 2, y: (to.y + corner.y) / 2 }
  const reach = middle.x * n.x + middle.y * n.y
  const side = (point: Point) => point.x * n.x + point.y * n.y - reach
  const matrix = [
    1 - 2 * n.x * n.x,
    -2 * n.x * n.y,
    -2 * n.x * n.y,
    1 - 2 * n.y * n.y,
    2 * reach * n.x,
    2 * reach * n.y,
  ]
  return {
    top: fill(clipPolygon(page, side), middle),
    flap: fill(
      clipPolygon(page, (point) => -side(point)),
      middle,
    ),
    matrix,
    // The same mirror as CSS transforms that move smoothly from one fold to the next (a matrix that mirrors does
    // not): about the fold's middle, flipped along the direction the corner went (an angle from 0 to 2 pi).
    mirror: { x: middle.x, y: middle.y, angle: (Math.atan2(n.y, n.x) + 2 * Math.PI) % (2 * Math.PI) },
    turned,
  }
}

/** The part of a convex polygon where `side` is not negative. */
function clipPolygon(points: Point[], side: (point: Point) => number) {
  const kept: Point[] = []
  points.forEach((a, index) => {
    const b = points[(index + 1) % points.length]!
    const sa = side(a)
    const sb = side(b)
    if (sa >= 0) {
      kept.push(a)
    }
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb)
      kept.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  })
  return kept
}

function fill(points: Point[], empty: Point) {
  const filled = points.length > 0 ? [...points] : [empty]
  while (filled.length < SHAPE_POINTS) {
    filled.push(filled[filled.length - 1]!)
  }
  return filled
}

/**
 * Where a page's corner can go: the page is bound at its left edge, so the corner stays within a page's width of
 * the spine at its own height and within the diagonal of the other end, as paper does.
 */
export function onSpine(point: Point, corner: Point, w: number, h: number): Point {
  const keep = (at: Point, from: Point, radius: number) => {
    const distance = Math.hypot(at.x - from.x, at.y - from.y)
    return distance <= radius
      ? at
      : { x: from.x + ((at.x - from.x) * radius) / distance, y: from.y + ((at.y - from.y) * radius) / distance }
  }
  const near = { x: 0, y: corner.y }
  const far = { x: 0, y: h - corner.y }
  return keep(keep(point, near, w), far, Math.hypot(w, h))
}

/**
 * The corner's way from `from` to `to`, `steps` + 1 points: straight across, lifted toward the page's middle by
 * `lift` of its height halfway (as a page taken by its corner rises while it turns), kept on the spine.
 */
export function curlPath(from: Point, to: Point, corner: Point, w: number, h: number, lift: number, steps = 32) {
  const up = corner.y > h / 2 ? -1 : 1
  return Array.from({ length: steps + 1 }, (_, index) => {
    const s = index / steps
    const point = {
      x: from.x + (to.x - from.x) * s,
      y: from.y + (to.y - from.y) * s + up * lift * h * Math.sin(Math.PI * s),
    }
    return onSpine(point, corner, w, h)
  })
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
