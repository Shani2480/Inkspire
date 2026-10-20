import { beforeEach, describe, expect, it, vi } from "vitest"

const readBytes = vi.fn()
vi.mock("@/lib/file-io", async (original) => ({
  ...(await original<typeof import("@/lib/file-io")>()),
  readBytes: (path: string) => readBytes(path),
}))
const openWindow = vi.fn(() => true)
vi.mock("@/document/windows", async (original) => ({
  ...(await original<typeof import("@/document/windows")>()),
  openWindow: (request: unknown) => openWindow(request),
  windowWithPath: () => null,
}))

import { openRecentDocument } from "@/document/commands"
import { useBackstage } from "@/document/backstage"
import { useFileError } from "@/document/file-errors"

beforeEach(() => {
  readBytes.mockReset()
  openWindow.mockClear()
  useFileError.setState({ problem: null, resolve: null })
  useBackstage.getState().openBackstage("home")
})

describe("opening a missing recent file (21.45)", () => {
  it("shows the file error and leaves the backstage on Home", async () => {
    readBytes.mockRejectedValue(new Error("No such file or directory"))
    const tab = useBackstage.getState().tab
    openRecentDocument("/gone/report.docx")
    await vi.waitFor(() => expect(useFileError.getState().problem).not.toBeNull())
    expect(openWindow).not.toHaveBeenCalled()
    expect(useBackstage.getState().tab).toBe(tab)
    expect(tab).toBe("home")
    expect(useBackstage.getState().open).toBe(true)
    // Closing the dialog leaves the list as it was.
    useFileError.getState().answer("close")
    expect(useBackstage.getState().tab).toBe("home")
  })

  it("opens an existing file in a window as before", async () => {
    readBytes.mockResolvedValue(new Uint8Array([1]))
    openRecentDocument("/here/report.docx")
    await vi.waitFor(() => expect(openWindow).toHaveBeenCalledWith({ kind: "path", path: "/here/report.docx" }))
    expect(useFileError.getState().problem).toBeNull()
  })
})
