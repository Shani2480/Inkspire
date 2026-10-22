import { afterEach, describe, expect, it } from "vitest"
import { useEditingOptions } from "@/document/editing-options"
import { prefersReducedMotion } from "@/document/motion"

describe("page-wide options (22.9)", () => {
  afterEach(() => useEditingOptions.getState().set({ animation: true }))

  it("start as Word has them", () => {
    const state = useEditingOptions.getState()
    expect(state).toMatchObject({
      animation: true,
      showShortcutKeys: true,
      keepAccessibilityRunning: true,
      mainDictionaryOnly: false,
      readability: false,
      showBackgrounds: true,
      picturePlaceholders: false,
      showDrawings: true,
      showBookmarks: false,
      textBoundaries: false,
      cropMarks: false,
      fieldCodes: false,
      fieldShading: "selected",
      draftFont: false,
      draftFontName: "Courier New",
      draftFontSize: 10,
    })
    expect(document.documentElement.getAttribute("data-field-shading")).toBe("selected")
  })

  it("Show document content marks the page for the styles", () => {
    const root = document.documentElement
    const options = useEditingOptions.getState()
    options.set({
      showBackgrounds: false,
      picturePlaceholders: true,
      showDrawings: false,
      showBookmarks: true,
      textBoundaries: true,
      cropMarks: true,
      fieldCodes: true,
      fieldShading: "never",
      draftFont: true,
      draftFontName: "Consolas",
      draftFontSize: 12,
    })
    for (const flag of [
      "data-no-page-bg",
      "data-picture-placeholders",
      "data-no-drawings",
      "data-show-bookmarks",
      "data-text-boundaries",
      "data-crop-marks",
      "data-field-codes",
      "data-draft-font",
    ]) {
      expect(root.hasAttribute(flag), flag).toBe(true)
    }
    expect(root.getAttribute("data-field-shading")).toBe("never")
    expect(root.style.getPropertyValue("--draft-font")).toBe('"Consolas"')
    expect(root.style.getPropertyValue("--draft-font-size")).toBe("12pt")
    options.set({
      showBackgrounds: true,
      picturePlaceholders: false,
      showDrawings: true,
      showBookmarks: false,
      textBoundaries: false,
      cropMarks: false,
      fieldCodes: false,
      fieldShading: "selected",
      draftFont: false,
      draftFontName: "Courier New",
      draftFontSize: 10,
    })
    expect(root.hasAttribute("data-no-page-bg")).toBe(false)
    expect(root.hasAttribute("data-field-codes")).toBe(false)
  })

  it("turning animation off marks the page and counts as reduced motion", () => {
    expect(document.documentElement.hasAttribute("data-no-motion")).toBe(false)
    useEditingOptions.getState().set({ animation: false })
    expect(document.documentElement.hasAttribute("data-no-motion")).toBe(true)
    expect(prefersReducedMotion()).toBe(true)
    useEditingOptions.getState().set({ animation: true })
    expect(document.documentElement.hasAttribute("data-no-motion")).toBe(false)
    expect(prefersReducedMotion()).toBe(false)
  })
})
