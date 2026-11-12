import {
  backdropColors,
  guessBackground,
  markArea,
  removedShare,
  withoutBackground,
  workingSize,
  type Pixels,
} from "@/editor/remove-background"
import { describe, expect, it } from "vitest"

/** A `size` square picture: `paint` gives each pixel's colour. */
function picture(size: number, paint: (x: number, y: number) => [number, number, number, number?]): Pixels {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a = 255] = paint(x, y)
      data.set([r, g, b, a], (y * size + x) * 4)
    }
  }
  return { width: size, height: size, data }
}

const at = (pixels: Pixels, x: number, y: number) => y * pixels.width + x

/** A red disc on a light grey backdrop that darkens a little from top to bottom, as a studio sweep does. */
const disc = picture(40, (x, y) =>
  Math.hypot(x - 20, y - 20) < 10 ? [200, 30, 30] : [230 - Math.round(y / 2), 230 - Math.round(y / 2), 235],
)

describe("Remove Background", () => {
  it("finds the backdrop's colours along the picture's edges", () => {
    const colors = backdropColors(disc)
    expect(colors.length).toBeGreaterThan(0)
    for (const [r, , b] of colors) {
      expect(r).toBeGreaterThan(190)
      expect(b).toBeGreaterThan(220)
    }
  })

  it("first removes the backdrop reached from the edges and keeps the subject", () => {
    const mask = guessBackground(disc)
    expect(mask[at(disc, 0, 0)]).toBe(1)
    expect(mask[at(disc, 39, 39)]).toBe(1)
    expect(mask[at(disc, 20, 20)]).toBe(0)
    expect(mask[at(disc, 14, 20)]).toBe(0)
    const share = removedShare(mask)
    // The disc is about a fifth of the picture.
    expect(share).toBeGreaterThan(0.75)
    expect(share).toBeLessThan(0.85)
  })

  it("keeps a backdrop-coloured area the subject encloses: it cannot be reached from the edges", () => {
    const ring = picture(40, (x, y) => {
      const r = Math.hypot(x - 20, y - 20)
      return r < 12 && r > 6 ? [20, 90, 200] : [240, 240, 240]
    })
    const mask = guessBackground(ring)
    expect(mask[at(ring, 20, 20)]).toBe(0)
    // Mark Areas to Remove takes the hole away too.
    const marked = markArea(ring, mask, [{ x: 20, y: 20 }], false)
    expect(marked[at(ring, 20, 20)]).toBe(1)
    expect(marked[at(ring, 20, 11)]).toBe(0)
  })

  it("brings back a part of the subject in the backdrop's colour with Mark Areas to Keep", () => {
    // A grey square on a grey backdrop, joined to it: the guess takes it, a mark brings it back.
    const flat = picture(30, (x, y) => (x >= 10 && x < 20 && y >= 10 && y < 20 ? [225, 225, 228] : [235, 235, 238]))
    const mask = guessBackground(flat)
    expect(mask[at(flat, 15, 15)]).toBe(1)
    const kept = markArea(flat, mask, [{ x: 15, y: 15 }], true)
    expect(kept[at(flat, 15, 15)]).toBe(0)
    // The mark leaves the mask it was given alone, so a mark can be undone.
    expect(mask[at(flat, 15, 15)]).toBe(1)
  })

  it("makes the removed parts transparent and leaves the rest as it was", () => {
    const mask = guessBackground(disc)
    const out = withoutBackground(disc, mask)
    expect(out.data[at(disc, 0, 0) * 4 + 3]).toBe(0)
    expect([...out.data.slice(at(disc, 20, 20) * 4, at(disc, 20, 20) * 4 + 4)]).toEqual([200, 30, 30, 255])
    expect(disc.data[3]).toBe(255)
  })

  it("counts pixels already transparent as removed", () => {
    const clear = picture(10, (x) => (x < 5 ? [0, 0, 0, 0] : [10, 200, 10]))
    const mask = guessBackground(clear)
    expect(mask[at(clear, 1, 5)]).toBe(1)
  })

  it("works on a large picture reduced to at most 2000 pixels a side", () => {
    expect(workingSize(4000, 3000)).toEqual({ width: 2000, height: 1500 })
    expect(workingSize(800, 600)).toEqual({ width: 800, height: 600 })
  })
})
