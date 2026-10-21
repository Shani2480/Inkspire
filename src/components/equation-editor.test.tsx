import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { EquationEditor } from "@/components/equation-editor"

afterEach(cleanup)

function open(initial = "x=") {
  const onOk = vi.fn()
  const onClose = vi.fn()
  render(<EquationEditor title="Edit Equation" initial={initial} ok="OK" onOk={onOk} onClose={onClose} />)
  return { onOk, onClose, source: screen.getByLabelText("LaTeX or symbols") as HTMLTextAreaElement }
}

describe("the equation editor (21.23)", () => {
  it("draws what is typed, live", async () => {
    const { source } = open("a^2")
    // KaTeX loads on first use, so the first drawing arrives a moment after the editor opens.
    await waitFor(() => expect(document.querySelector(".equation-preview .katex")).not.toBeNull())
    fireEvent.change(source, { target: { value: "\\frac{1}{2}" } })
    await waitFor(() => expect(document.querySelector(".equation-preview .mfrac")).not.toBeNull())
  })

  it("builds with a structure button, wrapping the selection", () => {
    const { source, onOk } = open("x+y")
    source.setSelectionRange(2, 3)
    fireEvent.click(screen.getByLabelText("Fraction"))
    expect(source.value).toBe("x+\\frac{y}{}")
    fireEvent.click(screen.getByText("OK"))
    expect(onOk).toHaveBeenCalledWith("x+\\frac{y}{}")
  })

  it("offers symbols and examples on their tabs", () => {
    const { source } = open("")
    fireEvent.click(screen.getByRole("tab", { name: "Symbols" }))
    fireEvent.click(screen.getByLabelText("alpha"))
    expect(source.value).toBe("\\alpha")
    fireEvent.click(screen.getByRole("tab", { name: "Examples" }))
    fireEvent.click(screen.getByTitle("Pythagorean Theorem"))
    expect(source.value).toBe("a^{2}+b^{2}=c^{2}")
  })

  it("says why an equation cannot be drawn", async () => {
    open("\\frac{1")
    expect((await screen.findByRole("status")).textContent).not.toBe("")
  })

  it("cancels without changing anything", () => {
    const { onClose, onOk } = open()
    fireEvent.click(screen.getByText("Cancel"))
    expect(onClose).toHaveBeenCalled()
    expect(onOk).not.toHaveBeenCalled()
  })
})
