import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { TextPromptHost, askText } from "@/components/text-prompt"

describe("askText", () => {
  afterEach(cleanup)

  it("resolves with the typed text when the dialog is accepted", async () => {
    render(<TextPromptHost />)
    let answer: Promise<string | null> = Promise.resolve(null)
    act(() => {
      answer = askText({ title: "Insert Hyperlink", label: "Address:", value: "https://" })
    })
    const field = screen.getByLabelText("Address:") as HTMLInputElement
    expect(field.value).toBe("https://")
    fireEvent.change(field, { target: { value: "https://example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "OK" }))
    await expect(answer).resolves.toBe("https://example.com")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("resolves with null when cancelled, and a second request cancels the first", async () => {
    render(<TextPromptHost />)
    let first: Promise<string | null> = Promise.resolve("unset")
    let second: Promise<string | null> = Promise.resolve("unset")
    act(() => {
      first = askText({ title: "One", label: "First:" })
    })
    act(() => {
      second = askText({ title: "Two", label: "Second:" })
    })
    await expect(first).resolves.toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await expect(second).resolves.toBeNull()
  })
})
