import { describe, expect, it } from "vitest"
import {
  chromeHasContent,
  chromeHasPageField,
  chromeOnPage,
  chromeWithoutPageFields,
  pageFieldHtml,
} from "@/document/chrome-html"

describe("page number fields in a header or footer", () => {
  const footer = `<p>Page ${pageFieldHtml("page")} of ${pageFieldHtml("pages")}</p>`

  it("shows the number of the page it is drawn on, and the number of pages", () => {
    const shown = chromeOnPage(footer, 3, 12)
    expect(shown).toMatch(/data-page-field="page"[^>]*>3<\/span>/)
    expect(shown).toMatch(/data-page-field="pages"[^>]*>12<\/span>/)
  })

  it("shows the number of the page in a copy of what the editor drew", () => {
    const drawn = pageFieldHtml("page").replace(">1</span>", '><span class="field-value">1</span></span>')
    const shown = chromeOnPage(`<p>Page ${drawn}</p>`, 7, 9)
    expect(shown).toContain('<span class="field-value">7</span></span>')
    expect(shown).not.toContain(">1<")
  })

  it("is content by itself, and can be taken out", () => {
    const only = pageFieldHtml("page", "center")
    expect(chromeHasPageField(only)).toBe(true)
    expect(chromeHasContent(only)).toBe(true)
    const without = chromeWithoutPageFields(footer)
    expect(chromeHasPageField(without)).toBe(false)
    expect(without).toContain("Page")
  })

  it("is not mistaken for other fields", () => {
    expect(chromeHasPageField('<p><span data-word-inline data-role="field" data-text="1">1</span></p>')).toBe(false)
  })
})
