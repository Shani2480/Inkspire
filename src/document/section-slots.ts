import type { ChromeStory } from "@/document/chrome-editing"
import { type ChromeSlot, type SectionChrome, slotOwner } from "@/document/sections"

/**
 * Where each page's header and footer come from: the section it is in (a section before the last by key, or "" for
 * the document's own last section) and whether it is that section's first page. The paginator's `pageSections` and
 * `sectionStarts`.
 */
export type PagePlaces = { keys: string[]; starts: boolean[] }

/** What the headers and footers of a document are, as the document store holds them. */
export type SlotState = {
  sections: SectionChrome[]
  linkedSlots: ChromeSlot[]
  differentFirstPage: boolean
  differentOddEven: boolean
}

/** The slot a story of a header or footer is kept in. */
export function slotOf(story: ChromeStory, part: "header" | "footer"): ChromeSlot {
  if (story === "first") {
    return part === "header" ? "firstHeader" : "firstFooter"
  }
  if (story === "even") {
    return part === "header" ? "evenHeader" : "evenFooter"
  }
  return part
}

/** The section of page `page` (`null`: the document's own last section). A break the file did not have is the last's. */
export function sectionOfPage(state: SlotState, places: PagePlaces, page: number): SectionChrome | null {
  const key = places.keys[page] ?? ""
  return key ? (state.sections.find((item) => item.key === key) ?? null) : null
}

/** Which story a page shows: its section's first page's, the even pages', or the one every page shares. */
export function pageStory(state: SlotState, places: PagePlaces, page: number): ChromeStory {
  const section = sectionOfPage(state, places, page)
  const starts = places.starts[page] ?? page === 0
  if (starts && (section ? section.differentFirstPage : state.differentFirstPage)) {
    return "first"
  }
  return state.differentOddEven && page % 2 === 1 ? "even" : "default"
}

/**
 * Where a section's header or footer is kept, following Link to Previous: the key of the section before the last that
 * holds it, or `null` for the document's own (last section's) part.
 */
export function slotHome(state: SlotState, section: SectionChrome | null, slot: ChromeSlot): string | null {
  if (section) {
    return slotOwner(state.sections, section, slot).key
  }
  const previous = state.sections[state.sections.length - 1]
  if (previous && state.linkedSlots.includes(slot)) {
    const owner = slotOwner(state.sections, previous, slot)
    if (owner.parts[slot] !== undefined) {
      return owner.key
    }
  }
  return null
}

/** Whether a section's header or footer is Linked to Previous; the first section has nothing to link to. */
export function isLinked(state: SlotState, section: SectionChrome | null, slot: ChromeSlot) {
  if (section) {
    return state.sections.indexOf(section) > 0 && section.parts[slot] === undefined
  }
  return state.sections.length > 0 && state.linkedSlots.includes(slot)
}

/** Whether a section has a previous one to link to: every section but the first. */
export function canLink(state: SlotState, section: SectionChrome | null) {
  return section ? state.sections.indexOf(section) > 0 : state.sections.length > 0
}

/**
 * Word's Previous and Next on the Header & Footer tab: the page where the previous or next header (or footer) shows
 * first, in page order, or `null` when there is none. Each section's first-page, even and odd parts count apart, so the
 * steps go through the sections in turn, as in Word.
 */
export function sectionChromeStep(state: SlotState, places: PagePlaces, pages: number, page: number, step: 1 | -1) {
  const name = (index: number) => `${places.keys[index] ?? ""}\u0001${pageStory(state, places, index)}`
  const starts: number[] = []
  const seen = new Set<string>()
  for (let index = 0; index < pages; index++) {
    if (!seen.has(name(index))) {
      seen.add(name(index))
      starts.push(index)
    }
  }
  const at = starts.findIndex((start) => name(start) === name(page))
  const target = starts[at + step]
  return at < 0 || target === undefined ? null : target
}

/** The page the body's position `pos` is laid out on, from the paginator's page break positions. */
export function pageAtPosition(breaks: number[], pos: number) {
  return breaks.filter((item) => item <= pos).length
}
