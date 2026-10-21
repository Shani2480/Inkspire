import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { useAddins } from "@/addins/store"
import { AddInsManager, AddInsMenu } from "@/components/addins"

describe("Add-ins", () => {
  beforeEach(() => useAddins.setState({ installed: ["markdown"], notice: "" }))
  afterEach(cleanup)

  it("the menu lists the commands of installed add-ins only", () => {
    render(<AddInsMenu close={() => undefined} />)
    expect(screen.getByText("Save as Markdown…")).toBeTruthy()
    expect(screen.queryByText("Import sources from a file…")).toBeNull()
    expect(screen.getByText("Get Add-ins…")).toBeTruthy()
  })

  it("the menu says so when nothing is installed", () => {
    useAddins.setState({ installed: [] })
    render(<AddInsMenu close={() => undefined} />)
    expect(screen.getByText("No add-ins are installed.")).toBeTruthy()
  })

  it("Add and Remove change what is installed", () => {
    render(<AddInsManager />)
    fireEvent.click(screen.getByRole("button", { name: "Add Citation Import" }))
    expect(useAddins.getState().installed).toContain("citations")
    fireEvent.click(screen.getByRole("button", { name: "Remove Markdown" }))
    expect(useAddins.getState().installed).not.toContain("markdown")
  })
})
