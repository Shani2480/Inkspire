import { beforeEach, describe, expect, it } from "vitest"
import { chromeStep, chromeStory, useActiveChromeEditor } from "@/document/chrome-editing"
import { useViewStore } from "@/document/view"

describe("editing the header and footer", () => {
  beforeEach(() => {
    useViewStore.setState({ editingChrome: false, chromeTarget: { part: "header", page: 0 } })
    useActiveChromeEditor.setState({ editor: null })
  })

  it("opens the chosen part on the chosen page", () => {
    useViewStore.getState().editChrome("footer", 2)
    expect(useViewStore.getState().editingChrome).toBe(true)
    expect(useViewStore.getState().chromeTarget).toEqual({ part: "footer", page: 2 })
  })

  it("starts on the first page when none is given", () => {
    useViewStore.getState().editChrome("header")
    expect(useViewStore.getState().chromeTarget).toEqual({ part: "header", page: 0 })
  })
})

describe("Previous and Next in the header", () => {
  it("names the header story each page shows", () => {
    expect([0, 1, 2].map((page) => chromeStory(page, false, false))).toEqual(["default", "default", "default"])
    expect([0, 1, 2].map((page) => chromeStory(page, true, false))).toEqual(["first", "default", "default"])
    expect([0, 1, 2, 3].map((page) => chromeStory(page, true, true))).toEqual(["first", "even", "default", "even"])
  })

  it("steps Previous and Next between the headers as Word does with one section", () => {
    // One story: nowhere to go.
    expect(chromeStep(1, 4, false, false, 1)).toBeNull()
    expect(chromeStep(1, 4, false, false, -1)).toBeNull()
    // First page, then the rest.
    expect(chromeStep(0, 4, true, false, 1)).toBe(1)
    expect(chromeStep(3, 4, true, false, -1)).toBe(0)
    expect(chromeStep(2, 4, true, false, 1)).toBeNull()
    // First, even (page 2), odd (page 3).
    expect(chromeStep(0, 4, true, true, 1)).toBe(1)
    expect(chromeStep(1, 4, true, true, 1)).toBe(2)
    expect(chromeStep(3, 4, true, true, -1)).toBe(0)
    expect(chromeStep(2, 4, true, true, -1)).toBe(1)
    // A one-page document has no even page to go to.
    expect(chromeStep(0, 1, true, true, 1)).toBeNull()
  })
})
