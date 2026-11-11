import type { PageOrientation, PageSetup, PaperSize } from "@/document/page-setup"

/** The six headers and footers a section can have. */
export type ChromeSlot = "header" | "footer" | "firstHeader" | "firstFooter" | "evenHeader" | "evenFooter"

export const CHROME_SLOTS: ChromeSlot[] = ["header", "footer", "firstHeader", "firstFooter", "evenHeader", "evenFooter"]

/**
 * A Word section before the document's last one (the last is the document's own page setup and header and footer).
 * Each section has its own top and bottom margins and headers and footers; one it has none of its own for is Linked
 * to Previous, and shows (and edits) the one before it.
 */
export type SectionChrome = {
  /** The anchor of the paragraph whose section break ends the section; the editor's section break carries it. */
  key: string
  /** Margins and the header and footer distances, in mm. */
  marginTop: number
  marginBottom: number
  headerFromEdge: number
  footerFromEdge: number
  differentFirstPage: boolean
  /**
   * Its own paper, orientation and side margins (mm), as Page Setup holds them (`paperWidth`/`paperHeight` 0: the named
   * paper). Absent (an older native file): the document's. Pages are still drawn with the document's paper and side
   * margins; these are what Page Setup shows for the section and what is saved.
   */
  paper?: PaperSize
  orientation?: PageOrientation
  paperWidth?: number
  paperHeight?: number
  marginLeft?: number
  marginRight?: number
  /** Format Page Numbers: its first page's number (absent or null: going on from the section before) and format. */
  pageNumberStart?: number | null
  pageNumberFormat?: string
  /** Its own headers and footers as editor HTML; a slot it has not is linked to the previous section's. */
  parts: Partial<Record<ChromeSlot, string>>
  /** The parts as they were opened, so saving rewrites only the ones that were edited. */
  opened: Partial<Record<ChromeSlot, string>>
}

/** What Page Setup and Format Page Numbers change in a section before the last. */
export type SectionSetupPatch = Partial<
  Pick<
    SectionChrome,
    | "marginTop"
    | "marginBottom"
    | "marginLeft"
    | "marginRight"
    | "paper"
    | "orientation"
    | "paperWidth"
    | "paperHeight"
    | "headerFromEdge"
    | "footerFromEdge"
    | "differentFirstPage"
    | "pageNumberStart"
    | "pageNumberFormat"
  >
>

/**
 * The section a page is in, from the editor's section breaks in order (`ids`) and how many of them come before the
 * page. A break the file did not have (inserted here) splits the section after it, so its pages take that one's
 * setup; pages after the last break are in the document's own section (`null`).
 */
export function sectionAt(sections: SectionChrome[], ids: string[], index: number): SectionChrome | null {
  for (let at = index; at < ids.length; at += 1) {
    const found = sections.find((section) => section.key === ids[at])
    if (found) {
      return found
    }
  }
  return null
}

/**
 * Which section a slot's header or footer belongs to, following Link to Previous back from `section`: the nearest one
 * with its own, else the first section (where Word keeps one made for a chain that had none).
 */
export function slotOwner(sections: SectionChrome[], section: SectionChrome, slot: ChromeSlot): SectionChrome {
  const at = sections.indexOf(section)
  for (let index = at; index >= 0; index -= 1) {
    if (sections[index]!.parts[slot] !== undefined) {
      return sections[index]!
    }
  }
  return sections[0] ?? section
}

/** The page setup a section's pages are laid out with: the document's, with the section's own margins. */
export function sectionSetup(setup: PageSetup, section: SectionChrome | null): PageSetup {
  if (!section) {
    return setup
  }
  return {
    ...setup,
    marginTop: section.marginTop,
    marginBottom: section.marginBottom,
    headerFromEdge: section.headerFromEdge,
    footerFromEdge: section.footerFromEdge,
  }
}

/**
 * The section the position `pos` of the body is in: the one ended by the first section break that starts a page after
 * it, or `null` for the document's own last section. `breaks` are those breaks' positions and keys, in order.
 */
export function sectionAtPosition(
  sections: SectionChrome[],
  breaks: { pos: number; key: string }[],
  pos: number,
): SectionChrome | null {
  const before = breaks.filter((item) => item.pos < pos).length
  return sectionAt(
    sections,
    breaks.map((item) => item.key),
    before,
  )
}

/** The fields of Page Setup a section has of its own (see `SectionChrome`). */
export const SECTION_PAPER_FIELDS = [
  "paper",
  "orientation",
  "paperWidth",
  "paperHeight",
  "marginLeft",
  "marginRight",
] as const

/**
 * A section's whole page setup, as Page Setup shows it: the document's, with everything the section has of its own,
 * paper and side margins included (`sectionSetup` leaves those out, since pages are drawn with the document's).
 */
export function sectionPageSetup(setup: PageSetup, section: SectionChrome | null): PageSetup {
  if (!section) {
    return setup
  }
  const own: Partial<PageSetup> = {}
  for (const field of SECTION_PAPER_FIELDS) {
    if (section[field] !== undefined) {
      Object.assign(own, { [field]: section[field] })
    }
  }
  return { ...sectionSetup(setup, section), ...own }
}
