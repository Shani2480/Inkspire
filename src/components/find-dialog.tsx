import { DialogFrame } from "@/components/word-dialog"
import { useViewStore, type FindTab } from "@/document/view"
import { GO_TO_KINDS, goTo, type GoToKind } from "@/editor/go-to"
import { FIND_DEFAULTS, findTextRanges, replaceTextRanges, SPECIAL_CHARACTERS, type FindOptions } from "@/editor/find"
import { useBodyEditor } from "@/editor/document-editor"
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
  const editor = useBodyEditor()
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
  const [options, setOptions] = useState<FindOptions>(FIND_DEFAULTS)
  const [more, setMore] = useState(false)
  const [direction, setDirection] = useState<"all" | "down" | "up">("all")
  const [specialOpen, setSpecialOpen] = useState(false)
  /** The field Special puts its code into: the last of Find what and Replace with to have focus. */
  const lastField = useRef<"find" | "replace">("find")
  const [message, setMessage] = useState("")
  const [index, setIndex] = useState(0)
  /** How many matches the last Replace All changed; shown in place of the match count until the search changes. */
  const [replacedCount, setReplacedCount] = useState<number | null>(null)
  const [revision, setRevision] = useState(0)
  const shown = useRef(false)

  const ranges = useMemo(() => {
    if (!editor || !open) {
      return []
    }
    return findTextRanges(editor, query, options)
  }, [editor, open, query, options, revision])

  useEffect(() => {
    setIndex(0)
    shown.current = false
    setReplacedCount(null)
    setMessage("")
  }, [query, options, replacement, tab, direction])

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

  /**
   * Find Next from the caret, as Word does: Down and All look after the selection (All goes round to the top), Up
   * before it. Down and Up stop at the document's end or start.
   */
  function findNext() {
    if (!editor) {
      return
    }
    const latest = findTextRanges(editor, query, options)
    if (latest.length === 0) {
      return
    }
    const { from, to } = editor.state.selection
    let found =
      direction === "up"
        ? [...latest].reverse().findIndex((match) => match.to <= from && match.from < from)
        : latest.findIndex((match) => match.from >= to && !(match.from === from && match.to === to))
    if (found >= 0 && direction === "up") {
      found = latest.length - 1 - found
    }
    if (found < 0) {
      if (direction !== "all") {
        setMessage("Inkspire has finished searching the document.")
        return
      }
      found = 0
    }
    setMessage("")
    setIndex(found)
    shown.current = true
    editor.chain().focus().setTextSelection(latest[found]!).scrollIntoView().run()
  }

  function replaceCurrent() {
    if (!editor || ranges.length === 0) {
      return
    }
    // Word replaces the match that is selected, then finds the next; with none selected, Replace first finds one.
    const { from, to } = editor.state.selection
    const current = ranges.find((match) => match.from === from && match.to === to)
    if (current) {
      replaceTextRanges(editor, [current], replacement, options.wildcards)
    }
    findNext()
  }

  function replaceAll() {
    if (!editor) {
      return
    }
    const found = findTextRanges(editor, query, options)
    replaceTextRanges(editor, found, replacement, options.wildcards)
    setIndex(0)
    setReplacedCount(found.length)
  }

  /** Puts a special character's code into the field Special was opened for. */
  function insertSpecial(code: string) {
    setSpecialOpen(false)
    if (lastField.current === "replace" && tab === "replace") {
      setReplacement((value) => value + code)
      replaceRef.current?.focus()
    } else {
      setQuery((value) => value + code)
      findRef.current?.focus()
    }
  }

  const set = (patch: Partial<FindOptions>) => setOptions((current) => ({ ...current, ...patch }))
  // Word's rules for which options go together: wildcards stand alone; sounds like and word forms exclude the rest.
  const byWildcards = options.wildcards
  const byWords = options.soundsLike || options.wordForms
  const disabled: Record<keyof FindOptions, boolean> = {
    matchCase: byWildcards || byWords,
    wholeWord: byWildcards || byWords || /\s/.test(query.trim()),
    wildcards: byWords,
    soundsLike: byWildcards || options.wordForms,
    wordForms: byWildcards || options.soundsLike,
    prefix: byWildcards || byWords,
    suffix: byWildcards || byWords,
    ignorePunctuation: byWildcards || byWords,
    ignoreSpace: byWildcards || byWords,
  }
  const checks: [keyof FindOptions, string][][] = [
    [
      ["matchCase", "Match case"],
      ["wholeWord", "Find whole words only"],
      ["wildcards", "Use wildcards"],
      ["soundsLike", "Sounds like (English)"],
      ["wordForms", "Find all word forms (English)"],
    ],
    [
      ["prefix", "Match prefix"],
      ["suffix", "Match suffix"],
      ["ignorePunctuation", "Ignore punctuation characters"],
      ["ignoreSpace", "Ignore white-space characters"],
    ],
  ]

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
      bodyHeight={tab !== "goto" && more ? 372 : 196}
      onSubmit={() => (tab === "goto" ? jump(1, goToEntry) : findNext())}
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
              onFocus={() => (lastField.current = "find")}
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
                  onFocus={() => (lastField.current = "replace")}
                  onChange={(event) => setReplacement(event.target.value)}
                />
              </>
            ) : null}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            {more ? (
              <span />
            ) : (
              <label className="word-dialog-check">
                <input
                  type="checkbox"
                  checked={options.matchCase}
                  disabled={disabled.matchCase}
                  onChange={(event) => set({ matchCase: event.target.checked })}
                />
                Match case
              </label>
            )}
            <span className="text-[var(--dlg-muted)]" aria-live="polite">
              {message ||
                (replacedCount !== null
                  ? `Replaced ${replacedCount} ${replacedCount === 1 ? "occurrence" : "occurrences"}.`
                  : query
                    ? shown.current && ranges.length > 0
                      ? `${Math.min(index, ranges.length - 1) + 1} of ${ranges.length}`
                      : `${ranges.length} found`
                    : `Type to find (${commandShortcut("F")})`)}
            </span>
          </div>
          {more ? (
            <fieldset className="find-more">
              <legend>Search Options</legend>
              <label className="find-more-direction">
                Search:
                <select
                  className="dialog-input"
                  value={direction}
                  onChange={(event) => setDirection(event.target.value as typeof direction)}
                >
                  <option value="all">All</option>
                  <option value="down">Down</option>
                  <option value="up">Up</option>
                </select>
              </label>
              <div className="find-more-columns">
                {checks.map((column, columnIndex) => (
                  <div key={columnIndex} className="find-more-column">
                    {column.map(([name, label]) => (
                      <label key={name} className="word-dialog-check">
                        <input
                          type="checkbox"
                          checked={options[name] && !disabled[name]}
                          disabled={disabled[name]}
                          onChange={(event) => set({ [name]: event.target.checked })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              <div className="find-more-special">
                <span>{tab === "replace" ? "Replace" : "Find"}</span>
                <button
                  type="button"
                  className="dialog-btn"
                  aria-haspopup="menu"
                  aria-expanded={specialOpen}
                  onClick={() => setSpecialOpen((value) => !value)}
                >
                  Special ▾
                </button>
                {specialOpen ? (
                  <div className="find-special-menu" role="menu" aria-label="Special">
                    {SPECIAL_CHARACTERS.filter((item) =>
                      lastField.current === "replace" && tab === "replace" ? item.replace : item.find,
                    ).map((item) => (
                      <button key={item.code} type="button" role="menuitem" onClick={() => insertSpecial(item.code)}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </fieldset>
          ) : null}
        </>
      )}
      <div className="word-dialog-actions">
        {tab !== "goto" ? (
          <button type="button" className="dialog-btn" onClick={() => setMore((value) => !value)}>
            {more ? "<< Less" : "More >>"}
          </button>
        ) : null}
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
