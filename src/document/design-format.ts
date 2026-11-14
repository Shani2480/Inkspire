import {
  DEFAULT_PAGE_SETUP,
  effectPreset,
  spacingPreset,
  type EffectPreset,
  type PageSetup,
  type SpacingPreset,
} from "@/document/page-setup"
import { designColors, setupColors } from "@/document/design"
import { WORD_COLOR_SCHEMES } from "@/document/word-design-data"

export const SPACING_PRESETS: { id: SpacingPreset; label: string; detail: string }[] = [
  { id: "none", label: "No Paragraph Space", detail: "Line spacing: 1, Space after: 0 pt" },
  { id: "compact", label: "Compact", detail: "Line spacing: 1, Space after: 4 pt" },
  { id: "tight", label: "Tight", detail: "Line spacing: 1.15, Space after: 6 pt" },
  { id: "open", label: "Open", detail: "Line spacing: 1.15, Space after: 10 pt" },
  { id: "relaxed", label: "Relaxed", detail: "Line spacing: 1.5, Space after: 6 pt" },
  { id: "double", label: "Double", detail: "Line spacing: 2, Space after: 8 pt" },
]

export const EFFECT_PRESETS: { id: EffectPreset; label: string }[] = [
  { id: "office", label: "Office" },
  { id: "subtle", label: "Subtle" },
  { id: "moderate", label: "Moderate" },
  { id: "intense", label: "Intense" },
]

/**
 * A colour scheme read from the app's own files: its name and colours. Files from before Word's schemes came in
 * kept an id ("blue-ii"), which is matched to Word's scheme of that name.
 */
export function knownColorScheme(value: string, themeColors: string): Pick<PageSetup, "colorScheme" | "themeColors"> {
  const id = value.toLowerCase().replace(/[\s-]+/g, "-")
  const scheme =
    WORD_COLOR_SCHEMES.find((item) => item.name === value) ??
    WORD_COLOR_SCHEMES.find((item) => item.name.toLowerCase().replace(/[\s-]+/g, "-") === id) ??
    (id === "office-2007" ? WORD_COLOR_SCHEMES.find((item) => item.name === "Office 2007-2010") : undefined)
  if (scheme) {
    return { colorScheme: scheme.name, themeColors: themeColors || scheme.colors.join(",") }
  }
  return { colorScheme: value, themeColors }
}

/** The colours a document made in the app draws its headings, title and links in. */
export function paintDesignVars(setup: PageSetup) {
  const root = document.documentElement.style
  const colors = setupColors(setup)
  if (!colors) {
    root.removeProperty("--doc-heading-color")
    root.removeProperty("--doc-accent")
    root.removeProperty("--doc-hyperlink")
    return
  }
  const paint = designColors(colors)
  root.setProperty("--doc-heading-color", paint.heading)
  root.setProperty("--doc-accent", paint.accent)
  root.setProperty("--doc-hyperlink", paint.hyperlink)
}

export type FormatDefault = Pick<
  PageSetup,
  | "bodyFont"
  | "headingFont"
  | "colorScheme"
  | "themeColors"
  | "fontScheme"
  | "themeName"
  | "styleSet"
  | "spacing"
  | "effects"
>

const DEFAULT_KEY = "aiword-format-default"

export function loadFormatDefault(): FormatDefault | null {
  if (typeof localStorage === "undefined") {
    return null
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(DEFAULT_KEY) ?? "null") as Partial<FormatDefault> | null
    if (!parsed || typeof parsed !== "object") {
      return null
    }
    const text = (value: unknown) => (typeof value === "string" ? value : "")
    return {
      bodyFont: text(parsed.bodyFont),
      headingFont: text(parsed.headingFont),
      ...knownColorScheme(
        text(parsed.colorScheme),
        setupColors({ themeColors: text(parsed.themeColors) }) ? text(parsed.themeColors) : "",
      ),
      fontScheme: text(parsed.fontScheme),
      themeName: text(parsed.themeName),
      styleSet: text(parsed.styleSet),
      spacing: spacingPreset(parsed.spacing),
      effects: effectPreset(parsed.effects),
    }
  } catch {
    return null
  }
}

export function saveFormatDefault(setup: PageSetup) {
  const stored: FormatDefault = {
    bodyFont: setup.bodyFont,
    headingFont: setup.headingFont,
    colorScheme: setup.colorScheme,
    themeColors: setup.themeColors,
    fontScheme: setup.fontScheme,
    themeName: setup.themeName,
    styleSet: setup.styleSet,
    spacing: setup.spacing,
    effects: effectPreset(setup.effects),
  }
  localStorage.setItem(DEFAULT_KEY, JSON.stringify(stored))
  return stored
}

const PAGE_SETUP_DEFAULT_KEY = "aiword-page-setup-default"

export type PageSetupDefault = Pick<
  PageSetup,
  | "paper"
  | "orientation"
  | "marginTop"
  | "marginRight"
  | "marginBottom"
  | "marginLeft"
  | "gutter"
  | "gutterPosition"
  | "multiplePages"
  | "headerFromEdge"
  | "footerFromEdge"
  | "verticalAlign"
>

export function savePageSetupDefault(setup: PageSetup) {
  const stored: PageSetupDefault = {
    paper: setup.paper,
    orientation: setup.orientation,
    marginTop: setup.marginTop,
    marginRight: setup.marginRight,
    marginBottom: setup.marginBottom,
    marginLeft: setup.marginLeft,
    gutter: setup.gutter,
    gutterPosition: setup.gutterPosition,
    multiplePages: setup.multiplePages,
    headerFromEdge: setup.headerFromEdge,
    footerFromEdge: setup.footerFromEdge,
    verticalAlign: setup.verticalAlign,
  }
  localStorage.setItem(PAGE_SETUP_DEFAULT_KEY, JSON.stringify(stored))
  return stored
}

/** New documents go back to the app's own page setup. */
export function resetPageSetupDefault() {
  try {
    localStorage.removeItem(PAGE_SETUP_DEFAULT_KEY)
  } catch {
    // Nothing saved, or storage is blocked.
  }
}

export function loadPageSetupDefault(): PageSetupDefault | null {
  if (typeof localStorage === "undefined") {
    return null
  }
  try {
    const parsed = JSON.parse(
      localStorage.getItem(PAGE_SETUP_DEFAULT_KEY) ?? "null",
    ) as Partial<PageSetupDefault> | null
    if (!parsed || typeof parsed !== "object") {
      return null
    }
    return {
      paper:
        parsed.paper === "a4" || parsed.paper === "legal" || parsed.paper === "letter"
          ? parsed.paper
          : DEFAULT_PAGE_SETUP.paper,
      orientation: parsed.orientation === "landscape" ? "landscape" : "portrait",
      marginTop: typeof parsed.marginTop === "number" ? parsed.marginTop : DEFAULT_PAGE_SETUP.marginTop,
      marginRight: typeof parsed.marginRight === "number" ? parsed.marginRight : DEFAULT_PAGE_SETUP.marginRight,
      marginBottom: typeof parsed.marginBottom === "number" ? parsed.marginBottom : DEFAULT_PAGE_SETUP.marginBottom,
      marginLeft: typeof parsed.marginLeft === "number" ? parsed.marginLeft : DEFAULT_PAGE_SETUP.marginLeft,
      gutter: typeof parsed.gutter === "number" ? parsed.gutter : DEFAULT_PAGE_SETUP.gutter,
      gutterPosition:
        parsed.gutterPosition === "right" || parsed.gutterPosition === "top" ? parsed.gutterPosition : "left",
      multiplePages:
        parsed.multiplePages === "mirror" || parsed.multiplePages === "2pages" || parsed.multiplePages === "book-fold"
          ? parsed.multiplePages
          : "normal",
      headerFromEdge:
        typeof parsed.headerFromEdge === "number" ? parsed.headerFromEdge : DEFAULT_PAGE_SETUP.headerFromEdge,
      footerFromEdge:
        typeof parsed.footerFromEdge === "number" ? parsed.footerFromEdge : DEFAULT_PAGE_SETUP.footerFromEdge,
      verticalAlign:
        parsed.verticalAlign === "center" || parsed.verticalAlign === "justified" || parsed.verticalAlign === "bottom"
          ? parsed.verticalAlign
          : "top",
    }
  } catch {
    return null
  }
}

export function pageSetupForNewDocument(): PageSetup {
  const format = loadFormatDefault()
  const page = loadPageSetupDefault()
  return { ...DEFAULT_PAGE_SETUP, ...format, ...page }
}
