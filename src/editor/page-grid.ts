import { pageGridCell, pageGridColumns, type PageView } from "@/document/page-grid"
import type { PageMetrics } from "@/document/page-setup"
import { PAGE_GAP } from "@/editor/pages"
import type { EditorView } from "@tiptap/pm/view"

function holdObserver(view: EditorView, change: () => void) {
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
  const snapshot = kids.map((el) => ({ el, top: el.offsetTop }))

  for (const { el, top } of snapshot) {
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

    if (el.classList.contains("page-gap") || el.classList.contains("object-band")) {
      collapseGap(el, true)
      continue
    }

    el.dataset.gridPlaced = "1"
    el.style.position = "absolute"
    el.style.left = `${cell.left - marginLeft}px`
    el.style.top = `${cell.top + within - marginTop}px`
    el.style.width = `${contentWidth}px`
    el.style.maxWidth = `${contentWidth}px`

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
    const cell = pageGridCell(page - 1, pageView, xStride, yStride)
    el.style.left = `${Math.round(cell.left + x)}px`
    el.style.top = `${Math.round(cell.top + y)}px`
  })
}
