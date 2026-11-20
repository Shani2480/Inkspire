import { type FontStatus, type OptionalFont, fontAvailable, standInFor } from "@/document/optional-fonts"
import { type WebFontMatch, googleCatalog, matchWebFont } from "@/document/web-fonts"

/**
 * The fonts an open document uses that are not on this device, and what can be done about each: a free font with
 * the same widths (Calibri → Carlito, U39), the font itself from Google Fonts, Aptos from Microsoft's page, or
 * nothing (a commercial font), when the text is shown in a similar one.
 */
export type FontOffer = {
  missing: string[]
  standIns: OptionalFont[]
  web: WebFontMatch[]
  aptos: boolean
}

const GENERIC = /^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-\w+|emoji|math|inherit|initial|unset)$/i
/** Symbol fonts Inkspire draws itself, and the app's own faces. */
const SKIPPED = /^(?:symbol|wingdings(?: \d)?|webdings|marlett|inter|segoe ui symbol)$/i

/** The first family of each `font-family` in a document's CSS: the fonts it asks for, in order, once each. */
export function documentFontNames(css: string) {
  const names = new Set<string>()
  for (const match of css.replace(/&quot;/g, '"').matchAll(/font-family\s*:\s*([^;}<>]+)/gi)) {
    const first = match[1]!
      .split(",")[0]!
      .trim()
      .replace(/^['"]|['"]$/g, "")
    if (first && !first.startsWith("var(") && !GENERIC.test(first) && !SKIPPED.test(first)) {
      names.add(first)
    }
  }
  return [...names]
}

export async function fontOffer(
  css: string,
  status: Record<string, FontStatus>,
  installed: Record<string, WebFontMatch>,
  available: (name: string) => boolean = fontAvailable,
): Promise<FontOffer> {
  const missing = documentFontNames(css).filter((name) => !available(name) && !installed[name])
  const offer: FontOffer = { missing: [], standIns: [], web: [], aptos: false }
  if (missing.length === 0) {
    return offer
  }
  const catalog = await googleCatalog()
  for (const name of missing) {
    const standIn = standInFor(name)
    if (standIn) {
      // Shown in its stand-in already when that is installed: nothing is missing to the eye.
      if (status[standIn.id] === "installed" || available(standIn.family)) {
        continue
      }
      offer.standIns.push(standIn)
    } else {
      const web = matchWebFont(name, catalog)
      if (web) {
        offer.web.push(web)
      }
    }
    if (/^aptos/i.test(name)) {
      offer.aptos = true
    }
    offer.missing.push(name)
  }
  offer.standIns = [...new Set(offer.standIns)]
  return offer
}

/** The message bar's sentence for an offer. */
export function offerText(offer: FontOffer) {
  const count = offer.missing.length
  const opening = `This document uses ${listOf(offer.missing)}, which ${count > 1 ? "are" : "is"} not on this device.`
  const parts = [opening]
  if (offer.web.length) {
    parts.push(`Download ${listOf(offer.web.map((font) => font.name))} free from Google Fonts`)
  }
  if (offer.standIns.length) {
    const families = listOf(offer.standIns.map((font) => font.family))
    parts.push(
      `${offer.web.length ? "and" : "Download"} ${families}, ${offer.standIns.length > 1 ? "free fonts" : "a free font"} with the same widths`,
    )
  }
  if (offer.web.length || offer.standIns.length) {
    parts[parts.length - 1] += ", so it looks as in Word?"
  }
  const covered = new Set([...offer.web.map((font) => font.name)])
  const rest = offer.missing.filter((name) => !covered.has(name) && !standInFor(name))
  if (rest.length && (offer.web.length || offer.standIns.length)) {
    parts.push(`${listOf(rest)} ${rest.length > 1 ? "are" : "is"} shown in a similar font.`)
  } else if (rest.length) {
    parts.push(rest.length > 1 ? "They are shown in similar fonts." : "It is shown in a similar font.")
  }
  return parts.join(" ")
}

export function listOf(names: string[]) {
  return names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}
