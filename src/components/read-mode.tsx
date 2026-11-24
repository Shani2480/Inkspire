import { canCurl, type Curl, prepareCurl, startCurl, type Turning } from "@/components/read-curl"
import { MenuButton, RibbonPopover } from "@/components/ribbon/ribbon-button"
import { documentName, useDocumentStore } from "@/document/store"
import {
  findInPieces,
  READ_COLUMN_GAP,
  READ_COLUMN_WIDTHS,
  readPageAt,
  readPageCount,
  readPageStep,
  useReadFind,
} from "@/document/read-pages"
import { useViewStore, type ReadColumnWidth, type ReadLayout, type ReadPageColor } from "@/document/view"
import { useBodyEditor } from "@/editor/document-editor"
import { useEditorState } from "@tiptap/react"
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pencil, Search, X } from "lucide-react"
import { DOMSerializer } from "@tiptap/pm/model"
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
          useReadFind.getState().show()
          close()
        }}
      >
        Find
      </MenuButton>
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
      <ReadFindBox />
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

/** Find in Read Mode: the box in the read bar, how many it found, and the way to the next and the previous. */
function ReadFindBox() {
  const open = useReadFind((state) => state.open)
  const query = useReadFind((state) => state.query)
  const count = useReadFind((state) => state.count)
  const current = useReadFind((state) => state.current)
  const { hide, setQuery, move } = useReadFind.getState()
  if (!open) {
    return null
  }
  return (
    <div className="read-find flex items-center gap-1" role="search">
      <Search aria-hidden className="size-3.5 opacity-70" />
      <input
        autoFocus
        type="search"
        aria-label="Find in document"
        placeholder="Find"
        className="h-6 w-44 rounded border border-[var(--app-divider)] bg-[var(--app-ribbon-card)] px-1.5 text-xs"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            move(event.shiftKey ? -1 : 1)
          } else if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            hide()
          }
        }}
      />
      <span className="w-16 text-center text-[11px] opacity-80" aria-live="polite">
        {query ? (count ? `${current + 1} of ${count}` : "No results") : ""}
      </span>
      <button
        type="button"
        aria-label="Previous result"
        className="inline-flex size-6 items-center justify-center rounded hover:bg-[var(--app-hover)] disabled:opacity-40"
        disabled={count === 0}
        onClick={() => move(-1)}
      >
        <ChevronUp className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Next result"
        className="inline-flex size-6 items-center justify-center rounded hover:bg-[var(--app-hover)] disabled:opacity-40"
        disabled={count === 0}
        onClick={() => move(1)}
      >
        <ChevronDown className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Close Find"
        className="inline-flex size-6 items-center justify-center rounded hover:bg-[var(--app-hover)]"
        onClick={hide}
      >
        <X className="size-3.5" />
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
  // The text is written out once per change of the document, not on every transaction (a selection, a decoration):
  // writing out a long document is the slowest thing Read Mode does.
  const doc = useEditorState({
    editor,
    selector: ({ editor: current }) => current?.state.doc ?? null,
    equalityFn: (a, b) => a === b,
  })
  // Written straight into this page's DOM: a string, or nodes built in another document and moved over, took seconds
  // for a long document on a phone.
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (body && editor && doc) {
      body.replaceChildren(DOMSerializer.fromSchema(editor.schema).serializeFragment(doc.content, { document }))
    }
  }, [editor, doc])

  // No selection is left in the hidden editor while reading: with one there, every frame that changed anything (each
  // page turn) had the browser work through the whole hidden document, a quarter second a frame in a long book on a
  // phone. The editor keeps its own selection and puts it back when editing goes on.
  useEffect(() => {
    const dom = editor?.view?.dom
    if (!dom) {
      return
    }
    const clear = () => {
      const selection = document.getSelection()
      if (selection?.anchorNode && dom.contains(selection.anchorNode)) {
        selection.removeAllRanges()
      }
    }
    clear()
    document.addEventListener("selectionchange", clear)
    return () => document.removeEventListener("selectionchange", clear)
  }, [editor])

  const html = doc
  const scrollerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null)
  const lastTurn = useRef(0)
  const flipping = useRef<Turning | null>(null)

  const measure = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) {
      return
    }
    // The text's own width, not the scroller's: the spacer below must not hold the count up when the text shrinks.
    setPages(readPageCount(bodyRef.current?.scrollWidth ?? scroller.scrollWidth, scroller.clientWidth))
    setPage(readPageAt(scroller.scrollLeft, scroller.clientWidth))
  }, [])

  const goToPage = useCallback((next: number) => {
    const scroller = scrollerRef.current
    if (!scroller) {
      return
    }
    const last = readPageCount(bodyRef.current?.scrollWidth ?? scroller.scrollWidth, scroller.clientWidth) - 1
    const target = Math.max(0, Math.min(last, next))
    const from = readPageAt(scroller.scrollLeft, scroller.clientWidth)
    const left = target * readPageStep(scroller.clientWidth)
    if (target === from) {
      return
    }
    flipPage(scroller, left, target > from ? "forward" : "back", flipping)
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

  // The page turn's copy of the text, made just after the read view first shows (a long book takes a moment), so the
  // first turn need not wait for it.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) {
      return
    }
    const handle = window.setTimeout(() => prepareCurl(scroller), 300)
    return () => window.clearTimeout(handle)
  }, [html, columnWidth, pages])

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

  // Find: every match highlighted, the current one more strongly, and the page turned to it.
  const findQuery = useReadFind((state) => state.query)
  const findCurrent = useReadFind((state) => state.current)
  const findOpen = useReadFind((state) => state.open)
  const matches = useRef<Range[]>([])
  // Find belongs to this visit to Read Mode.
  useEffect(() => () => useReadFind.getState().hide(), [])
  useEffect(() => {
    const body = bodyRef.current
    const nodes: Text[] = []
    if (body && findOpen && findQuery) {
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        nodes.push(node as Text)
      }
    }
    matches.current = findInPieces(
      nodes.map((node) => node.data),
      findOpen ? findQuery : "",
    ).map((match) => {
      const range = document.createRange()
      range.setStart(nodes[match.start.piece]!, match.start.offset)
      range.setEnd(nodes[match.end.piece]!, match.end.offset)
      return range
    })
    useReadFind.getState().setCount(matches.current.length)
    const highlights = typeof CSS !== "undefined" && "highlights" in CSS ? CSS.highlights : null
    if (highlights && typeof Highlight !== "undefined") {
      highlights.set("read-find", new Highlight(...matches.current))
    }
    return () => {
      highlights?.delete("read-find")
      highlights?.delete("read-find-current")
    }
  }, [html, findQuery, findOpen])
  useEffect(() => {
    const range = matches.current[findCurrent]
    const scroller = scrollerRef.current
    const body = bodyRef.current
    if (!range || !scroller || !body || typeof range.getBoundingClientRect !== "function") {
      return
    }
    const highlights = typeof CSS !== "undefined" && "highlights" in CSS ? CSS.highlights : null
    if (highlights && typeof Highlight !== "undefined") {
      highlights.set("read-find-current", new Highlight(range))
    }
    const left = range.getBoundingClientRect().left - body.getBoundingClientRect().left
    goToPage(Math.floor(left / readPageStep(scroller.clientWidth)))
  }, [findCurrent, findQuery, findOpen, goToPage, pages])

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
          onPointerDown={(event) => {
            const scroller = scrollerRef.current
            if (event.pointerType === "mouse" || !scroller) {
              return
            }
            followSwipe(event.nativeEvent, scroller, {
              pages: () => readPageCount(bodyRef.current?.scrollWidth ?? scroller.scrollWidth, scroller.clientWidth),
              flipping,
              turned: () => {
                lastTurn.current = performance.now()
              },
              turn,
            })
          }}
          onClick={(event) => {
            const target = event.target as HTMLElement
            if (target instanceof HTMLImageElement) {
              setZoomed({ src: target.currentSrc || target.src, alt: target.alt })
              return
            }
            // A tap near either edge of a touch screen turns the page too; a swipe that just turned it is not a tap.
            const touch = (event.nativeEvent as PointerEvent).pointerType === "touch"
            const scroller = scrollerRef.current
            if (!touch || !scroller || target.closest("a") || performance.now() - lastTurn.current < 400) {
              return
            }
            const box = scroller.getBoundingClientRect()
            const at = (event.clientX - box.left) / box.width
            if (at < 0.22) {
              turn(-1)
            } else if (at > 0.78) {
              turn(1)
            }
          }}
        >
          <div ref={bodyRef} className="read-body page-editor" style={{ columnWidth: colWidth, columnGap: gap }} />
          {/* The last page is a whole screen even when its columns do not fill it, so it never shows the one before. */}
          <span
            aria-hidden
            className="read-end"
            style={{ left: Math.max(0, pages * readPageStep(scrollerRef.current?.clientWidth ?? 0) - gap - 1) }}
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
        <span className="read-status-text">
          Page {Math.min(page + 1, pages)} of {pages}
        </span>
      </div>
      {zoomed ? (
        <div className="read-zoom" role="dialog" aria-label="Image" onClick={() => setZoomed(null)}>
          <img src={zoomed.src} alt={zoomed.alt} />
        </div>
      ) : null}
    </div>
  )
}

/** Turns to the page at `left`: folded over like paper where the browser can (`startCurl`), otherwise at once. */
function flipPage(
  scroller: HTMLElement,
  left: number,
  direction: "forward" | "back",
  flipping: { current: Turning | null },
) {
  if (!canCurl()) {
    scroller.scrollLeft = left
    return
  }
  startCurl(scroller, left, direction, flipping).release(true)
}

type SwipeHelp = {
  pages: () => number
  flipping: { current: Turning | null }
  turned: () => void
  turn: (direction: 1 | -1) => void
}

/**
 * A finger on the page: dragged sideways, the page folds over with it, the fold under the finger (`startCurl`); let go past
 * a third of the page, or flicked, it turns the rest of the way, otherwise it falls back. Where the page turn cannot
 * follow a finger (no View Transitions, reduced motion), the swipe turns the page once it ends.
 */
function followSwipe(down: PointerEvent, scroller: HTMLElement, help: SwipeHelp) {
  const startX = down.clientX
  const startY = down.clientY
  const id = down.pointerId
  const width = scroller.clientWidth || 1
  const canFollow = canCurl()
  let scrub: Curl | null = null
  let decided = false
  let last = { x: startX, t: performance.now() }
  let speed = 0

  const move = (event: PointerEvent) => {
    if (event.pointerId !== id) {
      return
    }
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    const now = performance.now()
    speed = (event.clientX - last.x) / Math.max(1, now - last.t)
    last = { x: event.clientX, t: now }
    if (!decided) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        return
      }
      decided = true
      // Up and down is not a page turn.
      if (Math.abs(dx) < Math.abs(dy) * 1.2) {
        stop()
        return
      }
      const from = readPageAt(scroller.scrollLeft, width)
      const target = from + (dx < 0 ? 1 : -1)
      if (!canFollow || target < 0 || target >= help.pages()) {
        return
      }
      help.turned()
      const grip = startY - scroller.getBoundingClientRect().top
      scrub = startCurl(scroller, target * readPageStep(width), dx < 0 ? "forward" : "back", help.flipping, grip)
    }
    scrub?.follow(dx, dy)
  }

  const up = (event: PointerEvent) => {
    if (event.pointerId !== id) {
      return
    }
    stop()
    const dx = event.clientX - startX
    if (scrub) {
      help.turned()
      const forward = scrub.direction === "forward"
      const along = forward ? -dx : dx
      const flick = (forward ? -speed : speed) > 0.5
      scrub.release(event.type === "pointerup" && along > 0 && (along > width / 3 || flick))
    } else if (!canFollow && decided && event.type === "pointerup" && Math.abs(dx) > 40) {
      help.turned()
      help.turn(dx < 0 ? 1 : -1)
    }
  }

  function stop() {
    window.removeEventListener("pointermove", move)
    window.removeEventListener("pointerup", up)
    window.removeEventListener("pointercancel", up)
  }
  // On the window: while the page turns, the turning picture lies over the page and takes the events.
  window.addEventListener("pointermove", move)
  window.addEventListener("pointerup", up)
  window.addEventListener("pointercancel", up)
}
