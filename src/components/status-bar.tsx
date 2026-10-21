import { DOCUMENT_LANGUAGES, languageLabel } from "@/document/languages"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { useBodyEditor } from "@/editor/document-editor"
import { useAccessibility } from "@/ai/accessibility-check"
import { accessibilityStatus } from "@/lib/accessibility"
import { useSettledEditorValue } from "@/editor/use-settled"
import { useEditorState } from "@tiptap/react"
import { BookOpen, Focus, Minus, Monitor, Plus, Printer } from "lucide-react"
import { useState } from "react"

export function StatusBar() {
  const editor = useBodyEditor()
  const isDirty = useDocumentStore((state) => state.isDirty)
  const saving = useDocumentStore((state) => state.saving)
  const setup = useDocumentStore((state) => state.pageSetup)
  const setPageSetup = useDocumentStore((state) => state.setPageSetup)
  const zoom = useViewStore((state) => state.zoom)
  const setZoom = useViewStore((state) => state.setZoom)
  const layoutMode = useViewStore((state) => state.layoutMode)
  const setLayoutMode = useViewStore((state) => state.setLayoutMode)
  const focusMode = useViewStore((state) => state.focusMode)
  const setFocusMode = useViewStore((state) => state.setFocusMode)
  const [langOpen, setLangOpen] = useState(false)
  const openAccessibility = useAccessibility((state) => state.openPane)
  const counts = useSettledEditorValue(editor, (current) => countText(current.getText()), countText(""))
  const pages = useEditorState({
    editor,
    selector: ({ editor: current }) => currentPage(current),
  })
  const access = useSettledEditorValue(editor, accessibilityStatus, null)
  const words = counts?.words ?? 0
  const characters = counts?.characters ?? 0
  const page = pages?.page ?? 1
  const pageCount = pages?.pageCount ?? 1
  const percent = Math.round(zoom * 100)
  const saveLabel = saving ? "Saving..." : isDirty ? "Unsaved" : "Saved"
  const accessLabel = access?.label ?? "Accessibility: Good to go"
  const accessOk = access?.ok ?? true

  function bumpZoom(delta: number) {
    setZoom((Math.round((zoom * 100 + delta) / 10) * 10) / 100)
  }

  return (
    <footer className="app-statusbar relative flex h-6 shrink-0 items-center gap-2 border-t border-[var(--app-statusbar-border)] bg-[var(--app-statusbar-bg)] px-2 text-[12px] text-[var(--app-statusbar-text)]">
      <span className="px-1">{`Page ${page} of ${pageCount}`}</span>
      <span className="px-1">{words === 1 ? "1 word" : `${words} words`}</span>
      <span className="hidden px-1 sm:inline">{characters === 1 ? "1 character" : `${characters} characters`}</span>

      <div className="relative">
        <button
          type="button"
          className="rounded px-1.5 py-0.5 hover:bg-black/5 dark:hover:bg-white/10"
          aria-haspopup="listbox"
          aria-expanded={langOpen}
          onClick={() => setLangOpen((value) => !value)}
        >
          {languageLabel(setup.language || "en-US")}
        </button>
        {langOpen ? (
          <div
            className="absolute bottom-full left-0 z-40 mb-1 min-w-[12rem] rounded-md border border-black/10 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#2d2d2d]"
            role="listbox"
            aria-label="Language"
          >
            {DOCUMENT_LANGUAGES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={setup.language === item.id}
                className={`block w-full px-3 py-1.5 text-left text-[12px] hover:bg-black/5 dark:hover:bg-white/10 ${
                  setup.language === item.id ? "font-semibold text-[#0f6cbd]" : ""
                }`}
                onClick={() => {
                  setPageSetup({ ...setup, language: item.id })
                  setLangOpen(false)
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="relative">
        <button
          type="button"
          className={`rounded px-1.5 py-0.5 hover:bg-black/5 dark:hover:bg-white/10 ${accessOk ? "" : "text-[#c19c00]"}`}
          onClick={openAccessibility}
        >
          {accessLabel}
        </button>
      </div>

      <button
        type="button"
        aria-pressed={focusMode}
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-black/5 dark:hover:bg-white/10 ${
          focusMode ? "bg-black/5 font-medium dark:bg-white/10" : ""
        }`}
        onClick={() => setFocusMode(!focusMode)}
      >
        <Focus className="size-3" strokeWidth={1.75} />
        Focus
      </button>

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
          <span>{saveLabel}</span>
        </span>

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

        <div className="ml-1 flex items-center gap-0.5 pl-1">
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
          <span className="w-9 text-right tabular-nums">{percent}%</span>
        </div>
      </div>

      {langOpen ? (
        <button
          type="button"
          aria-label="Dismiss"
          className="fixed inset-0 z-30 cursor-default"
          onClick={() => {
            setLangOpen(false)
          }}
        />
      ) : null}
    </footer>
  )
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
  children: React.ReactNode
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

function currentPage(editor: ReturnType<typeof useBodyEditor>) {
  const pagination = editor?.storage.pagination
  if (!pagination) {
    return { page: 1, pageCount: 1 }
  }

  let page = 1
  for (const pos of pagination.breaks) {
    if ((editor?.state.selection.from ?? 0) >= pos) {
      page += 1
    }
  }
  return { page, pageCount: pagination.pageCount }
}

function countText(text: string) {
  const trimmed = text.trim()
  return {
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    characters: text.length,
  }
}
