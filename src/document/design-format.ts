import {
  DEFAULT_PAGE_SETUP,
  effectPreset,
  spacingPreset,
  type EffectPreset,
  type PageSetup,
  type SpacingPreset,
} from "@/document/page-setup"

export type ColorScheme = {
  id: string
  name: string
  chips: [string, string, string, string, string, string, string, string]
  heading: string
  accent: string
  hyperlink: string
}

export type FontPair = {
  id: string
  label: string
  heading: string
  body: string
}

export type DesignTheme = {
  id: string
  name: string
  colors: string
  headingFont: string
  bodyFont: string
  effects: EffectPreset
}

const sans = (name: string) => `"${name}", "Segoe UI", sans-serif`
const serif = (name: string) => `"${name}", Georgia, serif`
const mono = (name: string) => `"${name}", ui-monospace, monospace`

export const COLOR_SCHEMES: ColorScheme[] = [
  {
    id: "office",
    name: "Office",
    chips: ["#000000", "#ffffff", "#5b9bd5", "#ed7d31", "#a5a5a5", "#ffc000", "#4472c4", "#70ad47"],
    heading: "#2e75b6",
    accent: "#5b9bd5",
    hyperlink: "#0563c1",
  },
  {
    id: "office-2007",
    name: "Office 2007-2010",
    chips: ["#000000", "#ffffff", "#4f81bd", "#c0504d", "#9bbb59", "#8064a2", "#4bacc6", "#f79646"],
    heading: "#1f497d",
    accent: "#4f81bd",
    hyperlink: "#0000ff",
  },
  {
    id: "grayscale",
    name: "Grayscale",
    chips: ["#000000", "#ffffff", "#000000", "#7f7f7f", "#595959", "#404040", "#262626", "#0c0c0c"],
    heading: "#000000",
    accent: "#595959",
    hyperlink: "#000000",
  },
  {
    id: "blue-warm",
    name: "Blue Warm",
    chips: ["#242424", "#ffffff", "#2e75b6", "#c65911", "#ed7d31", "#ffc000", "#70ad47", "#5b9bd5"],
    heading: "#2e75b6",
    accent: "#2e75b6",
    hyperlink: "#0563c1",
  },
  {
    id: "blue",
    name: "Blue",
    chips: ["#0d1b2a", "#ffffff", "#0f6cbd", "#1f4e79", "#2e75b6", "#5b9bd5", "#9dc3e6", "#203864"],
    heading: "#1f4e79",
    accent: "#0f6cbd",
    hyperlink: "#0f6cbd",
  },
  {
    id: "blue-ii",
    name: "Blue II",
    chips: ["#1b2838", "#ffffff", "#1f4e79", "#2e75b6", "#5b9bd5", "#8faadc", "#bdd7ee", "#0d1b2a"],
    heading: "#1f4e79",
    accent: "#2e75b6",
    hyperlink: "#1f4e79",
  },
  {
    id: "blue-green",
    name: "Blue Green",
    chips: ["#123524", "#ffffff", "#0d7377", "#14919b", "#1f4e79", "#2e75b6", "#548235", "#70ad47"],
    heading: "#0d7377",
    accent: "#14919b",
    hyperlink: "#0d7377",
  },
  {
    id: "green",
    name: "Green",
    chips: ["#1e3a1e", "#ffffff", "#548235", "#70ad47", "#375623", "#a9d08e", "#c6e0b4", "#203520"],
    heading: "#375623",
    accent: "#548235",
    hyperlink: "#548235",
  },
  {
    id: "green-yellow",
    name: "Green Yellow",
    chips: ["#3d4a12", "#ffffff", "#7f9a1d", "#c4d600", "#548235", "#bf8f00", "#ffc000", "#806000"],
    heading: "#548235",
    accent: "#7f9a1d",
    hyperlink: "#548235",
  },
  {
    id: "yellow",
    name: "Yellow",
    chips: ["#3d3208", "#ffffff", "#bf8f00", "#ffc000", "#ffd966", "#806000", "#c65911", "#f4b183"],
    heading: "#806000",
    accent: "#bf8f00",
    hyperlink: "#806000",
  },
  {
    id: "yellow-orange",
    name: "Yellow Orange",
    chips: ["#3d2a08", "#ffffff", "#c65911", "#ed7d31", "#ffc000", "#f4b183", "#bf8f00", "#833c0b"],
    heading: "#c65911",
    accent: "#ed7d31",
    hyperlink: "#c65911",
  },
  {
    id: "orange",
    name: "Orange",
    chips: ["#3d2208", "#ffffff", "#ed7d31", "#c65911", "#f4b183", "#833c0b", "#ffc000", "#a04000"],
    heading: "#c45911",
    accent: "#ed7d31",
    hyperlink: "#c45911",
  },
  {
    id: "orange-red",
    name: "Orange Red",
    chips: ["#3d140c", "#ffffff", "#c65911", "#e35d2a", "#d13438", "#ed7d31", "#f4b183", "#8b2500"],
    heading: "#c45911",
    accent: "#e35d2a",
    hyperlink: "#c45911",
  },
  {
    id: "red",
    name: "Red",
    chips: ["#3d1010", "#ffffff", "#c00000", "#d13438", "#ff0000", "#f4b183", "#833c0b", "#5c0000"],
    heading: "#c00000",
    accent: "#d13438",
    hyperlink: "#c00000",
  },
  {
    id: "red-violet",
    name: "Red Violet",
    chips: ["#2e1028", "#ffffff", "#a11d5c", "#c4598a", "#7030a0", "#d13438", "#f2c4d6", "#5b2c6f"],
    heading: "#a11d5c",
    accent: "#c4598a",
    hyperlink: "#7030a0",
  },
  {
    id: "violet",
    name: "Violet",
    chips: ["#24143d", "#ffffff", "#5b2c6f", "#7030a0", "#8064a2", "#b4a7d6", "#2e75b6", "#3d1a54"],
    heading: "#5b2c6f",
    accent: "#7030a0",
    hyperlink: "#5b2c6f",
  },
  {
    id: "violet-ii",
    name: "Violet II",
    chips: ["#1a1030", "#ffffff", "#3d1a54", "#5b2c6f", "#8064a2", "#9b6dcc", "#c5b3e6", "#2e1a47"],
    heading: "#5b2c6f",
    accent: "#8064a2",
    hyperlink: "#5b2c6f",
  },
  {
    id: "median",
    name: "Median",
    chips: ["#323232", "#ffffff", "#7f7f7f", "#a6a6a6", "#5b9bd5", "#ed7d31", "#70ad47", "#ffc000"],
    heading: "#595959",
    accent: "#5b9bd5",
    hyperlink: "#5b9bd5",
  },
  {
    id: "paper",
    name: "Paper",
    chips: ["#3d3428", "#fffdf8", "#8d6e63", "#a1887f", "#d7ccc8", "#5d4037", "#efebe9", "#4e342e"],
    heading: "#5d4037",
    accent: "#8d6e63",
    hyperlink: "#5d4037",
  },
  {
    id: "marquee",
    name: "Marquee",
    chips: ["#1a1a1a", "#ffffff", "#000000", "#c00000", "#ffc000", "#ffffff", "#7f7f7f", "#ed7d31"],
    heading: "#c00000",
    accent: "#c00000",
    hyperlink: "#c00000",
  },
  {
    id: "aspect",
    name: "Aspect",
    chips: ["#1c2833", "#ffffff", "#1f4e79", "#c45911", "#548235", "#7030a0", "#0f6cbd", "#bf8f00"],
    heading: "#1f4e79",
    accent: "#c45911",
    hyperlink: "#1f4e79",
  },
]

export const FONT_PAIRS: FontPair[] = [
  { id: "office", label: "Office", heading: sans("Calibri Light"), body: sans("Calibri") },
  { id: "office-2007", label: "Office 2007-2010", heading: serif("Cambria"), body: sans("Calibri") },
  { id: "arial", label: "Arial", heading: sans("Arial"), body: sans("Arial") },
  { id: "arial-black", label: "Arial Black", heading: sans("Arial Black"), body: sans("Arial") },
  { id: "calibri", label: "Calibri", heading: sans("Calibri Light"), body: sans("Calibri") },
  { id: "cambria", label: "Cambria", heading: serif("Cambria"), body: serif("Cambria") },
  { id: "candara", label: "Candara", heading: sans("Candara"), body: sans("Candara") },
  { id: "century", label: "Century Gothic", heading: sans("Century Gothic"), body: sans("Century Gothic") },
  { id: "consolas", label: "Consolas", heading: mono("Consolas"), body: mono("Consolas") },
  { id: "constantia", label: "Constantia", heading: serif("Constantia"), body: serif("Constantia") },
  { id: "corbel", label: "Corbel", heading: sans("Corbel"), body: sans("Corbel") },
  {
    id: "franklin",
    label: "Franklin Gothic",
    heading: sans("Franklin Gothic Medium"),
    body: sans("Franklin Gothic Book"),
  },
  { id: "garamond", label: "Garamond", heading: serif("Garamond"), body: serif("Garamond") },
  { id: "georgia", label: "Georgia", heading: serif("Georgia"), body: serif("Georgia") },
  { id: "gill", label: "Gill Sans MT", heading: sans("Gill Sans MT"), body: sans("Gill Sans MT") },
  { id: "impact", label: "Impact", heading: sans("Impact"), body: sans("Arial") },
  { id: "lucida", label: "Lucida Sans", heading: sans("Lucida Sans"), body: sans("Lucida Sans") },
  { id: "palatino", label: "Palatino", heading: serif("Palatino Linotype"), body: serif("Palatino Linotype") },
  { id: "trebuchet", label: "Trebuchet MS", heading: sans("Trebuchet MS"), body: sans("Trebuchet MS") },
  { id: "verdana", label: "Verdana", heading: sans("Verdana"), body: sans("Verdana") },
  { id: "aptos", label: "Aptos", heading: sans("Aptos Display"), body: sans("Aptos") },
]

export const SPACING_PRESETS: { id: SpacingPreset; label: string; detail: string }[] = [
  { id: "default", label: "Default", detail: "The document’s built-in spacing" },
  { id: "none", label: "No Paragraph Space", detail: "Single line, 0 pt after" },
  { id: "compact", label: "Compact", detail: "Single line, no space after" },
  { id: "tight", label: "Tight", detail: "1.15 lines, 6 pt after" },
  { id: "open", label: "Open", detail: "1.15 lines, 10 pt after" },
  { id: "relaxed", label: "Relaxed", detail: "1.5 lines, 6 pt after" },
  { id: "double", label: "Double", detail: "Double line, 8 pt after" },
]

export const EFFECT_PRESETS: { id: EffectPreset; label: string }[] = [
  { id: "office", label: "Office" },
  { id: "subtle", label: "Subtle" },
  { id: "moderate", label: "Moderate" },
  { id: "intense", label: "Intense" },
]

const pair = (id: string) => FONT_PAIRS.find((item) => item.id === id) ?? FONT_PAIRS[0]

export const DESIGN_THEMES: DesignTheme[] = [
  { id: "office", name: "Office", colors: "office", ...fonts("office"), effects: "office" },
  {
    id: "facet",
    name: "Facet",
    colors: "violet",
    headingFont: pair("trebuchet").heading,
    bodyFont: pair("georgia").body,
    effects: "subtle",
  },
  { id: "integral", name: "Integral", colors: "blue", ...fonts("georgia"), effects: "subtle" },
  {
    id: "ion",
    name: "Ion",
    colors: "blue-ii",
    headingFont: pair("arial").heading,
    bodyFont: pair("verdana").body,
    effects: "office",
  },
  { id: "organic", name: "Organic", colors: "green", ...fonts("palatino"), effects: "subtle" },
  { id: "banded", name: "Banded", colors: "blue-warm", ...fonts("calibri"), effects: "office" },
  { id: "slice", name: "Slice", colors: "orange", ...fonts("arial"), effects: "moderate" },
  {
    id: "wisp",
    name: "Wisp",
    colors: "blue",
    headingFont: pair("georgia").heading,
    bodyFont: pair("calibri").body,
    effects: "subtle",
  },
  {
    id: "celestial",
    name: "Celestial",
    colors: "blue-ii",
    headingFont: pair("calibri").heading,
    bodyFont: pair("georgia").body,
    effects: "moderate",
  },
  { id: "retrospect", name: "Retrospect", colors: "red", ...fonts("calibri"), effects: "moderate" },
  { id: "basis", name: "Basis", colors: "blue-green", ...fonts("candara"), effects: "subtle" },
  {
    id: "circuit",
    name: "Circuit",
    colors: "blue",
    headingFont: pair("consolas").heading,
    bodyFont: pair("calibri").body,
    effects: "office",
  },
  { id: "dividend", name: "Dividend", colors: "green", ...fonts("cambria"), effects: "subtle" },
  { id: "droplet", name: "Droplet", colors: "blue-green", ...fonts("corbel"), effects: "subtle" },
  { id: "frame", name: "Frame", colors: "grayscale", ...fonts("arial"), effects: "office" },
  { id: "gallery", name: "Gallery", colors: "violet-ii", ...fonts("georgia"), effects: "intense" },
  { id: "summit", name: "Summit", colors: "blue-warm", ...fonts("aptos"), effects: "subtle" },
  { id: "parcel", name: "Parcel", colors: "paper", ...fonts("garamond"), effects: "subtle" },
  { id: "quota", name: "Quota", colors: "green-yellow", ...fonts("verdana"), effects: "office" },
  {
    id: "orbit",
    name: "Orbit",
    colors: "violet",
    headingFont: pair("trebuchet").heading,
    bodyFont: pair("arial").body,
    effects: "moderate",
  },
  { id: "metro", name: "Metro", colors: "marquee", ...fonts("arial-black"), effects: "intense" },
  { id: "folio", name: "Folio", colors: "median", ...fonts("constantia"), effects: "subtle" },
  { id: "lumen", name: "Lumen", colors: "yellow", ...fonts("candara"), effects: "office" },
  { id: "harbor", name: "Harbor", colors: "blue-green", ...fonts("gill"), effects: "subtle" },
  { id: "cinder", name: "Cinder", colors: "orange-red", ...fonts("franklin"), effects: "moderate" },
  { id: "plaza", name: "Plaza", colors: "aspect", ...fonts("lucida"), effects: "office" },
  { id: "atlas", name: "Atlas", colors: "blue", ...fonts("century"), effects: "subtle" },
  { id: "violet-room", name: "Violet Room", colors: "red-violet", ...fonts("georgia"), effects: "intense" },
  { id: "ledger", name: "Ledger", colors: "grayscale", ...fonts("consolas"), effects: "office" },
  { id: "sunrise", name: "Sunrise", colors: "yellow-orange", ...fonts("calibri"), effects: "moderate" },
  {
    id: "forest",
    name: "Forest",
    colors: "green",
    headingFont: pair("cambria").heading,
    bodyFont: pair("corbel").body,
    effects: "subtle",
  },
]

function fonts(id: string) {
  const item = pair(id)
  return { headingFont: item.heading, bodyFont: item.body }
}

export function colorSchemeById(id: string) {
  return COLOR_SCHEMES.find((item) => item.id === id) ?? null
}

export function knownColorScheme(value: unknown) {
  return typeof value === "string" && COLOR_SCHEMES.some((item) => item.id === value) ? value : ""
}

export function paintDesignVars(setup: PageSetup) {
  const root = document.documentElement.style
  const scheme = colorSchemeById(setup.colorScheme)
  if (!scheme) {
    root.removeProperty("--doc-heading-color")
    root.removeProperty("--doc-accent")
    root.removeProperty("--doc-hyperlink")
    return
  }
  root.setProperty("--doc-heading-color", scheme.heading)
  root.setProperty("--doc-accent", scheme.accent)
  root.setProperty("--doc-hyperlink", scheme.hyperlink)
}

export type FormatDefault = Pick<PageSetup, "bodyFont" | "headingFont" | "colorScheme" | "spacing" | "effects">

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
    return {
      bodyFont: typeof parsed.bodyFont === "string" ? parsed.bodyFont : "",
      headingFont: typeof parsed.headingFont === "string" ? parsed.headingFont : "",
      colorScheme: knownColorScheme(parsed.colorScheme),
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
    colorScheme: knownColorScheme(setup.colorScheme),
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
