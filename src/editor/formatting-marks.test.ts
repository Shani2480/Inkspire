import { describe, expect, it } from "vitest"
import { anyMarkShown, formattingMarkClasses } from "@/editor/formatting-marks"

const none = { marksTabs: false, marksSpaces: false, marksParagraph: false, marksHidden: false, marksHyphens: false }

describe("per-mark formatting marks (22.9)", () => {
  it("show nothing until a mark is chosen or Show/Hide ¶ is on", () => {
    expect(anyMarkShown(false, none)).toBe(false)
    expect(formattingMarkClasses(false, none)).toBe("")
    expect(anyMarkShown(false, { ...none, marksSpaces: true })).toBe(true)
    expect(anyMarkShown(true, none)).toBe(true)
  })

  it("give one class for each mark chosen on its own", () => {
    expect(formattingMarkClasses(false, { ...none, marksTabs: true, marksHyphens: true })).toBe("fm-tabs fm-hyphens")
    expect(formattingMarkClasses(false, { ...none, marksParagraph: true, marksHidden: true })).toBe(
      "fm-paras fm-hidden",
    )
  })

  it("Show/Hide ¶ shows all of them with the one class", () => {
    expect(formattingMarkClasses(true, { ...none, marksTabs: true })).toBe("formatting-marks")
  })
})
