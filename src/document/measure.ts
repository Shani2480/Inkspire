import { useUserSettings } from "@/document/user-settings"

export type MeasureSystem = "metric" | "imperial"

export const RULER_SIZE = 18
export const PX_PER_INCH = 96
export const PX_PER_MM = 96 / 25.4
export const PX_PER_CM = PX_PER_MM * 10

export type RulerTick = {
  offset: number
  kind: "major" | "mid" | "minor"
  label: string | null
}

export function readLocale() {
  const chosen = useUserSettings.getState().locale
  if (chosen) {
    return chosen
  }
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language
  }
  return "en-US"
}

export function measureSystemFor(locale: string): MeasureSystem {
  return regionOf(locale) === "US" ? "imperial" : "metric"
}

export function unitPixels(system: MeasureSystem) {
  return system === "imperial" ? PX_PER_INCH : PX_PER_CM
}

export function formatLength(px: number, system: MeasureSystem, locale: string) {
  const value = system === "imperial" ? px / PX_PER_INCH : px / PX_PER_CM
  const amount = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value)
  return system === "imperial" ? `${amount} in` : `${amount} cm`
}

export function decimalSeparator(locale: string) {
  const part = new Intl.NumberFormat(locale).formatToParts(1.1).find((item) => item.type === "decimal")
  return part?.value ?? "."
}

/**
 * Subdivisions per major unit (1 in / 1 cm), chosen from zoom so default
 * 100% only shows whole numbers + half-unit ticks.
 */
export function rulerTickDivisions(zoom: number, system: MeasureSystem): number {
  const unitPx = unitPixels(system)
  const majorPx = unitPx * zoom

  // Zoomed out: whole-number labels only (skip half ticks when crowded / <75%).
  if (zoom < 0.75 || majorPx < 24) {
    return 1
  }
  // Default working range (≈75%–149%): majors + half units.
  if (zoom < 1.5) {
    return 2
  }
  // Medium zoom: quarters (inches) / quarters or mm (cm when spacing allows).
  if (zoom < 2.5) {
    if (system === "imperial") {
      return 4
    }
    const mmPx = majorPx / 10
    return mmPx > 6 ? 10 : 4
  }
  // High zoom: eighths (inches) or full millimeters (cm).
  return system === "imperial" ? 8 : 10
}

function classifyRulerTick(step: number, divisions: number): RulerTick["kind"] {
  if (step % divisions === 0) {
    return "major"
  }
  // Half-unit: 0.5 within the major unit.
  if (divisions % 2 === 0 && step % (divisions / 2) === 0) {
    return "mid"
  }
  return "minor"
}

/**
 * Ticks for one page edge. `origin` is the printable-area start (inside the
 * margin), in unscaled CSS pixels. Labels count away from that zero in both
 * directions: negative through the margin, positive through the body.
 * Density follows `zoom` via {@link rulerTickDivisions}.
 */
export function buildRulerTicks({
  length,
  origin,
  zoom,
  system,
  locale,
}: {
  length: number
  origin: number
  zoom: number
  system: MeasureSystem
  locale: string
}): RulerTick[] {
  const unitPx = unitPixels(system)
  const divisions = rulerTickDivisions(zoom, system)
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  const first = Math.floor((-origin / unitPx) * divisions)
  const last = Math.ceil(((length - origin) / unitPx) * divisions)
  const ticks: RulerTick[] = []

  for (let step = first; step <= last; step += 1) {
    const pagePx = origin + (step / divisions) * unitPx
    if (pagePx < -0.5 || pagePx > length + 0.5) {
      continue
    }
    const kind = classifyRulerTick(step, divisions)
    ticks.push({
      offset: pagePx * zoom,
      kind,
      // Word counts the margins outwards from the margin edge, so the numbers there are not negative.
      label: kind === "major" ? formatter.format(Math.abs(step / divisions)) : null,
    })
  }

  return ticks
}

function regionOf(locale: string) {
  const normalized = locale.replace(/_/g, "-")
  try {
    const region = new Intl.Locale(normalized).region
    if (region) {
      return region.toUpperCase()
    }
  } catch {
    // Fall through to the tag suffix.
  }
  const match = normalized.match(/-([A-Za-z]{2})(?:-|$)/)
  return match?.[1]?.toUpperCase()
}
