import { pageMetrics, type PageMetrics, type PageSetup } from "@/document/page-setup"
import { sectionPageSetup, sectionSetup, type SectionChrome } from "@/document/sections"
import { useViewStore } from "@/document/view"

/**
 * Whether pages are drawn with their own section's paper and side margins. They are in the usual view, one page
 * wide down the screen; Multiple Pages, Side to Side and Web Layout draw every page with the document's paper, as
 * their grids are one page size.
 */
export function drawsSectionPaper() {
  const view = useViewStore.getState()
  return view.layoutMode !== "web" && view.movement !== "side" && view.pageView <= 1
}

/** The page setup a section's pages are drawn with (see `drawsSectionPaper`); `null` is the document's own section. */
export function drawnPageSetup(setup: PageSetup, section: SectionChrome | null, paper = drawsSectionPaper()) {
  if (!section) {
    return setup
  }
  if (!paper) {
    return sectionSetup(setup, section)
  }
  // Columns are drawn separately (`drawnColumns`): only the paper and margins are the section's here.
  const own = sectionPageSetup(setup, section)
  return {
    ...own,
    columns: setup.columns,
    columnGap: setup.columnGap,
    columnLine: setup.columnLine,
    columnWidths: setup.columnWidths,
  }
}

/** Where a page is drawn in the stack, in canvas pixels before zoom: its sheet's box and its metrics. */
export type PageFrame = { top: number; left: number; width: number; height: number; metrics: PageMetrics }

/**
 * The pages one under another, each its own size, with the gap between them (`PAGE_GAP`). The stack is as wide as the widest page
 * and each page is centred in it, as Word draws a landscape page among portrait ones.
 */
export function stackFrames(metrics: PageMetrics[], gap: number) {
  const width = Math.max(0, ...metrics.map((item) => item.width))
  let top = 0
  const frames: PageFrame[] = metrics.map((item) => {
    const frame = { top, left: (width - item.width) / 2, width: item.width, height: item.height, metrics: item }
    top += item.height + gap
    return frame
  })
  return { frames, width, height: Math.max(0, top - gap) }
}

/**
 * Each page's metrics from the paginator's `pageSections` (a section's key, or "" for the document's own): the
 * section's paper and margins when `drawsSectionPaper`, else the document's with the section's top and bottom.
 */
export function pageMetricsList(setup: PageSetup, sections: SectionChrome[], keys: string[], count: number) {
  const cache = new Map<string, PageMetrics>()
  return Array.from({ length: Math.max(1, count) }, (_, index) => {
    const key = keys[index] ?? ""
    let found = cache.get(key)
    if (!found) {
      const section = key ? (sections.find((item) => item.key === key) ?? null) : null
      found = pageMetrics(drawnPageSetup(setup, section), false, section?.key ?? "")
      cache.set(key, found)
    }
    return found
  })
}

/** Whether any page is drawn at another size or with other side margins than the document's own. */
export function hasMixedPages(frames: PageFrame[], own: PageMetrics) {
  return frames.some(
    (frame) =>
      Math.round(frame.width) !== Math.round(own.width) ||
      Math.round(frame.height) !== Math.round(own.height) ||
      Math.round(frame.metrics.marginLeft) !== Math.round(own.marginLeft) ||
      Math.round(frame.metrics.marginRight) !== Math.round(own.marginRight),
  )
}

// The paginator's latest `pageSections`, so code without the editor (floating objects) can find where a page is drawn.
let drawnKeys: string[] = []
let cached: {
  setup: PageSetup
  sections: SectionChrome[]
  keys: string[]
  count: number
  gap: number
  cells: PageCell[]
} | null = null

/** Called by the paginator with each page's section key once it has laid the pages out. */
export function setDrawnPageKeys(keys: string[]) {
  drawnKeys = keys
}

/** A page's place in editor coordinates: its top from the first page's, its text's left from the document's own. */
export type PageCell = { top: number; left: number; metrics: PageMetrics }

/**
 * Where page `index` (from 0) is drawn when pages are stacked at their own sizes (`drawsSectionPaper`): its top from
 * the first page's top, and how far its text's left edge is from the document's own section's.
 */
export function stackedPageCell(setup: PageSetup, sections: SectionChrome[], index: number, gap: number): PageCell {
  const count = Math.max(drawnKeys.length, index + 1)
  if (
    !cached ||
    cached.setup !== setup ||
    cached.sections !== sections ||
    cached.keys !== drawnKeys ||
    cached.count < count ||
    cached.gap !== gap
  ) {
    const own = pageMetrics(setup)
    const stack = stackFrames(pageMetricsList(setup, sections, drawnKeys, count), gap)
    const ownLeft = (stack.width - own.width) / 2 + own.marginLeft
    const cells = stack.frames.map((frame) => ({
      top: frame.top,
      left: frame.left + frame.metrics.marginLeft - ownLeft,
      metrics: frame.metrics,
    }))
    cached = { setup, sections, keys: drawnKeys, count, gap, cells }
  }
  return cached.cells[index]!
}
