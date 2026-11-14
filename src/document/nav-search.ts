import { useViewStore } from "@/document/view"

/**
 * Word's Find (Ctrl+F, Home > Find) opens the Navigation pane and puts the caret in its search box, with the
 * selected text in it. The pane registers the focusing function while it is shown; a request made before it
 * mounts waits for it.
 */
let pending: string | null = null
let focusSearch: ((text: string) => void) | null = null

export function openNavigationSearch(text = "") {
  const trimmed = text.includes("\n") ? "" : text.trim().slice(0, 80)
  useViewStore.getState().setNavPane(true)
  if (focusSearch) {
    focusSearch(trimmed)
  } else {
    pending = trimmed
  }
}

/** The pane's side: returns the request that came before it mounted, and the function to clear the registration. */
export function registerNavigationSearch(focus: (text: string) => void) {
  focusSearch = focus
  if (pending !== null) {
    focus(pending)
    pending = null
  }
  return () => {
    if (focusSearch === focus) {
      focusSearch = null
    }
  }
}

/** The text selected in the document, for Find to search for. */
export function selectedSearchText() {
  return window.getSelection()?.toString() ?? ""
}
