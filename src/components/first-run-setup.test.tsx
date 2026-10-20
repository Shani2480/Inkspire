import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { FirstRunSetup } from "@/components/first-run-setup"
import { useDocumentStore } from "@/document/store"
import { detectSettings, useUserSettings } from "@/document/user-settings"

beforeEach(() => {
  localStorage.clear()
  useUserSettings.setState({ ...detectSettings({}) })
  useDocumentStore.getState().setDocumentProps({ author: "" })
})
afterEach(cleanup)

describe("the first-run setup dialog (21.42)", () => {
  it("shows the locale from the browser, confirms, and is not shown again", async () => {
    render(<FirstRunSetup />)
    const locale = (await screen.findByLabelText("Language and region")) as HTMLSelectElement
    expect(locale.value).toBe("en-US")
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Sam" } })
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Doe" } })
    expect((screen.getByLabelText("Initials") as HTMLInputElement).value).toBe("SD")
    await act(async () => {
      fireEvent.click(screen.getByText("Continue"))
    })
    expect(useUserSettings.getState()).toMatchObject({
      setupDone: true,
      author: "Sam Doe",
      initials: "SD",
      locale: "en-US",
    })
    expect(useDocumentStore.getState().documentProps.author).toBe("Sam Doe")
    expect(screen.queryByText("Welcome to Inkspire")).toBeNull()
  })

  it("leaves a blank field blank and can be skipped", async () => {
    render(<FirstRunSetup />)
    // The system gave no name, so first and last name are asked for, empty.
    expect(((await screen.findByLabelText("First name")) as HTMLInputElement).value).toBe("")
    expect(((await screen.findByLabelText("Last name")) as HTMLInputElement).value).toBe("")
    expect(screen.queryByLabelText("Author name")).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByText("Skip"))
    })
    expect(useUserSettings.getState().setupDone).toBe(true)
  })

  it("shows the name the system holds as one field to confirm", async () => {
    useUserSettings.setState({ author: "Jane Doe", initials: "JD" })
    render(<FirstRunSetup />)
    expect(((await screen.findByLabelText("Author name")) as HTMLInputElement).value).toBe("Jane Doe")
    expect(screen.queryByLabelText("First name")).toBeNull()
  })

  it("is not shown when the setup was already done", () => {
    useUserSettings.setState({ setupDone: true })
    render(<FirstRunSetup />)
    expect(screen.queryByText("Welcome to Inkspire")).toBeNull()
  })

  it("offers locale and date format as dropdowns and saves the chosen entry", async () => {
    render(<FirstRunSetup />)
    const date = (await screen.findByLabelText("Date format")) as HTMLSelectElement
    expect(date.tagName).toBe("SELECT")
    expect(Array.from(date.options).map((option) => option.value)).toContain("dd/MM/yyyy")
    fireEvent.change(date, { target: { value: "dd/MM/yyyy" } })
    fireEvent.change(screen.getByLabelText("Language and region"), { target: { value: "fr-FR" } })
    await act(async () => {
      fireEvent.click(screen.getByText("Continue"))
    })
    expect(useUserSettings.getState()).toMatchObject({ locale: "fr-FR", dateFormat: "dd/MM/yyyy" })
  })

  it("keeps a detected value that is not in the list, and Other… lets a value be typed", async () => {
    useUserSettings.setState({ locale: "en-NZ" })
    render(<FirstRunSetup />)
    const locale = (await screen.findByLabelText("Language and region")) as HTMLSelectElement
    expect(locale.value).toBe("en-NZ")
    fireEvent.change(locale, { target: { value: "\u0000other" } })
    const typed = screen.getByLabelText("Language and region") as HTMLInputElement
    expect(typed.tagName).toBe("INPUT")
    fireEvent.change(typed, { target: { value: "mi-NZ" } })
    await act(async () => {
      fireEvent.click(screen.getByText("Continue"))
    })
    expect(useUserSettings.getState().locale).toBe("mi-NZ")
  })
})
