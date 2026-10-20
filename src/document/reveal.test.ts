import { beforeEach, describe, expect, it, vi } from "vitest"

const invoke = vi.fn()
let tauri = true
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }))
vi.mock("@/lib/platform", () => ({ isTauriRuntime: () => tauri }))

import { useFileError } from "@/document/file-errors"
import { revealDocument, revealTitle } from "@/document/reveal"

beforeEach(() => {
  invoke.mockReset()
  tauri = true
  useFileError.setState({ problem: null, resolve: null })
})

describe("Open containing folder (21.34)", () => {
  it("asks the desktop to show the file, spaces and all", async () => {
    invoke.mockResolvedValue(undefined)
    expect(await revealDocument("/home/a b/My file.docx")).toBe(true)
    expect(invoke).toHaveBeenCalledWith("reveal_document", { path: "/home/a b/My file.docx" })
  })

  it("says the file is gone instead of opening a folder, and can drop it from Recent", async () => {
    invoke.mockRejectedValue("The file could not be found.")
    const forget = vi.fn()
    const done = revealDocument("/gone/old.docx", forget)
    await vi.waitFor(() => expect(useFileError.getState().problem).not.toBeNull())
    expect(useFileError.getState().problem?.kind).toBe("not-found")
    useFileError.getState().answer("remove-recent")
    expect(await done).toBe(false)
    expect(forget).toHaveBeenCalledWith("/gone/old.docx")
  })

  it("does nothing in the web build and explains why", async () => {
    tauri = false
    expect(await revealDocument("/x/y.docx")).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
    expect(revealTitle(false)).toMatch(/desktop app/)
  })
})
