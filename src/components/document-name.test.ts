import { describe, expect, it } from "vitest"
import { saveStateText } from "@/components/document-name"

describe("title bar save state", () => {
  it("says nothing for a new untouched document, and follows edits and saves", () => {
    expect(saveStateText(null, false, false)).toBe("")
    expect(saveStateText(null, true, false)).toBe("Unsaved")
    expect(saveStateText("/docs/a.docx", false, true)).toBe("Saving…")
    expect(saveStateText("/docs/a.docx", false, false)).toBe("Saved")
  })
})
