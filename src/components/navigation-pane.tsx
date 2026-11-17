import { useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { useEditorState } from "@tiptap/react"
import type { Editor } from "@tiptap/core"
import { ChevronDown, ChevronRight, ChevronUp, Search, X } from "lucide-react"
import { useBodyEditor } from "@/editor/document-editor"
import { useViewStore } from "@/document/view"
import { findMatches } from "@/editor/find"
import { currentHeading, headingSections, moveSection, type HeadingSection } from "@/editor/heading-sections"
import { setSearchHighlight } from "@/editor/search-highlight"
import { pageSheets, placeCopy, printCopy } from "@/document/print-copy"
import { registerNavigationSearch } from "@/document/nav-search"

type NavTab = "headings" | "pages" | "results"

const RESULT_CONTEXT = 36

/**
 * Word's Navigation pane: a search box that highlights every match and lists them under Results, the headings as a
 * tree (collapsible; drag one to move its section), and the pages as thumbnails.
 */
export function NavigationPane() {
  const open = useViewStore((state) => state.navPane)
  const editor = useBodyEditor()
  return open && editor ? <Pane editor={editor} /> : null
}

function Pane({ editor }: { editor: Editor }) {
  const setNavPane = useViewStore((state) => state.setNavPane)
  const [tab, setTab] = useState<NavTab>("headings")
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(-1)
  const field = useRef<HTMLInputElement>(null)

  const doc = useEditorState({ editor, selector: ({ editor: current }) => current.state.doc })
  const caret = useEditorState({ editor, selector: ({ editor: current }) => current.state.selection.from })
  const sections = useMemo(() => (doc ? headingSections(doc) : []), [doc])
  const matches = useMemo(() => (doc && query ? findMatches(doc, query) : []), [doc, query])

  useEffect(
    () =>
      registerNavigationSearch((text) => {
        if (text) {
          setQuery(text)
          setTab("results")
        }
        window.requestAnimationFrame(() => {
          field.current?.focus()
          field.current?.select()
        })
      }),
    [],
  )

  useEffect(() => {
    setSearchHighlight(editor, query)
    setActive(-1)
  }, [editor, query])

  // The highlight goes when the pane closes.
  useEffect(() => () => setSearchHighlight(editor, ""), [editor])

  const show = (index: number) => {
    const match = matches[(index + matches.length) % matches.length]
    if (!match) {
      return
    }
    setActive((index + matches.length) % matches.length)
    editor.chain().focus().setTextSelection(match).scrollIntoView().run()
  }

  const current = currentHeading(sections, caret ?? 0)
  // Word marks the headings whose sections hold a match.
  const hitHeadings = useMemo(() => {
    const hits = new Set<number>()
    for (const match of matches) {
      const heading = currentHeading(sections, match.from)
      if (heading) {
        hits.add(heading.pos)
      }
    }
    return hits
  }, [matches, sections])

  return (
    <aside aria-label="Navigation Pane" className="nav-pane">
      <div className="nav-pane-head">
        <span>Navigation</span>
        <button
          type="button"
          className="nav-pane-icon"
          aria-label="Close Navigation Pane"
          onClick={() => setNavPane(false)}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="nav-pane-search">
        <Search className="size-3.5 opacity-60" aria-hidden />
        <input
          ref={field}
          value={query}
          placeholder="Search document"
          aria-label="Search document"
          onChange={(event) => {
            setQuery(event.target.value)
            if (event.target.value) {
              setTab("results")
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              show(event.shiftKey ? active - 1 : active + 1)
            } else if (event.key === "Escape") {
              setQuery("")
            }
          }}
        />
        {query ? (
          <button type="button" className="nav-pane-icon" aria-label="Clear search" onClick={() => setQuery("")}>
            <X className="size-3" />
          </button>
        ) : null}
      </div>
      <div className="nav-pane-status" aria-live="polite">
        {query ? (
          <>
            <span>
              {matches.length === 0
                ? "No matches"
                : active >= 0
                  ? `Result ${active + 1} of ${matches.length}`
                  : `${matches.length} ${matches.length === 1 ? "result" : "results"}`}
            </span>
            <button
              type="button"
              className="nav-pane-icon"
              aria-label="Previous result"
              disabled={!matches.length}
              onClick={() => show(active - 1)}
            >
              <ChevronUp className="size-3.5" />
            </button>
            <button
              type="button"
              className="nav-pane-icon"
              aria-label="Next result"
              disabled={!matches.length}
              onClick={() => show(active + 1)}
            >
              <ChevronDown className="size-3.5" />
            </button>
          </>
        ) : null}
      </div>
      <div className="nav-pane-tabs" role="tablist" aria-label="Navigation">
        {(["headings", "pages", "results"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "is-active" : undefined}
            onClick={() => setTab(id)}
          >
            {id === "headings" ? "Headings" : id === "pages" ? "Pages" : "Results"}
          </button>
        ))}
      </div>
      <div className="nav-pane-body" role="tabpanel">
        {tab === "headings" ? (
          <HeadingTree editor={editor} sections={sections} current={current?.pos ?? -1} hits={hitHeadings} />
        ) : tab === "pages" ? (
          <PageThumbnails editor={editor} />
        ) : (
          <Results editor={editor} matches={matches} query={query} active={active} onShow={show} />
        )}
      </div>
    </aside>
  )
}

function HeadingTree({
  editor,
  sections,
  current,
  hits,
}: {
  editor: Editor
  sections: HeadingSection[]
  current: number
  hits: Set<number>
}) {
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set())
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | "end" | null>(null)

  if (sections.length === 0) {
    return (
      <p className="nav-pane-empty">
        Create an interactive outline of your document. It's a great way to keep track of where you are or quickly move
        your content around. To get started, go to the Home tab and apply Heading styles to the headings in your
        document.
      </p>
    )
  }

  // A heading is hidden while one above it, at a higher level, is collapsed.
  const visible: { section: HeadingSection; hasChildren: boolean }[] = []
  let hiddenBelow: number | null = null
  sections.forEach((section, index) => {
    if (hiddenBelow !== null && section.level > hiddenBelow) {
      return
    }
    hiddenBelow = null
    const next = sections[index + 1]
    const hasChildren = !!next && next.level > section.level
    visible.push({ section, hasChildren })
    if (hasChildren && collapsed.has(section.pos)) {
      hiddenBelow = section.level
    }
  })

  const drop = (event: DragEvent, before: number | null) => {
    event.preventDefault()
    if (dragging !== null) {
      moveSection(editor, dragging, before)
    }
    setDragging(null)
    setOver(null)
  }

  return (
    <ul className="nav-pane-tree" role="tree" aria-label="Headings">
      {visible.map(({ section, hasChildren }) => {
        const isCollapsed = collapsed.has(section.pos)
        return (
          <li
            key={`${section.pos}-${section.text}`}
            role="treeitem"
            aria-level={section.level}
            aria-expanded={hasChildren ? !isCollapsed : undefined}
            aria-selected={section.pos === current}
            className={[
              "nav-pane-heading",
              section.pos === current ? "is-current" : "",
              hits.has(section.pos) ? "has-hit" : "",
              over === section.pos ? "is-drop-target" : "",
            ].join(" ")}
            style={{ paddingLeft: 4 + (section.level - 1) * 14 }}
            draggable={section.movable}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move"
              event.dataTransfer.setData("text/plain", section.text)
              setDragging(section.pos)
            }}
            onDragEnd={() => {
              setDragging(null)
              setOver(null)
            }}
            onDragOver={(event) => {
              if (dragging !== null && section.movable) {
                event.preventDefault()
                setOver(section.pos)
              }
            }}
            onDrop={(event) => drop(event, section.pos)}
          >
            <button
              type="button"
              className="nav-pane-twisty"
              aria-label={isCollapsed ? `Expand ${section.text}` : `Collapse ${section.text}`}
              style={{ visibility: hasChildren ? "visible" : "hidden" }}
              onClick={() =>
                setCollapsed((currentSet) => {
                  const next = new Set(currentSet)
                  if (next.has(section.pos)) {
                    next.delete(section.pos)
                  } else {
                    next.add(section.pos)
                  }
                  return next
                })
              }
            >
              {isCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
            </button>
            <button
              type="button"
              className="nav-pane-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .setTextSelection(section.pos + 1)
                  .scrollIntoView()
                  .run()
              }
            >
              {section.text}
            </button>
          </li>
        )
      })}
      {dragging !== null ? (
        <li
          className={over === "end" ? "nav-pane-end is-drop-target" : "nav-pane-end"}
          onDragOver={(event) => {
            event.preventDefault()
            setOver("end")
          }}
          onDrop={(event) => drop(event, null)}
        >
          Move to the end
        </li>
      ) : null}
    </ul>
  )
}

function Results({
  editor,
  matches,
  query,
  active,
  onShow,
}: {
  editor: Editor
  matches: ReturnType<typeof findMatches>
  query: string
  active: number
  onShow: (index: number) => void
}) {
  if (!query) {
    return <p className="nav-pane-empty">Search for text, then see each place it appears here.</p>
  }
  if (matches.length === 0) {
    return <p className="nav-pane-empty">We couldn't find what you're looking for.</p>
  }
  const doc = editor.state.doc
  return (
    <ul className="nav-pane-results" aria-label="Results">
      {matches.slice(0, 500).map((match, index) => {
        const block = doc.resolve(match.from)
        const start = Math.max(block.start(), match.from - RESULT_CONTEXT)
        const end = Math.min(doc.resolve(match.to).end(), match.to + RESULT_CONTEXT)
        const before = doc.textBetween(start, match.from, " ", " ")
        const after = doc.textBetween(match.to, end, " ", " ")
        return (
          <li key={`${match.from}-${match.to}`}>
            <button
              type="button"
              className={index === active ? "is-active" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onShow(index)}
            >
              {start > block.start() ? "…" : ""}
              {before}
              <mark>{match.text.replace(/\u2029/g, " ¶ ")}</mark>
              {after}
              {end < doc.resolve(match.to).end() ? "…" : ""}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** The pages as small copies of the drawn pages; a page is copied only while its thumbnail is in view. */
function PageThumbnails({ editor }: { editor: Editor }) {
  const [count, setCount] = useState(0)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let timer = 0
    const measure = () => {
      const canvas = document.querySelector<HTMLElement>(".page-canvas")
      setCount(canvas ? pageSheets(canvas).length : 0)
      setVersion((value) => value + 1)
    }
    measure()
    // Thumbnails follow edits after a pause, not on every keystroke.
    const later = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(measure, 800)
    }
    editor.on("update", later)
    return () => {
      window.clearTimeout(timer)
      editor.off("update", later)
    }
  }, [editor])

  if (count === 0) {
    return <p className="nav-pane-empty">Pages show in Print Layout.</p>
  }
  return (
    <div className="nav-pane-pages">
      {Array.from({ length: count }, (_, index) => (
        <PageThumbnail key={index} index={index} version={version} />
      ))}
    </div>
  )
}

const THUMB_WIDTH = 150

function PageThumbnail({ index, version }: { index: number; version: number }) {
  const box = useRef<HTMLButtonElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const element = box.current
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), { rootMargin: "200px" })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const canvas = document.querySelector<HTMLElement>(".page-canvas")
  const sheet = canvas ? pageSheets(canvas)[index] : undefined
  const width = parseFloat(sheet?.style.width ?? "") || 816
  const height = parseFloat(sheet?.style.height ?? "") || 1056
  const scale = THUMB_WIDTH / width

  useEffect(() => {
    const element = box.current?.querySelector<HTMLElement>(".nav-pane-page-paper")
    if (!element || !visible || !canvas) {
      return
    }
    const copy = printCopy(canvas)
    if (!copy) {
      return
    }
    placeCopy(copy, index)
    element.replaceChildren(copy)
    return () => element.replaceChildren()
  }, [visible, version, index, canvas])

  return (
    <button
      ref={box}
      type="button"
      className="nav-pane-page"
      aria-label={`Page ${index + 1}`}
      onClick={() => sheet?.scrollIntoView({ block: "start", behavior: "smooth" })}
    >
      <span className="nav-pane-page-frame" style={{ width: THUMB_WIDTH, height: height * scale }} data-keep-light="">
        <span className="nav-pane-page-paper" style={{ width, height, transform: `scale(${scale})` }} aria-hidden />
      </span>
      <span className="nav-pane-page-number">{index + 1}</span>
    </button>
  )
}
