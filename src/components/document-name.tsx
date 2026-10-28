import { useBackstage } from "@/document/backstage"
import { documentName, saveStateLabel, useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { isAndroid, isTauriRuntime } from "@/lib/platform"
import { invoke } from "@tauri-apps/api/core"
import { ChevronDown, Copy, History } from "lucide-react"
import { useEffect, useId, useRef, useState, type FormEvent } from "react"

function splitName(name: string) {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? { stem: name.slice(0, dot), ext: name.slice(dot) } : { stem: name, ext: "" }
}

/** "Saved", "Saving…", "Unsaved", or nothing for a new document not yet changed, as Word's title shows. */
export function saveStateText(path: string | null, isDirty: boolean, saving: boolean) {
  if (!path && !isDirty && !saving) {
    return ""
  }
  const label = saveStateLabel(isDirty, saving)
  return label === "Saved" && path && isTauriRuntime()
    ? isAndroid
      ? "Saved to this device"
      : "Saved to this PC"
    : label
}

/**
 * The open document's name in the middle of the title bar, with its save state, as in Word. Clicking it shows the
 * name to rename, where the file is, and Version History.
 */
export function DocumentName() {
  const path = useDocumentStore((state) => state.currentFilePath)
  const fileName = useDocumentStore((state) => state.fileName)
  const isDirty = useDocumentStore((state) => state.isDirty)
  const saving = useDocumentStore((state) => state.saving)
  const name = documentName(path ?? fileName)
  const { stem, ext } = splitName(name)
  const state = saveStateText(path, isDirty, saving)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener("pointerdown", onDown, true)
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("keydown", onKey, true)
    }
  }, [open])

  return (
    <div ref={rootRef} className="titlebar-controls document-name relative z-20 min-w-0">
      <button
        type="button"
        className="document-name-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={path ?? name}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="document-name-text" aria-live="polite">
          {stem}
        </span>
        {state ? (
          <span className="document-name-state">
            <span aria-hidden> • </span>
            {state}
          </span>
        ) : null}
        <ChevronDown className="size-3.5 shrink-0 opacity-80" strokeWidth={2} />
      </button>
      {open ? <NameFlyout path={path} stem={stem} ext={ext} onClose={() => setOpen(false)} /> : null}
    </div>
  )
}

function NameFlyout({
  path,
  stem,
  ext,
  onClose,
}: {
  path: string | null
  stem: string
  ext: string
  onClose: () => void
}) {
  const [draft, setDraft] = useState(stem)
  const [error, setError] = useState("")
  const autoSave = useViewStore((state) => state.autoSave)
  const openBackstage = useBackstage((state) => state.openBackstage)
  const inputId = useId()
  const folder = path ? path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))) : ""

  const rename = async (event: FormEvent) => {
    event.preventDefault()
    const next = draft.trim()
    if (!next || next === stem) {
      onClose()
      return
    }
    if (/[\\/:*?"<>|]/.test(next)) {
      setError("A file name can't contain \\ / : * ? \" < > |")
      return
    }
    if (!path || !isTauriRuntime()) {
      useDocumentStore.getState().renamed(null, `${next}${ext}`)
      onClose()
      return
    }
    const separator = path.includes("\\") && !path.includes("/") ? "\\" : "/"
    const target = `${folder}${separator}${next}${ext}`
    try {
      await invoke("rename_document", { from: path, to: target })
      useDocumentStore.getState().renamed(target, `${next}${ext}`)
      onClose()
    } catch (problem) {
      setError(String(problem))
    }
  }

  return (
    <div className="document-name-flyout" role="dialog" aria-label="Document name">
      <form onSubmit={(event) => void rename(event)}>
        <label htmlFor={inputId} className="document-name-label">
          File Name
        </label>
        <div className="flex items-center gap-1">
          <input
            id={inputId}
            autoFocus
            value={draft}
            spellCheck={false}
            className="document-name-input"
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => {
              setDraft(event.target.value)
              setError("")
            }}
          />
          {ext ? <span className="document-name-ext">{ext}</span> : null}
        </div>
        {error ? (
          <p role="alert" className="document-name-error">
            {error}
          </p>
        ) : null}
      </form>
      <div className="document-name-label mt-3">Location</div>
      {path ? (
        <div className="flex items-center gap-1">
          <span className="document-name-path" title={path}>
            {folder || path}
          </span>
          <button
            type="button"
            className="document-name-icon"
            aria-label="Copy path"
            title="Copy path"
            onClick={() => void navigator.clipboard?.writeText(path).catch(() => undefined)}
          >
            <Copy className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
      ) : (
        <p className="document-name-muted">Not saved yet. Save to choose where it goes.</p>
      )}
      <div className="document-name-divider" />
      <button
        type="button"
        className="document-name-row"
        onClick={() => {
          onClose()
          openBackstage("history")
        }}
      >
        <History className="size-4" strokeWidth={1.75} />
        Version History
      </button>
      <p className="document-name-muted mt-1">AutoSave is {autoSave ? "on" : "off"}.</p>
    </div>
  )
}
