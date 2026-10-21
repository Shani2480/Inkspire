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
    })
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
