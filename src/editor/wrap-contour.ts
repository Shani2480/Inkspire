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
