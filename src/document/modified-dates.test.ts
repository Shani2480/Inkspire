import { describe, expect, it } from "vitest"
import { formatModified } from "@/document/modified-dates"

describe("Recent's date modified", () => {
  const now = new Date(2026, 10, 17, 15, 30)

  it("shows the time for a document changed today", () => {
    expect(formatModified(new Date(2026, 10, 17, 9, 5).getTime(), now, "en-GB")).toBe("9:05")
  })

  it("shows the day and month earlier this year, the full date before", () => {
    expect(formatModified(new Date(2026, 2, 4).getTime(), now, "en-GB")).toBe("4 Mar")
    expect(formatModified(new Date(2024, 11, 31).getTime(), now, "en-GB")).toBe("31/12/2024")
  })

  it("shows a dash when the date is not known", () => {
    expect(formatModified(undefined, now)).toBe("—")
  })
})
