import { DialogFrame } from "@/components/word-dialog"
import { useViewStore, type FindTab } from "@/document/view"
import { GO_TO_KINDS, goTo, type GoToKind } from "@/editor/go-to"
import { findTextRanges, replaceTextRanges } from "@/editor/find"
import { useDocumentEditor } from "@/editor/document-editor"
import { commandShortcut } from "@/lib/platform"
import { useEffect, useId, useMemo, useRef, useState } from "react"

let pendingFind = ""

const FIND_TABS = [
  { id: "find", label: "Find" },
  { id: "replace", label: "Replace" },
  { id: "goto", label: "Go To" },
]

export function findSelection(text: string) {
  pendingFind = text.trim().slice(0, 80)
  useViewStore.getState().openFind(false)
}

export function FindDialog() {
  const editor = useDocumentEditor()
  const open = useViewStore((state) => state.findOpen)
  const tab = useViewStore((state) => state.findTab)
  const setTab = useViewStore((state) => state.setFindTab)
  const closeFind = useViewStore((state) => state.closeFind)
  const titleId = useId()
  const findRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)
  const goToRef = useRef<HTMLInputElement>(null)
  const [goToKind, setGoToKind] = useState<GoToKind>("page")
  const [goToEntry, setGoToEntry] = useState("")
  const [goToMessage, setGoToMessage] = useState("")
  const [query, setQuery] = useState("")
  const [replacement, setReplacement] = useState("")
  const [matchCase, setMatchCase] = useState(false)
  const [index, setIndex] = useState(0)
  const [revision, setRevision] = useState(0)
  const shown = useRef(false)

  const ranges = useMemo(() => {
    if (!editor || !open) {
      return []
    }
    return findTextRanges(editor, query, matchCase)
  }, [editor, open, query, matchCase, revision])

  useEffect(() => {
    setIndex(0)
    shown.current = false
  }, [query, matchCase])

  useEffect(() => {
    if (!editor || !open) {
      return
    }
    const bump = () => setRevision((value) => value + 1)
    editor.on("update", bump)
    return () => {
      editor.off("update", bump)
    }
  }, [editor, open])

  useEffect(() => {
    if (!open) {
      return
    }
    if (pendingFind) {
      setQuery(pendingFind)
      pendingFind = ""
    }
    const frame = window.requestAnimationFrame(() => {
      const field = tab === "goto" ? goToRef.current : tab === "replace" ? replaceRef.current : findRef.current
      field?.focus()
      field?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, tab])

  if (!open) {
    return null
  }

  function showMatch(nextIndex: number) {
    if (!editor) {
      return
    }
    const latest = findTextRanges(editor, query, matchCase)
    if (latest.length === 0) {
      return
    }
    const wrapped = (nextIndex + latest.length) % latest.length
    setIndex(wrapped)
    shown.current = true
    editor.chain().focus().setTextSelection(latest[wrapped]).scrollIntoView().run()
  }

  function replaceCurrent() {
    if (!editor || ranges.length === 0) {
      return
    }
    const current = ranges[Math.min(index, ranges.length - 1)]
    replaceTextRanges(editor, [current], replacement)
    const next = findTextRanges(editor, query, matchCase)
    if (next.length === 0) {
      setIndex(0)
      return
    }
    const wrapped = Math.min(index, next.length - 1)
    setIndex(wrapped)
    editor.chain().focus().setTextSelection(next[wrapped]).scrollIntoView().run()
  }

  function replaceAll() {
    if (!editor) {
      return
    }
    replaceTextRanges(editor, findTextRanges(editor, query, matchCase), replacement)
    setIndex(0)
  }

  const none = !query || ranges.length === 0
  const kind = GO_TO_KINDS.find((item) => item.id === goToKind) ?? GO_TO_KINDS[0]

  function jump(direction: 1 | -1, entry = "") {
    if (editor && !goTo(editor, goToKind, entry, direction)) {
      setGoToMessage(`No ${kind.label.toLowerCase()} found there.`)
    } else {
      setGoToMessage("")
    }
  }

  return (
    <DialogFrame
      title="Find and Replace"
      width={480}
      onClose={closeFind}
      tabs={FIND_TABS}
      tab={tab}
      onTab={(next) => setTab(next as FindTab)}
      bodyClassName="flex flex-col"
      bodyHeight={196}
      onSubmit={() => (tab === "goto" ? jump(1, goToEntry) : showMatch(shown.current ? index + 1 : index))}
    >
      {tab === "goto" ? (
        <div className="grid grid-cols-[150px_1fr] gap-x-4">
          <label htmlFor={`${titleId}-kind`} className="mb-1">
            Go to what:
          </label>
          <label htmlFor={`${titleId}-entry`} className="mb-1">
            {kind.prompt}
          </label>
          <select
            id={`${titleId}-kind`}
            size={6}
            value={goToKind}
            className="word-dialog-goto-list"
            onChange={(event) => {
              setGoToKind(event.target.value as GoToKind)
              setGoToMessage("")
            }}
          >
            {GO_TO_KINDS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <div className="flex flex-col gap-2">
            <input
              id={`${titleId}-entry`}
              ref={goToRef}
              value={goToEntry}
              aria-label={kind.prompt}
              className="dialog-input"
              onChange={(event) => {
                setGoToEntry(event.target.value)
                setGoToMessage("")
              }}
            />
            <p className="text-[var(--dlg-muted)]" aria-live="polite">
              {goToMessage ||
                (goToKind === "bookmark"
                  ? "Type a bookmark's name, or a number."
                  : "Enter + and - to move relative to the current location. Example: +4 will move forward four items.")}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[88px_1fr] items-center gap-x-2 gap-y-2">
            <label htmlFor={`${titleId}-find`}>Find what:</label>
            <input
              id={`${titleId}-find`}
              ref={findRef}
              value={query}
              aria-label="Find"
              className="dialog-input"
              onChange={(event) => setQuery(event.target.value)}
            />
            {tab === "replace" ? (
              <>
                <label htmlFor={`${titleId}-replace`}>Replace with:</label>
                <input
                  id={`${titleId}-replace`}
                  ref={replaceRef}
                  value={replacement}
                  aria-label="Replace with"
                  className="dialog-input"
                  onChange={(event) => setReplacement(event.target.value)}
                />
              </>
            ) : null}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <label className="word-dialog-check">
              <input type="checkbox" checked={matchCase} onChange={(event) => setMatchCase(event.target.checked)} />
              Match case
            </label>
            <span className="text-[var(--dlg-muted)]" aria-live="polite">
              {query ? `${ranges.length} found` : `Type to find (${commandShortcut("F")})`}
            </span>
          </div>
        </>
      )}
      <div className="word-dialog-actions">
        <span className="flex-1" />
        {tab === "goto" ? (
          <>
            <button type="button" className="dialog-btn" onClick={() => jump(-1)}>
              Previous
            </button>
            <button type="submit" className="dialog-btn is-primary">
              {goToEntry.trim() ? "Go To" : "Next"}
            </button>
          </>
        ) : (
          <>
            {tab === "replace" ? (
              <>
                <button type="button" className="dialog-btn" disabled={none} onClick={replaceCurrent}>
                  Replace
                </button>
                <button type="button" className="dialog-btn" disabled={none} onClick={replaceAll}>
                  Replace All
                </button>
              </>
            ) : null}
            <button type="submit" className="dialog-btn is-primary" disabled={none}>
              Find Next
            </button>
          </>
        )}
        <button type="button" className="dialog-btn" onClick={closeFind}>
          {tab === "goto" ? "Close" : "Cancel"}
        </button>
      </div>
    </DialogFrame>
  )
}
