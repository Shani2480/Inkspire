import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { JUSTIFY_ALLOWANCE, measureSqueeze } from "@/editor/justify-squeeze"

// jsdom lays nothing out: the lines' boxes and the space's width are given, as a browser would measure them.
const SPACE = 4

const originalRects = Range.prototype.getClientRects

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "",
    measureText: () => ({ width: SPACE }),
  } as unknown as CanvasRenderingContext2D)
})

afterEach(() => {
  Range.prototype.getClientRects = originalRects
  document.body.innerHTML = ""
})

/** A paragraph whose text lies on lines of these widths (px), 20 px high each. */
function paragraph(text: string, widths: number[], align = "justify") {
  const dom = document.createElement("p")
  dom.style.textAlign = align
  dom.textContent = text
  document.body.append(dom)
  const rects = widths.map((width, index) => new DOMRect(0, index * 20, width, 20))
  Range.prototype.getClientRects = () => rects as unknown as DOMRectList
  return dom
}

describe("justified lines narrowed to Word's allowance", () => {
  it("shares the allowance over the spaces a full line holds", () => {
    // 30 spaces over two and a half lines of 400 px: 12 spaces a full line.
    const text = Array.from({ length: 31 }, () => "word").join(" ")
    const value = measureSqueeze(text, paragraph(text, [400, 400, 200]))
    expect(value).toBe(`${-Math.round(((JUSTIFY_ALLOWANCE * SPACE) / 12) * 100) / 100}px`)
  })

  it("leaves left-aligned text and a one-line paragraph as they are", () => {
    const text = "one two three four five"
    expect(measureSqueeze(text, paragraph(text, [300, 100], "left"))).toBe("")
    expect(measureSqueeze(text, paragraph(text, [300]))).toBe("")
  })
})
