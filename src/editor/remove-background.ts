/**
 * Word's Remove Background (Picture Format → Adjust): a first guess at the picture's background, which marks then
 * correct, and the picture with the background made transparent. The guess grows from the picture's edges through
 * colours like the ones most common along them, as a person would pick out a backdrop; a mark to keep or to remove
 * flips the run of similar colour it is drawn on. Works on plain RGBA pixels, so it runs (and is tested) without a
 * canvas.
 */

export type Pixels = { width: number; height: number; data: Uint8ClampedArray }

/** 1 where the background is removed, 0 where the picture is kept. */
export type BackgroundMask = Uint8Array

/** How far, in RGB distance, a pixel may be from a backdrop colour and still count as backdrop. */
const BACKDROP_TOLERANCE = 48
/** How far one pixel may differ from its neighbour while a region still runs on (gradients, soft shadows). */
const STEP_TOLERANCE = 28
/** A mark takes the run of colour within this distance of where the mark was drawn. */
const MARK_TOLERANCE = 40
/** The largest side the picture is worked on at; a larger one is reduced first (see `workingSize`). */
export const MAX_SIDE = 2000

function distance(data: Uint8ClampedArray, at: number, r: number, g: number, b: number) {
  const dr = data[at]! - r
  const dg = data[at + 1]! - g
  const db = data[at + 2]! - b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/** The size to work on: the picture's own, or reduced so its longer side is `MAX_SIDE`. */
export function workingSize(width: number, height: number) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height, 1))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** The colours most common along the edges: each a bucket's average that covers a fair share of the border. */
export function backdropColors(pixels: Pixels) {
  const { width, height, data } = pixels
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>()
  let total = 0
  const take = (x: number, y: number) => {
    const at = (y * width + x) * 4
    if (data[at + 3]! < 16) {
      return
    }
    const key = ((data[at]! >> 5) << 6) | ((data[at + 1]! >> 5) << 3) | (data[at + 2]! >> 5)
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
    bucket.count += 1
    bucket.r += data[at]!
    bucket.g += data[at + 1]!
    bucket.b += data[at + 2]!
    buckets.set(key, bucket)
    total += 1
  }
  for (let x = 0; x < width; x += 1) {
    take(x, 0)
    take(x, height - 1)
  }
  for (let y = 1; y < height - 1; y += 1) {
    take(0, y)
    take(width - 1, y)
  }
  return [...buckets.values()]
    .filter((bucket) => bucket.count >= total * 0.04)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((bucket) => [bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count] as const)
}

/**
 * Grows `mask` (set to `value`) from the seeds through neighbours that differ from the pixel before them by less
 * than the step tolerance and that `accept` takes.
 */
function grow(
  pixels: Pixels,
  mask: BackgroundMask,
  seeds: number[],
  value: 0 | 1,
  accept: (at: number) => boolean,
  step = STEP_TOLERANCE,
) {
  const { width, height, data } = pixels
  const seen = new Uint8Array(width * height)
  const stack: number[] = []
  for (const seed of seeds) {
    if (!seen[seed] && accept(seed * 4)) {
      seen[seed] = 1
      stack.push(seed)
    }
  }
  while (stack.length > 0) {
    const index = stack.pop()!
    mask[index] = value
    const x = index % width
    const y = (index - x) / width
    const at = index * 4
    const visit = (next: number) => {
      if (seen[next]) {
        return
      }
      const to = next * 4
      if (distance(data, to, data[at]!, data[at + 1]!, data[at + 2]!) <= step && accept(to)) {
        seen[next] = 1
        stack.push(next)
      }
    }
    if (x > 0) visit(index - 1)
    if (x < width - 1) visit(index + 1)
    if (y > 0) visit(index - width)
    if (y < height - 1) visit(index + width)
  }
}

/** The first guess: the backdrop reached from the edges. Already transparent pixels count as removed. */
export function guessBackground(pixels: Pixels): BackgroundMask {
  const { width, height, data } = pixels
  const mask = new Uint8Array(width * height)
  for (let index = 0; index < width * height; index += 1) {
    if (data[index * 4 + 3]! < 16) {
      mask[index] = 1
    }
  }
  const colors = backdropColors(pixels)
  if (colors.length === 0) {
    return mask
  }
  const near = (at: number) =>
    data[at + 3]! < 16 || colors.some(([r, g, b]) => distance(data, at, r, g, b) <= BACKDROP_TOLERANCE)
  const seeds: number[] = []
  for (let x = 0; x < width; x += 1) {
    seeds.push(x, (height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y += 1) {
    seeds.push(y * width, y * width + width - 1)
  }
  grow(pixels, mask, seeds, 1, near)
  return mask
}

/**
 * A mark drawn through `points`: Mark Areas to Keep (`keep`) brings back the run of colour under it, Mark Areas to
 * Remove takes it away. Each point takes the pixels within the mark tolerance of the colour under it.
 */
export function markArea(pixels: Pixels, mask: BackgroundMask, points: { x: number; y: number }[], keep: boolean) {
  const { width, height, data } = pixels
  const next = new Uint8Array(mask)
  for (const point of points) {
    const x = Math.max(0, Math.min(width - 1, Math.round(point.x)))
    const y = Math.max(0, Math.min(height - 1, Math.round(point.y)))
    const seed = y * width + x
    const at = seed * 4
    const [r, g, b] = [data[at]!, data[at + 1]!, data[at + 2]!]
    grow(pixels, next, [seed], keep ? 0 : 1, (to) => distance(data, to, r, g, b) <= MARK_TOLERANCE)
    // The pixels the mark itself crosses always follow it, as Word's pencil does.
    next[seed] = keep ? 0 : 1
  }
  return next
}

/** The picture with what the mask removes made transparent. */
export function withoutBackground(pixels: Pixels, mask: BackgroundMask): Pixels {
  const data = new Uint8ClampedArray(pixels.data)
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) {
      data[index * 4 + 3] = 0
    }
  }
  return { width: pixels.width, height: pixels.height, data }
}

/** The share of the picture the mask removes, 0 to 1. */
export function removedShare(mask: BackgroundMask) {
  let removed = 0
  for (const value of mask) {
    removed += value
  }
  return mask.length ? removed / mask.length : 0
}
