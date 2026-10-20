import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const editor = { on: () => undefined, off: () => undefined, chain: () => ({}) }
vi.mock("@/editor/document-editor", () => ({ useDocumentEditor: () => editor }))
let matches = 3
const replace = vi.fn(() => {
  matches = 0
})
vi.mock("@/editor/find", () => ({
  findTextRanges: () => Array.from({ length: matches }, (_, index) => ({ from: index, to: index + 1 })),
  replaceTextRanges: (...args: unknown[]) => replace(...args),
}))

import { FindDialog } from "@/components/find-dialog"
import { useViewStore } from "@/document/view"

afterEach(() => {
  cleanup()
  replace.mockClear()
  matches = 3
  useViewStore.setState({ findOpen: false, findTab: "find" })
})

function openReplace() {
  useViewStore.setState({ findOpen: true, findTab: "replace" })
  render(<FindDialog />)
  fireEvent.change(screen.getByLabelText("Find"), { target: { value: "cat" } })
}

describe("Replace All", () => {
  it("says how many occurrences it replaced", () => {
    openReplace()
    fireEvent.click(screen.getByRole("button", { name: "Replace All" }))
    expect(replace).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Replaced 3 occurrences.")).toBeTruthy()
  })

  it("uses the singular for one", () => {
    matches = 1
    openReplace()
    fireEvent.click(screen.getByRole("button", { name: "Replace All" }))
    expect(screen.getByText("Replaced 1 occurrence.")).toBeTruthy()
  })

  it("goes back to the match count once the search changes", () => {
    openReplace()
    fireEvent.click(screen.getByRole("button", { name: "Replace All" }))
    matches = 2
    fireEvent.change(screen.getByLabelText("Find"), { target: { value: "dog" } })
    expect(screen.getByText("2 found")).toBeTruthy()
  })
})
