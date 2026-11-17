import { languageName, normalizeDocumentLanguage, wordLanguageTag } from "@/document/languages"
import { useEditingOptions } from "@/document/editing-options"
import { trackingLocked, useReviewStore } from "@/document/review"
import { STATUS_ITEMS, useStatusBar, type StatusItemId } from "@/document/status-bar"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { useBodyEditor } from "@/editor/document-editor"
import { useEditorPane } from "@/editor/grammar"
import { proofingAt } from "@/editor/proofing"
import { listSpellingErrors } from "@/editor/spellcheck"
import { countStats } from "@/editor/word-count"
import { useAccessibility } from "@/ai/accessibility-check"
import { accessibilityStatus } from "@/lib/accessibility"
import { useSettledEditorValue } from "@/editor/use-settled"
import { LanguageDialog, WordCountDialog, ZoomDialog } from "@/components/status-dialogs"
import { useEditorState } from "@tiptap/react"
import type { Editor } from "@tiptap/core"
import { BookOpen, Check, Focus, Minus, Monitor, Plus, Printer } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { useDevice } from "@/lib/device"

type Dialog = "count" | "zoom" | "language" | null

const ITEM = "whitespace-nowrap rounded px-1.5 py-0.5 hover:bg-black/5 dark:hover:bg-white/10"

/**
 * Word's status bar. A click on the page number opens Go To, on the word count Word Count, on the language the
 * Language dialog, on the zoom percentage the Zoom dialog; right-click opens Customize Status Bar.
 */
const PHONE_HIDDEN = {
  section: false,
  characters: false,
  language: false,
  track: false,
  caps: false,
  overtype: false,
  accessibility: false,
  focus: false,
  slider: false,
} as const

export function StatusBar() {
  const editor = useBodyEditor()
  const isDirty = useDocumentStore((state) => state.isDirty)
  const saving = useDocumentStore((state) => state.saving)
  const documentLanguage = useDocumentStore((state) => state.pageSetup.language)
  const zoom = useViewStore((state) => state.zoom)
  const setZoom = useViewStore((state) => state.setZoom)
  const layoutMode = useViewStore((state) => state.layoutMode)
  const setLayoutMode = useViewStore((state) => state.setLayoutMode)
  const focusMode = useViewStore((state) => state.focusMode)
  const setFocusMode = useViewStore((state) => state.setFocusMode)
  const openGoTo = useViewStore((state) => state.openGoTo)
  const spellCheck = useViewStore((state) => state.spellCheck)
  const tracking = useReviewStore((state) => state.tracking)
  const locked = useReviewStore(trackingLocked)
  const chosen = useStatusBar((state) => state.shown)
  // A phone's width holds the page, the words, the views and the zoom; the rest stays in Customize Status Bar's list
  // and in the ribbon (Review > Language, Accessibility; View > Focus).
  const phone = useDevice() === "phone"
  const shown = phone ? { ...chosen, ...PHONE_HIDDEN } : chosen
  const extras = useStatusBar((state) => state.countExtras)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const openAccessibility = useAccessibility((state) => state.openPane)
  const openEditorPane = useEditorPane((state) => state.openPane)
  const capsLock = useCapsLock(shown.caps)
  const counts = useSettledEditorValue(
    editor,
    (current) => (current.schema ? countStats(current, { extras, whole: true }) : null),
    null,
    [extras],
  )
  // The selection's own count, as Word shows "12 of 340 words" while text is selected.
  const picked = useEditorState({
    editor,
    selector: ({ editor: current }) => selectionCounts(current, extras),
  })
  const pages = useEditorState({
    editor,
    selector: ({ editor: current }) => currentPage(current),
  })
  // Counting section breaks up to the caret reads the document, so only while the section is on show.
  const wantSection = shown.section || menu !== null
  const section = useEditorState({
    editor,
    selector: ({ editor: current }) => (wantSection ? sectionAt(current) : 1),
  })
  const caretLanguage = useEditorState({
    editor,
    selector: ({ editor: current }) => (current?.schema ? proofingAt(current.state).lang : null),
  })
  const errors = useSettledEditorValue(
    editor,
    (current) => (current.schema ? listSpellingErrors(current).length : 0),
    0,
    [spellCheck],
    1000,
  )
  const overtype = useEditingOptions((state) => state.overtype)
  const insertKey = useEditingOptions((state) => state.insertKeyOvertype)
  const keepChecking = useEditingOptions((state) => state.keepAccessibilityRunning)
  const access = useSettledEditorValue(
    editor,
    (current) => (keepChecking ? accessibilityStatus(current) : null),
    null,
    [keepChecking],
  )
  const words = counts?.words ?? 0
  const characters = counts?.charactersWithSpaces ?? 0
  const page = pages?.page ?? 1
  const pageCount = pages?.pageCount ?? 1
  const percent = Math.round(zoom * 100)
  const saveLabel = saving ? "Saving..." : isDirty ? "Unsaved" : "Saved"
  const accessLabel = keepChecking ? (access?.label ?? "Accessibility: Good to go") : "Accessibility: Check"
  const accessOk = keepChecking ? (access?.ok ?? true) : true
  const language = languageName(caretLanguage ?? wordLanguageTag(normalizeDocumentLanguage(documentLanguage)))
  const wordLabel = picked
    ? `${picked.words.toLocaleString()} of ${words.toLocaleString()} words`
    : words === 1
      ? "1 word"
      : `${words.toLocaleString()} words`
  const characterLabel = picked
    ? `${picked.characters.toLocaleString()} of ${characters.toLocaleString()} characters`
    : characters === 1
      ? "1 character"
      : `${characters.toLocaleString()} characters`
  const proofingLabel = spellCheck
    ? errors > 0
      ? "Proofing errors were found. Click to correct."
      : "Proofing: No errors"
    : "Proofing: Not checking"
  const trackLabel = `Track Changes: ${tracking ? "On" : "Off"}`

  /** What each Customize Status Bar row shows on its right, as Word does. */
  const values: Partial<Record<StatusItemId, string>> = {
    section: String(section ?? 1),
    page: `Page ${page} of ${pageCount}`,
    words: wordLabel,
    characters: characterLabel,
    spelling: spellCheck ? (errors > 0 ? "Errors" : "No Errors") : "Off",
    language,
    track: tracking ? "On" : "Off",
    caps: capsLock ? "On" : "Off",
    overtype: overtype ? "Overtype" : "Insert",
    accessibility: accessLabel.replace(/^Accessibility: /, ""),
    zoom: `${percent}%`,
  }

  function bumpZoom(delta: number) {
    setZoom((Math.round((zoom * 100 + delta) / 10) * 10) / 100)
  }

  return (
    <footer
      className="app-statusbar relative flex h-6 shrink-0 items-center gap-2 border-t border-[var(--app-statusbar-border)] bg-[var(--app-statusbar-bg)] px-2 text-[12px] text-[var(--app-statusbar-text)]"
      onContextMenu={(event) => {
        event.preventDefault()
        setMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      {shown.section ? <span className="px-1">{`Section: ${section ?? 1}`}</span> : null}
      {shown.page ? (
        <button
          type="button"
          className={ITEM}
          title="Page number in document. Click to open the Go To dialog."
          onClick={openGoTo}
        >
          {`Page ${page} of ${pageCount}`}
        </button>
      ) : null}
      {shown.words ? (
        <button
          type="button"
          className={ITEM}
          title="Word count. Click to open the Word Count dialog."
          onClick={() => setDialog("count")}
        >
          {wordLabel}
        </button>
      ) : null}
      {shown.characters ? (
        <button
          type="button"
          className={`hidden sm:inline ${ITEM}`}
          title="Character count (with spaces). Click to open the Word Count dialog."
          onClick={() => setDialog("count")}
        >
          {characterLabel}
        </button>
      ) : null}
      {shown.spelling ? (
        <button
          type="button"
          aria-label={proofingLabel}
          title={proofingLabel}
          className={`inline-flex items-center ${ITEM}`}
          onClick={openEditorPane}
        >
          <ProofingIcon errors={spellCheck && errors > 0} />
        </button>
      ) : null}
      {shown.language ? (
        <button
          type="button"
          className={ITEM}
          title={`${language}. Click to set the proofing language.`}
          onClick={() => setDialog("language")}
        >
          {language}
        </button>
      ) : null}
      {shown.track ? (
        <button
          type="button"
          aria-pressed={tracking}
          disabled={locked}
          className={`${ITEM} disabled:opacity-60`}
          title="Track Changes. Click to turn it on or off."
          onClick={() => useReviewStore.getState().setTracking(!tracking)}
        >
          {trackLabel}
        </button>
      ) : null}
      {shown.caps && capsLock ? <span className="px-1">Caps Lock</span> : null}
      {shown.overtype || insertKey || overtype ? (
        <button
          type="button"
          className={ITEM}
          title="Click, or press Insert, to switch between Insert and Overtype"
          onClick={() => useEditingOptions.getState().set({ overtype: !overtype })}
        >
          {overtype ? "Overtype" : "Insert"}
        </button>
      ) : null}
      {shown.accessibility ? (
        <button type="button" className={`${ITEM} ${accessOk ? "" : "text-[#c19c00]"}`} onClick={openAccessibility}>
          {accessLabel}
        </button>
      ) : null}
      {shown.focus ? (
        <button
          type="button"
          aria-pressed={focusMode}
          className={`inline-flex items-center gap-1 ${ITEM} ${focusMode ? "bg-black/5 font-medium dark:bg-white/10" : ""}`}
          onClick={() => setFocusMode(!focusMode)}
        >
          <Focus className="size-3" strokeWidth={1.75} />
          Focus
        </button>
      ) : null}

      <div className="ml-auto flex items-center gap-1">
        <span className="mr-1 inline-flex items-center gap-1.5 px-1">
          <span
            aria-hidden
            className={
              saving
                ? "size-1.5 rounded-full bg-[#A19F9D]"
                : isDirty
                  ? "size-1.5 rounded-full bg-[#C19C00]"
                  : "size-1.5 rounded-full bg-[#107C10]"
            }
          />
          {phone ? null : <span>{saveLabel}</span>}
        </span>

        {shown.views ? (
          <>
            <ViewButton
              label="Read Mode"
              active={layoutMode === "read"}
              onClick={() => setLayoutMode(layoutMode === "read" ? "print" : "read")}
            >
              <BookOpen className="size-3.5" strokeWidth={1.75} />
            </ViewButton>
            <ViewButton label="Print Layout" active={layoutMode === "print"} onClick={() => setLayoutMode("print")}>
              <Printer className="size-3.5" strokeWidth={1.75} />
            </ViewButton>
            <ViewButton label="Web Layout" active={layoutMode === "web"} onClick={() => setLayoutMode("web")}>
              <Monitor className="size-3.5" strokeWidth={1.75} />
            </ViewButton>
          </>
        ) : null}

        <div className="ml-1 flex items-center gap-0.5 pl-1">
          {shown.slider ? (
            <>
              <button
                type="button"
                aria-label="Zoom out"
                className="inline-flex size-5 items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => bumpZoom(-10)}
              >
                <Minus className="size-3" strokeWidth={2} />
              </button>
              <input
                type="range"
                min={50}
                max={200}
                step={10}
                value={percent}
                aria-label="Zoom"
                aria-valuemin={50}
                aria-valuemax={200}
                aria-valuenow={percent}
                aria-valuetext={`${percent}%`}
                className="h-1 w-20 cursor-pointer accent-[var(--app-theme-primary)]"
                onChange={(event) => setZoom(Number(event.target.value) / 100)}
              />
              <button
                type="button"
                aria-label="Zoom in"
                className="inline-flex size-5 items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => bumpZoom(10)}
              >
                <Plus className="size-3" strokeWidth={2} />
              </button>
            </>
          ) : null}
          {shown.zoom ? (
            <button
              type="button"
              className={`w-11 text-right tabular-nums ${ITEM}`}
              title="Zoom level. Click to open the Zoom dialog."
              onClick={() => setDialog("zoom")}
            >
              {percent}%
            </button>
          ) : null}
        </div>
      </div>

      {menu ? <CustomizeMenu at={menu} values={values} onClose={() => setMenu(null)} /> : null}
      {dialog === "count" ? <WordCountDialog editor={editor} onClose={() => setDialog(null)} /> : null}
      {dialog === "zoom" ? <ZoomDialog onClose={() => setDialog(null)} /> : null}
      {dialog === "language" ? <LanguageDialog editor={editor} onClose={() => setDialog(null)} /> : null}
    </footer>
  )
}

/** Customize Status Bar: Word's list of items, each ticked when shown, with its current value; it stays open. */
function CustomizeMenu({
  at,
  values,
  onClose,
}: {
  at: { x: number; y: number }
  values: Partial<Record<StatusItemId, string>>
  onClose: () => void
}) {
  const shown = useStatusBar((state) => state.shown)
  const toggle = useStatusBar((state) => state.toggle)
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ left: number; bottom: number } | null>(null)

  useEffect(() => {
    const panel = ref.current
    if (!panel) {
      return
    }
    const width = panel.offsetWidth
    setPlace({
      left: Math.max(8, Math.min(at.x, window.innerWidth - width - 8)),
      bottom: Math.max(8, window.innerHeight - at.y + 4),
    })
    panel.querySelector<HTMLElement>("[role=menuitemcheckbox]")?.focus()
  }, [at])

  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        onClose()
      }
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener("pointerdown", away, true)
    window.addEventListener("keydown", key, true)
    return () => {
      window.removeEventListener("pointerdown", away, true)
      window.removeEventListener("keydown", key, true)
    }
  }, [onClose])

  const move = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") {
      return
    }
    event.preventDefault()
    const rows = [...(ref.current?.querySelectorAll<HTMLElement>("[role=menuitemcheckbox]") ?? [])]
    const at = rows.indexOf(document.activeElement as HTMLElement)
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? rows.length - 1
          : (at + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length
    rows[next]?.focus()
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Customize Status Bar"
      className="status-customize"
      style={place ? { left: place.left, bottom: place.bottom } : { visibility: "hidden", left: 0, bottom: 0 }}
      onKeyDown={move}
    >
      <p className="status-customize-title">Customize Status Bar</p>
      {STATUS_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitemcheckbox"
          aria-checked={shown[item.id]}
          className="status-customize-row"
          onClick={() => toggle(item.id)}
        >
          <span className="status-customize-check" aria-hidden>
            {shown[item.id] ? <Check className="size-3.5" strokeWidth={2} /> : null}
          </span>
          <span className="status-customize-label">{item.label}</span>
          <span className="status-customize-value">{values[item.id] ?? ""}</span>
        </button>
      ))}
    </div>
  )
}

/** Word's proofing book: a tick when nothing was found, a cross when there are errors to correct. */
function ProofingIcon({ errors }: { errors: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
      <path
        d="M2.5 3.5c1.8-.6 3.6-.4 5.5.8v9c-1.9-1.2-3.7-1.4-5.5-.8zM13.5 3.5c-1.8-.6-3.6-.4-5.5.8v9c1.9-1.2 3.7-1.4 5.5-.8z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      {errors ? (
        <path d="M10.5 9.5l4 4m0-4l-4 4" stroke="#c42b1c" strokeWidth="1.5" strokeLinecap="round" />
      ) : (
        <path d="M10 11.5l1.5 1.5 3-3.5" fill="none" stroke="#107c10" strokeWidth="1.5" strokeLinecap="round" />
      )}
    </svg>
  )
}

/** Caps Lock as the keyboard last reported it, followed only while the item is shown. */
function useCapsLock(active: boolean) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!active) {
      return
    }
    const read = (event: KeyboardEvent | MouseEvent) => setOn(event.getModifierState?.("CapsLock") ?? false)
    window.addEventListener("keydown", read, true)
    window.addEventListener("keyup", read, true)
    window.addEventListener("mousedown", read, true)
    return () => {
      window.removeEventListener("keydown", read, true)
      window.removeEventListener("keyup", read, true)
      window.removeEventListener("mousedown", read, true)
    }
  }, [active])
  return on
}

function ViewButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`inline-flex size-5 items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10 ${
        active ? "bg-black/8 text-[#0f6cbd] dark:bg-white/15" : ""
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function selectionCounts(editor: Editor | null, extras: boolean) {
  if (!editor?.schema || editor.isDestroyed || editor.state.selection.empty) {
    return null
  }
  const stats = countStats(editor, { extras })
  return { words: stats.words, characters: stats.charactersWithSpaces }
}

function sectionAt(editor: Editor | null) {
  if (!editor?.schema || editor.isDestroyed) {
    return 1
  }
  const caret = editor.state.selection.from
  let section = 1
  editor.state.doc.nodesBetween(0, caret, (node, pos) => {
    if (node.type.name === "sectionBreak" && pos < caret) {
      section += 1
    }
  })
  return section
}

function currentPage(editor: Editor | null) {
  if (!editor?.schema || editor.isDestroyed) {
    return { page: 1, pageCount: 1 }
  }
  const caret = editor.state.selection.from
  const pagination = editor.storage.pagination
  if (!pagination) {
    return { page: 1, pageCount: 1 }
  }
  let page = 1
  for (const pos of pagination.breaks) {
    if (caret >= pos) {
      page += 1
    }
  }
  return { page, pageCount: pagination.pageCount }
}
