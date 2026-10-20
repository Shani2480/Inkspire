import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useEditingOptions } from "@/document/editing-options"
import { afterEach, describe, expect, it } from "vitest"
import { OptionsView } from "@/components/backstage/views"

describe("Options pages (22.9)", () => {
  afterEach(cleanup)

  it("lists Word's pages and starts on General", () => {
    render(<OptionsView />)
    const nav = screen.getByRole("navigation", { name: "Options pages" })
    expect(nav.textContent).toContain("Proofing")
    expect(nav.textContent).toContain("Quick Access Toolbar")
    expect(screen.getByRole("button", { name: "General" }).getAttribute("aria-current")).toBe("page")
  })

  it("shows unsupported proofing options switched off", () => {
    render(<OptionsView />)
    fireEvent.click(screen.getByRole("button", { name: "Proofing" }))
    const box = screen.getByLabelText("Suggest from main dictionary only") as HTMLInputElement
    expect(box.disabled).toBe(true)
    expect((screen.getByLabelText("Flag repeated words") as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByLabelText("Check spelling as you type") as HTMLInputElement).disabled).toBe(false)
  })
})

describe("Show Mini Toolbar option (22.9)", () => {
  afterEach(cleanup)

  it("is on by default and its choice is kept", () => {
    render(<OptionsView />)
    const box = screen.getByLabelText("Show Mini Toolbar on selection") as HTMLInputElement
    expect(box.checked).toBe(true)
    fireEvent.click(box)
    expect(useEditingOptions.getState().miniToolbar).toBe(false)
    expect(JSON.parse(localStorage.getItem("aiword.editing-options") || "{}").miniToolbar).toBe(false)
    useEditingOptions.getState().set({ miniToolbar: true })
  })
})
