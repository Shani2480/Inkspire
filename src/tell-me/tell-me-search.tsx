import { getDocumentEditor } from "@/document/editor-ref"
import { useDocumentStore } from "@/document/store"
import { useDocumentEditor } from "@/editor/document-editor"
import { searchTellMeCommands, type TellMeCommand } from "@/tell-me/commands"
import { jumpToDocumentHit, searchDocumentText, type DocumentSearchHit } from "@/tell-me/document-search"
import {
  loadTellMeHistory,
  loadTellMeScopes,
  pushTellMeHistory,
  saveTellMeScopes,
  tellMeSearchHint,
  TELL_ME_SCOPE_OPTIONS,
  type TellMeScope,
  type TellMeScopes,
} from "@/tell-me/settings"
import { Clock3, Search, SlidersHorizontal } from "lucide-react"
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"

type FlatItem =
  | { kind: "history"; query: string }
  | { kind: "command"; command: TellMeCommand }
  | { kind: "document"; hit: DocumentSearchHit }

let focusTellMeInput: (() => void) | null = null

export function focusTellMe() {
  focusTellMeInput?.()
}

export function TellMeSearch() {
  const inputId = useId()
  const listId = useId()
  const optionsId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const optionsRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null)
  const [optionsStyle, setOptionsStyle] = useState<CSSProperties | null>(null)
  const [scopes, setScopes] = useState<TellMeScopes>(() => loadTellMeScopes())
  const [history, setHistory] = useState<string[]>(() => loadTellMeHistory())
  const editor = useDocumentEditor()
  const documentHTML = useDocumentStore((state) => state.documentHTML)

  const trimmed = query.trim()
  const idle = trimmed.length === 0

  const commands = useMemo(
    () => (scopes.commands && !idle ? searchTellMeCommands(query, 10) : []),
    [query, scopes.commands, idle],
  )
  const documentHits = useMemo(
    () =>
      idle
        ? []
        : searchDocumentText(editor, query, {
            text: scopes.text,
            comments: scopes.comments,
            bookmarks: scopes.bookmarks,
          }),
    [editor, query, documentHTML, scopes.text, scopes.comments, scopes.bookmarks, idle],
  )
  const textHits = useMemo(() => documentHits.filter((hit) => hit.source === "text"), [documentHits])
  const commentHits = useMemo(() => documentHits.filter((hit) => hit.source === "comment"), [documentHits])
  const bookmarkHits = useMemo(() => documentHits.filter((hit) => hit.source === "bookmark"), [documentHits])

  const items = useMemo<FlatItem[]>(() => {
    if (idle) {
      return history.map((entry) => ({ kind: "history" as const, query: entry }))
    }
    const next: FlatItem[] = []
    if (scopes.commands) {
      for (const command of commands) {
        next.push({ kind: "command", command })
      }
    }
    for (const hit of documentHits) {
      next.push({ kind: "document", hit })
    }
    return next
  }, [idle, history, scopes.commands, commands, documentHits])

  useEffect(() => {
    setActive(0)
  }, [query, open, history.length, scopes])

  useEffect(() => {
    focusTellMeInput = () => {
      setOpen(true)
      setOptionsOpen(false)
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    return () => {
      if (focusTellMeInput) {
        focusTellMeInput = null
      }
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey) {
        return
      }
      if (event.altKey && event.key.toLowerCase() === "q") {
        event.preventDefault()
        focusTellMe()
      }
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [])

  const showPanel = open

  useLayoutEffect(() => {
    if (!showPanel) {
      setPanelStyle(null)
      return
    }

    function updatePosition() {
      const anchor = rootRef.current?.getBoundingClientRect() ?? inputRef.current?.getBoundingClientRect()
      if (!anchor) {
        return
      }
      const width = Math.min(400, window.innerWidth - 16)
      const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - 8)
      setPanelStyle({
        position: "fixed",
        top: anchor.bottom + 6,
        left,
        width,
        zIndex: 10_000,
      })
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [showPanel, query, items.length, optionsOpen])

  useLayoutEffect(() => {
    if (!optionsOpen) {
      setOptionsStyle(null)
      return
    }

    function updatePosition() {
      const anchor = rootRef.current?.getBoundingClientRect()
      if (!anchor) {
        return
      }
      const width = 240
      const left = Math.min(Math.max(8, anchor.right - width), window.innerWidth - width - 8)
      setOptionsStyle({
        position: "fixed",
        top: anchor.bottom + 6,
        left,
        width,
        zIndex: 10_001,
      })
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [optionsOpen])

  useEffect(() => {
    if (!open && !optionsOpen) {
      return
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (
        rootRef.current?.contains(target) ||
        panelRef.current?.contains(target) ||
        optionsRef.current?.contains(target)
      ) {
        return
      }
      setOpen(false)
      setOptionsOpen(false)
    }
    window.addEventListener("mousedown", onPointerDown)
    return () => window.removeEventListener("mousedown", onPointerDown)
  }, [open, optionsOpen])

  function closeAndBlur() {
    setOpen(false)
    setOptionsOpen(false)
    inputRef.current?.blur()
    getDocumentEditor()?.commands.focus()
  }

  function remember(value: string) {
    setHistory(pushTellMeHistory(value))
  }

  function runItem(item: FlatItem) {
    if (item.kind === "history") {
      setQuery(item.query)
      setOpen(true)
      setActive(0)
      inputRef.current?.focus()
      return
    }
    if (item.kind === "command") {
      remember(query || item.command.label)
      setOpen(false)
      setOptionsOpen(false)
      setQuery("")
      item.command.run()
      return
    }
    const current = getDocumentEditor()
    if (!current) {
      return
    }
    remember(query)
    jumpToDocumentHit(current, item.hit)
    setOpen(false)
    setOptionsOpen(false)
    setQuery("")
  }

  function toggleScope(id: TellMeScope) {
    setScopes((current) => {
      const next = { ...current, [id]: !current[id] }
      saveTellMeScopes(next)
      return next
    })
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const item = items[active]
    if (item) {
      runItem(item)
      return
    }
    if (trimmed) {
      remember(trimmed)
    }
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault()
      if (optionsOpen) {
        setOptionsOpen(false)
        return
      }
      closeAndBlur()
      return
    }
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      setOpen(true)
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      if (items.length === 0) {
        return
      }
      setActive((value) => (value + 1) % items.length)
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      if (items.length === 0) {
        return
      }
      setActive((value) => (value - 1 + items.length) % items.length)
    }
  }

  let optionIndex = -1
  const hint = tellMeSearchHint(scopes)

  const panel =
    showPanel && panelStyle && !optionsOpen
      ? createPortal(
          <div
            ref={panelRef}
            id={listId}
            role="listbox"
            aria-label="Tell Me results"
            style={panelStyle}
            className="tell-me-panel overflow-hidden rounded-lg border border-[var(--app-popover-border)] bg-[var(--app-popover-bg)] text-[var(--app-ribbon-text)] shadow-[0_16px_48px_rgba(0,0,0,0.28)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="max-h-[min(420px,60vh)] overflow-y-auto py-1">
              {idle ? (
                <section className="px-1 pb-1">
                  <h3 className="tell-me-section-label px-2.5 py-1.5 text-[11px] font-semibold tracking-wide text-[var(--app-ribbon-muted)] uppercase">
                    Recent
                  </h3>
                  {history.length === 0 ? (
                    <p className="px-2.5 py-2 text-[12px] leading-snug text-[var(--app-ribbon-muted)]">{hint}</p>
                  ) : (
                    history.map((entry) => {
                      optionIndex += 1
                      const index = optionIndex
                      return (
                        <button
                          key={entry}
                          id={`${listId}-option-${index}`}
                          type="button"
                          role="option"
                          aria-selected={active === index}
                          className={`tell-me-option flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left ${
                            active === index ? "bg-[var(--app-hover)]" : "hover:bg-[var(--app-hover)]"
                          }`}
                          onMouseEnter={() => setActive(index)}
                          onClick={() => runItem({ kind: "history", query: entry })}
                        >
                          <Clock3 className="size-3.5 shrink-0 text-[var(--app-ribbon-muted)]" strokeWidth={2} />
                          <span className="truncate text-[13px]">{entry}</span>
                        </button>
                      )
                    })
                  )}
                </section>
              ) : (
                <>
                  {scopes.commands ? (
                    <ResultSection title="Commands" empty="No matching commands">
                      {commands.map((command) => {
                        optionIndex += 1
                        const index = optionIndex
                        return (
                          <ResultButton
                            key={command.id}
                            id={`${listId}-option-${index}`}
                            active={active === index}
                            onHover={() => setActive(index)}
                            onClick={() => runItem({ kind: "command", command })}
                            title={command.label}
                            subtitle={command.description}
                          />
                        )
                      })}
                    </ResultSection>
                  ) : null}

                  {scopes.text ? (
                    <ResultSection title="Document Text" empty="No matches in document text" bordered>
                      {textHits.map((hit) => {
                        optionIndex += 1
                        const index = optionIndex
                        return (
                          <DocumentResultButton
                            key={hit.id}
                            id={`${listId}-option-${index}`}
                            hit={hit}
                            active={active === index}
                            onHover={() => setActive(index)}
                            onClick={() => runItem({ kind: "document", hit })}
                          />
                        )
                      })}
                    </ResultSection>
                  ) : null}

                  {scopes.comments ? (
                    <ResultSection title="Comments" empty="No matching comments" bordered>
                      {commentHits.map((hit) => {
                        optionIndex += 1
                        const index = optionIndex
                        return (
                          <DocumentResultButton
                            key={hit.id}
                            id={`${listId}-option-${index}`}
                            hit={hit}
                            active={active === index}
                            onHover={() => setActive(index)}
                            onClick={() => runItem({ kind: "document", hit })}
                          />
                        )
                      })}
                    </ResultSection>
                  ) : null}

                  {scopes.bookmarks ? (
                    <ResultSection title="Bookmarks" empty="No matching bookmarks" bordered>
                      {bookmarkHits.map((hit) => {
                        optionIndex += 1
                        const index = optionIndex
                        return (
                          <DocumentResultButton
                            key={hit.id}
                            id={`${listId}-option-${index}`}
                            hit={hit}
                            active={active === index}
                            onHover={() => setActive(index)}
                            onClick={() => runItem({ kind: "document", hit })}
                          />
                        )
                      })}
                    </ResultSection>
                  ) : null}

                  {!scopes.commands && !scopes.text && !scopes.comments && !scopes.bookmarks ? (
                    <p className="px-3 py-3 text-[12px] text-[var(--app-ribbon-muted)]">{hint}</p>
                  ) : null}
                </>
              )}
            </div>
          </div>,
          document.body,
        )
      : null

  const optionsPanel =
    optionsOpen && optionsStyle
      ? createPortal(
          <div
            ref={optionsRef}
            id={optionsId}
            role="dialog"
            aria-label="Tell Me search options"
            style={optionsStyle}
            className="tell-me-options overflow-hidden rounded-lg border border-[var(--app-popover-border)] bg-[var(--app-popover-bg)] text-[var(--app-ribbon-text)] shadow-[0_16px_48px_rgba(0,0,0,0.28)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[var(--app-popover-border)] px-3 py-2">
              <p className="text-[12px] font-semibold">Search options</p>
              <p className="mt-0.5 text-[11px] text-[var(--app-ribbon-muted)]">Choose what Tell Me looks through.</p>
            </div>
            <div className="flex flex-col gap-0.5 p-1.5">
              {TELL_ME_SCOPE_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--app-hover)]"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 size-3.5 accent-[var(--app-theme-primary,#0f6cbd)]"
                    checked={scopes[option.id]}
                    onChange={() => toggleScope(option.id)}
                  />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium">{option.label}</span>
                    <span className="block text-[11px] text-[var(--app-ribbon-muted)]">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div ref={rootRef} className="titlebar-controls tell-me relative z-20 flex w-full max-w-[400px] items-center gap-1">
      <form className="min-w-0 flex-1" onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <label className="relative flex w-full items-center" htmlFor={inputId}>
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-white/70" strokeWidth={2} />
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            value={query}
            placeholder="Search (Alt + Q)"
            aria-label="Tell Me search"
            aria-controls={listId}
            aria-expanded={showPanel && !optionsOpen}
            aria-autocomplete="list"
            aria-activedescendant={items[active] ? `${listId}-option-${active}` : undefined}
            role="combobox"
            className="h-7 w-full rounded-md border border-white/20 bg-white/10 pr-3 pl-8 text-[12px] text-white placeholder:text-white/65 outline-none hover:bg-white/15 focus:border-white/40 focus:bg-white/18"
            onChange={(event) => {
              setQuery(event.target.value)
              setOpen(true)
              setOptionsOpen(false)
            }}
            onFocus={() => {
              setOpen(true)
              setHistory(loadTellMeHistory())
            }}
            onKeyDown={onKeyDown}
          />
        </label>
      </form>
      <button
        type="button"
        aria-label="Tell Me search options"
        aria-expanded={optionsOpen}
        aria-controls={optionsId}
        title="Search options"
        className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-white/20 text-white/85 outline-none hover:bg-white/15 focus-visible:border-white/40 ${
          optionsOpen ? "bg-white/18" : "bg-white/10"
        }`}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => {
          setOptionsOpen((value) => !value)
          setOpen(false)
        }}
      >
        <SlidersHorizontal className="size-3.5" strokeWidth={2} />
      </button>
      {panel}
      {optionsPanel}
    </div>
  )
}

function ResultSection({
  title,
  empty,
  bordered = false,
  children,
}: {
  title: string
  empty: string
  bordered?: boolean
  children: ReactNode
}) {
  const count = Array.isArray(children) ? children.length : children ? 1 : 0
  return (
    <section className={`px-1 pb-1 ${bordered ? "border-t border-[var(--app-popover-border)] pt-1" : ""}`}>
      <h3 className="tell-me-section-label px-2.5 py-1.5 text-[11px] font-semibold tracking-wide text-[var(--app-ribbon-muted)] uppercase">
        {title}
      </h3>
      {count === 0 ? <p className="px-2.5 py-1.5 text-[12px] text-[var(--app-ribbon-muted)]">{empty}</p> : children}
    </section>
  )
}

function ResultButton({
  id,
  active,
  onHover,
  onClick,
  title,
  subtitle,
}: {
  id: string
  active: boolean
  onHover: () => void
  onClick: () => void
  title: string
  subtitle: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={active}
      className={`tell-me-option flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-left ${
        active ? "bg-[var(--app-hover)]" : "hover:bg-[var(--app-hover)]"
      }`}
      onMouseEnter={onHover}
      onClick={onClick}
    >
      <span className="text-[13px] font-medium">{title}</span>
      <span className="line-clamp-2 text-[11px] text-[var(--app-ribbon-muted)]">{subtitle}</span>
    </button>
  )
}

function DocumentResultButton({
  id,
  hit,
  active,
  onHover,
  onClick,
}: {
  id: string
  hit: DocumentSearchHit
  active: boolean
  onHover: () => void
  onClick: () => void
}) {
  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={active}
      className={`tell-me-option flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-left ${
        active ? "bg-[var(--app-hover)]" : "hover:bg-[var(--app-hover)]"
      }`}
      onMouseEnter={onHover}
      onClick={onClick}
    >
      <span className="text-[12px] text-[var(--app-ribbon-text)]">
        <Snippet text={hit.snippet} start={hit.matchStart} end={hit.matchEnd} />
      </span>
      <span className="text-[11px] text-[var(--app-ribbon-muted)]">{hit.location}</span>
    </button>
  )
}

function Snippet({ text, start, end }: { text: string; start: number; end: number }) {
  const safeStart = Math.max(0, Math.min(start, text.length))
  const safeEnd = Math.max(safeStart, Math.min(end, text.length))
  return (
    <>
      {text.slice(0, safeStart)}
      <strong className="font-semibold text-[var(--app-theme-primary)]">{text.slice(safeStart, safeEnd)}</strong>
      {text.slice(safeEnd)}
    </>
  )
}
