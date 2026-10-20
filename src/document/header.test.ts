import { describe, expect, it } from "vitest"
import { emptyChrome, packDocument, unpackDocument, type DocumentChrome } from "@/document/header"
import { DEFAULT_PAGE_SETUP } from "@/document/page-setup"

describe("document chrome pack/unpack", () => {
  it("round-trips headers, footers, and page setup", () => {
    const chrome: DocumentChrome = {
      header: "Top header",
      footer: "Bottom footer",
      differentFirstPage: true,
      firstHeader: "First header",
      firstFooter: "First footer",
      headerShapes: [],
      footerShapes: [],
      firstHeaderShapes: [],
      firstFooterShapes: [],
      pageSetup: {
        ...DEFAULT_PAGE_SETUP,
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
    expect(unpacked.pageSetup).toEqual(chrome.pageSetup)
  })

  it("leaves plain html alone", () => {
    const raw = "<p>No chrome</p>"
    const unpacked = unpackDocument(raw)
    expect(unpacked.html).toBe(raw)
    expect(unpacked).toMatchObject(emptyChrome())
  })
})
