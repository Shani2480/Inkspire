import type { PageView } from "@/document/page-grid"
import { DEFAULT_THEME_BACKGROUND, THEME_OPTIONS } from "@/document/theme"
import { create } from "zustand"

export type { PageView }
export type ZoomMode = "manual" | "width" | "page" | "pages"
export type ColorMode = "light" | "dark"
export type LayoutMode = "print" | "read" | "web" | "outline" | "draft"
/** Read Mode's View menu: how wide a column of text is, the colour behind it, and columns or the paper pages. */
export type ReadColumnWidth = "narrow" | "default" | "wide"
export type ReadPageColor = "none" | "sepia" | "inverse"
export type ReadLayout = "columns" | "paper"
/** Word for the web's two ribbons: the classic one with labelled groups, or a single row of commands. */
export type RibbonLayout = "classic" | "single"

const COLOR_MODE_KEY = "aiword-color-mode"
const RIBBON_LAYOUT_KEY = "aiword-ribbon-layout"
const THEME_KEY = "inkspire-theme-accent"

/** The accent colour last chosen in any window (one of the offered themes), else the default. */
function readThemeBackground(): string {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    return THEME_OPTIONS.some((theme) => theme.value === stored) ? (stored as string) : DEFAULT_THEME_BACKGROUND
  } catch {
    return DEFAULT_THEME_BACKGROUND
  }
}

export function readRibbonLayout(): RibbonLayout {
  try {
    return localStorage.getItem(RIBBON_LAYOUT_KEY) === "single" ? "single" : "classic"
  } catch {
    return "classic"
  }
}

function storeRibbonLayout(ribbonLayout: RibbonLayout) {
  try {
    localStorage.setItem(RIBBON_LAYOUT_KEY, ribbonLayout)
  } catch {
    // The choice is only a convenience; without storage it lasts for the session.
  }
}

function readColorMode(): ColorMode {
  if (typeof localStorage === "undefined") {
    return "light"
  }
  return localStorage.getItem(COLOR_MODE_KEY) === "dark" ? "dark" : "light"
}

export function applyColorMode(colorMode: ColorMode) {
  if (typeof document === "undefined") {
    return
  }
  document.documentElement.classList.toggle("dark", colorMode === "dark")
  document.documentElement.dataset.theme = colorMode
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(COLOR_MODE_KEY, colorMode)
  }
}

export type FindTab = "find" | "replace" | "goto"

type ViewState = {
  zoom: number
  zoomMode: ZoomMode
  findOpen: boolean
  /** Editing the header and footer (Word's double-click in the margin): the body is dimmed and set aside. */
  editingChrome: boolean
  /** The header or footer being edited, on the page it was opened on (the same text shows on every page). */
  chromeTarget: { part: "header" | "footer"; page: number }
  /** The tab of Find and Replace that shows. */
  findTab: FindTab
  showFormattingMarks: boolean
  spellCheck: boolean
  showRuler: boolean
  showGridlines: boolean
  autoSave: boolean
  colorMode: ColorMode
  ribbonLayout: RibbonLayout
  themeBackground: string
  layoutMode: LayoutMode
  /** Web Layout: the width the text runs, in unzoomed pixels; the page canvas measures it from the window. */
  webWidth: number
  readColumnWidth: ReadColumnWidth
  readPageColor: ReadPageColor
  readLayout: ReadLayout
  movement: "vertical" | "side"
  pageView: PageView
  split: boolean
  sideBySide: boolean
  syncScroll: boolean
  navPane: boolean
  focusMode: boolean
  immersive: boolean
  restricted: boolean
  hideInk: boolean
  highlightMerge: boolean
  selectionPane: boolean
  setZoom: (zoom: number) => void
  setZoomMode: (zoomMode: ZoomMode) => void
  syncZoom: (zoom: number, min?: number) => void
  openFind: (replace: boolean) => void
  openGoTo: () => void
  setEditingChrome: (editing: boolean) => void
  /** Opens the header or footer for editing on a page (the first by default). */
  editChrome: (part: "header" | "footer", page?: number) => void
  setFindTab: (tab: FindTab) => void
  closeFind: () => void
  toggleFormattingMarks: () => void
  toggleSpellCheck: () => void
  setSpellCheck: (spellCheck: boolean) => void
  toggleRuler: () => void
  toggleGridlines: () => void
  toggleAutoSave: () => void
  setColorMode: (colorMode: ColorMode) => void
  toggleColorMode: () => void
  setRibbonLayout: (ribbonLayout: RibbonLayout) => void
  /** Collapses the classic ribbon to the single line, or expands the single line back to the classic ribbon. */
  toggleRibbonLayout: () => void
  setThemeBackground: (themeBackground: string) => void
  setLayoutMode: (layoutMode: LayoutMode) => void
  setWebWidth: (webWidth: number) => void
  setReadColumnWidth: (readColumnWidth: ReadColumnWidth) => void
  setReadPageColor: (readPageColor: ReadPageColor) => void
  setReadLayout: (readLayout: ReadLayout) => void
  setMovement: (movement: "vertical" | "side") => void
  setPageView: (pageView: PageView) => void
  setSplit: (split: boolean) => void
  setSideBySide: (sideBySide: boolean) => void
  setSyncScroll: (syncScroll: boolean) => void
  setNavPane: (navPane: boolean) => void
  setFocusMode: (focusMode: boolean) => void
  setImmersive: (immersive: boolean) => void
  resetWindow: () => void
  setRestricted: (restricted: boolean) => void
  setHideInk: (hideInk: boolean) => void
  setHighlightMerge: (highlightMerge: boolean) => void
  toggleSelectionPane: () => void
}

export function clampZoom(zoom: number, min = 0.5) {
  return Math.round(Math.min(2, Math.max(min, zoom)) * 100) / 100
}

const initialColorMode = readColorMode()
applyColorMode(initialColorMode)

export const useViewStore = create<ViewState>((set, get) => ({
  zoom: 1,
  zoomMode: "manual",
  findOpen: false,
  editingChrome: false,
  chromeTarget: { part: "header", page: 0 },
  findTab: "find",
  showFormattingMarks: false,
  spellCheck: true,
  showRuler: true,
  showGridlines: false,
  autoSave: true,
  colorMode: initialColorMode,
  ribbonLayout: readRibbonLayout(),
  themeBackground: readThemeBackground(),
  layoutMode: "print",
  webWidth: 0,
  readColumnWidth: "default",
  readPageColor: "none",
  readLayout: "columns",
  movement: "vertical",
  pageView: 1,
  split: false,
  sideBySide: false,
  syncScroll: false,
  navPane: false,
  focusMode: false,
  immersive: false,
  restricted: false,
  hideInk: false,
  highlightMerge: false,
  selectionPane: false,
  setZoom: (zoom) => set({ zoom: clampZoom(zoom), zoomMode: "manual" }),
  setZoomMode: (zoomMode) => set({ zoomMode }),
  syncZoom: (zoom, min = 0.5) => set({ zoom: clampZoom(zoom, min) }),
  openFind: (replace) => set({ findOpen: true, findTab: replace ? "replace" : "find" }),
  openGoTo: () => set({ findOpen: true, findTab: "goto" }),
  setEditingChrome: (editingChrome) => set({ editingChrome }),
  editChrome: (part, page = 0) => set({ editingChrome: true, chromeTarget: { part, page } }),
  setFindTab: (findTab) => set({ findTab }),
  closeFind: () => set({ findOpen: false }),
  toggleFormattingMarks: () => set((state) => ({ showFormattingMarks: !state.showFormattingMarks })),
  toggleSpellCheck: () => set((state) => ({ spellCheck: !state.spellCheck })),
  setSpellCheck: (spellCheck) => set({ spellCheck }),
  toggleRuler: () => set((state) => ({ showRuler: !state.showRuler })),
  toggleGridlines: () => set((state) => ({ showGridlines: !state.showGridlines })),
  toggleAutoSave: () => set((state) => ({ autoSave: !state.autoSave })),
  setColorMode: (colorMode) => {
    applyColorMode(colorMode)
    set({ colorMode })
  },
  toggleColorMode: () =>
    set((state) => {
      const colorMode = state.colorMode === "dark" ? "light" : "dark"
      applyColorMode(colorMode)
      return { colorMode }
    }),
  toggleRibbonLayout: () => get().setRibbonLayout(get().ribbonLayout === "single" ? "classic" : "single"),
  setRibbonLayout: (ribbonLayout) => {
    storeRibbonLayout(ribbonLayout)
    set({ ribbonLayout })
  },
  setThemeBackground: (themeBackground) => {
    try {
      localStorage.setItem(THEME_KEY, themeBackground)
    } catch {
      // Without storage the colour lasts for this window.
    }
    set({ themeBackground })
  },
  setLayoutMode: (layoutMode) =>
    set((state) => ({
      layoutMode,
      immersive: layoutMode === "read" ? false : state.immersive,
      movement: layoutMode === "print" ? state.movement : "vertical",
      pageView: layoutMode === "print" ? state.pageView : 1,
      // Fit-to-page zooms measure a sheet; the other layouts have none, so they start at 100%.
      ...(layoutMode === "print" ? {} : { zoomMode: "manual" as const, zoom: 1 }),
    })),
  setWebWidth: (webWidth) => set({ webWidth }),
  setReadColumnWidth: (readColumnWidth) => set({ readColumnWidth }),
  setReadPageColor: (readPageColor) => set({ readPageColor }),
  setReadLayout: (readLayout) => set({ readLayout }),
  setMovement: (movement) => set(movement === "side" ? { movement, pageView: 1, layoutMode: "print" } : { movement }),
  setPageView: (pageView) =>
    set(pageView > 1 ? { pageView, movement: "vertical", zoomMode: "pages", layoutMode: "print" } : { pageView }),
  setSplit: (split) => set({ split }),
  setSideBySide: (sideBySide) => set(sideBySide ? { sideBySide, split: true } : { sideBySide }),
  setSyncScroll: (syncScroll) => set({ syncScroll }),
  setNavPane: (navPane) => set({ navPane }),
  setFocusMode: (focusMode) => set({ focusMode, immersive: focusMode ? false : get().immersive }),
  setImmersive: (immersive) => set({ immersive, focusMode: immersive ? false : get().focusMode }),
  resetWindow: () =>
    set({
      split: false,
      sideBySide: false,
      syncScroll: false,
      zoom: 1,
      zoomMode: "manual",
      pageView: 1,
      movement: "vertical",
      layoutMode: "print",
      focusMode: false,
      immersive: false,
    }),
  setRestricted: (restricted) => set({ restricted }),
  setHideInk: (hideInk) => set({ hideInk }),
  setHighlightMerge: (highlightMerge) => set({ highlightMerge }),
  toggleSelectionPane: () => set((state) => ({ selectionPane: !state.selectionPane })),
}))

/**
 * Light or dark and the accent colour are for the app, not for a document: when another window changes one (the choice
 * is kept in localStorage, which tells the other windows through a `storage` event), this window follows.
 */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === THEME_KEY) {
      const themeBackground = readThemeBackground()
      if (useViewStore.getState().themeBackground !== themeBackground) {
        useViewStore.setState({ themeBackground })
      }
      return
    }
    if (event.key !== COLOR_MODE_KEY) {
      return
    }
    const colorMode: ColorMode = event.newValue === "dark" ? "dark" : "light"
    if (useViewStore.getState().colorMode !== colorMode) {
      applyColorMode(colorMode)
      useViewStore.setState({ colorMode })
    }
  })
}
