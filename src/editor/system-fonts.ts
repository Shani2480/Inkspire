import { FONT_FAMILIES } from "@/components/ribbon/options"
import { invoke } from "@tauri-apps/api/core"
import { useEffect, useState } from "react"

export type FontChoice = {
  label: string
  value: string
}

const bundled: FontChoice[] = FONT_FAMILIES.map((font) => ({ label: font.label, value: font.value }))

let choices = bundled
let loaded = false
let loading: Promise<FontChoice[]> | null = null
const listeners = new Set<(fonts: FontChoice[]) => void>()

export function useFontChoices() {
  const [fonts, setFonts] = useState(choices)

  useEffect(() => {
    listeners.add(setFonts)
    setFonts(choices)
    return () => {
      listeners.delete(setFonts)
    }
  }, [])

  return fonts
}

export function ensureSystemFonts() {
  if (loaded) {
    return Promise.resolve(choices)
  }
  if (!loading) {
    loading = loadFonts().finally(() => {
      loading = null
    })
  }
  return loading
}

async function loadFonts() {
  const names = (await tauriFonts()) ?? (await devServerFonts()) ?? (await localFonts())
  if (!names || names.length === 0) {
    return choices
  }
  choices = mergeFonts(names)
  loaded = true
  for (const listener of listeners) {
    listener(choices)
  }
  return choices
}

function mergeFonts(names: string[]) {
  const seen = new Set(bundled.map((font) => font.label.toLowerCase()))
  const extra: FontChoice[] = []
  for (const name of names) {
    const label = name.trim()
    const key = label.toLowerCase()
    if (!label || label.length > 80 || seen.has(key)) {
      continue
    }
    seen.add(key)
    extra.push({ label, value: `"${label.replace(/"/g, "")}"` })
  }
  extra.sort((left, right) => left.label.localeCompare(right.label))
  return [...bundled, ...extra]
}

async function tauriFonts() {
  try {
    const names = await invoke<string[]>("list_system_fonts")
    return Array.isArray(names) ? names : null
  } catch {
    return null
  }
}

async function devServerFonts() {
  try {
    const response = await fetch("/system-fonts")
    if (!response.ok) {
      return null
    }
    const names = (await response.json()) as unknown
    if (!Array.isArray(names)) {
      return null
    }
    return names.filter((name): name is string => typeof name === "string")
  } catch {
    return null
  }
}

async function localFonts() {
  const query = (window as Window & { queryLocalFonts?: () => Promise<Array<{ family: string }>> }).queryLocalFonts
  if (!query) {
    return null
  }
  try {
    const fonts = await query()
    return fonts.map((font) => font.family)
  } catch {
    return null
  }
}
