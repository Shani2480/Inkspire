import { describe, expect, it } from "vitest"
import { backStep } from "@/lib/android-back"

const base = {
  overlay: false,
  sheet: false,
  backstage: { open: false, closable: true, tab: "home" },
  layoutMode: "print",
  focus: false,
}

describe("backStep", () => {
  it("closes what is on top first", () => {
    expect(backStep({ ...base, overlay: true, sheet: true, layoutMode: "read" })).toBe("escape")
    expect(backStep({ ...base, sheet: true, layoutMode: "read" })).toBe("sheet")
    expect(backStep({ ...base, backstage: { open: true, closable: true, tab: "open" } })).toBe("backstage")
  })

  it("leaves Read Mode for the editor instead of quitting", () => {
    expect(backStep({ ...base, layoutMode: "read" })).toBe("read")
    expect(backStep({ ...base, focus: true })).toBe("focus")
  })

  it("asks to quit only from the editor or the File view's first page with no document", () => {
    expect(backStep(base)).toBe("quit")
    expect(backStep({ ...base, backstage: { open: true, closable: false, tab: "open" } })).toBe("file-home")
    expect(backStep({ ...base, backstage: { open: true, closable: false, tab: "home" } })).toBe("quit")
  })
})
