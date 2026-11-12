import { describe, expect, it } from "vitest"
import { keepWithNextMustMove, linesOnPage, overrunsFoot, spillPastFoot } from "@/editor/page-breaking"

const lines = (count: number) => Array.from({ length: count }, () => 20)

describe("widow and orphan control (22.8)", () => {
  it("leaves a paragraph that fits alone", () => {
    expect(linesOnPage(lines(5), 0, 200, true)).toBe(5)
  })

  it("without the control, breaks where the page ends", () => {
    expect(linesOnPage(lines(6), 90, 200, false)).toBe(5)
    expect(linesOnPage(lines(6), 190, 200, false)).toBe(0)
  })

  it("does not leave a single line at the foot of a page", () => {
    expect(linesOnPage(lines(6), 180, 200, true)).toBe(0)
  })

  it("does not leave a single line at the top of the next page", () => {
    // 5 lines fit, 1 would be left over: move one more across.
    expect(linesOnPage(lines(6), 100, 200, true)).toBe(4)
  })

  it("splits a longer paragraph where it fits, two or more each side", () => {
    expect(linesOnPage(lines(10), 120, 200, true)).toBe(4)
  })

  it("does not split a two or three line paragraph", () => {
    expect(linesOnPage(lines(3), 160, 200, true)).toBe(0)
    expect(linesOnPage(lines(2), 180, 200, true)).toBe(0)
  })
})

describe("keep with next (22.8)", () => {
  it("moves a heading whose next lines would not fit", () => {
    expect(keepWithNextMustMove(700, 40, 60, 760)).toBe(true)
  })

  it("stays when the next lines fit, at the top of a page, or when the pair is taller than a page", () => {
    expect(keepWithNextMustMove(600, 40, 60, 760)).toBe(false)
    expect(keepWithNextMustMove(0, 40, 60, 760)).toBe(false)
    expect(keepWithNextMustMove(10, 500, 400, 760)).toBe(false)
  })
})

import { mirroredMargins } from "@/editor/pages"

describe("mirror indents (22.8)", () => {
  it("swaps the left and right indents on an even page", () => {
    // Two levels in (48 px) on the left, 10 mm on the right.
    const margins = mirroredMargins({ indent: 2, indentRight: 10 })
    expect(margins.right).toBe(48)
    expect(margins.left).toBeCloseTo(37.8, 1)
  })

  it("is nothing for a paragraph with no indent", () => {
    expect(mirroredMargins({})).toEqual({ left: 0, right: 0 })
  })
})

describe("space after at the page's foot", () => {
  it("keeps a paragraph whose lines fit, though its space after does not", () => {
    // 900 of 1000 used; a 70 px line with 60 px after it: the line fits, so the paragraph stays.
    expect(overrunsFoot(900, 130, 60, 1000)).toBe(false)
    expect(overrunsFoot(900, 130, 0, 1000)).toBe(true)
    // The line itself must still fit.
    expect(overrunsFoot(950, 130, 60, 1000)).toBe(true)
    // At the top of a page anything goes.
    expect(overrunsFoot(0, 2000, 0, 1000)).toBe(false)
  })

  it("counts only the space after that ran past the foot", () => {
    expect(spillPastFoot(1030, 60, 1000)).toBe(30)
    expect(spillPastFoot(990, 60, 1000)).toBe(0)
    // A block taller than the page is not space after: nothing is taken off the gap for it.
    expect(spillPastFoot(1500, 0, 1000)).toBe(0)
  })
})
