import { aiUnavailableReason } from "@/ai/availability"
import { cancelAiRequest, generateAiText, isAiCancelled } from "@/ai/generate"
import { FONT_FAMILIES, FONT_SIZES, LINE_SPACINGS } from "@/components/ribbon/options"

export type HeadingSizes = {
  h1: number
  h2: number
  h3: number
}

export type DocumentTheme = {
  name: string
  fontFamily: string
  headingFont: string
  textColor: string
  accent: string
  headingSizes: HeadingSizes
  paragraphSpacing: string
}

const FAMILY_BY_LABEL = new Map(FONT_FAMILIES.map((font) => [font.label.toLowerCase(), font.value]))
const FAMILY_VALUES = new Set<string>(FONT_FAMILIES.map((font) => font.value))
const SPACING = new Set<string>(LINE_SPACINGS.map((item) => item.value))
const SIZES = new Set(FONT_SIZES)
const COLOR = /^#[0-9a-fA-F]{6}$/

const THEME_SYSTEM = [
  "You suggest document themes.",
  "Return only a JSON array of 3 objects.",
  "Each object has name, fontFamily, headingFont, textColor, accent, headingSizes, and paragraphSpacing.",
  "fontFamily and headingFont must be one of: Georgia, Palatino, Times New Roman, Garamond, Arial, Verdana, Trebuchet MS, Courier New.",
  "textColor and accent are #rrggbb colors.",
  "headingSizes is an object with numeric h1, h2, and h3, each one of 14, 16, 18, 20, 24, 28, 36.",
  "paragraphSpacing is one of 1, 1.15, 1.5, 2.",
  "No markdown and no explanation.",
].join(" ")

export function validateTheme(value: unknown): DocumentTheme | null {
  if (!value || typeof value !== "object") {
    return null
  }
  const record = value as Record<string, unknown>
  const name = typeof record.name === "string" ? record.name.trim() : ""
  if (!name || name.length > 40 || /[\u0000-\u001f]/.test(name)) {
    return null
  }
  const fontFamily = familyValue(record.fontFamily)
  const headingFont = familyValue(record.headingFont)
  if (!fontFamily || !headingFont) {
    return null
  }
  if (typeof record.textColor !== "string" || !COLOR.test(record.textColor)) {
    return null
  }
  if (typeof record.accent !== "string" || !COLOR.test(record.accent)) {
    return null
  }
  const sizes = record.headingSizes
  if (!sizes || typeof sizes !== "object") {
    return null
  }
  const heading = sizes as Record<string, unknown>
  const h1 = sizeValue(heading.h1)
  const h2 = sizeValue(heading.h2)
  const h3 = sizeValue(heading.h3)
  if (h1 === null || h2 === null || h3 === null) {
    return null
  }
  const paragraphSpacing =
    typeof record.paragraphSpacing === "number"
      ? String(record.paragraphSpacing)
      : typeof record.paragraphSpacing === "string"
        ? record.paragraphSpacing.trim()
        : ""
  if (!SPACING.has(paragraphSpacing)) {
    return null
  }
  return {
    name,
    fontFamily,
    headingFont,
    textColor: record.textColor.toLowerCase(),
    accent: record.accent.toLowerCase(),
    headingSizes: { h1, h2, h3 },
    paragraphSpacing,
  }
}

export function parseThemes(raw: string) {
  const text = unwrapPlain(raw)
  const start = text.indexOf("[")
  const end = text.lastIndexOf("]")
  if (start < 0 || end <= start) {
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) {
    return []
  }
  const themes: DocumentTheme[] = []
  for (const item of parsed) {
    const theme = validateTheme(item)
    if (!theme) {
      continue
    }
    themes.push(theme)
    if (themes.length === 4) {
      break
    }
  }
  return themes
}

export async function requestThemes(text: string, requestId: string) {
  const reason = await aiUnavailableReason()
  if (reason) {
    return { blocked: reason, themes: [] as DocumentTheme[] }
  }
  if (isAiCancelled(requestId)) {
    return { blocked: null, themes: [] as DocumentTheme[] }
  }
  const source = text.trim().slice(0, 8_000) || "Empty document."
  try {
    const raw = await generateAiText("Suggest three themes that fit the document.", source, {
      system: THEME_SYSTEM,
      plain: true,
      quiet: true,
      requestId,
    })
    if (isAiCancelled(requestId)) {
      return { blocked: null, themes: [] as DocumentTheme[] }
    }
    const themes = parseThemes(raw)
    if (themes.length === 0) {
      return { blocked: "The model did not return a usable theme.", themes }
    }
    return { blocked: null, themes }
  } catch (error) {
    if (isAiCancelled(requestId) || (error instanceof Error && error.message === "Stopped.")) {
      return { blocked: null, themes: [] as DocumentTheme[] }
    }
    throw error
  }
}

export function stopThemeRequest(requestId: string) {
  cancelAiRequest(requestId)
}

function familyValue(value: unknown) {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  if (FAMILY_VALUES.has(trimmed)) {
    return trimmed
  }
  return FAMILY_BY_LABEL.get(trimmed.toLowerCase()) ?? null
}

function sizeValue(value: unknown) {
  const size = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : Number.NaN
  if (!Number.isFinite(size) || !SIZES.has(size)) {
    return null
  }
  return size
}

export function unwrapPlain(raw: string) {
  let value = raw.replace(/^\uFEFF/, "").trim()
  value = value
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim()
  const wrapped = value.match(/^<p>([\s\S]*)<\/p>$/i)
  if (wrapped) {
    value = wrapped[1]
  }
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim()
}
