export const FONT_FAMILIES = [
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Palatino", value: '"Palatino Linotype", Palatino, serif' },
  { label: "Times New Roman", value: '"Times New Roman", Times, serif' },
  { label: "Garamond", value: "Garamond, Georgia, serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: '"Trebuchet MS", sans-serif' },
  { label: "Courier New", value: '"Courier New", Courier, monospace' },
] as const

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72]

export const LINE_SPACINGS = [
  { label: "Single", value: "1" },
  { label: "1.15", value: "1.15" },
  { label: "1.5", value: "1.5" },
  { label: "Double", value: "2" },
] as const

export const TEXT_COLORS = [
  "#1c1c1c",
  "#374151",
  "#6b7280",
  "#b91c1c",
  "#c2410c",
  "#a16207",
  "#15803d",
  "#0f766e",
  "#1d4ed8",
  "#6d28d9",
  "#be185d",
]

export const HIGHLIGHT_COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fecdd3", "#fed7aa", "#e9d5ff", "#e4e4e7"]

export function fontLabel(value: string) {
  const known = FONT_FAMILIES.find((font) => font.value === value)
  if (known) {
    return known.label
  }
  // The family list may quote a name either way ("Aptos" from the app, 'Times New Roman' from a Word file).
  const name = value.split(",")[0]?.replace(/["']/g, "").trim()
  return name || "Font"
}

/** A font box's label: the font's name, or the theme body font's ("Aptos (Body)") when it has none. */
export function fontLabelAt(family: string, bodyLabel: string) {
  return family ? fontLabel(family) : bodyLabel
}

export function fontSizeLabel(value: string) {
  if (!value) {
    return "12"
  }
  return value.replace(/pt$/i, "")
}
