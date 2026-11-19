import { describe, expect, it } from "vitest"
import {
  keepWithNextMustMove,
  lineSpill,
  linesOnPage,
  overrunsFoot,
  slackOf,
  spillPastFoot,
} from "@/editor/page-breaking"

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

describe("a multiple's extra at the page's foot (Word, 2026-11-19)", () => {
  it("keeps a line whose single line fits, its extra running past the foot", () => {
    // Triple-spaced Calibri 11 pt: lines 40.29 pt apart, the text's own line 13.43 pt.
    const line = 13.43 * 3
    expect(lineSpill(line, 3)).toBeCloseTo(13.43 * 2)
    expect(lineSpill(20, 1)).toBe(0)
    const heights = Array.from({ length: 30 }, () => line)
    const spills = heights.map((height) => lineSpill(height, 3))
    // Word kept 17 with 14.5 pt left after 16 lines (and with 20 or 30), 16 with 10 pt left.
    expect(linesOnPage(heights, 0, 16 * line + 14.5, false, spills)).toBe(17)
    expect(linesOnPage(heights, 0, 16 * line + 10, false, spills)).toBe(16)
    expect(linesOnPage(heights, 0, 16 * line + 14.5, false)).toBe(16)
    // The line past the foot ends the page: the next one does not fit after it.
    expect(linesOnPage(heights, 0, 16 * line + 30, false, spills)).toBe(17)
  })

  it("moves a line on whose text would reach past the foot, however little", () => {
    // Double-spaced Times New Roman 12 pt (27.6 pt lines, 13.8 pt text): Word moved the 24th line, whose text reached
    // 0.6 pt (0.8 px) past the foot, which the usual 1 px of rounding would have kept.
    const px = 4 / 3
    const heights = Array.from({ length: 30 }, () => 27.6 * px)
    const spills = heights.map((height) => lineSpill(height, 2))
    expect(linesOnPage(heights, 0, 648 * px, false, spills)).toBe(23)
    expect(slackOf(spills[0])).toBeLessThan(0.8)
    expect(overrunsFoot(23 * 27.6 * px, 27.6 * px, spills[0]!, 648 * px, slackOf(spills[0]))).toBe(true)
    expect(slackOf()).toBe(1)
  })
})
