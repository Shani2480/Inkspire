import { describe, expect, it } from "vitest"
import { DEFAULT_PAGE_SETUP } from "@/document/page-setup"
import { columnsBlockwise, drawnColumns, sectionPageSetup, type SectionChrome } from "@/document/sections"

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

  it("are each section's own when two sections have different counts above one", () => {
    const body = section("b", { columns: 2 })
    const three = { ...DEFAULT_PAGE_SETUP, columns: 3 }
    expect(columnsBlockwise(three, [body])).toBe(true)
    expect(drawnColumns(three, [body], body).columns).toBe(2)
    expect(drawnColumns(three, [body], null).columns).toBe(3)
  })

  it("are laid out block by block only when they cannot be the browser's one flow", () => {
    const cover = section("a", { columns: 1 })
    expect(columnsBlockwise(twoColumns, [cover])).toBe(false)
    expect(columnsBlockwise(twoColumns, [section("b", { columns: 2, columnGap: 1.25 })])).toBe(false)
    expect(columnsBlockwise(twoColumns, [section("b", { columns: 2, columnGap: 2 })])).toBe(true)
    const widths = [
      { width: 5, space: 1 },
      { width: 9, space: 0 },
    ]
    expect(columnsBlockwise(twoColumns, [section("b", { columns: 2, columnWidths: widths })])).toBe(true)
    // A one-column section in a document of unequal columns stays one column.
    const setup = { ...twoColumns, columnWidths: widths }
    expect(drawnColumns(setup, [cover], cover).columns).toBe(1)
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
