import { useBackstage } from "@/document/backstage"
import { quitApp } from "@/document/commands"
import { useViewStore } from "@/document/view"
import { SHEETS } from "@/lib/sheet-swipe"

/** What Android's Back does, the first that applies: the thing on top closes, and only last the app asks to quit. */
export type BackStep = "escape" | "sheet" | "backstage" | "file-home" | "read" | "focus" | "quit"

export function backStep(state: {
  overlay: boolean
  sheet: boolean
  backstage: { open: boolean; closable: boolean; tab: string }
  layoutMode: string
  focus: boolean
}): BackStep {
  if (state.overlay) {
    return "escape"
  }
  if (state.sheet) {
    return "sheet"
  }
  if (state.backstage.open) {
    // With no document behind it the File view can't close: Back goes to its first page, then asks to quit.
    if (state.backstage.closable) {
      return "backstage"
    }
    return state.backstage.tab === "home" ? "quit" : "file-home"
  }
  if (state.layoutMode === "read") {
    return "read"
  }
  if (state.focus) {
    return "focus"
  }
  return "quit"
}

/** Menus, dialogs and drop-downs open over the page: each closes on Esc. */
const OVERLAYS = '[role="dialog"], [role="menu"], .command-menu'

function visible(selector: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
    (element) => element.getClientRects().length > 0,
  )
}

/** Android's Back button (MainActivity calls `__inkspireBack`). */
export function goBack() {
  const backstage = useBackstage.getState()
  const view = useViewStore.getState()
  const sheets = visible(SHEETS)
  const step = backStep({
    overlay: visible(OVERLAYS).length > 0,
    sheet: sheets.length > 0,
    backstage: { open: backstage.open, closable: !backstage.closed, tab: backstage.tab },
    layoutMode: view.layoutMode,
    focus: view.focusMode || view.immersive,
  })
  if (step === "escape") {
    const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }),
    )
    // One that doesn't take Esc closes through its own Close button.
    requestAnimationFrame(() => {
      const left = visible(OVERLAYS)
      left[left.length - 1]?.querySelector<HTMLElement>("button[aria-label='Close']")?.click()
    })
  } else if (step === "sheet") {
    sheets[sheets.length - 1].querySelector<HTMLElement>("[data-sheet-close], button[aria-label^='Close']")?.click()
  } else if (step === "backstage") {
    backstage.closeBackstage()
  } else if (step === "file-home") {
    backstage.setTab("home")
  } else if (step === "read") {
    view.setLayoutMode("print")
  } else if (step === "focus") {
    view.setFocusMode(false)
    view.setImmersive(false)
  } else {
    void quitApp()
  }
}

export function installAndroidBack() {
  ;(globalThis as { __inkspireBack?: () => void }).__inkspireBack = goBack
}
