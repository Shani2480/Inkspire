import { afterEach, describe, expect, it, vi } from "vitest"
import { androidRename } from "@/lib/android-bridge"

const host = globalThis as { InkspireFiles?: unknown }

afterEach(() => {
  delete host.InkspireFiles
})

describe("renaming a document on Android", () => {
  const uri = "content://com.android.externalstorage.documents/document/primary%3AReport.docx"

  it("is not Android's to do off Android, or for a file path", () => {
    expect(androidRename(uri, "Final.docx")).toBeUndefined()
    host.InkspireFiles = { renameDocument: vi.fn() }
    expect(androidRename("/docs/Report.docx", "Final.docx")).toBeUndefined()
  })

  it("renames in place and answers with the new link", () => {
    const renamed = "content://com.android.externalstorage.documents/document/primary%3AFinal.docx"
    const renameDocument = vi.fn(() => renamed)
    host.InkspireFiles = { renameDocument }
    expect(androidRename(uri, "Final.docx")).toBe(renamed)
    expect(renameDocument).toHaveBeenCalledWith(uri, "Final.docx")
  })

  it("answers null where the place does not rename", () => {
    host.InkspireFiles = { renameDocument: vi.fn(() => null) }
    expect(androidRename(uri, "Final.docx")).toBeNull()
  })
})
