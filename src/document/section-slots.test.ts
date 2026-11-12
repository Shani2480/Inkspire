import { beforeEach, describe, expect, it } from "vitest"
import {
  canLink,
  isLinked,
  pageAtPosition,
  pageStory,
  sectionChromeStep,
  slotHome,
  type PagePlaces,
  type SlotState,
} from "@/document/section-slots"
import type { SectionChrome } from "@/document/sections"
import { slotHtml, useDocumentStore } from "@/document/store"

function section(key: string, parts: SectionChrome["parts"], differentFirstPage = false): SectionChrome {
  return {
    key,
    marginTop: 25.4,
    marginBottom: 25.4,
    headerFromEdge: 12.7,
    footerFromEdge: 12.7,
    differentFirstPage,
    parts,
    opened: { ...parts },
  }
}

/** Three sections: a cover (page 0) with a first page header, a body (pages 1-2) linked to it, the last (pages 3-4). */
const cover = section("a", { header: "<p>COVER</p>", firstHeader: "<p>FIRST</p>" }, true)
const body = section("b", {})
const state: SlotState = {
  sections: [cover, body],
  linkedSlots: ["header", "firstHeader"],
  differentFirstPage: false,
  differentOddEven: false,
}
const places: PagePlaces = { keys: ["a", "b", "b", "", ""], starts: [true, true, false, true, false] }

describe("the header a page of a section shows", () => {
  it("is its section's first page header on a section's first page when it has one, else the shared one", () => {
    expect([0, 1, 2, 3].map((page) => pageStory(state, places, page))).toEqual([
      "first",
      "default",
      "default",
      "default",
    ])
  })

  it("follows Link to Previous back to the section that has it", () => {
    expect(slotHome(state, body, "header")).toBe("a")
    expect(slotHome(state, null, "header")).toBe("a")
    // A slot no section has: the last section's own part.
    expect(slotHome(state, null, "footer")).toBeNull()
    expect(slotHome(state, cover, "header")).toBe("a")
  })

  it("is linked in every section but the first", () => {
    expect(canLink(state, cover)).toBe(false)
    expect(isLinked(state, cover, "footer")).toBe(false)
    expect(canLink(state, body)).toBe(true)
    expect(isLinked(state, body, "header")).toBe(true)
    expect(isLinked(state, null, "header")).toBe(true)
    expect(isLinked(state, null, "footer")).toBe(false)
    expect(canLink({ ...state, sections: [] }, null)).toBe(false)
  })
})

describe("Previous and Next across sections", () => {
  it("step through each section's headers in page order", () => {
    // Cover's first page, the body, the last section.
    expect(sectionChromeStep(state, places, 5, 0, 1)).toBe(1)
    expect(sectionChromeStep(state, places, 5, 2, 1)).toBe(3)
    expect(sectionChromeStep(state, places, 5, 4, -1)).toBe(1)
    expect(sectionChromeStep(state, places, 5, 1, -1)).toBe(0)
    expect(sectionChromeStep(state, places, 5, 0, -1)).toBeNull()
    expect(sectionChromeStep(state, places, 5, 4, 1)).toBeNull()
  })

  it("still step between the first, even and odd headers of one section", () => {
    const one: SlotState = { sections: [], linkedSlots: [], differentFirstPage: true, differentOddEven: true }
    const pages: PagePlaces = { keys: [], starts: [] }
    expect(sectionChromeStep(one, pages, 4, 0, 1)).toBe(1)
    expect(sectionChromeStep(one, pages, 4, 1, 1)).toBe(2)
    expect(sectionChromeStep(one, pages, 4, 3, -1)).toBe(0)
    expect(sectionChromeStep({ ...one, differentFirstPage: false, differentOddEven: false }, pages, 4, 1, 1)).toBeNull()
  })

  it("find the page of a body position from the page breaks", () => {
    expect(pageAtPosition([100, 200], 50)).toBe(0)
    expect(pageAtPosition([100, 200], 100)).toBe(1)
    expect(pageAtPosition([100, 200], 250)).toBe(2)
  })
})

describe("Link to Previous", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      sections: [cover, body],
      linkedSlots: ["header", "firstHeader"],
      headerHtml: "<p>COVER</p>",
      footerHtml: "<p>LAST FOOTER</p>",
      isDirty: false,
    })
  })

  it("unlinked, gives a section a copy of the header it showed", () => {
    useDocumentStore.getState().setSlotLinked("b", "header", false)
    const after = useDocumentStore.getState()
    expect(after.sections[1]!.parts.header).toBe("<p>COVER</p>")
    expect(after.isDirty).toBe(true)
    // Its own now: an edit there leaves the cover's alone.
    after.setSectionPart("b", "header", "<p>BODY</p>")
    expect(slotHtml("a", "header")).toBe("<p>COVER</p>")
    expect(slotHtml("b", "header")).toBe("<p>BODY</p>")
  })

  it("linked, drops the section's own, so the previous one's shows", () => {
    const store = useDocumentStore.getState()
    store.setSlotLinked("b", "header", false)
    useDocumentStore.getState().setSlotLinked("b", "header", true)
    expect(useDocumentStore.getState().sections[1]!.parts.header).toBeUndefined()
  })

  it("for the last section, unlinks to its own copy and links back", () => {
    useDocumentStore.getState().setSlotLinked(null, "footer", true)
    let after = useDocumentStore.getState()
    expect(after.linkedSlots).toContain("footer")
    // No section before has a footer: it shows none.
    expect(after.footerHtml).toBe("")
    after.setSlotLinked(null, "header", false)
    after = useDocumentStore.getState()
    expect(after.linkedSlots).not.toContain("header")
    expect(after.headerHtml).toBe("<p>COVER</p>")
  })

  it("does nothing for the first section, which has none before it", () => {
    useDocumentStore.getState().setSlotLinked("a", "header", true)
    expect(useDocumentStore.getState().sections[0]!.parts.header).toBe("<p>COVER</p>")
    expect(useDocumentStore.getState().isDirty).toBe(false)
  })
})
