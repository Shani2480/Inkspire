import { DocumentName } from "@/components/document-name"
import { QuickAccessToolbar } from "@/components/quick-access"
import { useBackstage } from "@/document/backstage"
import { documentTitle, useDocumentStore } from "@/document/store"
import { themeBackgroundStyle } from "@/document/theme"
import { useViewStore } from "@/document/view"
import { isMacPlatform, isTauriRuntime } from "@/lib/platform"
import { TellMeSearch } from "@/tell-me/tell-me-search"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { Minus, Share2, Square, SquareSquare, User, X } from "lucide-react"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"

export const AUTOSAVE_TIP =
  "AutoSave keeps a recovery copy of your unsaved changes every few seconds, so you can get them back from Unsaved Documents if the app closes unexpectedly. It never overwrites your file: use Save (Ctrl+S) for that."

function AutoSaveToggle() {
  const autoSave = useViewStore((state) => state.autoSave)
  const toggleAutoSave = useViewStore((state) => state.toggleAutoSave)

  return (
    <button
      type="button"
      role="switch"
      aria-checked={autoSave}
      aria-label="AutoSave"
      title={AUTOSAVE_TIP}
      className="titlebar-controls inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-white/95 hover:bg-white/10"
      onClick={toggleAutoSave}
    >
      <span
        aria-hidden
        className={`relative inline-flex h-3.5 w-7 shrink-0 items-center rounded-full transition-colors ${
          autoSave ? "bg-[var(--app-theme-primary)]" : "bg-white/35"
        }`}
      >
        <span
          className={`size-2.5 rounded-full bg-white shadow-sm transition-transform ${
            autoSave ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className="titlebar-autosave-label">AutoSave</span>
      <span className={`titlebar-autosave-label text-[11px] ${autoSave ? "text-white" : "text-white/70"}`}>
        {autoSave ? "On" : "Off"}
      </span>
    </button>
  )
}

/**
 * The author's name at the right of the title bar. Clicking it opens a flyout to change the name that comments,
 * tracked changes and the document's properties carry; it is kept for the app (as the Author name in Options is).
 */
function AuthorName() {
  const openBackstage = useBackstage((state) => state.openBackstage)
  const author = useDocumentStore((state) => state.documentProps.author)
  const setDocumentProps = useDocumentStore((state) => state.setDocumentProps)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(author)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputId = useId()

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

  function commit() {
    setDocumentProps({ author: draft.trim() })
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Account"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={author ? `${author} — change name` : "Set your name"}
        className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-white hover:bg-white/10"
        onClick={() => {
          setDraft(author)
          setOpen((value) => !value)
        }}
      >
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-white/20">
          <User className="size-3.5" strokeWidth={1.75} />
        </span>
        <span className="titlebar-account-label max-w-[7rem] truncate">{author || "Account"}</span>
      </button>
      {open ? (
        <div className="author-flyout" role="dialog" aria-label="Author">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              commit()
            }}
          >
            <label htmlFor={inputId} className="document-name-label">
              Author name
            </label>
            <input
              id={inputId}
              autoFocus
              value={draft}
              maxLength={80}
              placeholder="Your name"
              className="document-name-input w-full"
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setDraft(event.target.value)}
            />
            <p className="document-name-muted mt-2">Comments and tracked changes you make are signed with this name.</p>
            <div className="author-flyout-actions">
              <button
                type="button"
                className="document-name-row"
                onClick={() => {
                  setOpen(false)
                  openBackstage("account")
                }}
              >
                Account
              </button>
              <span className="flex-1" />
              <button type="submit" className="dialog-btn is-primary">
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}

function TitleBarActions() {
  const openBackstage = useBackstage((state) => state.openBackstage)

  return (
    <div className="titlebar-controls relative z-10 flex items-center gap-0.5">
      <button
        type="button"
        aria-label="Share"
        title="Share"
        className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium text-white hover:bg-white/10"
        onClick={() => openBackstage("share")}
      >
        <Share2 className="size-3.5" strokeWidth={1.75} />
        <span className="titlebar-share-label">Share</span>
      </button>
      <AuthorName />
    </div>
  )
}

function currentWindow() {
  if (!isTauriRuntime()) {
    return null
  }

  return getCurrentWindow()
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false)
  const currentFilePath = useDocumentStore((state) => state.currentFilePath)
  const fileName = useDocumentStore((state) => state.fileName)
  const isDirty = useDocumentStore((state) => state.isDirty)
  const saving = useDocumentStore((state) => state.saving)
  const themeBackground = useViewStore((state) => state.themeBackground)
  const colorMode = useViewStore((state) => state.colorMode)
  const title = documentTitle(currentFilePath ?? fileName, isDirty, saving)

  useEffect(() => {
    document.title = title
    const appWindow = currentWindow()
    if (!appWindow) {
      return
    }

    void appWindow.setTitle(title).catch(() => undefined)
  }, [title])

  useEffect(() => {
    const appWindow = currentWindow()
    if (!appWindow) {
      return
    }

    let disposed = false
    let unlisten: (() => void) | undefined

    void appWindow.isMaximized().then((value) => {
      if (!disposed) {
        setMaximized(value)
      }
    })

    void appWindow
      .onResized(() => {
        void appWindow.isMaximized().then((value) => {
          if (!disposed) {
            setMaximized(value)
          }
        })
      })
      .then((dispose) => {
        if (disposed) {
          dispose()
        } else {
          unlisten = dispose
        }
      })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  function toggleMaximize() {
    void currentWindow()?.toggleMaximize()
  }

  // The File screen is not the document: its commands, Search and Share would act on a page that is out of sight.
  const inFileView = useBackstage((state) => state.open)

  return (
    <header
      // Every empty part of the title bar drags the window, and a double click there maximizes or restores it. The
      // desktop shell does both (its drag script skips buttons, fields and other controls), so there is no
      // double-click handler here: a second one would toggle the window straight back.
      data-tauri-drag-region="deep"
      className="titlebar relative h-10 shrink-0 text-white select-none"
      style={themeBackgroundStyle(themeBackground, colorMode)}
    >
      <div className="titlebar-start titlebar-controls relative z-10 flex min-w-0 items-center gap-0.5 pl-1">
        {isMacPlatform ? <MacControls onMaximize={toggleMaximize} /> : null}
        {inFileView ? null : (
          <>
            <AutoSaveToggle />
            <QuickAccessToolbar />
          </>
        )}
      </div>
      {/* The document's name, at the window's true centre; it is the last thing to give way as the window narrows. */}
      <div className="titlebar-middle relative z-10 flex min-w-0 items-center justify-center px-2">
        <DocumentName />
      </div>
      <div className="titlebar-end relative z-10 flex min-w-0 items-center justify-end gap-1">
        {inFileView ? null : (
          <>
            <div className="titlebar-search">
              <TellMeSearch />
            </div>
            <TitleBarActions />
          </>
        )}
        {isMacPlatform ? (
          <span className="w-2" />
        ) : (
          <WindowControls maximized={maximized} onMaximize={toggleMaximize} />
        )}
      </div>
    </header>
  )
}

function MacControls({ onMaximize }: { onMaximize: () => void }) {
  return (
    <div className="titlebar-controls relative z-10 flex items-center gap-2 pl-3">
      <MacButton label="Close" tone="close" onClick={() => void currentWindow()?.close()} />
      <MacButton label="Minimize" tone="minimize" onClick={() => void currentWindow()?.minimize()} />
      <MacButton label="Maximize" tone="maximize" onClick={onMaximize} />
    </div>
  )
}

function MacButton({
  label,
  tone,
  onClick,
}: {
  label: string
  tone: "close" | "minimize" | "maximize"
  onClick: () => void
}) {
  const toneClass = {
    close: "bg-[#ff5f57]",
    minimize: "bg-[#febc2e]",
    maximize: "bg-[#28c840]",
  }[tone]

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`size-3 rounded-full ${toneClass} transition-opacity hover:opacity-80`}
      onClick={onClick}
    />
  )
}

function WindowControls({ maximized, onMaximize }: { maximized: boolean; onMaximize: () => void }) {
  return (
    <div className="titlebar-controls relative z-10 flex h-full items-stretch">
      <ControlButton label="Minimize" onClick={() => void currentWindow()?.minimize()}>
        <Minus className="size-3.5" strokeWidth={1.75} />
      </ControlButton>
      <ControlButton label={maximized ? "Restore" : "Maximize"} onClick={onMaximize}>
        {maximized ? (
          <SquareSquare className="size-3.5" strokeWidth={1.75} />
        ) : (
          <Square className="size-3" strokeWidth={1.75} />
        )}
      </ControlButton>
      <ControlButton label="Close" danger onClick={() => void currentWindow()?.close()}>
        <X className="size-4" strokeWidth={1.75} />
      </ControlButton>
    </div>
  )
}

function ControlButton({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-10 w-11 items-center justify-center text-white transition-colors ${
        danger ? "hover:bg-red-600" : "hover:bg-white/10"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
