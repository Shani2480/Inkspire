import { create } from "zustand"

/**
 * Word's style windows: the Styles pane (Alt+Ctrl+Shift+S, Home's Styles launcher), the Apply Styles box
 * (Ctrl+Shift+S), the Style Inspector and Reveal Formatting (Shift+F1). The pane's two options are remembered.
 */

const OPTIONS_KEY = "inkspire.stylesPane"

type PaneOptions = { preview: boolean; disableLinked: boolean }

function readOptions(): PaneOptions {
  try {
    const saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? "null") as Partial<PaneOptions> | null
    return { preview: saved?.preview === true, disableLinked: saved?.disableLinked === true }
  } catch {
    return { preview: false, disableLinked: false }
  }
}

function saveOptions(options: PaneOptions) {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(options))
  } catch {
    // Not remembered.
  }
}

type StylePanes = PaneOptions & {
  pane: boolean
  applyBox: boolean
  inspector: boolean
  reveal: boolean
  togglePane: (open?: boolean) => void
  toggleApplyBox: (open?: boolean) => void
  toggleInspector: (open?: boolean) => void
  toggleReveal: (open?: boolean) => void
  setPreview: (on: boolean) => void
  setDisableLinked: (on: boolean) => void
}

export const useStylePanes = create<StylePanes>((set, get) => ({
  ...readOptions(),
  pane: false,
  applyBox: false,
  inspector: false,
  reveal: false,
  togglePane: (open) => set({ pane: open ?? !get().pane }),
  toggleApplyBox: (open) => set({ applyBox: open ?? !get().applyBox }),
  toggleInspector: (open) => set({ inspector: open ?? !get().inspector }),
  toggleReveal: (open) => set({ reveal: open ?? !get().reveal }),
  setPreview: (preview) => {
    set({ preview })
    saveOptions({ preview, disableLinked: get().disableLinked })
  },
  setDisableLinked: (disableLinked) => {
    set({ disableLinked })
    saveOptions({ preview: get().preview, disableLinked })
  },
}))
