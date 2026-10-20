import { INDENT_STEP_PX, clampIndent } from "@/editor/indent"
import {
  addTabStop,
  clampTabPosition,
  moveTabStop,
  parseTabStops,
  removeTabStop,
  type TabAlign,
  type TabStop,
} from "@/editor/tab-stops"
import {
  PX_PER_CM,
  PX_PER_MM,
  RULER_SIZE,
  buildRulerTicks,
  formatLength,
  measureSystemFor,
  readLocale,
  type RulerTick,
} from "@/document/measure"
import { pageGridColumns, pageGridRows } from "@/document/page-grid"
import { PAGE_GAP } from "@/editor/pages"
import { marginAlongEdge, pageMetrics, type PageMarginEdge, type PageMetrics } from "@/document/page-setup"
import { columnMarks, findColumnSection, gapFromBoundary, setColumnSectionGap } from "@/editor/columns"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { ZOOM_PREVIEW_EVENT } from "@/document/zoom-gesture"
import { useDocumentEditor } from "@/editor/document-editor"
import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react"

const TAB_ORDER: TabAlign[] = ["left", "center", "right", "decimal"]

const TAB_LABEL: Record<TabAlign, string> = {
  left: "Left tab",
  center: "Center tab",
  right: "Right tab",
  decimal: "Decimal tab",
}

type MarginEdge = "left" | "right" | "top" | "bottom"
type IndentPart = "first" | "hanging" | "left" | "right"

const MARGIN_KEY: Record<MarginEdge, PageMarginEdge> = {
  left: "marginLeft",
  right: "marginRight",
  top: "marginTop",
  bottom: "marginBottom",
}

type DragState = {
  id: string
  origin: number
  position: number
  align: TabAlign
  offsetY: number
  pullingOff: boolean
}

type IndentPreview = {
  firstPx: number
  hangPx: number
  rightPx: number
}

type DocumentRulersProps = {
  children: ReactNode
}

/** The page sheet holding the cursor, or the first page when the cursor is not on screen. */
function cursorSheet(scroll: HTMLElement, editor: Editor | null | undefined) {
  const sheets = Array.from(scroll.querySelectorAll<HTMLElement>(".page-canvas > .page-sheet"))
  if (!editor || sheets.length < 2) {
    return sheets[0] ?? null
  }
  let point: { left: number; top: number }
  try {
    point = editor.view.coordsAtPos(editor.state.selection.head)
  } catch {
    return sheets[0]
  }
  const hit = sheets.find((sheet) => {
    const rect = sheet.getBoundingClientRect()
    return point.left >= rect.left && point.left <= rect.right && point.top >= rect.top && point.top <= rect.bottom
  })
  return hit ?? sheets[0]
}

export function DocumentRulers({ children }: DocumentRulersProps) {
  const editor = useDocumentEditor()
  const zoom = useViewStore((state) => state.zoom)
  const pageView = useViewStore((state) => state.pageView)
  const showRuler = useViewStore((state) => state.showRuler)
  const pageSetup = useDocumentStore((state) => state.pageSetup)
  const metrics = pageMetrics(pageSetup)
  const pageCount =
    useEditorState({
      editor,
      selector: ({ editor: current }) => current?.storage.pagination?.pageCount ?? 1,
    }) ?? 1
  const [align, setAlign] = useState<TabAlign>("left")
  const [locale, setLocale] = useState(readLocale)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [indentPreview, setIndentPreview] = useState<IndentPreview | null>(null)
  const [sectionGapPreview, setSectionGapPreview] = useState<number | null>(null)
  const horizontalRef = useRef<HTMLDivElement>(null)
  const horizontalClipRef = useRef<HTMLDivElement>(null)
  const verticalRef = useRef<HTMLDivElement>(null)
  const verticalDockRef = useRef<HTMLDivElement>(null)
  const listeners = useRef<{ move: (event: MouseEvent) => void; up: (event: MouseEvent) => void } | null>(null)
  const zoomRef = useRef(zoom)
  const metricsRef = useRef(metrics)
  zoomRef.current = zoom
  metricsRef.current = metrics

  useEffect(() => {
    const update = () => setLocale(readLocale())
    window.addEventListener("languagechange", update)
    return () => window.removeEventListener("languagechange", update)
  }, [])

  useLayoutEffect(() => {
    if (!showRuler) {
      return
    }
    const scroll = document.getElementById("document-scroll")
    const horizontal = horizontalRef.current
    const clip = horizontalClipRef.current
    const vertical = verticalRef.current
    const dock = verticalDockRef.current
    if (!scroll || !horizontal || !clip || !vertical || !dock) {
      return
    }
    const update = () => {
      const page = scroll.querySelector(".page-zoom")
      if (!page) {
        return
      }
      const pageRect = page.getBoundingClientRect()
      // As in Word, with several pages across, the horizontal ruler sits over the page the cursor is on.
      const sheet = cursorSheet(scroll, editor)
      const left = sheet ? sheet.getBoundingClientRect().left : pageRect.left
      const x = Math.round(left - clip.getBoundingClientRect().left)
      const y = Math.round(pageRect.top - dock.getBoundingClientRect().top)
      // While a zoom gesture previews the page stretched (zoom-gesture.ts), the rulers stretch with it until the
      // zoom is set and they are drawn at it.
      const width = (page as HTMLElement).offsetWidth
      const stretch = width > 0 ? pageRect.width / width : 1
      const stretched = Math.abs(stretch - 1) >= 0.001
      // Moved directly rather than through React state: re-rendering both rulers on every scroll frame made
      // scrolling stutter.
      horizontal.style.transformOrigin = "0 0"
      vertical.style.transformOrigin = "0 0"
      horizontal.style.transform = `translateX(${x}px)${stretched ? ` scaleX(${stretch})` : ""}`
      vertical.style.transform = `translateY(${y}px)${stretched ? ` scaleY(${stretch})` : ""}`
    }
    update()
    editor?.on("selectionUpdate", update)
    editor?.on("update", update)
    scroll.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    window.addEventListener(ZOOM_PREVIEW_EVENT, update)
    const observer = new ResizeObserver(update)
    observer.observe(scroll)
    const page = scroll.querySelector(".page-zoom")
    if (page) {
      observer.observe(page)
    }
    return () => {
      editor?.off("selectionUpdate", update)
      editor?.off("update", update)
      scroll.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
      window.removeEventListener(ZOOM_PREVIEW_EVENT, update)
      observer.disconnect()
    }
  }, [editor, showRuler, zoom, pageCount, metrics.width, metrics.height, pageView])

  useEffect(() => {
    return () => {
      const active = listeners.current
      if (!active) {
        return
      }
      window.removeEventListener("mousemove", active.move)
      window.removeEventListener("mouseup", active.up)
      document.body.style.userSelect = ""
      document.body.style.cursor = ""
    }
  }, [])

  const sectionKey = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const found = current ? findColumnSection(current.state) : null
      return found ? `${found.pos}:${found.columns}:${found.gap}` : ""
    },
  })
  const selectionKey = useEditorState({
    editor,
    selector: ({ editor: current }) => rulerSelectionKey(current),
  })
  const selection = parseSelectionKey(selectionKey ?? "0|||")
  const indents = indentPreview ?? {
    firstPx: selection.firstPx,
    hangPx: selection.hangPx,
    rightPx: selection.rightPx,
  }
  const sectionParts = (sectionKey ?? "").split(":")
  const sectionColumns = sectionParts.length === 3 ? Number(sectionParts[1]) : 0
  const sectionGap = sectionParts.length === 3 ? Number(sectionParts[2]) : 0
  const columnCount = sectionColumns > 1 ? sectionColumns : pageSetup.columns
  const columnGap = sectionColumns > 1 ? (sectionGapPreview ?? sectionGap) : pageSetup.columnGap
  const contentPx = metrics.width - metrics.marginLeft - metrics.marginRight
  const columnsOnRuler = columnCount > 1 ? columnMarks(contentPx, columnCount, columnGap) : []
  const system = measureSystemFor(locale)
  const ticks = "metric" as const
  const pageWidth = metrics.width * zoom
  const rulerRows = pageGridColumns(pageView) > 1 ? pageGridRows(pageCount, pageView) : pageCount
  const trackHeight = (rulerRows * metrics.height + Math.max(0, rulerRows - 1) * PAGE_GAP) * zoom
  const stops = selection.stops.map((stop) =>
    drag && drag.id === stop.id ? { ...stop, position: drag.position } : stop,
  )
  const bodyIndentPx = Math.min(indents.firstPx, indents.hangPx)

  function onRulerMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || !editor || !horizontalRef.current) {
      return
    }
    if (
      (event.target as HTMLElement).closest(
        ".ruler-tab, .ruler-margin-handle, .ruler-column-handle, .ruler-indent-handle",
      )
    ) {
      return
    }
    const ruler = horizontalRef.current
    if (!inLowerHalf(event.nativeEvent, ruler)) {
      return
    }
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const chosen = align
    const place = (pointer: MouseEvent) => {
      window.removeEventListener("mouseup", place)
      if (Math.hypot(pointer.clientX - startX, pointer.clientY - startY) > 3) {
        return
      }
      if (!inLowerHalf(pointer, ruler)) {
        return
      }
      const raw = rawPosition(pointer.clientX, ruler, zoomRef.current, metricsRef.current.marginLeft)
      const width = contentSpan(metricsRef.current)
      if (raw < 0 || raw > width) {
        return
      }
      addTabStop(editor, raw, chosen, width)
    }
    window.addEventListener("mouseup", place)
  }

  function onColumnMouseDown(event: ReactMouseEvent<HTMLButtonElement>, index: number) {
    if (event.button !== 0 || !editor || !horizontalRef.current) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const ruler = horizontalRef.current
    const sectionNow = findColumnSection(editor.state)
    const count = sectionNow ? sectionNow.columns : useDocumentStore.getState().pageSetup.columns
    if (count < 2) {
      return
    }
    const previousSelect = document.body.style.userSelect
    const previousCursor = document.body.style.cursor
    document.body.style.userSelect = "none"
    document.body.style.cursor = "ew-resize"
    const gapAt = (pointer: MouseEvent) => {
      const rect = ruler.getBoundingClientRect()
      const currentZoom = zoomRef.current || 1
      const current = pageMetrics(useDocumentStore.getState().pageSetup)
      const content = current.width - current.marginLeft - current.marginRight
      const edge = (pointer.clientX - rect.left) / currentZoom - current.marginLeft
      return gapFromBoundary(content, count, index, edge)
    }
    const move = (pointer: MouseEvent) => {
      const gap = gapAt(pointer)
      if (sectionNow) {
        setSectionGapPreview(gap)
        const dom = editor.view.nodeDOM(sectionNow.pos)
        if (dom instanceof HTMLElement) {
          dom.style.setProperty("--gap", `${gap}cm`)
        }
        return
      }
      const setup = useDocumentStore.getState().pageSetup
      if (gap !== setup.columnGap) {
        useDocumentStore.getState().setPageSetup({ ...setup, columnGap: gap })
      }
    }
    const up = (pointer: MouseEvent) => {
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
      listeners.current = null
      document.body.style.userSelect = previousSelect
      document.body.style.cursor = previousCursor
      if (sectionNow) {
        setColumnSectionGap(editor, sectionNow.pos, gapAt(pointer))
        setSectionGapPreview(null)
      }
    }
    listeners.current = { move, up }
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
  }

  function onMarkerMouseDown(event: ReactMouseEvent<HTMLButtonElement>, stop: TabStop) {
    if (event.button !== 0 || !editor) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const ruler = horizontalRef.current
    if (!ruler) {
      return
    }
    const origin = stop.position
    const startY = event.clientY
    const previousSelect = document.body.style.userSelect
    const previousCursor = document.body.style.cursor
    document.body.style.userSelect = "none"

    const move = (pointer: MouseEvent) => {
      const currentZoom = zoomRef.current
      const currentMetrics = metricsRef.current
      const width = contentSpan(currentMetrics)
      const position = clampTabPosition(
        rawPosition(pointer.clientX, ruler, currentZoom, currentMetrics.marginLeft),
        width,
      )
      const rect = ruler.getBoundingClientRect()
      const offsetY = Math.max(0, pointer.clientY - startY)
      const pullingOff = pointer.clientY > rect.bottom + 16 || pointer.clientY < rect.top - 16
      document.body.style.cursor = pullingOff ? "grabbing" : "ew-resize"
      setDrag({ id: stop.id, origin, position, align: stop.align, offsetY, pullingOff })
    }
    const up = (pointer: MouseEvent) => {
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
      listeners.current = null
      document.body.style.userSelect = previousSelect
      document.body.style.cursor = previousCursor
      const rect = ruler.getBoundingClientRect()
      if (pointer.clientY > rect.bottom + 16 || pointer.clientY < rect.top - 16) {
        removeTabStop(editor, origin)
      } else {
        const width = contentSpan(metricsRef.current)
        const position = clampTabPosition(
          rawPosition(pointer.clientX, ruler, zoomRef.current, metricsRef.current.marginLeft),
          width,
        )
        if (Math.abs(position - origin) >= 0.5) {
          moveTabStop(editor, origin, position, width)
        }
      }
      setDrag(null)
    }
    listeners.current = { move, up }
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
  }

  function onIndentMouseDown(event: ReactMouseEvent<HTMLButtonElement>, part: IndentPart) {
    if (event.button !== 0 || !editor || !horizontalRef.current) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const ruler = horizontalRef.current
    const start = indentPreview ?? {
      firstPx: selection.firstPx,
      hangPx: selection.hangPx,
      rightPx: selection.rightPx,
    }
    const width0 = contentSpan(metricsRef.current)
    const pointer0 = clampTabPosition(
      rawPosition(event.clientX, ruler, zoomRef.current, metricsRef.current.marginLeft),
      width0,
    )
    const origin =
      part === "first" ? start.firstPx : part === "hanging" || part === "left" ? start.hangPx : width0 - start.rightPx
    const grab = pointer0 - origin
    // Preview-only while dragging so step snapping cannot fight the pointer.
    let latest: IndentPreview = start
    const previousSelect = document.body.style.userSelect
    const previousCursor = document.body.style.cursor
    document.body.style.userSelect = "none"
    document.body.style.cursor = "ew-resize"

    const readContentX = (pointer: MouseEvent) => {
      const width = contentSpan(metricsRef.current)
      return clampTabPosition(
        rawPosition(pointer.clientX, ruler, zoomRef.current, metricsRef.current.marginLeft) - grab,
        width,
      )
    }

    const move = (pointer: MouseEvent) => {
      const width = contentSpan(metricsRef.current)
      const x = readContentX(pointer)
      let next: IndentPreview
      if (part === "first") {
        next = { ...start, firstPx: x }
      } else if (part === "hanging") {
        next = { ...start, hangPx: x }
      } else if (part === "left") {
        const delta = x - start.hangPx
        next = {
          firstPx: clampTabPosition(start.firstPx + delta, width),
          hangPx: clampTabPosition(start.hangPx + delta, width),
          rightPx: start.rightPx,
        }
      } else {
        next = { ...start, rightPx: Math.max(0, width - x) }
      }
      latest = next
      setIndentPreview(next)
    }
    const up = () => {
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
      listeners.current = null
      document.body.style.userSelect = previousSelect
      document.body.style.cursor = previousCursor
      applyIndentAttrs(editor, latest, contentSpan(metricsRef.current))
      setIndentPreview(null)
    }
    listeners.current = { move, up }
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
  }

  function onMarginMouseDown(event: ReactMouseEvent<HTMLButtonElement>, edge: MarginEdge, pageIndex: number) {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const horizontal = edge === "left" || edge === "right"
    const ruler = horizontal ? horizontalRef.current : verticalRef.current
    if (!ruler) {
      return
    }
    const previousSelect = document.body.style.userSelect
    const previousCursor = document.body.style.cursor
    document.body.style.userSelect = "none"
    document.body.style.cursor = horizontal ? "ew-resize" : "ns-resize"

    const move = (pointer: MouseEvent) => {
      const rect = ruler.getBoundingClientRect()
      const currentZoom = zoomRef.current || 1
      const setup = useDocumentStore.getState().pageSetup
      const current = pageMetrics(setup)
      const along = horizontal
        ? (pointer.clientX - rect.left) / currentZoom
        : (pointer.clientY - rect.top) / currentZoom - pageIndex * (current.height + PAGE_GAP)
      const span = horizontal ? current.width : current.height
      const marginPx = edge === "left" || edge === "top" ? along : span - along
      const key = MARGIN_KEY[edge]
      const next = marginAlongEdge(setup, key, marginPx / PX_PER_MM)
      if (next === setup[key]) {
        return
      }
      useDocumentStore.getState().setPageSetup({ ...setup, [key]: next })
    }
    const up = () => {
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
      listeners.current = null
      document.body.style.userSelect = previousSelect
      document.body.style.cursor = previousCursor
    }
    listeners.current = { move, up }
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {showRuler ? (
        <div className="ruler-slot">
          <button
            type="button"
            className="ruler-corner"
            style={{ width: RULER_SIZE, height: RULER_SIZE }}
            aria-label={`${TAB_LABEL[align]}. Click to choose the next tab type.`}
            title={TAB_LABEL[align]}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setAlign(TAB_ORDER[(TAB_ORDER.indexOf(align) + 1) % TAB_ORDER.length])}
          >
            <TabStopIcon align={align} />
          </button>
          <div ref={horizontalClipRef} className="ruler-clip">
            <div
              ref={horizontalRef}
              className="ruler-horizontal"
              style={{ width: pageWidth, height: RULER_SIZE }}
              role="group"
              aria-label="Horizontal ruler in centimeters"
              data-system={ticks}
              onMouseDown={onRulerMouseDown}
            >
              <RulerScale
                ticks={buildRulerTicks({
                  length: metrics.width,
                  origin: metrics.marginLeft,
                  zoom,
                  system: ticks,
                  locale,
                })}
                orientation="horizontal"
                marginStart={metrics.marginLeft * zoom}
                marginEnd={metrics.marginRight * zoom}
                indent={bodyIndentPx * zoom}
                rightIndent={indents.rightPx * zoom}
              />
              {stops.map((stop) => {
                const pulling = drag?.id === stop.id && drag.pullingOff
                const offsetY = drag?.id === stop.id ? drag.offsetY : 0
                return (
                  <button
                    key={stop.id}
                    type="button"
                    className={`ruler-tab is-${stop.align}${pulling ? " is-pulling" : ""}`}
                    style={{
                      left: (metrics.marginLeft + stop.position) * zoom,
                      transform: `translateX(-50%) translateY(${offsetY}px)`,
                    }}
                    aria-label={`${TAB_LABEL[stop.align]} at ${formatLength(stop.position, system, locale)}`}
                    onMouseDown={(event) => onMarkerMouseDown(event, stop)}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <span className="ruler-tab-grab" aria-hidden />
                    <TabStopIcon align={stop.align} />
                  </button>
                )
              })}
              {columnsOnRuler.map((mark) => (
                <span
                  key={`column-${mark.index}`}
                  className="ruler-column"
                  style={{ left: (metrics.marginLeft + mark.left) * zoom, width: Math.max(0, mark.width) * zoom }}
                  aria-hidden
                />
              ))}
              {columnsOnRuler.map((mark) =>
                mark.gapWidth > 0 ? (
                  <span key={`column-gap-${mark.index}`}>
                    <span
                      className="ruler-column-gap"
                      style={{
                        left: (metrics.marginLeft + mark.gapLeft) * zoom,
                        width: Math.max(0, mark.gapWidth) * zoom,
                      }}
                      aria-hidden
                    />
                    <button
                      type="button"
                      className="ruler-column-handle"
                      style={{ left: (metrics.marginLeft + mark.edge) * zoom }}
                      aria-label={`Resize column ${mark.index + 1}`}
                      onMouseDown={(event) => onColumnMouseDown(event, mark.index)}
                    />
                  </span>
                ) : null,
              )}
              <MarginHandle
                edge="left"
                orientation="horizontal"
                offset={metrics.marginLeft * zoom}
                label={`Left page margin, ${formatLength(metrics.marginLeft, system, locale)}`}
                onMouseDown={onMarginMouseDown}
              />
              <MarginHandle
                edge="right"
                orientation="horizontal"
                offset={(metrics.width - metrics.marginRight) * zoom}
                label={`Right page margin, ${formatLength(metrics.marginRight, system, locale)}`}
                onMouseDown={onMarginMouseDown}
              />
              {editor ? (
                <>
                  <button
                    type="button"
                    className="ruler-indent-handle is-first"
                    style={{ left: (metrics.marginLeft + indents.firstPx) * zoom }}
                    aria-label={`First-line indent, ${formatLength(indents.firstPx, system, locale)}`}
                    title="First Line Indent"
                    onMouseDown={(event) => onIndentMouseDown(event, "first")}
                  >
                    <FirstLineMarker />
                  </button>
                  <button
                    type="button"
                    className="ruler-indent-handle is-hanging"
                    style={{ left: (metrics.marginLeft + indents.hangPx) * zoom }}
                    aria-label={`Hanging indent, ${formatLength(indents.hangPx, system, locale)}`}
                    title="Hanging Indent"
                    onMouseDown={(event) => onIndentMouseDown(event, "hanging")}
                  >
                    <HangingMarker />
                  </button>
                  <button
                    type="button"
                    className="ruler-indent-handle is-left"
                    style={{ left: (metrics.marginLeft + indents.hangPx) * zoom }}
                    aria-label={`Left indent, ${formatLength(indents.hangPx, system, locale)}`}
                    title="Left Indent"
                    onMouseDown={(event) => onIndentMouseDown(event, "left")}
                  >
                    <LeftIndentSquare />
                  </button>
                  <button
                    type="button"
                    className="ruler-indent-handle is-right"
                    style={{ left: (metrics.marginLeft + contentPx - indents.rightPx) * zoom }}
                    aria-label={`Right indent, ${formatLength(indents.rightPx, system, locale)}`}
                    title="Right Indent"
                    onMouseDown={(event) => onIndentMouseDown(event, "right")}
                  >
                    <RightIndentMarker />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      <div className={`ruler-stage relative flex min-h-0 min-w-0 flex-1${showRuler ? " has-rulers" : ""}`}>
        {/* Soft shadows where the rulers (or, without them, the ribbon and the window edge) meet the document. */}
        <span className="ruler-shadow is-top" aria-hidden />
        <span className="ruler-shadow is-left" aria-hidden />
        {showRuler ? (
          <div ref={verticalDockRef} className="ruler-dock">
            <div
              ref={verticalRef}
              className="ruler-vertical"
              style={{ width: RULER_SIZE, height: trackHeight }}
              role="group"
              aria-label="Vertical ruler in centimeters"
            >
              {Array.from({ length: rulerRows }, (_, index) => {
                const pageTop = index * (metrics.height + PAGE_GAP) * zoom
                return (
                  <RulerScale
                    key={index}
                    ticks={buildRulerTicks({
                      length: metrics.height,
                      origin: metrics.marginTop,
                      zoom,
                      system: ticks,
                      locale,
                    })}
                    orientation="vertical"
                    pageTop={pageTop}
                    pageSpan={metrics.height * zoom}
                    marginStart={metrics.marginTop * zoom}
                    marginEnd={metrics.marginBottom * zoom}
                    indent={0}
                  />
                )
              })}
              {Array.from({ length: rulerRows }, (_, index) => {
                const pageTop = index * (metrics.height + PAGE_GAP) * zoom
                return (
                  <span key={`margins-${index}`}>
                    <MarginHandle
                      edge="top"
                      orientation="vertical"
                      pageIndex={index}
                      offset={pageTop + metrics.marginTop * zoom}
                      label={`Top margin, ${formatLength(metrics.marginTop, system, locale)}`}
                      onMouseDown={onMarginMouseDown}
                    />
                    <MarginHandle
                      edge="bottom"
                      orientation="vertical"
                      pageIndex={index}
                      offset={pageTop + (metrics.height - metrics.marginBottom) * zoom}
                      label={`Bottom margin, ${formatLength(metrics.marginBottom, system, locale)}`}
                      onMouseDown={onMarginMouseDown}
                    />
                  </span>
                )
              })}
            </div>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  )
}

function MarginHandle({
  edge,
  orientation,
  offset,
  label,
  pageIndex = 0,
  onMouseDown,
}: {
  edge: MarginEdge
  orientation: "horizontal" | "vertical"
  offset: number
  label: string
  pageIndex?: number
  onMouseDown: (event: ReactMouseEvent<HTMLButtonElement>, edge: MarginEdge, pageIndex: number) => void
}) {
  const horizontal = orientation === "horizontal"
  return (
    <button
      type="button"
      className={
        horizontal ? `ruler-margin-handle is-horizontal is-page is-${edge}` : "ruler-margin-handle is-vertical"
      }
      style={horizontal ? { left: offset } : { top: offset }}
      data-page={pageIndex}
      aria-label={label}
      title={label}
      onMouseDown={(event) => onMouseDown(event, edge, pageIndex)}
    >
      {!horizontal ? <VerticalMarginMarker edge={edge} /> : null}
    </button>
  )
}

function FirstLineMarker() {
  return (
    <svg className="ruler-indent-svg" width="10" height="7" viewBox="0 0 10 7" aria-hidden>
      <path d="M1 1h8L5 6.2z" fill="#F3F2F1" stroke="#605E5C" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}

function HangingMarker() {
  return (
    <svg className="ruler-indent-svg" width="10" height="7" viewBox="0 0 10 7" aria-hidden>
      <path d="M5 0.8L9 6H1z" fill="#F3F2F1" stroke="#605E5C" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}

function LeftIndentSquare() {
  return (
    <svg className="ruler-indent-svg" width="10" height="4" viewBox="0 0 10 4" aria-hidden>
      <rect x="1" y="0.5" width="8" height="3" fill="#F3F2F1" stroke="#605E5C" strokeWidth="1" />
    </svg>
  )
}

function RightIndentMarker() {
  return (
    <svg className="ruler-indent-svg" width="10" height="7" viewBox="0 0 10 7" aria-hidden>
      <path d="M5 0.8L9 6H1z" fill="#F3F2F1" stroke="#605E5C" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}

function VerticalMarginMarker({ edge }: { edge: MarginEdge }) {
  const points = edge === "top" ? "1,5 9,5 5,1" : "1,5 9,5 5,9"
  return (
    <svg className="ruler-indent-svg" width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <polygon points={points} fill="#F3F2F1" stroke="#8A8886" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}

function RulerScale({
  ticks,
  orientation,
  pageTop = 0,
  pageSpan,
  marginStart,
  marginEnd,
  indent,
  rightIndent = 0,
}: {
  ticks: RulerTick[]
  orientation: "horizontal" | "vertical"
  pageTop?: number
  pageSpan?: number
  marginStart: number
  marginEnd: number
  indent: number
  rightIndent?: number
}) {
  const vertical = orientation === "vertical"
  return (
    <div className="ruler-scale" aria-hidden style={vertical ? { top: pageTop, height: pageSpan } : undefined}>
      {vertical ? (
        <>
          <span className="ruler-margin is-vertical" style={{ height: marginStart }} />
          <span className="ruler-margin is-vertical is-end" style={{ height: marginEnd }} />
        </>
      ) : (
        <>
          <span className="ruler-margin" style={{ width: marginStart }} />
          {indent > 0 ? <span className="ruler-indent" style={{ left: marginStart, width: indent }} /> : null}
          {rightIndent > 0 ? (
            <span className="ruler-indent is-right" style={{ right: marginEnd, width: rightIndent }} />
          ) : null}
          <span className="ruler-margin is-end" style={{ width: marginEnd }} />
        </>
      )}
      {ticks.map((tick, index) =>
        tick.kind === "major" ? null : (
          <span
            key={index}
            className={`ruler-tick is-${tick.kind}${vertical ? " is-vertical" : ""}`}
            style={vertical ? { top: tick.offset } : { left: tick.offset }}
          />
        ),
      )}
      {ticks.map((tick, index) =>
        tick.label ? (
          <span
            key={`label-${index}`}
            className={vertical ? "ruler-label is-vertical" : "ruler-label"}
            style={vertical ? { top: tick.offset } : { left: tick.offset }}
          >
            {tick.label}
          </span>
        ) : null,
      )}
    </div>
  )
}

function TabStopIcon({ align }: { align: TabAlign }) {
  // Word-style markers: stem sits on the tab position; base rests on the ruler bottom.
  if (align === "center") {
    return (
      <svg className="ruler-tab-icon" viewBox="0 0 10 9" aria-hidden>
        <path d="M4.25 0.5h1.5V5.75H9.25V7.25H0.75V5.75H4.25z" />
      </svg>
    )
  }
  if (align === "right") {
    return (
      <svg className="ruler-tab-icon" viewBox="0 0 10 9" aria-hidden>
        <path d="M8.25 0.5H9.75V7.25H0.75V5.75H8.25z" />
      </svg>
    )
  }
  if (align === "decimal") {
    return (
      <svg className="ruler-tab-icon" viewBox="0 0 10 11" aria-hidden>
        <path d="M4.25 0.5h1.5V5.25H9.25V6.75H0.75V5.25H4.25z" />
        <circle cx="5" cy="9.25" r="1.15" />
      </svg>
    )
  }
  return (
    <svg className="ruler-tab-icon" viewBox="0 0 10 9" aria-hidden>
      <path d="M0.25 0.5H1.75V5.75H9.25V7.25H0.25z" />
    </svg>
  )
}

function inLowerHalf(event: MouseEvent, ruler: HTMLElement) {
  const rect = ruler.getBoundingClientRect()
  return event.clientY >= rect.top + rect.height / 2
}

function rawPosition(clientX: number, ruler: HTMLElement, zoom: number, marginLeft: number) {
  const rect = ruler.getBoundingClientRect()
  return (clientX - rect.left) / zoom - marginLeft
}

function contentSpan(metrics: PageMetrics) {
  return Math.max(0, metrics.width - metrics.marginLeft - metrics.marginRight)
}

function roundCm(value: number) {
  return Math.round(value * 100) / 100
}

function decodeIndents(indentSteps: number, specialRaw: string, indentRightMm: number) {
  const indentPx = clampIndent(indentSteps) * INDENT_STEP_PX
  const [kind, raw] = specialRaw.split(":")
  const amountPx = Number(raw) * PX_PER_CM
  let firstPx = indentPx
  let hangPx = indentPx
  if (kind === "first" && Number.isFinite(amountPx) && amountPx > 0) {
    firstPx = indentPx + amountPx
  } else if (kind === "hanging" && Number.isFinite(amountPx) && amountPx > 0) {
    hangPx = indentPx + amountPx
  }
  return {
    firstPx,
    hangPx,
    rightPx: Math.max(0, indentRightMm * PX_PER_MM),
  }
}

function encodeIndents(preview: IndentPreview, contentWidth: number) {
  const firstPx = clampTabPosition(preview.firstPx, contentWidth)
  const hangPx = clampTabPosition(preview.hangPx, contentWidth)
  const rightPx = Math.max(0, Math.min(contentWidth, preview.rightPx))
  const indentRight = Math.round((rightPx / PX_PER_MM) * 10) / 10

  if (Math.abs(firstPx - hangPx) < 1) {
    return {
      indent: clampIndent(Math.round(hangPx / INDENT_STEP_PX)),
      specialIndent: "",
      indentRight,
    }
  }

  if (firstPx > hangPx) {
    const base = clampIndent(Math.round(hangPx / INDENT_STEP_PX))
    const amountCm = roundCm((firstPx - base * INDENT_STEP_PX) / PX_PER_CM)
    return {
      indent: base,
      specialIndent: amountCm > 0.01 ? `first:${amountCm}` : "",
      indentRight,
    }
  }

  const base = clampIndent(Math.round(firstPx / INDENT_STEP_PX))
  const amountCm = roundCm((hangPx - base * INDENT_STEP_PX) / PX_PER_CM)
  return {
    indent: base,
    specialIndent: amountCm > 0.01 ? `hanging:${amountCm}` : "",
    indentRight,
  }
}

function applyIndentAttrs(editor: Editor, preview: IndentPreview, contentWidth: number) {
  const attrs = encodeIndents(preview, contentWidth)
  const { state } = editor
  const { from, to, empty } = state.selection
  const positions: number[] = []
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === "paragraph" || node.type.name === "heading") {
      positions.push(pos)
    }
  })
  if (positions.length === 0 && empty) {
    for (let depth = state.selection.$from.depth; depth > 0; depth -= 1) {
      const node = state.selection.$from.node(depth)
      if (node.type.name === "paragraph" || node.type.name === "heading") {
        positions.push(state.selection.$from.before(depth))
        break
      }
    }
  }
  if (positions.length === 0) {
    return
  }

  let transaction = state.tr
  let changed = false
  for (const pos of positions) {
    const node = transaction.doc.nodeAt(pos)
    if (!node) {
      continue
    }
    if (
      clampIndent(node.attrs.indent) === attrs.indent &&
      String(node.attrs.specialIndent || "") === attrs.specialIndent &&
      Number(node.attrs.indentRight || 0) === attrs.indentRight
    ) {
      continue
    }
    changed = true
    transaction = transaction.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      ...attrs,
    })
  }
  if (changed) {
    editor.view.dispatch(transaction)
  }
}

function rulerSelectionKey(editor: Editor | null) {
  if (!editor) {
    return "0|||"
  }
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name !== "paragraph" && node.type.name !== "heading") {
      continue
    }
    const indent = clampIndent(node.attrs.indent)
    const special = typeof node.attrs.specialIndent === "string" ? node.attrs.specialIndent : ""
    const indentRight = Number(node.attrs.indentRight) || 0
    const encoded = typeof node.attrs.tabStops === "string" ? node.attrs.tabStops : ""
    return `${indent}|${special}|${indentRight}|${encoded}`
  }
  return "0|||"
}

function parseSelectionKey(key: string) {
  const [indentText, special = "", rightText = "0", stopsText = ""] = key.split("|")
  const indentSteps = Number(indentText)
  const indentRightMm = Number(rightText)
  const decoded = decodeIndents(
    Number.isFinite(indentSteps) ? indentSteps : 0,
    special,
    Number.isFinite(indentRightMm) ? indentRightMm : 0,
  )
  return {
    ...decoded,
    stops: parseTabStops(stopsText),
  }
}
