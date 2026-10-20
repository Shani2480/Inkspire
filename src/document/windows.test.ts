// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
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
