import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HelpDialogs } from "@/components/help-dialogs"
import { FEEDBACK_FORM } from "@/document/feedback"
import { useHelp } from "@/document/help"

describe("Feedback dialog", () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("posts the answer to the feedback form, with details only when asked", async () => {
    const post = vi.fn(async () => new Response(null))
    vi.stubGlobal("fetch", post)
    useHelp.setState({ dialog: "feedback" })
    render(<HelpDialogs />)
    fireEvent.change(screen.getByLabelText("Tell us more"), { target: { value: "Dark mode is great" } })
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    await screen.findByText(/Thank you/)
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(FEEDBACK_FORM)
    const body = init.body as URLSearchParams
    expect(body.get("entry.2091830440")).toBe("Dark mode is great")
    expect(body.get("entry.761544046")).toBe("")
  })

  it("says so when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    )
    useHelp.setState({ dialog: "feedback" })
    render(<HelpDialogs />)
    fireEvent.change(screen.getByLabelText("Tell us more"), { target: { value: "x" } })
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Could not send"))
  })
})
