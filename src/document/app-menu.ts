import { useRewrite } from "@/ai/rewrite"
import { useAiSettings } from "@/ai/settings"
import { captureTemplatePlace } from "@/ai/template-place"
import { useBackstage } from "@/document/backstage"
import { getDocumentEditor } from "@/document/editor-ref"
import {
  closeDocument,
  newDocumentWindow,
  openDocument,
  openRecentDocument,
  saveDocument,
  saveDocumentAs,
} from "@/document/commands"
import { documentName, useDocumentStore } from "@/document/store"
import { useHelp } from "@/document/help"
import { useViewStore } from "@/document/view"
import { notePointer, zoomGesture } from "@/document/zoom-gesture"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { isMacPlatform, isTauriRuntime } from "@/lib/platform"
import { useEffect } from "react"

export function useDocumentCommands() {
  const recentFiles = useDocumentStore((state) => state.recentFiles)

  useEffect(() => {
    void installApplicationMenu()
  }, [recentFiles])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "F1" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        event.preventDefault()
        useHelp.getState().openHelp("help")
        return
      }
      // Word's Ctrl+F1 collapses the ribbon to a single line and shows it whole again.
      if (event.key === "F1" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault()
        useViewStore.getState().toggleRibbonLayout()
        return
      }

      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return
      }

      // Word's Ctrl+W and Ctrl+F4 close the document (the browser keeps Ctrl+W for its own tab).
      if ((event.key.toLowerCase() === "w" || event.key === "F4") && !event.shiftKey) {
        event.preventDefault()
        void closeDocument()
        return
      }

      const key = event.key.toLowerCase()
      // With no document open only Open and New are left to do.
      if (useBackstage.getState().closed && key !== "o" && key !== "n") {
        return
      }

      // Undo and Redo reach the document from the ribbon and its menus too, as in Word; fields keep their own.
      if ((key === "z" || key === "y") && !isTextField(event.target)) {
        const editor = getDocumentEditor()
        if (editor && !editor.view.hasFocus()) {
          event.preventDefault()
          const redo = key === "y" || event.shiftKey
          editor.chain().focus()[redo ? "redo" : "undo"]().run()
          return
        }
      }

      if (key === "o") {
        event.preventDefault()
        openDocument()
        return
      }

      if (key === "n" && !event.shiftKey) {
        event.preventDefault()
        newDocumentWindow()
        return
      }

      if (key === "s") {
        event.preventDefault()
        if (event.shiftKey) {
          saveDocumentAs()
        } else {
          saveDocument()
        }
        return
      }

      // Word's Ctrl+P is File > Print, with its preview and settings; the Print button there prints.
      if (key === "p" && !event.shiftKey) {
        event.preventDefault()
        useBackstage.getState().openBackstage("print")
        return
      }

      if (key === "f" && !event.shiftKey) {
        event.preventDefault()
        useViewStore.getState().openFind(false)
        return
      }

      if (key === "h" && !event.shiftKey) {
        event.preventDefault()
        useViewStore.getState().openFind(true)
        return
      }

      if (key === "g" && !event.shiftKey) {
        event.preventDefault()
        useViewStore.getState().openGoTo()
        return
      }

      // Ctrl+= and Ctrl+Shift+= are Word's subscript and superscript, so only the numeric keypad zooms in.
      if (event.code === "NumpadAdd") {
        event.preventDefault()
        useViewStore.getState().setZoom(useViewStore.getState().zoom + 0.1)
        return
      }

      if (event.code === "Minus" || event.code === "NumpadSubtract") {
        event.preventDefault()
        useViewStore.getState().setZoom(useViewStore.getState().zoom - 0.1)
        return
      }

      if ((event.code === "Digit0" || event.code === "Numpad0") && !event.shiftKey) {
        event.preventDefault()
        useViewStore.getState().setZoom(1)
        return
      }

      // Ctrl+J justifies, as in Word; the AI template builder moved to Ctrl+Shift+J.
      if (key === "j" && event.shiftKey) {
        event.preventDefault()
        if (useAiSettings.getState().running || useRewrite.getState().open) {
          return
        }
        const editor = getDocumentEditor()
        if (editor) {
          captureTemplatePlace(editor.state.selection.from, editor.state.selection.to)
        }
        useAiSettings.getState().setBuilderOpen(true)
        return
      }

      // Word: Ctrl+Shift+8 (Win/Linux) / Cmd+8 (macOS). Also Ctrl+* / Cmd+*.
      const toggleMarks = event.code === "Digit8" || event.key === "*" || event.code === "NumpadMultiply"
      if (toggleMarks && (isMacPlatform || event.shiftKey || event.key === "*" || event.code === "NumpadMultiply")) {
        event.preventDefault()
        useViewStore.getState().toggleFormattingMarks()
      }
    }

    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) {
        return
      }

      event.preventDefault()
      // A touchpad pinch arrives as Ctrl+wheel with small deltas and follows the fingers; a mouse wheel notch
      // (about 100px) steps 10%.
      if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL && Math.abs(event.deltaY) < 50) {
        zoomGesture(Math.exp(-event.deltaY / 100), { x: event.clientX, y: event.clientY })
        return
      }
      const step = event.deltaY < 0 ? 0.1 : -0.1
      zoomGesture((zoom) => zoom + step, { x: event.clientX, y: event.clientY })
    }

    window.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("wheel", onWheel, { passive: false })
    window.addEventListener("pointermove", notePointer, { passive: true })
    // The desktop app on Linux claims the pinch before the webview can zoom the whole window (src-tauri/src/pinch.rs).
    let stopPinch: (() => void) | undefined
    let stopped = false
    if (isTauriRuntime()) {
      // Sent to this window only: each window zooms its own document.
      void getCurrentWebviewWindow()
        .listen<number>("document-pinch", (event) => zoomGesture(event.payload))
        .then((unlisten) => {
          if (stopped) {
            unlisten()
          } else {
            stopPinch = unlisten
          }
        })
    }
    return () => {
      stopped = true
      stopPinch?.()
      window.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("wheel", onWheel)
      window.removeEventListener("pointermove", notePointer)
    }
  }, [])
}

function isTextField(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.matches("input, textarea, select") ||
      Boolean(target.closest("[contenteditable]")))
  )
}

async function installApplicationMenu() {
  if (!isTauriRuntime() || !isMacPlatform) {
    return
  }

  const recent = useDocumentStore.getState().recentFiles
  const recentItems =
    recent.length > 0
      ? [
          { item: "Separator" as const },
          {
            text: "Open Recent",
            items: recent.map((path, index) => ({
              id: `recent-${index}`,
              text: documentName(path),
              action: () => openRecentDocument(path),
            })),
          },
        ]
      : []

  const { Menu, Submenu } = await import("@tauri-apps/api/menu")
  const file = await Submenu.new({
    text: "File",
    items: [
      {
        id: "open",
        text: "Open…",
        accelerator: "CmdOrCtrl+O",
        action: () => openDocument(),
      },
      {
        id: "save",
        text: "Save",
        accelerator: "CmdOrCtrl+S",
        action: () => saveDocument(),
      },
      {
        id: "save-as",
        text: "Save As…",
        accelerator: "CmdOrCtrl+Shift+S",
        action: () => saveDocumentAs(),
      },
      {
        id: "print",
        text: "Print…",
        accelerator: "CmdOrCtrl+P",
        action: () => useBackstage.getState().openBackstage("print"),
      },
      ...recentItems,
    ],
  })
  const menu = await Menu.new({ items: [file] })
  // The borderless window keeps its own File menu. On macOS the same commands
  // also belong in the system menu bar.
  await menu.setAsAppMenu()
}
