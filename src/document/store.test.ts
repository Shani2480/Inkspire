import { describe, expect, it } from "vitest"
import { documentTitle, saveStateLabel } from "@/document/store"

describe("save state labels", () => {
  it("prefers Saving… while a write is in progress", () => {
    expect(saveStateLabel(true, true)).toBe("Saving…")
    expect(saveStateLabel(false, true)).toBe("Saving…")
  })

  it("shows Unsaved for dirty documents", () => {
    expect(saveStateLabel(true, false)).toBe("Unsaved")
  })

  it("shows Saved when clean", () => {
    expect(saveStateLabel(false, false)).toBe("Saved")
  })
})

describe("documentTitle", () => {
  it("follows the Word title format", () => {
    expect(documentTitle("/docs/letter.html", false, false)).toBe("letter.html - Word")
    expect(documentTitle("/docs/letter.html", true, false)).toBe("letter.html* - Word")
    expect(documentTitle("/docs/letter.html", true, true)).toBe("letter.html — Saving...")
    expect(documentTitle(null, true, false)).toBe("Document1* - Word")
  })
})
