import { describe, expect, it } from "vitest"
import { DEFAULT_PAGE_SETUP, pageMetrics } from "@/document/page-setup"
import {
  drawnPageSetup,
  gridFrames,
  hasMixedPages,
  pageMetricsList,
  setDrawnPageKeys,
  stackFrames,
  stackedPageCell,
} from "@/document/page-frames"
import { namedPaperRules } from "@/document/print-copy"
import type { SectionChrome } from "@/document/sections"

const portrait = { ...DEFAULT_PAGE_SETUP, paper: "a4" as const, orientation: "portrait" as const, columns: 2 }
const wide: SectionChrome = {
  key: "s1",
  marginTop: 25.4,
  marginBottom: 25.4,
  headerFromEdge: 12.7,
  footerFromEdge: 12.7,
  differentFirstPage: false,
  paper: "a4",
  orientation: "landscape",
  paperWidth: 0,
  paperHeight: 0,
  marginLeft: 20,
  marginRight: 20,
  parts: {},
  opened: {},
}

describe("pages of different sizes", () => {
  it("draw a section's page with its own paper and side margins, the columns drawn apart", () => {
    const setup = drawnPageSetup(portrait, { ...wide, columns: 3 }, true)
    expect(setup).toMatchObject({ orientation: "landscape", marginLeft: 20, columns: 2 })
    // Without section paper (Multiple Pages, Side to Side) the document's paper is kept.
    expect(drawnPageSetup(portrait, wide, false)).toMatchObject({ orientation: "portrait" })
    expect(drawnPageSetup(portrait, null, true)).toBe(portrait)
  })

  it("stack each page under the last, centred in the widest", () => {
    const keys = ["s1", "", ""]
    const metrics = pageMetricsList(portrait, [wide], keys, 3)
    const own = pageMetrics(portrait)
    expect(metrics[0]!.width).toBeGreaterThan(metrics[0]!.height)
    const { frames, width, height } = stackFrames(metrics, 20)
    expect(width).toBe(metrics[0]!.width)
    expect(frames.map((frame) => frame.top)).toEqual([0, metrics[0]!.height + 20, metrics[0]!.height + own.height + 40])
    expect(frames[0]!.left).toBe(0)
    expect(frames[1]!.left).toBe((width - own.width) / 2)
    expect(height).toBe(metrics[0]!.height + 2 * own.height + 40)
    expect(hasMixedPages(frames, own)).toBe(true)
    expect(hasMixedPages(stackFrames([own, own], 20).frames, own)).toBe(false)
  })

  it("place a page's floating objects from its own sheet", () => {
    setDrawnPageKeys(["", "s1"])
    const sections = [wide]
    const own = pageMetrics(portrait)
    const first = stackedPageCell(portrait, sections, 0, 20)
    const second = stackedPageCell(portrait, sections, 1, 20)
    expect(first).toMatchObject({ top: 0, left: 0 })
    expect(second.top).toBe(own.height + 20)
    // The landscape page is wider than the portrait one, so its text starts left of the document's.
    expect(second.left).toBeLessThan(0)
    setDrawnPageKeys([])
  })

  it("print each paper size on its own named page", () => {
    const root = document.createElement("div")
    for (const [width, height] of [
      ["794px", "1123px"],
      ["1123px", "794px"],
      ["794px", "1123px"],
      ["1123px", "794px"],
    ]) {
      const page = document.createElement("div")
      page.className = "print-page"
      Object.assign(page.style, { width, height })
      root.append(page)
    }
    const rules = namedPaperRules(root, { width: "794px", height: "1123px" })
    expect(rules).toHaveLength(1)
    expect(rules[0]).toContain("@page paper-1")
    expect(rules[0]).toContain("size: 1123px 794px")
    const pages = [...root.children] as HTMLElement[]
    expect(pages.map((page) => page.style.getPropertyValue("page"))).toEqual(["", "paper-1", "", "paper-1"])
  })
})

describe("Multiple Pages with pages of other sizes", () => {
  const portrait = pageMetrics({ ...DEFAULT_PAGE_SETUP, paper: "a4", orientation: "portrait" })
  const landscape = pageMetrics({ ...DEFAULT_PAGE_SETUP, paper: "a4", orientation: "landscape" })

  it("centres each page in cells as big as the biggest page", () => {
    const { frames, cellWidth, cellHeight } = gridFrames([portrait, landscape, landscape], 4, 20)
    expect(cellWidth).toBe(landscape.width)
    expect(cellHeight).toBe(portrait.height)
    // The portrait page is centred across its cell, the landscape ones down theirs.
    expect(frames[0]).toMatchObject({ top: 0, left: (landscape.width - portrait.width) / 2, width: portrait.width })
    expect(frames[1]).toMatchObject({ left: landscape.width + 20, top: (portrait.height - landscape.height) / 2 })
    expect(frames[2]!.left).toBe(2 * (landscape.width + 20))
  })

  it("draws pages of one size as the grid always has", () => {
    const { frames } = gridFrames([portrait, portrait, portrait], 2, 20)
    // Two pages: the first alone on the right, then a spread.
    expect(frames.map((frame) => [frame.left, frame.top])).toEqual([
      [portrait.width + 20, 0],
      [0, portrait.height + 20],
      [portrait.width + 20, portrait.height + 20],
    ])
  })
})
