// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { isOpenFile, openFilePaths } from "@/document/recovery"
import { WINDOW_ID, openWindows, readRequest, registerWindow, windowWithPath } from "@/document/windows"

afterEach(() => {
  localStorage.clear()
})

describe("window requests", () => {
  it("reads what a new window opens and rejects anything else", () => {
    expect(readRequest({ kind: "path", path: "/docs/a.docx" })).toEqual({ kind: "path", path: "/docs/a.docx" })
    expect(readRequest({ kind: "handoff", id: "x1" })).toEqual({ kind: "handoff", id: "x1" })
    expect(readRequest({ kind: "blank" })).toEqual({ kind: "blank" })
    expect(readRequest({ kind: "path", path: "" })).toBeNull()
    expect(readRequest({ kind: "script", code: "alert(1)" })).toBeNull()
    expect(readRequest("blank")).toBeNull()
  })
})

describe("open windows", () => {
  it("lists this window and finds a file open in another one", () => {
    const now = Date.now()
    localStorage.setItem(
      "inkspire-windows",
      JSON.stringify({
        other: {
          id: "other",
          label: "doc-1",
          name: "Report.docx",
          path: "C:\\Docs\\Report.docx",
          dirty: false,
          since: now - 10,
          at: now,
        },
        gone: {
          id: "gone",
          label: "doc-2",
          name: "Old.docx",
          path: "/old.docx",
          dirty: false,
          since: now - 20,
          at: now - 60_000,
        },
      }),
    )
    const stop = registerWindow(
      () => ({ name: "Document1", path: null, dirty: true }),
      () => () => undefined,
    )
    expect(openWindows().map((entry) => entry.id)).toEqual(["other", WINDOW_ID])
    expect(windowWithPath("c:/docs/report.docx")?.id).toBe("other")
    expect(windowWithPath("/old.docx")).toBeUndefined()
    stop()
    expect(openWindows().map((entry) => entry.id)).toEqual(["other"])
  })
})

describe("drafts of files that are open (Unsaved Documents)", () => {
  it("are not offered while the file is open in another live window, in any spelling of its path", () => {
    const now = Date.now()
    localStorage.setItem(
      "inkspire-windows",
      JSON.stringify({
        other: {
          id: "other",
          label: "doc-1",
          name: "R",
          path: "C:\\Docs\\Report.docx",
          dirty: false,
          since: now,
          at: now,
        },
        gone: { id: "gone", label: "doc-2", name: "O", path: "/old.docx", dirty: false, since: now, at: now - 60_000 },
      }),
    )
    const open = openFilePaths()
    expect(isOpenFile("c:/docs/report.docx", open)).toBe(true)
    // A window that has closed no longer holds its file, and a draft with no file is never held.
    expect(isOpenFile("/old.docx", open)).toBe(false)
    expect(isOpenFile(null, open)).toBe(false)
  })
})
