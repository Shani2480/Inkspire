import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { DialogFrame } from "@/components/word-dialog"

afterEach(cleanup)

describe("DialogFrame", () => {
  it("opens on the page itself, not inside the ribbon panel that asked for it", () => {
    const { container } = render(
      <div data-slot="tabs-content">
        <DialogFrame title="Bookmark" width={400} onClose={() => {}}>
          Body
        </DialogFrame>
      </div>,
    )
    const dialog = screen.getByRole("dialog", { name: "Bookmark" })
    expect(container.contains(dialog)).toBe(false)
    expect(dialog.closest('[data-slot="tabs-content"]')).toBeNull()
    expect(document.body.contains(dialog)).toBe(true)
  })
})
