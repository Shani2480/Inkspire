import type { CSSProperties } from "react"

export const THEME_OPTIONS = [
  { name: "Classic Word Blue", value: "#2B579A" },
  { name: "Midnight Obsidian", value: "#0F172A" },
  { name: "Forest Emerald", value: "#065F46" },
  { name: "Autumn Amber", value: "#B45309" },
  { name: "Amethyst Purple", value: "#581C87" },
  { name: "Aurora Gradient", value: "linear-gradient(90deg, #3B82F6, #8B5CF6, #EC4899)" },
  { name: "Prismatic Rainbow", value: "linear-gradient(90deg, #EF4444, #F59E0B, #10B981, #3B82F6, #8B5CF6)" },
] as const

export const DEFAULT_THEME_BACKGROUND = THEME_OPTIONS[0].value
export const DEFAULT_THEME_ACCENT = "#2B579A"

export function isGradientTheme(value: string) {
  return value.includes("gradient(")
}

/** Solid accent for UI chrome (Share, underlines, toggles). Gradients use the first stop. */
export function themeAccentColor(themeBackground: string) {
  if (isGradientTheme(themeBackground)) {
    const match = themeBackground.match(/#[0-9A-Fa-f]{3,8}/)
    return match?.[0] ?? DEFAULT_THEME_ACCENT
  }
  return themeBackground || DEFAULT_THEME_ACCENT
}

/** What the ribbon's tab row sits on, in each mode (index.css: --app-workspace). */
const TAB_ROW = { light: "#ebebeb", dark: "#1e1e1e" } as const

/** Contrast Word's guidance asks of text: 4.5:1 (WCAG AA). */
export const TEXT_CONTRAST = 4.5

type Rgb = [number, number, number]

function hexRgb(hex: string): Rgb {
  let value = hex.replace("#", "")
  if (value.length === 3) {
    value = [...value].map((digit) => digit + digit).join("")
  }
  const number = parseInt(value.slice(0, 6), 16)
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255]
}

function rgbHex([r, g, b]: Rgb) {
  return `#${[r, g, b].map((part) => Math.round(part).toString(16).padStart(2, "0")).join("")}`
}

function luminance([r, g, b]: Rgb) {
  const [lr, lg, lb] = [r, g, b].map((part) => {
    const c = part / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lr! + 0.7152 * lg! + 0.0722 * lb!
}

export function contrastRatio(foreground: string, background: string) {
  const a = luminance(hexRgb(foreground))
  const b = luminance(hexRgb(background))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * The label colour of the tabs that come with a selection (Table Design, Picture Format, …), as Word colours them:
 * the theme's colour, darkened in light mode or lightened in dark mode just enough to read on the tab row.
 */
export function contextTabColor(themeBackground: string, colorMode: "light" | "dark" = "light") {
  const base = hexRgb(themeAccentColor(themeBackground))
  const row = TAB_ROW[colorMode]
  const toward: Rgb = colorMode === "dark" ? [255, 255, 255] : [0, 0, 0]
  for (let step = 0; step <= 20; step += 1) {
    const amount = step / 20
    const color = rgbHex(base.map((part, index) => part + (toward[index]! - part) * amount) as Rgb)
    if (contrastRatio(color, row) >= TEXT_CONTRAST) {
      return color
    }
  }
  return colorMode === "dark" ? "#ffffff" : "#000000"
}

/** CSS custom properties bound to the active office theme accent. */
export function themeAccentVars(themeBackground: string, colorMode: "light" | "dark" = "light"): CSSProperties {
  const primary = themeAccentColor(themeBackground)
  if (colorMode === "dark") {
    return {
      ["--app-title-fill" as string]: titleFill(themeBackground, colorMode),
      ["--app-theme-primary" as string]: primary,
      ["--app-theme-hover" as string]: `color-mix(in srgb, ${primary} 78%, white)`,
      ["--app-theme-light" as string]: `color-mix(in srgb, ${primary} 28%, #292929)`,
      ["--app-context-tab" as string]: contextTabColor(themeBackground, colorMode),
    }
  }
  return {
    ["--app-title-fill" as string]: titleFill(themeBackground, colorMode),
    ["--app-theme-primary" as string]: primary,
    ["--app-theme-hover" as string]: `color-mix(in srgb, ${primary} 86%, black)`,
    ["--app-theme-light" as string]: `color-mix(in srgb, ${primary} 14%, white)`,
    ["--app-context-tab" as string]: contextTabColor(themeBackground, colorMode),
  }
}

/** The title bar's fill as one `background` value, for dialogs to match the window (see themeBackgroundStyle). */
function titleFill(themeBackground: string, colorMode: "light" | "dark") {
  if (isGradientTheme(themeBackground)) {
    return colorMode === "dark"
      ? `linear-gradient(rgb(0 0 0 / 0.35), rgb(0 0 0 / 0.35)), ${themeBackground}`
      : themeBackground
  }
  return colorMode === "dark" ? `color-mix(in srgb, ${themeBackground} 65%, black)` : themeBackground
}

/** Solid themes use background-color. Gradients use background-image so the fill is not flattened. */
export function themeBackgroundStyle(themeBackground: string, colorMode: "light" | "dark" = "light"): CSSProperties {
  if (isGradientTheme(themeBackground)) {
    return {
      backgroundColor: "transparent",
      backgroundImage:
        colorMode === "dark"
          ? `linear-gradient(rgb(0 0 0 / 0.35), rgb(0 0 0 / 0.35)), ${themeBackground}`
          : themeBackground,
      color: "#FFFFFF",
    }
  }

  return {
    backgroundColor: colorMode === "dark" ? `color-mix(in srgb, ${themeBackground} 65%, black)` : themeBackground,
    backgroundImage: "none",
    color: "#FFFFFF",
  }
}
