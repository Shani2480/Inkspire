import { shapeMarkup, shapeViewBox } from "@/editor/insert-blocks"
import type { Node as ProseNode } from "@tiptap/pm/model"

/**
 * Tight and Through wrapping (22.x): text follows the outline of a picture's opaque pixels or of a shape instead of
 * its box. The outline is read once per source from a small drawing of it (the left and right edge of what is
 * drawn in each of `ROWS` bands) and handed to the browser as `shape-outside` on the float that clears the room.
 */
export const ROWS = 48

/** The left and right edge of what is drawn in each band, as fractions of the object's width; null for an empty band. */
export type ContourRows = ([number, number] | null)[]

type Pixels = { width: number; height: number; data: ArrayLike<number> }

/** The drawn extent of each horizontal band of an image's pixels. */
export function rowsOfPixels(image: Pixels, rows = ROWS): ContourRows {
  const result: ContourRows = []
  for (let row = 0; row < rows; row += 1) {
    const from = Math.floor((row * image.height) / rows)
    const to = Math.max(from + 1, Math.floor(((row + 1) * image.height) / rows))
    let left = image.width
    let right = -1
    for (let y = from; y < to; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        if ((image.data[(y * image.width + x) * 4 + 3] ?? 0) > 24) {
          left = Math.min(left, x)
          right = Math.max(right, x)
        }
      }
    }
    result.push(right < 0 ? null : [left / image.width, (right + 1) / image.width])
  }
  return result
}

/** Whether the outline is the box itself (every band drawn edge to edge), so no `shape-outside` is needed. */
export function isFullBox(rows: ContourRows) {
  return rows.every((row) => row !== null && row[0] <= 0.02 && row[1] >= 0.98)
}

/** The outline flipped across or down, as a flipped shape draws it. */
export function flipRows(rows: ContourRows, horizontal: boolean, vertical: boolean): ContourRows {
  const flipped = horizontal ? rows.map((row) => (row ? ([1 - row[1], 1 - row[0]] as [number, number]) : null)) : rows
  return vertical ? [...flipped].reverse() : flipped
}

export type ContourBox = {
  /** Which side of the object the text is on: "left" is a float on the page's left (text on the right of the object). */
  float: "left" | "right"
  objectWidth: number
  objectHeight: number
  /** The width of the room the float clears, from the page edge to the far side of the object and its gap. */
  roomWidth: number
  gaps: { top: number; bottom: number; left: number; right: number }
}

/** A CSS `polygon()` for the room's float: the object's edge facing the text, row by row, in the room's pixels. */
export function contourPolygon(rows: ContourRows, box: ContourBox) {
  const bandHeight = box.objectHeight / rows.length
  const facing = box.float === "left"
  const edge = (row: ContourRows[number]) => {
    if (!row) {
      return facing ? 0 : box.roomWidth
    }
    return facing
      ? box.roomWidth - box.objectWidth + row[1] * box.objectWidth
      : box.gaps.left + row[0] * box.objectWidth - box.gaps.left
  }
  const points: [number, number][] = []
  const start = facing ? 0 : box.roomWidth
  points.push([start, 0])
  // The gap above the object takes the first drawn band's edge, the gap below the last one's.
  const drawn = rows.filter((row) => row !== null)
  const firstEdge = edge(drawn[0] ?? null)
  const lastEdge = edge(drawn[drawn.length - 1] ?? null)
  points.push([firstEdge, 0], [firstEdge, box.gaps.top])
  rows.forEach((row, index) => {
    const top = box.gaps.top + index * bandHeight
    points.push([edge(row), top], [edge(row), top + bandHeight])
  })
  const bottom = box.gaps.top + box.objectHeight
  points.push([lastEdge, bottom], [lastEdge, bottom + box.gaps.bottom], [start, bottom + box.gaps.bottom])
  return `polygon(${points.map(([x, y]) => `${Math.round(x * 10) / 10}px ${Math.round(y * 10) / 10}px`).join(", ")})`
}

// --- Wrap points (Edit Wrap Points, Word's wp:wrapPolygon) ------------------------------------------------------

/** Word's wrap outline box: points run from 0 to this across and down the object. */
export const WRAP_BOX = 21600

export type WrapPoint = [number, number]

/** The points of a `wrapPoints` attribute ("x,y x,y …"); empty when there are fewer than three. */
export function parseWrapPoints(value: unknown): WrapPoint[] {
  const points = String(value ?? "")
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number))
    .filter((pair): pair is WrapPoint => pair.length === 2 && pair.every(Number.isFinite))
  return points.length >= 3 ? points : []
}

export function wrapPointsString(points: WrapPoint[]) {
  return points.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(" ")
}

/** The drawn extent of each band of a closed outline in Word's box, sampled at each band's top, middle and bottom. */
export function rowsOfPolygon(points: WrapPoint[], rows = ROWS): ContourRows {
  const result: ContourRows = []
  for (let row = 0; row < rows; row += 1) {
    let left = Infinity
    let right = -Infinity
    for (const part of [0.02, 0.5, 0.98]) {
      const y = ((row + part) / rows) * WRAP_BOX
      points.forEach((from, index) => {
        const to = points[(index + 1) % points.length]!
        if ((from[1] <= y && to[1] > y) || (to[1] <= y && from[1] > y)) {
          const x = from[0] + ((y - from[1]) / (to[1] - from[1])) * (to[0] - from[0])
          left = Math.min(left, x)
          right = Math.max(right, x)
        }
      })
    }
    result.push(right < left ? null : [left / WRAP_BOX, right / WRAP_BOX])
  }
  return result
}

/** Drops the points that lie within `tolerance` of the line between their neighbours (Douglas–Peucker). */
function simplify(points: WrapPoint[], tolerance: number): WrapPoint[] {
  if (points.length <= 2) {
    return points
  }
  const [a, b] = [points[0]!, points[points.length - 1]!]
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  let far = 0
  let at = 0
  points.forEach((point, index) => {
    const distance = Math.abs((b[0] - a[0]) * (a[1] - point[1]) - (a[0] - point[0]) * (b[1] - a[1])) / length
    if (distance > far) {
      far = distance
      at = index
    }
  })
  if (far <= tolerance) {
    return [a, b]
  }
  return [...simplify(points.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(points.slice(at), tolerance)]
}

/**
 * The outline as wrap points to start Edit Wrap Points from: down the left edge of what is drawn and back up the
 * right, with the points that add nothing dropped; the object's box when it has no outline of its own.
 */
export function polygonOfRows(rows: ContourRows | null): WrapPoint[] {
  const box: WrapPoint[] = [
    [0, 0],
    [0, WRAP_BOX],
    [WRAP_BOX, WRAP_BOX],
    [WRAP_BOX, 0],
  ]
  const drawn = (rows ?? []).map((row, index) => ({ row, index })).filter((item) => item.row !== null)
  if (drawn.length === 0) {
    return box
  }
  const band = WRAP_BOX / rows!.length
  const left: WrapPoint[] = []
  const right: WrapPoint[] = []
  for (const { row, index } of drawn) {
    const [from, to] = row!
    left.push([from * WRAP_BOX, index * band], [from * WRAP_BOX, (index + 1) * band])
    right.push([to * WRAP_BOX, index * band], [to * WRAP_BOX, (index + 1) * band])
  }
  const tolerance = WRAP_BOX * 0.012
  const outline = [...simplify(left, tolerance), ...simplify(right.reverse(), tolerance)]
  return outline.map(([x, y]) => [Math.round(x), Math.round(y)])
}

// --- Reading an object's outline ----------------------------------------------------------------------------------

const cache = new Map<string, ContourRows | null>()
const pending = new Set<string>()
const listeners = new Set<() => void>()

/** Called when an outline finished loading, so the page layout can run again. */
export function onContourReady(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function drawn(image: HTMLImageElement, width: number, height: number): Pixels | null {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) {
    return null
  }
  context.drawImage(image, 0, 0, width, height)
  try {
    return context.getImageData(0, 0, width, height)
  } catch {
    // A picture from another origin cannot be read; it wraps by its box.
    return null
  }
}

function load(
  key: string,
  source: string,
  size: (image: HTMLImageElement) => [number, number],
  flips: [boolean, boolean],
) {
  pending.add(key)
  const image = new Image()
  image.crossOrigin = "anonymous"
  const finish = (rows: ContourRows | null) => {
    pending.delete(key)
    cache.set(key, rows)
    listeners.forEach((listener) => listener())
  }
  image.onload = () => {
    const [width, height] = size(image)
    const pixels = drawn(image, width, height)
    const rows = pixels ? rowsOfPixels(pixels) : null
    finish(rows && !isFullBox(rows) ? flipRows(rows, flips[0], flips[1]) : null)
  }
  image.onerror = () => finish(null)
  image.src = source
}

type Source = {
  key: string
  source: string
  size: (image: HTMLImageElement) => [number, number]
  flips: [boolean, boolean]
}

function sourceOf(node: ProseNode): Source | null {
  if (node.type.name === "image" && typeof node.attrs.src === "string" && node.attrs.src) {
    const src: string = node.attrs.src
    return {
      key: `image:${src}`,
      source: src,
      flips: [false, false],
      size: (image) => {
        const width = Math.min(96, image.naturalWidth || 96)
        return [width, Math.max(1, Math.round((width * (image.naturalHeight || 1)) / (image.naturalWidth || 1)))]
      },
    }
  }
  if (node.type.name === "figure" && node.attrs.kind === "shape" && node.attrs.variant) {
    const variant = String(node.attrs.variant)
    const flips: [boolean, boolean] = [node.attrs.flipH === true, node.attrs.flipV === true]
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${shapeViewBox(variant)}" width="160" height="112" preserveAspectRatio="none">${shapeMarkup(variant)}</svg>`
    return {
      key: `shape:${variant}:${flips.join()}`,
      source: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      flips,
      size: () => [160, 112],
    }
  }
  return null
}

/**
 * The outline of a floating picture or shape, once read: null while it loads (it asks for a new layout when it is
 * ready), or for an object that wraps by its box (a text box, a chart, a picture with no transparency).
 */
export function contourOf(node: ProseNode): ContourRows | null {
  const own = parseWrapPoints(node.attrs.wrapPoints)
  if (own.length > 0) {
    const key = `points:${String(node.attrs.wrapPoints)}`
    if (!cache.has(key)) {
      cache.set(key, rowsOfPolygon(own))
    }
    return cache.get(key) ?? null
  }
  return autoContourOf(node)
}

/** The outline read from the object's drawing, leaving out wrap points it was given. */
export function autoContourOf(node: ProseNode): ContourRows | null {
  const found = typeof document === "undefined" ? null : sourceOf(node)
  if (!found) {
    return null
  }
  if (cache.has(found.key)) {
    return cache.get(found.key) ?? null
  }
  if (!pending.has(found.key)) {
    load(found.key, found.source, found.size, found.flips)
  }
  return null
}
