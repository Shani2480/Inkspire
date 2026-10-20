import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const askAi = vi.fn(async () => true)
vi.mock("@/editor/actions", () => ({ askAi: (...args: unknown[]) => askAi(...args) }))
const editor = { view: {} }
vi.mock("@/editor/document-editor", () => ({ useBodyEditor: () => editor }))
vi.mock("@/components/rewrite-popover", () => ({ selectionAnchor: () => ({ top: 100, left: 100 }) }))

import { useAskAi } from "@/ai/ask-ai"
import { AskAiPrompt } from "@/components/ask-ai-prompt"

afterEach(() => {
  cleanup()
  askAi.mockClear()
  useAskAi.setState({ open: false })
})

describe("the AI button's prompt", () => {
  it("asks what to do with the selection and sends the request with its range", () => {
    useAskAi.setState({ open: true, from: 3, to: 9 })
    render(<AskAiPrompt />)
    fireEvent.change(screen.getByLabelText("What should AI do?"), { target: { value: "Make it punchier" } })
    fireEvent.click(screen.getByRole("button", { name: "Go" }))
    expect(askAi).toHaveBeenCalledWith(expect.anything(), "Make it punchier", { from: 3, to: 9 })
    expect(useAskAi.getState().open).toBe(false)
  })

  it("offers different suggestions at a caret, and Escape closes it", () => {
    useAskAi.setState({ open: true, from: 5, to: 5 })
    render(<AskAiPrompt />)
    expect(screen.getByText("Continue writing")).toBeTruthy()
    expect(screen.queryByText("Make it shorter")).toBeNull()
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    })
    expect(useAskAi.getState().open).toBe(false)
  })

  it("runs a suggestion at once", () => {
    useAskAi.setState({ open: true, from: 1, to: 4 })
    render(<AskAiPrompt />)
    fireEvent.click(screen.getByText("Make it shorter"))
    expect(askAi).toHaveBeenCalledWith(expect.anything(), "Make it shorter", { from: 1, to: 4 })
  })
})
