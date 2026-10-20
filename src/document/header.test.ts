import { describe, expect, it } from "vitest"
import { emptyChrome, packDocument, unpackDocument, type DocumentChrome } from "@/document/header"
import { DEFAULT_PAGE_SETUP } from "@/document/page-setup"

describe("document chrome pack/unpack", () => {
  it("round-trips headers, footers, and page setup", () => {
    const chrome: DocumentChrome = {
      header: "<p>Top header</p>",
      footer: "<p>Bottom footer</p>",
      differentFirstPage: true,
      firstHeader: "<p>First header</p>",
      firstFooter: "<p>First footer</p>",
      evenHeader: "<p>Even header</p>",
      evenFooter: "<p>Even footer</p>",
      pageSetup: {
        ...DEFAULT_PAGE_SETUP,
        differentOddEven: true,
        paper: "a4",
        orientation: "landscape",
        marginTop: 20,
        marginRight: 18,
        marginBottom: 22,
        marginLeft: 16,
        columns: 2,
        lineNumbers: true,
        watermark: "DRAFT",
        border: "single",
        borderColor: "#112233",
        borderWidth: 1.5,
        pageColor: "#fefefe",
        pageNumber: "top-right",
        hyphenation: true,
        language: "de",
        bodyFont: "Georgia",
        headingFont: "Arial",
        spacing: "compact",
      },
    }
    const packed = packDocument("<p>Body</p>", chrome)
    const unpacked = unpackDocument(packed)

    expect(unpacked.html).toBe("<p>Body</p>")
    expect(unpacked.header).toBe(chrome.header)
    expect(unpacked.footer).toBe(chrome.footer)
    expect(unpacked.differentFirstPage).toBe(true)
    expect(unpacked.firstHeader).toBe(chrome.firstHeader)
    expect(unpacked.firstFooter).toBe(chrome.firstFooter)
    expect(unpacked.evenHeader).toBe(chrome.evenHeader)
    expect(unpacked.evenFooter).toBe(chrome.evenFooter)
    expect(unpacked.pageSetup).toEqual(chrome.pageSetup)
  })

  it("keeps a header's picture and more than 160 characters of text", () => {
    const header = `<p>${"long ".repeat(60)}</p><img src="data:image/png;base64,AAAA" width="40" height="20">`
    const unpacked = unpackDocument(packDocument("<p>Body</p>", { ...emptyChrome(), header }))
    expect(unpacked.header).toBe(header)
  })

  it("reads a plain-text header from an older file as a paragraph", () => {
    const unpacked = unpackDocument("<!-- aiword-header:Old%20header -->\n<p>Body</p>")
    expect(unpacked.header).toBe("<p>Old header</p>")
  })

  it("leaves plain html alone", () => {
    const raw = "<p>No chrome</p>"
    const unpacked = unpackDocument(raw)
    expect(unpacked.html).toBe(raw)
    expect(unpacked).toMatchObject(emptyChrome())
  })
})
