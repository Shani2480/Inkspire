export const isMacPlatform = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent)

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export function commandShortcut(key: string, shift = false) {
  if (isMacPlatform) {
    return `${shift ? "⇧" : ""}⌘${key}`
  }

  return shift ? `Ctrl+Shift+${key}` : `Ctrl+${key}`
}

/** Word Show/Hide ¶: Ctrl+Shift+8 on Windows/Linux, ⌘8 on macOS. */
export function formattingMarksShortcut() {
  return isMacPlatform ? "⌘8" : "Ctrl+Shift+8"
}
