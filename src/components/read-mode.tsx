import { MenuButton, RibbonPopover } from "@/components/ribbon/ribbon-button"
import { documentName, useDocumentStore } from "@/document/store"
import { READ_COLUMN_GAP, READ_COLUMN_WIDTHS, readPageAt, readPageCount, readPageStep } from "@/document/read-pages"
import { useViewStore, type ReadColumnWidth, type ReadLayout, type ReadPageColor } from "@/document/view"
import { useBodyEditor } from "@/editor/document-editor"
import { useEditorState } from "@tiptap/react"
import { Check, ChevronDown, ChevronLeft, ChevronRight, Pencil, X } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"

const WIDTH_CHOICES: { id: ReadColumnWidth; label: string }[] = [
  { id: "narrow", label: "Narrow" },
  { id: "default", label: "Default" },
  { id: "wide", label: "Wide" },
]

const COLOR_CHOICES: { id: ReadPageColor; label: string }[] = [
  { id: "none", label: "None" },
  { id: "sepia", label: "Sepia" },
  { id: "inverse", label: "Inverse" },
]

const LAYOUT_CHOICES: { id: ReadLayout; label: string }[] = [
  { id: "columns", label: "Column Layout" },
  { id: "paper", label: "Paper Layout" },
]

function Choice({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <MenuButton selected={checked} onClick={onClick}>
      <span className="inline-flex w-4 shrink-0">{checked ? <Check className="size-3.5" /> : null}</span>
      {children}
    </MenuButton>
  )
}

function MenuTitle({ children }: { children: ReactNode }) {
  return <p className="px-2 pt-1.5 pb-0.5 text-[11px] font-semibold text-[var(--app-ribbon-muted)]">{children}</p>
}

/** The slim bar that stands in for the ribbon while reading: the document's name, Tools and View, and the way out. */
export function ReadBar({ headings, onHeading }: { headings: string[]; onHeading: (index: number) => void }) {
  const fileName = useDocumentStore((state) => state.fileName)
  const currentFilePath = useDocumentStore((state) => state.currentFilePath)
  const columnWidth = useViewStore((state) => state.readColumnWidth)
  const pageColor = useViewStore((state) => state.readPageColor)
  const layout = useViewStore((state) => state.readLayout)
  const setColumnWidth = useViewStore((state) => state.setReadColumnWidth)
  const setPageColor = useViewStore((state) => state.setReadPageColor)
  const setReadLayout = useViewStore((state) => state.setReadLayout)
  const setLayoutMode = useViewStore((state) => state.setLayoutMode)
  const editor = useBodyEditor()
  const language = useDocumentStore((state) => state.pageSetup.language)

  function readAloud() {
    if (typeof speechSynthesis === "undefined" || !editor) {
      return
    }
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel()
      return
    }
    const utterance = new SpeechSynthesisUtterance(editor.state.doc.textContent.slice(0, 4000))
    utterance.lang = language || "en"
    speechSynthesis.speak(utterance)
  }

  const tools = (close: () => void) => (
    <div className="flex max-h-80 w-60 flex-col overflow-y-auto">
      <MenuButton
        onClick={() => {
          readAloud()
          close()
        }}
      >
        Read Aloud
      </MenuButton>
      <MenuTitle>Headings</MenuTitle>
      {headings.length === 0 ? <p className="px-2 py-1 text-xs opacity-70">This document has no headings.</p> : null}
      {headings.map((heading, index) => (
        <MenuButton
          key={`${index}-${heading}`}
          onClick={() => {
            onHeading(index)
            close()
          }}
        >
          <span className="truncate">{heading}</span>
        </MenuButton>
      ))}
    </div>
  )

  const view = (close: () => void) => (
    <div className="flex w-56 flex-col">
      <MenuButton
        onClick={() => {
          setLayoutMode("print")
          close()
        }}
      >
        <Pencil className="mr-2 size-3.5" />
        Edit Document
      </MenuButton>
      <MenuTitle>Column Width</MenuTitle>
      {WIDTH_CHOICES.map((choice) => (
        <Choice key={choice.id} checked={columnWidth === choice.id} onClick={() => setColumnWidth(choice.id)}>
          {choice.label}
        </Choice>
      ))}
      <MenuTitle>Page Color</MenuTitle>
      {COLOR_CHOICES.map((choice) => (
        <Choice key={choice.id} checked={pageColor === choice.id} onClick={() => setPageColor(choice.id)}>
          {choice.label}
        </Choice>
      ))}
      <MenuTitle>Layout</MenuTitle>
      {LAYOUT_CHOICES.map((choice) => (
        <Choice key={choice.id} checked={layout === choice.id} onClick={() => setReadLayout(choice.id)}>
          {choice.label}
        </Choice>
      ))}
    </div>
  )

  return (
    <div
      role="toolbar"
      aria-label="Read Mode"
      className="read-bar flex h-9 shrink-0 items-center gap-1 border-b border-[var(--app-divider)] bg-[var(--app-ribbon-card)] px-2 text-[13px] text-[var(--app-ribbon-text)]"
    >
      <RibbonPopover label="Tools" content={tools}>
        <span>Tools</span>
        <ChevronDown className="ribbon-chevron size-3" />
      </RibbonPopover>
      <RibbonPopover label="View" content={view}>
        <span>View</span>
        <ChevronDown className="ribbon-chevron size-3" />
      </RibbonPopover>
      <span className="min-w-0 flex-1 truncate text-center text-xs opacity-80">
        {documentName(currentFilePath ?? fileName)}
      </span>
      <button
        type="button"
        className="inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium hover:bg-[var(--app-hover)]"
        onClick={() => setLayoutMode("print")}
      >
        <Pencil className="size-3.5" />
        Edit Document
      </button>
      <button
        type="button"
        aria-label="Close Read Mode"
        title="Close Read Mode (Esc)"
        className="inline-flex size-7 items-center justify-center rounded hover:bg-[var(--app-hover)]"
        onClick={() => setLayoutMode("print")}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

/**
 * The text laid out for reading, as Word's Read Mode does: columns of a comfortable width that run sideways, a screenful
 * at a time, turned with the arrows, PageUp and PageDown, the wheel or the buttons at the edges. An image opens large
 * when it is clicked. The document is not editable here.
 */
export function ReadView({ onHeadings }: { onHeadings: (headings: string[], go: (index: number) => void) => void }) {
  const editor = useBodyEditor()
  const columnWidth = useViewStore((state) => state.readColumnWidth)
  const pageColor = useViewStore((state) => state.readPageColor)
  const setLayoutMode = useViewStore((state) => state.setLayoutMode)
  const html = useEditorState({
    editor,
    selector: ({ editor: current }) => current?.getHTML() ?? "",
  })
  const scrollerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null)
  const lastTurn = useRef(0)

  const measure = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) {
      return
    }
    setPages(readPageCount(scroller.scrollWidth, scroller.clientWidth))
    setPage(readPageAt(scroller.scrollLeft, scroller.clientWidth))
  }, [])

  const goToPage = useCallback((next: number) => {
    const scroller = scrollerRef.current
    if (!scroller) {
      return
    }
    const last = readPageCount(scroller.scrollWidth, scroller.clientWidth) - 1
    const target = Math.max(0, Math.min(last, next))
    scroller.scrollTo({ left: target * readPageStep(scroller.clientWidth), behavior: "smooth" })
  }, [])

  const turn = useCallback(
    (direction: 1 | -1) => {
      const scroller = scrollerRef.current
      if (scroller) {
        goToPage(readPageAt(scroller.scrollLeft, scroller.clientWidth) + direction)
      }
    },
    [goToPage],
  )

  // Columns are laid out by the browser, so the page count is read back after the text or the window changes.
  useLayoutEffect(() => {
    measure()
    const scroller = scrollerRef.current
    if (!scroller) {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    if (bodyRef.current) {
      observer.observe(bodyRef.current)
    }
    return () => observer.disconnect()
  }, [measure, html, columnWidth])

  useEffect(() => {
    const headings = Array.from(bodyRef.current?.querySelectorAll<HTMLElement>("h1, h2, h3") ?? [])
    onHeadings(
      headings.map((heading) => heading.textContent?.trim() || "(empty heading)"),
      (index) => {
        const target = bodyRef.current?.querySelectorAll<HTMLElement>("h1, h2, h3")[index]
        const scroller = scrollerRef.current
        if (target && scroller) {
          goToPage(Math.floor(target.offsetLeft / readPageStep(scroller.clientWidth)))
        }
      },
    )
  }, [html, onHeadings, goToPage])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest("input, textarea, [contenteditable='true'], [role='dialog'][aria-modal='true']")) {
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        if (zoomed) {
          setZoomed(null)
        } else {
          setLayoutMode("print")
        }
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return
      }
      const forward = event.key === "ArrowRight" || event.key === "PageDown" || (event.key === " " && !event.shiftKey)
      const back = event.key === "ArrowLeft" || event.key === "PageUp" || (event.key === " " && event.shiftKey)
      if (forward || back) {
        event.preventDefault()
        turn(forward ? 1 : -1)
      } else if (event.key === "Home") {
        event.preventDefault()
        goToPage(0)
      } else if (event.key === "End") {
        event.preventDefault()
        goToPage(Number.MAX_SAFE_INTEGER)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [goToPage, setLayoutMode, turn, zoomed])

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    // A wheel turns the page, once per flick, instead of scrolling a column sideways a few pixels at a time.
    event.preventDefault()
    const now = performance.now()
    if (now - lastTurn.current < 320) {
      return
    }
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
    if (Math.abs(delta) < 4) {
      return
    }
    lastTurn.current = now
    turn(delta > 0 ? 1 : -1)
  }

  const gap = READ_COLUMN_GAP
  const colWidth = READ_COLUMN_WIDTHS[columnWidth]

  return (
    <div className="read-view relative flex min-h-0 min-w-0 flex-1 flex-col" data-color={pageColor}>
      <div className="relative flex min-h-0 flex-1 items-stretch">
        <button
          type="button"
          aria-label="Previous page"
          className="read-turn"
          disabled={page <= 0}
          onClick={() => turn(-1)}
        >
          <ChevronLeft className="size-6" />
        </button>
        <div
          ref={scrollerRef}
          className="read-scroller min-w-0 flex-1"
          tabIndex={0}
          aria-label="Document, read only"
          onScroll={measure}
          onWheel={onWheel}
          onClick={(event) => {
            const target = event.target as HTMLElement
            if (target instanceof HTMLImageElement) {
              setZoomed({ src: target.currentSrc || target.src, alt: target.alt })
            }
          }}
        >
          <div
            ref={bodyRef}
            className="read-body page-editor"
            style={{ columnWidth: colWidth, columnGap: gap }}
            dangerouslySetInnerHTML={{ __html: html ?? "" }}
          />
        </div>
        <button
          type="button"
          aria-label="Next page"
          className="read-turn"
          disabled={page >= pages - 1}
          onClick={() => turn(1)}
        >
          <ChevronRight className="size-6" />
        </button>
      </div>
      <div className="read-status" aria-live="polite">
        Page {Math.min(page + 1, pages)} of {pages}
      </div>
      {zoomed ? (
        <div className="read-zoom" role="dialog" aria-label="Image" onClick={() => setZoomed(null)}>
          <img src={zoomed.src} alt={zoomed.alt} />
        </div>
      ) : null}
    </div>
  )
}
