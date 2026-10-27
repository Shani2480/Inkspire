import { contourOf, contourPolygon, onContourReady } from "@/editor/wrap-contour"
import { keepWithNextMustMove, linesOnPage } from "@/editor/page-breaking"
import { useChromeExtent } from "@/document/chrome-extent"
import { pageMetrics } from "@/document/page-setup"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import {
  clearOfFloats,
  floatPlace,
  floatSide,
  parseFloatValue,
  type FloatFrame,
  type FloatRect,
} from "@/editor/table-float"
import { PX_PER_CM } from "@/editor/table-props"
import type { PageMetrics } from "@/document/page-setup"
import {
  isFloating,
  objectAnchoring,
  objectLeft,
  objectTop,
  objectWrap,
  placeFlowObjects,
  wrapGaps,
  wrapSide,
  wrapsBeside,
} from "@/editor/objects"
import { rotatedBounds } from "@/editor/object-rotate"
import { cutShadedBlocks, finishPageGrid, preparePageMeasure, regridNow } from "@/editor/page-grid"
import { Extension } from "@tiptap/core"

declare module "@tiptap/core" {
  interface Storage {
    pagination: PaginationStorage
  }
}
import type { Node as ProseNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"

export const PAGE_GAP = 40

export type LineMark = {
  n: number
  pos: number
  top: number
}

export type PaginationStorage = {
  pageCount: number
  breaks: number[]
  lines: LineMark[]
  /** Last layout duration in ms (for profiling / status). */
  lastLayoutMs: number
  /** How many block measures ran in the last layout (vs cache hits). */
  lastMeasureCount: number
  lastCacheHits: number
  /** Document position from which measures were invalidated (debug / profile). */
  lastDirtyFrom: number
  /** Heaviest measure/layout pass since the counters were reset (profile). */
  peakLayoutMs: number
  peakMeasureCount: number
  peakCacheHits: number
  peakDirtyFrom: number
}

type PageBreak = {
  pos: number
  height: number
  manual: boolean
  labelTop: number
  /** A break between a table's rows that draws the table's header row again at the top of the next page. */
  header?: boolean
}

type PaginationSnapshot = {
  decorations: DecorationSet
  signature: string
}

const paginationKey = new PluginKey<PaginationSnapshot>("pagination")

export const Pagination = Extension.create<unknown, PaginationStorage>({
  name: "pagination",

  addStorage() {
    return {
      pageCount: 1,
      breaks: [],
      lines: [],
      lastLayoutMs: 0,
      lastMeasureCount: 0,
      lastCacheHits: 0,
      lastDirtyFrom: 0,
      peakLayoutMs: 0,
      peakMeasureCount: 0,
      peakCacheHits: 0,
      peakDirtyFrom: 0,
    }
  },

  addProseMirrorPlugins() {
    return [paginationPlugin(this.storage)]
  },
})

/** `top` and `bottom` are the block's outer margins, which collapse with its neighbours' as CSS does. */
type MeasureCacheEntry =
  | { kind: "text"; node: ProseNode; lines: { pos: number; height: number }[]; top: number; bottom: number }
  | { kind: "block"; node: ProseNode; height: number; top: number; bottom: number }

/** First document position where `before` and `after` differ. */
export function firstContentDiff(before: ProseNode, after: ProseNode): number {
  if (before.eq(after)) {
    return after.content.size
  }
  return diffPos(before, after, 0)
}

function diffPos(before: ProseNode, after: ProseNode, pos: number): number {
  if (before.isText || after.isText || before.isLeaf || after.isLeaf) {
    return pos
  }
  const count = Math.min(before.childCount, after.childCount)
  let offset = pos
  for (let index = 0; index < count; index += 1) {
    const left = before.child(index)
    const right = after.child(index)
    if (!left.eq(right)) {
      if (left.type === right.type && !left.isLeaf && !right.isLeaf) {
        return diffPos(left, right, offset + 1)
      }
      return offset
    }
    offset += left.nodeSize
  }
  return offset
}

function paginationPlugin(storage: PaginationStorage) {
  let frame = 0
  let applied = ""
  let retries = 0
  let seen: ProseNode | null = null
  let dirtyFrom = 0
  let forceFull = true
  const measureCache = new Map<number, MeasureCacheEntry>()
  let placedDoc: ProseNode | null = null
  let placing = false
  let queued = false
  let sideKey = ""

  return new Plugin<PaginationSnapshot>({
    key: paginationKey,
    state: {
      init() {
        return { decorations: DecorationSet.empty, signature: "" }
      },
      apply(tr, value) {
        const next = tr.getMeta(paginationKey) as PaginationSnapshot | undefined
        if (next) {
          return next
        }
        if (!tr.docChanged) {
          return value
        }
        return {
          decorations: value.decorations.map(tr.mapping, tr.doc),
          signature: value.signature,
        }
      },
    },
    props: {
      decorations(state) {
        return paginationKey.getState(state)?.decorations ?? DecorationSet.empty
      },
    },
    view(view) {
      const schedule = () => {
        if (placing) {
          queued = true
          return
        }
        queued = false
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => {
          if (view.isDestroyed) {
            return
          }
          if (!view.dom.isConnected) {
            window.setTimeout(() => schedule(), 30)
            return
          }
          if (view.state.doc !== seen) {
            seen = view.state.doc
            retries = 0
          }
          const pageSetup = useDocumentStore.getState().pageSetup
          const pageView = useViewStore.getState().movement === "side" ? 1 : useViewStore.getState().pageView
          const metrics = pageMetrics(pageSetup)
          const gridKey = `${pageView}|${Math.round(metrics.width)}|${Math.round(metrics.height)}|${applied}`
          if (
            applied &&
            placedDoc === view.state.doc &&
            view.dom.dataset.pageGridKey === gridKey &&
            gridIsPlaced(view, pageView)
          ) {
            retries = 0
            return
          }
          delete view.dom.dataset.pageGridKey
          placing = true
          let stable = true
          let retryLayout = false
          const scroller = view.dom.closest<HTMLElement>("#document-scroll")
          const scrollTop = scroller?.scrollTop ?? 0
          const scrollLeft = scroller?.scrollLeft ?? 0
          try {
            preparePageMeasure(view, pageView, metrics)
            const from = forceFull ? 0 : dirtyFrom
            forceFull = false
            dirtyFrom = view.state.doc.content.size
            let laid: Layout | null
            try {
              laid = layoutPages(view, measureCache, from)
            } catch (error) {
              console.error(error)
              retryLayout = true
              laid = null
            }
            if (!laid) {
              retryLayout = true
              // Measures may be half-done; the retry has to start from scratch.
              forceFull = true
              measureCache.clear()
            }
            if (laid) {
              storage.lastLayoutMs = laid.layoutMs
              storage.lastMeasureCount = laid.measureCount
              storage.lastCacheHits = laid.cacheHits
              storage.lastDirtyFrom = from
              if (laid.measureCount >= storage.peakMeasureCount) {
                storage.peakLayoutMs = laid.layoutMs
                storage.peakMeasureCount = laid.measureCount
                storage.peakCacheHits = laid.cacheHits
                storage.peakDirtyFrom = from
              }
              const web = useViewStore.getState().layoutMode === "web"
              const columns = web ? 1 : pageSetup.columns
              if (columns > 1) {
                view.dom.dataset.columns = String(columns)
                view.dom.style.setProperty("--column-gap", `${pageSetup.columnGap}cm`)
                view.dom.style.paddingBottom = "0"
              } else {
                delete view.dom.dataset.columns
                view.dom.style.removeProperty("--column-gap")
                // The web frame is one endless page: there is no empty rest of a page to pad out.
                view.dom.style.paddingBottom = web
                  ? "0"
                  : `${Math.max(0, Math.round(laid.contentHeight - laid.lastUsed))}px`
              }
              const lines = pageSetup.lineNumbers
                ? collectLineNumbers(view, pageSetup.lineNumberRestart === "page", metrics.contentHeight)
                : []
              if (laid.sideKey !== sideKey) {
                // The floats text wraps beside changed, so lines after them changed width: measure afresh.
                sideKey = laid.sideKey
                measureCache.clear()
                forceFull = true
              }
              placeFlowObjects(view, laid.placements)
              placeFloatingTables(view, laid.tables, metrics)
              storage.pageCount = laid.pageCount
              storage.breaks = laid.breaks.map((item) => item.pos)
              storage.lines = lines
              const lineSignature = lines.map((line) => `${line.n}:${line.pos}:${line.top}`).join(",")
              const signature = `${laid.signature}|${lineSignature}`
              const expected = laid.breaks.length + laid.bands.length + lines.length
              const stableNow = signature === applied && gapsMatch(view, expected)
              stable = stableNow
              if (!stableNow && retries <= 5) {
                retries += 1
                applied = signature
                view.dispatch(
                  view.state.tr
                    .setMeta(paginationKey, {
                      decorations: decorationsFor(view.state.doc, laid.breaks, laid.bands, lines, laid.mirrors),
                      signature,
                    } satisfies PaginationSnapshot)
                    .setMeta("addToHistory", false),
                )
              } else {
                retries = 0
                if (!stableNow) {
                  applied = signature
                }
              }
              if (stableNow || retries > 5) {
                finishPageGrid(view, pageView, metrics)
                cutShadedBlocks(view)
                view.dom.dataset.pageGridKey = `${pageView}|${Math.round(metrics.width)}|${Math.round(metrics.height)}|${applied}`
                view.dom.dataset.pageGridGaps = String(expected)
                placedDoc = view.state.doc
                if (pageView > 1) {
                  const token = pageView
                  const restore = () => {
                    if (view.isDestroyed) {
                      return
                    }
                    const current = useViewStore.getState().movement === "side" ? 1 : useViewStore.getState().pageView
                    if (current !== token) {
                      return
                    }
                    const sample = view.dom.querySelector(
                      ":scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > table, :scope > ul, :scope > ol",
                    )
                    if (sample instanceof HTMLElement && sample.style.position === "absolute") {
                      return
                    }
                    preparePageMeasure(view, token, metrics)
                    finishPageGrid(view, token, metrics)
                  }
                  window.setTimeout(restore, 50)
                  window.setTimeout(restore, 150)
                }
              }
            }
          } catch (error) {
            console.error(error)
            retryLayout = true
          } finally {
            placing = false
            // Measuring lays every page out in one column. When this frame ends before the pages are settled, put
            // them back across anyway, so that column is never painted, and keep the reader where they were.
            if (pageView > 1 && !gridIsPlaced(view, pageView)) {
              finishPageGrid(view, pageView, metrics)
            }
            if (scroller && pageView > 1) {
              scroller.scrollTop = scrollTop
              scroller.scrollLeft = scrollLeft
            }
          }
          if (queued) {
            queued = false
            schedule()
            return
          }
          if (retryLayout) {
            if (retries <= 20) {
              retries += 1
              window.setTimeout(() => schedule(), 40)
            }
            return
          }
          if (!stable && retries <= 5) {
            schedule()
          }
        })
      }

      schedule()
      // While the editor is hidden (Read Mode's columns) every block measures zero, so the layout done then is wrong;
      // when it shows again the layout has to be done afresh, which the "already placed" check would otherwise skip.
      let wasHidden = false
      const observer = new ResizeObserver(() => {
        const hidden = view.dom.offsetParent === null
        if (wasHidden && !hidden) {
          applied = ""
        }
        wasHidden = hidden
        forceFull = true
        measureCache.clear()
        schedule()
      })
      observer.observe(view.dom)
      const unsubscribe = useDocumentStore.subscribe((state, previous) => {
        if (state.pageSetup === previous.pageSetup) {
          return
        }
        forceFull = true
        measureCache.clear()
        schedule()
      })
      const unsubscribeView = useViewStore.subscribe((state, previous) => {
        if (
          state.pageView === previous.pageView &&
          state.movement === previous.movement &&
          state.layoutMode === previous.layoutMode &&
          state.webWidth === previous.webWidth
        ) {
          return
        }
        // Multi-page and side-to-side views change block widths, so cached heights are stale.
        forceFull = true
        measureCache.clear()
        schedule()
      })
      const unsubscribeReach = useChromeExtent.subscribe(() => {
        // A header or footer grew past its margin (or shrank back): the body has a different height on every page.
        forceFull = true
        applied = ""
        schedule()
      })
      const unsubscribeContour = onContourReady(() => {
        // A picture's or shape's outline finished loading: text wraps to it from now on.
        forceFull = true
        measureCache.clear()
        applied = ""
        schedule()
      })
      return {
        update(view, previous) {
          if (!view.state.doc.eq(previous.doc)) {
            const diff = firstContentDiff(previous.doc, view.state.doc)
            dirtyFrom = Math.min(dirtyFrom, diff)
            const pageView = useViewStore.getState().movement === "side" ? 1 : useViewStore.getState().pageView
            if (pageView > 1 && !placing) {
              regridNow(view, pageView, pageMetrics(useDocumentStore.getState().pageSetup))
            }
          }
          schedule()
        },
        destroy() {
          cancelAnimationFrame(frame)
          observer.disconnect()
          unsubscribe()
          measureCache.clear()
          unsubscribeView()
          unsubscribeContour()
          unsubscribeReach()
        },
      }
    },
  })
}

function gridIsPlaced(view: EditorView, pageView: number) {
  if (pageView <= 1) {
    return true
  }
  const sample = view.dom.querySelector(
    ":scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > table, :scope > ul, :scope > ol",
  )
  return sample instanceof HTMLElement && sample.style.position === "absolute"
}

function gapsMatch(view: EditorView, expected: number) {
  const found = paginationKey.getState(view.state)?.decorations.find() ?? []
  return found.length === expected
}

/** The left and right margins of a paragraph with mirrored indents on an even page: its indents swapped. */
export function mirroredMargins(attrs: Record<string, unknown>) {
  const left = Math.max(0, Math.min(8, Math.round(Number(attrs.indent) || 0))) * 24
  const right = Math.max(0, Number(attrs.indentRight) || 0) * (96 / 25.4)
  return { left: Math.round(right * 100) / 100, right: left }
}

function decorationsFor(
  doc: ProseNode,
  breaks: PageBreak[],
  bands: FlowBand[],
  lines: LineMark[],
  mirrors: Layout["mirrors"] = [],
) {
  const decorations: Decoration[] = []
  for (const item of breaks) {
    const height = item.height
    const manual = item.manual
    const at = doc.resolve(item.pos)
    if (at.parent.type.name === "table" && at.nodeAfter) {
      // Between a table's rows the gap is a row of its own, and the header row can follow it on the new page.
      const tablePos = at.before()
      let columns = 0
      at.nodeAfter.forEach((cell) => {
        columns += Math.max(1, Number(cell.attrs.colspan) || 1)
      })
      decorations.push(
        Decoration.widget(item.pos, () => createRowGap(height, columns), {
          side: -2,
          ignoreSelection: true,
          key: `row-gap-${item.pos}-${height}-${columns}`,
        }),
      )
      if (item.header) {
        decorations.push(
          Decoration.widget(item.pos, (view) => repeatedHeader(view, tablePos), {
            side: -1,
            ignoreSelection: true,
            key: `row-header-${item.pos}-${tablePos}`,
          }),
        )
      }
      continue
    }
    decorations.push(
      Decoration.widget(item.pos, () => createGap(height, manual), {
        side: -1,
        ignoreSelection: true,
        key: `gap-${item.pos}-${height}-${manual ? 1 : 0}`,
      }),
    )
  }
  bands.forEach((band, index) => {
    const beside = band.side
    decorations.push(
      beside
        ? Decoration.widget(band.pos, () => createSideBand(band.height, beside), {
            side: -1,
            ignoreSelection: true,
            key: `wrap-${index}-${band.pos}-${band.height}-${beside.float}-${beside.width}-${beside.offset}-${beside.shape?.length ?? 0}-${beside.shape ?? ""}`,
          })
        : Decoration.widget(band.pos, () => createBand(band.height), {
            side: -1,
            ignoreSelection: true,
            key: `band-${index}-${band.pos}-${band.height}`,
          }),
    )
  })
  for (const line of lines) {
    if (line.pos <= 0 || line.pos > doc.content.size) {
      continue
    }
    decorations.push(
      Decoration.widget(line.pos, () => createLineNumber(line.n, line.top), {
        side: -1,
        ignoreSelection: true,
        key: `line-${line.n}-${line.pos}-${line.top}`,
      }),
    )
  }
  for (const mirror of mirrors) {
    if (mirror.page % 2 === 0) {
      const margins = mirroredMargins(mirror.node.attrs)
      decorations.push(
        Decoration.node(mirror.pos, mirror.pos + mirror.node.nodeSize, {
          style: `margin-left: ${margins.left}px; margin-right: ${margins.right}px`,
        }),
      )
    }
  }
  decorations.sort((left, right) => left.from - right.from)
  return DecorationSet.create(doc, decorations)
}

function createBand(height: number) {
  const band = document.createElement("span")
  band.className = "object-band"
  band.style.height = `${height}px`
  band.contentEditable = "false"
  return band
}

/**
 * Room beside the text for an object with Square, Tight or Through wrapping: a float as wide as the object's side
 * of the page. A zero-width float first drops it to the object's top, so the lines above keep their width.
 */
function createSideBand(height: number, side: NonNullable<FlowBand["side"]>) {
  const band = document.createElement("span")
  band.className = "object-wrap"
  band.contentEditable = "false"
  if (side.offset > 0) {
    const spacer = document.createElement("span")
    spacer.className = "object-wrap-spacer"
    Object.assign(spacer.style, { float: side.float, width: "0", height: `${side.offset}px` })
    band.append(spacer)
  }
  const room = document.createElement("span")
  room.className = "object-wrap-room"
  Object.assign(room.style, { float: side.float, clear: side.float, width: `${side.width}px`, height: `${height}px` })
  if (side.shape) {
    // Tight and Through: the text follows the outline of what is drawn, not its box.
    room.style.shapeOutside = side.shape
  }
  band.append(room)
  return band
}

function createLineNumber(n: number, top: number) {
  const mark = document.createElement("span")
  mark.className = "line-number"
  mark.dataset.n = String(n)
  mark.style.top = `${top}px`
  mark.contentEditable = "false"
  return mark
}

function collectLineNumbers(view: EditorView, restartEachPage = false, pageContentHeight = 0): LineMark[] {
  const lines: LineMark[] = []
  let n = 0
  let currentPage = -1
  const editorTop = view.dom.getBoundingClientRect().top
  const zoom = zoomOf(view.dom)
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === "textBox") {
      return false
    }
    if (!node.isTextblock) {
      return
    }
    // "Suppress line numbers" (22.8): the paragraph's lines are not numbered, and not counted.
    if (node.attrs.suppressLineNumbers === true) {
      return false
    }
    const dom = view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement) || dom.closest(".object-frame")) {
      return false
    }
    const blockZoom = zoomOf(dom)
    const blockTop = dom.getBoundingClientRect().top
    for (const rect of blockLineRects(dom)) {
      if (restartEachPage && pageContentHeight > 0) {
        const y = (rect.top - editorTop) / Math.max(0.01, zoom)
        const pageIndex = Math.max(0, Math.floor(y / pageContentHeight))
        if (pageIndex !== currentPage) {
          currentPage = pageIndex
          n = 0
        }
      }
      n += 1
      lines.push({
        n,
        pos: pos + 1,
        top: Math.round((rect.top - blockTop) / blockZoom),
      })
    }
    return false
  })
  return lines
}

function blockLineRects(dom: HTMLElement) {
  const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT)
  const rects: DOMRect[] = []
  let current = walker.nextNode()
  let sawText = false
  while (current) {
    const text = current as Text
    if (text.parentElement?.closest(".line-number, .page-gap, .object-band")) {
      current = walker.nextNode()
      continue
    }
    if (text.data.length > 0) {
      sawText = true
      const range = document.createRange()
      range.selectNodeContents(text)
      for (const rect of range.getClientRects()) {
        if (rect.width >= 1 && rect.height >= 1) {
          rects.push(rect)
        }
      }
    }
    current = walker.nextNode()
  }
  if (!sawText) {
    const rect = dom.getBoundingClientRect()
    return rect.height >= 1 ? [rect] : []
  }
  rects.sort((a, b) => (Math.abs(a.left - b.left) > 24 ? a.left - b.left : a.top - b.top))
  const unique: DOMRect[] = []
  for (const rect of rects) {
    const previous = unique[unique.length - 1]
    if (previous && Math.abs(rect.top - previous.top) < 2 && Math.abs(rect.left - previous.left) < 8) {
      continue
    }
    unique.push(rect)
  }
  return unique
}

/** The page gap between two rows of a table: an empty row as tall as the gap, across every column. */
function createRowGap(height: number, columns: number) {
  const row = document.createElement("tr")
  row.className = "page-gap page-gap-row"
  row.contentEditable = "false"
  const cell = document.createElement("td")
  cell.colSpan = Math.max(1, columns)
  cell.style.height = `${height}px`
  row.append(cell)
  return row
}

/** A copy of the table's first row, drawn at the top of each page the table continues on (Repeat as header row). */
function repeatedHeader(view: EditorView, tablePos: number) {
  const dom = view.nodeDOM(tablePos)
  const first =
    dom instanceof HTMLElement
      ? [...dom.querySelectorAll<HTMLTableRowElement>("tr")].find((row) => !row.classList.contains("page-gap"))
      : undefined
  const copy = (first?.cloneNode(true) as HTMLTableRowElement | undefined) ?? document.createElement("tr")
  copy.classList.add("page-gap", "page-gap-header")
  copy.contentEditable = "false"
  copy.querySelectorAll("[contenteditable]").forEach((element) => element.setAttribute("contenteditable", "false"))
  return copy
}

function createGap(height: number, manual: boolean) {
  const gap = document.createElement("span")
  gap.className = manual ? "page-gap page-gap-manual" : "page-gap"
  gap.style.height = `${height}px`
  gap.contentEditable = "false"
  return gap
}

type Layout = {
  /** Paragraphs with mirrored indents and the page each starts on (22.8). */
  mirrors: { pos: number; node: ProseNode; page: number }[]
  breaks: PageBreak[]
  bands: FlowBand[]
  /** Where each object that moves with text lands: its paragraph's place plus its offset. */
  placements: { pos: number; page: number; y: number }[]
  /** Where each table that text wraps around lands (Around, 22.10). */
  tables: TablePlacement[]
  /** Changes when the floats text wraps beside change, which reshapes the lines after them. */
  sideKey: string
  lastUsed: number
  contentHeight: number
  pageCount: number
  signature: string
  layoutMs: number
  measureCount: number
  cacheHits: number
}

type TablePlacement = {
  pos: number
  page: number
  x: number
  y: number
  /** Too tall for the rest of its page: laid out in the text at its place across, to break between rows. */
  flow?: boolean
}

type FlowBand = {
  pos: number
  height: number
  /** Text wraps beside the object: a float, `offset` below the line it starts on, instead of a full-width band. */
  side?: { float: "left" | "right"; width: number; offset: number; shape?: string }
}

/** An object the text makes room for, at its place on a page. */
type PendingBand = {
  page: number
  y: number
  height: number
  placed: boolean
  side?: { float: "left" | "right"; width: number; shape?: string }
}

/** Whether a block of `total` height that cannot be split would run off the page, though it fits one by itself. */
export function mustMoveToNextPage(used: number, total: number, contentHeight: number) {
  return used > 0 && used + total > contentHeight + 1 && total <= contentHeight
}

function layoutPages(view: EditorView, measureCache: Map<number, MeasureCacheEntry>, dirtyFrom: number): Layout | null {
  const started = performance.now()
  for (const key of measureCache.keys()) {
    if (key >= dirtyFrom) {
      measureCache.delete(key)
    }
  }

  const metrics = pageMetrics(useDocumentStore.getState().pageSetup)
  const contentHeight = metrics.contentHeight
  const columnCount = metricsColumns()
  const breaks: PageBreak[] = []
  const bands: FlowBand[] = []
  const contentWidth = metrics.width - metrics.marginLeft - metrics.marginRight
  const pending = collectBands(view, contentHeight, contentWidth)
  const placements: { pos: number; page: number; y: number }[] = []
  const tables: TablePlacement[] = []
  // Tables placed on the page or margin take their room before the text above their paragraph is laid out; the
  // page is the one the last layout found for them (a change lays the pages out again).
  // The floating tables on each page so far, which one that may not overlap them moves down past.
  const floats = new Map<number, FloatRect[]>()
  const onPage = (page: number) => floats.get(page) ?? floats.set(page, []).get(page)!
  const fixedPlaces = new Map<number, { x: number; y: number }>()
  view.state.doc.forEach((node, pos) => {
    const float = node.type.name === "table" ? parseFloatValue(node.attrs.float) : null
    if (!float || float.vFrom === "paragraph") {
      return
    }
    const table = floatingTableElement(view, pos)
    const page = Number(table?.dataset.floatPage) || 1
    const band = table ? tableBand(table, float, page, 0, metrics, onPage(page)) : null
    if (band) {
      pending.push(band.band)
      fixedPlaces.set(pos, { x: band.x, y: band.y })
    }
  })
  pending.sort((a, b) => a.page - b.page || a.y - b.y)
  const mirrors: Layout["mirrors"] = []
  const seen = new Set<number>()
  let used = 0
  // The bottom margin of the last block placed: the next block's top margin collapses into it.
  let trailing = 0
  let column = 0
  let ready = true
  let measureCount = 0
  let cacheHits = 0

  // Web Layout has no pages, so no break, manual or not, ends one.
  const web = useViewStore.getState().layoutMode === "web"
  const pushBreak = (pos: number, manual: boolean) => {
    if (web) {
      return
    }
    column = 0
    if (breaks.some((item) => item.pos === pos)) {
      used = 0
      return
    }
    const fill = Math.max(0, contentHeight - used)
    breaks.push({
      pos,
      height: Math.ceil(fill + PAGE_GAP + metrics.marginTop + metrics.marginBottom),
      manual,
      labelTop: Math.round(fill + metrics.marginBottom + PAGE_GAP / 2),
    })
    used = 0
  }

  const overflow = (pos: number) => {
    if (column + 1 < columnCount) {
      column += 1
      used = 0
      return
    }
    pushBreak(pos, false)
  }

  const reserveBands = (pos: number, height: number) => {
    const page = breaks.length + 1
    for (const band of pending) {
      if (band.placed || band.page !== page) {
        continue
      }
      const bandEnd = band.y + band.height
      if (used >= bandEnd || used + height <= band.y) {
        continue
      }
      if (band.side) {
        // Beside the text: a float from the line the object starts on, which takes no height of its own.
        const offset = Math.max(0, Math.round(band.y - used))
        const reach = Math.round(bandEnd - Math.max(used, band.y))
        bands.push({ pos, height: reach, side: { ...band.side, offset } })
        band.placed = true
        continue
      }
      const reserve = Math.max(0, band.y - used) + band.height
      if (reserve <= 0) {
        band.placed = true
        continue
      }
      bands.push({ pos, height: Math.round(reserve) })
      used += reserve
      band.placed = true
      if (used > contentHeight + 1) {
        overflow(pos)
      }
    }
  }

  /** `collapse` is how much of `height` is a top margin shared with the block above; a page's first block keeps it. */
  const place = (pos: number, height: number, collapse = 0) => {
    if (height <= 0) {
      return
    }
    reserveBands(pos, height)
    let size = used > 0 ? height - collapse : height
    if (used > 0 && used + size > contentHeight + 1) {
      overflow(pos)
      reserveBands(pos, height)
      size = height
    }
    used += size
  }

  /** Whether a block would run past the end of the page from where the text has got to. */
  const overruns = (height: number, top: number) =>
    !web && (used > 0 ? used + height - Math.min(trailing, top) : height) > contentHeight + 1

  const placeBlock = (pos: number, height: number, top: number, bottom: number) => {
    place(pos, height, Math.min(trailing, top))
    trailing = bottom
  }

  const placeLines = (
    lines: { pos: number; height: number }[],
    pos: number,
    top: number,
    bottom: number,
    widowControl = false,
  ) => {
    // Widow/orphan control (22.8): where the page end would leave one line alone, the break moves to keep two. Only
    // when the lines land as predicted (no band or column change in between), or the extra break would be wrong.
    let forced = -1
    if (widowControl && lines.length > 1) {
      const heights = lines.map((line, index) =>
        index === 0 && used > 0 ? line.height - Math.min(trailing, top) : line.height,
      )
      const fitting = linesOnPage(heights, used, contentHeight, false)
      const wanted = linesOnPage(heights, used, contentHeight, true)
      if (wanted < fitting && wanted < lines.length && !(wanted === 0 && used === 0)) {
        forced = wanted
      }
    }
    const startBreaks = breaks.length
    const startColumn = column
    lines.forEach((line, index) => {
      if (index === forced && breaks.length === startBreaks && column === startColumn) {
        overflow(index === 0 ? pos : line.pos)
        trailing = 0
        reserveBands(index === 0 ? pos : line.pos, line.height)
      }
      place(index === 0 ? pos : line.pos, line.height, index === 0 ? Math.min(trailing, top) : 0)
      trailing = 0
    })
    trailing = bottom
  }

  /**
   * A table taller than the room left on the page goes on row by row, as Word breaks it: a row that does not fit
   * starts the next page (after the header row again, if the table repeats it). Rows a merged cell spans stay
   * together, and a row taller than a page is not split.
   */
  const placeRows = (
    rows: { pos: number; height: number }[],
    pos: number,
    top: number,
    bottom: number,
    header: number,
  ) => {
    rows.forEach((row, index) => {
      const pages = breaks.length
      const height = row.height + (index === 0 ? top : 0) + (index === rows.length - 1 ? bottom : 0)
      place(index === 0 ? pos : row.pos, height, index === 0 ? Math.min(trailing, top) : 0)
      trailing = 0
      const turned = breaks[breaks.length - 1]
      if (index > 0 && header > 0 && breaks.length > pages && turned?.pos === row.pos) {
        turned.header = true
        used += header
      }
    })
    trailing = bottom
  }

  /** Adds a split container's top or bottom edge, collapsing its margin with the neighbouring one as CSS does. */
  const placeEdge = (style: CSSStyleDeclaration, edge: "top" | "bottom") => {
    const margin = Math.max(0, parseFloat(style.getPropertyValue(`margin-${edge}`)) || 0)
    const inset =
      (parseFloat(style.getPropertyValue(`padding-${edge}`)) || 0) +
      (parseFloat(style.getPropertyValue(`border-${edge}-width`)) || 0)
    used += boxEdge(style, edge) - (used > 0 ? Math.min(trailing, margin) : 0)
    trailing = inset > 0 ? (edge === "top" ? 0 : margin) : Math.max(trailing, margin)
  }

  const cached = (pos: number, node: ProseNode) => {
    if (pos + node.nodeSize > dirtyFrom) {
      return null
    }
    const hit = measureCache.get(pos)
    if (!hit || !hit.node.eq(node)) {
      return null
    }
    cacheHits += 1
    seen.add(pos)
    return hit
  }

  const remember = (pos: number, entry: MeasureCacheEntry) => {
    measureCache.set(pos, entry)
    seen.add(pos)
    measureCount += 1
  }

  /** "Keep lines together" (22.8): a paragraph that would be split by the page end moves whole to the next page. */
  const keepLinesTogether = (node: ProseNode, pos: number, lines: { height: number }[]) => {
    if (node.attrs.keepLines !== true) {
      return
    }
    const total = lines.reduce((sum, line) => sum + line.height, 0)
    if (mustMoveToNextPage(used, total, contentHeight)) {
      overflow(pos)
      trailing = 0
    }
  }

  /**
   * "Keep with next" (22.8): the paragraph moves to the next page when the start of what follows would not fit under
   * it. `following` is the height the next blocks need (their first lines, or all of a block kept with its own next).
   */
  const keepWithNext = (node: ProseNode, pos: number, lines: { height: number }[], following: () => number) => {
    if (node.attrs.keepNext !== true) {
      return
    }
    const own = lines.reduce((sum, line) => sum + line.height, 0)
    if (used > 0 && keepWithNextMustMove(used, own, following(), contentHeight)) {
      overflow(pos)
      trailing = 0
    }
  }

  /** The height the blocks after child `index` of `parent` need to start on the page: see `keepWithNext`. */
  const followingNeed = (parent: ProseNode, index: number, base: number, depth = 0): number => {
    if (index + 1 >= parent.childCount || depth > 8) {
      return 0
    }
    let offset = base
    for (let at = 0; at <= index; at += 1) {
      offset += parent.child(at).nodeSize
    }
    const next = parent.child(index + 1)
    const dom = view.nodeDOM(offset)
    if (!(dom instanceof HTMLElement) || isFloating(next) || !next.isBlock) {
      return 0
    }
    if (!next.isTextblock) {
      return next.type.name === "pageBreak" || next.type.name === "sectionBreak" ? 0 : outerHeight(dom)
    }
    const lines = measureLines(view, dom)
    if (lines.length === 0) {
      return outerHeight(dom)
    }
    const heights = lines.map((line) => line.height)
    if (next.attrs.keepNext === true) {
      return heights.reduce((sum, height) => sum + height, 0) + followingNeed(parent, index + 1, base, depth + 1)
    }
    // Word keeps two lines of the next paragraph with it, one when widow control is off or it has only one.
    const take = next.attrs.widowControl === false ? 1 : 2
    return heights.slice(0, take).reduce((sum, height) => sum + height, 0)
  }

  const visit = (node: ProseNode, pos: number, following: () => number = () => 0) => {
    if (node.type.name === "sectionBreak") {
      const kind = String(node.attrs.kind || "nextPage")
      if (kind === "continuous") {
        place(pos, 12)
        trailing = 0
      } else {
        // As in Word, the break mark stays at the end of the page it ends; the next page starts after it.
        pushBreak(pos + node.nodeSize, true)
      }
      return
    }
    if (node.type.name === "pageBreak") {
      pushBreak(pos + node.nodeSize, true)
      return
    }
    if (node.type.name === "columnBreak") {
      if (columnCount > 1 && column + 1 < columnCount) {
        column += 1
        used = 0
      } else {
        pushBreak(pos + node.nodeSize, true)
      }
      return
    }

    if (node.type.name === "blankPage") {
      if (web) {
        return
      }
      if (used > 0 || column > 0) {
        pushBreak(pos, false)
      }
      used = contentHeight
      column = columnCount - 1
      return
    }

    const float = node.type.name === "table" ? parseFloatValue(node.attrs.float) : null
    if (float) {
      // A table text wraps around takes no room in the flow either: it lands at its paragraph (the next block) plus
      // its offset, or at its place on this page, and the text makes room beside it.
      const table = floatingTableElement(view, pos)
      if (!table) {
        ready = false
        return
      }
      const page = breaks.length + 1
      const fixed = fixedPlaces.get(pos)
      const laid = fixed ? { ...fixed, band: null } : tableBand(table, float, page, used, metrics, onPage(page))
      // One that moves with its paragraph but would run past the end of the page goes into the text there and
      // breaks between its rows like any table (Word keeps text beside its first part; here it goes above and below).
      const rows =
        float.vFrom === "paragraph" && laid.y + outerHeight(table) > contentHeight + 1
          ? tableRows(node, pos, table, outerHeight(table))
          : null
      if (rows) {
        tables.push({ pos, page, x: laid.x, y: laid.y, flow: true })
        measureCount += 1
        placeRows(rows.units, pos, 0, 0, node.attrs.headerRow === true ? rows.header : 0)
        return
      }
      tables.push({ pos, page, x: laid.x, y: laid.y })
      if (laid.band) {
        pending.push(laid.band)
      }
      return
    }

    if (isFloating(node)) {
      // A floating object takes no room in the flow. One that moves with text lands at its anchor, the paragraph
      // that follows it, plus its offset; the text then makes room for it from there.
      if (objectAnchoring(node.attrs.anchoring) === "move") {
        const page = breaks.length + 1
        // `used` already holds the bottom margin of the block above, which the next block's top margin collapses into.
        const from = node.attrs.relative === "margin" ? 0 : used
        const y = Math.max(0, Math.min(contentHeight - 8, Math.round(from + (Number(node.attrs.dy) || 0))))
        placements.push({ pos, page, y })
        const band = bandFor(view, node, pos, page, y, contentHeight, contentWidth)
        if (band) {
          pending.push(band)
        }
      }
      return
    }

    if (node.isTextblock && node.attrs.mirrorIndents === true) {
      mirrors.push({ pos, node, page: breaks.length + 1 })
    }

    // "Page break before" (22.8): the paragraph starts a page of its own, unless it already is at the top of one.
    if (node.isTextblock && node.attrs.pageBreakBefore === true && (used > 0 || column > 0)) {
      pushBreak(pos, true)
      trailing = 0
    }

    const hit = cached(pos, node)
    if (hit?.kind === "text") {
      keepLinesTogether(node, pos, hit.lines)
      keepWithNext(node, pos, hit.lines, following)
      placeLines(hit.lines, pos, hit.top, hit.bottom, node.attrs.widowControl !== false)
      return
    }
    // A table that no longer fits where it now starts is measured again, row by row.
    if (hit?.kind === "block" && !(node.type.name === "table" && overruns(hit.height, hit.top))) {
      placeBlock(pos, hit.height, hit.top, hit.bottom)
      return
    }

    const dom = view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement)) {
      ready = false
      return
    }

    if (isContainer(node)) {
      if (containsPageBreak(node)) {
        const style = getComputedStyle(dom)
        placeEdge(style, "top")
        node.forEach((child, offset, index) =>
          visit(child, pos + 1 + offset, () => followingNeed(node, index, pos + 1)),
        )
        placeEdge(style, "bottom")
        return
      }

      const height = outerHeight(dom)
      const top = edgeMargin(dom, "top")
      const bottom = edgeMargin(dom, "bottom")
      const fitsPage = height <= contentHeight
      // Only cache whole-container heights when the block stays intact on one page.
      if (fitsPage) {
        remember(pos, { kind: "block", node, height, top, bottom })
        placeBlock(pos, height, top, bottom)
        return
      }
      measureCount += 1
      if (used > 0) {
        overflow(pos)
      }

      const style = getComputedStyle(dom)
      placeEdge(style, "top")
      node.forEach((child, offset, index) => visit(child, pos + 1 + offset, () => followingNeed(node, index, pos + 1)))
      placeEdge(style, "bottom")
      return
    }

    if (node.isTextblock) {
      const lines = measureLines(view, dom)
      if (lines.length === 0) {
        const height = outerHeight(dom)
        const top = edgeMargin(dom, "top")
        const bottom = edgeMargin(dom, "bottom")
        remember(pos, { kind: "block", node, height, top, bottom })
        placeBlock(pos, height, top, bottom)
        return
      }
      const style = getComputedStyle(dom)
      const top = Math.max(0, parseFloat(style.marginTop) || 0)
      const bottom = Math.max(0, parseFloat(style.marginBottom) || 0)
      lines[0].height += top
      lines[lines.length - 1].height += bottom
      remember(pos, { kind: "text", node, lines, top, bottom })
      keepLinesTogether(node, pos, lines)
      keepWithNext(node, pos, lines, following)
      placeLines(lines, pos, top, bottom, node.attrs.widowControl !== false)
      return
    }

    const height = outerHeight(dom)
    const top = edgeMargin(dom, "top")
    const bottom = edgeMargin(dom, "bottom")
    remember(pos, { kind: "block", node, height, top, bottom })
    if (node.type.name === "table" && overruns(height, top)) {
      const rows = tableRows(node, pos, dom, height - top - bottom)
      if (rows) {
        measureCount += 1
        placeRows(rows.units, pos, top, bottom, node.attrs.headerRow === true ? rows.header : 0)
        return
      }
    }
    placeBlock(pos, height, top, bottom)
  }

  view.state.doc.forEach((node, offset, index) => visit(node, offset, () => followingNeed(view.state.doc, index, 0)))
  if (!ready) {
    return null
  }

  for (const key of measureCache.keys()) {
    if (!seen.has(key)) {
      measureCache.delete(key)
    }
  }

  const lastUsed = Math.min(Math.max(used, 0), contentHeight)
  const sideKey = bands
    .filter((band) => band.side)
    .map(
      (band) =>
        `${band.pos}:${band.height}:${band.side?.float}:${band.side?.width}:${band.side?.offset}:${band.side?.shape ?? ""}`,
    )
    .join(",")
  return {
    mirrors,
    breaks,
    bands,
    placements,
    tables,
    sideKey,
    lastUsed,
    contentHeight,
    pageCount: breaks.length + 1,
    layoutMs: performance.now() - started,
    measureCount,
    cacheHits,
    signature: [
      breaks.map((item) => `${item.pos}:${item.height}:${item.manual ? 1 : 0}:${item.header ? 1 : 0}`).join(","),
      bands.map((item) => `${item.pos}:${item.height}`).join(","),
      sideKey,
      placements.map((item) => `${item.pos}:${item.page}:${item.y}`).join(","),
      tables.map((item) => `${item.pos}:${item.page}:${item.x}:${item.y}:${item.flow ? 1 : 0}`).join(","),
      mirrors.map((item) => `${item.pos}:${item.page % 2}`).join(","),
      columnCount,
      useDocumentStore.getState().pageSetup.columnGap,
      `${Math.round(metrics.marginTop)}:${Math.round(metrics.marginBottom)}`,
    ].join("|"),
  }
}

function metricsColumns() {
  if (useViewStore.getState().layoutMode === "web") {
    return 1
  }
  const count = useDocumentStore.getState().pageSetup.columns
  return count === 2 || count === 3 ? count : 1
}

/** Pure helper for tests/profiling: page count for a sequence of block heights. */
export function pageCountForBlockHeights(heights: number[], contentHeight: number, columns = 1) {
  const columnCount = columns === 2 || columns === 3 ? columns : 1
  let used = 0
  let column = 0
  let breaks = 0
  for (const height of heights) {
    if (height <= 0) {
      continue
    }
    if (used > 0 && used + height > contentHeight + 1) {
      if (column + 1 < columnCount) {
        column += 1
        used = 0
      } else {
        breaks += 1
        column = 0
        used = 0
      }
    }
    used += height
  }
  return breaks + 1
}

/** Objects fixed on their page that text makes room for. Those that move with text are added as they are reached. */
function collectBands(view: EditorView, contentHeight: number, contentWidth: number) {
  const bands: PendingBand[] = []
  view.state.doc.descendants((node, pos) => {
    if (!isFloating(node) || objectAnchoring(node.attrs.anchoring) === "move") {
      return
    }
    const band = bandFor(
      view,
      node,
      pos,
      Number(node.attrs.page) || 1,
      Number(node.attrs.y) || 0,
      contentHeight,
      contentWidth,
    )
    if (band) {
      bands.push(band)
    }
  })
  bands.sort((a, b) => a.page - b.page || a.y - b.y)
  return bands
}

/** The room text leaves for a floating object: all the width (Top and Bottom), or beside it on its roomier side. */
function bandFor(
  view: EditorView,
  node: ProseNode,
  pos: number,
  page: number,
  top: number,
  contentHeight: number,
  contentWidth: number,
): PendingBand | null {
  const wrap = objectWrap(node.attrs.wrap)
  if (wrap !== "topBottom" && !wrapsBeside(wrap)) {
    return null
  }
  const dom = view.nodeDOM(pos)
  const fallback = node.type.name === "textBox" ? 72 : 80
  const uprightHeight = dom instanceof HTMLElement ? Math.max(24, dom.offsetHeight) : fallback
  const uprightWidth = dom instanceof HTMLElement ? Math.max(24, dom.offsetWidth) : Number(node.attrs.width) || 120
  // A turned object takes the room of the upright box around it.
  const turned = rotatedBounds(uprightWidth, uprightHeight, Number(node.attrs.rotate) || 0)
  const objectHeight = turned.height
  const objectWidth = turned.width
  const gaps = wrapGaps(node)
  const y = Math.max(0, Math.min(contentHeight - 8, top + turned.dy - gaps.top))
  const height = Math.min(objectHeight + gaps.top + gaps.bottom, contentHeight - y)
  if (wrap === "topBottom") {
    return { page: Math.max(1, page), y, height: Math.round(height), placed: false }
  }
  const x = (Number(node.attrs.x) || 0) + turned.dx
  const leftRoom = x
  const rightRoom = contentWidth - x - objectWidth
  // Text on the right of the object (the room floats left) or on its left. Word's "Both sides" needs text on
  // either side of one object, which the page's line boxes can't do; it flows on the roomier side, as "Largest only".
  const side = wrapSide(node.attrs.wrapSide)
  const textRight = side === "right" || (side !== "left" && rightRoom >= leftRoom)
  const band = textRight
    ? { float: "left" as const, width: Math.max(0, Math.round(x + objectWidth + gaps.right)) }
    : { float: "right" as const, width: Math.max(0, Math.round(contentWidth - x + gaps.left)) }
  const rows = wrap !== "square" && !(Number(node.attrs.rotate) || 0) ? contourOf(node) : null
  const shape = rows
    ? contourPolygon(rows, {
        float: band.float,
        objectWidth,
        objectHeight,
        roomWidth: band.width,
        gaps,
      })
    : undefined
  return { page: Math.max(1, page), y, height: Math.round(height), placed: false, side: { ...band, shape } }
}

function floatingTableElement(view: EditorView, pos: number) {
  const dom = view.nodeDOM(pos)
  const table = dom instanceof HTMLElement ? (dom.matches("table") ? dom : dom.querySelector("table")) : null
  return table instanceof HTMLElement ? table : null
}

/** Where a table text wraps around lands on `page`, and the room the text leaves beside it. */
function tableBand(
  table: HTMLElement,
  float: NonNullable<ReturnType<typeof parseFloatValue>>,
  page: number,
  used: number,
  metrics: PageMetrics,
  others: FloatRect[],
) {
  const frame: FloatFrame = {
    ...metrics,
    pageWidth: metrics.width,
    pageHeight: metrics.height,
    page,
    paragraphTop: used,
  }
  const width = table.offsetWidth
  const height = table.offsetHeight
  const place = floatPlace(float, width, height, frame)
  const { x } = place
  const y = float.overlap ? place.y : clearOfFloats(others, { x, y: place.y, width, height })
  others.push({ x, y, width, height })
  const contentWidth = metrics.width - metrics.marginLeft - metrics.marginRight
  const top = y - float.gaps.top * PX_PER_CM
  const from = Math.max(0, Math.min(metrics.contentHeight - 8, top))
  const reach = Math.min(y + height + float.gaps.bottom * PX_PER_CM, metrics.contentHeight) - from
  const band: PendingBand = {
    page,
    y: Math.round(from),
    height: Math.max(0, Math.round(reach)),
    placed: false,
    side: floatSide(x, width, float.gaps, contentWidth),
  }
  return { x, y, band }
}

/** Draws each table text wraps around at the place the layout found for it (see `drawTableFloat`). */
function placeFloatingTables(view: EditorView, tables: TablePlacement[], metrics: PageMetrics) {
  for (const placed of tables) {
    const table = floatingTableElement(view, placed.pos)
    if (!table) {
      continue
    }
    if (placed.flow) {
      table.dataset.floatFlow = "1"
      table.style.position = ""
      table.style.left = ""
      table.style.top = ""
      table.style.marginLeft = `${Math.max(0, placed.x)}px`
      continue
    }
    if (table.dataset.floatFlow) {
      delete table.dataset.floatFlow
      table.style.position = "absolute"
      table.style.marginLeft = ""
    }
    table.dataset.floatPage = String(placed.page)
    table.dataset.floatLeft = String(Math.round(objectLeft(placed.page, placed.x, metrics)))
    table.dataset.floatTop = String(Math.round(objectTop(placed.page, placed.y, metrics)))
    table.style.left = `${table.dataset.floatLeft}px`
    table.style.top = `${table.dataset.floatTop}px`
  }
}

/**
 * A table's rows as the pieces a page may end between, with their heights in pixels (a row a merged cell spans
 * into stays with the row above), and the height of the first row, which a table repeating its header draws again.
 * Null when there is only one piece.
 */
function tableRows(node: ProseNode, pos: number, dom: HTMLElement, inner: number) {
  const table = dom.matches("table") ? dom : dom.querySelector("table")
  if (!table) {
    return null
  }
  const shown = [...table.querySelectorAll<HTMLTableRowElement>("tr")].filter(
    (row) => !row.classList.contains("page-gap") && row.closest("table") === table,
  )
  if (shown.length !== node.childCount) {
    return null
  }
  // Each row's top inside the table, leaving out the page gaps a previous layout put between the rows.
  let gaps = 0
  const tops: number[] = []
  for (const row of table.querySelectorAll<HTMLTableRowElement>("tr")) {
    if (row.closest("table") !== table) {
      continue
    }
    if (row.classList.contains("page-gap")) {
      gaps += row.offsetHeight
      continue
    }
    tops.push(row.offsetTop - gaps)
  }
  const ends = [...tops.slice(1), Math.max(tops[tops.length - 1]!, inner)]
  const units: { pos: number; height: number }[] = []
  let spanned = 0
  node.forEach((row, offset, index) => {
    const height = Math.max(0, ends[index]! - tops[index]!)
    if (index > 0 && index <= spanned) {
      units[units.length - 1]!.height += height
    } else {
      units.push({ pos: pos + 1 + offset, height })
    }
    row.forEach((cell) => {
      spanned = Math.max(spanned, index + Math.max(1, Number(cell.attrs.rowspan) || 1) - 1)
    })
  })
  // Anything in the table above its first row (a border, a caption) goes with the first piece.
  if (units[0]) {
    units[0].height += Math.max(0, inner - (ends[ends.length - 1]! - tops[0]!))
  }
  return units.length > 1 ? { units, header: Math.max(0, (ends[0] ?? 0) - (tops[0] ?? 0)) } : null
}

function containsPageBreak(node: ProseNode) {
  let found = false
  node.descendants((child) => {
    if (child.type.name === "pageBreak" || child.type.name === "blankPage" || child.type.name === "sectionBreak") {
      found = true
      return false
    }
  })
  return found
}

function isContainer(node: ProseNode) {
  return (
    node.type.name === "bulletList" ||
    node.type.name === "orderedList" ||
    node.type.name === "blockquote" ||
    node.type.name === "listItem"
  )
}

/** The block's height with its outer margins, which include any child margins that collapse through its edges. */
function outerHeight(dom: HTMLElement) {
  let gaps = 0
  dom.querySelectorAll(".page-gap, .object-band").forEach((gap) => {
    gaps += (gap as HTMLElement).offsetHeight
  })
  return Math.max(0, dom.offsetHeight - gaps + edgeMargin(dom, "top") + edgeMargin(dom, "bottom"))
}

/**
 * The margin showing beyond a block's edge. As in CSS, a first or last child's margin collapses through an edge
 * with no padding or border (a list's last paragraph's spacing ends up below the list), so it counts as the
 * block's own; `offsetHeight` leaves it out.
 */
function edgeMargin(dom: HTMLElement, edge: "top" | "bottom"): number {
  const style = getComputedStyle(dom)
  const own = Math.max(0, parseFloat(style.getPropertyValue(`margin-${edge}`)) || 0)
  const sealed =
    (parseFloat(style.getPropertyValue(`padding-${edge}`)) || 0) > 0 ||
    (parseFloat(style.getPropertyValue(`border-${edge}-width`)) || 0) > 0 ||
    !collapsesThrough(style)
  if (
    sealed ||
    Array.from(dom.childNodes).some((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())
  ) {
    return own
  }
  const children = Array.from(dom.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      !child.matches(".page-gap, .object-band") &&
      !["absolute", "fixed"].includes(getComputedStyle(child).position),
  )
  const child = edge === "top" ? children[0] : children[children.length - 1]
  if (!child || !collapsesThrough(getComputedStyle(child))) {
    return own
  }
  return Math.max(own, edgeMargin(child, edge))
}

/** Whether a block lets its children's margins collapse through it (it does not start its own formatting context). */
function collapsesThrough(style: CSSStyleDeclaration) {
  return (
    (style.display === "block" || style.display === "list-item") &&
    style.overflow === "visible" &&
    style.float === "none" &&
    style.position !== "absolute" &&
    style.position !== "fixed"
  )
}

function boxEdge(style: CSSStyleDeclaration, edge: "top" | "bottom") {
  const margin = parseFloat(style.getPropertyValue(`margin-${edge}`)) || 0
  const padding = parseFloat(style.getPropertyValue(`padding-${edge}`)) || 0
  return margin + padding
}

function measureLines(view: EditorView, dom: HTMLElement) {
  const zoom = zoomOf(dom)
  const found: { pos: number; top: number; height: number }[] = []
  const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()
  while (current) {
    const text = current as Text
    if (text.parentElement?.closest(".line-number, .object-band")) {
      current = walker.nextNode()
      continue
    }
    for (const index of lineStarts(text)) {
      const rect = charRect(text, index)
      if (!rect) {
        continue
      }
      const pos = view.posAtDOM(text, index)
      if (pos < 0) {
        continue
      }
      found.push({ pos, top: rect.top, height: rect.height / zoom })
    }
    current = walker.nextNode()
  }

  found.sort((a, b) => a.top - b.top || a.pos - b.pos)
  const lines: { pos: number; height: number }[] = []
  for (const line of found) {
    const previous = lines[lines.length - 1]
    const previousFound = previous ? found.find((item) => item.pos === previous.pos) : undefined
    if (previousFound && (line.top - previousFound.top) / zoom < 1) {
      continue
    }
    if (previous && previousFound) {
      const between = gapBetween(dom, previousFound.top, line.top)
      previous.height = Math.max(1, (line.top - previousFound.top) / zoom - between)
    }
    lines.push({ pos: line.pos, height: line.height })
  }

  const last = lines[lines.length - 1]
  const step = lineStep(dom)
  if (last && step > 0) {
    last.height = Math.max(last.height, step)
  }
  return lines
}

function lineStarts(text: Text) {
  const starts: number[] = []
  let index = 0
  while (index < text.length) {
    const origin = charRect(text, index)
    if (!origin) {
      index += 1
      continue
    }
    starts.push(index)
    const next = nextLineIndex(text, index, origin.top)
    if (next === null || next <= index) {
      break
    }
    index = next
  }
  return starts
}

function nextLineIndex(text: Text, from: number, originTop: number) {
  const end = charRect(text, text.length - 1)
  if (!end || end.top <= originTop + 1) {
    return null
  }

  let lo = from + 1
  let hi = text.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const rect = charRect(text, mid)
    if (rect && rect.top > originTop + 1) {
      hi = mid
    } else {
      lo = mid + 1
    }
  }
  return lo
}

function charRect(text: Text, index: number) {
  const range = document.createRange()
  const end = Math.min(text.length, index + 1)
  if (end <= index) {
    return null
  }
  range.setStart(text, index)
  range.setEnd(text, end)
  const rect = range.getClientRects()[0]
  if (!rect || rect.height <= 0) {
    return null
  }
  return rect
}

function gapBetween(dom: HTMLElement, top: number, bottom: number) {
  let total = 0
  dom.querySelectorAll(".page-gap").forEach((gap) => {
    const rect = gap.getBoundingClientRect()
    if (rect.top >= top - 1 && rect.top < bottom - 1) {
      total += (gap as HTMLElement).offsetHeight
    }
  })
  return total
}

function zoomOf(dom: HTMLElement) {
  if (dom.offsetHeight <= 0) {
    return 1
  }
  const zoom = dom.getBoundingClientRect().height / dom.offsetHeight
  return zoom > 0.2 && zoom < 5 ? zoom : 1
}

function lineStep(dom: HTMLElement) {
  const parsed = parseFloat(getComputedStyle(dom).lineHeight)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}
