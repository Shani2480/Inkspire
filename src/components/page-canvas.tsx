import { useEditingOptions } from "@/document/editing-options"
import { formattingMarkClasses } from "@/editor/formatting-marks"
import { ChartPartLayer, ChartSideButtons } from "@/components/chart-overlay"
import { LayoutDialog } from "@/components/layout-dialog"
import { CommentMarkers } from "@/components/comment-markers"
import { ObjectContextMenu } from "@/components/object-context-menu"
import { MiniToolbar } from "@/components/mini-toolbar"
import { ObjectBar } from "@/components/object-bar"
import { TextContextMenu } from "@/components/text-context-menu"
import { TableHandles } from "@/components/table-handles"
import { pageGridCell, pageGridColumns, pageGridRows } from "@/document/page-grid"
import { paintDesignVars } from "@/document/design-format"
import { ChromeBox, useChromePart } from "@/components/chrome-editors"
import { chromeHasContent, chromeHasPageField } from "@/document/chrome-html"
import { useActiveChromeEditor } from "@/document/chrome-editing"
import { chromeText } from "@/document/chrome-html"
import { useChromeExtent } from "@/document/chrome-extent"
import { applyPageChrome, pageBorderStyle, pageMetrics, showsPageBorder } from "@/document/page-setup"
import { useDocumentStore } from "@/document/store"
import { clampZoom, useViewStore } from "@/document/view"
import { useBodyEditor } from "@/editor/document-editor"
import { selectedObject } from "@/editor/objects"
import { PAGE_GAP } from "@/editor/pages"
import { bindLineSelect } from "@/editor/line-select"
import { finishPageGrid, preparePageMeasure } from "@/editor/page-grid"
import { TextSelection } from "@tiptap/pm/state"
import { EditorContent, useEditorState } from "@tiptap/react"
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react"

function cssString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

function footerBoxes(footer: string) {
  const text = footer.trim()
  return {
    center: text ? cssString(text) : "counter(page)",
    page: text ? "counter(page)" : "none",
  }
}

export function PageCanvas() {
  const editor = useBodyEditor()
  const zoom = useViewStore((state) => state.zoom)
  const zoomMode = useViewStore((state) => state.zoomMode)
  const syncZoom = useViewStore((state) => state.syncZoom)
  const showFormattingMarks = useViewStore((state) => state.showFormattingMarks)
  const markClasses = useEditingOptions((state) => formattingMarkClasses(showFormattingMarks, state))
  const showGridlines = useViewStore((state) => state.showGridlines)
  const cropMarks = useEditingOptions((state) => state.cropMarks)
  const movement = useViewStore((state) => state.movement)
  const pageView = useViewStore((state) => state.pageView)
  const hideInk = useViewStore((state) => state.hideInk)
  const layoutMode = useViewStore((state) => state.layoutMode)
  // Subscribed so the metrics below follow the window in Web Layout.
  useViewStore((state) => state.webWidth)
  const setWebWidth = useViewStore((state) => state.setWebWidth)
  const web = layoutMode === "web"
  const editingChrome = useViewStore((state) => state.editingChrome)
  const setEditingChrome = useViewStore((state) => state.setEditingChrome)
  const headerHtml = useDocumentStore((state) => state.headerHtml)
  const footerHtml = useDocumentStore((state) => state.footerHtml)
  const differentFirstPage = useDocumentStore((state) => state.differentFirstPage)
  const firstHeaderHtml = useDocumentStore((state) => state.firstHeaderHtml)
  const firstFooterHtml = useDocumentStore((state) => state.firstFooterHtml)
  const setHeader = useDocumentStore((state) => state.setHeader)
  const setFooter = useDocumentStore((state) => state.setFooter)
  const setFirstHeader = useDocumentStore((state) => state.setFirstHeader)
  const setFirstFooter = useDocumentStore((state) => state.setFirstFooter)
  const evenHeaderHtml = useDocumentStore((state) => state.evenHeaderHtml)
  const evenFooterHtml = useDocumentStore((state) => state.evenFooterHtml)
  const setEvenHeader = useDocumentStore((state) => state.setEvenHeader)
  const setEvenFooter = useDocumentStore((state) => state.setEvenFooter)
  const setDifferentFirstPage = useDocumentStore((state) => state.setDifferentFirstPage)
  const inUse = (html: string) => editingChrome || chromeHasContent(html)
  const headerPart = useChromePart(headerHtml, setHeader, "Header", inUse(headerHtml))
  const footerPart = useChromePart(footerHtml, setFooter, "Footer", inUse(footerHtml))
  const firstHeaderPart = useChromePart(firstHeaderHtml, setFirstHeader, "First page header", inUse(firstHeaderHtml))
  const firstFooterPart = useChromePart(firstFooterHtml, setFirstFooter, "First page footer", inUse(firstFooterHtml))
  const evenHeaderPart = useChromePart(evenHeaderHtml, setEvenHeader, "Even page header", inUse(evenHeaderHtml))
  const evenFooterPart = useChromePart(evenFooterHtml, setEvenFooter, "Even page footer", inUse(evenFooterHtml))
  const chromeTarget = useViewStore((state) => state.chromeTarget)
  const activeChrome = useActiveChromeEditor((state) => state.editor)
  const editChromeAt = useViewStore((state) => state.editChrome)
  const pageSetup = useDocumentStore((state) => state.pageSetup)
  // A tall header or footer moves the body's margins (see `chrome-extent.ts`).
  const reach = useChromeExtent((state) => `${state.header}|${state.footer}`)
  const metrics = pageMetrics(pageSetup)
  const header = chromeText(headerHtml)
  const countedPages =
    useEditorState({
      editor,
      selector: ({ editor: current }) => current?.storage.pagination?.pageCount ?? 1,
    }) ?? 1
  const pageCount = web ? 1 : countedPages
  // The floating toolbars follow the text being edited: the header or footer while one is open, else the body.
  const formatted = editingChrome ? activeChrome : editor
  const pageRef = useRef<HTMLElement>(null)
  const [pageHeight, setPageHeight] = useState(metrics.height)
  const side = movement === "side"
  const grid = pageView > 1 && !side
  const gridColumns = grid ? pageGridColumns(pageView) : 1
  const gridRows = grid ? pageGridRows(pageCount, pageView) : pageCount
  const stackHeight = side ? metrics.height : gridRows * metrics.height + Math.max(0, gridRows - 1) * PAGE_GAP
  const stackWidth = side
    ? pageCount * metrics.width + Math.max(0, pageCount - 1) * PAGE_GAP
    : grid
      ? gridColumns * metrics.width + Math.max(0, gridColumns - 1) * PAGE_GAP
      : metrics.width

  useEffect(() => {
    const style = document.documentElement.style
    applyPageChrome(pageSetup)
    paintDesignVars(pageSetup)
    style.setProperty("--print-title", header ? cssString(header) : "none")
    const footer = footerBoxes(chromeText(footerHtml))
    style.setProperty("--print-center", footer.center)
    style.setProperty("--print-page", footer.page)
    if (differentFirstPage) {
      const firstHeader = chromeText(firstHeaderHtml)
      const firstFooter = footerBoxes(chromeText(firstFooterHtml))
      style.setProperty("--print-first-title", firstHeader ? cssString(firstHeader) : "none")
      style.setProperty("--print-first-center", firstFooter.center)
      style.setProperty("--print-first-page", firstFooter.page)
    } else {
      style.removeProperty("--print-first-title")
      style.removeProperty("--print-first-center")
      style.removeProperty("--print-first-page")
    }
  }, [header, footerHtml, differentFirstPage, firstHeaderHtml, firstFooterHtml, pageSetup, reach])

  // Web Layout: the text runs the width of the window, so the page is as wide as the room there is, at any zoom.
  useLayoutEffect(() => {
    if (!web) {
      return
    }
    const scroll = document.getElementById("document-scroll")
    if (!scroll) {
      return
    }
    const apply = () => {
      const style = getComputedStyle(scroll)
      const room = scroll.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
      const next = Math.max(240, Math.floor(room / zoom))
      if (next !== useViewStore.getState().webWidth) {
        setWebWidth(next)
      }
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [web, zoom, setWebWidth])

  useLayoutEffect(() => {
    if (zoomMode === "manual" || web) {
      return
    }
    const scroll = document.getElementById("document-scroll")
    if (!scroll) {
      return
    }
    const apply = () => {
      const style = getComputedStyle(scroll)
      const availableWidth =
        scroll.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
      const slack = pageView > 1 && zoomMode === "pages" ? 12 : 0
      const availableHeight =
        scroll.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0) - 40 - slack
      const widthZoom = availableWidth / metrics.width
      const fitColumns = pageView > 1 ? pageGridColumns(pageView) : 2
      const fitRows = pageView === 8 ? 2 : 1
      const fitWidth = fitColumns * metrics.width + Math.max(0, fitColumns - 1) * PAGE_GAP
      const fitHeight =
        fitRows * metrics.height +
        Math.max(0, fitRows - 1) * PAGE_GAP +
        (pageView > 1 && zoomMode === "pages" ? metrics.marginTop + metrics.marginBottom : 0)
      const floor = pageView > 1 && zoomMode === "pages" ? 0.1 : 0.5
      const raw =
        zoomMode === "width"
          ? widthZoom
          : zoomMode === "page"
            ? Math.min(widthZoom, availableHeight / metrics.height)
            : Math.min(availableWidth / fitWidth, availableHeight / fitHeight)
      const next = pageView > 1 && zoomMode === "pages" ? Math.floor(raw * 100) / 100 : raw
      const fitted = clampZoom(next, floor)
      if (fitted !== useViewStore.getState().zoom) {
        syncZoom(fitted, floor)
      }
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [zoomMode, web, pageView, metrics.width, metrics.height, syncZoom])

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return
    }
    const shown = pageView > 1 && movement !== "side" ? pageView : 1
    let cancelled = false
    const repair = () => {
      if (cancelled || editor.isDestroyed) {
        return
      }
      const sample = editor.view.dom.querySelector(
        ":scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > table, :scope > ul, :scope > ol",
      )
      const placed = sample instanceof HTMLElement && sample.style.position === "absolute"
      if (shown > 1 && !placed) {
        preparePageMeasure(editor.view, shown, metrics)
        finishPageGrid(editor.view, shown, metrics)
      } else if (shown === 1 && placed) {
        finishPageGrid(editor.view, 1, metrics)
      }
    }
    const first = window.setTimeout(repair, 80)
    const second = window.setTimeout(repair, 280)
    return () => {
      cancelled = true
      window.clearTimeout(first)
      window.clearTimeout(second)
    }
  }, [
    editor,
    pageView,
    movement,
    metrics.width,
    metrics.height,
    metrics.marginTop,
    metrics.marginBottom,
    metrics.marginLeft,
    metrics.marginRight,
  ])

  useLayoutEffect(() => {
    const page = pageRef.current
    if (!page) {
      return
    }

    const update = () => setPageHeight(page.offsetHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(page)
    return () => observer.disconnect()
  }, [editor, pageSetup, web])

  function clearFloatingSelection(event: MouseEvent<HTMLElement>) {
    if (!editor || event.target !== event.currentTarget || !selectedObject(editor)) {
      return
    }
    let target: number | null = null
    editor.state.doc.descendants((node, pos) => {
      if (target != null) {
        return false
      }
      if (node.type.name === "textBox") {
        return false
      }
      if (node.isTextblock) {
        target = pos + 1
        return false
      }
    })
    if (target == null) {
      return
    }
    const selection = TextSelection.create(editor.state.doc, target)
    editor.view.dispatch(editor.state.tr.setSelection(selection))
    editor.view.focus()
  }

  const pageWidth = stackWidth * zoom
  const pageVisualHeight = (side ? metrics.height : pageHeight) * zoom

  useEffect(() => {
    const page = pageRef.current
    if (!editor || !page) {
      return
    }
    return bindLineSelect(editor, page, pageSetup.marginLeft, zoom)
  }, [editor, pageSetup.marginLeft, zoom])

  useEffect(() => {
    if (!editor) {
      return
    }
    const dom = editor.view.dom
    dom.lang = pageSetup.language || "en"
    dom.dataset.spacing = pageSetup.spacing
    if (pageSetup.effects) {
      dom.dataset.effects = pageSetup.effects
    } else {
      delete dom.dataset.effects
    }
    dom.classList.toggle("hyphenate", pageSetup.hyphenation)
    dom.classList.toggle("hide-ink", hideInk)
    // Line Numbers dialog's From text; Auto leaves the stylesheet's gap.
    if (pageSetup.lineNumberDistance > 0) {
      dom.style.setProperty("--line-number-gap", `${pageSetup.lineNumberDistance}mm`)
    } else {
      dom.style.removeProperty("--line-number-gap")
    }
  }, [
    editor,
    pageSetup.language,
    pageSetup.spacing,
    pageSetup.effects,
    pageSetup.hyphenation,
    pageSetup.lineNumberDistance,
    hideInk,
  ])

  // Word: double-click a page's top or bottom margin to edit its header or footer, double-click the body (or press
  // Esc) to go back to the document.
  const editChrome = (index: number, part: "header" | "footer") => {
    editor?.commands.blur()
    editChromeAt(part, index)
  }

  useEffect(() => {
    if (!editingChrome) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector('[role="dialog"][aria-modal="true"]')) {
        event.preventDefault()
        setEditingChrome(false)
        editor?.commands.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [editingChrome, editor, setEditingChrome])

  /** Which header and footer a page shows: the first page's, the even pages', or the ones every page shares. */
  const chromeKind = (index: number) =>
    index === 0 && differentFirstPage ? "first" : pageSetup.differentOddEven && index % 2 === 1 ? "even" : "default"
  const chromeLabel = (index: number, part: "Header" | "Footer") => {
    const kind = chromeKind(index)
    return kind === "first" ? `First Page ${part}` : kind === "even" ? `Even Page ${part}` : part
  }
  const chromeFor = (index: number, part: "header" | "footer") => {
    const kind = chromeKind(index)
    const header = part === "header"
    return kind === "first"
      ? { part: header ? firstHeaderPart : firstFooterPart, html: header ? firstHeaderHtml : firstFooterHtml }
      : kind === "even"
        ? { part: header ? evenHeaderPart : evenFooterPart, html: header ? evenHeaderHtml : evenFooterHtml }
        : { part: header ? headerPart : footerPart, html: header ? headerHtml : footerHtml }
  }

  return (
    <div className="page-stage relative mx-auto mt-10" style={{ width: pageWidth }}>
      <div className="page-zoom relative" style={{ width: pageWidth, height: pageVisualHeight }}>
        <article
          ref={pageRef}
          onMouseDown={clearFloatingSelection}
          lang={pageSetup.language || "en"}
          className={`page-canvas absolute top-0 left-0${markClasses ? ` ${markClasses}` : ""}${editingChrome ? " is-chrome-editing" : ""}`}
          onDoubleClick={(event) => {
            const target = event.target as HTMLElement
            if (editingChrome && !target.closest(".page-header, .page-footer, .page-chrome-zone, .page-first")) {
              setEditingChrome(false)
              editor?.commands.focus()
            }
          }}
          data-page-view={grid ? pageView : 1}
          data-layout={layoutMode}
          style={{
            width: stackWidth,
            paddingTop: metrics.marginTop,
            paddingRight: web ? metrics.marginRight : `${pageSetup.marginRight}mm`,
            paddingBottom: metrics.marginBottom,
            paddingLeft: web ? metrics.marginLeft : `${pageSetup.marginLeft}mm`,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            minHeight: web
              ? "calc(100vh - 12rem)"
              : grid
                ? stackHeight + metrics.marginTop + metrics.marginBottom
                : stackHeight,
          }}
        >
          {Array.from({ length: pageCount }, (_, index) => (
            <div
              key={index}
              className={`page-sheet pointer-events-none absolute box-border border border-gray-300 bg-white shadow-sm ${showGridlines ? "page-grid" : ""}`}
              data-header-style={pageSetup.headerStyle}
              data-footer-style={pageSetup.footerStyle}
              style={{
                top: side
                  ? 0
                  : pageGridCell(index, grid ? pageView : 1, metrics.width + PAGE_GAP, metrics.height + PAGE_GAP).top,
                left: side
                  ? index * (metrics.width + PAGE_GAP)
                  : pageGridCell(index, grid ? pageView : 1, metrics.width + PAGE_GAP, metrics.height + PAGE_GAP).left,
                width: metrics.width,
                height: web ? "100%" : metrics.height,
                background: pageSetup.pageColor || undefined,
              }}
            >
              <div
                className="page-chrome-zone is-header"
                aria-hidden
                style={{ height: metrics.marginTop }}
                onDoubleClick={() => editChrome(index, "header")}
                onMouseDown={() => editingChrome && editChrome(index, "header")}
              />
              <div
                className="page-chrome-zone is-footer"
                aria-hidden
                style={{ height: metrics.marginBottom }}
                onDoubleClick={() => editChrome(index, "footer")}
                onMouseDown={() => editingChrome && editChrome(index, "footer")}
              />
              {editingChrome ? (
                <>
                  <span
                    className="page-chrome-tag is-header"
                    data-label={chromeLabel(index, "Header")}
                    style={{ top: metrics.marginTop }}
                  />
                  <span
                    className="page-chrome-tag is-footer"
                    data-label={chromeLabel(index, "Footer")}
                    style={{ bottom: metrics.marginBottom }}
                  />
                </>
              ) : null}
              {index === 0 && editingChrome ? (
                <label className="page-first">
                  <input
                    type="checkbox"
                    checked={differentFirstPage}
                    onChange={(event) => setDifferentFirstPage(event.target.checked)}
                  />
                  First page
                </label>
              ) : null}
              <ChromeBox
                kind="header"
                {...chromeFor(index, "header")}
                live={editingChrome && chromeTarget.part === "header" && chromeTarget.page === index}
                placeholder={chromeLabel(index, "Header")}
                page={index + 1}
                pages={pageCount}
                focus
              />
              <ChromeBox
                kind="footer"
                {...chromeFor(index, "footer")}
                live={editingChrome && chromeTarget.part === "footer" && chromeTarget.page === index}
                placeholder={chromeLabel(index, "Footer")}
                page={index + 1}
                pages={pageCount}
                focus
              />
              {/* A page number written into the header or footer is the page's number; this one is for when there is none. */}
              <div
                className="page-number"
                data-place={
                  chromeHasPageField(chromeFor(index, "header").html) ||
                  chromeHasPageField(chromeFor(index, "footer").html)
                    ? "none"
                    : pageSetup.pageNumber
                }
              >
                {index + 1}
              </div>
              {pageSetup.watermark ? (
                <div className="page-watermark" aria-hidden>
                  <span>{pageSetup.watermark}</span>
                </div>
              ) : null}
              {/* Body text margins only — not header/footer from-edge offsets. */}
              <div className="page-margin-guide" aria-hidden />
              {cropMarks && !web
                ? ["tl", "tr", "bl", "br"].map((corner) => (
                    <span key={corner} className={`page-crop-mark is-${corner}`} aria-hidden />
                  ))
                : null}
              {showsPageBorder(pageSetup, index) ? (
                <div className="page-border" data-border={pageSetup.border} style={pageBorderStyle(pageSetup)} />
              ) : null}
            </div>
          ))}
          {pageSetup.watermark ? (
            <div className="print-mark" aria-hidden>
              <span>{pageSetup.watermark}</span>
            </div>
          ) : null}
          {pageSetup.border !== "none" && pageSetup.borderDisplay === "all" ? (
            <div className="print-frame" data-border={pageSetup.border} style={pageBorderStyle(pageSetup, false)} />
          ) : null}
          <EditorContent editor={editor} />
          {editor ? <CommentMarkers /> : null}
          {pageSetup.columns > 1 ? (
            <div
              className={`page-column-guides${pageSetup.columnLine ? " has-rule" : ""}`}
              aria-hidden
              style={{
                top: metrics.marginTop,
                right: `${pageSetup.marginRight}mm`,
                bottom: metrics.marginBottom,
                left: `${pageSetup.marginLeft}mm`,
                gap: `${pageSetup.columnGap}cm`,
                ["--column-gap" as string]: `${pageSetup.columnGap}cm`,
              }}
            >
              {Array.from({ length: pageSetup.columns }, (_, index) => (
                <span key={index} />
              ))}
            </div>
          ) : null}
          {formatted ? <MiniToolbar editor={formatted} /> : null}
          {formatted ? <ObjectBar editor={formatted} /> : null}
          {editor ? <ChartSideButtons editor={editor} /> : null}
          {editor ? <ChartPartLayer editor={editor} /> : null}
          {editor ? <ObjectContextMenu editor={editor} /> : null}
          {editor ? <LayoutDialog editor={editor} /> : null}
          <TextContextMenu editor={editor} />
          <TableHandles editor={formatted} />
        </article>
      </div>
    </div>
  )
}
