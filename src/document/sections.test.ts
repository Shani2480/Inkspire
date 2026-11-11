import { describe, expect, it } from "vitest"
import { DEFAULT_PAGE_SETUP } from "@/document/page-setup"
import { drawnColumns, sectionPageSetup, type SectionChrome } from "@/document/sections"

function section(key: string, own: Partial<SectionChrome> = {}): SectionChrome {
  return {
    key,
    marginTop: 25.4,
    marginBottom: 25.4,
    headerFromEdge: 12.7,
    footerFromEdge: 12.7,
    differentFirstPage: false,
    parts: {},
    opened: {},
    ...own,
  }
}

describe("the columns a section's pages are drawn with", () => {
  const twoColumns = { ...DEFAULT_PAGE_SETUP, columns: 2, columnGap: 1.25 }

  it("are one across the page for a one-column section, and the document's for the rest", () => {
    const cover = section("a", { columns: 1 })
    expect(drawnColumns(twoColumns, [cover], cover).columns).toBe(1)
    expect(drawnColumns(twoColumns, [cover], null).columns).toBe(2)
  })

  it("take the columns and gap of a section when the document has none", () => {
    const body = section("b", { columns: 3, columnGap: 0.5, columnLine: true })
    const one = { ...DEFAULT_PAGE_SETUP, columns: 1 }
    expect(drawnColumns(one, [body], body)).toMatchObject({ columns: 3, columnGap: 0.5, columnLine: true })
    expect(drawnColumns(one, [body], null).columns).toBe(1)
  })

  it("draw a section with fewer columns above one with the most any section has", () => {
    const body = section("b", { columns: 2 })
    expect(drawnColumns({ ...DEFAULT_PAGE_SETUP, columns: 3 }, [body], body).columns).toBe(3)
  })

  it("are the document's unequal columns everywhere", () => {
    const widths = [
      { width: 5, space: 1 },
      { width: 9, space: 0 },
    ]
    const setup = { ...twoColumns, columnWidths: widths }
    expect(drawnColumns(setup, [section("a", { columns: 1 })], null).columnWidths).toEqual(widths)
  })

  it("leave a section's equal columns equal in Page Setup when the document's are unequal", () => {
    const setup = {
      ...twoColumns,
      columnWidths: [
        { width: 5, space: 1 },
        { width: 9, space: 0 },
      ],
    }
    expect(sectionPageSetup(setup, section("a", { columns: 2 })).columnWidths).toBeUndefined()
    expect(sectionPageSetup(setup, section("a")).columnWidths).toHaveLength(2)
  })
})
