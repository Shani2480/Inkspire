import { pageGridCell, pageGridColumns, type PageView } from "@/document/page-grid"
import type { PageMetrics } from "@/document/page-setup"
import { objectLeft, objectTop } from "@/editor/objects"
import { PAGE_GAP } from "@/editor/pages"
import type { EditorView } from "@tiptap/pm/view"

export function holdObserver(view: EditorView, change: () => void) {
  const observer = (
    view as EditorView & {
      domObserver?: { stop: () => void; start: () => void }
    }
  ).domObserver
  observer?.stop()
  try {
    change()
  } finally {
    observer?.start()
  }
}

export function preparePageMeasure(view: EditorView, pageView: PageView, metrics: PageMetrics) {
  const dom = view.dom
  holdObserver(view, () => {
    clearPageGrid(dom)
    if (pageView > 1) {
      const contentWidth = Math.max(1, metrics.width - metrics.marginLeft - metrics.marginRight)
      dom.style.width = `${contentWidth}px`
      dom.style.maxWidth = `${contentWidth}px`
      return
    }
    dom.style.width = ""
    dom.style.maxWidth = ""
  })
}

/**
 * Lays the pages out across again straight after an edit, before the browser paints or ProseMirror scrolls to the
 * cursor, so new and grown blocks never show in the single column the page breaks are measured in. Page breaks are
 * the ones already placed; pagination corrects them on the next frame.
 */
export function regridNow(view: EditorView, pageView: PageView, metrics: PageMetrics) {
  keepScroll(view, () => {
    preparePageMeasure(view, pageView, metrics)
    finishPageGrid(view, pageView, metrics)
  })
}

/** Runs `change` without letting it move the document's scroll position (measuring reflows the pages). */
function keepScroll(view: EditorView, change: () => void) {
  const scroller = view.dom.closest<HTMLElement>("#document-scroll")
  const top = scroller?.scrollTop ?? 0
  const left = scroller?.scrollLeft ?? 0
  try {
    change()
  } finally {
    if (scroller && (scroller.scrollTop !== top || scroller.scrollLeft !== left)) {
      scroller.scrollTop = top
      scroller.scrollLeft = left
    }
  }
}

export function finishPageGrid(view: EditorView, pageView: PageView, metrics: PageMetrics) {
  const dom = view.dom
  holdObserver(view, () => {
    if (pageView <= 1) {
      clearPageGrid(dom)
      dom.style.width = ""
      dom.style.maxWidth = ""
      placeObjectFrames(dom, 1, metrics)
      return
    }
    applyPageGrid(dom, pageView, metrics)
    placeObjectFrames(dom, pageView, metrics)
    dom.style.paddingBottom = "0"
  })
}

function applyPageGrid(dom: HTMLElement, pageView: PageView, metrics: PageMetrics) {
  const columns = pageGridColumns(pageView)
  const xStride = metrics.width + PAGE_GAP
  const yStride = metrics.height + PAGE_GAP
  const contentWidth = Math.max(1, metrics.width - metrics.marginLeft - metrics.marginRight)
  const columnGap = metrics.marginLeft + metrics.marginRight + PAGE_GAP
  dom.style.width = `${contentWidth}px`
  dom.style.maxWidth = `${contentWidth}px`

  const kids = [...dom.children].filter((node): node is HTMLElement => node instanceof HTMLElement)
  // In columns (data-columns) a block keeps the column it is laid out in: how far right of the text's left edge,
  // and its column's width, both read before any block is moved out of the flow.
  const inColumns = dom.hasAttribute("data-columns")
  const origin = dom.getBoundingClientRect()
  const scale = dom.offsetWidth > 0 ? origin.width / dom.offsetWidth || 1 : 1
  const padLeft = parseFloat(getComputedStyle(dom).paddingLeft) || 0
  const snapshot = kids.map((el) => {
    if (!inColumns || getComputedStyle(el).columnSpan === "all") {
      return { el, top: el.offsetTop, x: 0, width: contentWidth }
    }
    const style = getComputedStyle(el)
    const x = (el.getBoundingClientRect().left - origin.left) / scale - dom.clientLeft - padLeft
    const width = parseFloat(style.width) || contentWidth
    return { el, top: el.offsetTop, x: Math.max(0, x - (parseFloat(style.marginLeft) || 0)), width }
  })

  for (const { el, top, x, width } of snapshot) {
    if (el.classList.contains("object-frame") || el.tagName === "BR") {
      continue
    }
    if (el.classList.contains("ProseMirror-separator") || el.classList.contains("ProseMirror-trailingBreak")) {
      continue
    }
    const page = Math.max(0, Math.floor((top + 1) / yStride))
    const within = Math.max(0, top - page * yStride)
    const cell = pageGridCell(page, pageView, xStride, yStride)
    const style = getComputedStyle(el)
    const marginTop = parseFloat(style.marginTop) || 0
    const marginLeft = parseFloat(style.marginLeft) || 0

    if (
      el.classList.contains("page-gap") ||
      el.classList.contains("object-band") ||
      el.classList.contains("column-filler")
    ) {
      collapseGap(el, true)
      continue
    }

    el.dataset.gridPlaced = "1"
    el.style.position = "absolute"
    el.style.left = `${cell.left + x - marginLeft}px`
    el.style.top = `${cell.top + within - marginTop}px`
    el.style.width = `${width}px`
    el.style.maxWidth = `${width}px`

    const gaps = [...el.querySelectorAll(".page-gap")].filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    )
    if (gaps.length === 0) {
      continue
    }
    const room = columns - cell.column
    if (room < 2) {
      continue
    }
    const span = Math.min(room, gaps.length + 1)
    const spanWidth = span * contentWidth + (span - 1) * columnGap
    el.style.width = `${spanWidth}px`
    el.style.maxWidth = `${spanWidth}px`
    el.style.columnWidth = `${contentWidth}px`
    el.style.columnGap = `${columnGap}px`
    el.style.columnFill = "auto"
    el.style.height = `${Math.max(24, metrics.height - metrics.marginTop - metrics.marginBottom - within)}px`
    el.style.overflow = "visible"
    for (const gap of gaps.slice(0, span - 1)) {
      collapseGap(gap, false)
      gap.style.breakAfter = "column"
      gap.style.display = "block"
    }
  }
}

function collapseGap(el: HTMLElement, parked: boolean) {
  el.dataset.gridPlaced = "1"
  if (!el.dataset.gridHeight) {
    el.dataset.gridHeight = el.style.height
  }
  el.style.height = "0px"
  el.style.margin = "0"
  el.style.padding = "0"
  if (!parked) {
    return
  }
  el.style.position = "absolute"
  el.style.left = "0"
  el.style.top = "0"
  el.style.overflow = "hidden"
}

export function clearPageGrid(dom: HTMLElement) {
  dom.querySelectorAll<HTMLElement>("[data-grid-placed]").forEach((el) => {
    const gapHeight = el.dataset.gridHeight
    el.style.position = ""
    el.style.left = ""
    el.style.top = ""
    el.style.width = ""
    el.style.maxWidth = ""
    el.style.margin = ""
    el.style.overflow = ""
    el.style.columnWidth = ""
    el.style.columnGap = ""
    el.style.columnFill = ""
    el.style.breakAfter = ""
    el.style.display = ""
    el.style.padding = ""
    el.style.height = gapHeight || ""
    delete el.dataset.gridPlaced
    delete el.dataset.gridHeight
  })
}

export function placeObjectFrames(dom: HTMLElement, pageView: PageView, metrics: PageMetrics) {
  const xStride = metrics.width + PAGE_GAP
  const yStride = metrics.height + PAGE_GAP
  dom.querySelectorAll<HTMLElement>(".object-frame").forEach((el) => {
    const page = Math.max(1, Number(el.dataset.page) || 1)
    const x = Number(el.dataset.x) || 0
    const y = Number(el.dataset.y) || 0
    // One page wide, a section's pages are drawn at their own size, so the object's page is placed as `applyFrame` does.
    if (pageView <= 1) {
      el.style.left = `${Math.round(objectLeft(page, x, metrics))}px`
      el.style.top = `${Math.round(objectTop(page, y, metrics))}px`
      return
    }
    const cell = pageGridCell(page - 1, pageView, xStride, yStride)
    el.style.left = `${Math.round(cell.left + x)}px`
    el.style.top = `${Math.round(cell.top + y)}px`
  })
}

/**
 * A shaded paragraph that runs onto the next page is one box, so its shading would cross the grey between the pages.
 * Each gap inside it is cut out of the paragraph with a mask, so the shading ends at the foot of one page and starts
 * again at the top of the next, as Word draws it.
 */
export function cutShadedBlocks(view: EditorView) {
  const dom = view.dom
  const zoom = dom.offsetHeight > 0 ? dom.getBoundingClientRect().height / dom.offsetHeight || 1 : 1
  const cuts = new Map<HTMLElement, [number, number][]>()
  dom.querySelectorAll<HTMLElement>(".page-gap").forEach((gap) => {
    const block = gap.parentElement?.closest<HTMLElement>("p, h1, h2, h3, h4, h5, h6")
    if (!block || !block.style.backgroundColor) {
      return
    }
    const top = (gap.getBoundingClientRect().top - block.getBoundingClientRect().top) / zoom
    const list = cuts.get(block) ?? []
    list.push([Math.round(top * 10) / 10, Math.round((top + gap.offsetHeight) * 10) / 10])
    cuts.set(block, list)
  })
  holdObserver(view, () => {
    dom.querySelectorAll<HTMLElement>("[data-gap-cut]").forEach((block) => {
      if (!cuts.has(block)) {
        block.removeAttribute("data-gap-cut")
        block.style.removeProperty("mask-image")
        block.style.removeProperty("-webkit-mask-image")
      }
    })
    cuts.forEach((list, block) => {
      const stops = list
        .sort((a, b) => a[0] - b[0])
        .map(([from, to]) => `#000 ${from}px, transparent ${from}px, transparent ${to}px, #000 ${to}px`)
      const mask = `linear-gradient(to bottom, ${stops.join(", ")})`
      block.dataset.gapCut = ""
      block.style.setProperty("mask-image", mask)
      block.style.setProperty("-webkit-mask-image", mask)
    })
  })
}

/**
 * A block of columns that runs on to the next page ends each page with a filler and the gap (`placeColumnBlock`). The
 * browser drops margins at a column's end that the paginator counted, so the gap would start a little above the
 * page's foot and the next page's text above its top margin: each filler is fitted, once drawn, so its gap starts at
 * its page's bottom margin (`data-foot`).
 */
export function fitColumnBlockGaps(view: EditorView) {
  const dom = view.dom
  const gaps = [...dom.querySelectorAll<HTMLElement>(".column-section .page-gap[data-foot]")]
  if (gaps.length === 0 || dom.querySelector("[data-grid-placed]")) {
    return
  }
  const scope = dom.closest("#document-scroll") ?? document
  const sheets = [...scope.querySelectorAll(".page-sheet")].map((sheet) => sheet.getBoundingClientRect())
  const zoom = dom.offsetHeight > 0 ? dom.getBoundingClientRect().height / dom.offsetHeight || 1 : 1
  holdObserver(view, () => {
    for (const gap of gaps) {
      const filler = gap.previousElementSibling
      if (!(filler instanceof HTMLElement) || !filler.classList.contains("column-filler")) {
        continue
      }
      const top = gap.getBoundingClientRect().top
      const sheet = sheets.find((rect) => top >= rect.top - 2 && top < rect.bottom + 2)
      if (!sheet) {
        continue
      }
      const delta = (sheet.bottom - (Number(gap.dataset.foot) || 0) * zoom - top) / zoom
      if (Math.abs(delta) >= 0.5) {
        filler.style.height = `${Math.max(0, Math.round((parseFloat(filler.style.height) || 0) + delta))}px`
      }
    }
  })
}

/**
 * A block of columns that runs on to the next page: its column outlines (`.column-guides`, an editing guide) would
 * cross the grey between the pages, so each page gap in it is cut out of them, as `cutShadedBlocks` cuts shading.
 */
export function cutColumnGuides(view: EditorView) {
  const dom = view.dom
  const zoom = dom.offsetHeight > 0 ? dom.getBoundingClientRect().height / dom.offsetHeight || 1 : 1
  const cuts = new Map<HTMLElement, [number, number][]>()
  dom.querySelectorAll<HTMLElement>(".column-section .page-gap").forEach((gap) => {
    const guides = gap.closest(".column-section")?.querySelector<HTMLElement>(":scope > .column-guides")
    if (!guides) {
      return
    }
    const top = (gap.getBoundingClientRect().top - guides.getBoundingClientRect().top) / zoom
    const list = cuts.get(guides) ?? []
    list.push([Math.round(top * 10) / 10, Math.round((top + gap.offsetHeight) * 10) / 10])
    cuts.set(guides, list)
  })
  holdObserver(view, () => {
    dom.querySelectorAll<HTMLElement>(".column-guides[data-gap-cut]").forEach((guides) => {
      if (!cuts.has(guides)) {
        guides.removeAttribute("data-gap-cut")
        guides.style.removeProperty("mask-image")
        guides.style.removeProperty("-webkit-mask-image")
      }
    })
    cuts.forEach((list, guides) => {
      const stops = list
        .sort((a, b) => a[0] - b[0])
        .map(([from, to]) => `#000 ${from}px, transparent ${from}px, transparent ${to}px, #000 ${to}px`)
      const mask = `linear-gradient(to bottom, ${stops.join(", ")})`
      guides.dataset.gapCut = ""
      guides.style.setProperty("mask-image", mask)
      guides.style.setProperty("-webkit-mask-image", mask)
    })
  })
}

/**
 * A table row broken across pages (Allow row to break across pages) runs on through the grey between the pages: each
 * gap in its cells is cut out of the table from where the page's foot is (the gap's `keep`) to the next page's top,
 * so its borders and shading end at one page's foot and start again at the next one's top, as Word draws them. The
 * row's cells get their bottom border drawn at the foot and again at the top of the next page (`--row-cut` lines).
 */
export function cutSplitRows(view: EditorView) {
  const dom = view.dom
  const zoom = dom.offsetHeight > 0 ? dom.getBoundingClientRect().height / dom.offsetHeight || 1 : 1
  const cuts = new Map<HTMLElement, Map<number, number>>()
  const rows = new Set<HTMLTableRowElement>()
  dom.querySelectorAll<HTMLElement>(".page-gap-cell").forEach((gap) => {
    const table = gap.closest<HTMLElement>("table")
    const row = gap.closest("tr")
    if (!table || !row) {
      return
    }
    rows.add(row)
    const top = (gap.getBoundingClientRect().top - table.getBoundingClientRect().top) / zoom
    const from = Math.round((top + (Number(gap.dataset.keep) || 0)) * 10) / 10
    // A header row drawn again at the next page's top (`data-header`) stays in view: the cut ends above it.
    const to = Math.round((top + gap.offsetHeight - (Number(gap.dataset.header) || 0)) * 10) / 10
    // The cells of one row share their cut: keep the widest.
    const list = cuts.get(table) ?? new Map<number, number>()
    const key = Math.round(to)
    list.set(key, Math.min(list.get(key) ?? from, from))
    cuts.set(table, list)
  })
  // The lines each cell of a broken row draws at the cuts, from the cell's top.
  const lines = new Map<HTMLElement, string>()
  rows.forEach((row) => {
    const table = row.closest<HTMLElement>("table")!
    const tableTop = table.getBoundingClientRect().top
    for (const cell of Array.from(row.cells)) {
      const style = getComputedStyle(cell)
      const width = parseFloat(style.borderBottomWidth) || 0
      if (width <= 0 || style.borderBottomStyle === "none") {
        continue
      }
      const offset = (cell.getBoundingClientRect().top - tableTop) / zoom
      const color = style.borderBottomColor
      const stops = [...(cuts.get(table) ?? [])].flatMap(([to, from]) => {
        const foot = Math.round((from - offset) * 10) / 10
        const head = Math.round((to - offset) * 10) / 10
        return [
          `transparent ${foot - width}px, ${color} ${foot - width}px, ${color} ${foot}px, transparent ${foot}px`,
          `transparent ${head}px, ${color} ${head}px, ${color} ${head + width}px, transparent ${head + width}px`,
        ]
      })
      if (stops.length > 0) {
        lines.set(cell, `linear-gradient(to bottom, ${stops.join(", ")})`)
      }
    }
  })
  holdObserver(view, () => {
    dom.querySelectorAll<HTMLElement>("table[data-row-cut]").forEach((table) => {
      if (!cuts.has(table)) {
        table.removeAttribute("data-row-cut")
        table.style.removeProperty("mask-image")
        table.style.removeProperty("-webkit-mask-image")
      }
    })
    dom.querySelectorAll<HTMLElement>(":is(td, th)[data-row-cut]").forEach((cell) => {
      if (!lines.has(cell)) {
        cell.removeAttribute("data-row-cut")
        cell.style.removeProperty("--row-cut")
      }
    })
    dom.querySelectorAll<HTMLElement>(".page-gap-cell > .page-gap-header-copy").forEach((copy) => {
      const table = copy.parentElement!.closest<HTMLElement>("table")
      if (table) {
        const left = (table.getBoundingClientRect().left - copy.parentElement!.getBoundingClientRect().left) / zoom
        copy.style.left = `${Math.round(left * 10) / 10}px`
        copy.style.setProperty("width", `${table.offsetWidth}px`, "important")
      }
    })
    lines.forEach((gradient, cell) => {
      cell.dataset.rowCut = ""
      cell.style.setProperty("--row-cut", gradient)
    })
    cuts.forEach((list, table) => {
      const stops = [...list]
        .sort((a, b) => a[0] - b[0])
        .map(([to, from]) => `#000 ${from}px, transparent ${from}px, transparent ${to}px, #000 ${to}px`)
      const mask = `linear-gradient(to bottom, ${stops.join(", ")})`
      table.dataset.rowCut = ""
      table.style.setProperty("mask-image", mask)
      table.style.setProperty("-webkit-mask-image", mask)
    })
  })
}
