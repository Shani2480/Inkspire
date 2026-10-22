import { describe, expect, it } from "vitest"
import { isBlankHtml, isBlankNewDocument } from "@/document/blank"
import { useDocumentStore } from "@/document/store"

describe("blank document guard", () => {
  it("knows an empty page from one with content", () => {
    expect(isBlankHtml("")).toBe(true)
    expect(isBlankHtml('<p style="text-align: left;"></p>')).toBe(true)
    expect(isBlankHtml("<p></p><p><br></p>")).toBe(true)
    expect(isBlankHtml("<p>Hello</p>")).toBe(false)
    expect(isBlankHtml("<p>&nbsp;x</p>")).toBe(false)
    expect(isBlankHtml('<p><img src="a.png"></p>')).toBe(false)
    expect(isBlankHtml("<table><tr><td><p></p></td></tr></table>")).toBe(false)
    expect(isBlankHtml('<p><span data-date-field="" data-date-format="date">1/1/2026</span></p>')).toBe(false)
    expect(isBlankHtml('<div data-figure="" data-kind="shape"></div>')).toBe(false)
  })

  it("a new document with empty body, headers and footers is blank; a file never is", () => {
    const base = {
      currentFilePath: null,
      documentHTML: "<p></p>",
      headerHtml: "",
      footerHtml: "",
      firstHeaderHtml: "",
      evenHeaderHtml: "",
      firstFooterHtml: "",
      evenFooterHtml: "",
    }
    expect(isBlankNewDocument(base)).toBe(true)
    expect(isBlankNewDocument({ ...base, headerHtml: "<p>Draft</p>" })).toBe(false)
    expect(isBlankNewDocument({ ...base, currentFilePath: "/tmp/a.docx" })).toBe(false)
  })

  it("the store never marks a blank new document unsaved, and does once something is typed", () => {
    const store = useDocumentStore.getState()
    store.startUntitled('<p style="text-align: left;"></p>')
    store.noteEdit("<p></p>")
    expect(useDocumentStore.getState().isDirty).toBe(false)
    store.setHeader("")
    store.setPageSetup({ ...useDocumentStore.getState().pageSetup, marginTop: 30 })
    expect(useDocumentStore.getState().isDirty).toBe(false)
    store.noteEdit("<p>Hello</p>")
    expect(useDocumentStore.getState().isDirty).toBe(true)
    store.noteEdit("<p></p>")
    expect(useDocumentStore.getState().isDirty).toBe(false)
  })
})
