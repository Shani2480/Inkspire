import { describe, expect, it } from "vitest"
import { isContentUri, pathBaseName, sniffExtension } from "@/lib/paths"

const bytes = (text: string) => new TextEncoder().encode(text)

describe("pathBaseName", () => {
  it("takes the last part of a desktop path", () => {
    expect(pathBaseName("/home/a/Report.docx")).toBe("Report.docx")
    expect(pathBaseName("C:\\Users\\a\\Report.docx")).toBe("Report.docx")
  })

  it("reads the name out of an Android document link", () => {
    const uri = "content://com.android.externalstorage.documents/document/primary%3ADocuments%2FReport%20Q3.docx"
    expect(isContentUri(uri)).toBe(true)
    expect(pathBaseName(uri)).toBe("Report Q3.docx")
  })

  it("asks Android for the name a link's provider shows", () => {
    const uri = "content://com.android.providers.media.documents/document/document%3A42"
    ;(globalThis as Record<string, unknown>).InkspireFiles = { displayName: () => "Budget.docx" }
    try {
      expect(pathBaseName(uri)).toBe("Budget.docx")
    } finally {
      delete (globalThis as Record<string, unknown>).InkspireFiles
    }
  })

  it("keeps a provider's bare id when the link has no name", () => {
    expect(pathBaseName("content://com.android.providers.downloads.documents/document/msf%3A1234")).toBe("1234")
  })
})

describe("sniffExtension", () => {
  it("knows .docx (a zip), RTF, PDF and HTML by their first bytes", () => {
    expect(sniffExtension(new Uint8Array([0x50, 0x4b, 3, 4]))).toBe("docx")
    expect(sniffExtension(bytes("{\\rtf1\\ansi"))).toBe("rtf")
    expect(sniffExtension(bytes("%PDF-1.7"))).toBe("pdf")
    expect(sniffExtension(bytes("  <!doctype html>"))).toBe("html")
    expect(sniffExtension(bytes("plain words"))).toBe("txt")
  })
})
