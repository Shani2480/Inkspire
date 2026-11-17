import { afterEach, describe, expect, it, vi } from "vitest"
import { pickAndroidNewDocument } from "@/lib/file-io"

type Host = { InkspireFiles?: unknown; __inkspirePicked?: (uri: string | null) => void }
const host = globalThis as Host

afterEach(() => {
  delete host.InkspireFiles
  delete host.__inkspirePicked
})

describe("Save As on Android", () => {
  it("is left to the other pickers off Android", () => {
    expect(pickAndroidNewDocument([{ name: "Word Document", extensions: ["docx"] }], "Report.docx")).toBeNull()
  })

  it("asks Android's picker for the new file by name and type, and answers with its content link", async () => {
    const createDocument = vi.fn()
    host.InkspireFiles = { createDocument }
    const picked = pickAndroidNewDocument([{ name: "Word Document", extensions: ["docx"] }], "/docs/Report.docx")!
    expect(createDocument).toHaveBeenCalledWith(
      "Report.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    host.__inkspirePicked!("content://com.android.externalstorage.documents/document/primary%3AReport.docx")
    await expect(picked).resolves.toBe("content://com.android.externalstorage.documents/document/primary%3AReport.docx")
    expect(host.__inkspirePicked).toBeUndefined()
  })

  it("answers null when the picker is cancelled", async () => {
    host.InkspireFiles = { createDocument: vi.fn() }
    const picked = pickAndroidNewDocument([{ name: "Text", extensions: ["txt"] }], "Notes")!
    host.__inkspirePicked!(null)
    await expect(picked).resolves.toBeNull()
  })
})
