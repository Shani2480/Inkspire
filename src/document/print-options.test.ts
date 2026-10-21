import { afterEach, describe, expect, it } from "vitest"
import { propertiesPage } from "@/document/commands"
import { useEditingOptions } from "@/document/editing-options"
import type { DocumentProps } from "@/document/store"

const props: DocumentProps = {
  title: "Report",
  subject: "",
  tags: "q3, sales",
  comments: "",
  author: "Sam <b>",
  company: "",
  category: "",
  createdAt: "",
  lastPrintedAt: null,
  totalEditingMs: 0,
}

describe("print options (22.9)", () => {
  afterEach(() => useEditingOptions.getState().set({ printDrawings: true, printBackgrounds: true, printHidden: false }))

  it("mark the page for the print styles only when they differ from the defaults", () => {
    const root = document.documentElement
    expect(root.hasAttribute("data-print-no-drawings")).toBe(false)
    useEditingOptions.getState().set({ printDrawings: false, printBackgrounds: false, printHidden: true })
    expect(root.hasAttribute("data-print-no-drawings")).toBe(true)
    expect(root.hasAttribute("data-print-no-bg")).toBe(true)
    expect(root.hasAttribute("data-print-hidden")).toBe(true)
    useEditingOptions.getState().set({ printDrawings: true, printBackgrounds: true, printHidden: false })
    expect(root.hasAttribute("data-print-no-drawings")).toBe(false)
    expect(root.hasAttribute("data-print-hidden")).toBe(false)
  })

  it("the properties page lists what is filled in, as text", () => {
    const page = propertiesPage(props, "report.docx")
    const text = page.textContent ?? ""
    expect(text).toContain("report.docx")
    expect(text).toContain("q3, sales")
    expect(text).not.toContain("Subject")
    expect(page.querySelector("b")).toBeNull()
    expect(text).toContain("Sam <b>")
  })
})
