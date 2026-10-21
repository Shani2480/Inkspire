import { confirmCloseDocument, openWindowRequest } from "@/document/commands"
import { keepRecoveryAlive, writeRecoveryDraft } from "@/document/recovery"
import { useEditingOptions } from "@/document/editing-options"
import { documentName, useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { registerWindow, takeWindowRequest } from "@/document/windows"
import { isTauriRuntime } from "@/lib/platform"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect } from "react"

const SNAPSHOT_DEBOUNCE_MS = 1600

export function useAutosave() {
  const autoSave = useViewStore((state) => state.autoSave)
  const recoverySeconds = useEditingOptions((state) => state.recoverySeconds)
  const isDirty = useDocumentStore((state) => state.isDirty)
  const currentFilePath = useDocumentStore((state) => state.currentFilePath)
  const documentHTML = useDocumentStore((state) => state.documentHTML)
  const headerHtml = useDocumentStore((state) => state.headerHtml)
  const footerHtml = useDocumentStore((state) => state.footerHtml)
  const differentFirstPage = useDocumentStore((state) => state.differentFirstPage)
  const firstHeaderHtml = useDocumentStore((state) => state.firstHeaderHtml)
  const evenHeaderHtml = useDocumentStore((state) => state.evenHeaderHtml)
  const firstFooterHtml = useDocumentStore((state) => state.firstFooterHtml)
  const evenFooterHtml = useDocumentStore((state) => state.evenFooterHtml)
  const pageSetup = useDocumentStore((state) => state.pageSetup)

  useEffect(() => keepRecoveryAlive(), [])

  // AutoSave is a safeguard, not a save: it keeps a recovery copy of unsaved changes (IndexedDB, mirrored to
  // AppData on desktop) for Unsaved Documents to offer back, and never writes to the file on disk.
  useEffect(() => {
    if (!autoSave || !isDirty) {
      return
    }

    const write = () => void writeRecoveryDraft().catch(() => undefined)
    // Packing a long document takes a moment, so a timed save waits for a gap in typing; leaving the page cannot wait.
    const flush = () => {
      if (window.requestIdleCallback) {
        window.requestIdleCallback(write, { timeout: 4000 })
      } else {
        write()
      }
    }

    const debounce = window.setTimeout(flush, SNAPSHOT_DEBOUNCE_MS)
    const interval = window.setInterval(flush, recoverySeconds * 1000)

    const onHide = () => write()
    window.addEventListener("pagehide", onHide)
    window.addEventListener("beforeunload", onHide)

    return () => {
      window.clearTimeout(debounce)
      window.clearInterval(interval)
      window.removeEventListener("pagehide", onHide)
      window.removeEventListener("beforeunload", onHide)
    }
  }, [
    autoSave,
    recoverySeconds,
    isDirty,
    documentHTML,
    headerHtml,
    footerHtml,
    differentFirstPage,
    firstHeaderHtml,
    evenHeaderHtml,
    firstFooterHtml,
    evenFooterHtml,
    pageSetup,
    currentFilePath,
  ])
}

/** Asks before the window closes with unsaved changes, as Word does. */
export function useCloseGuard() {
  useEffect(() => {
    if (!isTauriRuntime()) {
      const onBeforeUnload = (event: BeforeUnloadEvent) => {
        if (useDocumentStore.getState().isDirty) {
          event.preventDefault()
        }
      }
      window.addEventListener("beforeunload", onBeforeUnload)
      return () => window.removeEventListener("beforeunload", onBeforeUnload)
    }
    let unlisten: (() => void) | undefined
    let cancelled = false
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (!(await confirmCloseDocument())) {
          event.preventDefault()
        }
      })
      .then((stop) => {
        if (cancelled) {
          stop()
        } else {
          unlisten = stop
        }
      })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])
}

/**
 * Puts this window on the list of open windows (View > Switch Windows), and once the editor is `ready`, opens what
 * the window was opened for.
 */
export function useDocumentWindow(ready: boolean) {
  useEffect(
    () =>
      registerWindow(
        () => {
          const { currentFilePath, isDirty } = useDocumentStore.getState()
          return { name: documentName(currentFilePath), path: currentFilePath, dirty: isDirty }
        },
        (onChange) =>
          useDocumentStore.subscribe((state, previous) => {
            if (
              state.currentFilePath !== previous.currentFilePath ||
              state.fileName !== previous.fileName ||
              state.isDirty !== previous.isDirty
            ) {
              onChange()
            }
          }),
      ),
    [],
  )

  useEffect(() => {
    if (!ready) {
      return
    }
    const request = takeWindowRequest()
    if (request) {
      void openWindowRequest(request)
    }
  }, [ready])
}
