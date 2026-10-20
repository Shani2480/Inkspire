import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const editor = {
  getHTML: () => "<h1>Title</h1><p>Body</p>",
  state: { doc: { textContent: "Title Body" } },
  on: () => undefined,
  off: () => undefined,
}
vi.mock("@/editor/document-editor", () => ({ useDocumentEditor: () => editor }))
vi.mock("@tiptap/react", () => ({
  useEditorState: ({ selector }: { selector: (s: { editor: unknown }) => unknown }) => selector({ editor }),
}))

import { ReadBar, ReadView } from "@/components/read-mode"
import { useViewStore } from "@/document/view"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
)

afterEach(() => {
  cleanup()
  useViewStore.setState({ layoutMode: "print", readColumnWidth: "default", readPageColor: "none" })
})

describe("Read Mode", () => {
  it("shows the document as text to read, with the colour the View menu chose", () => {
    useViewStore.setState({ layoutMode: "read", readPageColor: "sepia" })
    const { container } = render(<ReadView onHeadings={() => undefined} />)
    expect(screen.getByText("Body")).toBeTruthy()
    expect(container.querySelector(".read-view")?.getAttribute("data-color")).toBe("sepia")
  })

  it("lists the headings for the Tools menu", () => {
    const onHeadings = vi.fn()
    useViewStore.setState({ layoutMode: "read" })
    render(<ReadView onHeadings={onHeadings} />)
    expect(onHeadings).toHaveBeenCalledWith(["Title"], expect.any(Function))
  })

  it("leaves Read Mode with Escape", () => {
    useViewStore.setState({ layoutMode: "read" })
    render(<ReadView onHeadings={() => undefined} />)
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" })
    })
    expect(useViewStore.getState().layoutMode).toBe("print")
  })

  it("has Edit Document to get back to editing", () => {
    useViewStore.setState({ layoutMode: "read" })
    render(<ReadBar headings={[]} onHeading={() => undefined} />)
    fireEvent.click(screen.getAllByRole("button", { name: /Edit Document/ })[0]!)
    expect(useViewStore.getState().layoutMode).toBe("print")
  })
})
