/** True for a native text field, whose own Cut / Copy / Paste menu keeps it editable with the mouse (21.33). */
export function isNativeTextField(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false
  }
  const field = target.closest("input, textarea")
  if (!field) {
    return false
  }
  if (field instanceof HTMLInputElement) {
    return !["button", "checkbox", "radio", "range", "color", "file", "submit", "reset", "image"].includes(field.type)
  }
  return true
}

/**
 * Keeps the webview's own right-click menu ("Inspect", "Reload", "Back" …) from appearing. It runs after the app's
 * own menus, which call `preventDefault` themselves, so it only blocks a spot where the app has no menu.
 * Returns the function that removes it.
 */
export function suppressBrowserContextMenu(target: Window = window): () => void {
  const onContext = (event: MouseEvent) => {
    if (event.defaultPrevented || isNativeTextField(event.target)) {
      return
    }
    event.preventDefault()
  }
  target.addEventListener("contextmenu", onContext)
  return () => target.removeEventListener("contextmenu", onContext)
}
