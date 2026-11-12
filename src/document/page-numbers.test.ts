import { describe, expect, it } from "vitest"
import { formatPageNumber, pageNumberLabels, sectionPageLabels } from "@/document/page-numbers"

describe("page numbers", () => {
  it("are written in Word's formats", () => {
    expect(formatPageNumber(4, "decimal")).toBe("4")
    expect(formatPageNumber(4, "lowerRoman")).toBe("iv")
    expect(formatPageNumber(1994, "upperRoman")).toBe("MCMXCIV")
    expect(formatPageNumber(2, "lowerLetter")).toBe("b")
    expect(formatPageNumber(28, "upperLetter")).toBe("BB")
    expect(formatPageNumber(3, "numberInDash")).toBe("- 3 -")
    // Word writes 0 as a number in every format (a cover numbered from 0).
    expect(formatPageNumber(0, "lowerRoman")).toBe("0")
  })

  it("go on from the page before unless a section starts at a number of its own", () => {
    const go = { start: null, format: "decimal" }
    expect(pageNumberLabels(4, [go, go, go, go], [true, false, true, false])).toEqual(["1", "2", "3", "4"])
    expect(
      pageNumberLabels(
        4,
        [{ start: 0, format: "decimal" }, { start: 1, format: "lowerRoman" }, { start: 1, format: "lowerRoman" }, go],
        [true, true, false, true],
      ),
    ).toEqual(["0", "i", "ii", "3"])
  })

  it("follow each page's section: the cover, a body restarting at 1, and the last section going on", () => {
    const sections = [
      { key: "cover", pageNumberStart: 0, pageNumberFormat: "decimal" },
      { key: "body", pageNumberStart: 1, pageNumberFormat: "decimal" },
    ]
    const labels = sectionPageLabels(5, ["cover", "body", "body", "", ""], [true, true, false, true, false], sections, {
      pageNumberStart: null,
      pageNumberFormat: "decimal",
    })
    expect(labels).toEqual(["0", "1", "2", "3", "4"])
  })
})
